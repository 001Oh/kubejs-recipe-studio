/**
 * P2-2：compound 槽（如 Mekanism { base_ingredient:{...}, count:4 } 配对数量）编辑回写时，
 * denormalize 只替换引用对象、不清理 raw 里的旧顶层数量键 → 新旧双值并存，
 * 游戏侧解析结果取决于键序。修复：schema 声明 compound 的槽回写时清掉旧顶层数量键；
 * 普通（非 compound）槽零影响。
 */
import { describe, expect, it } from 'vitest'
import type { NormalizedSchema } from '@shared/schemaModel'
import { denormalizeRecipe, normalizeRecipe } from '@shared/normalize'

const COMPOUND_SCHEMA: NormalizedSchema = {
  id: 'mekanism:crushing',
  layoutKind: 'custom',
  revision: 1,
  preserveUnknown: true,
  slots: [{ key: 'base_ingredient', kind: 'item', multiple: false, jsonKey: 'base_ingredient', compound: ['count'] }],
  outputs: []
}

const RAW = { type: 'mekanism:crushing', base_ingredient: { item: 'minecraft:iron_ingot' }, count: 4 }

function normalize(raw: Record<string, unknown>) {
  return normalizeRecipe({
    raw,
    rawText: JSON.stringify(raw),
    schema: COMPOUND_SCHEMA,
    uid: 'test:compound',
    source: { source: 'datapack', sourcePath: 'c.json' }
  }).normalized
}

describe('P2-2 compound 槽回写不得双值并存', () => {
  it('编辑 compound 槽后：数量只存在一处（对象内），旧顶层键被清理', () => {
    const normalized = normalize(JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>)
    // 用户把数量改成 6（touchDirty 等价：dirtyFields 指向该槽）
    const out = denormalizeRecipe(normalized, COMPOUND_SCHEMA, { dirtyFields: ['base_ingredient'] })
    if (out.kind !== 'json') throw new Error('期望 json 输出')
    const nested = (out.json['base_ingredient'] as Record<string, unknown>)['count']
    expect(nested).toBe(4) // 对象内数量保留（未改值时与原值一致）
    // 修复前（红）：顶层 count 仍在 → 双值并存
    expect(out.json['count']).toBeUndefined()
  })

  it('用户清空数量后：顶层与对象内都不应残留旧数量', () => {
    const normalized = normalize(JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>)
    const slot = normalized.slots.find((s) => s.key === 'base_ingredient')
    if (!slot || slot.value === null) throw new Error('槽位应存在')
    const cleared = { ...slot, value: { ...slot.value, count: undefined } as typeof slot.value }
    const out = denormalizeRecipe(
      { ...normalized, slots: normalized.slots.map((s) => (s.key === 'base_ingredient' ? cleared : s)) },
      COMPOUND_SCHEMA,
      { dirtyFields: ['base_ingredient'] }
    )
    if (out.kind !== 'json') throw new Error('期望 json 输出')
    expect(out.json['count']).toBeUndefined()
    expect((out.json['base_ingredient'] as Record<string, unknown>)['count']).toBeUndefined()
  })

  it('普通（非 compound）槽零影响：同名顶层键不会被误删', () => {
    const plainSchema: NormalizedSchema = {
      id: 'test:plain',
      layoutKind: 'custom',
      revision: 1,
      preserveUnknown: true,
      slots: [{ key: 'base_ingredient', kind: 'item', multiple: false, jsonKey: 'base_ingredient' }],
      outputs: []
    }
    const raw = { type: 'test:plain', base_ingredient: { item: 'minecraft:iron_ingot' }, count: 4 }
    const { normalized } = normalizeRecipe({
      raw,
      rawText: JSON.stringify(raw),
      schema: plainSchema,
      uid: 'test:plain',
      source: { source: 'datapack', sourcePath: 'p.json' }
    })
    const out = denormalizeRecipe(normalized, plainSchema, { dirtyFields: ['base_ingredient'] })
    if (out.kind !== 'json') throw new Error('期望 json 输出')
    // 无 compound 声明时顶层 count 是独立未知字段，必须原样保留
    expect(out.json['count']).toBe(4)
  })
})
