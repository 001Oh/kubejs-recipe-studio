/**
 * 与业务无关的「按 jar 并发」核心：物品扫描与配方扫描共用同一份生命周期管理。
 *
 * 职责边界（刻意不包含任何业务）：
 * - 任务分发：每个 jar 只派发一次，队列用下标推进；
 * - worker 池：固定并发 lane，一个 lane 同时只跑一个 jar；
 * - 失败隔离：worker 报错/崩溃只算当前 jar 失败，补一个新 worker 继续其余任务；
 * - 取消：AbortSignal 触发后终止全部 worker 并 reject，不再派发新任务；
 * - 降级：worker 不可用时走 `inline`，并发上限保持一致。
 *
 * 业务方只提供三件事：worker 脚本路径、`inline` 兜底实现、结果/失败回调。
 */
import { cpus } from 'node:os'
import { Worker } from 'node:worker_threads'
import { SCAN_WORKER_MAX_CONCURRENCY } from '../../shared/constants'
import { logger } from '../logger'

/** 只暴露核心需要的三个方法，便于测试注入假实现 */
export interface PoolWorker {
  on(event: 'message' | 'error' | 'exit', listener: (payload: unknown) => void): unknown
  postMessage(message: unknown): void
  terminate(): unknown
}

export interface JarPoolOptions<T> {
  jars: readonly string[]
  signal: AbortSignal
  /** worker 脚本绝对路径 */
  workerScript: string
  workerData?: unknown
  /** worker 脚本是否存在（调用方用 existsSync 判断，核心不碰 fs） */
  workerAvailable: boolean
  /** 每个 jar 成功时的回调（在主线程执行） */
  onResult: (jarPath: string, payload: T) => void
  /** 单个 jar 失败时回调（不抛出） */
  onFailed: (jarPath: string, error: string) => void
  /** 无 worker 时的兜底实现，返回值语义与 worker payload 一致 */
  inline: (jarPath: string) => Promise<T>
  concurrency?: number
  /**
   * P3-5：单任务超时（毫秒）。worker 超时不响应即 terminate 并记该 jar 失败，
   * 防止整池永久挂起；真实大 jar 扫描可达分钟级，默认 10 分钟。
   */
  taskTimeoutMs?: number
  /** 仅供测试注入假 worker */
  createWorker?: (script: string, data: unknown) => PoolWorker
}

export interface JarPoolResult {
  usedWorkers: boolean
  completed: number
  failed: number
}

interface Lane {
  worker: PoolWorker
  current: string | null
  taskId: number
  /** P3-5：当前任务的超时定时器（worker 不响应时的兜底） */
  timer: ReturnType<typeof setTimeout> | null
}

interface WorkerMessage<T> {
  id: number
  ok: boolean
  payload?: T
  error?: string
}

export const POOL_CANCELED = '已取消：并发扫描'

/** P3-5：单任务超时默认值——真实大 jar 扫描可达分钟级，10 分钟兜底足够宽 */
const DEFAULT_TASK_TIMEOUT_MS = 600_000

export function defaultPoolConcurrency(): number {
  return Math.max(1, Math.min(cpus().length, SCAN_WORKER_MAX_CONCURRENCY))
}

export function jarBaseName(jarPath: string): string {
  return jarPath.replace(/\\/g, '/').split('/').pop() ?? jarPath
}

/**
 * P3-6：业务回调兜底。onResult/onFailed 在 worker 事件回调内同步执行，任一抛错
 * 即主进程未捕获异常（worker 路径）或 Promise 被业务回调错误拒绝（内联路径）。
 * 统一转 logger.error（带 jar 名与阶段），不冒泡、不改变计数语义。
 */
function safeCall(phase: string, jarPath: string, run: () => void): void {
  try {
    run()
  } catch (err) {
    logger.error('SCAN', `扫描${phase}抛错：${jarBaseName(jarPath)}`, err instanceof Error ? (err.stack ?? err.message) : String(err))
  }
}

export async function runJarPoolCore<T>(opts: JarPoolOptions<T>): Promise<JarPoolResult> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? defaultPoolConcurrency(), opts.jars.length || 1))
  if (!opts.workerAvailable) return runInline(opts, concurrency)
  return runWorkers(opts, concurrency)
}

async function runWorkers<T>(opts: JarPoolOptions<T>, concurrency: number): Promise<JarPoolResult> {
  const total = opts.jars.length
  let completed = 0
  let failed = 0
  const lanes: Lane[] = []
  const pending = new Map<number, { lane: Lane; jarPath: string }>()
  let next = 0
  let seq = 0
  let settled = false

  return new Promise<JarPoolResult>((resolve, reject) => {
    const create =
      opts.createWorker ?? ((script, data) => new Worker(script, { workerData: data }) as unknown as PoolWorker)

    const disarmTimer = (lane: Lane): void => {
      if (lane.timer !== null) {
        clearTimeout(lane.timer)
        lane.timer = null
      }
    }

    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      for (const lane of lanes) {
        disarmTimer(lane)
        void lane.worker.terminate()
      }
      if (err) reject(err)
      else resolve({ usedWorkers: true, completed, failed })
    }

    const maybeDone = (): void => {
      if (completed + failed >= total) finish()
    }

    const dispatch = (lane: Lane): void => {
      if (settled || opts.signal.aborted || lane.current || next >= total) return
      const jarPath = opts.jars[next++] as string
      const id = ++seq
      lane.current = jarPath
      lane.taskId = id
      pending.set(id, { lane, jarPath })
      // P3-5：单任务超时兜底——worker 不响应即 terminate 并按失败 settle，绝不整池挂死
      const timeoutMs = Math.max(1, opts.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS)
      lane.timer = setTimeout(() => {
        lane.timer = null
        if (settled || !pending.has(id)) return
        pending.delete(id)
        failed += 1
        lane.current = null
        safeCall('失败回调', jarPath, () => opts.onFailed(jarPath, `单 jar 处理超时（>${timeoutMs}ms），worker 已终止`))
        void lane.worker.terminate()
        replaceLane(lane)
        maybeDone()
      }, timeoutMs)
      lane.worker.postMessage({ id, jarPath })
    }

    // P3-5：把失活车道换成新 worker 并继续派发（补位）
    const replaceLane = (lane: Lane): void => {
      disarmTimer(lane)
      const idx = lanes.indexOf(lane)
      if (idx >= 0) lanes.splice(idx, 1)
      void lane.worker.terminate()
      const replacement = spawn()
      if (replacement) {
        lanes.push(replacement)
        dispatch(replacement)
      }
    }

    const spawn = (): Lane | null => {
      if (opts.signal.aborted) return null
      const worker = create(opts.workerScript, opts.workerData)
      const lane: Lane = { worker, current: null, taskId: 0, timer: null }
      worker.on('message', (raw) => {
        const msg = raw as WorkerMessage<T>
        const task = pending.get(msg.id)
        lane.current = null
        lane.taskId = 0
        disarmTimer(lane)
        if (!task || task.lane !== lane) return
        pending.delete(msg.id)
        if (msg.ok) {
          completed += 1
          safeCall('结果回调', task.jarPath, () => opts.onResult(task.jarPath, msg.payload as T))
        } else {
          failed += 1
          safeCall('失败回调', task.jarPath, () => opts.onFailed(task.jarPath, msg.error ?? 'worker 未返回结果'))
        }
        dispatch(lane)
        maybeDone()
      })
      worker.on('error', (raw) => {
        const err = raw instanceof Error ? raw : new Error(String(raw))
        disarmTimer(lane)
        const task = [...pending.values()].find((item) => item.lane === lane)
        if (task) {
          pending.delete(lane.taskId)
          failed += 1
          safeCall('失败回调', task.jarPath, () => opts.onFailed(task.jarPath, err.message))
        }
        lane.current = null
        replaceLane(lane)
        maybeDone()
      })
      // P3-5：worker 提前退出（任意码）——若它还有未交付的任务，按失败处理并补位；
      // 车道已被超时/替换分支处理过（不在 lanes 里）则忽略，防重入
      worker.on('exit', (raw) => {
        if (settled || !lanes.includes(lane)) return
        const code = typeof raw === 'number' ? raw : Number(raw)
        disarmTimer(lane)
        const task = [...pending.values()].find((item) => item.lane === lane)
        const jarPath = task?.jarPath ?? lane.current
        lane.current = null
        lane.taskId = 0
        if (task) {
          pending.delete(lane.taskId)
          failed += 1
          safeCall('失败回调', jarPath ?? '', () =>
            opts.onFailed(jarPath ?? '', `worker 异常退出（exit code=${code}），该 jar 按失败处理`)
          )
        }
        replaceLane(lane)
        maybeDone()
      })
      lanes.push(lane)
      return lane
    }

    opts.signal.addEventListener('abort', () => finish(new Error(POOL_CANCELED)), { once: true })

    for (let i = 0; i < concurrency; i += 1) {
      const lane = spawn()
      if (lane) dispatch(lane)
    }
    maybeDone()
  })
}

async function runInline<T>(opts: JarPoolOptions<T>, concurrency: number): Promise<JarPoolResult> {
  let completed = 0
  let failed = 0
  let next = 0
  const lane = async (): Promise<void> => {
    for (;;) {
      if (opts.signal.aborted) throw new Error(POOL_CANCELED)
      const idx = next++
      if (idx >= opts.jars.length) return
      const jarPath = opts.jars[idx] as string
      try {
        const payload = await opts.inline(jarPath)
        completed += 1
        // 保持原语义：内联路径 onResult 抛错按该 jar 失败处理（catch 之外的兜底只包失败回调）
        opts.onResult(jarPath, payload)
      } catch (err) {
        failed += 1
        safeCall('失败回调', jarPath, () => opts.onFailed(jarPath, err instanceof Error ? err.message : String(err)))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, opts.jars.length || 1)) }, () => lane()))
  return { usedWorkers: false, completed, failed }
}
