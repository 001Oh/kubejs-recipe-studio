import { describe, expect, it } from 'vitest'
import { normalizeRecipe, denormalizeRecipe } from '@shared/normalize'
import { hashRaw, canonicalStringify } from '@shared/canonicalJson'
import { checkDraftConflict, createDraftMeta, markFieldDirty, rebaseDraft } from '@shared/draftState'
import type { NormalizedRecipe, NormalizedSchema } from '@shared/schemaModel'
import { normalizeArgs, schemas, samples } from './fixtures'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** 在规范化结果上模拟一次用户编辑（只改指定槽位），返回新的 NormalizedRecipe */
function edit(normalized: NormalizedRecipe, slotKey: string, mutate: (n: NormalizedRecipe) => void): NormalizedRecipe {
  const copy = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
  mutate(copy)
  void slotKey
  return copy
}

describe('① 三类首批配方的规范化（真实样本）', () => {
  it('shaped：pattern×key → 网格；conditions 进 unknowns 并标 ambient', () => {
    const { normalized, diagnostics } = normalizeRecipe(normalizeArgs('shaped'))
    const grid = normalized.slots.find((s) => s.key === 'grid')?.value
    expect(grid?.kind).toBe('list')
    if (grid?.kind === 'list') {
      expect(grid.of).toHaveLength(9)
      expect(grid.of[0]?.kind).toBe('tag') // I → mekanism:alloys/reinforced
      expect(grid.of[1]?.kind).toBe('tag') // # → forge:plates/calorite
      expect(grid.of[5]?.kind).toBe('tag') // P → pellets/polonium
      expect(grid.of[4]?.kind).toBe('item') // A → mekanism:module_base
    }
    const result = normalized.slots.find((s) => s.key === 'result')?.value
    expect(result?.kind).toBe('item')
    const conditions = normalized.unknowns.find((u) => u.path === '$.conditions')
    expect(conditions?.reason).toBe('ambient-condition')
    expect(conditions?.value).toBeTruthy()
    expect(normalized.partial.reasons).toEqual(expect.arrayContaining(['unclaimed-keys', 'ambient-conditions']))
    expect(diagnostics).toEqual([])
  })

  it('shapeless：ingredients 列表与 result 单值', () => {
    const { normalized } = normalizeRecipe(normalizeArgs('shapeless'))
    const ingredients = normalized.slots.find((s) => s.key === 'ingredients')?.value
    expect(ingredients?.kind).toBe('list')
    if (ingredients?.kind === 'list') {
      expect(ingredients.of).toHaveLength(1)
      expect(ingredients.of[0]).toMatchObject({ kind: 'item', id: 'ad_astra_giselle_addon:netherite_oxygen_can' })
    }
    expect(normalized.unknowns).toEqual([])
    expect(normalized.partial.isPartial).toBe(false)
  })

  it('create:mixing：物品 + 标签混合材料、results 列表', () => {
    const { normalized } = normalizeRecipe(normalizeArgs('mixing'))
    const ingredients = normalized.slots.find((s) => s.key === 'ingredients')?.value
    expect(ingredients?.kind).toBe('list')
    if (ingredients?.kind === 'list') {
      expect(ingredients.of[0]).toMatchObject({ kind: 'item', id: 'minecraft:andesite' })
      expect(ingredients.of[1]).toMatchObject({ kind: 'tag', id: 'forge:nuggets/iron' })
    }
    const results = normalized.slots.find((s) => s.key === 'results')?.value
    expect(results?.kind).toBe('list')
    expect(normalized.partial.isPartial).toBe(false)
  })
})

describe('② 未知字段完整保留（IE 电弧炉真实样本）', () => {
  it('secondaries/slag/energy/time 全部进 unknowns，partial 标 unclaimed-keys', () => {
    const { normalized } = normalizeRecipe(normalizeArgs('arcFurnace'))
    const paths = normalized.unknowns.map((u) => u.path).sort()
    expect(paths).toEqual(expect.arrayContaining(['$.conditions', '$.energy', '$.time']))
    expect(normalized.unknowns.find((u) => u.path === '$.energy')?.value).toBe(286720)
    expect(normalized.partial.reasons).toContain('unclaimed-keys')
    expect(normalized.partial.reasons).toContain('ambient-conditions')
  })

  it('未编辑反解 = 原始 JSON（深相等，且原始对象未被修改）', () => {
    const raw = samples.arcFurnace.json
    const frozen = deepFreeze(JSON.parse(JSON.stringify(raw)) as Record<string, unknown>)
    const { raw: _ignored, ...rest } = normalizeArgs('arcFurnace')
    void _ignored
    const { normalized } = normalizeRecipe({ ...rest, raw: frozen })
    const output = denormalizeRecipe(normalized, schemas.arcFurnace as import('@shared/schemaModel').NormalizedSchema)
    expect(output.kind).toBe('json')
    if (output.kind === 'json') expect(output.json).toEqual(raw)
    // 原始对象仍然可用（没有因冻结/规范化被改写）
    expect(frozen).toEqual(raw)
  })

  it('编辑一个已建模字段：其余键逐值不变', () => {
    const raw = JSON.parse(JSON.stringify(samples.arcFurnace.json)) as Record<string, unknown>
    const args = normalizeArgs('arcFurnace')
    const { normalized } = normalizeRecipe({ ...args, raw })
    const edited = edit(normalized, 'additives', (copy) => {
      const slot = copy.slots.find((s) => s.key === 'additives')
      if (slot?.value?.kind === 'list' && slot.value.of[0]?.kind === 'item') {
        slot.value.of[0].id = 'minecraft:charcoal'
      }
    })
    const out = denormalizeRecipe(edited, schemas.arcFurnace as import('@shared/schemaModel').NormalizedSchema, { dirtyFields: ['additives'] })
    expect(out.kind).toBe('json')
    if (out.kind !== 'json') return
    expect((out.json['additives'] as unknown[])[0]).toEqual({ item: 'minecraft:charcoal' })
    // 未编辑的字段与未知字段逐值保留
    expect(out.json['energy']).toBe(raw['energy'])
    expect(out.json['time']).toBe(raw['time'])
    expect(out.json['conditions']).toEqual(raw['conditions'])
    expect(out.json['results']).toEqual(raw['results'])
  })
})

describe('③ 配对字段规范化与反向还原；类型不归一', () => {
  const schema: NormalizedSchema = {
    id: 'demo:mix',
    layoutKind: 'multi_io',
    slots: [
      { key: 'inputs', kind: 'item', multiple: true, required: true, compound: ['count', 'chance'] },
      { key: 'fluid', kind: 'fluid', multiple: false }
    ],
    outputs: []
  }
  const raw = {
    type: 'demo:mix',
    inputs: [
      { item: 'a:one', count: 4, chance: '0.07' },
      { item: 'a:two' }
    ],
    fluid: { fluid: 'a:water', amount: 500 }
  }

  it('count/chance/amount 保留原始 JSON 类型（"0.07" vs 0.07）', () => {
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const inputs = normalized.slots.find((s) => s.key === 'inputs')?.value
    expect(inputs?.kind).toBe('list')
    if (inputs?.kind === 'list') {
      const first = inputs.of[0]
      expect(first).toMatchObject({ kind: 'item', id: 'a:one' })
      if (first?.kind === 'item') {
        expect(first.count).toEqual({ raw: 4, numeric: 4 })
        expect(first.chance).toEqual({ raw: '0.07', numeric: 0.07 })
        expect(typeof first.chance?.raw).toBe('string')
      }
    }
    const fluid = normalized.slots.find((s) => s.key === 'fluid')?.value
    expect(fluid).toMatchObject({ kind: 'fluid', id: 'a:water', amount: { raw: 500, numeric: 500 } })
  })

  it('未编辑反解深相等；编辑 id 后 count/chance 仍按原类型写回', () => {
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const clean = denormalizeRecipe(normalized, schema)
    expect(clean.kind).toBe('json')
    if (clean.kind === 'json') expect(clean.json).toEqual(raw)

    const edited = edit(normalized, 'inputs', (copy) => {
      const slot = copy.slots.find((s) => s.key === 'inputs')
      if (slot?.value?.kind === 'list' && slot.value.of[0]?.kind === 'item') slot.value.of[0].id = 'a:three'
    })
    const out = denormalizeRecipe(edited, schema, { dirtyFields: ['inputs'] })
    expect(out.kind).toBe('json')
    if (out.kind !== 'json') return
    expect(out.json['inputs']).toEqual([
      { item: 'a:three', count: 4, chance: '0.07' },
      { item: 'a:two' }
    ])
    expect(out.json['fluid']).toEqual(raw.fluid)
  })
})

describe('④ 标量类型与数组顺序', () => {
  const schema: NormalizedSchema = {
    id: 'demo:scalars',
    layoutKind: 'custom',
    slots: [
      { key: 'n', kind: 'number', multiple: false },
      { key: 'b', kind: 'boolean', multiple: false },
      { key: 's', kind: 'text', multiple: false },
      { key: 'nil', kind: 'text', multiple: false },
      { key: 'arr', kind: 'text', multiple: true }
    ],
    outputs: []
  }
  const raw = { type: 'demo:scalars', n: 0, b: false, s: '', nil: null, arr: [3, 1, 2] }

  it('0 / false / "" / null 不被当作缺失，数组顺序保持', () => {
    const { normalized } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const byKey = new Map(normalized.slots.map((s) => [s.key, s.value]))
    expect(byKey.get('n')).toEqual({ kind: 'scalar', value: 0, path: '$.n' })
    expect(byKey.get('b')).toEqual({ kind: 'scalar', value: false, path: '$.b' })
    expect(byKey.get('s')).toEqual({ kind: 'scalar', value: '', path: '$.s' })
    expect(byKey.get('nil')).toEqual({ kind: 'scalar', value: null, path: '$.nil' })
    const arr = byKey.get('arr')
    expect(arr?.kind).toBe('list')
    if (arr?.kind === 'list') expect(arr.of.map((v) => (v?.kind === 'scalar' ? v.value : null))).toEqual([3, 1, 2])
    const clean = denormalizeRecipe(normalized, schema)
    if (clean.kind === 'json') expect(clean.json).toEqual(raw)
  })
})

describe('⑤ 未认领字段的限幅（深度 / 8KB）', () => {
  const schema: NormalizedSchema = { id: 'demo:x', layoutKind: 'custom', slots: [], outputs: [] }

  it('深度超过 3 层只保留骨架，标 truncatedDepth', () => {
    const raw = { type: 'demo:x', deep: { a: { b: { c: { d: 1 } } } } }
    const { normalized, diagnostics } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const deep = normalized.unknowns.find((u) => u.path === '$.deep')
    expect(deep?.truncatedDepth).toBe(true)
    expect(normalized.partial.reasons).toContain('unknowns-truncated')
    expect(diagnostics.some((d) => d.code === 'UNKNOWN_TRUNCATED')).toBe(true)
    // 原始数据仍然完整
    expect((normalized.source.raw as Record<string, unknown>)['deep']).toEqual(raw.deep)
  })

  it('单条超过 8KB 不展开、不误标 parse-failed，原文保留', () => {
    const raw = { type: 'demo:x', blob: 'x'.repeat(10 * 1024) }
    const { normalized, diagnostics } = normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } })
    const blob = normalized.unknowns.find((u) => u.path === '$.blob')
    expect(blob?.value).toBeUndefined()
    expect(blob?.bytes).toBeGreaterThan(8 * 1024)
    expect(blob?.reason).toBe('not-in-schema')
    expect(normalized.partial.reasons).toContain('unknowns-truncated')
    expect(normalized.partial.reasons).not.toContain('parse-failed')
    expect(diagnostics.some((d) => d.code === 'UNKNOWN_TRUNCATED')).toBe(true)
    expect((normalized.source.raw as Record<string, unknown>)['blob']).toHaveLength(10 * 1024)
  })
})

describe('⑥ 原始 Hash 变化时的冲突保护 / dirtyFields 语义', () => {
  it('dirtyFields 只有用户显式标记才非空；hash 变化 → conflict，rebase 才清空', () => {
    const args = normalizeArgs('mixing')
    const { normalized } = normalizeRecipe(args)
    const meta = createDraftMeta({ uid: normalized.source.uid, rawHash: normalized.rawHash })
    expect(meta.dirtyFields).toEqual([])
    expect(checkDraftConflict(meta, normalized.rawHash)).toBe('clean')

    const changed = { ...samples.mixing.json, extra: 1 }
    expect(hashRaw(changed)).not.toBe(normalized.rawHash)
    expect(checkDraftConflict(meta, hashRaw(changed))).toBe('conflict')

    const dirty = markFieldDirty(meta, 'ingredients')
    expect(dirty.dirtyFields).toEqual(['ingredients'])
    const rebased = rebaseDraft(dirty, { uid: 'u', rawHash: hashRaw(changed) })
    expect(rebased.dirtyFields).toEqual([])
    expect(checkDraftConflict(rebased, hashRaw(changed))).toBe('clean')
  })

  it('canonicalStringify 区分数字与字符串', () => {
    expect(canonicalStringify({ chance: 0.07 })).not.toBe(canonicalStringify({ chance: '0.07' }))
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }))
  })
})

describe('⑦ 文本级原样保留（可选能力）', () => {
  it('未编辑且提供 rawText 时按文本返回', () => {
    const args = normalizeArgs('mixing')
    const { normalized } = normalizeRecipe(args)
    const out = denormalizeRecipe(normalized, schemas.mixing as import('@shared/schemaModel').NormalizedSchema, { preferRawText: true })
    expect(out.kind).toBe('text')
    if (out.kind === 'text') expect(out.text).toBe(args.rawText)
  })
})
