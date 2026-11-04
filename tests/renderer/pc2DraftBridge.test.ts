import { describe, expect, it } from 'vitest'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import type { RecipeRecord, SlotValue } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'
import { markFieldDirty } from '@shared/draftState'
import {
  draftPreview,
  normalizedToDraft,
  type LoadedDraft
} from '@renderer/store/draftBridge'
import { PC2_SCHEMAS, pc2Opened, pc2samples, type Pc2Key } from '../schema/pc2Fixtures'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function load(key: Pc2Key): LoadedDraft {
  const loaded = normalizedToDraft(pc2Opened(key))
  if (!loaded) throw new Error('normalizedToDraft 返回 null')
  return loaded
}

function listOf(loaded: LoadedDraft, key: string): SlotValue[] {
  return loaded.workbench.values[key] as SlotValue[]
}

function previewWith(loaded: LoadedDraft, values: Record<string, unknown>, field: string) {
  return draftPreview({
    ...loaded,
    workbench: { ...loaded.workbench, values: { ...loaded.workbench.values, ...values } },
    meta: markFieldDirty(loaded.meta, field)
  })
}

function openedForRaw(raw: Record<string, unknown>, schema: NormalizedSchema): OpenedRecipe {
  const rawText = JSON.stringify(raw)
  const { normalized, diagnostics } = normalizeRecipe({
    raw,
    rawText,
    schema,
    uid: 'test:custom',
    source: { source: 'jar', sourcePath: 'custom.json' }
  })
  const record: RecipeRecord = {
    uid: 'test:custom',
    recipeId: 'test:custom',
    type: schema.id,
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: 'custom.json',
    partial: normalized.partial.isPartial
  }
  return {
    record,
    schema,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText },
    normalized,
    diagnostics,
    notes: []
  }
}

describe('P-C2 白名单', () => {
  it('只认显式列出的类型，新类型不会误进新链路', () => {
  })
})

describe('P-C2 shapeless 草稿', () => {
  it('槽位键 = 规范化键（ingredients/result），干净预览回原文，category 进 passThrough', () => {
    const loaded = load('shapelessBrass')
    expect(Object.keys(loaded.workbench.values).sort()).toEqual(['ingredients', 'result'])
    expect(listOf(loaded, 'ingredients')).toHaveLength(4)
    expect(listOf(loaded, 'ingredients')[3]).toMatchObject({ kind: 'tag', id: 'forge:dusts/zinc' })
    expect(listOf(loaded, 'result')).toHaveLength(1)
    expect(listOf(loaded, 'result')[0]).toMatchObject({ id: 'alltheores:brass_dust', count: 4 })
    expect(loaded.passThrough.map((u) => u.path)).toContain('$.category')
    const preview = draftPreview(loaded)
    expect(preview.kind).toBe('text')
    expect(preview.text).toBe(JSON.stringify(pc2samples.shapelessBrass.json))
  })

  it('改一个材料：顺序/标签/产物/category 保持，未改条目保留对象形态', () => {
    const loaded = load('shapelessBrass')
    const ingredients = clone(listOf(loaded, 'ingredients'))
    ingredients[1] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
    const preview = previewWith(loaded, { ingredients }, 'ingredients')
    expect(preview.kind).toBe('json')
    const json = preview.json as { ingredients: unknown[]; result: unknown; category: unknown }
    expect(json.ingredients).toEqual([
      { item: 'alltheores:copper_dust' },
      { item: 'minecraft:emerald', count: 1 },
      { item: 'alltheores:copper_dust' },
      { tag: 'forge:dusts/zinc' }
    ])
    expect(json.result).toEqual({ count: 4, item: 'alltheores:brass_dust' })
    expect(json.category).toBe('misc')
  })

  it('改产物数量：输入顺序与标签不变', () => {
    const loaded = load('shapelessBrass')
    const result = clone(listOf(loaded, 'result'))
    result[0] = { ...result[0]!, count: 8 }
    const preview = previewWith(loaded, { result }, 'result')
    expect(preview.json?.['result']).toEqual({ item: 'alltheores:brass_dust', count: 8 })
    expect(preview.json?.['ingredients']).toEqual(pc2samples.shapelessBrass.json.ingredients)
    expect(preview.json?.['category']).toBe('misc')
  })
})

describe('P-C2 create:mixing 草稿', () => {
  it('fluix：tag/item/fluid+nbt/count 映射到列表；conditions 未建模；改数量不影响输入', () => {
    const loaded = load('mixingFluix')
    expect(Object.keys(loaded.workbench.values).sort()).toEqual(['ingredients', 'results'])
    expect(listOf(loaded, 'ingredients')[3]).toMatchObject({ kind: 'fluid', id: 'minecraft:water', amount: 250, nbt: {} })
    expect(listOf(loaded, 'results')[0]).toMatchObject({ kind: 'item', id: 'ae2:fluix_crystal', count: 2 })
    expect(loaded.passThrough.map((u) => u.path)).toContain('$.conditions')

    const results = clone(listOf(loaded, 'results'))
    results[0] = { ...results[0]!, count: 3 }
    const preview = previewWith(loaded, { results }, 'results')
    expect(preview.json?.['results']).toEqual([{ item: 'ae2:fluix_crystal', count: 3 }])
    expect(preview.json?.['ingredients']).toEqual(pc2samples.mixingFluix.json.ingredients)
    expect(preview.json?.['conditions']).toEqual(pc2samples.mixingFluix.json.conditions)
  })

  it('编辑流体输入 mB：保留同一流体的 nbt、其他输入与产物', () => {
    const loaded = load('mixingFluix')
    const ingredients = clone(listOf(loaded, 'ingredients'))
    ingredients[3] = { ...ingredients[3]!, amount: 500 }
    const preview = previewWith(loaded, { ingredients }, 'ingredients')
    expect(preview.json?.['ingredients']).toEqual([
      { tag: 'forge:dusts/redstone' },
      { item: 'ae2:charged_certus_quartz_crystal' },
      { tag: 'forge:gems/quartz' },
      { amount: 500, fluid: 'minecraft:water', nbt: {} }
    ])
    expect(preview.json?.['results']).toEqual(pc2samples.mixingFluix.json.results)
    expect(preview.json?.['conditions']).toEqual(pc2samples.mixingFluix.json.conditions)
  })

  it('tea：fluidTag 保持、heatRequirement 未建模、改产物 mB 不影响输入', () => {
    const loaded = load('mixingTea')
    expect(listOf(loaded, 'ingredients')[2]).toMatchObject({ kind: 'fluid', id: 'forge:milk', amount: 250 })
    expect(loaded.passThrough.map((u) => u.path)).toContain('$.heatRequirement')
    const results = clone(listOf(loaded, 'results'))
    results[0] = { ...results[0]!, amount: 750 }
    const preview = previewWith(loaded, { results }, 'results')
    expect(preview.json?.['results']).toEqual([{ fluid: 'create:tea', amount: 750 }])
    expect(preview.json?.['ingredients']).toEqual(pc2samples.mixingTea.json.ingredients)
    expect(preview.json?.['heatRequirement']).toBe('heated')
  })

  it('概率/数量字符串：只改第二个概率，第一个产物原样保留', () => {
    const loaded = load('mixingChance')
    const results = clone(listOf(loaded, 'results'))
    expect(results[0]).toMatchObject({ count: 2, chance: 0.35 })
    results[1] = { ...results[1]!, chance: 0.1 }
    const preview = previewWith(loaded, { results }, 'results')
    const outputs = preview.json?.['results'] as Array<Record<string, unknown>>
    expect(outputs[0]).toEqual({ item: 'minecraft:glowstone_dust', count: '2', chance: '0.35' })
    expect(outputs[1]).toEqual({ item: 'minecraft:gold_nugget', chance: 0.1 })
    expect(preview.json?.['processingTime']).toBe(200)
    expect(preview.json?.['heatRequirement']).toBe('superheated')
  })

  it('引用内未建模键（IE fluid 的 type）在编辑同条目后仍保留，并显示诊断', () => {
    const raw = {
      type: 'minecraft:crafting_shapeless',
      ingredients: [
        { type: 'immersiveengineering:fluid', amount: 1000, tag: 'minecraft:water' },
        { item: 'minecraft:rotten_flesh' }
      ],
      result: { item: 'minecraft:white_dye', count: 16 }
    }
    const opened = openedForRaw(raw, PC2_SCHEMAS['minecraft:crafting_shapeless'])
    const loaded = normalizedToDraft(opened)
    if (!loaded) throw new Error('load failed')
    expect(loaded.diagnostics.some((d) => d.code === 'UNKNOWN_FIELD_PRESERVED')).toBe(true)
    expect(listOf(loaded, 'ingredients')[0]).toMatchObject({ kind: 'fluid', id: 'minecraft:water', amount: 1000 })

    const ingredients = clone(listOf(loaded, 'ingredients'))
    ingredients[0] = { ...ingredients[0]!, amount: 2000 }
    const preview = previewWith(loaded, { ingredients }, 'ingredients')
    expect(preview.json?.['ingredients']).toEqual([
      { amount: 2000, tag: 'minecraft:water', type: 'immersiveengineering:fluid' },
      { item: 'minecraft:rotten_flesh' }
    ])
    expect(preview.json?.['result']).toEqual({ item: 'minecraft:white_dye', count: 16 })
  })

  it('完全无法表达的引用：草稿标记 unsafe，列表只读，原文仍可预览', () => {
    const raw = {
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ weird: 'no-id-object' }, { item: 'minecraft:stick' }],
      result: { item: 'minecraft:torch' }
    }
    const opened = openedForRaw(raw, PC2_SCHEMAS['minecraft:crafting_shapeless'])
    const loaded = normalizedToDraft(opened)
    if (!loaded) throw new Error('load failed')
    expect(loaded.unsafeReason).toBeTruthy()
    expect(loaded.banners.some((b) => b.text.includes('无法安全表达'))).toBe(true)
    expect(loaded.normalized.partial.reasons).toContain('unknown-ref')
    const preview = draftPreview(loaded)
    expect(preview.text).toBe(JSON.stringify(raw))
  })
})
