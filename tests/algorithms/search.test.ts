import { describe, expect, it } from 'vitest'
import type { ItemEntry } from '@shared/types'
import { buildSearchCorpus, isVirtualItem, searchItems, type SearchQuerySpec } from '@shared/search'
import { pinyinIndex } from '@shared/pinyin'

/**
 * 规格 §五：41,000 条物品单次查询必须在 16ms 内返回。
 * 阈值写成常量便于按机器差异调整（CI 上弱机会偏慢，本地一般 2-4ms）。
 */
const PERF_BUDGET_MS = 16

interface Spec {
  id: string
  zh: string
  en: string
  modId?: string
  verified?: boolean
  hasRecipe?: boolean
  virtual?: boolean
}

function mk(spec: Spec): ItemEntry {
  const py = pinyinIndex(spec.zh)
  return {
    id: spec.id,
    nameZh: spec.zh,
    nameEn: spec.en,
    modId: spec.modId ?? spec.id.split(':')[0] ?? 'minecraft',
    confidence: 'lang',
    verified: spec.verified ?? true,
    hasIcon: true,
    iconKey: null,
    pyFull: py.pyFull,
    pyInitials: py.pyInitials,
    virtual: spec.virtual ?? false,
    hasRecipe: spec.hasRecipe ?? false
  }
}

const LIBRARY: ItemEntry[] = [
  mk({ id: 'minecraft:diamond', zh: '钻石', en: 'Diamond', hasRecipe: true }),
  mk({ id: 'minecraft:diamond_sword', zh: '钻石剑', en: 'Diamond Sword' }),
  mk({ id: 'minecraft:diamond_block', zh: '钻石块', en: 'Block of Diamond' }),
  mk({ id: 'create:diamond_dust', zh: '金刚石', en: 'Industrial Diamond', modId: 'create' }),
  mk({ id: 'bbb:dup', zh: '钻石', en: 'Diamond Copy' }),
  mk({ id: 'aaa:dup', zh: '钻石', en: 'Diamond Duplicate' }),
  mk({ id: 'occultism:ritual_dummy/craft_matrix', zh: '仪式矩阵', en: 'Ritual Matrix', virtual: true }),
  mk({ id: 'mekanism:unverified_ore', zh: '未注册矿石', en: 'Unverified Ore', verified: false })
]

function q(text: string, extra: Partial<SearchQuerySpec> = {}): SearchQuerySpec {
  return { text, offset: 0, limit: 50, favorites: new Set<string>(), ...extra }
}

const corpus = buildSearchCorpus(LIBRARY)

function ids(result: { hits: { item: ItemEntry }[] }): string[] {
  return result.hits.map((h) => h.item.id)
}

function scoreOf(result: ReturnType<typeof corpus.search>, id: string): number | undefined {
  return result.hits.find((h) => h.item.id === id)?.score
}

describe('searchCorpus 查询形式（规格 3.3）', () => {
  it('中文包含 钻石：完全相等档命中三个同名词，金刚石不在结果里', () => {
    const r = corpus.search(q('钻石'))
    expect(ids(r)).toEqual([
      'aaa:dup',
      'bbb:dup',
      'minecraft:diamond',
      'minecraft:diamond_block',
      'minecraft:diamond_sword'
    ])
    expect(r.hits[0]?.score).toBe(1000)
    expect(scoreOf(r, 'minecraft:diamond_sword')).toBe(800)
    expect(ids(r)).not.toContain('create:diamond_dust')
  })

  it('英文名 diamond：相等 > 前缀 > 包含逐档抽查', () => {
    const r = corpus.search(q('diamond'))
    expect(r.hits[0]?.item.id).toBe('minecraft:diamond')
    expect(scoreOf(r, 'minecraft:diamond')).toBe(900)
    expect(scoreOf(r, 'minecraft:diamond_sword')).toBe(700)
    // path 段前缀走 ID 前缀档，优先级高于英文名包含
    expect(scoreOf(r, 'create:diamond_dust')).toBe(650)
    expect(scoreOf(r, 'minecraft:diamond_block')).toBe(650)
    const contained = corpus.search(q('mond'))
    expect(scoreOf(contained, 'minecraft:diamond_block')).toBe(400)
    expect(scoreOf(contained, 'create:diamond_dust')).toBe(400)
    expect(scoreOf(corpus.search(q('nd_du')), 'create:diamond_dust')).toBe(150)
    // 只写 path 段也能命中 ID（精确复用 ID 完全相等档）
    expect(scoreOf(corpus.search(q('unverified_ore')), 'mekanism:unverified_ore')).toBe(850)
  })

  it('minecraft:diamond 同时支持精确与包含（前缀）匹配', () => {
    const r = corpus.search(q('minecraft:diamond'))
    expect(ids(r)).toEqual(['minecraft:diamond', 'minecraft:diamond_block', 'minecraft:diamond_sword'])
    expect(r.hits[0]?.score).toBe(850)
    expect(r.hits[1]?.score).toBe(650)
  })

  it('zuanshi 命中全拼前缀档，zs 命中首字母相等档，jgs 命中「金刚石」', () => {
    const full = corpus.search(q('zuanshi'))
    expect(ids(full)).toContain('minecraft:diamond')
    expect(scoreOf(full, 'minecraft:diamond')).toBe(350)
    const ini = corpus.search(q('zs'))
    expect(ids(ini).slice(0, 3)).toEqual(['aaa:dup', 'bbb:dup', 'minecraft:diamond'])
    expect(ini.hits[0]?.score).toBe(300)
    expect(scoreOf(ini, 'minecraft:diamond_sword')).toBe(200)
    const jgs = corpus.search(q('jgs'))
    expect(ids(jgs)).toEqual(['create:diamond_dust'])
    expect(jgs.hits[0]?.score).toBe(300)
  })

  it('多词空格分词是 AND 语义：diam sw 只剩钻石剑，得分取各词最低档', () => {
    const r = corpus.search(q('diam sw'))
    expect(r.matched).toBe(1)
    expect(ids(r)).toEqual(['minecraft:diamond_sword'])
    expect(r.hits[0]?.score).toBe(400)
    const both = corpus.search(q('钻石剑 diamond'))
    expect(both.matched).toBe(1)
    expect(both.hits[0]?.score).toBe(700)
  })

  it('空查询返回全库并按 ID 字典序', () => {
    const r = corpus.search(q(''))
    expect(ids(r)).toEqual([
      'aaa:dup',
      'bbb:dup',
      'create:diamond_dust',
      'mekanism:unverified_ore',
      'minecraft:diamond',
      'minecraft:diamond_block',
      'minecraft:diamond_sword'
    ])
    expect(r.hits[0]?.score).toBe(0)
  })
})

describe('searchCorpus 计数、筛选与高亮', () => {
  it('total 为语料全库条数，matched 为过滤且命中的条数', () => {
    const r = corpus.search(q('diamond'))
    expect(r.total).toBe(corpus.size)
    // 语料收全量（含虚拟物品），显示过滤发生在查询期
    expect(corpus.size).toBe(LIBRARY.length)
    expect(r.matched).toBe(6)
    expect(r.hits.length).toBe(r.matched)
  })

  it('modId / 仅已注册 / 仅有配方 / 仅收藏', () => {
    expect(ids(corpus.search(q('diamond', { modId: 'create' })))).toEqual(['create:diamond_dust'])
    expect(ids(corpus.search(q('', { onlyRegistered: true })))).not.toContain('mekanism:unverified_ore')
    expect(ids(corpus.search(q('', { onlyWithRecipes: true })))).toEqual(['minecraft:diamond'])
    expect(ids(corpus.search(q('', { onlyFavorites: true, favorites: new Set(['bbb:dup']) })))).toEqual(['bbb:dup'])
  })

  it('虚拟物品默认隐藏，includeVirtual 后可见（规格 3.6.13）', () => {
    expect(ids(corpus.search(q('仪式')))).toEqual([])
    // 同一份语料切换查询参数即可，不需要重建语料
    expect(ids(corpus.search(q('仪式', { includeVirtual: true })))).toEqual(['occultism:ritual_dummy/craft_matrix'])
    expect(corpus.size).toBe(LIBRARY.length)
  })

  it('virtual 标记为真、path 含 dummy/display/jei_、无任何显示名三种都判为虚拟物品', () => {
    const marked = mk({ id: 'mymod:shadow_gem', zh: '暗影宝石', en: 'Shadow Gem', virtual: true })
    const jei = mk({ id: 'mymod:jei_dummy/shown', zh: '展示用', en: 'Shown' })
    const nameless = mk({ id: 'mymod:nameless_thing', zh: '', en: '' })
    const real = mk({ id: 'mymod:real_gem', zh: '真宝石', en: 'Real Gem' })
    const c = buildSearchCorpus([marked, jei, nameless, real])
    // 语料含全部 4 条；默认查询只返回真实物品，显式要求时才出现虚拟物品
    expect(c.size).toBe(4)
    expect(ids(c.search(q('宝石')))).toEqual(['mymod:real_gem'])
    expect(ids(c.search(q('展示')))).toEqual([])
    expect(ids(c.search(q('展示', { includeVirtual: true })))).toEqual(['mymod:jei_dummy/shown'])
    expect(isVirtualItem(marked)).toBe(true)
    expect(isVirtualItem(jei)).toBe(true)
    expect(isVirtualItem(nameless)).toBe(true)
    expect(isVirtualItem(real)).toBe(false)
  })

  it('offset/limit 切片不影响 matched', () => {
    const all = corpus.search(q('diamond'))
    const page = corpus.search(q('diamond', { offset: 1, limit: 2 }))
    expect(page.matched).toBe(all.matched)
    expect(page.hits.length).toBe(2)
    expect(ids(page)).toEqual(ids(all).slice(1, 3))
    expect(corpus.search(q('diamond', { limit: 0 })).hits.length).toBe(0)
  })

  it('高亮 range 分别标注中文名/英文名/ID/拼音的命中位置', () => {
    const zh = corpus.search(q('钻石')).hits[0]
    expect(zh?.highlights).toContainEqual({ start: 0, end: 2, field: 'nameZh' })
    const sw = corpus.search(q('diam sw')).hits[0]
    expect(sw?.highlights).toContainEqual({ start: 0, end: 4, field: 'nameEn' })
    expect(sw?.highlights).toContainEqual({ start: 10, end: 14, field: 'id' })
    expect(sw?.highlights).toContainEqual({ start: 8, end: 10, field: 'nameEn' })
    expect(sw?.highlights).toContainEqual({ start: 18, end: 20, field: 'id' })
    const py = corpus.search(q('zuanshi')).hits.find((h) => h.item.id === 'minecraft:diamond')
    expect(py?.highlights).toContainEqual({ start: 0, end: 7, field: 'pyFull' })
    const ini = corpus.search(q('zs')).hits.find((h) => h.item.id === 'minecraft:diamond')
    expect(ini?.highlights).toContainEqual({ start: 0, end: 2, field: 'pyInitials' })
  })

  it('全角与多余空白不影响命中，未预计算拼音的记录自动补算', () => {
    expect(ids(searchItems(LIBRARY, q('ＤＩＡＭＯＮＤ')))).toContain('minecraft:diamond')
    const bare: ItemEntry = { ...LIBRARY[0]!, pyFull: [], pyInitials: [] }
    const r = searchItems([bare], q('zs'))
    expect(r.hits[0]?.item.id).toBe('minecraft:diamond')
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
  })
})

describe('searchCorpus 性能（规格 §五 41,000 条 / 16ms）', () => {
  const SYLLABLES = ['钻', '石', '金', '刚', '铁', '红', '青', '末', '影', '荧', '光', '矿', '块', '剑', '镐', '铀', '煤', '精', '英', '银']

  function bigLibrary(size: number): ItemEntry[] {
    const out: ItemEntry[] = []
    for (let i = 0; i < size; i++) {
      const zh = `${SYLLABLES[i % 20]}${SYLLABLES[(i * 7 + 3) % 20]}${SYLLABLES[(i * 13 + 11) % 20]}`
      const py = pinyinIndex(zh)
      out.push({
        id: `mod${i % 60}:item_${i}`,
        nameZh: zh,
        nameEn: `Item ${i}`,
        modId: `mod${i % 60}`,
        confidence: 'lang',
        verified: i % 3 !== 0,
        hasIcon: true,
        iconKey: null,
        pyFull: py.pyFull,
        pyInitials: py.pyInitials,
        virtual: false,
        hasRecipe: i % 5 === 0
      })
    }
    return out
  }

  it('单次查询耗时在预算内', () => {
    const big = buildSearchCorpus(bigLibrary(41000))
    expect(big.size).toBe(41000)
    const probes = ['zuanshi', 'zs', 'item_40000', '钻石', 'jgs', 'mod12', '', '石', 'a']
    for (const text of probes) big.search(q(text))
    let worst = 0
    for (const text of probes) worst = Math.max(worst, big.search(q(text)).elapsedMs)
    expect(worst, `实测 ${worst}ms，预算 ${PERF_BUDGET_MS}ms`).toBeLessThan(PERF_BUDGET_MS)
  })
})
