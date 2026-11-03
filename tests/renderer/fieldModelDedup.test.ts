/**
 * BUG-HUNT-03 证据补齐 BH-006 / BH2-002：`fieldModel.declaredFields()` 的去重与优先级。
 *
 * 背景：BH2-002 更正了 BH-006 的影响描述——`augment()` 的重复 key 不会造成"重复渲染"，
 * 因为 UI 侧 `declaredFields` 会按 key 去重。但该去重**此前没有任何测试**，
 * 只靠源码阅读支撑，属于本闭环审计点名的证据缺口。
 *
 * 本文件锁定三条契约：
 *   1. 同 key 只出现一次（无论来自 slots / outputs / extraFields）；
 *   2. 优先级 = `slots → outputs → extraFields` 的**先到者胜**（与实现顺序一致）；
 *   3. 被 `compound` 吃掉的原键（如配对数里量）不再单独声明。
 */
import { describe, expect, it } from 'vitest'
import type { RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'
import { bucketFields, declaredFields } from '@renderer/views/bench/fieldModel'

function slot(key: string, over: Partial<RecipeSlotSchema> = {}): RecipeSlotSchema {
  return { key, displayName: key, kind: 'text', multiple: false, zone: 'input', ...over }
}

function schemaOf(over: Partial<RecipeTypeSchema> = {}): RecipeTypeSchema {
  return {
    id: 'demo:fields',
    displayName: '字段测试',
    modId: 'demo',
    modDisplayName: 'demo',
    source: 'builtin',
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible',
    ...over
  }
}

const keys = (s: RecipeTypeSchema): string[] => declaredFields(s).map((f) => f.key)

describe('BH-006 / BH2-002：declaredFields 的去重与优先级', () => {
  it('slots 与 outputs 出现同 key 时只声明一次', () => {
    const s = schemaOf({ slots: [slot('result')], outputs: [slot('result', { zone: 'output' })] })
    expect(keys(s)).toEqual(['result'])
  })

  it('slots 与 extraFields 出现同 key 时只声明一次，且采用 slots 那份（先到者胜）', () => {
    const s = schemaOf({
      slots: [slot('legacy', { required: true })],
      extraFields: [slot('legacy', { required: false, zone: 'extra' })]
    })

    const declared = declaredFields(s)
    expect(declared).toHaveLength(1)
    expect(declared[0]?.required).toBe(true)
  })

  it('降级字段只存在于 extraFields 时仍会被声明，且 required 为 false（不会被误当必填）', () => {
    const s = schemaOf({ extraFields: [slot('demoted', { required: false, zone: 'extra' })] })

    const declared = declaredFields(s)
    expect(declared.map((f) => f.key)).toEqual(['demoted'])
    expect(declared[0]?.required).toBe(false)
  })

  it('不同 key 全部保留：去重不会误删正常字段', () => {
    const s = schemaOf({
      slots: [slot('a'), slot('b')],
      outputs: [slot('c', { zone: 'output' })],
      extraFields: [slot('d', { zone: 'extra' })]
    })

    expect(keys(s).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('被 compound 吸收的原始键不再单独声明（配对合并语义）', () => {
    const s = schemaOf({
      slots: [slot('item', { compound: ['count'], kind: 'item' }), slot('count', { kind: 'number' })]
    })

    // count 被 item 吸收 → 只声明 item
    expect(keys(s)).toEqual(['item'])
  })

  it('bucketFields 也基于去重后的字段：不会把同一 key 分到两个区', () => {
    const s = schemaOf({
      slots: [slot('dup', { kind: 'item' })],
      outputs: [slot('dup', { kind: 'item', zone: 'output' })]
    })

    const buckets = bucketFields(s)
    const all = [...buckets.inputs, ...buckets.outputs, ...buckets.extras, ...buckets.secondaries, ...buckets.advanced]
    expect(all.filter((f) => f.key === 'dup')).toHaveLength(1)
    expect(buckets.inputs.map((f) => f.key)).toEqual(['dup'])
  })

  it('空 schema / null 安全：返回空数组', () => {
    expect(declaredFields(null)).toEqual([])
    expect(declaredFields(schemaOf())).toEqual([])
  })
})
