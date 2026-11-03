/**
 * L0 · Thermal（规格 3.6.9 清单）。Thermal 的机器配方在 1.20 数据文件里统一是
 * `ingredients[] + primaryOutput + secondaryOutput/secondaryChance + energy + experience`，
 * 这一组有把握；`smelter` 的双输入与 `insolator` 的水耗写法随版本有差异，标注后交给 L1。
 */
import { emit, extra, input, noSugar, output, raw, shape, type RawSchema, type SlotInit } from './_helper'

const NS = 'thermal'
const mod = 'Thermal Expansion'

function machine(path: string, options: { sugarMethod?: string; extraFields?: SlotInit[]; note?: string; verified?: boolean } = {}): RawSchema {
  return raw(`${NS}:${path}`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, options.sugarMethod ?? path),
    supportsChance: true,
    slots: [shape('ingredients', { required: true })],
    outputs: [output('primaryOutput', 'item', { required: true })],
    extra: [
      noSugar(extra('secondaryOutput', 'item')),
      noSugar(extra('secondaryChance', 'number', { min: 0, max: 1 })),
      noSugar(extra('energy', 'number', { min: 0 })),
      extra('experience', 'number', { min: 0 }),
      ...(options.extraFields ?? [])
    ],
    fieldsVerified: options.verified !== false,
    note: options.note
  })
}

export const thermalSchemas: RawSchema[] = [
  machine('pulverizer'),
  machine('press'),
  machine('smelter', {
    verified: false,
    note: 'smelter 是双输入 + 融合产物，第二个输入键名（upgradeComponent 等）以本包样本为准',
    extraFields: [input('fuelBoost', 'number', { zone: 'extra' })]
  }),
  machine('centrifuge', {
    note: 'centrifuge 另有两个固态副产物槽（solidLightOutput 等），未在本包验证的一律不写，交给 L1',
    verified: false
  }),
  machine('crucible', { verified: false, note: 'crucible 输出是流体，flameOutput 等字段以本包样本为准' }),
  machine('refinery', { verified: false, note: 'refinery 输入输出混合流体与物品，未验证字段交给 L1' }),
  machine('chiller', { verified: false }),
  machine('furnace', { verified: false }),
  machine('sawmill', { verified: false }),
  machine('pyrolyzer', { verified: false }),
  raw(`${NS}:insolator`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'insolator'),
    slots: [shape('ingredients', { required: true })],
    outputs: [output('primaryOutput', 'item', { required: true })],
    extra: [noSugar(extra('waterUse', 'number', { min: 0 }))],
    fieldsVerified: false,
    note: '农业仪的需水量在语法糖里是 .water(mb)，JSON 字段名以本包样本为准'
  }),
  raw(`${NS}:bottler`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'bottler'),
    slots: [shape('ingredients')],
    outputs: [output('primaryOutput', 'item')],
    fieldsVerified: false,
    note: '装瓶机同时消耗容器并输出流体，字段以本包样本为准'
  }),
  raw(`${NS}:rock_gen`, NS, {
    modDisplayName: mod,
    layout: 'custom',
    emit: null,
    fieldsVerified: false,
    note: '岩石生成器依赖环境条件（湿度 / 相邻方块），属于 requirements 类配方，字段全部交给 L1',
    requirements: [{ kind: 'other', text: '需要相邻的水与可生成岩石的方块' }],
    slots: [],
    outputs: []
  })
]
