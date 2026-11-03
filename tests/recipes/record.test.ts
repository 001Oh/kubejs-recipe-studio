import { describe, expect, it } from 'vitest'
import { buildRecord } from '@main/recipes/record'

/**
 * 回归：buildRecord 必须先取 JSON 自带的 type 再交给启发式。
 * 曾经把空 type 传进去，导致 295 jar 的真实包里所有配方都被标成 partial（32,788/32,890）。
 */
describe('配方摘要构造', () => {
  it('标准 shaped 配方：type 取自 JSON，且不是 partial', () => {
    const rec = buildRecord({
      uid: 'jar:a.jar#data/m/recipes/x.json',
      recipeId: 'm:x',
      type: '',
      source: 'jar',
      sourcePath: 'a.jar#data/m/recipes/x.json',
      text: JSON.stringify({
        type: 'minecraft:crafting_shaped',
        pattern: ['AA'],
        key: { A: { item: 'minecraft:oak_log' } },
        result: { item: 'minecraft:oak_planks', count: 4 }
      })
    })
    expect(rec.type).toBe('minecraft:crafting_shaped')
    expect(rec.partial).toBe(false)
    expect(rec.outputs.map((o) => o.id)).toContain('minecraft:oak_planks')
    expect(rec.inputs.map((i) => i.id)).toContain('minecraft:oak_log')
  })

  it('显式传入的 type 优先于 JSON（数据包条目按路径推断时用）', () => {
    const rec = buildRecord({
      uid: 'u',
      recipeId: 'm:x',
      type: 'create:mixing',
      source: 'datapack',
      sourcePath: 'p',
      text: JSON.stringify({ ingredients: [], results: [] })
    })
    expect(rec.type).toBe('create:mixing')
  })

  it('JSON 坏掉时保留 partial=true 而不是抛错', () => {
    const rec = buildRecord({
      uid: 'u',
      recipeId: 'm:x',
      type: '',
      source: 'jar',
      sourcePath: 'p',
      text: '{ broken'
    })
    expect(rec.partial).toBe(true)
    expect(rec.outputs).toEqual([])
  })
})
