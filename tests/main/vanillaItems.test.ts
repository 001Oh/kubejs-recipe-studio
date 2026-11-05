/**
 * B120/D-07（T-07）：原版物品入索引 + 引用兜底 —— 合并层单元测试。
 *
 * 覆盖四条契约：
 * 1. 内置清单 1,435 条全量可枚举，`minecraft:emerald` 名为「绿宝石」、来源 vanilla、无图标；
 * 2. 合并优先级：mod 扫描结果 > 内置清单 > 引用占位；空名字会被内置清单补齐；
 * 3. 引用兜底：配方引用但无定义的 id 生成 `source:'referenced'` 占位，超过上限整批放弃；
 * 4. 缓存隔离：`scannedOnly` 只放行 mod 派生条目（items.json 保持纯 mod 口径的最后一道闸）。
 */
import { describe, expect, it } from 'vitest'
import type { ItemEntry, RecipeRecord } from '@shared/types'
import {
  enrichIndex,
  REFERENCED_LIMIT,
  resetVanillaCache,
  scannedOnly,
  VANILLA_LIST_VERSION,
  vanillaEntries
} from '@main/vanillaItems'

function item(id: string, overrides: Partial<ItemEntry> = {}): ItemEntry {
  const colon = id.indexOf(':')
  return {
    id,
    nameZh: '',
    nameEn: id.slice(colon + 1),
    modId: id.slice(0, colon),
    confidence: 'model',
    verified: false,
    hasIcon: false,
    iconKey: null,
    pyFull: [],
    pyInitials: [],
    virtual: false,
    hasRecipe: false,
    ...overrides
  }
}

function record(type: string, outputs: string[], inputs: string[]): RecipeRecord {
  return {
    uid: `data/test/${type}.json`,
    recipeId: type,
    type,
    outputs: outputs.map((id) => ({ id, count: 1, kind: 'item' })),
    inputs: inputs.map((id) => ({ id, count: 1, kind: 'item' })),
    source: 'datapack',
    sourcePath: `data/test/${type}.json`,
    partial: false
  }
}

describe('内置原版清单（vanillaEntries）', () => {
  it('清单版本 1.19.2、1435 条、emerald 是绿宝石', () => {
    resetVanillaCache()
    const entries = vanillaEntries()
    expect(VANILLA_LIST_VERSION).toBe('1.19.2')
    expect(entries).toHaveLength(1435)
    const emerald = entries.find((e) => e.id === 'minecraft:emerald')
    expect(emerald).toBeDefined()
    expect(emerald?.nameZh).toBe('绿宝石')
    expect(emerald?.nameEn).toBe('Emerald')
    expect(emerald?.source).toBe('vanilla')
    expect(emerald?.modId).toBe('minecraft')
    expect(emerald?.hasIcon).toBe(false)
    expect(emerald?.iconKey).toBeNull()
    expect(emerald?.verified).toBe(false)
  })

  it('中文名只认 CJK（116 批 A-3 口径）：TNT 的官方名就是「TNT」，落 nameEn、nameZh 留空', () => {
    const tnt = vanillaEntries().find((e) => e.id === 'minecraft:tnt')
    expect(tnt?.nameZh).toBe('')
    expect(tnt?.nameEn).toBe('TNT')
  })

  it('中文名条目带拼音索引（红石粉 → hongshifen），无名条目拼音为空', () => {
    const redstone = vanillaEntries().find((e) => e.id === 'minecraft:redstone')
    // 1.19.2 官方译名就是「红石粉」（item.minecraft.redstone）
    expect(redstone?.nameZh).toBe('红石粉')
    expect(redstone?.pyFull.length).toBeGreaterThan(0)
    expect(redstone?.pyFull[0]).toContain('hong')
    const barrier = vanillaEntries().find((e) => e.id === 'minecraft:barrier')
    expect(barrier?.nameZh).toBe('屏障')
    expect(barrier?.pyFull[0]).toContain('pingzhang')
  })

  it('每次调用返回同一份缓存（懒构建一次）', () => {
    const a = vanillaEntries()
    const b = vanillaEntries()
    expect(b).toBe(a)
    resetVanillaCache()
    expect(vanillaEntries()).not.toBe(a)
  })
})

describe('enrichIndex：合并优先级与 hasRecipe 回填', () => {
  it('空扫描 + 空配方：索引就是内置清单全量', () => {
    resetVanillaCache()
    const { items, report } = enrichIndex([], [])
    expect(items).toHaveLength(1435)
    expect(report.vanillaTotal).toBe(1435)
    expect(report.vanillaAdded).toBe(1435)
    expect(report.vanillaWithRecipe).toBe(0)
    expect(report.referencedAdded).toBe(0)
    expect(report.overflow).toBe(false)
  })

  it('扫描结果优先：mod 自带的 minecraft:emerald 保留其图标与名字来源', () => {
    resetVanillaCache()
    const modded = item('minecraft:emerald', { nameZh: '', nameEn: 'Emerald（模组重打包）', hasIcon: true, iconKey: 'abc' })
    const { items, report } = enrichIndex([modded], [])
    const emerald = items.find((e) => e.id === 'minecraft:emerald')
    // 条目本体来自扫描（有图标）；空 nameZh 被内置清单的「绿宝石」补上；非空 nameEn 不被覆盖
    expect(emerald?.hasIcon).toBe(true)
    expect(emerald?.iconKey).toBe('abc')
    expect(emerald?.nameZh).toBe('绿宝石')
    expect(emerald?.nameEn).toBe('Emerald（模组重打包）')
    expect(emerald?.source).toBeUndefined()
    // 被扫描结果覆盖的那条不计入新增
    expect(report.vanillaAdded).toBe(1434)
    expect(items.filter((i) => i.source === 'vanilla')).toHaveLength(1434)
  })

  it('hasRecipe 只认「被产出」：作为原料出现不算（驱动「只看有产出的物品」筛选）', () => {
    resetVanillaCache()
    const records = [record('minecraft:crafting_shaped', ['minecraft:emerald_block'], ['minecraft:emerald'])]
    const { items, report } = enrichIndex([], records)
    const emerald = items.find((e) => e.id === 'minecraft:emerald')
    const emeraldBlock = items.find((e) => e.id === 'minecraft:emerald_block')
    // emerald_block 是产物 → true；emerald 只是原料 → 仍 false（语义与 RecipeRecord 的产出链一致）
    expect(emeraldBlock?.hasRecipe).toBe(true)
    expect(emerald?.hasRecipe).toBe(false)
    const stone = items.find((e) => e.id === 'minecraft:stone')
    expect(stone?.hasRecipe).toBe(false)
    expect(report.vanillaWithRecipe).toBe(1)
  })

  it('同 id 多条配方的产出并集回填（多条记录不漏标）', () => {
    resetVanillaCache()
    const records = [
      record('minecraft:smelting', ['minecraft:glass'], ['minecraft:sand']),
      record('minecraft:crafting_shapeless', ['minecraft:dirt'], ['minecraft:grass_block'])
    ]
    const { items } = enrichIndex([], records)
    expect(items.find((e) => e.id === 'minecraft:glass')?.hasRecipe).toBe(true)
    expect(items.find((e) => e.id === 'minecraft:dirt')?.hasRecipe).toBe(true)
    // grass_block 只在 inputs 里 → 不算有产出
    expect(items.find((e) => e.id === 'minecraft:grass_block')?.hasRecipe).toBe(false)
  })
})

describe('引用兜底（source: referenced）', () => {
  it('配方引用但两层都没有的 id 生成占位条目，可搜索、名字路径可读', () => {
    resetVanillaCache()
    // somemod:widget 不在任何清单里，但配方把它当产物引用了
    const records = [record('test:machine', ['somemod:widget'], ['somemod:raw_widget'])]
    const { items, report } = enrichIndex([], records)
    const widget = items.find((e) => e.id === 'somemod:widget')
    expect(widget).toBeDefined()
    expect(widget?.source).toBe('referenced')
    expect(widget?.nameZh).toBe('')
    expect(widget?.nameEn).toBe('Widget')
    expect(widget?.hasIcon).toBe(false)
    // 被产出 → hasRecipe true
    expect(widget?.hasRecipe).toBe(true)
    // 只在原料侧的引用同样收录，但不是「有产出」
    const raw = items.find((e) => e.id === 'somemod:raw_widget')
    expect(raw?.source).toBe('referenced')
    expect(raw?.hasRecipe).toBe(false)
    expect(report.referencedAdded).toBe(2)
  })

  it('流体引用不算物品：只收 kind=item 的 IO', () => {
    resetVanillaCache()
    const rec: RecipeRecord = {
      uid: 'data/test/fluid.json',
      recipeId: 'fluid',
      type: 'test:machine',
      outputs: [],
      inputs: [{ id: 'minecraft:water', count: 1000, kind: 'fluid' }, { id: 'custom:oil', count: 1, kind: 'fluid' }],
      source: 'datapack',
      sourcePath: 'data/test/fluid.json',
      partial: false
    }
    const { items, report } = enrichIndex([], [rec])
    // minecraft:water 在内置清单里有（方块水），但这条引用是流体——不影响它的 vanilla 身份
    expect(items.find((e) => e.id === 'minecraft:water')?.source).toBe('vanilla')
    expect(items.find((e) => e.id === 'custom:oil')).toBeUndefined()
    expect(report.referencedAdded).toBe(0)
  })

  it('无命名空间前缀的引用直接丢弃', () => {
    resetVanillaCache()
    const rec: RecipeRecord = {
      uid: 'data/test/bad.json',
      recipeId: 'bad',
      type: 'test:machine',
      outputs: [{ id: 'no-colon-id', count: 1, kind: 'item' }],
      inputs: [],
      source: 'datapack',
      sourcePath: 'data/test/bad.json',
      partial: false
    }
    const { items, report } = enrichIndex([], [rec])
    expect(items.find((e) => e.id === 'no-colon-id')).toBeUndefined()
    expect(report.referencedAdded).toBe(0)
  })

  it('引用量超过上限：整批放弃（overflow=true，一条都不收）', () => {
    resetVanillaCache()
    const records: RecipeRecord[] = []
    for (let i = 0; i < REFERENCED_LIMIT + 10; i++) {
      records.push(record('test:machine', [], [`ghost:phantom_${i}`]))
    }
    const { items, report } = enrichIndex([], records)
    expect(report.overflow).toBe(true)
    expect(report.referencedAdded).toBe(0)
    expect(report.referencedConsidered).toBeGreaterThan(REFERENCED_LIMIT)
    // 整批放弃：连一条都没有
    expect(items.find((e) => e.id === 'ghost:phantom_0')).toBeUndefined()
    // 内置清单不受影响
    expect(items.find((e) => e.id === 'minecraft:emerald')).toBeDefined()
  })

  it('恰好在上限内：全部收录', () => {
    resetVanillaCache()
    const inputs: string[] = []
    for (let i = 0; i < REFERENCED_LIMIT; i++) inputs.push(`ghost:phantom_${i}`)
    const records: RecipeRecord[] = [
      {
        uid: 'data/test/many.json',
        recipeId: 'many',
        type: 'test:machine',
        outputs: [],
        inputs: inputs.map((id) => ({ id, count: 1, kind: 'item' })),
        source: 'datapack',
        sourcePath: 'data/test/many.json',
        partial: false
      }
    ]
    const { report } = enrichIndex([], records)
    expect(report.overflow).toBe(false)
    expect(report.referencedAdded).toBe(REFERENCED_LIMIT)
  })
})

describe('缓存隔离（scannedOnly）', () => {
  it('只放行 mod 派生条目，vanilla/referenced 一律不落盘', () => {
    const scanned = [item('mymod:ruby', { hasIcon: true }), item('othermod:thing')]
    const { items } = enrichIndex(scanned, [])
    const only = scannedOnly(items)
    expect(only.map((i) => i.id).sort()).toEqual(['mymod:ruby', 'othermod:thing'])
    expect(only.every((i) => i.source === undefined)).toBe(true)
    // 直接传入合成条目也一样被滤掉
    const mixed = [...scanned, ...vanillaEntries().slice(0, 3), item('ghost:x', { source: 'referenced' })]
    expect(scannedOnly(mixed).map((i) => i.id)).toEqual(['mymod:ruby', 'othermod:thing'])
  })
})
