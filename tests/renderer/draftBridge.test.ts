import { describe, expect, it } from 'vitest'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import type { RecipeRecord } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'
import { markFieldDirty } from '@shared/draftState'
import {
  applyDraftToNormalized,
  draftPreview,
  normalizedToDraft,
  pilotEnabled,
  type LoadedDraft
} from '@renderer/store/draftBridge'
import { samples } from '../schema/fixtures'

const PILOT_SCHEMA: NormalizedSchema = {
  id: 'minecraft:crafting_shaped',
  layoutKind: 'shaped',
  slots: [],
  outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
  revision: 1,
  preserveUnknown: true
}

function record(uid = 'test:shaped'): RecipeRecord {
  return {
    uid,
    recipeId: 'minecraft:pilot',
    type: 'minecraft:crafting_shaped',
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: 'pilot.json',
    partial: false
  }
}

function openedFor(raw: Record<string, unknown>, uid = 'test:shaped'): OpenedRecipe {
  const rawText = JSON.stringify(raw)
  const { normalized, diagnostics } = normalizeRecipe({
    raw,
    rawText,
    schema: PILOT_SCHEMA,
    uid,
    source: { source: 'jar', sourcePath: 'pilot.json' }
  })
  return {
    record: record(uid),
    schema: PILOT_SCHEMA,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText },
    normalized,
    diagnostics,
    notes: []
  }
}

function load(raw: Record<string, unknown>): { opened: OpenedRecipe; loaded: LoadedDraft } {
  const opened = openedFor(raw)
  const loaded = normalizedToDraft(opened)
  if (!loaded) throw new Error('normalizedToDraft 返回 null')
  return { opened, loaded }
}

function editCell(loaded: LoadedDraft, index: number, cell: unknown, field = 'grid'): LoadedDraft {
  const cells = [...(loaded.workbench.values['grid'] as unknown[])]
  cells[index] = cell
  return {
    ...loaded,
    workbench: { ...loaded.workbench, values: { ...loaded.workbench.values, grid: cells } },
    meta: markFieldDirty(loaded.meta, field)
  }
}

describe('试点开关（旧路径兼容的基础）', () => {
  it('只有白名单显式包含该类型才走新链路', () => {
    expect(pilotEnabled(['minecraft:crafting_shaped'], 'minecraft:crafting_shaped')).toBe(true)
    expect(pilotEnabled([], 'minecraft:crafting_shaped')).toBe(false)
    expect(pilotEnabled(undefined, 'minecraft:crafting_shaped')).toBe(false)
    expect(pilotEnabled(['minecraft:crafting_shaped'], 'create:mixing')).toBe(false)
  })
})

describe('normalizedToDraft（crafting_shaped 真实样本）', () => {
  it('网格/产物/基线/未建模字段各自就位，未编辑时预览就是原文', () => {
    const { opened, loaded } = load(samples.shaped.json)
    const grid = loaded.workbench.values['grid'] as Array<{ kind: string; id: string }>
    expect(grid).toHaveLength(9)
    expect(grid[0]).toMatchObject({ kind: 'tag', id: 'mekanism:alloys/reinforced' })
    expect(grid[1]).toMatchObject({ kind: 'tag', id: 'forge:plates/calorite' })
    expect(grid[4]).toMatchObject({ kind: 'item', id: 'mekanism:module_base' })
    expect(grid[8]).toMatchObject({ kind: 'tag', id: 'forge:pellets/polonium' })

    const outputs = loaded.workbench.values['outputs'] as Array<{ id: string }>
    expect(outputs.map((o) => o.id)).toEqual(['ad_astra_giselle_addon:module_acid_rain_proof_unit'])

    expect(loaded.meta.base?.uid).toBe('test:shaped')
    expect(loaded.meta.base?.rawHash).toBe(loaded.normalized.rawHash)
    expect(loaded.meta.dirtyFields).toEqual([])

    const preview = draftPreview(loaded)
    expect(preview.kind).toBe('text')
    expect(preview.text).toBe(opened.raw?.rawText)
    expect(preview.unknownCount).toBe(loaded.passThrough.length)
    expect(preview.dirtyFields).toEqual([])
  })

  it('未建模字段只进 passThrough，不混入可编辑 values', () => {
    const { opened, loaded } = load(samples.shaped.json)
    expect(loaded.passThrough.map((u) => u.path)).toContain('$.conditions')
    expect(Object.keys(loaded.workbench.values).sort()).toEqual(['grid', 'outputs'])
    expect(JSON.stringify(loaded.workbench.values)).not.toContain('forge:item_exists')
    expect(JSON.stringify(loaded.workbench.values)).not.toContain('conditions')
    // 原始数据仍完整可读（UI 的「未建模字段」列表与原文都来自这里）
    expect((opened.raw?.json as { conditions?: unknown[] }).conditions).toHaveLength(1)
    expect(loaded.banners.some((b) => b.text.includes('未建模字段已保留'))).toBe(true)
  })

  it('进度/温度等环境条件单独标记 reason，不算解析失败', () => {
    const { loaded } = load(samples.shaped.json)
    expect(loaded.normalized.partial.reasons).toContain('ambient-conditions')
    expect(loaded.normalized.partial.reasons).not.toContain('parse-failed')
  })

  it('pattern 行宽不齐时按原 pattern 逐行对齐，而不是按扁平下标', () => {
    const raw = {
      type: 'minecraft:crafting_shaped',
      pattern: ['AA', 'AAA'],
      key: { A: { item: 'minecraft:stick' } },
      result: { item: 'minecraft:torch' }
    }
    const { loaded } = load(raw)
    const grid = loaded.workbench.values['grid'] as Array<{ id: string } | null>
    expect(grid[0]?.id).toBe('minecraft:stick')
    expect(grid[1]?.id).toBe('minecraft:stick')
    expect(grid[2]).toBeNull()
    expect(grid[3]?.id).toBe('minecraft:stick')
    expect(grid[4]?.id).toBe('minecraft:stick')
    expect(grid[5]?.id).toBe('minecraft:stick')
  })
})

describe('A. 单字段编辑：只改该改的，其余逐值保留', () => {
  it('编辑一个格子：pattern 字母、key、result、conditions、数组顺序全部保持', () => {
    const raw = samples.shaped.json as Record<string, unknown>
    const { loaded } = load(raw)
    const preview = draftPreview(editCell(loaded, 4, { kind: 'item', id: 'minecraft:netherite_ingot', count: 1 }))
    expect(preview.kind).toBe('json')
    const json = preview.json as Record<string, unknown>
    expect(json['type']).toBe('minecraft:crafting_shaped')
    // 未改动的 I / # / P 字母不变，新物品拿未占用的字母
    expect(json['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    expect(json['key']).toEqual({
      I: { tag: 'mekanism:alloys/reinforced' },
      '#': { tag: 'forge:plates/calorite' },
      B: { item: 'minecraft:netherite_ingot', count: 1 },
      P: { tag: 'forge:pellets/polonium' }
    })
    expect(json['result']).toEqual((raw as { result: unknown }).result)
    expect(json['conditions']).toEqual((raw as { conditions: unknown }).conditions)
    expect(preview.dirtyFields).toEqual(['grid'])
    expect(preview.unknownCount).toBe(loaded.passThrough.length)
  })

  it('裸字符串 key 与字符串数量在未改动时保持原形态', () => {
    const raw = {
      type: 'minecraft:crafting_shaped',
      pattern: ['AB'],
      key: { A: 'minecraft:stick', B: { item: 'minecraft:iron_ingot', count: '2' } },
      result: 'minecraft:torch'
    }
    const { loaded } = load(raw)
    const preview = draftPreview(editCell(loaded, 0, { kind: 'item', id: 'minecraft:oak_planks' }))
    const json = preview.json as Record<string, unknown>
    expect(json['pattern']).toEqual(['CB'])
    expect(json['key']).toEqual({
      C: { item: 'minecraft:oak_planks' },
      B: { item: 'minecraft:iron_ingot', count: '2' }
    })
    expect(typeof (json['key'] as Record<string, { count?: unknown }>)['B']?.count).toBe('string')
    expect(json['result']).toBe('minecraft:torch')
  })

  it('字符串标签 #tag 不会退化成裸 "#"', () => {
    const raw = {
      type: 'minecraft:crafting_shaped',
      pattern: ['T '],
      key: { T: '#forge:ingots/iron' },
      result: 'minecraft:stick'
    }
    const { loaded } = load(raw)
    // UI 网格被补到 3×3；在第 2 格放材料不应把 1×2 的 pattern 扩成 9 列
    const preview = draftPreview(editCell(loaded, 1, { kind: 'item', id: 'minecraft:redstone' }))
    const json = preview.json as Record<string, unknown>
    expect(json['pattern']).toEqual(['TA'])
    expect(json['key']).toEqual({ T: '#forge:ingots/iron', A: { item: 'minecraft:redstone' } })
    expect(json['result']).toBe('minecraft:stick')
  })

  it('无脏字段时 applyDraftToNormalized 不动原对象（不做无意义重建）', () => {
    const { loaded } = load(samples.shaped.json)
    expect(applyDraftToNormalized(loaded.normalized, loaded.workbench, [])).toBe(loaded.normalized)
  })

  it('outputs 脏键回落到 result 槽位（UI 产物列表与规范化字段名不同）', () => {
    const { loaded } = load(samples.shaped.json)
    const workbench = JSON.parse(JSON.stringify(loaded.workbench)) as typeof loaded.workbench
    workbench.values['outputs'] = [{ kind: 'item', id: 'minecraft:diamond', count: 2 }]
    const preview = draftPreview({ ...loaded, workbench, meta: markFieldDirty(loaded.meta, 'outputs') })
    expect(preview.json?.['result']).toEqual({ item: 'minecraft:diamond', count: 2 })
    expect(preview.json?.['pattern']).toEqual(['I#I', 'IAI', 'PPP'])
  })
})
