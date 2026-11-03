/**
 * T-07：插件读取失败的**可观测性**与**可重试性**。
 *
 * 验收口径（任务书 §3.3）：
 * ① 失败时能拿到 `state === 'failed'` 与原因（UI 的数据源就是 `getPluginLoadStatus()`）；
 * ② 目录修好后**一次正常读取**即可恢复，不需要切包、不需要进设置页；
 * ③ 失败不得被伪装成「成功但为空」——列表为空时状态必须是 `failed`。
 *
 * 分工说明：本文件断言**语义**（函数级）；`plugins:loadStatus` 通道是否已注册
 * 由 `tests/main/ipcWiring.test.ts` 的「INVOKE_CHANNELS 全部已注册」兜底，
 * 通道可用性在下方第一个用例里做一次端到端冒烟。
 *
 * 本文件为**新增**，不修改任何既有测试文件。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo, PluginManifest } from '@shared/types'
import type { PluginLoadState } from '@shared/ipc'
import { cleanupTmp } from '../helpers/cleanup'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/t07-status-${process.pid}`,
  handler: null as null | ((event: unknown, name: unknown, req: unknown) => Promise<unknown>)
}))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: {
    handle: (_c: string, fn: (event: unknown, name: unknown, req: unknown) => Promise<unknown>) => {
      H.handler = fn
    }
  },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const ROOT = mkdtempSync(join(tmpdir(), 't07-status-'))
const PACK = join(ROOT, 'pack')
const PLUGIN_DIR = join(PACK, '.recipe-studio', 'plugins')
const PLUGIN_ID = 't07status:one'

afterAll(() => {
  cleanupTmp(ROOT)
  cleanupTmp(H.userData)
})

function modpack(): ModpackInfo {
  return {
    path: PACK,
    name: 'pack',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: ['test'],
    modsDir: join(PACK, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: ['minecraft']
  }
}

/** 只重置模块并设好当前整合包；返回 loader（不经过 IPC 层） */
async function bootLoader(): Promise<typeof import('@main/plugins/loader')> {
  vi.resetModules()
  const state = await import('@main/modpack/state')
  const loader = await import('@main/plugins/loader')
  loader.resetPluginLoader()
  state.setCurrentModpack(modpack())
  return loader
}

/** 让插件目录「存在但读不出」：换成同名**文件**，readdir 会抛 ENOTDIR */
function breakPluginDir(): void {
  mkdirSync(join(PACK, '.recipe-studio'), { recursive: true })
  rmSync(PLUGIN_DIR, { recursive: true, force: true })
  writeFileSync(PLUGIN_DIR, 'not a directory', 'utf8')
}

function restorePluginDir(): void {
  rmSync(PLUGIN_DIR, { recursive: true, force: true })
  mkdirSync(PLUGIN_DIR, { recursive: true })
  writeFileSync(
    join(PLUGIN_DIR, 'one.json'),
    JSON.stringify({
      id: PLUGIN_ID,
      name: 'T-07 恢复用插件',
      version: '1.0.0',
      recipeTypes: [
        {
          id: 't07status:only',
          displayName: 'T-07 类型',
          layoutKind: 'single_io',
          slots: [{ key: 'input', displayName: '输入', kind: 'item', multiple: false }]
        }
      ]
    }),
    'utf8'
  )
}

describe('T-07：插件读取失败的可观测性与可重试性', () => {
  it('冒烟：plugins:loadStatus 通道已注册，健康态返回 ok', async () => {
    restorePluginDir()
    vi.resetModules()
    const state = await import('@main/modpack/state')
    const loader = await import('@main/plugins/loader')
    const { registerPluginHandlers } = await import('@main/handlers/pluginHandlers')
    const { installIpc } = await import('@main/ipcRegistry')
    loader.resetPluginLoader()
    state.setCurrentModpack(modpack())
    registerPluginHandlers()
    installIpc()
    const res = (await H.handler!(null, 'plugins:loadStatus', undefined)) as {
      ok: boolean
      data?: PluginLoadState
    }
    expect(res.ok).toBe(true)
    expect(res.data?.state).toBe('ok')
  })

  it('目录存在但读不出：列表为空，但状态必须是 failed 且带原因（不得伪装成空）', async () => {
    breakPluginDir()
    const loader = await bootLoader()
    const list: PluginManifest[] = loader.loadPlugins(PACK, { modpack: modpack() })
    expect(list).toEqual([])
    const st = loader.getPluginLoadStatus()
    expect(st.state).toBe('failed')
    expect(st.error).toBeTruthy()
  })

  it('修好目录后一次正常读取即可恢复（不需要切包/进设置页）', async () => {
    breakPluginDir()
    const loader = await bootLoader()
    loader.loadPlugins(PACK, { modpack: modpack() })
    expect(loader.getPluginLoadStatus().state).toBe('failed')

    restorePluginDir()
    const list = loader.loadPlugins(PACK, { modpack: modpack() })
    expect(list.map((p) => p.id)).toContain(PLUGIN_ID)
    expect(loader.getPluginLoadStatus().state).toBe('ok')
    expect(loader.getPluginLoadStatus().error).toBeNull()
  })

  it('失败期间保留上一次成功的列表（不清层）', async () => {
    restorePluginDir()
    const loader = await bootLoader()
    expect(loader.loadPlugins(PACK, { modpack: modpack() }).length).toBe(1)

    breakPluginDir()
    const after = loader.loadPlugins(PACK, { modpack: modpack() })
    expect(after.map((p) => p.id)).toContain(PLUGIN_ID)
    expect(loader.getPluginLoadStatus().state).toBe('failed')
  })
})
