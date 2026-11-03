import { describe, expect, it, vi } from 'vitest'
import type { RecipeRecord } from '@shared/types'

vi.mock('electron', () => ({ app: { getPath: () => `${process.cwd()}/.vitest-tmp/pc1`, getVersion: () => '0.1.0' } }))

import { openRecipe } from '@main/recipes/openRecipe'
import { isPilotType, selectSchema, toNormalizedSchema } from '@main/recipes/selectSchema'
import { clearSchemas, putLayer } from '@main/schema/registry'
import { samples } from '../schema/fixtures'
import { pc2samples } from '../schema/pc2Fixtures'

function record(over: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    uid: 'jar:a.jar#data/ad_astra_giselle_addon/recipes/compat/mekanism/crafting/module_acid_rain_proof_unit.json',
    recipeId: 'ad_astra_giselle_addon:module_acid_rain_proof_unit',
    type: 'minecraft:crafting_shaped',
    outputs: [{ id: 'ad_astra_giselle_addon:module_acid_rain_proof_unit', count: 1, kind: 'item' }],
    inputs: [
      { id: 'mekanism:alloys/reinforced', count: 1, kind: 'tag' },
      { id: 'mekanism:module_base', count: 1, kind: 'item' }
    ],
    source: 'jar',
    sourcePath: 'module_acid_rain_proof_unit.json',
    partial: false,
    jarPath: 'C:/mods/a.jar',
    entryPath: 'data/ad_astra_giselle_addon/recipes/compat/mekanism/crafting/module_acid_rain_proof_unit.json',
    ...over
  }
}

describe('selectSchema（P-C1 试点）', () => {
  it('试点类型返回内置 shaped schema（source=builtin）', () => {
    const sel = selectSchema('minecraft:crafting_shaped')
    expect(sel.source).toBe('builtin')
    expect(sel.schema.layoutKind).toBe('shaped')
    expect(sel.schema.outputs[0]?.key).toBe('result')
    expect(isPilotType('minecraft:crafting_shaped')).toBe(true)
  })

  it('P-C2：shapeless / mixing 返回固定试点 schema', () => {
    const shapeless = selectSchema('minecraft:crafting_shapeless')
    expect(shapeless.source).toBe('builtin')
    expect(shapeless.schema.layoutKind).toBe('shapeless')
    expect(shapeless.schema.slots[0]?.key).toBe('ingredients')
    expect(shapeless.schema.outputs[0]?.key).toBe('result')
    const mixing = selectSchema('create:mixing')
    expect(mixing.source).toBe('builtin')
    expect(mixing.schema.layoutKind).toBe('multi_io')
    expect(mixing.schema.slots[0]?.key).toBe('ingredients')
    expect(mixing.schema.outputs[0]?.key).toBe('results')
    expect(mixing.schema.supportsChance).toBe(true)
    expect(isPilotType('create:mixing')).toBe(true)
  })

  it('P-C2：注册表里的推断 schema 不会覆盖试点固定 schema', () => {
    putLayer('inferred', {
      id: 'create:mixing',
      displayName: 'inferred mixing',
      modId: 'create',
      modDisplayName: 'Create',
      source: 'inferred',
      layoutKind: 'multi_io',
      emitTarget: null,
      slots: [{ key: 'notIngredients', displayName: 'x', kind: 'item', multiple: true }],
      outputs: [],
      channel: 'datapack-json',
      capability: 'compatible'
    })
    try {
      const sel = selectSchema('create:mixing')
      expect(sel.source).toBe('builtin')
      expect(sel.schema.slots[0]?.key).toBe('ingredients')
    } finally {
      clearSchemas()
    }
  })

  it('非试点类型退回 generic，并给出明确说明', () => {
    const sel = selectSchema('tlskincape:unknown_type')
    expect(sel.source).toBe('generic')
    expect(sel.schema.slots).toEqual([])
    expect(sel.notes[0]).toContain('通用模式')
    expect(isPilotType('tlskincape:unknown_type')).toBe(false)
  })

  it('注册表 schema 转规范化视图时保留 emitShape/jsonKey/compound', () => {
    const normalized = toNormalizedSchema({
      id: 'mekanism:metallurgic_infusing',
      displayName: '灌注',
      modId: 'mekanism',
      modDisplayName: 'Mekanism',
      source: 'builtin',
      layoutKind: 'single_io',
      emitTarget: 'event.recipes.mekanism.metallurgic_infusing',
      slots: [
        {
          key: 'chemicalInput',
          displayName: '灌注物',
          kind: 'registry',
          registry: 'mekanism:infuse_type',
          emitShape: 'scalar',
          compound: ['amount', 'tag'],
          multiple: false
        }
      ],
      outputs: [],
      channel: 'kubejs-sugar',
      capability: 'sugar'
    })
    const slot = normalized.slots[0]
    expect(slot?.jsonKey).toBe('chemicalInput')
    expect(slot?.emitShape).toBe('scalar')
    expect(slot?.compound).toEqual(['amount', 'tag'])
  })
})

describe('openRecipe（原始为权威）', () => {
  it('读取成功：回原始 + 规范化 + 诊断，未知字段可见', async () => {
    const shaped = samples.shaped.json
    const opened = await openRecipe('u1', {
      lookup: () => record(),
      readFull: async () => ({ json: shaped, sourcePath: 'p' }),
      select: selectSchema
    })
    expect(opened.status).toBe('ok')
    expect(opened.rawKind).toBe('file')
    expect(opened.schemaSource).toBe('builtin')
    expect(opened.raw?.json).toEqual(shaped)
    expect(opened.normalized?.unknowns.map((u) => u.path)).toContain('$.conditions')
    expect(opened.diagnostics.some((d) => d.code === 'PARTIAL_RECIPE')).toBe(true)
  })

  it('原始不可读：明确 raw-missing，不拿摘要冒充', async () => {
    const opened = await openRecipe('u1', {
      lookup: () => record(),
      readFull: async () => {
        throw new Error('源文件已失效，无法载入完整配方：x')
      },
      select: selectSchema
    })
    expect(opened.status).toBe('raw-missing')
    expect(opened.raw).toBeNull()
    expect(opened.normalized).toBeNull()
    expect(opened.diagnostics.some((d) => d.code === 'RAW_UNAVAILABLE')).toBe(true)
  })

  it('kubejs 记录：标记 reconstructed 并说明动态逻辑不可还原', async () => {
    const opened = await openRecipe('u1', {
      lookup: () => record({ source: 'kubejs', type: 'minecraft:crafting_shaped', uid: 'kubejs:x#0' }),
      readFull: async () => ({ json: samples.shaped.json, sourcePath: 'x' }),
      select: selectSchema
    })
    expect(opened.rawKind).toBe('reconstructed')
    expect(opened.notes.some((n) => n.includes('脚本'))).toBe(true)
    expect(opened.normalized?.source.dynamic).toBe(true)
  })

  it('未知类型：schemaSource=generic 且给出诊断', async () => {
    const opened = await openRecipe('u1', {
      lookup: () => record({ type: 'somemod:weird', uid: 'u1' }),
      readFull: async () => ({ json: { type: 'somemod:weird', foo: 1 }, sourcePath: 'p' }),
      select: selectSchema
    })
    expect(opened.schemaSource).toBe('generic')
    expect(opened.diagnostics.some((d) => d.code === 'SCHEMA_GENERIC')).toBe(true)
    expect(opened.normalized?.unknowns.map((u) => u.path)).toContain('$.foo')
  })

  it('P-C2 shapeless 真实样本：原始为权威，category 进未建模字段', async () => {
    const raw = pc2samples.shapelessBrass.json
    const opened = await openRecipe('u1', {
      lookup: () => record({ type: 'minecraft:crafting_shapeless', uid: 'u1', sourcePath: 'shapeless.json' }),
      readFull: async () => ({ json: raw, sourcePath: 'shapeless.json' }),
      select: selectSchema
    })
    expect(opened.status).toBe('ok')
    expect(opened.schemaSource).toBe('builtin')
    expect(opened.schema.layoutKind).toBe('shapeless')
    expect(opened.raw?.json).toEqual(raw)
    expect(opened.normalized?.unknowns.map((u) => u.path)).toContain('$.category')
    expect(opened.normalized?.partial.reasons).toContain('unclaimed-keys')
  })

  it('P-C2 create:mixing 真实样本：流体/nbt/条件与诊断一起返回', async () => {
    const raw = pc2samples.mixingFluix.json
    const opened = await openRecipe('u1', {
      lookup: () => record({ type: 'create:mixing', uid: 'u1', sourcePath: 'mixing.json' }),
      readFull: async () => ({ json: raw, sourcePath: 'mixing.json' }),
      select: selectSchema
    })
    expect(opened.status).toBe('ok')
    expect(opened.schema.layoutKind).toBe('multi_io')
    expect(opened.normalized?.unknowns.map((u) => u.path)).toContain('$.conditions')
    expect(opened.normalized?.partial.reasons).toContain('ambient-conditions')
  })

  it('P-C2 引用内未建模键：诊断透出，原始值不被改写', async () => {
    const raw = {
      type: 'minecraft:crafting_shapeless',
      ingredients: [
        { type: 'immersiveengineering:fluid', amount: 1000, tag: 'minecraft:water' },
        { item: 'minecraft:rotten_flesh' }
      ],
      result: { item: 'minecraft:white_dye', count: 16 }
    }
    const opened = await openRecipe('u1', {
      lookup: () => record({ type: 'minecraft:crafting_shapeless', uid: 'u1', sourcePath: 'ie.json' }),
      readFull: async () => ({ json: raw, sourcePath: 'ie.json' }),
      select: selectSchema
    })
    expect(opened.diagnostics.some((d) => d.code === 'UNKNOWN_FIELD_PRESERVED' && d.path === '$.ingredients[0]')).toBe(true)
    expect(opened.raw?.json).toEqual(raw)
  })
})
