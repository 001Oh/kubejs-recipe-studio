/**
 * BUG-HUNT-02 遗留项 BH-014：插件缓存键必须包含文件签名。
 *
 * 背景：`loadPlugins` 的缓存键只含 modpackPath / userDir / modsDir / appVersion。
 * 用户在**同一路径**改插件清单内容不会触发重载；而 `docs/plugins/插件编写说明.md`
 * 里**没有任何**"改动需重启应用"的说明 → 改完看不到效果，误以为格式仍错。
 *
 * 修复：键中加入「文件数量 + 各自 mtime/size」签名，改内容即失效重载。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh02-cachekey-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const MODPACK_PATH = join(mkdtempSync(join(tmpdir(), 'bh02-cachekey-')), 'modpack')
const USER_PLUGINS = join(MODPACK_PATH, '..', 'userplugins')
const PLUGIN_FILE = join(USER_PLUGINS, 'hot.json')

function modpackInfo(): Record<string, unknown> {
  return {
    path: MODPACK_PATH,
    name: 'cachekey-test',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: ['test'],
    modsDir: join(MODPACK_PATH, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: ['minecraft']
  }
}

function writePlugin(displayName: string): void {
  mkdirSync(USER_PLUGINS, { recursive: true })
  writeFileSync(
    PLUGIN_FILE,
    JSON.stringify({
      id: 'hot-plugin',
      name: '热改测试',
      version: '1.0.0',
      recipeTypes: [
        {
          id: 'hot:type',
          displayName,
          layoutKind: 'multi_io',
          emitTarget: null,
          customTemplate: { type: 'hot:type' },
          slots: [{ key: 'ingredients', displayName: '材料', kind: 'item', multiple: true }]
        }
      ]
    }),
    'utf8'
  )
}

async function load() {
  const loader = await import('@main/plugins/loader')
  loader.loadPlugins(MODPACK_PATH, {
    userDir: USER_PLUGINS,
    appVersion: '0.1.0-test',
    modpack: modpackInfo() as never
  })
  return loader
}

describe('BH-014：插件内容改动应立即生效（缓存键含文件签名）', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('同一路径下改插件内容后再次加载，读到的是新内容', async () => {
    vi.resetModules()
    writePlugin('第一版')
    const loader = await load()
    expect(loader.getPluginSchemaOverrides().map((s) => s.displayName)).toEqual(['第一版'])

    // 同一路径、同一文件名，只改内容（长度不同，确保 mtime/size 至少一项变化）
    writePlugin('第二版（内容更长一些）')

    const again = await load()
    expect(again.getPluginSchemaOverrides().map((s) => s.displayName)).toEqual(['第二版（内容更长一些）'])
  })

  it('内容不变时不重复解析（缓存仍然生效）', async () => {
    vi.resetModules()
    writePlugin('稳定版')
    const loader = await load()
    const first = loader.getPluginSchemaOverrides()[0]
    expect(first?.displayName).toBe('稳定版')

    // 再加载一次：键一致 → 命中缓存，返回的是同一份数据
    const second = loader.loadPlugins(MODPACK_PATH, {
      userDir: USER_PLUGINS,
      appVersion: '0.1.0-test',
      modpack: modpackInfo() as never
    })
    expect(second.map((p) => p.id)).toContain('hot-plugin')
    expect(loader.getPluginSchemaOverrides()[0]?.displayName).toBe('稳定版')
  })

  it('删除插件文件后再次加载，该插件不再出现', async () => {
    vi.resetModules()
    writePlugin('将被删除')
    const loader = await load()
    expect(loader.getPluginSchemaOverrides()).toHaveLength(1)

    const { rmSync } = await import('node:fs')
    rmSync(PLUGIN_FILE)

    const again = await load()
    expect(again.getPluginSchemaOverrides()).toHaveLength(0)
  })
})
