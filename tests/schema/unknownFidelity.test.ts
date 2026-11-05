/**
 * B121/S-1 + S-7 + S-10：归一化保真钉子（红-绿取证：revert unknownFields.ts / normalize.ts
 * / draftApply.ts 对应修复 → 本文件变红）。
 *
 * S-1：struct 内超限未认领子树，normalize→脏写→denormalize 往返必须原样带回——
 *      此前深度截断写回 {__type:'object'} 骨架、超字节静默丢键，落盘配方被损坏。
 * S-7：流体形态保真——裸串/`{fluidStack:{fluid}}` 嵌套不得因编辑别的槽而漂移。
 * S-10：multiple=false 槽的草稿脏写输出单值（与原形态一致），不漂移成数组。
 */
import { describe, expect, it } from 'vitest'
import type { NormalizedSchema, NormalizedSchemaSlot } from '@shared/schemaModel'
import { normalizeRecipe, denormalizeRecipe } from '@shared/normalize'
import { applyDraftToNormalized } from '@shared/draftApply'
import type { SlotValue, WorkbenchState } from '@shared/types'

function structSchema(slot: NormalizedSchemaSlot): NormalizedSchema {
  return { id: 'demo:x', layoutKind: 'custom', slots: [slot], outputs: [], revision: 1, preserveUnknown: true }
}

function item(id: string, count?: number): SlotValue {
  return { kind: 'item', id, ...(count !== undefined ? { count } : {}) }
}

describe('S-1 struct 内截断未知子树的往返保真', () => {
  const slot: NormalizedSchemaSlot = {
    key: 'itemInput',
    kind: 'struct',
    multiple: false,
    jsonKey: 'itemInput',
    fields: [{ key: 'item', kind: 'item', multiple: false, jsonKey: 'item' }]
  }

  function bench(values: Record<string, unknown>): WorkbenchState {
    return { typeId: 'demo:x', layoutKind: 'custom', values, activeSlotKey: null }
  }

  it('深度截断（>3 层）的未认领子树：编辑 struct 后原样带回，绝不写骨架', () => {
    const deep = { keep: 1, nested: { a: { b: { c: { d: 1 } } } } }
    const raw = { type: 'demo:x', itemInput: { item: 'minecraft:iron', ...deep } }
    const schema = structSchema(slot)
    const { normalized, diagnostics } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    // 截断事实必须可见（此前 struct 内零诊断）
    expect(diagnostics.some((d) => d.code === 'UNKNOWN_TRUNCATED')).toBe(true)
    // struct 槽的草稿写是嵌套对象（子键寻址），不是整槽替换
    const applied = applyDraftToNormalized(
      normalized,
      bench({ itemInput: { item: item('minecraft:gold') } }),
      ['itemInput']
    )
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['itemInput'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    const written = out.json['itemInput'] as Record<string, unknown>
    expect(written['item']).toEqual({ item: 'minecraft:gold' })
    // 修复前：这里是 {__type:'object',keys:N} 骨架；修复后：原始子树原样带回
    expect(written['nested']).toEqual(deep.nested)
    expect(JSON.stringify(written)).not.toContain('__type')
  })

  it('超字节（>8KB）的未认领子树：编辑 struct 后原样带回，绝不静默丢键', () => {
    const blob = 'y'.repeat(10 * 1024)
    const raw = { type: 'demo:x', itemInput: { item: 'minecraft:iron', blob } }
    const schema = structSchema(slot)
    const { normalized, diagnostics } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    expect(diagnostics.some((d) => d.code === 'UNKNOWN_TRUNCATED')).toBe(true)
    const applied = applyDraftToNormalized(
      normalized,
      bench({ itemInput: { item: item('minecraft:gold') } }),
      ['itemInput']
    )
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['itemInput'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    const written = out.json['itemInput'] as Record<string, unknown>
    expect(written['item']).toEqual({ item: 'minecraft:gold' })
    // 修复前：blob 键整体消失；修复后：原文 10KB 原样带回
    expect(written['blob']).toBe(blob)
  })

  it('struct 草稿只提子键：未提及的子字段与 unknowns 全部原样保留', () => {
    const raw = { type: 'demo:x', itemInput: { item: 'minecraft:iron', side: 'minecraft:coal' } }
    const schema = structSchema(slot)
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const applied = applyDraftToNormalized(
      normalized,
      bench({ itemInput: { item: item('minecraft:gold') } }),
      ['itemInput']
    )
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['itemInput'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    const written = out.json['itemInput'] as Record<string, unknown>
    expect(written['item']).toEqual({ item: 'minecraft:gold' })
    // 未提及子键（未认领）原样带回
    expect(written['side']).toBe('minecraft:coal')
  })
})

describe('S-7 流体形态保真', () => {
  const slot: NormalizedSchemaSlot = { key: 'fluid', kind: 'fluid', multiple: false, jsonKey: 'fluid' }
  const schema = structSchema(slot)

  function roundtripFluid(rawFluid: unknown, edited: SlotValue[]): unknown {
    const raw = { type: 'demo:x', fluid: rawFluid }
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const applied = applyDraftToNormalized(normalized, { typeId: 'demo:x', layoutKind: 'custom', values: { fluid: edited }, activeSlotKey: null }, ['fluid'])
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['fluid'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    return out.json['fluid']
  }

  it('裸字符串流体：编辑 id-only 写回对象形态（被替换的值取 UI 形态；未编辑的值由 base 复用保裸串）', () => {
    expect(roundtripFluid('minecraft:water', [{ kind: 'fluid', id: 'minecraft:lava' }])).toEqual({
      fluid: 'minecraft:lava'
    })
  })

  it('裸字符串流体 + 编辑时带数量：必须升格为对象，数量不丢', () => {
    expect(roundtripFluid('minecraft:water', [{ kind: 'fluid', id: 'minecraft:lava', amount: 100 }])).toEqual({
      fluid: 'minecraft:lava',
      amount: 100
    })
  })

  it('fluidStack 嵌套形态：脏写后保持 {fluidStack:{fluid}} 结构', () => {
    const written = roundtripFluid({ fluidStack: { fluid: 'minecraft:water' } }, [{ kind: 'fluid', id: 'minecraft:lava' }])
    expect(written).toEqual({ fluidStack: { fluid: 'minecraft:lava' } })
  })

  it('对象形态流体：脏写后仍是 {fluid:...} 对象', () => {
    expect(roundtripFluid({ fluid: 'minecraft:water' }, [{ kind: 'fluid', id: 'minecraft:lava', amount: 100 }])).toEqual({
      fluid: 'minecraft:lava',
      amount: 100
    })
  })
})

describe('S-10 单值槽形态不漂移', () => {
  const schema: NormalizedSchema = {
    id: 'demo:s',
    layoutKind: 'custom',
    slots: [{ key: 'ingredient', kind: 'item', multiple: false, jsonKey: 'ingredient' }],
    outputs: [],
    revision: 1,
    preserveUnknown: true
  }

  it('原始单对象 + 数组草稿脏写 → 输出仍是单对象（此前漂移成数组）', () => {
    const raw = { type: 'demo:s', ingredient: { item: 'minecraft:stone' } }
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const applied = applyDraftToNormalized(
      normalized,
      { typeId: 'demo:s', layoutKind: 'custom', values: { ingredient: [item('minecraft:iron')] }, activeSlotKey: null },
      ['ingredient']
    )
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['ingredient'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    expect(out.json['ingredient']).toEqual({ item: 'minecraft:iron' })
  })

  it('原始裸字符串 + 编辑 id → 写回对象形态（编辑值取 UI 形态；asObject:false 镜像会在加数量时丢值，已弃用）', () => {
    const raw = { type: 'demo:s', ingredient: 'minecraft:stone' }
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const applied = applyDraftToNormalized(
      normalized,
      { typeId: 'demo:s', layoutKind: 'custom', values: { ingredient: [item('minecraft:iron')] }, activeSlotKey: null },
      ['ingredient']
    )
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['ingredient'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    expect(out.json['ingredient']).toEqual({ item: 'minecraft:iron' })
  })

  it('单对象草稿（控件 valueSet 形态）脏写不再被静默丢弃（B121/R-1）', () => {
    const raw = { type: 'demo:s', ingredient: { item: 'minecraft:stone' } }
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const applied = applyDraftToNormalized(
      normalized,
      { typeId: 'demo:s', layoutKind: 'custom', values: { ingredient: item('minecraft:gold') }, activeSlotKey: null },
      ['ingredient']
    )
    const out = denormalizeRecipe(applied, schema, { dirtyFields: ['ingredient'] })
    if (out.kind !== 'json') throw new Error('denormalize 未返回 json')
    expect(out.json['ingredient']).toEqual({ item: 'minecraft:gold' })
  })
})
