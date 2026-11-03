/**
 * BUG-HUNT-03 修复 REM-02：插件开关后搜索结果必须立即反映当前插件状态。
 *
 * 根因（本轮核实）：`SearchCorpus` 的 `virtualMask` 是**构建期快照**（`search.ts` 的 `build` 里
 * 调 `isVirtualItem`），而语料只在 `setItemIndex` 时重建。插件开关会失效匹配器缓存，
 * 却没有任何东西通知语料层 → 关闭插件后到下次扫描之间，虚拟物品仍按旧规则被隐藏。
 *
 * 修复：`shared/search` 增加 `virtualPatternsVersion`，`scanner/itemIndex.getCorpus()`
 * 在版本不一致时**惰性重建一次**。
 *
 * 本文件走正式路径：`itemIndex.setItemIndex` → `getCorpus()` → `corpus.search()`，
 * 数据源是真实的插件清单文件与真实的 loader。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemEntry } from '@shared/types'
import type { SearchCorpus, SearchQuerySpec } from '@shared/search'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh03-rem02-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const MODPACK_PATH = join(mkdtempSync(join(tmpdir(), 'bh03-rem02-')), 'modpack')
const USER_PLUGINS = join(MODPACK_PATH, '..', 'userplugins')
const PLUGIN_ID = 'bh03-virtual'
const MARKER = 'bh03:marker/widget'
const ORDINARY = 'bh03:ordinary'
const VANILLA = 'minecraft:stone'

function writePlugin(): void {
  mkdirSync(USER_PLUGINS, { recursive: true })
  writeFileSync(
    join(USER_PLUGINS, `${PLUGIN_ID}.json`),
    JSON.stringify({
      id: PLUGIN_ID,
      name: '虚拟物品插件',
      version: '1.0.0',
      virtualItemPatterns: ['bh03:marker/*'],
      recipeTypes: [
        {
          id: 'bh03:crafted',
          displayName: '测试类型',
          layoutKind: 'multi_io',
          emitTarget: null,
          customTemplate: { type: 'bh03:crafted' },
          slots: [{ key: 'ingredients', displayName: '材料', kind: 'item', multiple: true }]
        }
      ]
    }),
    'utf8'
  )
}

function modpackInfo(): Record<string, unknown> {
  return {
    path: MODPACK_PATH,
    name: 'rem02',
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

function item(id: string, zh: string): ItemEntry {
  return {
    id,
    nameZh: zh,
    nameEn: id,
    modId: id.split(':')[0] ?? 'minecraft',
    confidence: 'lang',
    verified: true,
    hasIcon: true,
    iconKey: null,
    pyFull: [],
    pyInitials: [],
    virtual: false,
    hasRecipe: false
  }
}

const ITEMS: ItemEntry[] = [item(MARKER, '标记部件'), item(ORDINARY, '普通件'), item(VANILLA, '石头')]

function query(extra: Partial<SearchQuerySpec> = {}): SearchQuerySpec {
  return { text: '', offset: 0, limit: 50, favorites: new Set<string>(), ...extra }
}

function visible(corpus: SearchCorpus): string[] {
  return corpus.search(query()).hits.map((h) => h.item.id).sort()
}

async function boot() {
  vi.resetModules()
  writePlugin()
  const loader = await import('@main/plugins/loader')
  const itemIndex = await import('@main/scanner/itemIndex')
  loader.resetPluginLoader()
  loader.loadPlugins(MODPACK_PATH, {
    userDir: USER_PLUGINS,
    appVersion: '0.1.0-test',
    modpack: modpackInfo() as never
  })
  itemIndex.setItemIndex(ITEMS)
  return { loader, itemIndex }
}

describe('REM-02：插件开关后语料按当前状态生效', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('启用时：命中通配的物品被默认查询隐藏，其余物品不受影响', async () => {
    const { itemIndex } = await boot()
    const corpus = itemIndex.getCorpus()
    expect(corpus).not.toBeNull()

    expect(visible(corpus!)).toEqual([ORDINARY, VANILLA].sort())
    // 语料仍含全量（过滤发生在查询期，不是丢数据）
    expect(corpus!.size).toBe(3)
  })

  it('禁用插件后，不重建索引、不手动刷新，立即搜索即能看到该物品', async () => {
    const { loader, itemIndex } = await boot()
    expect(visible(itemIndex.getCorpus()!)).toEqual([ORDINARY, VANILLA].sort())

    loader.setEnabled(PLUGIN_ID, false)

    // 关键：这里没有调 setItemIndex，直接取语料查询
    expect(visible(itemIndex.getCorpus()!)).toEqual([MARKER, ORDINARY, VANILLA].sort())
  })

  it('重新启用后该物品重新被隐藏', async () => {
    const { loader, itemIndex } = await boot()
    loader.setEnabled(PLUGIN_ID, false)
    expect(visible(itemIndex.getCorpus()!)).toContain(MARKER)

    loader.setEnabled(PLUGIN_ID, true)

    expect(visible(itemIndex.getCorpus()!)).toEqual([ORDINARY, VANILLA].sort())
  })

  it('普通原版物品与其他插件物品不会被误删（语料条数恒定）', async () => {
    const { loader, itemIndex } = await boot()
    loader.setEnabled(PLUGIN_ID, false)
    itemIndex.getCorpus()
    loader.setEnabled(PLUGIN_ID, true)
    const corpus = itemIndex.getCorpus()!

    expect(corpus.size).toBe(ITEMS.length)
    expect(visible(corpus)).toContain(VANILLA)
    expect(visible(corpus)).toContain(ORDINARY)
    expect(itemIndex.getItems().map((i) => i.id).sort()).toEqual([MARKER, ORDINARY, VANILLA].sort())
  })

  it('插件状态没变时不会反复重建语料（同一实例）', async () => {
    const { itemIndex } = await boot()
    const a = itemIndex.getCorpus()
    const b = itemIndex.getCorpus()
    const c = itemIndex.getCorpus()
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('清空索引后再取语料返回 null（不制造空语料假象）', async () => {
    const { itemIndex } = await boot()
    expect(itemIndex.getCorpus()).not.toBeNull()

    itemIndex.clearItemIndex()

    expect(itemIndex.getCorpus()).toBeNull()
  })
})
