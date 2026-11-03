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

/** 只暴露核心需要的三个方法，便于测试注入假实现 */
export interface PoolWorker {
  on(event: 'message' | 'error', listener: (payload: unknown) => void): unknown
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
}

interface WorkerMessage<T> {
  id: number
  ok: boolean
  payload?: T
  error?: string
}

export const POOL_CANCELED = '已取消：并发扫描'

export function defaultPoolConcurrency(): number {
  return Math.max(1, Math.min(cpus().length, SCAN_WORKER_MAX_CONCURRENCY))
}

export function jarBaseName(jarPath: string): string {
  return jarPath.replace(/\\/g, '/').split('/').pop() ?? jarPath
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

    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      for (const lane of lanes) void lane.worker.terminate()
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
      lane.worker.postMessage({ id, jarPath })
    }

    const spawn = (): Lane | null => {
      if (opts.signal.aborted) return null
      const worker = create(opts.workerScript, opts.workerData)
      const lane: Lane = { worker, current: null, taskId: 0 }
      worker.on('message', (raw) => {
        const msg = raw as WorkerMessage<T>
        const task = pending.get(msg.id)
        lane.current = null
        lane.taskId = 0
        if (!task || task.lane !== lane) return
        pending.delete(msg.id)
        if (msg.ok) {
          completed += 1
          opts.onResult(task.jarPath, msg.payload as T)
        } else {
          failed += 1
          opts.onFailed(task.jarPath, msg.error ?? 'worker 未返回结果')
        }
        dispatch(lane)
        maybeDone()
      })
      worker.on('error', (raw) => {
        const err = raw instanceof Error ? raw : new Error(String(raw))
        const task = [...pending.values()].find((item) => item.lane === lane)
        if (task) {
          pending.delete(lane.taskId)
          failed += 1
          opts.onFailed(task.jarPath, err.message)
        }
        lane.current = null
        const idx = lanes.indexOf(lane)
        if (idx >= 0) lanes.splice(idx, 1)
        void worker.terminate()
        const replacement = spawn()
        if (replacement) {
          lanes.push(replacement)
          dispatch(replacement)
        }
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
        opts.onResult(jarPath, payload)
      } catch (err) {
        failed += 1
        opts.onFailed(jarPath, err instanceof Error ? err.message : String(err))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, opts.jars.length || 1)) }, () => lane()))
  return { usedWorkers: false, completed, failed }
}
