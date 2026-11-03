/**
 * BUG-HUNT-02：插件 `virtualItemPatterns` 的**真实生效**验证（BH-003）。
 *
 * 背景：`docs/plugins/插件编写说明.md` §7 与规格 3.6.13 都承诺该字段能把命中的物品判为虚拟物品，
 * 但 `matchesVirtualItem()` 在代码里**没有任何调用方**，查询期 `isVirtualItem()` 也完全不看插件规则
 * ——声明了等于没声明。本文件锁定修复后的契约：
 *
 *   - **查询期**（`isVirtualItem`）：内置命名规则 **+** 插件通配，任一命中即为虚拟物品；
 *   - **扫描期**（`isVirtualByNamingRules`）：只看内置规则，保证写进 `items.json` 的 `virtual`
 *     不会随「当前装了哪些插件」漂移（否则同一份缓存时真时假）。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh02-virtual-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const MODPACK_PATH = join(mkdtempSync(join(tmpdir(), 'bh02-virtual-')), 'modpack')
const USER_PLUGINS = join(MODPACK_PATH, '..', 'userplugins')
const PLUGIN_ID = 'bh02-virtual-plugin'
// 故意选用内置命名规则（dummy / display / jei_）**匹配不到**的 ID，
// 这样才能证明「是插件通配在起作用」，而不是内置规则顺手命中。
const DUMMY = 'bh02:marker/widget'
const NORMAL = 'bh02:ordinary'

function writePlugin(): void {
  mkdirSync(USER_PLUGINS, { recursive: true })
  writeFileSync(
    join(USER_PLUGINS, `${PLUGIN_ID}.json`),
    JSON.stringify({
      id: PLUGIN_ID,
      name: '虚拟物品插件',
      version: '1.0.0',
      virtualItemPatterns: ['bh02:marker/*'],
      recipeTypes: [
        {
          id: 'occultism:ritual',
          displayName: '仪式',
          layoutKind: 'multi_io',
          emitTarget: null,
          customTemplate: { type: 'occultism:ritual' },
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
    name: 'virtual-test',
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

async function boot() {
  vi.resetModules()
  writePlugin()
  const loader = await import('@main/plugins/loader')
  const search = await import('@shared/search')
  loader.resetPluginLoader()
  loader.loadPlugins(MODPACK_PATH, {
    userDir: USER_PLUGINS,
    appVersion: '0.1.0-test',
    modpack: modpackInfo() as never
  })
  return { loader, search }
}

const item = (id: string) => ({ id, nameZh: '名字', nameEn: 'name', virtual: false })

describe('插件 virtualItemPatterns 必须真实生效', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('通配命中的物品在查询期被判为虚拟物品', async () => {
    const { search } = await boot()
    expect(search.isVirtualItem(item(DUMMY))).toBe(true)
  })

  it('通配未命中的物品不受影响', async () => {
    const { search } = await boot()
    expect(search.isVirtualItem(item(NORMAL))).toBe(false)
  })

  it('扫描期只用内置命名规则：通配命中的物品仍记为非虚拟（保证缓存稳定）', async () => {
    const { search } = await boot()
    expect(search.isVirtualByNamingRules({ id: DUMMY, nameZh: '名字', nameEn: 'name' })).toBe(false)
  })

  it('`matchesVirtualItem` 与 `isVirtualItem` 结论一致', async () => {
    const { loader, search } = await boot()
    expect(loader.matchesVirtualItem(DUMMY)).toBe(search.isVirtualItem(item(DUMMY)))
    expect(loader.matchesVirtualItem(NORMAL)).toBe(false)
  })

  it('关闭插件后通配立即失效', async () => {
    const { loader, search } = await boot()
    expect(search.isVirtualItem(item(DUMMY))).toBe(true)

    loader.setEnabled(PLUGIN_ID, false)

    expect(search.isVirtualItem(item(DUMMY))).toBe(false)
  })

  it('重新启用后通配恢复', async () => {
    const { loader, search } = await boot()
    loader.setEnabled(PLUGIN_ID, false)
    loader.setEnabled(PLUGIN_ID, true)

    expect(search.isVirtualItem(item(DUMMY))).toBe(true)
  })

  it('插件通配不应影响 recipeTypes 之外的既有虚拟判定（空名物品仍算虚拟）', async () => {
    const { search } = await boot()
    expect(search.isVirtualItem({ id: 'minecraft:stone', nameZh: '', nameEn: '', virtual: false })).toBe(true)
  })
})

// ---- RV1-004：把「插件通配 → 语料构建 → 实际查询」整条链路串起来验证 ----
import type { ItemEntry } from '@shared/types'

function fullItem(id: string, zh: string, en: string): ItemEntry {
  return {
    id,
    nameZh: zh,
    nameEn: en,
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

function query(extra: Record<string, unknown> = {}) {
  return { text: '', offset: 0, limit: 50, favorites: new Set<string>(), ...extra }
}

const visibleIds = (r: { hits: { item: ItemEntry }[] }): string[] => r.hits.map((h) => h.item.id)

describe('RV1-004：插件通配在语料查询期真正生效', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('未加载插件时：命中通配的物品照常出现在结果里', async () => {
    const search = await import('@shared/search')
    const corpus = search.buildSearchCorpus([fullItem('bh02:marker/widget', '部件', 'Widget')])

    expect(visibleIds(corpus.search(query()))).toEqual(['bh02:marker/widget'])
  })

  it('加载插件后构建语料：命中通配的物品被默认查询隐藏，开启 includeVirtual 后可见', async () => {
    const { search } = await boot()
    const corpus = search.buildSearchCorpus([
      fullItem('bh02:marker/widget', '部件', 'Widget'),
      fullItem('bh02:ordinary', '普通件', 'Ordinary')
    ])

    // 默认（不传 includeVirtual 等价于关闭）：虚拟物品不出现，普通物品照常出现
    expect(visibleIds(corpus.search(query()))).toEqual(['bh02:ordinary'])
    expect(visibleIds(corpus.search(query({ includeVirtual: false })))).toEqual(['bh02:ordinary'])
    // 显式要求显示时能找到
    expect(visibleIds(corpus.search(query({ includeVirtual: true }))).sort()).toEqual([
      'bh02:marker/widget',
      'bh02:ordinary'
    ])
    // 语料本身仍然包含全部物品（过滤发生在查询期，不是丢数据）
    expect(corpus.size).toBe(2)
  })

  it('关闭插件后重建语料：通配不再生效（语料是构建期快照，需重建才更新）', async () => {
    const { loader, search } = await boot()
    const items = [fullItem('bh02:marker/widget', '部件', 'Widget')]
    expect(visibleIds(search.buildSearchCorpus(items).search(query()))).toEqual([])

    loader.setEnabled(PLUGIN_ID, false)

    // 重新构建语料（等价于下一次扫描/索引重载）后，不再被判为虚拟物品
    expect(visibleIds(search.buildSearchCorpus(items).search(query()))).toEqual(['bh02:marker/widget'])
  })
})
