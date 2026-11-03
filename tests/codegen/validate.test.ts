/**
 * 写盘前两道闸：acorn 语法预检（含错误行号）+ 基于反推 schema 的语义校验（规格 3.6.11）。
 * 语义校验只吃 schema 与工作台数据，不依赖任何附属 API。
 */
import { describe, expect, it } from 'vitest'
import { checkSyntax, hasErrors, validateSemantics } from '../../src/main/codegen/validate'
import { emptyGrid, field, putGrid, schema, sv, workbench } from './helpers'

const GOOD_SCRIPT = [
  '// header',
  'ServerEvents.recipes(event => {',
  "  event.shaped('4x minecraft:oak_planks', [",
  "    'A',",
  "    'A'",
  "  ], { A: 'minecraft:oak_log' })",
  '})',
  ''
].join('\n')

describe('acorn 语法预检', () => {
  it('合法脚本通过', () => {
    expect(checkSyntax(GOOD_SCRIPT, 'kubejs-sugar')).toEqual({ ok: true })
  })

  it('缺右括号时给出错误行号', () => {
    // 去掉最后一个右括号，制造「Unexpected token」而不是「Unexpected end of input」
    const broken = GOOD_SCRIPT.replace("], { A: 'minecraft:oak_log' })", "], { A: 'minecraft:oak_log' }")
    const result = checkSyntax(broken, 'kubejs-sugar')
    expect(result.ok).toBe(false)
    expect(result.line).toBeTypeOf('number')
    expect(result.message).toContain('Unexpected token')
  })

  it('非法标识符行号定位到出错那一行', () => {
    const broken = ['ServerEvents.recipes(event => {', '  event.shaped(###)', '})'].join('\n')
    const result = checkSyntax(broken, 'kubejs-sugar')
    expect(result.ok).toBe(false)
    expect(result.line).toBe(2)
  })

  it('空结果不允许写盘', () => {
    expect(checkSyntax('   ', 'event-custom').ok).toBe(false)
  })

  it('数据包通道改跑 JSON 解析并定位行号', () => {
    expect(checkSyntax('{"type":"create:mixing"}', 'datapack-json').ok).toBe(true)
    const bad = '{\n  "type": "create:mixing",,\n}'
    const result = checkSyntax(bad, 'datapack-json')
    expect(result.ok).toBe(false)
    expect(result.line).toBe(2)
  })
})

describe('语义校验', () => {
  const mixing = schema({
    id: 'create:mixing',
    modId: 'create',
    layoutKind: 'multi_io',
    emitTarget: 'event.recipes.create.mixing',
    outputs: [field('result', 'item', { required: true, multiple: true })],
    slots: [field('ingredients', 'item', { required: true, multiple: true })],
    extraFields: [field('energy', 'number', { min: 0, max: 40000 }), field('secondary', 'item', { multiple: false })]
  })

  it('缺必填字段 → error 并定位字段', () => {
    const bench = workbench({ typeId: 'create:mixing', layoutKind: 'multi_io', values: { ingredients: [sv('item', 'minecraft:iron_ingot')] } })
    const diagnostics = validateSemantics(mixing, bench)
    expect(hasErrors(diagnostics)).toBe(true)
    expect(diagnostics.find((d) => d.field === 'result')?.message).toContain('必填参数未填')
  })

  it('该是数组却给单值 / 该是单值却给数组，都算形态错', () => {
    const listAsSingle = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: sv('item', 'minecraft:iron_ingot') }
    })
    expect(validateSemantics(mixing, listAsSingle).some((d) => d.field === 'ingredients' && d.level === 'error')).toBe(true)

    const singleAsList = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: [sv('item', 'minecraft:steel_ingot')],
        ingredients: [sv('item', 'minecraft:iron_ingot')],
        secondary: [sv('item', 'minecraft:diamond'), sv('item', 'minecraft:gold_ingot')]
      }
    })
    expect(validateSemantics(mixing, singleAsList).some((d) => d.field === 'secondary' && d.level === 'error')).toBe(true)
  })

  it('引用对象形态错（给了纯字符串）', () => {
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: ['minecraft:iron_ingot'] }
    })
    expect(validateSemantics(mixing, bench).some((d) => d.field === 'ingredients' && d.message.includes('引用对象'))).toBe(true)
  })

  it('流体量必须是正整数', () => {
    const fluidSchema = schema({ id: 'create:mixing', outputs: [field('result', 'fluid', { multiple: true })] })
    const bad = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: [sv('fluid', 'minecraft:water', { amount: 500.5 })] }
    })
    expect(validateSemantics(fluidSchema, bad).some((d) => d.message.includes('正整数'))).toBe(true)
    const good = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: [sv('fluid', 'minecraft:water', { amount: 500 })] }
    })
    expect(hasErrors(validateSemantics(fluidSchema, good))).toBe(false)
  })

  it('概率越界拦下；字符串型概率按数值解析（IP 的 "0.07"）', () => {
    const out = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: [sv('item', 'minecraft:gravel', { chance: 1.7 })] }
    })
    expect(validateSemantics(mixing, out).some((d) => d.message.includes('概率'))).toBe(true)

    const str = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: [sv('item', 'minecraft:gravel', { chance: '0.07' as unknown as number })],
        ingredients: [sv('item', 'minecraft:cobblestone')]
      }
    })
    expect(hasErrors(validateSemantics(mixing, str))).toBe(false)
  })

  it('未知物品只警告、不阻断', () => {
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: [sv('item', 'minecraft:steel_ingot')], ingredients: [sv('item', 'somemod:missingThing')] }
    })
    const diagnostics = validateSemantics(mixing, bench, { itemExists: (id) => id.startsWith('minecraft:') })
    const warn = diagnostics.find((d) => d.message.includes('未知物品'))
    expect(warn?.level).toBe('warn')
    expect(hasErrors(diagnostics)).toBe(false)
    // 没有索引探针时不做判断（绝不凭空报错）
    expect(validateSemantics(mixing, bench).some((d) => d.message.includes('未知物品'))).toBe(false)
  })

  it('有序合成空网格 → error 定位到 grid', () => {
    const shaped = schema({ id: 'minecraft:crafting_shaped', layoutKind: 'shaped', outputs: [field('result', 'item')] })
    const bench = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 3,
      gridCols: 3,
      values: { grid: emptyGrid(3, 3), result: sv('item', 'minecraft:oak_planks') }
    })
    expect(validateSemantics(shaped, bench).some((d) => d.field === 'grid' && d.level === 'error')).toBe(true)

    const filled = emptyGrid(3, 3)
    putGrid(filled, 3, 0, 0, sv('item', 'minecraft:oak_log'))
    expect(
      validateSemantics(shaped, workbench({ typeId: 'minecraft:crafting_shaped', layoutKind: 'shaped', gridRows: 3, gridCols: 3, values: { grid: filled, result: sv('item', 'minecraft:oak_planks') } })).some(
        (d) => d.field === 'grid'
      )
    ).toBe(false)
  })

  it('AE2 transform 的首项硬性约束', () => {
    const transform = schema({
      id: 'ae2:transform',
      modId: 'ae2',
      layoutKind: 'shapeless',
      slots: [field('ingredients', 'item', { multiple: true, firstItemMust: 'ae2:charged_certus_quartz_crystal' })],
      outputs: [field('result', 'item')]
    })
    const bench = workbench({
      typeId: 'ae2:transform',
      layoutKind: 'shapeless',
      values: {
        ingredients: [sv('item', 'minecraft:redstone'), sv('item', 'ae2:charged_certus_quartz_crystal')],
        result: sv('item', 'ae2:fluix_crystal')
      }
    })
    expect(validateSemantics(transform, bench).some((d) => d.message.includes('第一项必须是'))).toBe(true)
  })

  it('修饰符数值范围', () => {
    const withMods = schema({
      id: 'create:mixing',
      outputs: [field('result', 'item', { multiple: true })],
      slots: [field('ingredients', 'item', { multiple: true })],
      modifiers: [{ key: 'processingTime', displayName: '处理时间', kind: 'number', chain: 'processingTime', min: 1, max: 1000 }]
    })
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: [sv('item', 'minecraft:iron_ingot')] },
      modifiers: { processingTime: 5000 }
    })
    expect(validateSemantics(withMods, bench).some((d) => d.field === 'modifiers.processingTime')).toBe(true)
  })
})
