/**
 * §一 五个示例写法逐字符对齐 + 3.7 生成规则细节（头部、裁剪、`1x` 省略、Fluid.of、`#tag`、
 * registry 三形态、count/amount 不互换、修饰符顺序）。
 */
import { describe, expect, it } from 'vitest'
import { emitScript } from '../../src/main/codegen/emitScript'
import { CREATED_AT, emptyGrid, field, modpack, putGrid, schema, statementsOf, sv, workbench } from './helpers'

const SUGAR = 'kubejs-sugar' as const
const CUSTOM = 'event-custom' as const

describe('§一 示例：脚本写法逐字符对齐', () => {
  it('有序合成 4x：完整头部 + 裁剪后的 pattern 与 key', () => {
    const grid = emptyGrid(3, 3)
    putGrid(grid, 3, 0, 0, sv('item', 'minecraft:oak_log'))
    putGrid(grid, 3, 1, 0, sv('item', 'minecraft:oak_log'))
    const shaped = schema({
      id: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      emitTarget: 'event.shaped',
      outputs: [field('result', 'item')],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 3,
      gridCols: 3,
      values: { grid, result: sv('item', 'minecraft:oak_planks', { count: 4 }) }
    })
    const emit = emitScript(shaped, bench, SUGAR, modpack(), CREATED_AT)
    expect(emit.error).toBeNull()
    expect(emit.code).toBe(
      [
        '// ── KubeJS Recipe Studio ─────────────────────────────',
        '// Modpack : Nomifactory GTCEu',
        '// MC      : 1.20.1  |  Forge  |  KubeJS 2001.6.5',
        '// Created : 2026-10-30 21:40',
        '// ─────────────────────────────────────────────────────',
        'ServerEvents.recipes(event => {',
        "  event.shaped('4x minecraft:oak_planks', [",
        "    'A',",
        "    'A'",
        "  ], { A: 'minecraft:oak_log' })",
        '})',
        ''
      ].join('\n')
    )
  })

  it('无序合成：单行调用，材料数组逐项字面量', () => {
    const shapeless = schema({
      id: 'minecraft:crafting_shapeless',
      layoutKind: 'shapeless',
      emitTarget: 'event.shapeless',
      outputs: [field('result', 'item')],
      slots: [field('ingredients', 'item', { multiple: true })],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'minecraft:crafting_shapeless',
      layoutKind: 'shapeless',
      values: {
        result: sv('item', 'minecraft:stick'),
        ingredients: [sv('item', 'minecraft:oak_planks'), sv('item', 'minecraft:oak_planks')]
      }
    })
    expect(statementsOf(emitScript(shapeless, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      "  event.shapeless('minecraft:stick', ['minecraft:oak_planks', 'minecraft:oak_planks'])"
    )
  })

  it('Create 搅拌：流体产物 + 材料数组 + .heated() 链', () => {
    const mixing = schema({
      id: 'create:mixing',
      modId: 'create',
      layoutKind: 'multi_io',
      emitTarget: 'event.recipes.create.mixing',
      outputs: [field('result', 'fluid')],
      slots: [field('ingredients', 'item', { multiple: true })],
      modifiers: [{ key: 'heated', displayName: '加热', kind: 'boolean', chain: 'heated' }],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: sv('fluid', 'minecraft:water', { amount: 500 }),
        ingredients: [sv('item', 'minecraft:dirt'), sv('item', 'minecraft:sand')]
      },
      modifiers: { heated: true }
    })
    expect(statementsOf(emitScript(mixing, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      [
        '  event.recipes.create.mixing(',
        "    Fluid.of('minecraft:water', 500),",
        "    ['minecraft:dirt', 'minecraft:sand']",
        '  ).heated()'
      ].join('\n')
    )
  })

  it('移除配方：event.remove({ id })', () => {
    const removal = schema({ id: 'kubejs:remove', emitTarget: 'event.remove', layoutKind: 'custom' })
    const bench = workbench({ typeId: 'kubejs:remove', values: { id: 'minecraft:diamond_sword' } })
    expect(statementsOf(emitScript(removal, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      "  event.remove({ id: 'minecraft:diamond_sword' })"
    )
  })

  it('event.custom：原样 JSON，键序 type → 输入 → 产物 → 数值，数字不加引号', () => {
    const pulverizer = schema({
      id: 'thermal:pulverizer',
      modId: 'thermal',
      layoutKind: 'custom',
      emitTarget: null,
      slots: [field('ingredient', 'item')],
      outputs: [field('result', 'item', { multiple: true })],
      extraFields: [field('energy', 'number')],
      channel: CUSTOM
    })
    const bench = workbench({
      typeId: 'thermal:pulverizer',
      values: {
        ingredient: sv('item', 'minecraft:cobblestone'),
        result: [sv('item', 'minecraft:gravel', { count: 1 })],
        energy: 4000
      }
    })
    expect(statementsOf(emitScript(pulverizer, bench, CUSTOM, modpack(), CREATED_AT).code)).toBe(
      [
        '  event.custom({',
        "    type: 'thermal:pulverizer',",
        "    ingredient: { item: 'minecraft:cobblestone' },",
        "    result: [{ item: 'minecraft:gravel', count: 1 }],",
        '    energy: 4000',
        '  })'
      ].join('\n')
    )
  })
})

describe('头部按 MC 版本切换', () => {
  const base = schema({
    id: 'minecraft:crafting_shapeless',
    layoutKind: 'shapeless',
    emitTarget: 'event.shapeless',
    outputs: [field('result', 'item')],
    slots: [field('ingredients', 'item', { multiple: true })],
    channel: SUGAR
  })
  const bench = workbench({
    typeId: 'minecraft:crafting_shapeless',
    layoutKind: 'shapeless',
    values: { result: sv('item', 'minecraft:stick'), ingredients: [sv('item', 'minecraft:oak_planks')] }
  })

  it('1.20.1 → ServerEvents.recipes', () => {
    const code = emitScript(base, bench, SUGAR, modpack({ mcVersion: '1.20.1' }), CREATED_AT).code
    expect(code).toContain('ServerEvents.recipes(event => {')
    expect(code).not.toContain("onEvent('recipes'")
  })

  it('1.18.2 → onEvent(\'recipes\'，并保留 Created 时间', () => {
    const code = emitScript(base, bench, SUGAR, modpack({ mcVersion: '1.18.2' }), CREATED_AT).code
    expect(code).toContain("onEvent('recipes', event => {")
    expect(code).toContain('// Created : 2026-10-30 21:40')
  })

  it('未导入整合包时头部不崩，标注未检测到', () => {
    const code = emitScript(base, bench, SUGAR, null, CREATED_AT).code
    expect(code).toContain('// Modpack : 未导入整合包')
    expect(code).toContain('未检测到 KubeJS')
  })
})

describe('注册表 emitShape 三形态与数量语义', () => {
  const infusing = schema({
    id: 'mekanism:metallurgic_infusing',
    modId: 'mekanism',
    layoutKind: 'single_io',
    emitTarget: 'event.recipes.mekanism.metallurgic_infusing',
    outputs: [field('output', 'item')],
    slots: [field('input', 'item'), field('infuseType', 'registry', { registry: 'mekanism:infuse_type', emitShape: 'scalar' })],
    channel: SUGAR
  })

  it('scalar：灌注类型是独立字符串参数，用量是独立数字参数', () => {
    const bench = workbench({
      typeId: 'mekanism:metallurgic_infusing',
      layoutKind: 'single_io',
      values: {
        output: sv('item', 'minecraft:comparator'),
        input: sv('item', 'minecraft:nether_quartz'),
        infuseType: sv('registry', 'mekanism:redstone', { amount: 20, registryType: 'mekanism:infuse_type' })
      }
    })
    expect(statementsOf(emitScript(infusing, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      [
        '  event.recipes.mekanism.metallurgic_infusing(',
        "    'minecraft:comparator',",
        "    'minecraft:nether_quartz',",
        "    'mekanism:redstone',",
        '    20',
        '  )'
      ].join('\n')
    )
  })

  it('object：气体打包成 { gas, amount }，不拆成两个参数', () => {
    const purifying = schema({
      id: 'mekanism:purifying',
      modId: 'mekanism',
      layoutKind: 'single_io',
      emitTarget: 'event.recipes.mekanism.purifying',
      outputs: [field('output', 'item')],
      slots: [field('input', 'item'), field('gas', 'registry', { registry: 'mekanism:gas', emitShape: 'object' })],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'mekanism:purifying',
      layoutKind: 'single_io',
      values: {
        output: sv('item', 'minecraft:obsidian'),
        input: sv('item', 'minecraft:lava_bucket'),
        gas: sv('registry', 'mekanism:oxygen', { amount: 200, registryType: 'mekanism:gas' })
      }
    })
    expect(statementsOf(emitScript(purifying, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      [
        '  event.recipes.mekanism.purifying(',
        "    'minecraft:obsidian',",
        "    'minecraft:lava_bucket',",
        "    { gas: 'mekanism:oxygen', amount: 200 }",
        '  )'
      ].join('\n')
    )
  })

  it('positional：按声明顺序逐个占位（ID 与用量各占一个参数）', () => {
    const positional = schema({
      id: 'mekanism:smelting',
      modId: 'mekanism',
      layoutKind: 'single_io',
      emitTarget: 'event.recipes.mekanism.smelting',
      outputs: [field('output', 'item')],
      slots: [field('additive', 'registry', { registry: 'mekanism:slurry', emitShape: 'positional' })],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'mekanism:smelting',
      layoutKind: 'single_io',
      values: {
        output: sv('item', 'minecraft:iron_ingot'),
        additive: sv('registry', 'mekanism:iron', { amount: 100, registryType: 'mekanism:slurry' })
      }
    })
    expect(statementsOf(emitScript(positional, bench, SUGAR, modpack(), CREATED_AT).code)).toBe(
      [
        '  event.recipes.mekanism.smelting(',
        "    'minecraft:iron_ingot',",
        "    'mekanism:iron',",
        '    100',
        '  )'
      ].join('\n')
    )
  })
})

describe('3.7 其余生成规则', () => {
  const box = schema({
    id: 'minecraft:crafting_shaped',
    layoutKind: 'shaped',
    emitTarget: 'event.shaped',
    outputs: [field('result', 'item')],
    channel: SUGAR
  })

  it('数量为 1 时省略 `1x ` 前缀，>1 才写', () => {
    const grid = emptyGrid(3, 3)
    putGrid(grid, 3, 0, 0, sv('item', 'minecraft:oak_log'))
    const one = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 3,
      gridCols: 3,
      values: { grid, result: sv('item', 'minecraft:oak_planks', { count: 1 }) }
    })
    expect(statementsOf(emitScript(box, one, SUGAR, modpack(), CREATED_AT).code)).toContain("event.shaped('minecraft:oak_planks'")
    const two = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 3,
      gridCols: 3,
      values: { grid, result: sv('item', 'minecraft:oak_planks', { count: 2 }) }
    })
    expect(statementsOf(emitScript(box, two, SUGAR, modpack(), CREATED_AT).code)).toContain("event.shaped('2x minecraft:oak_planks'")
  })

  it('标签写 `#ns:tag`，缺省命名空间自动补 minecraft:', () => {
    const shapeless = schema({
      id: 'minecraft:crafting_shapeless',
      layoutKind: 'shapeless',
      emitTarget: 'event.shapeless',
      outputs: [field('result', 'item')],
      slots: [field('ingredients', 'tag', { multiple: true })],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'minecraft:crafting_shapeless',
      layoutKind: 'shapeless',
      values: { result: sv('item', 'stick'), ingredients: [sv('tag', 'forge:ingots/iron')] }
    })
    const text = statementsOf(emitScript(shapeless, bench, SUGAR, modpack(), CREATED_AT).code)
    expect(text).toBe("  event.shapeless('minecraft:stick', ['#forge:ingots/iron'])")
  })

  it('物品 count 与流体 amount 绝不互换', () => {
    const mixing = schema({
      id: 'create:mixing',
      modId: 'create',
      layoutKind: 'multi_io',
      emitTarget: 'event.recipes.create.mixing',
      outputs: [field('result', 'fluid')],
      slots: [field('ingredients', 'item', { multiple: true })],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: sv('fluid', 'minecraft:lava', { amount: 250, count: 3 }),
        ingredients: [sv('item', 'minecraft:gravel', { count: 2 })]
      }
    })
    const text = statementsOf(emitScript(mixing, bench, SUGAR, modpack(), CREATED_AT).code)
    expect(text).toContain("Fluid.of('minecraft:lava', 250)")
    expect(text).not.toContain('3x')
    expect(text).toContain("'2x minecraft:gravel'")
  })

  it('链式修饰符按 schema 声明顺序追加，不受用户填写顺序影响', () => {
    const mixing = schema({
      id: 'create:mixing',
      modId: 'create',
      layoutKind: 'multi_io',
      emitTarget: 'event.recipes.create.mixing',
      outputs: [field('result', 'item')],
      slots: [field('ingredients', 'item', { multiple: true })],
      modifiers: [
        { key: 'heated', displayName: '加热', kind: 'boolean', chain: 'heated' },
        { key: 'processingTime', displayName: '处理时间', kind: 'number', chain: 'processingTime' },
        { key: 'energy', displayName: '能耗', kind: 'number', chain: 'energy' }
      ],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: [sv('item', 'minecraft:iron_ingot')] },
      modifiers: { energy: 4000, processingTime: 500, heated: true }
    })
    const text = statementsOf(emitScript(mixing, bench, SUGAR, modpack(), CREATED_AT).code)
    expect(text).toMatch(/\.heated\(\)\.processingTime\(500\)\.energy\(4000\)$/)
  })
})
