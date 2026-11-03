import { describe, expect, it } from 'vitest'
import type { NormalizedRecipe, NormalizedValue } from '@shared/schemaModel'
import { denormalizeRecipe, normalizeRecipe } from '@shared/normalize'
import { PC2_SCHEMAS, pc2Opened, pc2samples, type Pc2Key } from './pc2Fixtures'

function normalizedFor(key: Pc2Key): NormalizedRecipe {
  return pc2Opened(key).normalized as NormalizedRecipe
}

function clone(n: NormalizedRecipe): NormalizedRecipe {
  return JSON.parse(JSON.stringify(n)) as NormalizedRecipe
}

function slotOf(n: NormalizedRecipe, key: string): NormalizedValue {
  const value = n.slots.find((s) => s.key === key)?.value
  if (!value) throw new Error(`missing slot ${key}`)
  return value
}

describe('P-C2 crafting_shapeless（真实样本 alltheores 黄铜粉）', () => {
  it('输入数量/顺序/标签/产物与 category 未建模字段', () => {
    const opened = pc2Opened('shapelessBrass')
    const n = opened.normalized as NormalizedRecipe
    const ingredients = slotOf(n, 'ingredients')
    expect(ingredients.kind).toBe('list')
    if (ingredients.kind !== 'list') throw new Error('not list')
    expect(ingredients.of).toHaveLength(4)
    expect(ingredients.of[0]).toMatchObject({ kind: 'item', id: 'alltheores:copper_dust' })
    expect(ingredients.of[1]).toMatchObject({ kind: 'item', id: 'alltheores:copper_dust' })
    expect(ingredients.of[2]).toMatchObject({ kind: 'item', id: 'alltheores:copper_dust' })
    expect(ingredients.of[3]).toMatchObject({ kind: 'tag', id: 'forge:dusts/zinc' })
    expect(slotOf(n, 'result')).toMatchObject({ kind: 'item', id: 'alltheores:brass_dust', count: { raw: 4 } })
    expect(n.unknowns.map((u) => u.path)).toContain('$.category')
    expect(n.partial.reasons).toContain('unclaimed-keys')
    expect(opened.diagnostics).toEqual([])
  })

  it('未编辑反解 = 原始 JSON；改一个材料后其余顺序/标签/产物/category 不变', () => {
    const raw = pc2samples.shapelessBrass.json
    const schema = PC2_SCHEMAS['minecraft:crafting_shapeless']
    const n = normalizedFor('shapelessBrass')
    const clean = denormalizeRecipe(n, schema, { dirtyFields: [] })
    expect(clean).toEqual({ kind: 'json', json: raw })

    const edited = clone(n)
    const ingredients = slotOf(edited, 'ingredients')
    if (ingredients.kind !== 'list') throw new Error('not list')
    ingredients.of[1] = { kind: 'item', id: 'minecraft:emerald', asObject: true }
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['ingredients'] })
    expect(out.kind).toBe('json')
    if (out.kind !== 'json') return
    const json = out.json as {
      ingredients: unknown[]
      result: unknown
      category: unknown
    }
    expect(json.ingredients).toHaveLength(4)
    expect(json.ingredients[0]).toEqual({ item: 'alltheores:copper_dust' })
    expect(json.ingredients[1]).toEqual({ item: 'minecraft:emerald' })
    expect(json.ingredients[2]).toEqual({ item: 'alltheores:copper_dust' })
    expect(json.ingredients[3]).toEqual({ tag: 'forge:dusts/zinc' })
    expect(json.result).toEqual(raw.result)
    expect(json.category).toBe('misc')
  })
})

describe('P-C2 create:mixing（真实样本 fluix / tea）', () => {
  it('fluix：tag/item/fluid(amount+nbt)/count，conditions 未建模', () => {
    const n = normalizedFor('mixingFluix')
    const ingredients = slotOf(n, 'ingredients')
    if (ingredients.kind !== 'list') throw new Error('not list')
    expect(ingredients.of).toHaveLength(4)
    expect(ingredients.of[0]).toMatchObject({ kind: 'tag', id: 'forge:dusts/redstone' })
    expect(ingredients.of[1]).toMatchObject({ kind: 'item', id: 'ae2:charged_certus_quartz_crystal' })
    expect(ingredients.of[3]).toMatchObject({
      kind: 'fluid',
      id: 'minecraft:water',
      amount: { raw: 250 },
      nbt: {}
    })
    const results = slotOf(n, 'results')
    if (results.kind !== 'list') throw new Error('not list')
    expect(results.of[0]).toMatchObject({ kind: 'item', id: 'ae2:fluix_crystal', count: { raw: 2 } })
    expect(n.unknowns.map((u) => u.path)).toContain('$.conditions')
    expect(n.partial.reasons).toContain('ambient-conditions')
    const schema = PC2_SCHEMAS['create:mixing']
    expect(denormalizeRecipe(n, schema, { dirtyFields: [] })).toEqual({ kind: 'json', json: pc2samples.mixingFluix.json })
  })

  it('fluix：只改产物数量，输入（含流体 nbt）与 conditions 逐值保留', () => {
    const raw = pc2samples.mixingFluix.json
    const schema = PC2_SCHEMAS['create:mixing']
    const edited = clone(normalizedFor('mixingFluix'))
    const results = slotOf(edited, 'results')
    if (results.kind !== 'list') throw new Error('not list')
    results.of[0] = { ...(results.of[0] as object), count: { raw: 3, numeric: 3 } } as NormalizedValue
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['results'] })
    if (out.kind !== 'json') throw new Error('expected json')
    expect(out.json['ingredients']).toEqual(raw.ingredients)
    expect(out.json['conditions']).toEqual(raw.conditions)
    expect(out.json['results']).toEqual([{ count: 3, item: 'ae2:fluix_crystal' }])
  })

  it('tea：fluidTag + heatRequirement 保留，改产物 mB 不影响输入', () => {
    const raw = pc2samples.mixingTea.json
    const schema = PC2_SCHEMAS['create:mixing']
    const n = normalizedFor('mixingTea')
    const ingredients = slotOf(n, 'ingredients')
    if (ingredients.kind !== 'list') throw new Error('not list')
    expect(ingredients.of[2]).toMatchObject({
      kind: 'fluid',
      id: 'forge:milk',
      refKey: 'fluidTag',
      amount: { raw: 250 }
    })
    expect(n.unknowns.map((u) => u.path)).toContain('$.heatRequirement')
    expect(denormalizeRecipe(n, schema, { dirtyFields: [] })).toEqual({ kind: 'json', json: raw })

    const edited = clone(n)
    const results = slotOf(edited, 'results')
    if (results.kind !== 'list') throw new Error('not list')
    results.of[0] = { kind: 'fluid', id: 'create:tea', amount: { raw: 750, numeric: 750 }, asObject: true }
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['results'] })
    if (out.kind !== 'json') throw new Error('expected json')
    expect(out.json['ingredients']).toEqual(raw.ingredients)
    expect(out.json['heatRequirement']).toBe('heated')
    expect(out.json['results']).toEqual([{ amount: 750, fluid: 'create:tea' }])
  })

  it('概率/数量字符串保持：只改第二个产物的概率，第一个产物的 "2"/"0.35" 不被归一', () => {
    const raw = pc2samples.mixingChance.json
    const schema = PC2_SCHEMAS['create:mixing']
    const n = normalizedFor('mixingChance')
    const results = slotOf(n, 'results')
    if (results.kind !== 'list') throw new Error('not list')
    expect(results.of[0]).toMatchObject({ count: { raw: '2' }, chance: { raw: '0.35' } })
    expect(results.of[1]).toMatchObject({ chance: { raw: 0.07 } })
    expect(denormalizeRecipe(n, schema, { dirtyFields: [] })).toEqual({ kind: 'json', json: raw })

    const edited = clone(n)
    const list = slotOf(edited, 'results')
    if (list.kind !== 'list') throw new Error('not list')
    list.of[1] = { ...(list.of[1] as object), chance: { raw: 0.1, numeric: 0.1 } } as NormalizedValue
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['results'] })
    if (out.kind !== 'json') throw new Error('expected json')
    const outputs = out.json['results'] as Array<Record<string, unknown>>
    expect(outputs[0]).toEqual({ item: 'minecraft:glowstone_dust', count: '2', chance: '0.35' })
    expect(outputs[1]).toEqual({ item: 'minecraft:gold_nugget', chance: 0.1 })
    expect(out.json['processingTime']).toBe(200)
    expect(out.json['heatRequirement']).toBe('superheated')
  })
})

describe('P-C2 不支持的引用形态：保留并报诊断，不静默丢', () => {
  const raw = {
    type: 'minecraft:crafting_shapeless',
    ingredients: [
      { type: 'immersiveengineering:fluid', amount: 1000, tag: 'minecraft:water' },
      { item: 'minecraft:rotten_flesh' },
      { item: 'minecraft:rotten_flesh' }
    ],
    result: { item: 'minecraft:white_dye', count: 16 }
  }

  it('IE 自定义 fluid 输入保留 type/amount/tag，并产生 UNKNOWN_FIELD_PRESERVED 诊断', () => {
    const schema = PC2_SCHEMAS['minecraft:crafting_shapeless']
    const { normalized, diagnostics } = normalizeRecipe({
      raw,
      schema,
      uid: 'test:ie-fluid',
      source: { source: 'jar', sourcePath: 'ie.json' }
    })
    const ingredients = normalized.slots.find((s) => s.key === 'ingredients')?.value
    if (ingredients?.kind !== 'list') throw new Error('not list')
    expect(ingredients.of[0]).toMatchObject({
      kind: 'fluid',
      id: 'minecraft:water',
      refKey: 'tag',
      amount: { raw: 1000 },
      extras: { type: 'immersiveengineering:fluid' }
    })
    expect(diagnostics.some((d) => d.code === 'UNKNOWN_FIELD_PRESERVED' && d.path === '$.ingredients[0]')).toBe(true)
    expect(denormalizeRecipe(normalized, schema, { dirtyFields: [] })).toEqual({ kind: 'json', json: raw })

    const edited = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
    const list = edited.slots.find((s) => s.key === 'ingredients')?.value
    if (list?.kind !== 'list') throw new Error('not list')
    list.of[1] = { kind: 'item', id: 'minecraft:diamond', asObject: true }
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['ingredients'] })
    if (out.kind !== 'json') throw new Error('expected json')
    expect(out.json['ingredients']).toEqual([
      { amount: 1000, tag: 'minecraft:water', type: 'immersiveengineering:fluid' },
      { item: 'minecraft:diamond' },
      { item: 'minecraft:rotten_flesh' }
    ])
  })
})
