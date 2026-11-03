/**
 * 通道决策（规格 3.6.6 / 3.6.10 / 3.6.11）：语法糖 / 数据包 JSON / event.custom 的判定顺序、
 * sugarSupported 触发的自动降级、三档生成偏好、附属缺失时的明确报错。
 */
import { describe, expect, it } from 'vitest'
import {
  collectUnsupportedFields,
  collectUnsupportedModifiers,
  decideChannel,
  isAddonInstalled,
  requiredAddonOf
} from '../../src/main/codegen/channel'
import { CREATED_AT, field, modpack, schema, sv, workbench } from './helpers'

const mixingSchema = schema({
  id: 'create:mixing',
  modId: 'create',
  emitTarget: 'event.recipes.create.mixing',
  layoutKind: 'multi_io',
  outputs: [field('result', 'item')],
  slots: [field('ingredients', 'item', { multiple: true })],
  extraFields: [field('energy', 'number', { sugarSupported: false }), field('time', 'number', { sugarSupported: false })],
  channel: 'kubejs-sugar'
})

describe('附属检测', () => {
  it('event.recipes.<ns>.<method> 需要 kubejs_<ns>', () => {
    expect(requiredAddonOf(mixingSchema)).toBe('kubejs_create')
    expect(isAddonInstalled(mixingSchema, ['kubejs-create', 'kubejs_thermal'])).toBe(true)
    expect(isAddonInstalled(mixingSchema, ['kubejs_thermal'])).toBe(false)
  })

  it('原版语法糖（event.shaped / event.remove）不依赖任何附属', () => {
    const vanilla = schema({ id: 'minecraft:crafting_shaped', emitTarget: 'event.shaped', layoutKind: 'shaped' })
    expect(requiredAddonOf(vanilla)).toBeNull()
    expect(isAddonInstalled(vanilla, [])).toBe(true)
  })

  it('驼峰单段写法 event.recipes.immersiveengineeringArcFurnace 归到 immersiveengineering', () => {
    const arc = schema({ id: 'immersiveengineering:arc_furnace', modId: 'immersiveengineering', emitTarget: 'event.recipes.immersiveengineeringArcFurnace' })
    expect(requiredAddonOf(arc)).toBe('kubejs_immersiveengineering')
  })
})

describe('自动档判定顺序', () => {
  it('附属已装 → 语法糖，并标注签名未在本包验证', () => {
    const decision = decideChannel({
      schema: mixingSchema,
      addons: ['kubejs_create'],
      hasSamples: true,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.channel).toBe('kubejs-sugar')
    expect(decision.sugarUnverified).toBe(true)
    expect(decision.error).toBeNull()
    expect(decision.notes.join('\n')).toContain('签名未在本包验证')
  })

  it('ProbeJS 验证过的签名不再标注未验证', () => {
    const verified = { ...mixingSchema, source: 'probejs' as const }
    const decision = decideChannel({
      schema: verified,
      addons: ['kubejs_create'],
      hasSamples: true,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.sugarUnverified).toBe(false)
  })

  it('附属未装 + 有样本 → 数据包 JSON（不是 event.custom）', () => {
    const decision = decideChannel({
      schema: mixingSchema,
      addons: [],
      hasSamples: true,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.channel).toBe('datapack-json')
    expect(decision.blockedFromSugar).toBe(true)
    expect(decision.missingAddon).toBe('kubejs_create')
  })

  it('附属未装 + 无样本 → event.custom 兜底', () => {
    const decision = decideChannel({
      schema: { ...mixingSchema, sampleCount: 0 },
      addons: [],
      hasSamples: false,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.channel).toBe('event-custom')
  })

  it('无 emitTarget + 有样本 → 数据包 JSON；需要脚本统一管理时优先 event.custom', () => {
    const plain = schema({ id: 'some:mod_type', emitTarget: null })
    expect(
      decideChannel({ schema: plain, addons: [], hasSamples: true, preference: 'auto', requiresScript: false, filledUnsupportedFields: [] }).channel
    ).toBe('datapack-json')
    expect(
      decideChannel({ schema: plain, addons: [], hasSamples: true, preference: 'auto', requiresScript: true, filledUnsupportedFields: [] }).channel
    ).toBe('event-custom')
  })
})

describe('sugarSupported 自动降级（绝不丢参数）', () => {
  const bench = workbench({
    typeId: 'create:mixing',
    layoutKind: 'multi_io',
    values: {
      result: sv('item', 'minecraft:steel_ingot'),
      ingredients: [sv('item', 'minecraft:iron_ingot')],
      energy: 4000,
      time: 200
    }
  })

  it('填了 sugarSupported:false 的字段 → 列出字段名并降级到 event.custom', () => {
    const fields = collectUnsupportedFields(mixingSchema, bench.values)
    expect(fields).toEqual(['energy', 'time'])
    const decision = decideChannel({
      schema: mixingSchema,
      addons: ['kubejs_create'],
      hasSamples: true,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: fields
    })
    expect(decision.channel).toBe('event-custom')
    expect(decision.sugarUnsupportedFields).toEqual(['energy', 'time'])
    expect(decision.blockedFromSugar).toBe(true)
    expect(decision.notes.join('\n')).toContain('已从语法糖切换为 event.custom —— energy、time 无法通过语法糖表达')
  })

  it('字段没填就不触发降级', () => {
    const empty = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: [sv('item', 'minecraft:iron_ingot')] }
    })
    expect(collectUnsupportedFields(mixingSchema, empty.values)).toEqual([])
  })

  it('struct 子字段与 chain 为 null 的修饰符同样触发降级', () => {
    const withStruct = schema({
      id: 'thermal:compound',
      slots: [field('catalyst', 'struct', { sugarSupported: false, fields: [field('rate', 'number')] })]
    })
    expect(collectUnsupportedFields(withStruct, { catalyst: { rate: 2 } })).toEqual(['catalyst'])
    const nested = schema({
      id: 'thermal:compound',
      slots: [field('catalyst', 'struct', { fields: [field('rate', 'number', { sugarSupported: false })] })]
    })
    expect(collectUnsupportedFields(nested, { catalyst: { rate: 2 } })).toEqual(['rate'])
    const modifiers = schema({
      id: 'create:mixing',
      modifiers: [
        { key: 'heated', displayName: '加热', kind: 'boolean', chain: 'heated' },
        { key: 'energy', displayName: '能耗', kind: 'number', chain: null }
      ]
    })
    expect(collectUnsupportedModifiers(modifiers, { heated: true, energy: 4000 })).toEqual(['energy'])
  })
})

describe('三档生成偏好', () => {
  it('always-datapack 完全绕开脚本层', () => {
    const decision = decideChannel({
      schema: mixingSchema,
      addons: ['kubejs_create'],
      hasSamples: true,
      preference: 'always-datapack',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.channel).toBe('datapack-json')
  })

  it('always-sugar 且附属缺失 → 明确报错，不静默降级', () => {
    const decision = decideChannel({
      schema: mixingSchema,
      addons: [],
      hasSamples: true,
      preference: 'always-sugar',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.error).not.toBeNull()
    expect(decision.error).toContain('kubejs_create')
    expect(decision.channel).not.toBe('kubejs-sugar')
    expect(decision.blockedFromSugar).toBe(true)
  })

  it('always-sugar 但字段表达不全 → 报错而不是丢参数', () => {
    const decision = decideChannel({
      schema: mixingSchema,
      addons: ['kubejs_create'],
      hasSamples: true,
      preference: 'always-sugar',
      requiresScript: false,
      filledUnsupportedFields: ['energy']
    })
    expect(decision.error).toContain('energy')
    expect(decision.channel).not.toBe('kubejs-sugar')
    expect(decision.channel).toBe('datapack-json')
  })

  it('always-datapack 遇上 event.remove → 报错（数据包无法移除配方）', () => {
    const removal = schema({ id: 'kubejs:remove', emitTarget: 'event.remove' })
    const decision = decideChannel({
      schema: removal,
      addons: [],
      hasSamples: false,
      preference: 'always-datapack',
      requiresScript: true,
      filledUnsupportedFields: []
    })
    expect(decision.error).toContain('数据包')
  })

  it('emitTarget 为空串时视同 null：不得直发语法糖（P3-8，修复前 kubejs-sugar → 红）', () => {
    const empty = schema({ id: 'some:plugin_type', emitTarget: '' })
    const decision = decideChannel({
      schema: empty,
      addons: [],
      hasSamples: true,
      preference: 'always-sugar',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(decision.channel).not.toBe('kubejs-sugar')
    expect(decision.error).not.toBeNull()
  })

  it('emitTarget 空串与 null 的决策完全一致（P3-8 守卫）', () => {
    const asEmpty = decideChannel({
      schema: schema({ id: 'some:plugin_type', emitTarget: '' }),
      addons: [],
      hasSamples: true,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    const asNull = decideChannel({
      schema: schema({ id: 'some:plugin_type', emitTarget: null }),
      addons: [],
      hasSamples: true,
      preference: 'auto',
      requiresScript: false,
      filledUnsupportedFields: []
    })
    expect(asEmpty.channel).toBe(asNull.channel)
    expect(asEmpty.blockedFromSugar).toBe(asNull.blockedFromSugar)
    expect(asEmpty.missingAddon).toBe(asNull.missingAddon)
  })
})

describe('预览到语句的一致性', () => {
  it('降级后的 event.custom 仍带出 energy / time（参数不丢）', async () => {
    const { emitScript } = await import('../../src/main/codegen/emitScript')
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: sv('item', 'minecraft:steel_ingot'),
        ingredients: [sv('item', 'minecraft:iron_ingot')],
        energy: 4000,
        time: 200
      }
    })
    const emit = emitScript(mixingSchema, bench, 'event-custom', modpack(), CREATED_AT)
    expect(emit.code).toContain('energy: 4000')
    expect(emit.code).toContain('time: 200')
  })
})
