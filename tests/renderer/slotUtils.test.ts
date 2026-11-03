import { describe, expect, it } from 'vitest'
import {
  clampCount,
  countBadge,
  formatChance,
  parseSlotInput,
  registryAbbr,
  slotLabel,
  slotTitle
} from '@renderer/store/slotUtils'

describe('槽位输入解析', () => {
  it('数量前缀 2x', () => {
    expect(parseSlotInput('2x minecraft:oak_planks')).toEqual({ kind: 'item', id: 'minecraft:oak_planks', count: 2 })
  })

  it('无数量前缀时不塞 count=1 之外的字段', () => {
    expect(parseSlotInput('minecraft:diamond')).toEqual({ kind: 'item', id: 'minecraft:diamond', count: 1 })
  })

  it('# 前缀识别为标签', () => {
    expect(parseSlotInput('#forge:ingots/iron')?.kind).toBe('tag')
    expect(slotLabel(parseSlotInput('#forge:ingots/iron'))).toBe('#forge:ingots/iron')
  })

  it('空输入返回 null', () => {
    expect(parseSlotInput('   ')).toBeNull()
  })

  it('非法 ID 不抛错，按原样保留便于用户继续编辑', () => {
    expect(parseSlotInput('not an id')).toEqual({ kind: 'item', id: 'not an id', count: 1 })
  })

  it('流体走 fallback kind', () => {
    expect(parseSlotInput('minecraft:water', 'fluid')?.kind).toBe('fluid')
  })
})

describe('徽章与显示', () => {
  it('数量为 1 不显示徽章（规格 3.9.4）', () => {
    expect(countBadge({ kind: 'item', id: 'a:b', count: 1 })).toBeNull()
    expect(countBadge({ kind: 'item', id: 'a:b', count: 4 })).toBe('4')
  })

  it('流体与注册表用量走 amount', () => {
    expect(countBadge({ kind: 'fluid', id: 'a:b', amount: 500 })).toBe('500')
    expect(countBadge({ kind: 'registry', id: 'a:b', amount: 20 })).toBe('20')
    expect(countBadge({ kind: 'registry', id: 'a:b' })).toBeNull()
  })

  it('概率显示为百分比，1 视为必然不显示', () => {
    expect(formatChance(0.2)).toBe('20%')
    expect(formatChance(0.07)).toBe('7%')
    expect(formatChance(1)).toBeNull()
    expect(formatChance(undefined)).toBeNull()
  })

  it('tooltip 含中文名 / ID / 数量 / mB / 概率', () => {
    const text = slotTitle({ kind: 'fluid', id: 'minecraft:water', amount: 500, chance: 0.5 }, '水')
    expect(text).toContain('水')
    expect(text).toContain('minecraft:water')
    expect(text).toContain('500 mB')
    expect(text).toContain('50%')
    expect(slotTitle(null)).toBe('空槽位')
  })
})

describe('注册表缩写角标', () => {
  it('四类已知注册表 + 未知兜底 REG', () => {
    expect(registryAbbr('mekanism:infuse_type')).toBe('INF')
    expect(registryAbbr('mekanism:gas')).toBe('GAS')
    expect(registryAbbr('mekanism:slurry')).toBe('SLR')
    expect(registryAbbr('mekanism:pigment')).toBe('PGM')
    expect(registryAbbr('some:other')).toBe('REG')
    expect(registryAbbr(undefined)).toBe('REG')
  })
})

describe('数量夹取', () => {
  it('越界与非有限值都夹到合法区间', () => {
    expect(clampCount(0)).toBe(1)
    expect(clampCount(999)).toBe(64)
    expect(clampCount(3.6)).toBe(4)
    expect(clampCount(Number.NaN)).toBe(1)
    expect(clampCount(200, 1, 1024)).toBe(200)
  })
})
