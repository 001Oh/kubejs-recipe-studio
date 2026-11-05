/**
 * BUG-HUNT-02：`augment()` 与 `applyMerge()` 的行为测试。
 *
 * 背景：BUG-HUNT-01 发现 `src/main/schema/registry.ts` 的五层合并核心**零测试覆盖**（BH-011），
 * 并由此长期掩盖了两个逻辑缺陷：
 *   - BH-006：骨架字段全部被降级时，`keptSlots.length > 0 ? keptSlots : slots` 兜底会把同一批
 *             槽位放回 `slots`，而它们已经进了 `extraFields` → 同一 key 出现两次。
 *   - BH-007：`keep()` 被调用两遍且共享 `demoted` 数组，`slots` 里 `zone:'extra'` 的槽位可能被推两次。
 *
 * 本文件只测「最终产出的 schema 长什么样」，不断言内部函数被调用。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'
import {
  applyMerge,
  augment,
  clearSchemas,
  getSchema,
  listSchemas,
  putLayer
} from '@main/schema/registry'

function slot(key: string, zone: RecipeSlotSchema['zone'], extra: Partial<RecipeSlotSchema> = {}): RecipeSlotSchema {
  return { key, displayName: key, kind: 'text', multiple: false, zone, ...extra }
}

function schema(id: string, source: RecipeTypeSchema['source'], parts: Partial<RecipeTypeSchema> = {}): RecipeTypeSchema {
  return {
    id,
    displayName: id,
    modId: id.split(':')[0] ?? 'x',
    modDisplayName: id.split(':')[0] ?? 'x',
    source,
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible',
    ...parts
  }
}

/** 收集一个 schema 里所有槽位 key，并报告重复项。 */
function duplicateKeys(s: RecipeTypeSchema): string[] {
  const all = [...s.slots, ...s.outputs, ...(s.extraFields ?? [])].map((x) => x.key)
  const seen = new Set<string>()
  const dup: string[] = []
  for (const k of all) {
    if (seen.has(k)) dup.push(k)
    else seen.add(k)
  }
  return dup
}

describe('augment：字段提升/降级不得产生重复 key', () => {
  beforeEach(() => {
    clearSchemas()
  })

  it('BH-006：骨架字段与样本完全不重合时，同一字段不得既在 slots 又在 extraFields', () => {
    const skeleton = schema('demo:no-overlap', 'builtin', {
      slots: [slot('onlyInSkeleton', 'input', { required: true })]
    })
    // 样本里的字段出现率都低于 10%，因此不会被「提升」进骨架 → keptSlots 会变空 → 触发兜底分支
    const inferred = schema('demo:no-overlap', 'inferred', {
      sampleCount: 3,
      slots: [slot('onlyInInferred', 'input', { occurrenceRate: 0.05 })]
    })

    const merged = augment(skeleton, inferred)

    expect(duplicateKeys(merged)).toEqual([])
  })

  it('BH-006：骨架字段与样本完全不重合时，被降级的字段 required 必须为 false', () => {
    const skeleton = schema('demo:no-overlap-2', 'builtin', {
      slots: [slot('onlyInSkeleton', 'input', { required: true })]
    })
    const inferred = schema('demo:no-overlap-2', 'inferred', {
      sampleCount: 3,
      slots: [slot('somethingElse', 'input', { occurrenceRate: 0.02 })]
    })

    const merged = augment(skeleton, inferred)
    const live = [...merged.slots, ...(merged.extraFields ?? [])].filter((s) => s.key === 'onlyInSkeleton')

    // 无论落在哪个区，只要还可见就必须已降级为「非必填」，不能出现 required:true 与 required:false 两份
    expect(live.length).toBeGreaterThan(0)
    expect(live.every((s) => s.required !== true)).toBe(true)
  })

  it('BH-007：slots 中 zone=extra 的槽位不得在 extraFields 里出现两次', () => {
    const skeleton = schema('demo:extra-zone', 'builtin', {
      slots: [slot('legend', 'extra')]
    })
    const inferred = schema('demo:extra-zone', 'inferred', {
      sampleCount: 2,
      slots: [slot('other', 'input', { occurrenceRate: 1 })]
    })

    const merged = augment(skeleton, inferred)
    const demotedCopies = (merged.extraFields ?? []).filter((s) => s.key === 'legend')

    expect(demotedCopies).toHaveLength(1)
  })

  it('回归：字段重合时保留在 slots，且不重复出现在 extraFields', () => {
    const skeleton = schema('demo:overlap', 'builtin', {
      slots: [slot('grid', 'input', { required: true })]
    })
    const inferred = schema('demo:overlap', 'inferred', {
      sampleCount: 4,
      slots: [slot('grid', 'input', { occurrenceRate: 1 })]
    })

    const merged = augment(skeleton, inferred)

    expect(merged.slots.map((s) => s.key)).toEqual(['grid'])
    expect((merged.extraFields ?? []).map((s) => s.key)).not.toContain('grid')
    expect(duplicateKeys(merged)).toEqual([])
  })

  it('回归：样本数为 0 时不做降级（不能因为「没有样本」就把整个骨架搬进高级区）', () => {
    const skeleton = schema('demo:no-sample', 'builtin', {
      slots: [slot('a', 'input', { required: true }), slot('b', 'input')]
    })
    const inferred = schema('demo:no-sample', 'inferred', { sampleCount: 0, slots: [] })

    const merged = augment(skeleton, inferred)

    expect(merged.slots.map((s) => s.key).sort()).toEqual(['a', 'b'])
    expect((merged.extraFields ?? []).filter((s) => s.key === 'a' || s.key === 'b')).toEqual([])
  })
})

describe('applyMerge：五层优先级与生效表', () => {
  beforeEach(() => {
    clearSchemas()
  })

  it('plugin 层优先于 builtin 层', () => {
    putLayer('builtin', schema('demo:layer', 'builtin', { displayName: '内置' }))
    putLayer('plugin', schema('demo:layer', 'plugin', { displayName: '插件' }))

    applyMerge({})

    expect(getSchema('demo:layer')?.displayName).toBe('插件')
  })

  it('builtin 优先于 jar(probejs)，但 jar 可补 emitTarget', () => {
    putLayer('builtin', schema('demo:emit', 'builtin', { emitTarget: null }))
    putLayer('jar', schema('demo:emit', 'probejs', { emitTarget: 'event.custom' }))

    applyMerge({})

    const got = getSchema('demo:emit')
    expect(got?.source).toBe('builtin')
    expect(got?.emitTarget).toBe('event.custom')
  })

  it('只有 inferred 时仍能生效，样本数与来源不被改写', () => {
    putLayer('inferred', schema('demo:only-inferred', 'inferred', { sampleCount: 1, lowConfidence: true }))

    applyMerge({})

    const got = getSchema('demo:only-inferred')
    expect(got?.source).toBe('inferred')
    expect(got?.sampleCount).toBe(1)
    expect(got?.lowConfidence).toBe(true)
  })

  it('applyMerge 是幂等的：同样输入两次结果一致', () => {
    putLayer('builtin', schema('demo:idem', 'builtin', { slots: [slot('x', 'input')] }))

    applyMerge({})
    const first = JSON.stringify(getSchema('demo:idem'))
    applyMerge({})
    const second = JSON.stringify(getSchema('demo:idem'))

    expect(second).toBe(first)
  })

  it('listSchemas 能列出生效表里的全部类型', () => {
    putLayer('builtin', schema('demo:a', 'builtin'))
    putLayer('builtin', schema('demo:b', 'builtin'))

    applyMerge({})

    expect(listSchemas().map((s) => s.id).sort()).toEqual(['demo:a', 'demo:b'])
  })
})

describe('RV1-007：extraFields 同名字段去重', () => {
  beforeEach(() => {
    clearSchemas()
  })

  it('降级项与骨架 extraFields 撞名时，extraFields 里只保留一份', () => {
    const skeleton = schema('demo:dup-extra', 'builtin', {
      slots: [slot('dup', 'input', { required: true })],
      extraFields: [slot('dup', 'extra')]
    })
    const inferred = schema('demo:dup-extra', 'inferred', {
      sampleCount: 2,
      slots: [slot('other', 'input', { occurrenceRate: 0.02 })]
    })

    const merged = augment(skeleton, inferred)

    expect((merged.extraFields ?? []).filter((s) => s.key === 'dup')).toHaveLength(1)
    expect(duplicateKeys(merged)).toEqual([])
  })

  it('普通降级（无撞名）仍然把字段放进 extraFields', () => {
    const skeleton = schema('demo:no-dup', 'builtin', {
      slots: [slot('legacy', 'input', { required: true })]
    })
    const inferred = schema('demo:no-dup', 'inferred', {
      sampleCount: 2,
      slots: [slot('modern', 'input', { occurrenceRate: 0.02 })]
    })

    const merged = augment(skeleton, inferred)

    expect((merged.extraFields ?? []).map((s) => s.key)).toEqual(['legacy'])
  })
})

describe('D-49.2 契约守卫：插件骨架 × L1 按阈值叠加（overlay 删除后的唯一防线）', () => {
  beforeEach(() => {
    clearSchemas()
  })

  it('插件骨架走 augment：≥10% 骨架外字段进 slots，<10% 不进，插件原有叫法不被覆盖', () => {
    putLayer(
      'plugin',
      schema('demo:plugin-l1', 'plugin', {
        displayName: '插件骨架',
        slots: [slot('energy', 'input', { displayName: '能量', required: true })]
      })
    )
    putLayer(
      'inferred',
      schema('demo:plugin-l1', 'inferred', {
        sampleCount: 5,
        slots: [
          slot('energy', 'input', { displayName: 'Energy', occurrenceRate: 1 }), // 骨架已有 → 不追加
          slot('duration', 'input', { displayName: '时长', occurrenceRate: 0.3 }), // ≥0.1 → 提升进 slots
          slot('rare', 'input', { displayName: '罕见', occurrenceRate: 0.05 }) // <0.1 → 丢弃
        ]
      })
    )

    applyMerge({})
    const got = getSchema('demo:plugin-l1')!
    const keys = got.slots.map((s) => s.key)

    // ① 叠加契约：L1 高频字段被提升进 slots（这正是 overlay 想测、由 augment 真正兑现的行为）
    expect(keys).toEqual(['energy', 'duration'])
    // ② 插件权威：骨架原有字段保留插件的 displayName，不被 inferred 的 'Energy' 覆盖
    expect(got.slots.find((s) => s.key === 'energy')?.displayName).toBe('能量')
    // ③ 提升语义：required:false + 来源说明，不是悄悄混进必填区
    const duration = got.slots.find((s) => s.key === 'duration')!
    expect(duration.required).toBe(false)
    expect(duration.description).toBe('整合包实测字段（出现率 30%，骨架未声明）')
    // ④ 阈值下限：低于 10% 的新字段不得出现（否则罕见字段会污染主表单）
    expect(keys).not.toContain('rare')
    expect((got.extraFields ?? []).map((s) => s.key)).not.toContain('rare')
    // ⑤ 来源与样本：合并结果仍是插件骨架（不是 inferred），但样本统计取 L1 实测
    expect(got.source).toBe('plugin')
    expect(got.sampleCount).toBe(5)
    // ⑥ 无重复 key（BH-006 同族风险在插件路径上同样成立）
    expect(duplicateKeys(got)).toEqual([])
  })
})
