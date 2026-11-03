import { describe, expect, it } from 'vitest'
import type { ItemEntry } from '@shared/types'
import { buildSearchCorpus, isVirtualItem, type SearchQuerySpec } from '@shared/search'
import { pinyinIndex } from '@shared/pinyin'

/**
 * 虚拟物品「查询期过滤」的回归测试（2026-10-31 决策）：
 * 语料保存全部物品，显示与否只看查询参数 includeVirtual；切换它不重扫、不重建、不作废缓存。
 */
function mk(id: string, zh: string, en: string, extra: Partial<ItemEntry> = {}): ItemEntry {
  const py = pinyinIndex(zh)
  return {
    id,
    nameZh: zh,
    nameEn: en,
    modId: id.split(':')[0] ?? 'minecraft',
    confidence: 'lang',
    verified: true,
    hasIcon: true,
    iconKey: null,
    pyFull: py.pyFull,
    pyInitials: py.pyInitials,
    virtual: false,
    hasRecipe: false,
    ...extra
  }
}

const ITEMS: ItemEntry[] = [
  mk('minecraft:diamond', '钻石', 'Diamond', { hasRecipe: true }),
  mk('minecraft:diamond_sword', '钻石剑', 'Diamond Sword'),
  mk('create:diamond_dust', '金刚石', 'Industrial Diamond', { hasRecipe: true }),
  mk('occultism:ritual_dummy/craft_matrix', '仪式矩阵', 'Ritual Matrix', { virtual: true }),
  mk('mymod:jei_dummy/shown', '展示用', 'Shown'),
  mk('mymod:shadow_gem', '暗影宝石', 'Shadow Gem', { virtual: true }),
  mk('mymod:nameless_thing', '', '')
]

function q(text: string, extra: Partial<SearchQuerySpec> = {}): SearchQuerySpec {
  return { text, offset: 0, limit: 50, favorites: new Set<string>(), ...extra }
}

const corpus = buildSearchCorpus(ITEMS)
const ids = (r: { hits: { item: ItemEntry }[] }): string[] => r.hits.map((h) => h.item.id)

describe('查询期虚拟物品过滤', () => {
  it('① 关闭显示：结果里不出现虚拟物品，但语料仍含全量', () => {
    const off = corpus.search(q('', { includeVirtual: false }))
    expect(ids(off)).not.toContain('occultism:ritual_dummy/craft_matrix')
    expect(ids(off)).not.toContain('mymod:jei_dummy/shown')
    expect(ids(off)).not.toContain('mymod:shadow_gem')
    // 不传该参数等价于关闭
    expect(ids(corpus.search(q('')))).toEqual(ids(off))
    // 语料没有因显示设置丢条目
    expect(corpus.size).toBe(ITEMS.length)
  })

  it('② 开启显示：同一查询立刻能找到虚拟物品', () => {
    expect(ids(corpus.search(q('仪式')))).toEqual([])
    expect(ids(corpus.search(q('仪式', { includeVirtual: true })))).toEqual(['occultism:ritual_dummy/craft_matrix'])
    // 空白查询下开启显示会多出三条虚拟物品，其余不变
    const on = ids(corpus.search(q('', { includeVirtual: true })))
    expect(on).toContain('mymod:shadow_gem')
    expect(on.length).toBe(ITEMS.length)
  })

  it('③④ 切换开关不重扫、不重建语料：同一个实例两种参数都能查', () => {
    // 只建了一次语料；两次查询都发生在同一个对象上，语料大小不变
    const before = corpus.size
    corpus.search(q('钻石'))
    corpus.search(q('钻石', { includeVirtual: true }))
    corpus.search(q('钻石', { includeVirtual: false }))
    expect(corpus.size).toBe(before)
    expect(before).toBe(ITEMS.length)
  })

  it('⑤ 收藏 / 模组 / 拼音 / 文本条件在两种设置下都正确', () => {
    const fav = new Set(['mymod:shadow_gem'])
    // 收藏过滤：虚拟物品只有在允许显示时才出现
    expect(ids(corpus.search(q('', { onlyFavorites: true, favorites: fav })))).toEqual([])
    expect(ids(corpus.search(q('', { onlyFavorites: true, favorites: fav, includeVirtual: true })))).toEqual([
      'mymod:shadow_gem'
    ])
    // 模组过滤与文本、拼音
    expect(ids(corpus.search(q('diamond', { modId: 'create' })))).toEqual(['create:diamond_dust'])
    // 全拼是前缀匹配：钻石( zuanshi ) 与 钻石剑( zuanshijian ) 都命中，按 ID 字典序
    expect(ids(corpus.search(q('zuanshi')))).toEqual(['minecraft:diamond', 'minecraft:diamond_sword'])
    expect(ids(corpus.search(q('jgs')))).toEqual(['create:diamond_dust'])
    expect(ids(corpus.search(q('钻石剑')))).toEqual(['minecraft:diamond_sword'])
    // 复合：模组 + 虚拟开关同时生效
    expect(ids(corpus.search(q('', { modId: 'occultism' })))).toEqual([])
    expect(ids(corpus.search(q('', { modId: 'occultism', includeVirtual: true })))).toEqual([
      'occultism:ritual_dummy/craft_matrix'
    ])
  })

  it('⑥ 反复切换不残留旧过滤结果', () => {
    const first = corpus.search(q('钻石'))
    corpus.search(q('钻石', { includeVirtual: true }))
    const back = corpus.search(q('钻石'))
    expect(ids(back)).toEqual(ids(first))
    expect(back.matched).toBe(first.matched)
  })

  it('⑦ 重启后从缓存重建语料：两种设置结果与重启前一致', () => {
    // 模拟「从 items.json 读回同一份物品再建语料」：内容等价、对象全新
    const rebuilt = buildSearchCorpus(ITEMS.map((item) => ({ ...item })))
    expect(rebuilt.size).toBe(corpus.size)
    for (const includeVirtual of [false, true]) {
      expect(ids(rebuilt.search(q('仪式', { includeVirtual })))).toEqual(
        ids(corpus.search(q('仪式', { includeVirtual })))
      )
      expect(ids(rebuilt.search(q('diamond', { includeVirtual })))).toEqual(
        ids(corpus.search(q('diamond', { includeVirtual })))
      )
    }
  })

  it('虚拟属性缺失或为 false 时的判定规则是确定的', () => {
    const noField = { ...mk('mymod:display_case', '展示柜', 'Display Case') } as ItemEntry
    delete (noField as { virtual?: boolean }).virtual
    // 路径含 display → 判为虚拟；显式 true 也照旧
    expect(isVirtualItem(noField)).toBe(true)
    expect(isVirtualItem(mk('mymod:real_gem', '真宝石', 'Real Gem'))).toBe(false)
    expect(isVirtualItem(mk('mymod:shadow_gem', '暗影宝石', 'Shadow Gem', { virtual: true }))).toBe(true)
    // 未标记 virtual 的条目进入语料后，默认查询同样被过滤
    const c = buildSearchCorpus([noField, mk('mymod:real_gem', '真宝石', 'Real Gem')])
    expect(ids(c.search(q('柜')))).toEqual([])
    expect(ids(c.search(q('柜', { includeVirtual: true })))).toEqual(['mymod:display_case'])
  })
})

describe('查询期过滤的性能开销', () => {
  it('41,000 条（含 2,050 条虚拟）两种设置下单次查询都在预算内', () => {
    const big: ItemEntry[] = []
    for (let i = 0; i < 41000; i++) {
      const virtual = i % 20 === 0
      big.push(
        mk(`bench${i % 40}:item_${i}`, `测试物品${i}`, `Bench Item ${i}`, {
          virtual,
          hasRecipe: i % 3 === 0
        })
      )
    }
    const started = performance.now()
    const bigCorpus = buildSearchCorpus(big)
    const buildMs = performance.now() - started
    expect(bigCorpus.size).toBe(41000)

    const measure = (includeVirtual: boolean, text: string): { median: number; worst: number } => {
      const samples: number[] = []
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now()
        const r = bigCorpus.search(q(text, { includeVirtual, limit: 50 }))
        samples.push(performance.now() - t0)
        expect(r.total).toBe(41000)
      }
      // 前 3 次当 warm-up 丢弃，取中位数与最坏值
      const kept = samples.slice(3).sort((a, b) => a - b)
      return { median: kept[Math.floor(kept.length / 2)] ?? 0, worst: kept[kept.length - 1] ?? 0 }
    }
    // 先各跑一次热身，避免把 JIT 冷启动算进「关闭显示」那一档
    measure(false, 'item_40000')
    measure(true, 'item_40000')
    const off = measure(false, 'item_40000')
    const on = measure(true, 'item_40000')
    const wideOff = measure(false, 'stone')
    const wideOn = measure(true, 'stone')
    console.info(
      `[perf] build=${buildMs.toFixed(1)}ms 窄查询 off=${off.median.toFixed(2)}/${off.worst.toFixed(2)}ms ` +
        `on=${on.median.toFixed(2)}/${on.worst.toFixed(2)}ms（中位/最坏）` +
        ` 宽查询 off=${wideOff.median.toFixed(2)}ms on=${wideOn.median.toFixed(2)}ms`
    )
    for (const s of [off, on, wideOff, wideOn]) expect(s.worst).toBeLessThan(16)
  })
})
