/**
 * L0 · minecraft 原版配方（规格 3.6.9）。
 * 字段名取自原版数据包 JSON（`ingredient` / `result` / `cookingtime` / `experience` 等），
 * 这些是本程序里唯一「写死也安全」的一层，因为原版格式跨版本极稳定。
 */
import { extra, input, output, raw, s, shape, sugar, type RawSchema } from './_helper'

export const minecraftSchemas: RawSchema[] = [
  raw('minecraft:crafting_shaped', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'shaped',
    emit: sugar('shaped'),
    grid: { rows: 3, cols: 3 },
    slots: [
      s('grid', 'item', { multiple: true, required: true, zone: 'input', description: '有序网格；生成时自动裁掉全空行列（KubeJS 硬性要求）' }),
      s('key', 'struct', { zone: 'extra', sugarSupported: false, description: '图例映射；由网格自动生成，无需手填' })
    ],
    outputs: [output('result', 'item', { required: true })],
    notes: ['pattern/key 由工作台网格自动推导，不要在附加区手改']
  }),
  raw('minecraft:crafting_shapeless', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'shapeless',
    emit: sugar('shapeless'),
    slots: [shape('ingredients', { required: true })],
    outputs: [output('result', 'item', { required: true })]
  }),
  raw('minecraft:smelting', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'single_io',
    emit: sugar('smelting'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('cookingtime', 'number', { min: 0, sugarSupported: true }), extra('experience', 'number', { min: 0 })]
  }),
  raw('minecraft:blasting', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'single_io',
    emit: sugar('blasting'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('cookingtime', 'number', { min: 0 }), extra('experience', 'number', { min: 0 })]
  }),
  raw('minecraft:smoking', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'single_io',
    emit: sugar('smoking'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('cookingtime', 'number', { min: 0 }), extra('experience', 'number', { min: 0 })]
  }),
  raw('minecraft:campfire_cooking', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'single_io',
    emit: sugar('campfireCooking'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    extra: [extra('cookingtime', 'number', { min: 0 }), extra('experience', 'number', { min: 0 })]
  }),
  raw('minecraft:stonecutting', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'single_io',
    emit: sugar('stonecutting'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true }), output('count', 'number', { zone: 'extra', min: 1 })]
  }),
  raw('minecraft:smithing_transform', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '锻造模板配方的 base/addition/template/result 组合随版本变化，字段以本包样本反推为准',
    slots: [input('base', 'item'), input('addition', 'item'), input('template', 'item')],
    outputs: [output('result', 'item')]
  }),
  raw('minecraft:smithing_trim', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '盔甲编织槽只换装饰层；字段名以本包样本反推为准',
    slots: [input('base', 'item'), input('addition', 'item'), input('template', 'item')],
    outputs: [output('result', 'item')]
  }),
  raw('minecraft:brewing', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '原版酿造不是数据驱动配方类型（Java 硬编码），本包配方库里通常也没有该 type 的样本；若确有模组注册了 brewing RecipeType，L1 会自动给出字段',
    slots: [],
    outputs: []
  }),
  raw('minecraft:shaped', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'shaped',
    emit: sugar('shaped'),
    grid: { rows: 3, cols: 3 },
    note: 'KubeJS 别名形态（event.shaped），与 crafting_shaped 同一份数据结构',
    slots: [s('grid', 'item', { multiple: true, required: true, zone: 'input' })],
    outputs: [output('result', 'item', { required: true })]
  }),
  raw('minecraft:shapeless', 'minecraft', {
    modDisplayName: 'Minecraft',
    layout: 'shapeless',
    emit: sugar('shapeless'),
    note: 'KubeJS 别名形态（event.shapeless）',
    slots: [shape('ingredients')],
    outputs: [output('result', 'item')]
  })
]

