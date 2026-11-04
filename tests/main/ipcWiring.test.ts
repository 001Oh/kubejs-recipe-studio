/**
 * P0：IPC 接线完整性测试。
 * 目的：任何 `INVOKE_CHANNELS` 里声明、但 `registerHandlers()` 没注册的通道都必须被这里拦住——
 * 这正是 P0 之前漏掉 codegen / plugins / schema 三组的根因。
 */
import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/p0-ipc-${process.pid}`,
  handler: null as null | ((event: unknown, name: unknown, req: unknown) => Promise<unknown>)
}))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: {
    handle: (_channel: string, fn: (event: unknown, name: unknown, req: unknown) => Promise<unknown>) => {
      H.handler = fn
    }
  },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

describe('P0 IPC 接线完整性', () => {
  it('INVOKE_CHANNELS 里每个通道都有 handler，且没有多余注册', async () => {
    vi.resetModules()
    const { registerHandlers } = await import('@main/handlers')
    const { registeredChannels } = await import('@main/ipcRegistry')
    const { INVOKE_CHANNELS } = await import('@shared/ipc')

    registerHandlers()
    const registered = registeredChannels()
    const declared = [...INVOKE_CHANNELS] as string[]

    const missing = declared.filter((c) => !registered.includes(c as never))
    const extra = registered.filter((c) => !declared.includes(c as string))

    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('重复注册同一个通道会抛错（不静默覆盖）', async () => {
    vi.resetModules()
    const { registerHandlers } = await import('@main/handlers')
    const { registerHandler } = await import('@main/ipcRegistry')
    registerHandlers()
    expect(() => registerHandler('app:runtime', () => ({ appVersion: 'x', userData: 'y', platform: 'z' }))).toThrow(
      /重复注册/
    )
  })

  it('未注册通道返回统一错误结构（不是异常、也不是成功）', async () => {
    vi.resetModules()
    const { registerHandlers } = await import('@main/handlers')
    const { installIpc } = await import('@main/ipcRegistry')
    registerHandlers()
    installIpc()
    expect(H.handler).not.toBeNull()
    const res = (await H.handler!(null, 'not:a-channel', undefined)) as { ok: boolean; error: string }
    expect(res.ok).toBe(false)
    expect(res.error).toContain('未注册的 IPC channel')
  })

  it('第 115 批续：source:reveal 三处注册齐全（类型映射 / 通道数组 / handler）', async () => {
    vi.resetModules()
    const { registerHandlers } = await import('@main/handlers')
    const { registeredChannels } = await import('@main/ipcRegistry')
    const { INVOKE_CHANNELS } = await import('@shared/ipc')
    registerHandlers()
    // 类型映射由 registerHandler<'source:reveal'> 的泛型在编译期保证；这里查运行期两处
    expect([...INVOKE_CHANNELS]).toContain('source:reveal')
    expect(registeredChannels()).toContain('source:reveal')
  })

  it('P0 关注的九个通道全部可用（codegen / scripts / plugins / schema）', async () => {
    vi.resetModules()
    const { registerHandlers } = await import('@main/handlers')
    const { registeredChannels } = await import('@main/ipcRegistry')
    registerHandlers()
    const registered = registeredChannels()
    const target = [
      'codegen:preview',
      'codegen:checkTarget',
      'codegen:write',
      'scripts:list',
      'scripts:rename',
      'plugins:list',
      'plugins:setEnabled',
      'schema:list',
      'schema:get',
      'schema:registryOptions',
      'schema:pin',
      'schema:unpin',
      'schema:coverage'
    ] as const
    const missing = target.filter((c) => !registered.includes(c))
    expect(missing).toEqual([])
  })
})
