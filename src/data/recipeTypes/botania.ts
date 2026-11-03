/**
 * L0 · Botania / Ars Nouveau / PneumaticCraft（规格 3.6.9 清单）。
 * 只写有把握的字段：Botania 三个祭坛的 `ingredients + mana + output`、纯雏菊的
 * `input1 / input2 / output`；其余（花瓣药房的环形坐标、注魔台的 reagent 结构）交给 L1 实测。
 * 花瓣药房的 16 格环形是本程序里唯一用 `custom` 布局 + 格子坐标数组的类型（规格 3.6.12 ②）。
 */
import { emit, extra, input, noSugar, output, raw, s, shape, type RawSchema } from './_helper'

const petalCells: { key: string; row: number; col: number }[] = (() => {
  const cells: { key: string; row: number; col: number }[] = []
  const ring: [number, number][] = [
    [0, 2], [0, 3], [0, 4], [1, 1], [1, 5], [2, 0], [2, 6], [3, 0], [3, 6], [4, 0], [4, 6], [5, 1], [5, 5], [6, 2], [6, 3], [6, 4]
  ]
  ring.forEach(([row, col], i) => cells.push({ key: `petal_${i + 1}`, row, col }))
  return cells
})()

export const botaniaSchemas: RawSchema[] = [
  raw('botania:petal_apothecary', 'botania', {
    modDisplayName: 'Botania',
    layout: 'custom',
    emit: emit('botania', 'petal_apothecary'),
    cells: petalCells,
    slots: [s('center', 'item', { zone: 'input', description: '中心物品（种子 / 副材料）' })],
    outputs: [output('output', 'item', { required: true })],
    fieldsVerified: false,
    note: '16 格环形 + 中心物品：花瓣槽 key 为 petal_1…petal_16，实际 JSON 里是一个 ingredients 数组',
    grid: { rows: 7, cols: 7 }
  }),
  raw('botania:runic_altar', 'botania', {
    modDisplayName: 'Botania',
    layout: 'multi_io',
    emit: emit('botania', 'runic_altar'),
    slots: [shape('ingredients', { required: true, max: 14 })],
    outputs: [output('output', 'item', { required: true })],
    extra: [extra('mana', 'number', { min: 0, label: '魔力消耗' })],
    requirements: [{ kind: 'structure', text: '需要符文祭坛，且符文物品须由炼金系表合成' }],
    notes: ['符文祭坛的 mana 是纯数值（原语 1），材料数量上限由祭坛方块决定']
  }),
  raw('botania:terra_plate', 'botania', {
    modDisplayName: 'Botania',
    layout: 'multi_io',
    emit: emit('botania', 'terra_plate'),
    slots: [shape('ingredients', { required: true })],
    outputs: [output('output', 'item', { required: true })],
    extra: [extra('mana', 'number', { min: 0 })]
  }),
  raw('botania:mana_infusion', 'botania', {
    modDisplayName: 'Botania',
    layout: 'single_io',
    emit: emit('botania', 'mana_infusion'),
    slots: [input('input', 'item', { required: true }), input('catalyst', 'item', { description: '催化剂方块（决定 infusion 类型）' })],
    outputs: [output('output', 'item', { required: true })],
    extra: [extra('mana', 'number', { min: 0 })],
    fieldsVerified: false
  }),
  raw('botania:elven_trade', 'botania', {
    modDisplayName: 'Botania',
    layout: 'multi_io',
    emit: emit('botania', 'elven_trade'),
    slots: [shape('ingredients', { required: true, max: 2 })],
    outputs: [output('output', 'item', { multiple: true, required: true })],
    fieldsVerified: false
  }),
  raw('botania:pure_daisy', 'botania', {
    modDisplayName: 'Botania',
    layout: 'multi_io',
    emit: emit('botania', 'pure_daisy'),
    slots: [input('input1', 'item', { required: true }), input('input2', 'item')],
    outputs: [output('output', 'item', { required: true })],
    requirements: [{ kind: 'structure', text: '需要纯白雏菊 + 上下水（或相邻方块状态）' }],
    extra: [extra('time', 'number', { min: 0 })],
    notes: ['世界交互型：input2 可缺省，水 / 相邻方块属于摆放要求而非材料']
  }),
  raw('botania:brewery', 'botania', {
    modDisplayName: 'Botania',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '酿造台需要试剂 + 蒸馏瓶，键名以本包样本为准',
    slots: [shape('ingredients')],
    outputs: []
  })
]

export const arsNouveauSchemas: RawSchema[] = [
  raw('ars_nouveau:enchanting_apparatus', 'ars_nouveau', {
    modDisplayName: 'Ars Nouveau',
    layout: 'multi_io',
    emit: emit('ars_nouveau', 'enchanting_apparatus'),
    slots: [shape('reagent', { required: true, description: '中心基底物品' }), s('ingredients', 'item', { multiple: true, zone: 'input', description: '外圈原料（二维数组，每组一件）' })],
    outputs: [output('result', 'item', { required: true })],
    extra: [noSugar(extra('source_cost', 'number', { min: 0 }))],
    fieldsVerified: false,
    requirements: [{ kind: 'structure', text: '需要附魔 apparatus 与足量源质' }],
    notes: ['源质数值 + 物品列表（原语 1 + 4）']
  }),
  raw('ars_nouveau:imbuement', 'ars_nouveau', {
    modDisplayName: 'Ars Nouveau',
    layout: 'multi_io',
    emit: emit('ars_nouveau', 'imbuement'),
    fieldsVerified: false,
    slots: [shape('input_ingredients')],
    outputs: [output('output_item', 'item')]
  }),
  raw('ars_nouveau:crush', 'ars_nouveau', {
    modDisplayName: 'Ars Nouveau',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '捣碎桶配方的容器 / 产物列表结构以本包样本为准',
    slots: [shape('ingredients')],
    outputs: []
  }),
  raw('ars_nouveau:glyph', 'ars_nouveau', {
    modDisplayName: 'Ars Nouveau',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: 'glyph 配方的交互条件（层级 / 星界亲和）属 requirements；字段交给 L1',
    slots: [],
    outputs: []
  }),
  raw('ars_nouveau:sourcelink', 'ars_nouveau', {
    modDisplayName: 'Ars Nouveau',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '源质链接的充能材料与维度条件由 L1 反推',
    requirements: [{ kind: 'dimension', text: '部分glyph仅在特定维度可用' }],
    slots: [],
    outputs: []
  })
]

export const pneumaticcraftSchemas: RawSchema[] = [
  raw('pneumaticcraft:pressure_chamber', 'pneumaticcraft', {
    modDisplayName: 'PneumaticCraft: Repressurized',
    layout: 'multi_io',
    emit: emit('pneumaticcraft', 'pressure_chamber'),
    slots: [shape('ingredients', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('pressure', 'number'), extra('temperature', 'number'), noSugar(extra('time', 'number', { min: 0 }))],
    fieldsVerified: false,
    note: '压力 + 温度是原语 5（struct）里的两个标量，具体键名以本包样本为准'
  }),
  raw('pneumaticcraft:assembly', 'pneumaticcraft', {
    modDisplayName: 'PneumaticCraft: Repressurized',
    layout: 'sequence',
    emit: emit('pneumaticcraft', 'assembly'),
    fieldsVerified: false,
    note: '装配机是「一组工序」型（钻 / 拧 / 涂胶），工序列表结构交给 L1 反推',
    slots: [s('assembly_ingredients', 'item', { multiple: true, zone: 'input' })],
    outputs: []
  }),
  raw('pneumaticcraft:explosion', 'pneumaticcraft', { modDisplayName: 'PneumaticCraft', layout: 'multi_io', emit: null, fieldsVerified: false, slots: [], outputs: [] }),
  raw('pneumaticcraft:refinery', 'pneumaticcraft', { modDisplayName: 'PneumaticCraft', layout: 'multi_io', emit: null, fieldsVerified: false, slots: [], outputs: [] }),
  raw('pneumaticcraft:thermopneumatic', 'pneumaticcraft', { modDisplayName: 'PneumaticCraft', layout: 'single_io', emit: null, fieldsVerified: false, slots: [], outputs: [] })
]

