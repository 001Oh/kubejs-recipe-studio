/**
 * B121/S-2：L0「声明 → NormalizedSchema → RecipeTypeSchema → 规范化视图」三级透传钉子。
 *
 * 修复前：convSlot 只透传 zone/role/label/docUrl，materializeRaw 丢 emit/grid/cells/requirements，
 * slotOf 强制覆盖 zone 且丢 supportsChance——L0 的 compound/emitShape/sugarSupported/min/max/
 * 语法糖目标/附加区在装配链上全部蒸发，「精校库」到达编辑器只剩骨架。
 *
 * 红-绿取证：revert materialize.ts / service.ts(slotOf+pilotToSchema) / selectSchema.ts(slotOf)
 * 对应透传 → 本文件变红。
 */
import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/l0-fields-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

import { activeL0Schemas, materializeRaw } from '../../src/data/recipeTypes/materialize'
import { pilotToSchema } from '@main/schema/service'
import { immersiveengineeringSchemas } from '../../src/data/recipeTypes/immersiveengineering'
import { thermalSchemas } from '../../src/data/recipeTypes/thermal'

const PACK = { hasKubejs: true, installedModIds: ['immersiveengineering', 'thermal_foundation'] }

function l0SchemaById(id: string) {
  const raw = [...immersiveengineeringSchemas, ...thermalSchemas].find((r) => r.id === id)
  if (!raw) throw new Error(`测试预期存在 L0 声明：${id}`)
  return raw
}

describe('S-2 convSlot 槽位语义字段透传（materializeRaw）', () => {
  it('IE 电弧炉 results 槽：compound + emitShape + required 存活', () => {
    const arc = l0SchemaById('immersiveengineering:arc_furnace')
    const schema = materializeRaw(arc)
    const results = schema.outputs.find((s) => s.key === 'results')
    expect(results).toBeDefined()
    expect(results?.compound).toEqual(['base_ingredient', 'count'])
    expect(results?.emitShape).toBe('object')
    expect(results?.required).toBe(true)
    expect(results?.multiple).toBe(true)
  })

  it('IE 电弧炉 secondaries 槽：sugarSupported:false 存活（通道自动降级的唯一依据）', () => {
    const arc = l0SchemaById('immersiveengineering:arc_furnace')
    const schema = materializeRaw(arc)
    const secondaries = schema.outputs.find((s) => s.key === 'secondaries')
    expect(secondaries?.sugarSupported).toBe(false)
    expect(secondaries?.compound).toEqual(['chance', 'output'])
  })

  it('IE 电弧炉 energy/time 附加槽：min 约束进 constraints、zone:extra 与 sugarSupported:false 存活', () => {
    const arc = l0SchemaById('immersiveengineering:arc_furnace')
    const schema = materializeRaw(arc)
    const energy = schema.slots.find((s) => s.key === 'energy')
    expect(energy?.zone).toBe('extra')
    expect(energy?.constraints).toEqual({ min: 0 })
    expect(energy?.sugarSupported).toBe(false)
  })
})

describe('S-2 schema 级声明透传与还原（pilotToSchema）', () => {
  it('IE 电弧炉 emit → emitTarget = event.recipes.immersiveengineering.arc_furnace（此前恒 null）', () => {
    const arc = l0SchemaById('immersiveengineering:arc_furnace')
    const schema = pilotToSchema(materializeRaw(arc))
    expect(schema.emitTarget).toBe('event.recipes.immersiveengineering.arc_furnace')
    expect(schema.supportsChance).toBe(true)
  })

  it('IE 电弧炉 notes / requirements 语义随 schema 还原', () => {
    const arc = l0SchemaById('immersiveengineering:arc_furnace')
    const schema = pilotToSchema(materializeRaw(arc))
    expect(schema.notes?.some((n) => n.includes('arcFurnace'))).toBe(true)
  })

  it('emit === null 是「明确无糖」：不得回落 VANILLA_TARGETS', () => {
    const noSugarRaw = [...immersiveengineeringSchemas, ...thermalSchemas].find((r) => r.init.emit === null)
    expect(noSugarRaw).toBeDefined()
    const schema = pilotToSchema(materializeRaw(noSugarRaw as (typeof thermalSchemas)[number]))
    expect(schema.emitTarget).toBeNull()
  })

  it('thermal 系 emit（jar 实名别名激活）→ 语法糖目标非空', () => {
    const thermal = thermalSchemas.find((r) => r.init.emit !== undefined && r.init.emit !== null)
    expect(thermal).toBeDefined()
    const schema = pilotToSchema(materializeRaw(thermal as (typeof thermalSchemas)[number]))
    expect(schema.emitTarget).not.toBeNull()
    expect(schema.emitTarget).toMatch(/^event\.recipes\./)
  })
})

describe('S-2 装配链端到端（activeL0Schemas → pilotToSchema）与提交链回转（selectSchema 方向由 openRecipe.test 钉）', () => {
  it('激活过滤仍按包内容（modId / 别名），语义字段随激活的 schema 一起到达注册表', () => {
    const schemas = activeL0Schemas(PACK).map(pilotToSchema)
    const ids = schemas.map((s) => s.id)
    expect(ids).toContain('immersiveengineering:arc_furnace')
    const arc = schemas.find((s) => s.id === 'immersiveengineering:arc_furnace')
    expect(arc?.slots.find((s) => s.key === 'energy')?.zone).toBe('extra')
    expect(arc?.outputs.find((s) => s.key === 'results')?.compound).toEqual(['base_ingredient', 'count'])
    expect(arc?.emitTarget).toBe('event.recipes.immersiveengineering.arc_furnace')
  })
})
