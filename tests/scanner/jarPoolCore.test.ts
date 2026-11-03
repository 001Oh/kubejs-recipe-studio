import { describe, expect, it } from 'vitest'
import { runJarPoolCore, POOL_CANCELED, type PoolWorker } from '@main/scanner/jarPoolCore'

/**
 * 并发池核心的行为测试：用假 worker 精确控制「成功 / 失败 / 崩溃 / 不响应」，
 * 断言的是真实结果（结果集、计数、派发次数、终止调用），不是「函数被调用过」。
 */
type Behavior = 'ok' | 'fail' | 'crash' | 'hang'

class FakeWorker implements PoolWorker {
  terminated = false
  private handlers: Record<'message' | 'error', ((payload: unknown) => void)[]> = { message: [], error: [] }
  constructor(readonly index: number, private readonly pool: FakePool) {}

  on(event: 'message' | 'error', listener: (payload: unknown) => void): void {
    this.handlers[event].push(listener)
  }

  postMessage(message: unknown): void {
    const msg = message as { id: number; jarPath: string }
    this.pool.recordDispatch(msg.jarPath)
    const behavior = this.pool.behaviorOf(msg.jarPath)
    if (behavior === 'hang') return
    queueMicrotask(() => {
      this.pool.recordSettle()
      if (behavior === 'crash') {
        for (const fn of this.handlers.error) fn(new Error(`worker crash for ${msg.jarPath}`))
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

class FakePool {
  workers: FakeWorker[] = []
  dispatched: string[] = []
  terminated = 0
  maxInFlight = 0
  private active = 0

  constructor(private readonly behaviors: Map<string, Behavior>) {}

  behaviorOf(jarPath: string): Behavior {
    return this.behaviors.get(jarPath) ?? 'ok'
  }

  recordDispatch(jarPath: string): void {
    this.dispatched.push(jarPath)
    this.active += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.active)
  }

  recordSettle(): void {
    this.active = Math.max(0, this.active - 1)
  }

  recordTerminate(): void {
    this.terminated += 1
  }

  create = (_script: string): PoolWorker => {
    const worker = new FakeWorker(this.workers.length, this)
    this.workers.push(worker)
    return worker
  }
}

function jars(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `C:/mods/mod-${i}.jar`)
}

describe('按 jar 并发核心', () => {
  it('① 多 jar 并发：结果完整、每个只完成一次，且并发受限', async () => {
    const list = jars(9)
    const pool = new FakePool(new Map())
    const results: string[] = []
    const res = await runJarPoolCore<string>({
      jars: list,
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: pool.create,
      concurrency: 3,
      inline: async (jar) => jar,
      onResult: (_jar, payload) => results.push(payload),
      onFailed: () => undefined
    })
    expect(results.sort()).toEqual([...list].sort())
    expect(new Set(results).size).toBe(list.length)
    expect(res).toMatchObject({ usedWorkers: true, completed: 9, failed: 0 })
    expect(pool.maxInFlight).toBeLessThanOrEqual(3)
    expect(pool.dispatched).toHaveLength(9)
  })

  it('② 单个 jar 失败只影响自己', async () => {
    const list = jars(5)
    const pool = new FakePool(new Map([[list[2] as string, 'fail']]))
    const ok: string[] = []
    const failed: string[] = []
    const res = await runJarPoolCore<string>({
      jars: list,
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: pool.create,
      inline: async (jar) => jar,
      onResult: (jar) => ok.push(jar),
      onFailed: (jar) => failed.push(jar)
    })
    expect(ok.sort()).toEqual([list[0], list[1], list[3], list[4]].sort())
    expect(failed).toEqual([list[2]])
    expect(res).toMatchObject({ completed: 4, failed: 1 })
  })

  it('③ worker 崩溃：当前 jar 记失败，补新 worker 继续其余任务', async () => {
    const list = jars(6)
    const pool = new FakePool(new Map([[list[1] as string, 'crash']]))
    const failed: string[] = []
    const ok: string[] = []
    const res = await runJarPoolCore<string>({
      jars: list,
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: pool.create,
      concurrency: 2,
      inline: async (jar) => jar,
      onResult: (jar) => ok.push(jar),
      onFailed: (jar) => failed.push(jar)
    })
    expect(failed).toEqual([list[1]])
    expect(ok.sort()).toEqual([list[0], list[2], list[3], list[4], list[5]].sort())
    expect(res).toMatchObject({ completed: 5, failed: 1 })
    // 崩溃后补过 worker，且没有任务因此丢失
    expect(pool.workers.length).toBeGreaterThan(2)
  })

  it('④ 取消：不再派发新任务，worker 被终止，Promise 明确失败', async () => {
    const list = jars(30)
    const pool = new FakePool(new Map(list.map((j) => [j, 'hang'])))
    const ctrl = new AbortController()
    const pending = runJarPoolCore<string>({
      jars: list,
      signal: ctrl.signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: pool.create,
      concurrency: 2,
      inline: async (jar) => jar,
      onResult: () => undefined,
      onFailed: () => undefined
    })
    await new Promise((r) => setTimeout(r, 20))
    const before = pool.dispatched.length
    ctrl.abort()
    await expect(pending).rejects.toThrow(POOL_CANCELED)
    expect(before).toBeLessThan(list.length)
    expect(pool.dispatched.length).toBe(before)
    expect(pool.terminated).toBeGreaterThan(0)
  })

  it('⑤ 进度/结果/错误计数一致（worker 路径与内联路径都成立）', async () => {
    const list = jars(7)
    const behaviors = new Map<string, Behavior>([
      [list[0] as string, 'fail'],
      [list[5] as string, 'fail']
    ])
    const pool = new FakePool(behaviors)
    let results = 0
    let errors = 0
    const res = await runJarPoolCore<string>({
      jars: list,
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: pool.create,
      inline: async (jar) => jar,
      onResult: () => (results += 1),
      onFailed: () => (errors += 1)
    })
    expect(results).toBe(5)
    expect(errors).toBe(2)
    expect(results + errors).toBe(list.length)
    expect(res.completed + res.failed).toBe(list.length)

    let inlineResults = 0
    let inlineErrors = 0
    const inlineRes = await runJarPoolCore<string>({
      jars: list,
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: false,
      inline: async (jar) => {
        if (behaviors.has(jar)) throw new Error('bad')
        return jar
      },
      onResult: () => (inlineResults += 1),
      onFailed: () => (inlineErrors += 1)
    })
    expect(inlineResults).toBe(5)
    expect(inlineErrors).toBe(2)
    expect(inlineRes).toMatchObject({ usedWorkers: false, completed: 5, failed: 2 })
  })

  it('⑥ 重复调用不串状态：两次运行各自完整、各自计数', async () => {
    const list = jars(4)
    const run = async (): Promise<{ ok: number; failed: number }> => {
      const pool = new FakePool(new Map())
      const out = { ok: 0, failed: 0 }
      await runJarPoolCore<string>({
        jars: list,
        signal: new AbortController().signal,
        workerScript: 'x.js',
        workerAvailable: true,
        createWorker: pool.create,
        inline: async (jar) => jar,
        onResult: () => (out.ok += 1),
        onFailed: () => (out.failed += 1)
      })
      return out
    }
    expect(await run()).toEqual({ ok: 4, failed: 0 })
    expect(await run()).toEqual({ ok: 4, failed: 0 })
  })

  it('⑧ worker 不可用（产物缺失）→ 内联降级且结果完整', async () => {
    const list = jars(5)
    const seen: string[] = []
    const res = await runJarPoolCore<string>({
      jars: list,
      signal: new AbortController().signal,
      workerScript: 'C:/not-built/recipe.worker.js',
      workerAvailable: false,
      inline: async (jar) => {
        seen.push(jar)
        return jar.toUpperCase()
      },
      onResult: () => undefined,
      onFailed: () => undefined
    })
    expect(seen.sort()).toEqual([...list].sort())
    expect(res).toMatchObject({ usedWorkers: false, completed: 5, failed: 0 })
  })
})
