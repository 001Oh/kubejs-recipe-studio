/**
 * 形状裁剪：规格 §五 要求 3×3 与 9×9 共用同一份代码。
 * 这里既直接测 `trimShape`，也通过发射器验证两种尺寸走的是同一个函数（同一分支、无尺寸特判）。
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_SHAPE_ERROR, trimShape } from '../../src/shared/shape'
import { emitScript } from '../../src/main/codegen/emitScript'
import { CREATED_AT, emptyGrid, field, modpack, schema, statementsOf, sv, workbench } from './helpers'

const SUGAR = 'kubejs-sugar' as const
const shapedSchema = schema({
  id: 'minecraft:crafting_shaped',
  layoutKind: 'shaped',
  emitTarget: 'event.shaped',
  outputs: [field('result', 'item')],
  channel: SUGAR
})

describe('trimShape：最小包围盒', () => {
  it('3×3 里左上 2×1 竖条 → 裁成 2×1', () => {
    const grid = emptyGrid(3, 3)
    grid[3] = sv('item', 'minecraft:oak_log')
    grid[6] = sv('item', 'minecraft:oak_log')
    const shape = trimShape(grid, 3, 3)
    if (!shape.ok) throw new Error('裁剪失败')
    expect(shape.pattern).toEqual(['A', 'A'])
    expect(shape.key).toEqual({ A: 'minecraft:oak_log' })
    expect(shape.rows).toBe(2)
    expect(shape.cols).toBe(1)
  })

  it('9×9 同一份代码：中心区域裁成 2×2（行等长，空洞补空格）', () => {
    const grid = emptyGrid(9, 9)
    grid[31] = sv('item', 'minecraft:iron_ingot')
    grid[32] = sv('tag', 'forge:ingots/steel')
    grid[40] = sv('item', 'minecraft:iron_ingot', { count: 2 })
    const shape = trimShape(grid, 9, 9)
    if (!shape.ok) throw new Error('裁剪失败')
    expect(shape.pattern).toEqual(['AB', 'C '])
    expect(shape.rows).toBe(2)
    expect(shape.cols).toBe(2)
    expect(shape.key).toEqual({
      A: 'minecraft:iron_ingot',
      B: '#forge:ingots/steel',
      C: '2x minecraft:iron_ingot'
    })
  })

  it('内部空洞保留为空格，行宽一致（不整行删除）', () => {
    const grid = emptyGrid(3, 3)
    grid[0] = sv('item', 'minecraft:redstone')
    grid[2] = sv('item', 'minecraft:redstone')
    const shape = trimShape(grid, 3, 3)
    if (!shape.ok) throw new Error('裁剪失败')
    expect(shape.pattern).toEqual(['A A'])
    expect(shape.rows).toBe(1)
    expect(shape.cols).toBe(3)
  })

  it('key 只保留实际使用的符号，同物品同数量复用同一字母', () => {
    const grid = emptyGrid(3, 3)
    grid[0] = sv('item', 'minecraft:oak_planks')
    grid[1] = sv('item', 'minecraft:oak_planks')
    grid[4] = sv('item', 'minecraft:iron_ingot')
    const shape = trimShape(grid, 3, 3)
    if (!shape.ok) throw new Error('裁剪失败')
    expect(Object.keys(shape.key)).toEqual(['A', 'B'])
    expect(shape.pattern).toEqual(['AA', ' B'])
  })

  it('全空网格拒绝生成', () => {
    const shape = trimShape(emptyGrid(3, 3), 3, 3)
    expect(shape.ok).toBe(false)
    if (!shape.ok) expect(shape.error).toBe(EMPTY_SHAPE_ERROR)
  })

  it('非法尺寸与长度不匹配都拒绝', () => {
    expect(trimShape(emptyGrid(3, 3), 0, 3).ok).toBe(false)
    expect(trimShape(emptyGrid(3, 3), 10, 10).ok).toBe(false)
    const short = emptyGrid(3, 3).slice(0, 6)
    expect(trimShape(short, 3, 3).ok).toBe(false)
  })
})

describe('发射器复用同一裁剪逻辑', () => {
  it('9×9 生成 2×2 pattern 语句', () => {
    const grid = emptyGrid(9, 9)
    grid[31] = sv('item', 'minecraft:iron_ingot')
    grid[32] = sv('item', 'minecraft:redstone')
    grid[40] = sv('item', 'minecraft:redstone')
    const bench = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 9,
      gridCols: 9,
      values: { grid, result: sv('item', 'create:crate', { count: 3 }) }
    })
    expect(statementsOf(emitScript(shapedSchema, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      [
        "  event.shaped('3x create:crate', [",
        "    'AB',",
        "    'B '",
        "  ], { A: 'minecraft:iron_ingot', B: 'minecraft:redstone' })"
      ].join('\n')
    )
  })

  it('空网格时发射器给出可定位的错误', () => {
    const bench = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 3,
      gridCols: 3,
      values: { grid: emptyGrid(3, 3), result: sv('item', 'minecraft:oak_planks') }
    })
    const emit = emitScript(shapedSchema, bench, SUGAR, modpack(), CREATED_AT)
    expect(emit.code).toBe('')
    expect(emit.error).toContain('网格为空')
  })
})
