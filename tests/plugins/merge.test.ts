/** 五层优先级合并与「插件 + L1 叠加」单测（规格 3.6.14 优先级表 + 架构决策 6）。 */
import { describe, expect, it } from 'vitest'
import type { PluginManifest, RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'
import {
  applyFieldNames,
  LAYER_RANK,
  overlayPluginOntoInferred,
  planTypeConflicts,
  resolvePluginOverrides,
  schemaRank,
  selectWinningSchemas,
  takesPrecedence
} from '../../src/main/plugins/merge'

function slot(key: string, displayName: string, over: Partial<RecipeSlotSchema> = {}): RecipeSlotSchema {
  return { key, displayName, kind: 'item', multiple: false, ...over }
}

function schema(over: Partial<RecipeTypeSchema> = {}): RecipeTypeSchema {
  return {
    id: 'm:t',
    displayName: '标题',
    modId: 'm',
    modDisplayName: 'M',
    source: 'inferred',
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'event-custom',
    capability: 'compatible',
    ...over
  }
}

describe('优先级', () => {
  it('用户钉住 > 插件 > L0 > L2 > L1', () => {
    expect(schemaRank(schema({ pinned: true, source: 'inferred' }))).toBe(0)
    expect(schemaRank(schema({ source: 'custom' }))).toBe(0)
    expect(schemaRank(schema({ source: 'plugin' }))).toBe(LAYER_RANK.plugin)
    expect(schemaRank(schema({ source: 'builtin' }))).toBe(LAYER_RANK.builtin)
    expect(LAYER_RANK.plugin).toBeLessThan(LAYER_RANK.builtin)
    expect(LAYER_RANK.builtin).toBeLessThan(LAYER_RANK.probejs)
    expect(LAYER_RANK.probejs).toBeLessThan(LAYER_RANK.inferred)
  })

  it('高优先级来源胜出，低优先级同 type 被丢弃', () => {
    const winners = selectWinningSchemas([
      schema({ source: 'inferred', displayName: 'L1' }),
      schema({ source: 'probejs', displayName: 'L2' }),
      schema({ source: 'builtin', displayName: 'L0' }),
      schema({ source: 'plugin', displayName: '插件' })
    ])
    expect(winners.map((s) => s.displayName)).toEqual(['插件'])
    expect(takesPrecedence(schema({ source: 'plugin' }), schema({ source: 'builtin' }))).toBe(true)
    expect(takesPrecedence(schema({ source: 'builtin' }), schema({ source: 'plugin' }))).toBe(false)
  })

  it('同级先到先得：整合包插件排在用户目录插件之前即可压制后者', () => {
    const resolved = resolvePluginOverrides([
      { pluginId: 'pack', origin: 'modpack', schema: schema({ displayName: '本包版' }) },
      { pluginId: 'usr', origin: 'user', schema: schema({ displayName: '用户版' }) }
    ])
    expect(resolved.schemas.map((s) => s.displayName)).toEqual(['本包版'])
    expect(resolved.conflicts).toEqual([{ type: 'm:t', winner: 'pack', winnerOrigin: 'modpack', losers: ['usr'] }])
  })

  it('manifest 层的冲突计算忽略未生效插件', () => {
    const plugin = (over: Partial<PluginManifest>): PluginManifest => ({
      id: 'p', name: 'P', version: '1.0.0', origin: 'modpack', path: '/x', status: 'loaded', coveredTypes: [], ...over
    })
    const conflicts = planTypeConflicts([
      plugin({ id: 'a', coveredTypes: ['x:y'] }),
      plugin({ id: 'b', origin: 'user', coveredTypes: ['x:y', 'z:w'] }),
      plugin({ id: 'c', origin: 'user', status: 'incompatible', coveredTypes: ['x:y'] })
    ])
    expect(conflicts).toEqual([{ type: 'x:y', winner: 'a', winnerOrigin: 'modpack', losers: ['b'] }])
  })
})

describe('插件与 L1 是叠加关系', () => {
  const pluginSchema = schema({
    source: 'plugin',
    displayName: '神秘学 · 仪式',
    layoutKind: 'multi_io',
    slots: [slot('activation_item', '激活物', { role: 'requirement', required: true })],
    outputs: [slot('result', '产物')],
    requirements: [{ kind: 'structure', text: '需要法阵' }],
    notes: ['不消耗模板'],
    channel: 'datapack-json',
    capability: 'compatible'
  })
  const inferred = schema({
    source: 'inferred',
    displayName: 'occultism:ritual',
    layoutKind: 'single_io',
    slots: [slot('activation_item', 'activation_item'), slot('ingredients', 'ingredients', { multiple: true }), slot('pentacle_id', 'pentacle_id', { kind: 'choice' })],
    outputs: [slot('result', 'result'), slot('reward', 'reward')],
    extraFields: [slot('max_times', 'max_times', { kind: 'number' })],
    sampleCount: 42,
    lowConfidence: false
  })
  const merged = overlayPluginOntoInferred(pluginSchema, inferred)

  it('插件写过的字段保留插件的叫法与角色', () => {
    expect(merged.slots[0]?.displayName).toBe('激活物')
    expect(merged.slots[0]?.role).toBe('requirement')
    expect(merged.layoutKind).toBe('multi_io')
    expect(merged.channel).toBe('datapack-json')
    expect(merged.source).toBe('plugin')
  })

  it('插件没写的字段由 L1 补全，产物区同样叠加', () => {
    expect(merged.slots.map((s) => s.key)).toEqual(['activation_item', 'ingredients', 'pentacle_id'])
    expect(merged.outputs.map((s) => s.key)).toEqual(['result', 'reward'])
    expect(merged.extraFields?.map((s) => s.key)).toEqual(['max_times'])
  })

  it('实测样本数留在合并结果里，提示条与注意事项合并不重复', () => {
    expect(merged.sampleCount).toBe(42)
    expect(merged.requirements?.map((r) => r.text)).toEqual(['需要法阵'])
    expect(merged.notes).toEqual(['不消耗模板'])
  })

  it('字段词典只改没被作者显式命名的槽位', () => {
    const renamed = applyFieldNames([slot('pentacle_id', 'pentacle_id'), slot('result', '产物'), slot('nested', 'nested', { kind: 'struct', fields: [slot('inner', 'inner')] })], { pentacle_id: '法阵等级', inner: '内层字段' })
    expect(renamed[0]?.displayName).toBe('法阵等级')
    expect(renamed[1]?.displayName).toBe('产物')
    expect(renamed[2]?.fields?.[0]?.displayName).toBe('内层字段')
  })
})
