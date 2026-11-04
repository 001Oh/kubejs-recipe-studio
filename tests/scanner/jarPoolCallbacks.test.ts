/**
 * P3-6：jarPoolCore 的 onResult / onFailed 在 worker 事件回调内同步执行，
 * 任一抛错即主进程未捕获异常（worker 路径）或 Promise 被业务回调错误拒绝（内联路径）。
 * 修复：回调统一包 try/catch → logger.error（带 jar 名与阶段），不冒泡、不改变计数语义。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runJarPoolCore, type PoolWorker } from '@main/scanner/jarPoolCore'
import { logger } from '@main/logger'

vi.mock('@main/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), success: vi.fn(), debug: vi.fn() }
}))

/** 同步应答的假 worker：postMessage 即回调，让 onResult/onFailed 的抛错路径可确定性触发 */
class SyncWorker implements PoolWorker {
  private handlers: Record<string, ((payload: unknown) => void)[]> = { message: [], error: [], exit: [] }
  constructor(private readonly ok: boolean, private readonly fireOn: 'post' | 'microtask') {}

  on(event: 'message' | 'error' | 'exit', listener: (payload: unknown) => void): void {
    this.handlers[event].push(listener)
  }

  postMessage(message: unknown): void {
    const msg = message as { id: number }
    const reply = (): void => {
      if (this.ok) for (const fn of this.handlers.message) fn({ id: msg.id, ok: true, payload: 'P' })
      else for (const fn of this.handlers.message) fn({ id: msg.id, ok: false, error: 'bad jar' })
    }
    if (this.fireOn === 'post') reply()
    else queueMicrotask(reply)
  }

  terminate(): void {
    for (const fn of this.handlers.exit) fn(1)
  }
}

beforeEach(() => {
  vi.mocked(logger.error).mockClear()
})

describe('P3-6 业务回调抛错不冒泡', () => {
  it('worker 路径 onResult 抛错：池 Promise 正常 settle，错误进 logger（含 jar 名）', async () => {
    const res = await runJarPoolCore<string>({
      jars: ['C:/mods/a.jar'],
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: () => new SyncWorker(true, 'post'),
      inline: async (jar) => jar,
      onResult: () => {
        throw new Error('boom-in-onResult')
      },
      onFailed: () => undefined
    })
    // 修复前（红）：Promise 被 boom-in-onResult 拒绝
    expect(res).toMatchObject({ usedWorkers: true, completed: 1, failed: 0 })
    expect(vi.mocked(logger.error).mock.calls.some((c) => String(c[1]).includes('a.jar') && String(c[1]).includes('结果回调'))).toBe(true)
  })

  it('worker 路径 onFailed 抛错：同样不冒泡', async () => {
    const res = await runJarPoolCore<string>({
      jars: ['C:/mods/b.jar'],
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: () => new SyncWorker(false, 'post'),
      inline: async (jar) => jar,
      onResult: () => undefined,
      onFailed: () => {
        throw new Error('boom-in-onFailed')
      }
    })
    expect(res).toMatchObject({ completed: 0, failed: 1 })
    expect(vi.mocked(logger.error).mock.calls.some((c) => String(c[1]).includes('b.jar') && String(c[1]).includes('失败回调'))).toBe(true)
  })

  it('异步回调（microtask）路径同样兜底：不产生未捕获异常', async () => {
    const res = await runJarPoolCore<string>({
      jars: ['C:/mods/c.jar'],
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: true,
      createWorker: () => new SyncWorker(true, 'microtask'),
      inline: async (jar) => jar,
      onResult: () => {
        throw new Error('boom-async')
      },
      onFailed: () => undefined
    })
    expect(res).toMatchObject({ completed: 1, failed: 0 })
    await new Promise((r) => setTimeout(r, 20))
    expect(vi.mocked(logger.error).mock.calls.length).toBeGreaterThan(0)
  })

  it('内联路径 onFailed 抛错：Promise 正常 settle', async () => {
    const res = await runJarPoolCore<string>({
      jars: ['C:/mods/d.jar'],
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: false,
      inline: async () => {
        throw new Error('bad jar')
      },
      onResult: () => undefined,
      onFailed: () => {
        throw new Error('boom-inline-onFailed')
      }
    })
    // 修复前（红）：Promise 被 boom-inline-onFailed 拒绝
    expect(res).toMatchObject({ usedWorkers: false, completed: 0, failed: 1 })
    expect(vi.mocked(logger.error).mock.calls.some((c) => String(c[1]).includes('d.jar'))).toBe(true)
  })

  it('内联路径 onResult 抛错：不冒泡；计数保持既有语义（completed 与 failed 都计，属修复前既有的双计边缘，本批不改）', async () => {
    const failed: string[] = []
    const res = await runJarPoolCore<string>({
      jars: ['C:/mods/e.jar'],
      signal: new AbortController().signal,
      workerScript: 'x.js',
      workerAvailable: false,
      inline: async () => 'ok-payload',
      onResult: () => {
        throw new Error('boom-inline-onResult')
      },
      onFailed: (jar) => failed.push(jar)
    })
    // 既有语义（本批「只加防御」不改）：onResult 抛错进入 catch → failed+1、onFailed 调用；
    // completed 在回调前已 +1，因此出现双计。修复只保证不冒泡；错误原因照旧经 onFailed
    // 交给业务层记日志（core 的 logger.error 只兜「回调本身抛错」）。
    expect(res).toMatchObject({ usedWorkers: false, completed: 1, failed: 1 })
    expect(failed).toEqual(['C:/mods/e.jar'])
  })
})
