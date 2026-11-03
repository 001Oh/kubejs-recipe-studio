/**
 * P0：渲染端错误反馈的契约测试（不渲染 DOM，只验证「空数据」与「调用失败」可区分）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type BridgeResult = { ok: true; data: unknown } | { ok: false; error: string; code?: string }

let nextResult: BridgeResult = { ok: true, data: [] }

function installBridge(present = true): void {
  vi.stubGlobal('window', present ? { studio: { invoke: async () => nextResult } } : {})
}

describe('P0 渲染端 IPC 错误反馈', () => {
  beforeEach(() => {
    nextResult = { ok: true, data: [] }
    installBridge()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('正常空数据：callOrThrow 返回空数组，不抛错', async () => {
    const { callOrThrow } = await import('@renderer/api')
    await expect(callOrThrow('schema:list')).resolves.toEqual([])
  })

  it('调用失败：callOrThrow 抛 IpcCallError，并带上通道与原始消息', async () => {
    nextResult = { ok: false, error: '未注册的 IPC channel：schema:list', code: 'IPC_FAILED' }
    const { callOrThrow, IpcCallError } = await import('@renderer/api')
    const err = (await callOrThrow('schema:list').catch((e: unknown) => e)) as InstanceType<typeof IpcCallError>
    expect(err).toBeInstanceOf(IpcCallError)
    expect(err.channel).toBe('schema:list')
    expect(err.message).toContain('未注册的 IPC channel')
  })

  it('旧 call 仍保持「失败返回 null」，两者语义不同且都能被调用方区分', async () => {
    nextResult = { ok: false, error: 'boom' }
    const { call, callOrThrow } = await import('@renderer/api')
    await expect(call('schema:list')).resolves.toBeNull()
    await expect(callOrThrow('schema:list')).rejects.toThrow(/boom/)
  })

  it('preload 桥缺失时抛 BRIDGE 错误，而不是静默空数据', async () => {
    installBridge(false)
    const { callOrThrow, IpcCallError } = await import('@renderer/api')
    const err = (await callOrThrow('schema:list').catch((e: unknown) => e)) as InstanceType<typeof IpcCallError>
    expect(err).toBeInstanceOf(IpcCallError)
    expect(err.code).toBe('BRIDGE')
  })
})
