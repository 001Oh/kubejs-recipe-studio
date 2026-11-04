/**
 * T-117 C：L0 内置精校库的物化与包内容过滤。
 *
 * 两层要分开验证：
 *   1. `materializeRaw` —— RawSchema → NormalizedSchema 的纯转换（布局/槽位/附加字段）
 *   2. `activeL0Schemas` —— 按包内容激活（hasKubejs + 装了该 modId），
 *      以及「裸应用（无 KubeJS）不激活任何 L0 类型」这条产品裁定
 */
import { describe, expect, it } from 'vitest'
import { activeL0Schemas, L0_MOD_IDS, materializeRaw } from '../../src/data/recipeTypes/materialize'
import { thermalSchemas } from '../../src/data/recipeTypes/thermal'

const thermalRaw = thermalSchemas.find((s) => s.id === 'thermal:pulverizer')
if (!thermalRaw) throw new Error('测试基线失效：thermal:pulverizer 不在 L0 库里')

describe('C-1 materializeRaw：RawSchema → NormalizedSchema', () => {
  const schema = materializeRaw(thermalRaw)

  it('id / layoutKind / revision 原样保留，preserveUnknown 恒为 true（不丢未建模字段）', () => {
    expect(schema.id).toBe('thermal:pulverizer')
    expect(schema.layoutKind).toBe(thermalRaw.init.layout)
    expect(schema.revision).toBe(1)
    expect(schema.preserveUnknown).toBe(true)
  })

  it('槽位与产物按声明顺序转换，key 与 multiple 不丢', () => {
    const declared = (thermalRaw.init.slots ?? []).map((s) => s.key)
    expect(schema.slots.slice(0, declared.length).map((s) => s.key)).toEqual(declared)
    expect(schema.outputs.map((s) => s.key)).toEqual(thermalRaw.init.outputs?.map((s) => s.key))
    expect(schema.slots[0].multiple).toBe(true) // ingredients 是可多值
    expect(schema.outputs[0].multiple).toBe(false) // primaryOutput 是单值
  })

  it('extra 字段并进 slots（试点 UI 的附加区按 zone 渲染），不单独开一个数组', () => {
    const extraKeys = (thermalRaw.init.extra ?? []).map((s) => s.key)
    expect(extraKeys.length).toBeGreaterThan(0)
    for (const key of extraKeys) expect(schema.slots.map((s) => s.key)).toContain(key)
  })

  it('supportsChance 只在原始声明为 true 时出现（不无条件塞字段）', () => {
    expect(thermalRaw.init.supportsChance).toBe(true)
    expect(schema.supportsChance).toBe(true)
  })
})

describe('C-2 activeL0Schemas：按包内容激活', () => {
  it('裸应用（没有 KubeJS）：一个 L0 类型都不激活——只留原版家族', () => {
    expect(activeL0Schemas({ hasKubejs: false, installedModIds: [...L0_MOD_IDS] })).toEqual([])
  })

  it('没有整合包：返回空，不抛错', () => {
    expect(activeL0Schemas(null)).toEqual([])
  })

  it('装了 KubeJS 但没装对应模组：不激活该模组的类型', () => {
    const out = activeL0Schemas({ hasKubejs: true, installedModIds: ['minecraft', 'kubejs'] })
    expect(out).toEqual([])
  })

  it('装了 KubeJS + thermal：只激活 thermal 系，id 全部带 thermal 命名空间', () => {
    const out = activeL0Schemas({ hasKubejs: true, installedModIds: ['minecraft', 'kubejs', 'thermal'] })
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((s) => s.id.startsWith('thermal:'))).toBe(true)
    expect(out.map((s) => s.id)).toContain('thermal:pulverizer')
  })

  it('多包同时安装：各自激活，互不干扰，且 id 唯一（防重复装配）', () => {
    const out = activeL0Schemas({
      hasKubejs: true,
      installedModIds: ['minecraft', 'kubejs', ...L0_MOD_IDS]
    })
    const ids = out.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const modId of L0_MOD_IDS) {
      expect(ids.some((id) => id.startsWith(`${modId}:`))).toBe(true)
    }
  })
})
