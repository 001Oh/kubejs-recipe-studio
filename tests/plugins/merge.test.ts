/** 五层优先级合并单测（规格 3.6.14 优先级表 + 架构决策 6）＋ applyFieldNames 词典套用。
 *  B121/D-49.2：「插件 + L1 叠加」契约由 registry.augment 在生产兑现（规格 3.6.3），
 *  原指向已删平行实现 overlayPluginOntoInferred 的叠加用例同步移除。 */
import { describe, expect, it } from 'vitest'
import type { PluginManifest, RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'
import {
  applyFieldNames,
  LAYER_RANK,
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

describe('字段词典（applyFieldNames）只改没被作者显式命名的槽位', () => {
  it('字段词典只改没被作者显式命名的槽位', () => {
    const renamed = applyFieldNames([slot('pentacle_id', 'pentacle_id'), slot('result', '产物'), slot('nested', 'nested', { kind: 'struct', fields: [slot('inner', 'inner')] })], { pentacle_id: '法阵等级', inner: '内层字段' })
    expect(renamed[0]?.displayName).toBe('法阵等级')
    expect(renamed[1]?.displayName).toBe('产物')
    expect(renamed[2]?.fields?.[0]?.displayName).toBe('内层字段')
  })
})
