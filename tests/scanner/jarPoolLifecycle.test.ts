/**
 * P3-5：worker 生命周期兜底。runWorkers 只挂 message/error——worker 干净退出
 * （exit 任意码）或单任务永久挂起时，对应 jar 永不 settle，整个扫描挂死（只有 abort 能解）。
 * 修复：补 exit 监听（非正常/提前退出 → 该 jar 失败 + 补位继续）+ 单任务超时
 * （taskTimeoutMs，默认 10 分钟，超时 terminate 并失败）。
 */
import { describe, expect, it, vi } from 'vitest'
import { runJarPoolCore, type PoolWorker } from '@main/scanner/jarPoolCore'

type Behavior = 'ok' | 'fail' | 'exit-clean' | 'exit-crash' | 'hang'

class LifecycleWorker implements PoolWorker {
  terminated = false
  private handlers: Record<string, ((payload: unknown) => void)[]> = { message: [], error: [], exit: [] }
  constructor(
    private readonly pool: LifecyclePool,
    readonly index: number
  ) {}

  // 故意声明成比接口更宽的事件集：修复前接口没有 exit，测试仍可编译
  on(event: 'message' | 'error' | 'exit', listener: (payload: unknown) => void): void {
    this.handlers[event].push(listener)
  }

  postMessage(message: unknown): void {
    const msg = message as { id: number; jarPath: string }
    this.pool.recordDispatch(msg.jarPath)
    const behavior = this.pool.behaviorOf(msg.jarPath)
    if (behavior === 'hang') return
    queueMicrotask(() => {
      if (behavior === 'exit-clean' || behavior === 'exit-crash') {
        this.terminated = true
        for (const fn of this.handlers.exit) fn(behavior === 'exit-clean' ? 0 : 1)
        return
      }
      if (behavior === 'fail') {
        for (const fn of this.handlers.message) fn({ id: msg.id, ok: false, error: `bad jar ${msg.jarPath}` })
        return
      }
      for (const fn of this.handlers.message) fn({ id: msg.id, ok: true, payload: msg.jarPath })
    })
  }

  terminate(): void {
    this.terminated = true
    this.pool.recordTerminate()
  }
}

class LifecyclePool {
  workers: LifecycleWorker[] = []
  dispatched: string[] = []
  terminated = 0
  constructor(private readonly behaviors: Map<string, Behavior>) {}
  behaviorOf(jarPath: string): Behavior {
    return this.behaviors.get(jarPath) ?? 'ok'
  }
  recordDispatch(jarPath: string): void {
    this.dispatched.push(jarPath)
  }
  recordTerminate(): void {
    this.terminated += 1
  }
  create = (): PoolWorker => {
    const worker = new LifecycleWorker(this, this.workers.length)
    this.workers.push(worker)
    return worker
  }
}

function jars(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `C:/mods/mod-${i}.jar`)
}

/** 池 Promise 若在 ms 内不 settle 即返回 'TIMEOUT'（修复前唯一可观测的挂死形态） */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | 'TIMEOUT'> {
  return Promise.race([p, new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))])
}

describe('P3-5 worker 生命周期兜底', () => {
  it('worker 立即 exit(1)：该 jar 记失败（原因含退出码），池在预期时间内 settle（修复前永久挂起 → 红）', async () => {
    const list = jars(1)
    const pool = new LifecyclePool(new Map([[list[0] as string, 'exit-crash']]))
    const failed: [string, string][] = []
    const res = await withDeadline(
      runJarPoolCore<string>({
        jars: list,
        signal: new AbortController().signal,
        workerScript: 'x.js',
        workerAvailable: true,
        createWorker: pool.create,
        inline: async (jar) => jar,
        onResult: () => undefined,
        onFailed: (jar, err) => failed.push([jar, err])
      }),
      800
    )
    expect(res, '池必须在预期时间内 settle').not.toBe('TIMEOUT')
    expect(res).toMatchObject({ usedWorkers: true, completed: 0, failed: 1 })
    expect(failed[0]?.[0]).toBe(list[0])
    expect(failed[0]?.[1]).toContain('exit code=1')
  })

  it('worker 不响应：单任务超时 terminate 并记失败（原因含超时），池 settle（修复前永久挂起 → 红）', async () => {
    const list = jars(1)
    const pool = new LifecyclePool(new Map([[list[0] as string, 'hang']]))
    const failed: [string, string][] = []
    const res = await withDeadline(
      runJarPoolCore<string>({
        jars: list,
        signal: new AbortController().signal,
        workerScript: 'x.js',
        workerAvailable: true,
        createWorker: pool.create,
        taskTimeoutMs: 30,
        inline: async (jar) => jar,
        onResult: () => undefined,
        onFailed: (jar, err) => failed.push([jar, err])
      }),
      1500
    )
    expect(res, '池必须在超时兜底后 settle').not.toBe('TIMEOUT')
    expect(res).toMatchObject({ completed: 0, failed: 1 })
    expect(failed[0]?.[0]).toBe(list[0])
    expect(failed[0]?.[1]).toContain('超时')
    expect(pool.terminated).toBeGreaterThan(0)
  })

  it('exit code=0 但任务未完成：同样按失败处理，不挂起', async () => {
    const list = jars(1)
    const pool = new LifecyclePool(new Map([[list[0] as string, 'exit-clean']]))
    const failed: [string, string][] = []
    const res = await withDeadline(
      runJarPoolCore<string>({
        jars: list,
        signal: new AbortController().signal,
        workerScript: 'x.js',
        workerAvailable: true,
        createWorker: pool.create,
        inline: async (jar) => jar,
        onResult: () => undefined,
        onFailed: (jar, err) => failed.push([jar, err])
      }),
      800
    )
    expect(res).not.toBe('TIMEOUT')
    expect(res).toMatchObject({ completed: 0, failed: 1 })
    expect(failed[0]?.[1]).toContain('exit code=0')
  })

  it('补位续扫：首个 jar 的 worker 退出后，其余 jar 照常完成（计数不丢不重）', async () => {
    const list = jars(4)
    const pool = new LifecyclePool(new Map([[list[0] as string, 'exit-crash']]))
    const ok: string[] = []
    const failed: [string, string][] = []
    const res = await withDeadline(
      runJarPoolCore<string>({
        jars: list,
        signal: new AbortController().signal,
        workerScript: 'x.js',
        workerAvailable: true,
        createWorker: pool.create,
        concurrency: 1,
        inline: async (jar) => jar,
        onResult: (jar) => ok.push(jar),
        onFailed: (jar, err) => failed.push([jar, err])
      }),
      1500
    )
    expect(res).not.toBe('TIMEOUT')
    expect(res).toMatchObject({ completed: 3, failed: 1 })
    expect(ok.sort()).toEqual([list[1], list[2], list[3]].sort())
    expect(failed).toHaveLength(1)
    expect(failed[0]?.[0]).toBe(list[0])
    // 补过 worker
    expect(pool.workers.length).toBeGreaterThan(1)
  })

  it('守卫：正常完成路径不受影响（ok/fail 行为计数一致）', async () => {
    const list = jars(5)
    const pool = new LifecyclePool(new Map([[list[2] as string, 'fail']]))
    const res = await withDeadline(
      runJarPoolCore<string>({
        jars: list,
        signal: new AbortController().signal,
        workerScript: 'x.js',
        workerAvailable: true,
        createWorker: pool.create,
        inline: async (jar) => jar,
        onResult: () => undefined,
        onFailed: () => undefined
      }),
      1500
    )
    expect(res).not.toBe('TIMEOUT')
    expect(res).toMatchObject({ completed: 4, failed: 1 })
    expect(pool.dispatched).toHaveLength(5)
    void vi
  })
})
