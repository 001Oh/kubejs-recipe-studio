/**
 * 第 116 批 B2：形状聚合的纯函数用例（≥6 条）。
 * 每条都对着「规则 → 输出」断言，避免把判定逻辑留成黑箱。
 */
import { describe, expect, it } from 'vitest'
import { classifyValue, inferShapes, inferTypeShape, isGridCandidate, type TypeShape } from '../../src/main/recipes/inferShapes'
import type { ShapeSampleBatch } from '../../src/main/recipes/shapeSampler'

const item = (id: string) => ({ item: id })
const fluid = (id: string, amount: number) => ({ fluid: id, amount })

function fieldsOf(shape: TypeShape): Record<string, TypeShape['fields'][number]> {
  return Object.fromEntries(shape.fields.map((f) => [f.key, f]))
}

describe('classifyValue：五条判定规则', () => {
  it('1) 对象含 item / id / tag → item', () => {
    expect(classifyValue(item('minecraft:iron'))).toBe('item')
    expect(classifyValue({ id: 'minecraft:iron' })).toBe('item')
    expect(classifyValue({ tag: 'forge:ingots' })).toBe('item')
  })

  it('2) 对象含 amount / fluid / gas → fluid', () => {
    expect(classifyValue(fluid('minecraft:water', 1000))).toBe('fluid')
    expect(classifyValue({ amount: 250 })).toBe('fluid')
    expect(classifyValue({ gas: 'mekanism:hydrogen' })).toBe('fluid')
  })

  it('3) 数组且元素全是 item 形状 → items；混杂元素 → array', () => {
    expect(classifyValue([item('a'), item('b')])).toBe('items')
    expect(classifyValue([item('a'), 'x'])).toBe('array')
    expect(classifyValue([])).toBe('array')
  })

  it('5) 数值 / 布尔 / 字符串 / 其它对象 → number / boolean / string / object', () => {
    expect(classifyValue(3)).toBe('number')
    expect(classifyValue(true)).toBe('boolean')
    expect(classifyValue(false)).toBe('boolean')
    expect(classifyValue('abc')).toBe('string')
    expect(classifyValue({ foo: 1 })).toBe('object')
  })

  it('4) key + pattern 展开正好 9 格 → 网格候选；8 格 / 缺 key 都不算', () => {
    expect(isGridCandidate({ type: 'minecraft:crafting_shaped', key: { A: item('a') }, pattern: ['AAA', 'A A', 'AAA'] })).toBe(true)
    expect(isGridCandidate({ key: { A: item('a') }, pattern: ['AA', 'AA'] })).toBe(false)
    expect(isGridCandidate({ pattern: ['AAA', 'AAA', 'AAA'] })).toBe(false)
  })
})

describe('inferTypeShape：聚合口径', () => {
  it('presence = 出现比例；缺席的 key 不参与 majority', () => {
    const shape = inferTypeShape('mod:a', [
      { type: 'mod:a', ingredient: item('a'), count: 2 },
      { type: 'mod:a', ingredient: item('b') }
    ])
    const f = fieldsOf(shape)
    expect(f.ingredient.presence).toBe(1)
    expect(f.count.presence).toBe(0.5)
    expect(f.ingredient.valueKind).toBe('item')
    expect(f.count.valueKind).toBe('number')
    expect(shape.sampleCount).toBe(2)
  })

  it('multiple / elementShape：数组字段标出来并给出元素形状', () => {
    const shape = inferTypeShape('mod:b', [
      { type: 'mod:b', ingredients: [item('a'), item('b')] },
      { type: 'mod:b', ingredients: [item('c')] }
    ])
    const f = fieldsOf(shape).ingredients
    expect(f.multiple).toBe(true)
    expect(f.valueKind).toBe('items')
    expect(f.elementShape?.valueKind).toBe('item')
    expect(f.elementShape?.samples).toHaveLength(2)
  })

  it('samples 最多 3 个真实值，不做截断/伪造', () => {
    const shape = inferTypeShape('mod:c', Array.from({ length: 6 }, (_, i) => ({ type: 'mod:c', n: i })))
    const f = fieldsOf(shape).n
    expect(f.samples).toEqual([0, 1, 2])
    expect(f.valueKind).toBe('number')
  })

  it('多批样本按 type 归并，且每 type 最多 20 条', () => {
    const batches: ShapeSampleBatch[] = Array.from({ length: 3 }, (_, b) => ({
      type: 'mod:d',
      samples: Array.from({ length: 10 }, (_, i) => ({ type: 'mod:d', n: b * 10 + i }))
    }))
    batches.push({ type: 'mod:e', samples: [{ type: 'mod:e', flag: true }] })
    const shapes = inferShapes(batches)
    expect(Object.keys(shapes)).toEqual(['mod:d', 'mod:e'])
    expect(shapes['mod:d'].sampleCount).toBe(20)
    expect(shapes['mod:e'].fields.find((f) => f.key === 'flag')?.valueKind).toBe('boolean')
  })

  it('空样本 / 非对象样本不产出字段，但类型仍登记（供比例统计）', () => {
    expect(inferTypeShape('mod:f', []).fields).toEqual([])
    expect(inferTypeShape('mod:g', [null, 3, 'x']).sampleCount).toBe(0)
    expect(inferShapes([])).toEqual({})
  })

  it('网格候选在类型层标出，字段层不擅自改写 pattern', () => {
    const shape = inferTypeShape('minecraft:crafting_shaped', [
      { type: 'minecraft:crafting_shaped', key: { A: item('a') }, pattern: ['A A', 'AAA', 'A A'], result: item('b') }
    ])
    expect(shape.gridCandidate).toBe(true)
    expect(fieldsOf(shape).pattern.valueKind).toBe('array')
    expect(fieldsOf(shape).result.valueKind).toBe('item')
  })
})
