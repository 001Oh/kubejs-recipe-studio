import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModpackInfo } from '@shared/types'
import { cleanupTmp } from '../helpers/cleanup'

/**
 * 编排层集成测试：用「真实结构的 jar」跑 scanItems → 语料 → 缓存 → 查询这条链。
 * electron 只被用来拿 userData 路径与版本号，这里用 vi.mock 顶掉，其余全是真实 IO。
 *
 * 目录按进程 + 时间戳唯一：清理被宿主 safe-delete 守卫拦下时（批量删除保护），
 * 残留的旧 jar / 缓存不会污染下一次运行的断言（曾导致 jarCount 3≠2、计数 5>5 的假失败）。
 */
const TMP = vi.hoisted(() => `${process.cwd()}/.vitest-tmp/scanPipeline-${process.pid}-${Date.now()}`)
vi.mock('electron', () => ({
  app: { getPath: () => TMP, getVersion: () => '0.1.0-test' }
}))
const ROOT = TMP

import { setCurrentModpack, getCurrentSummary, readFavorites, setFavorite } from '@main/modpack/state'
import { startScan, isScanning } from '@main/scanOrchestrator'
import { getCorpus, getItems, itemCount } from '@main/scanner/itemIndex'
import { cacheFile, iconFile } from '@main/paths'
import { allRecords, queryByInput, queryByOutput } from '@main/recipes/recipeIndex'
import { scanRecipes } from '@main/recipes/scanRecipes'
import { writeJar, fakePng } from '../helpers/zipWriter'

function makeModpack(name: string, jars: { file: string; entries: Parameters<typeof writeJar>[1] }[]): ModpackInfo {
  const path = join(ROOT, name)
  const modsDir = join(path, 'mods')
  mkdirSync(modsDir, { recursive: true })
  for (const jar of jars) writeJar(join(modsDir, jar.file), jar.entries)
  return {
    path,
    name,
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: jars.length,
    detectedFrom: ['test'],
    modsDir,
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

const rubyJar = {
  file: 'mymod-1.20.1.jar',
  entries: [
    {
      name: 'assets/mymod/lang/zh_cn.json',
      data: JSON.stringify({
        'item.mymod.ruby': '红宝石',
        'block.mymod.ruby_block': '红宝石块',
        'item.mymod.ritual_dummy_x': '仪式假物',
        'item.mymod.debug_tool': '调试工具'
      })
    },
    { name: 'assets/mymod/lang/en_us.json', data: JSON.stringify({ 'item.mymod.ruby': 'Ruby' }) },
    {
      name: 'assets/mymod/models/item/ruby.json',
      data: JSON.stringify({ parent: 'item/generated', textures: { layer0: 'mymod:item/ruby' } })
    },
    { name: 'assets/mymod/textures/item/ruby.png', data: fakePng(1) },
    { name: 'assets/mymod/textures/block/ruby_block.png', data: fakePng(2) },
    // 数据驱动配方：标准 recipes 路径 + 1.21 的单数 recipe 路径都要能扫到
    {
      name: 'data/mymod/recipes/ruby_block.json',
      data: JSON.stringify({
        type: 'minecraft:crafting_shaped',
        pattern: ['AA', 'AA'],
        key: { A: { item: 'mymod:ruby' } },
        result: { item: 'mymod:ruby_block', count: 1 }
      })
    },
    {
      name: 'data/mymod/recipe/smelt_ruby.json',
      data: JSON.stringify({
        type: 'minecraft:smelting',
        ingredient: { item: 'mymod:ruby' },
        result: { item: 'mymod:ruby_block' },
        experience: 0.3,
        cookingtime: 200
      })
    }
  ]
}

const otherJar = {
  file: 'othermod.jar',
  entries: [
    { name: 'assets/othermod/lang/en_us.json', data: JSON.stringify({ 'item.othermod.mystery_thing': 'Mystery Thing' }) },
    { name: 'assets/othermod/textures/item/mystery_thing.png', data: fakePng(3) },
    {
      name: 'data/othermod/recipes/mystery.json',
      data: JSON.stringify({
        type: 'minecraft:crafting_shapeless',
        ingredients: [{ item: 'othermod:mystery_thing' }],
        result: { item: 'mymod:ruby' }
      })
    }
  ]
}

let modpack: ModpackInfo
let emptyPack: ModpackInfo

beforeAll(async () => {
  cleanupTmp(ROOT)
  modpack = makeModpack('pack', [rubyJar, otherJar])
  // KubeJS 脚本也是配方来源（source: 'kubejs'），同时参与 extras 签名
  mkdirSync(join(modpack.path, 'kubejs', 'server_scripts'), { recursive: true })
  writeFileSync(
    join(modpack.path, 'kubejs', 'server_scripts', 'base.js'),
    [
      'ServerEvents.recipes(event => {',
      "  event.shapeless('minecraft:stick', ['minecraft:oak_planks'])",
      '})',
      ''
    ].join('\n'),
    'utf8'
  )
  emptyPack = makeModpack('empty', [])
  setCurrentModpack(modpack)
  await startScan(false)
})

afterAll(() => {
  setCurrentModpack(null)
  cleanupTmp(ROOT)
})

describe('导入 → 物品扫描 → 索引与语料', () => {
  it('扫描出全部物品（含虚拟物品），并写出完整 items.json', () => {
    const summary = getCurrentSummary()
    expect(summary).not.toBeNull()
    // 4 条 = ruby / ruby_block / ritual_dummy_x / mystery_thing（debug_tool 按规则排除）
    // B120/D-07：`items` 现在是**内存索引总数**（mod 派生 + 内置原版 + 引用兜底），
    // 核对扫描产物要看 `scannedItems`——缓存回退比较必须用它。
    expect(summary?.scannedItems).toBe(4)
    expect(summary?.vanillaItems).toBe(1435)
    expect(summary?.referencedItems).toBe(0)
    expect(summary?.items).toBe(4 + 1435)
    const items = getItems()
    // mod 派生条目标记为无 source（历史缓存语义），合成条目标 vanilla/referenced
    expect(items.filter((i) => i.source === undefined).map((i) => i.id).sort()).toEqual([
      'mymod:ritual_dummy_x',
      'mymod:ruby',
      'mymod:ruby_block',
      'othermod:mystery_thing'
    ])
    // D-07 的核心验收：原版物品进索引、名字正确、来源可辨
    const emerald = items.find((i) => i.id === 'minecraft:emerald')
    expect(emerald?.nameZh).toBe('绿宝石')
    expect(emerald?.source).toBe('vanilla')
    expect(emerald?.hasIcon).toBe(false)
    // debug_ 资源必须被排除（规格 3.2 的排除规则）
    expect(items.some((i) => i.id === 'mymod:debug_tool')).toBe(false)
    const cached = JSON.parse(readFileSync(cacheFile(modpack.path, 'items'), 'utf8')) as { id: string; virtual: boolean }[]
    // 缓存文件必须仍是纯 mod 派生口径：合成条目只活在内存里，绝不落盘
    expect(cached).toHaveLength(4)
    expect(cached.some((i) => i.id === 'minecraft:emerald')).toBe(false)
    expect(cached.find((i) => i.id === 'mymod:ritual_dummy_x')?.virtual).toBe(true)
  })

  it('真实贴图落盘到 icon-cache，缺失的计入占位比例并告警', () => {
    const items = getItems()
    const ruby = items.find((i) => i.id === 'mymod:ruby')
    expect(ruby?.hasIcon).toBe(true)
    expect(ruby?.iconKey).not.toBeNull()
    expect(existsSync(iconFile(ruby?.iconKey as string))).toBe(true)
    const summary = getCurrentSummary()
    // 4 条里 ritual_dummy 没有贴图 → 25%
    expect(summary?.placeholderIconRatio).toBeCloseTo(0.25, 4)
    expect(summary?.iconWarning).toBe(true)
  })

  it('搜索语料按查询参数过滤虚拟物品，中文/拼音/首字母都能搜', () => {
    const corpus = getCorpus()
    expect(corpus).not.toBeNull()
    if (!corpus) return
    const base = { offset: 0, limit: 20, favorites: new Set<string>() }
    expect(corpus.search({ ...base, text: '红宝石' }).hits.map((h) => h.item.id)).toEqual(['mymod:ruby', 'mymod:ruby_block'])
    expect(corpus.search({ ...base, text: 'hongbaoshi' }).hits[0]?.item.id).toBe('mymod:ruby')
    expect(corpus.search({ ...base, text: '仪式' }).hits).toHaveLength(0)
    expect(
      corpus.search({ ...base, text: '仪式', includeVirtual: true }).hits.map((h) => h.item.id)
    ).toEqual(['mymod:ritual_dummy_x'])
  })

  it('切换虚拟物品显示不改变语料对象与索引条数', () => {
    const before = getCorpus()
    const countBefore = itemCount()
    const corpus = getCorpus()
    if (!corpus) return
    corpus.search({ text: '', offset: 0, limit: 10, favorites: new Set(), includeVirtual: true })
    corpus.search({ text: '', offset: 0, limit: 10, favorites: new Set(), includeVirtual: false })
    expect(getCorpus()).toBe(before)
    expect(itemCount()).toBe(countBefore)
  })

  it('收藏过滤基于持久化集合，仍然有效', () => {
    setFavorite('mymod:ruby', true)
    expect(readFavorites()).toContain('mymod:ruby')
    const corpus = getCorpus()
    if (!corpus) return
    const hits = corpus.search({
      text: '',
      offset: 0,
      limit: 10,
      onlyFavorites: true,
      favorites: new Set(readFavorites())
    })
    expect(hits.hits.map((h) => h.item.id)).toEqual(['mymod:ruby'])
    setFavorite('mymod:ruby', false)
  })

  it('缓存 meta 只在成功后提交，且记录阶段 / 解析器 / extras', () => {
    const meta = JSON.parse(readFileSync(cacheFile(modpack.path, 'meta'), 'utf8')) as {
      phases: string[]
      parserVersion: number
      extras: string
      signature: { jarCount: number }
    }
    expect(meta.phases).toEqual(['items', 'recipes'])
    expect(meta.parserVersion).toBe(1)
    expect(meta.signature.jarCount).toBe(2)
    expect(typeof meta.extras).toBe('string')
  })

  it('二次启动命中缓存：不重新扫描，语料照常建立', async () => {
    const before = getCurrentSummary()
    expect(before?.cacheHit).toBe(false)
    const again = await startScan(false)
    expect(again.started).toBe(true)
    expect(getCurrentSummary()?.cacheHit).toBe(true)
    // 缓存命中也必须重新合并内置清单（合并在内存层，不依赖缓存内容）
    expect(getCurrentSummary()?.scannedItems).toBe(4)
    expect(getCurrentSummary()?.items).toBe(4 + 1435)
    expect(getCorpus()?.search({ text: '红宝石', offset: 0, limit: 5, favorites: new Set() }).hits).toHaveLength(2)
    // 原版物品在缓存命中路径上同样可搜（D-07 验收：不是只有首次扫描才有）
    const emeraldHit = getCorpus()?.search({ text: '绿宝石', offset: 0, limit: 5, favorites: new Set() }).hits ?? []
    expect(emeraldHit.map((h) => h.item.id)).toContain('minecraft:emerald')
  })
})

describe('配方库集成', () => {
  it('首次扫描建立真实配方索引：jar 双路径 + KubeJS 脚本', () => {
    const summary = getCurrentSummary()
    expect(summary?.recipes).not.toBeNull()
    expect(summary?.recipes?.total).toBeGreaterThanOrEqual(3)
    expect(summary?.recipes?.kubejs).toBeGreaterThanOrEqual(1)
    const types = new Set(allRecords().map((r) => r.type))
    expect(types.has('minecraft:crafting_shaped')).toBe(true)
    // 1.21 单数路径 data/<ns>/recipe/ 也要被扫到
    expect(types.has('minecraft:smelting')).toBe(true)
    expect(allRecords().some((r) => r.source === 'kubejs')).toBe(true)
  })

  it('按产出 / 消耗查询：制作链与用途都查得到', () => {
    const out = queryByOutput('mymod:ruby_block', 0, 50)
    expect(out.total).toBeGreaterThanOrEqual(2)
    expect(out.items.some((r) => r.inputs.some((i) => i.id === 'mymod:ruby'))).toBe(true)
    const use = queryByInput('mymod:ruby', 0, 50)
    expect(use.total).toBeGreaterThanOrEqual(2)
  })

  it('meta 记录 items+recipes 两阶段，recipes.json 已落盘', () => {
    const meta = JSON.parse(readFileSync(cacheFile(modpack.path, 'meta'), 'utf8')) as { phases: string[] }
    expect(meta.phases).toEqual(['items', 'recipes'])
    expect(existsSync(cacheFile(modpack.path, 'recipes'))).toBe(true)
  })

  it('二次启动：物品与配方都命中缓存，配方阶段不再重扫', async () => {
    const before = getCurrentSummary()?.recipes?.total ?? 0
    const again = await startScan(false)
    expect(again.started).toBe(true)
    const after = getCurrentSummary()
    expect(after?.cacheHit).toBe(true)
    expect(after?.recipes?.total).toBe(before)
    expect(after?.timings?.recipesMs ?? 999999).toBeLessThan(5000)
  })

  it('配方数据源变化 → extras 失效 → 只重扫配方，物品缓存仍命中', async () => {
    const beforeTotal = getCurrentSummary()?.recipes?.total ?? 0
    writeFileSync(
      join(modpack.path, 'kubejs', 'server_scripts', 'extra.js'),
      "ServerEvents.recipes(event => {\n  event.shapeless('minecraft:torch', ['minecraft:stick'])\n})\n",
      'utf8'
    )
    await startScan(false)
    const after = getCurrentSummary()
    expect(after?.recipes?.total).toBeGreaterThan(beforeTotal)
    // 物品索引不依赖 extras：这次仍然是物品缓存命中
    expect(after?.cacheHit).toBe(true)
  })

  it('单个模组损坏：跳过并汇总，其余物品与配方照常建立', async () => {
    writeFileSync(join(modpack.modsDir, 'broken.jar'), Buffer.from('not a zip'))
    await startScan(false)
    const summary = getCurrentSummary()
    expect(summary?.failedMods.some((f) => f.name === 'broken.jar')).toBe(true)
    expect(summary?.items).toBeGreaterThanOrEqual(4)
    expect(summary?.recipes?.total).toBeGreaterThanOrEqual(3)
  })

  it('配方阶段失败：不写 meta、不把半成品标成完整', async () => {
    setCurrentModpack(emptyPack)
    const res = await startScan(false, {
      scanRecipes: async () => {
        throw new Error('配方源坏了')
      }
    })
    expect(res.started).toBe(true)
    expect(existsSync(cacheFile(emptyPack.path, 'meta'))).toBe(false)
    expect(existsSync(cacheFile(emptyPack.path, 'recipes'))).toBe(false)
  })
})

describe('失败与取消不会把半成品当完整缓存', () => {
  it('扫描抛错时不写 meta、不更新摘要', async () => {
    setCurrentModpack(emptyPack)
    const res = await startScan(false, {
      scan: async () => {
        throw new Error('假装磁盘坏了')
      }
    })
    expect(res.started).toBe(true)
    expect(existsSync(cacheFile(emptyPack.path, 'meta'))).toBe(false)
    expect(getCurrentSummary()).toBeNull()
    expect(isScanning()).toBe(false)
  })

  it('取消同样不写 meta，任务状态复位', async () => {
    setCurrentModpack(emptyPack)
    const res = await startScan(false, {
      scan: async () => {
        throw new Error('已取消：物品扫描')
      }
    })
    expect(res.started).toBe(true)
    expect(existsSync(cacheFile(emptyPack.path, 'meta'))).toBe(false)
    expect(isScanning()).toBe(false)
    // 复位后还能再次启动
    const retry = await startScan(false, {
      scan: async () => {
        throw new Error('已取消：物品扫描')
      }
    })
    expect(retry.started).toBe(true)
  })

  it('扫描进行中重复触发会被拒绝', async () => {
    setCurrentModpack(emptyPack)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = startScan(false, {
      scan: async () => {
        await gate
        throw new Error('已取消：物品扫描')
      }
    })
    const second = await startScan(false)
    expect(second.started).toBe(false)
    expect(second.reason).toContain('已有扫描')
    release()
    await first
    expect(isScanning()).toBe(false)
  })
})

describe('配方扫描取消/失败不落缓存', () => {
  it('中途取消：不写 recipes.json，也不写 meta', async () => {
    const pack = makeModpack('cancelRecipe', [
      {
        file: 'm.jar',
        entries: [
          {
            name: 'data/m/recipes/x.json',
            data: JSON.stringify({
              type: 'minecraft:crafting_shapeless',
              ingredients: [{ item: 'minecraft:dirt' }],
              result: { item: 'minecraft:mud' }
            })
          }
        ]
      }
    ])
    setCurrentModpack(pack)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(scanRecipes(() => undefined, { signal: ctrl.signal })).rejects.toThrow(/已取消/)
    expect(existsSync(cacheFile(pack.path, 'recipes'))).toBe(false)
    expect(existsSync(cacheFile(pack.path, 'meta'))).toBe(false)
  })

  it('单个坏 jar 时配方扫描继续，坏 jar 进失败统计', async () => {
    const pack = makeModpack('partialRecipe', [
      {
        file: 'good.jar',
        entries: [
          {
            name: 'data/g/recipes/y.json',
            data: JSON.stringify({
              type: 'minecraft:crafting_shapeless',
              ingredients: [{ item: 'minecraft:sand' }],
              result: { item: 'minecraft:glass' }
            })
          }
        ]
      }
    ])
    writeFileSync(join(pack.modsDir, 'bad.jar'), Buffer.from('broken'))
    setCurrentModpack(pack)
    const failed: { name: string; error: string }[] = []
    const stats = await scanRecipes(() => undefined, {
      skipPersist: true,
      onFailed: (name, error) => failed.push({ name, error })
    })
    expect(stats.total).toBeGreaterThanOrEqual(1)
    expect(failed.some((f) => f.name === 'bad.jar')).toBe(true)
  })
})
