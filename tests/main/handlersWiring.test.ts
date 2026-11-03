/**
 * P0：`scripts:*` 与 `plugins:*` 的 handler 级测试（真实临时目录，不 mock 业务实现）。
 */
import { mkdirSync, promises as fsp, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/p0-handlers-${process.pid}`,
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
  shell: { openExternal: () => undefined }
}))

const BASE_PACK = join(H.userData, 'pack')

interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** 每个用例用独立整合包目录：不做删除（宿主 safe-delete 守卫会拦截批量 rm），避免跨用例互相影响 */
let caseNo = 0
let PACK = BASE_PACK
let SCRIPTS = join(PACK, 'kubejs', 'server_scripts')

function freshPack(): { pack: string; scripts: string } {
  caseNo += 1
  const pack = join(BASE_PACK, `case-${caseNo}`)
  const scripts = join(pack, 'kubejs', 'server_scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(join(scripts, 'a_one.js'), 'console.info(1)\n')
  writeFileSync(join(scripts, 'b_two.js'), 'console.info(2)\n')
  writeFileSync(join(scripts, 'ignore.txt'), 'not a script')
  return { pack, scripts }
}

async function boot(): Promise<void> {
  vi.resetModules()
  mkdirSync(SCRIPTS, { recursive: true })
  const { setCurrentModpack } = await import('@main/modpack/state')
  setCurrentModpack({
    path: PACK,
    name: 'p0-test',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.0.0',
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: [],
    modsDir: join(PACK, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  })
  const { registerAppHandlers } = await import('@main/handlers/appHandlers')
  const { registerCodegenHandlers } = await import('@main/handlers/codegenHandlers')
  const { registerPluginHandlers } = await import('@main/handlers/pluginHandlers')
  const { installIpc } = await import('@main/ipcRegistry')
  registerAppHandlers()
  registerCodegenHandlers()
  registerPluginHandlers()
  installIpc()
}

async function invoke<T>(name: string, req?: unknown): Promise<IpcResult<T>> {
  return (await H.handler!(null, name, req)) as IpcResult<T>
}

describe('P0 scripts / plugins handler', () => {
  it('scripts:list 按文件名字典序返回，带顺序号与字节数', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const res = await invoke<{ name: string; order: number; bytes: number }[]>('scripts:list')
    expect(res.ok).toBe(true)
    expect(res.data?.map((s) => s.name)).toEqual(['a_one.js', 'b_two.js'])
    expect(res.data?.map((s) => s.order)).toEqual([1, 2])
    expect(res.data?.[0]?.bytes).toBeGreaterThan(0)
  })

  it('scripts:rename 成功后在列表里体现新名字', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const res = await invoke<{ name: string }[]>('scripts:rename', { name: 'a_one.js', to: 'a_renamed.js' })
    expect(res.ok).toBe(true)
    expect(res.data?.map((s) => s.name)).toContain('a_renamed.js')
    await expect(fsp.stat(join(SCRIPTS, 'a_one.js'))).rejects.toThrow()
  })

  it('scripts:rename 拒绝非法文件名（路径穿越/非法字符）', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const res = await invoke('scripts:rename', { name: '../escape.js', to: 'ok.js' })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('scripts:rename 目标不存在时返回可识别错误', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const res = await invoke('scripts:rename', { name: 'nope.js', to: 'other.js' })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('不存在')
  })

  it('scripts:rename 目标已存在时必须拒绝且不覆盖（P2-1）', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const res = await invoke<{ name: string }[]>('scripts:rename', { name: 'a_one.js', to: 'b_two.js' })
    // 拒绝并说明原因（文案含目标名）
    expect(res.ok).toBe(false)
    expect(res.error).toContain('b_two.js')
    // 目标内容逐字节未动，源文件仍在
    expect(await fsp.readFile(join(SCRIPTS, 'b_two.js'), 'utf8')).toBe('console.info(2)\n')
    expect(await fsp.readFile(join(SCRIPTS, 'a_one.js'), 'utf8')).toBe('console.info(1)\n')
  })

  it('plugins:list 正常返回（无插件时为空数组，不是错误）', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const res = await invoke<unknown[]>('plugins:list')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual([])
  })

  it('plugins:setEnabled 拒绝非法入参', async () => {
    const fresh = freshPack()
    PACK = fresh.pack
    SCRIPTS = fresh.scripts
    await boot()
    const emptyId = await invoke('plugins:setEnabled', { id: '  ', on: true })
    expect(emptyId.ok).toBe(false)
    const badFlag = await invoke('plugins:setEnabled', { id: 'x', on: 'yes' })
    expect(badFlag.ok).toBe(false)
  })
})
