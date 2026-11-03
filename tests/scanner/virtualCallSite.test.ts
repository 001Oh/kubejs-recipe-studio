/**
 * BUG-HUNT-03 证据补齐 BH-003：验证扫描期确实只用「内置命名规则」，不叠加插件通配。
 *
 * 背景：BH-003 的修复把虚拟物品判定拆成两个入口——
 *   - 扫描期 `isVirtualByNamingRules()`（写进 `items.json` 的 `virtual` 必须稳定，不能随插件漂移）
 *   - 查询期 `isVirtualItem()`（内置规则 + 插件通配）
 * 此前的测试只断言了这两个函数本身，**没有**验证 `itemRules` / `probeImport` 真的走了哪一个。
 *
 * 本文件用真实 jar 条目驱动 `scanJarEntries`，断言产出的 `virtual` 字段；
 * 并对 `probeImport` 的调用点做一条**源码结构断言**（明确标注它不是行为测试）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MODPACK_PATH = join(mkdtempSync(join(tmpdir(), 'bh03-scan-')), 'modpack')
const USER_PLUGINS = join(MODPACK_PATH, '..', 'userplugins')
const PLUGIN_ID = 'bh03-scan-plugin'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh03-scan-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

function entry(fileName: string): { fileName: string; uncompressedSize: number } {
  return { fileName, uncompressedSize: 128 }
}

/** 三个物品：一个命中插件通配、一个命中内置命名规则、一个普通物品 */
const ENTRIES = [
  entry('assets/bh03/models/item/marker_widget.json'),
  entry('assets/bh03/models/item/ritual_dummy.json'),
  entry('assets/bh03/models/item/plain_gem.json'),
  entry('assets/bh03/lang/zh_cn.json')
]

const LANG = JSON.stringify({
  'item.bh03.marker_widget': '标记部件',
  'item.bh03.ritual_dummy': '仪式占位',
  'item.bh03.plain_gem': '普通宝石'
})

function readEntry(name: string): Buffer | undefined {
  if (name.endsWith('zh_cn.json')) return Buffer.from(LANG, 'utf8')
  return undefined
}

function writePlugin(): void {
  mkdirSync(USER_PLUGINS, { recursive: true })
  writeFileSync(
    join(USER_PLUGINS, `${PLUGIN_ID}.json`),
    JSON.stringify({
      id: PLUGIN_ID,
      name: '扫描期测试插件',
      version: '1.0.0',
      // 故意让通配覆盖 marker_widget：如果扫描期误用了查询期的 isVirtualItem，它会被标成 virtual:true
      virtualItemPatterns: ['bh03:marker_*'],
      recipeTypes: [
        {
          id: 'bh03:type',
          displayName: '类型',
          layoutKind: 'multi_io',
          emitTarget: null,
          customTemplate: { type: 'bh03:type' },
          slots: [{ key: 'ingredients', displayName: '材料', kind: 'item', multiple: true }]
        }
      ]
    }),
    'utf8'
  )
}

async function boot() {
  vi.resetModules()
  writePlugin()
  const loader = await import('@main/plugins/loader')
  const itemRules = await import('@main/scanner/itemRules')
  const search = await import('@shared/search')
  loader.resetPluginLoader()
  loader.loadPlugins(MODPACK_PATH, {
    userDir: USER_PLUGINS,
    appVersion: '0.1.0-test',
    modpack: {
      path: MODPACK_PATH,
      name: 'scan',
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
    } as never
  })
  return { loader, itemRules, search }
}

describe('BH-003：扫描期只按内置命名规则判定虚拟物品', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('命中插件通配的物品，扫描结果仍是 virtual:false（保证 items.json 不随插件漂移）', async () => {
    const { itemRules } = await boot()
    const result = itemRules.scanJarEntries(ENTRIES, readEntry)
    const marker = result.items.find((i) => i.id === 'bh03:marker_widget')

    expect(marker).toBeDefined()
    expect(marker?.virtual).toBe(false)
  })

  it('命中内置命名规则（dummy）的物品，扫描结果是 virtual:true', async () => {
    const { itemRules } = await boot()
    const result = itemRules.scanJarEntries(ENTRIES, readEntry)
    const dummy = result.items.find((i) => i.id === 'bh03:ritual_dummy')

    expect(dummy).toBeDefined()
    expect(dummy?.virtual).toBe(true)
  })

  it('普通物品不会被误判为虚拟物品', async () => {
    const { itemRules } = await boot()
    const result = itemRules.scanJarEntries(ENTRIES, readEntry)

    expect(result.items.find((i) => i.id === 'bh03:plain_gem')?.virtual).toBe(false)
  })

  it('同一物品在查询期会因插件通配被判为虚拟物品（两个入口的差异成立）', async () => {
    const { itemRules, search } = await boot()
    const marker = itemRules.scanJarEntries(ENTRIES, readEntry).items.find((i) => i.id === 'bh03:marker_widget')!

    // 扫描期：false；查询期：叠加插件通配后 true —— 这正是设计的分工
    expect(marker.virtual).toBe(false)
    expect(search.isVirtualByNamingRules({ id: marker.id, nameZh: marker.nameZh, nameEn: marker.nameEn })).toBe(false)
    expect(search.isVirtualItem({ id: marker.id, nameZh: marker.nameZh, nameEn: marker.nameEn, virtual: marker.virtual })).toBe(true)
  })

  it('没有插件时两类物品的扫描结果不变（通配不影响扫描）', async () => {
    const { itemRules, loader } = await boot()
    loader.resetPluginLoader() // 清缓存但不卸载已注册的 matcher
    loader.setEnabled(PLUGIN_ID, false)

    const result = itemRules.scanJarEntries(ENTRIES, readEntry)
    expect(result.items.find((i) => i.id === 'bh03:marker_widget')?.virtual).toBe(false)
    expect(result.items.find((i) => i.id === 'bh03:ritual_dummy')?.virtual).toBe(true)
  })
})

/** 去掉行注释与块注释，避免把注释里提到的函数名当成真实调用 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

describe('BH-003：probeImport 的调用点（源码结构断言，非行为测试）', () => {
  it('probeImport 使用 isVirtualByNamingRules，且代码里不调用查询期版本', () => {
    const src = codeOnly(readFileSync(join(process.cwd(), 'src', 'main', 'scanner', 'probeImport.ts'), 'utf8'))
    expect(src).toContain('isVirtualByNamingRules(')
    expect(/\bisVirtualItem\s*\(/.test(src)).toBe(false)
  })

  it('itemRules 同样只用命名规则版本', () => {
    const src = codeOnly(readFileSync(join(process.cwd(), 'src', 'main', 'scanner', 'itemRules.ts'), 'utf8'))
    expect(src).toContain('isVirtualByNamingRules(')
    expect(/\bisVirtualItem\s*\(/.test(src)).toBe(false)
  })
})
