/**
 * L0 · Immersive Engineering（规格 3.6.9 清单 + 3.6.6 / 3.6.12 的电弧炉实证 JSON）。
 * 电弧炉是「语法糖是原始配方真子集」的样板：附属只提供 3 个重载，
 * **没有 energy、没有 time、没有概率 secondaries**，因此这三个字段必须
 * `sugarSupported:false` —— 这是自动降级的唯一依据，写错就等于骗用户。
 */
import { emit, extra, input, noSugar, output, raw, s, shape, type RawSchema } from './_helper'

const NS = 'immersiveengineering'
const mod = 'Immersive Engineering'

export const immersiveengineeringSchemas: RawSchema[] = [
  raw(`${NS}:arc_furnace`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'arc_furnace'),
    supportsChance: true,
    slots: [
      input('input', 'tag', { required: true, description: '主输入（纯引用）' }),
      input('additives', 'tag', { multiple: true, description: '添加物列表，顺序无关' })
    ],
    outputs: [
      output('results', 'item', {
        multiple: true,
        required: true,
        compound: ['base_ingredient', 'count'],
        emitShape: 'object',
        description: '主产物：每项是 {base_ingredient, count}（配对合并为「引用槽 + 数量」）'
      }),
      output('secondaries', 'item', {
        multiple: true,
        sugarSupported: false,
        compound: ['chance', 'output'],
        emitShape: 'object',
        description: '概率副产物：每项是 {chance, output}；语法糖无法表达'
      }),
      output('slag', 'tag', { description: '矿渣（IE 高炉 / 电弧炉固废）' })
    ],
    extra: [
      noSugar(extra('energy', 'number', { min: 0, description: 'FE 总耗能；语法糖无法表达' })),
      noSugar(extra('time', 'number', { min: 0, description: ' tick 数；语法糖无法表达' }))
    ],
    fieldsVerified: true,
    note: '字段名与嵌套取自规格 §3.6.12 的实测 JSON',
    notes: ['KubeJS IE 附属的 arcFurnace 只有 3 个重载（输出+输入 / +添加物 / +矿渣），填了 energy / time / secondaries 必须降级 event.custom']
  }),
  raw(`${NS}:blast_furnace`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'blast_furnace'),
    slots: [input('input', 'tag', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('time', 'number', { min: 0 })],
    fieldsVerified: false,
    note: '高炉的燃料 / 矿渣字段随版本变化，未验证的不写'
  }),
  raw(`${NS}:coke_oven`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'coke_oven'),
    slots: [input('input', 'tag', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    fieldsVerified: false
  }),
  raw(`${NS}:crusher`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'crusher'),
    supportsChance: true,
    slots: [input('input', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true }), output('secondaries', 'item', { multiple: true, compound: ['chance', 'output'] })],
    fieldsVerified: false
  }),
  raw(`${NS}:sawmill`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'sawmill'),
    slots: [input('input', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('secondaryChance', 'number', { min: 0, max: 1 })],
    fieldsVerified: false
  }),
  raw(`${NS}:metal_press`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'metal_press'),
    slots: [input('input', 'tag', { required: true }), input('mold', 'tag', { description: '模具（需带对应 mold 标签）' })],
    outputs: [output('result', 'item', { required: true })],
    fieldsVerified: false
  }),
  raw(`${NS}:bottling_machine`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: null,
    fieldsVerified: false,
    note: '装瓶机的容器与流体两侧键名未在本包验证，全部交给 L1',
    slots: [shape('input')],
    outputs: []
  }),
  raw(`${NS}:fermenter`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: null,
    fieldsVerified: false,
    note: '发酵机输出为流体，字段交给 L1',
    slots: [shape('inputs')],
    outputs: []
  }),
  raw(`${NS}:squeezer`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'squeezer'),
    supportsChance: true,
    slots: [input('input', 'item', { multiple: true, required: true })],
    outputs: [output('product', 'item'), output('fluid_output', 'fluid')],
    fieldsVerified: false,
    note: '压榨机多输出里物品与流体混在同一数组（规格 3.6.12 已知清单），元素结构不一致时降级 JSON 编辑'
  }),
  raw(`${NS}:refinery`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'refinery'),
    fieldsVerified: false,
    note: '精炼厂输入输出以流体为主，未验证键名交给 L1',
    slots: [shape('inputs')],
    outputs: []
  }),
  raw(`${NS}:mixer`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, 'mixer'),
    fieldsVerified: false,
    slots: [shape('inputs')],
    outputs: []
  }),
  raw(`${NS}:assembler`, NS, {
    modDisplayName: mod,
    layout: 'custom',
    emit: emit(NS, 'assembler'),
    fieldsVerified: false,
    note: '装配头的 pattern 与 upgrades 结构复杂（含 NBT），未验证字段一律交给 L1 / 手写 JSON',
    slots: [s('pattern', 'struct', { multiple: true, description: '装配头模板：结构复杂时降级 JSON 编辑器' })],
    outputs: []
  })
]
