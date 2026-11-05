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

describe('B120/D-06：ars/pnc 接线 + thermal jar 实名别名 + D-28 钉测', () => {
  const PACK = { hasKubejs: true, installedModIds: ['thermal_foundation', 'ars_nouveau', 'pneumaticcraft'] }

  it('thermal 以 jar 实名 thermal_foundation 激活，类型 id 仍是 thermal:*', () => {
    const ids = activeL0Schemas(PACK).map((s) => s.id)
    expect(ids).toContain('thermal:pulverizer')
    expect(ids).toContain('thermal:press')
    expect(ids).toContain('thermal:smelter')
  })

  it('ars_nouveau 4 条 + pneumaticcraft 6 条按 modId 激活（B120/D-35 修错 id 后的真实条数）', () => {
    const ids = activeL0Schemas(PACK).map((s) => s.id)
    // ars 原 5 条：删掉 sourcelink（RecipeRegistry 无此注册名）→ 4
    expect(ids.filter((i) => i.startsWith('ars_nouveau:')).length).toBe(4)
    expect(ids).not.toContain('ars_nouveau:sourcelink')
    // pnc 原 5 条：assembly 拆成 assembly_drill + assembly_laser（+1）、explosion→explosion_crafting、
    // thermopneumatic→thermo_plant（改名不增减）→ 6
    expect(ids.filter((i) => i.startsWith('pneumaticcraft:')).length).toBe(6)
    for (const id of ['pneumaticcraft:assembly_drill', 'pneumaticcraft:assembly_laser', 'pneumaticcraft:explosion_crafting', 'pneumaticcraft:thermo_plant']) {
      expect(ids, id).toContain(id)
    }
    for (const id of ['pneumaticcraft:assembly', 'pneumaticcraft:explosion', 'pneumaticcraft:thermopneumatic']) {
      expect(ids, id).not.toContain(id)
    }
  })

  it('installedModIds 仅含 thermal_foundation 时 thermal 全量激活（实测 13 条，台账写 3 条系口径误差）', () => {
    const ids = activeL0Schemas({ hasKubejs: true, installedModIds: ['thermal_foundation'] }).map((s) => s.id)
    expect(ids.length).toBe(thermalSchemas.length)
    expect(ids.every((i) => i.startsWith('thermal:'))).toBe(true)
  })

  it('D-28：createSchemas 永不进 L0（L0_PACKS 导出钉住）', async () => {
    const { L0_PACKS } = await import('../../src/data/recipeTypes/materialize')
    const { createSchemas } = await import('../../src/data/recipeTypes/create')
    expect(L0_PACKS).not.toContain(createSchemas)
    const all = L0_PACKS.flat().map((r) => r.id)
    expect(all.some((id) => id.startsWith('create:'))).toBe(false)
    expect(
      activeL0Schemas({ hasKubejs: true, installedModIds: ['create', 'minecraft'] })
        .map((s) => s.id)
        .some((id) => id.startsWith('create:'))
    ).toBe(false)
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
