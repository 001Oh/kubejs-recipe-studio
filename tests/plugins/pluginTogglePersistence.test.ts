/**
 * T-05：插件启停的**跨重启持久化**。
 *
 * 验收口径（任务书 §3.1）：开关后重进设置页状态保持；重启应用后状态保持。
 * 本文件用「重新加载模块 + 重新 loadPlugins」模拟重启：与真实重启的差别只有进程内存，
 * 而内存态在 `resetPluginLoader()` 里已按"磁盘为权威来源"处理。
 *
 * 本文件为**新增**，不修改任何既有测试文件。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo } from '@shared/types'
import { cleanupTmp } from '../helpers/cleanup'
import { trashTmp } from '../helpers/cleanup'

// 注意：manifest 的 id 用命名空间形式，但**文件名不能带 ':'**——Windows 上会写成备用数据流
const PLUGIN_ID = 't05toggle:toggle'
const TYPE_ID = 't05toggle:only'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/t05-toggle-${process.pid}` }))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' }
}))

const ROOT = mkdtempSync(join(tmpdir(), 't05-toggle-'))

afterAll(() => {
  cleanupTmp(ROOT)
  trashTmp(H.userData)
})

function modpack(path: string): ModpackInfo {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    pluginDir: null,
    detectedAt: Date.now(),
    source: 'manual'
  } as unknown as ModpackInfo
}

/** 在整合包里放一个声明 `TYPE_ID` 的插件 */
function writePlugin(packPath: string): void {
  const dir = join(packPath, '.recipe-studio', 'plugins')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "t05toggle.json"),
    JSON.stringify(
      {
        id: PLUGIN_ID,
        name: '启停持久化测试插件',
        version: '1.0.0',
        recipeTypes: [
          {
            id: TYPE_ID,
            displayName: '开关测试类型',
            layoutKind: 'single_io',
            slots: [{ key: 'input', displayName: '输入', kind: 'item', multiple: false }]
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  )
}

const PACK = join(ROOT, 'pack')
writePlugin(PACK)

/** 每个用例开始前清空 userData 里的启停清单，保证互不影响 */
beforeEach(() => {
  const f = join(H.userData, 'plugin-disabled.json')
  try {
    cleanupTmp(f)
  } catch {
    /* 不存在即可 */
  }
})

async function bootLoader(): Promise<typeof import('@main/plugins/loader')> {
  vi.resetModules()
  const loader = await import('@main/plugins/loader')
  loader.resetPluginLoader()
  return loader
}

describe('T-05：插件启停跨重启持久化', () => {
  it('关闭 → 写盘：userData/plugin-disabled.json 含该 id', async () => {
    const loader = await bootLoader()
    const list = loader.loadPlugins(PACK, { modpack: modpack(PACK) })
    const before = list.find((p) => p.id === PLUGIN_ID)
    expect(before?.status).toBe('loaded')

    const after = loader.setEnabled(PLUGIN_ID, false); loader.persistPluginState()
    expect(after.find((p) => p.id === PLUGIN_ID)?.status).toBe('disabled')

    const file = join(H.userData, 'plugin-disabled.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([PLUGIN_ID])
  })

  it('开→关→「重启」→ 仍关（跨重启保持）', async () => {
    const first = await bootLoader()
    first.loadPlugins(PACK, { modpack: modpack(PACK) })
    first.setEnabled(PLUGIN_ID, false)
    first.persistPluginState()

    // 「重启」：丢弃内存、重新加载模块、重新读插件
    const second = await bootLoader()
    const list = second.loadPlugins(PACK, { modpack: modpack(PACK) })
    expect(list.find((p) => p.id === PLUGIN_ID)?.status).toBe('disabled')
  })

  it('重新启用后清单被清空：文件为 []，重启后恢复 loaded', async () => {
    const first = await bootLoader()
    first.loadPlugins(PACK, { modpack: modpack(PACK) })
    first.setEnabled(PLUGIN_ID, false)
    first.persistPluginState()
    first.setEnabled(PLUGIN_ID, true)
    first.persistPluginState()

    const file = join(H.userData, 'plugin-disabled.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([])

    const second = await bootLoader()
    const list = second.loadPlugins(PACK, { modpack: modpack(PACK) })
    expect(list.find((p) => p.id === PLUGIN_ID)?.status).toBe('loaded')
  })

  it('清单文件损坏时按「全部启用」处理，不阻断加载', async () => {
    mkdirSync(H.userData, { recursive: true })
    writeFileSync(join(H.userData, 'plugin-disabled.json'), '{ 这不是数组', 'utf8')

    const loader = await bootLoader()
    const list = loader.loadPlugins(PACK, { modpack: modpack(PACK) })
    expect(list.find((p) => p.id === PLUGIN_ID)?.status).toBe('loaded')
  })

  it('清单里出现非字符串条目时被忽略，不影响其余判定', async () => {
    mkdirSync(H.userData, { recursive: true })
    writeFileSync(join(H.userData, 'plugin-disabled.json'), JSON.stringify([42, null, PLUGIN_ID]), 'utf8')

    const loader = await bootLoader()
    const list = loader.loadPlugins(PACK, { modpack: modpack(PACK) })
    expect(list.find((p) => p.id === PLUGIN_ID)?.status).toBe('disabled')
  })
})
