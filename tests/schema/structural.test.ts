import { describe, expect, it } from 'vitest'
import { normalizeRecipe, denormalizeRecipe } from '@shared/normalize'
import { hashRaw } from '@shared/canonicalJson'
import { createDraftMeta, checkDraftConflict, markFieldDirty } from '@shared/draftState'
import type { NormalizedRecipe, NormalizedSchema } from '@shared/schemaModel'
import { samples } from './fixtures'

/** Mekanism 灌注（真实样本）：struct 包裹 + 注册表 tag 形态 */
const infusingSchema: NormalizedSchema = {
  id: 'mekanism:metallurgic_infusing',
  layoutKind: 'single_io',
  slots: [
    {
      key: 'itemInput',
      kind: 'struct',
      multiple: false,
      fields: [{ key: 'ingredient', kind: 'item', multiple: false }]
    },
    { key: 'chemicalInput', kind: 'registry', multiple: false, registry: 'mekanism:infuse_type', compound: ['amount', 'tag'] }
  ],
  outputs: [{ key: 'output', kind: 'item', multiple: false }],
  revision: 1
}

/** Mekanism 反应（真实样本）：流体 tag、气体对象、包裹的 ingredient 列表、{count,item} 输出 */
const reactionSchema: NormalizedSchema = {
  id: 'mekanism:reaction',
  layoutKind: 'multi_io',
  slots: [
    { key: 'fluidInput', kind: 'fluid', multiple: false, compound: ['amount'] },
    { key: 'gasInput', kind: 'registry', multiple: false, registry: 'mekanism:gas', compound: ['amount'] },
    {
      key: 'itemInput',
      kind: 'struct',
      multiple: false,
      fields: [{ key: 'ingredient', kind: 'item', multiple: true }]
    },
    { key: 'duration', kind: 'number', multiple: false }
  ],
  outputs: [
    { key: 'gasOutput', kind: 'registry', multiple: false, registry: 'mekanism:gas', compound: ['amount'] },
    { key: 'itemOutput', kind: 'item', multiple: false, compound: ['count'] }
  ],
  revision: 1
}

function norm(raw: Record<string, unknown>, schema: NormalizedSchema): NormalizedRecipe {
  return normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } }).normalized
}

describe('专项：Mekanism 不同输入表示形式', () => {
  const raw = samples.infusing.json

  it('chemicalInput 的 {amount, tag} 识别为注册表 refKey=tag；itemInput 是 struct', () => {
    const normalized = norm(raw, infusingSchema)
    const chemical = normalized.slots.find((s) => s.key === 'chemicalInput')?.value
    expect(chemical).toMatchObject({
      kind: 'registry',
      registry: 'mekanism:infuse_type',
      id: 'mekanism:bio',
      refKey: 'tag',
      amount: { raw: 10, numeric: 10 }
    })
    const input = normalized.slots.find((s) => s.key === 'itemInput')?.value
    expect(input?.kind).toBe('struct')
    if (input?.kind === 'struct') {
      expect(input.fields['ingredient']).toMatchObject({ kind: 'item', id: 'minecraft:stone' })
      expect(input.unknowns ?? []).toEqual([])
    }
    expect(normalized.unknowns.map((u) => u.path)).toContain('$.conditions')
  })

  it('未编辑反解与原始深相等；只改 output.id 时 chemicalInput/itemInput/conditions 不变', () => {
    const normalized = norm(raw, infusingSchema)
    const clean = denormalizeRecipe(normalized, infusingSchema)
    expect(clean.kind).toBe('json')
    if (clean.kind === 'json') expect(clean.json).toEqual(raw)

    const edited = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
    const output = edited.slots.find((s) => s.key === 'output')
    if (output?.value?.kind === 'item') output.value.id = 'byg:mossy_cobblestone'
    const out = denormalizeRecipe(edited, infusingSchema, { dirtyFields: ['output'] })
    expect(out.kind).toBe('json')
    if (out.kind !== 'json') return
    expect(out.json['output']).toEqual({ item: 'byg:mossy_cobblestone' })
    expect(out.json['chemicalInput']).toEqual(raw['chemicalInput'])
    expect(out.json['itemInput']).toEqual(raw['itemInput'])
    expect(out.json['conditions']).toEqual(raw['conditions'])
  })

  it('struct 内部未认领子键：进 struct.unknowns，编辑后仍带回', () => {
    const withExtra = {
      ...raw,
      itemInput: { ingredient: { item: 'minecraft:stone' }, slotHint: 3, note: { a: 1 } }
    }
    const normalized = norm(withExtra, infusingSchema)
    const input = normalized.slots.find((s) => s.key === 'itemInput')?.value
    expect(input?.kind).toBe('struct')
    if (input?.kind !== 'struct') return
    expect(input.unknowns?.map((u) => u.path).sort()).toEqual(['$.itemInput.note', '$.itemInput.slotHint'])

    const edited = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
    const slot = edited.slots.find((s) => s.key === 'itemInput')
    if (slot?.value?.kind === 'struct') {
      const ingredient = slot.value.fields['ingredient']
      if (ingredient?.kind === 'item') ingredient.id = 'minecraft:cobblestone'
    }
    const out = denormalizeRecipe(edited, infusingSchema, { dirtyFields: ['itemInput'] })
    expect(out.kind).toBe('json')
    if (out.kind !== 'json') return
    expect(out.json['itemInput']).toEqual({ ingredient: { item: 'minecraft:cobblestone' }, slotHint: 3, note: { a: 1 } })
  })

  it('reaction：流体 tag、气体对象、ingredient 列表、{count,item} 输出均可还原', () => {
    const raw2 = samples.reaction.json
    const normalized = norm(raw2, reactionSchema)
    const byKey = new Map(normalized.slots.map((s) => [s.key, s.value]))
    expect(byKey.get('fluidInput')).toMatchObject({ kind: 'fluid', id: 'minecraft:water', refKey: 'tag' })
    expect(byKey.get('gasInput')).toMatchObject({ kind: 'registry', id: 'mekanism:oxygen', refKey: 'gas' })
    expect(byKey.get('itemOutput')).toMatchObject({ kind: 'item', count: { raw: 9, numeric: 9 } })
    const input = byKey.get('itemInput')
    expect(input?.kind).toBe('struct')
    if (input?.kind === 'struct') {
      const ing = input.fields['ingredient']
      expect(ing?.kind).toBe('list')
      if (ing?.kind === 'list') expect(ing.of.map((v) => (v?.kind === 'tag' ? v.id : null))).toEqual([
        'forge:storage_blocks/coal',
        'forge:storage_blocks/charcoal'
      ])
    }
    const clean = denormalizeRecipe(normalized, reactionSchema)
    expect(clean.kind).toBe('json')
    if (clean.kind === 'json') expect(clean.json).toEqual(raw2)

    // 只改 duration：其余（含 count 与 gas）原样
    const edited = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
    const duration = edited.slots.find((s) => s.key === 'duration')
    if (duration?.value?.kind === 'scalar') duration.value.value = 1800
    const out = denormalizeRecipe(edited, reactionSchema, { dirtyFields: ['duration'] })
    if (out.kind === 'json') {
      expect(out.json['duration']).toBe(1800)
      expect(out.json['itemOutput']).toEqual(raw2['itemOutput'])
      expect(out.json['gasInput']).toEqual(raw2['gasInput'])
      expect(out.json['fluidInput']).toEqual(raw2['fluidInput'])
    }
  })
})

describe('专项：Create 混合的复杂输入输出与额外参数', () => {
  const schema: NormalizedSchema = {
    id: 'create:mixing',
    layoutKind: 'multi_io',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, compound: ['amount', 'chance'] }],
    outputs: [{ key: 'results', kind: 'item', multiple: true, compound: ['amount', 'chance'] }]
  }
  const raw = {
    type: 'create:mixing',
    heatRequirement: 'heated',
    ingredients: [
      { item: 'minecraft:andesite' },
      { tag: 'forge:nuggets/iron' },
      { fluid: 'minecraft:water', amount: 500 }
    ],
    results: [
      { item: 'create:andesite_alloy', chance: '0.4' },
      { fluid: 'create:chocolate', amount: 250 }
    ]
  }

  it('混合物品/标签/流体材料与字符串概率产物；heatRequirement 进 unknowns', () => {
    const normalized = norm(raw, schema)
    const ingredients = normalized.slots.find((s) => s.key === 'ingredients')?.value
    expect(ingredients?.kind).toBe('list')
    if (ingredients?.kind === 'list') {
      expect(ingredients.of.map((v) => v?.kind)).toEqual(['item', 'tag', 'fluid'])
      const fluid = ingredients.of[2]
      expect(fluid).toMatchObject({ kind: 'fluid', id: 'minecraft:water', amount: { raw: 500 } })
    }
    const results = normalized.slots.find((s) => s.key === 'results')?.value
    if (results?.kind === 'list') {
      expect(results.of[0]).toMatchObject({ kind: 'item', chance: { raw: '0.4', numeric: 0.4 } })
      expect(results.of[1]).toMatchObject({ kind: 'fluid', id: 'create:chocolate' })
    }
    expect(normalized.unknowns.map((u) => u.path)).toEqual(['$.heatRequirement'])
    const clean = denormalizeRecipe(normalized, schema)
    if (clean.kind === 'json') expect(clean.json).toEqual(raw)

    // 只改第一个材料：流体材料、字符串概率、heatRequirement 全部原样
    const edited = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
    const slot = edited.slots.find((s) => s.key === 'ingredients')
    if (slot?.value?.kind === 'list' && slot.value.of[0]?.kind === 'item') slot.value.of[0].id = 'minecraft:granite'
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['ingredients'] })
    if (out.kind === 'json') {
      expect((out.json['ingredients'] as unknown[])[0]).toEqual({ item: 'minecraft:granite' })
      expect((out.json['ingredients'] as unknown[])[2]).toEqual({ fluid: 'minecraft:water', amount: 500 })
      expect((out.json['results'] as unknown[])[0]).toEqual({ item: 'create:andesite_alloy', chance: '0.4' })
      expect(out.json['heatRequirement']).toBe('heated')
    }
  })
})

describe('专项：Hash 行为与冲突保护', () => {
  const raw = samples.mixing.json

  it('对象键序无关；数组顺序与 JSON 值类型会影响 hash', () => {
    const reordered = Object.fromEntries(Object.entries(raw).reverse())
    expect(hashRaw(reordered)).toBe(hashRaw(raw))

    const arrA = { type: 'x:y', ingredients: [{ item: 'a:1' }, { item: 'a:2' }] }
    const arrB = { type: 'x:y', ingredients: [{ item: 'a:2' }, { item: 'a:1' }] }
    expect(hashRaw(arrA)).not.toBe(hashRaw(arrB))
    expect(hashRaw({ v: 1 })).not.toBe(hashRaw({ v: '1' }))
  })

  it('原始变化后旧草稿不能静默覆盖：冲突判定 + 取消编辑不改原始', () => {
    const normalized = norm(raw, { id: 'create:mixing', layoutKind: 'multi_io', slots: [{ key: 'ingredients', kind: 'item', multiple: true }], outputs: [{ key: 'results', kind: 'item', multiple: true }] })
    const meta = markFieldDirty(createDraftMeta({ uid: 'u', rawHash: normalized.rawHash }), 'ingredients')
    const changed = { ...raw, extra: true }
    expect(checkDraftConflict(meta, hashRaw(changed))).toBe('conflict')

    // 「取消编辑」= 丢弃草稿：原始与规范化结果都不变
    const before = JSON.stringify(raw)
    const clean = denormalizeRecipe(normalized, { id: 'create:mixing', layoutKind: 'multi_io', slots: [{ key: 'ingredients', kind: 'item', multiple: true }], outputs: [{ key: 'results', kind: 'item', multiple: true }] })
    expect(JSON.stringify(raw)).toBe(before)
    if (clean.kind === 'json') expect(clean.json).toEqual(raw)
    expect(normalized.source.raw).toEqual(raw)
  })
})
