/**
 * L0 · Create（规格 3.6.9 清单）。Create 的处理型配方在 0.5+ 统一用 `ingredients` / `results`
 * 两个列表，这部分有把握；`deploying` / `item_application` 等含实体与交互语义的类型只声明布局
 * 与语法糖目标，字段交给 L1 反推（禁止事项 8）。
 */
import { emit, extra, input, noSugar, output, raw, s, shape, type RawSchema, type SlotInit } from './_helper'

const NS = 'create'
const mod = 'Create'

/** 处理型：多输入 + 多输出（含概率产物）。 */
function processing(path: string, options: { heat?: boolean; time?: boolean; sugar?: boolean } = {}): RawSchema {
  const extraFields: SlotInit[] = []
  if (options.time) extraFields.push(noSugar(extra('processingTime', 'number', { min: 0 })))
  if (options.heat) extraFields.push(noSugar(extra('heatRequirement', 'choice', { label: '加热需求' })))
  return raw(`${NS}:${path}`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: emit(NS, path),
    supportsChance: true,
    slots: [shape('ingredients', { required: true })],
    outputs: [output('results', 'item', { multiple: true, required: true, description: '可带 count / chance（Create 概率写法见 schema）' })],
    extra: extraFields,
    note: options.time || options.heat ? 'processingTime / heatRequirement 在语法糖里是链式修饰符，数据包 JSON 里是字段' : undefined
  })
}

export const createSchemas: RawSchema[] = [
  processing('mixing', { heat: true, time: true }),
  processing('compacting'),
  processing('crushing', { time: true }),
  processing('cutting', { time: true }),
  processing('pressing'),
  processing('milling', { time: true }),
  processing('sawing', { time: true }),
  processing('haunting'),
  processing('splashing'),
  raw(`${NS}:filling`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'filling'),
    slots: [input('ingredient', 'item', { required: true }), input('fluid_stack', 'fluid', { required: true })],
    outputs: [output('result', 'item', { required: true })],
    fieldsVerified: false,
    note: '硬性校验：恰好 1 物品 + 1 流体；字段名以本包样本反推为准'
  }),
  raw(`${NS}:emptying`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'emptying'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true }), output('fluid_stack', 'fluid')],
    fieldsVerified: false,
    note: '与 filling 互逆；流体侧字段名以本包样本为准'
  }),
  raw(`${NS}:draining`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'draining'),
    slots: [shape('ingredients')],
    outputs: [output('results', 'item', { multiple: true }), output('fluid_output', 'fluid')],
    fieldsVerified: false,
    note: '排空容器的流体侧字段名以本包样本为准'
  }),
  raw(`${NS}:mechanical_crafting`, NS, {
    modDisplayName: mod,
    layout: 'shaped',
    emit: emit(NS, 'mechanical_crafting'),
    grid: { rows: 3, cols: 3, maxRows: 9, maxCols: 9 },
    slots: [s('grid', 'item', { multiple: true, required: true, zone: 'input', description: '最大 9×9，空行空列生成时全部移除' })],
    outputs: [output('result', 'item', { required: true })],
    notes: ['可变尺寸网格：用户可切换 3×3 / 5×5 / 9×9']
  }),
  raw(`${NS}:sequenced_assembly`, NS, {
    modDisplayName: mod,
    layout: 'sequence',
    emit: emit(NS, 'sequenced_assembly'),
    slots: [
      input('ingredient', 'item', { required: true }),
      s('sequence', 'struct', {
        multiple: true,
        zone: 'input',
        description: '嵌套子配方列表（对象自身含 type）→ 序列步骤编辑器',
        fields: [s('type', 'choice', { label: '步骤类型' })]
      })
    ],
    outputs: [output('results', 'item', { multiple: true, required: true })],
    extra: [noSugar(extra('transitionalItem', 'item')), noSugar(extra('loops', 'number', { min: 1 }))],
    fieldsVerified: false,
    note: 'transitionalItem / loops 的 JSON 键名在本包版本上可能是下划线形式，L1 会用实测字段覆盖',
    notes: ['序列步骤类型候选来自本包已扫到的 create:* 类型，不预设清单']
  }),
  raw(`${NS}:deploying`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'deploying'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item')],
    fieldsVerified: false,
    note: '部署配方含实体/掉落语义（entity 字段），本程序只做数据侧字段，实体侧请手写 event.custom'
  }),
  raw(`${NS}:item_application`, NS, {
    modDisplayName: mod,
    layout: 'multi_io',
    emit: null,
    fieldsVerified: false,
    note: '物品交互型配方（用某物品右键另一物品）语义在实体侧，字段全部交给 L1 反推',
    slots: [shape('ingredient')],
    outputs: []
  }),
  raw(`${NS}:sandpaper_polishing`, NS, {
    modDisplayName: mod,
    layout: 'single_io',
    emit: emit(NS, 'sandpaper_polishing'),
    slots: [input('ingredient', 'item', { required: true })],
    outputs: [output('result', 'item', { required: true })]
  })
]
