import { describe, expect, it } from 'vitest'
import type { SlotValue } from '@shared/types'
import { EMPTY_SHAPE_ERROR, trimShape } from '@shared/shape'
import { formatCountPrefix, parseCountPrefix, readableFromPath } from '@shared/text'

const item = (id: string, count?: number): SlotValue => ({ kind: 'item', id, count })
const tag = (id: string): SlotValue => ({ kind: 'tag', id })

function board(rows: number, cols: number, entries: [number, number, SlotValue][]): (SlotValue | null)[] {
  const cells: (SlotValue | null)[] = Array.from({ length: rows * cols }, () => null)
  for (const [r, c, value] of entries) cells[r * cols + c] = value
  return cells
}

describe('trimShape 形状裁剪（规格 §五）', () => {
  it('全空网格拒绝生成并给出中文提示', () => {
    const r = trimShape(Array.from({ length: 9 }, () => null), 3, 3)
    expect(r).toEqual({ ok: false, error: EMPTY_SHAPE_ERROR })
    expect(r.ok === false && r.error).toBe('网格为空，无法生成有序合成')
  })

  it('单物品：裁到 1x1', () => {
    const r = trimShape(board(3, 3, [[1, 1, item('minecraft:diamond')]]), 3, 3)
    expect(r).toEqual({ ok: true, pattern: ['A'], key: { A: 'minecraft:diamond' }, rows: 1, cols: 1 })
  })

  it('满 3x3 且九格各不同：分配 A..I 九个字母', () => {
    const entries: [number, number, SlotValue][] = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) entries.push([r, c, item(`minecraft:slot_${r}${c}`)])
    const res = trimShape(board(3, 3, entries), 3, 3)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rows).toBe(3)
    expect(res.cols).toBe(3)
    expect(res.pattern).toEqual(['ABC', 'DEF', 'GHI'])
    expect(Object.keys(res.key)).toHaveLength(9)
    expect(res.key.A).toBe('minecraft:slot_00')
    expect(res.key.I).toBe('minecraft:slot_22')
  })

  it('相同物品复用同一字母，不同数量另分字母', () => {
    const res = trimShape(board(3, 3, [[0, 0, item('minecraft:diamond')], [0, 2, item('minecraft:diamond')], [2, 0, item('minecraft:diamond', 2)]]), 3, 3)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.pattern).toEqual(['A A', '   ', 'B  '])
    expect(res.rows).toBe(3)
    expect(res.key).toEqual({ A: 'minecraft:diamond', B: '2x minecraft:diamond' })
  })

  it('空行空列完全移除，包围盒内部的空洞保留为空格', () => {
    const res = trimShape(board(3, 3, [[1, 1, item('minecraft:stick')], [2, 2, item('minecraft:iron_ingot')]]), 3, 3)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res).toEqual({
      ok: true,
      pattern: ['A ', ' B'],
      key: { A: 'minecraft:stick', B: 'minecraft:iron_ingot' },
      rows: 2,
      cols: 2
    })

    const hollow = trimShape(board(3, 3, [[0, 0, item('minecraft:dirt')], [0, 2, item('minecraft:dirt')], [2, 0, item('minecraft:dirt')], [2, 2, item('minecraft:dirt')]]), 3, 3)
    expect(hollow.ok === true && hollow.pattern).toEqual(['A A', '   ', 'A A'])
    expect(hollow.ok === true && hollow.rows).toBe(3)
  })

  it('tag 输出 #ns:tag，物品补默认命名空间', () => {
    const res = trimShape(board(3, 3, [[0, 0, tag('c:ingots')], [0, 1, item('oak_log')]]), 3, 3)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.pattern).toEqual(['AB'])
    expect(res.key).toEqual({ A: '#c:ingots', B: 'minecraft:oak_log' })
  })

  it('9x9（Create 机械合成）只占 5x5 内容时裁到 5x5，与 3x3 走同一份逻辑', () => {
    const entries: [number, number, SlotValue][] = []
    entries.push([2, 2, item('minecraft:m2')])
    for (let r = 3; r < 7; r++) entries.push([r, 2, item(`minecraft:v${r}`)])
    for (let c = 3; c < 7; c++) entries.push([2, c, item(`minecraft:m${c}`)])
    const res = trimShape(board(9, 9, entries), 9, 9)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.rows).toBe(5)
    expect(res.cols).toBe(5)
    expect(res.pattern[0]).toBe('ABCDE')
    expect(res.pattern[1]).toBe('F    ')
    expect(Object.keys(res.key)).toHaveLength(9)
  })

  it('物品种类超过 26 个字母上限时拒绝', () => {
    const entries: [number, number, SlotValue][] = []
    for (let i = 0; i < 81; i++) entries.push([Math.floor(i / 9), i % 9, item(`minecraft:x${i}`)])
    const res = trimShape(board(9, 9, entries), 9, 9)
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.error).toContain('26')
  })

  it('尺寸与长度不匹配、超出 GRID_MAX_SIZE 都返回错误而不是异常', () => {
    expect(trimShape([], 3, 3).ok).toBe(false)
    expect(trimShape(Array.from({ length: 8 }, () => null), 3, 3).ok).toBe(false)
    expect(trimShape(Array.from({ length: 100 }, () => null), 10, 10).ok).toBe(false)
    expect(trimShape(Array.from({ length: 9 }, () => null), 0, 3).ok).toBe(false)
    expect(trimShape(Array.from({ length: 9 }, () => null), 2.5, 3).ok).toBe(false)
  })

  it('id 为空串或空白的槽位按空格处理', () => {
    const res = trimShape(board(3, 3, [[0, 0, item('')], [1, 1, item('   ')], [2, 2, item('minecraft:glass')]]), 3, 3)
    expect(res.ok === true && res.pattern).toEqual(['A'])
    expect(res.ok === true && res.rows).toBe(1)
  })
})

describe('text 助手（规格 3.4 数量前缀 / 3.6.13 名称回退）', () => {
  it('parseCountPrefix 解析 Nx 前缀，count 为 1 时不要求前缀', () => {
    expect(parseCountPrefix('2x minecraft:oak_planks')).toEqual({ count: 2, id: 'minecraft:oak_planks' })
    expect(parseCountPrefix('4x foo')).toEqual({ count: 4, id: 'foo' })
    expect(parseCountPrefix('12X  minecraft:torch')).toEqual({ count: 12, id: 'minecraft:torch' })
    expect(parseCountPrefix('minecraft:torch')).toBeNull()
    expect(parseCountPrefix('0x minecraft:torch')).toBeNull()
    expect(parseCountPrefix('2x')).toBeNull()
    expect(parseCountPrefix('x minecraft:torch')).toBeNull()
  })

  it('formatCountPrefix 是 parseCountPrefix 的逆运算', () => {
    expect(formatCountPrefix('minecraft:diamond', 1)).toBe('minecraft:diamond')
    expect(formatCountPrefix('minecraft:diamond', 4)).toBe('4x minecraft:diamond')
    expect(parseCountPrefix(formatCountPrefix('minecraft:diamond', 3))).toEqual({ count: 3, id: 'minecraft:diamond' })
  })

  it('readableFromPath：下划线转空格、首字母大写、/ 子路径取本体', () => {
    expect(readableFromPath('oak_planks')).toBe('Oak planks')
    expect(readableFromPath('minecraft:oak_planks')).toBe('Oak planks')
    expect(readableFromPath('ritual_dummy/craft_dimensional_matrix')).toBe('Craft dimensional matrix')
    expect(readableFromPath('AE2')).toBe('AE2')
    expect(readableFromPath('')).toBe('')
    expect(readableFromPath('minecraft:__  __')).toBe('')
  })
})
