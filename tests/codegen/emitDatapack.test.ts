/**
 * 模式 B：数据包 JSON 的**原样序列化**（规格 3.6.6 / §八）。
 * 覆盖：type 取原始 RecipeType ID、compound 键还原、注册表嵌套不摊平、字符串概率保持字符串、
 * 数字不加引号、文件名规则、namespace 冲突自动加后缀。
 */
import { describe, expect, it } from 'vitest'
import {
  datapackFileName,
  emitDatapack,
  resolveNamespace,
  buildRecipeJson,
  jarNamespaceProbe
} from '../../src/main/codegen/emitDatapack'
import { emptyGrid, field, putGrid, schema, sv, workbench } from './helpers'

const DATAPACK_BASE = 'recipe_studio'

const mixing = schema({  id: 'create:mixing',
  modId: 'create',
  layoutKind: 'multi_io',
  outputs: [field('result', 'item', { multiple: true })],
  slots: [field('ingredients', 'item', { multiple: true })],
  extraFields: [field('energy', 'number')]
})

describe('原样序列化', () => {
  it('type 用原始 RecipeType ID，数字不加引号，材料是数组', () => {
    const bench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: [sv('item', 'minecraft:steel_ingot', { count: 2 })],
        ingredients: [sv('item', 'minecraft:iron_ingot'), sv('tag', 'forge:ingots/iron')],
        energy: 4000
      },
      modifiers: {}
    })
    const { json } = buildRecipeJson(mixing, bench)
    expect(json).toEqual({
      type: 'create:mixing',
      result: [{ item: 'minecraft:steel_ingot', count: 2 }],
      ingredients: [{ item: 'minecraft:iron_ingot' }, { tag: 'forge:ingots/iron' }],
      energy: 4000
    })
  })

  it('模组用字符串表达概率时原样输出字符串，不做数值转换', () => {
    const distillation = schema({
      id: 'immersivepetroleum:distillation',
      modId: 'immersivepetroleum',
      layoutKind: 'multi_io',
      outputs: [field('products', 'item', { multiple: true })],
      slots: [field('input', 'item')]
    })
    const bench = workbench({
      typeId: 'immersivepetroleum:distillation',
      layoutKind: 'multi_io',
      values: {
        input: sv('item', 'immersivepetroleum:gasoline'),
        products: [sv('item', 'minecraft:diesel', { chance: '0.07' as unknown as number })]
      }
    })
    const text = emitDatapack(distillation, bench, 'recipe_studio').files[0]?.json ?? ''
    expect(text).toContain('"chance": "0.07"')
    expect(text).not.toContain('"chance": 0.07')
  })

  it('注册表量嵌套成 { amount, tag }（不摊平）', () => {
    const infusing = schema({
      id: 'mekanism:metallurgic_infusing',
      modId: 'mekanism',
      layoutKind: 'single_io',
      outputs: [field('output', 'item')],
      slots: [
        field('input', 'item', { compound: ['count'] }),
        field('infusionInput', 'registry', {
          registry: 'mekanism:infuse_type',
          emitShape: 'scalar',
          compound: ['amount', 'tag']
        })
      ]
    })
    const bench = workbench({
      typeId: 'mekanism:metallurgic_infusing',
      layoutKind: 'single_io',
      values: {
        output: sv('item', 'minecraft:comparator'),
        input: sv('item', 'minecraft:nether_quartz', { count: 1 }),
        infusionInput: sv('registry', 'mekanism:redstone', { amount: 20 })
      }
    })
    const { json } = buildRecipeJson(infusing, bench)
    expect(json['infusionInput']).toEqual({ tag: 'mekanism:redstone', amount: 20 })
    // compound:['count'] 的引用字段把数量还原到父级同层
    expect(json['input']).toEqual({ item: 'minecraft:nether_quartz' })
    expect(json['count']).toBe(1)
  })

  it('NBT 未填时绝不塞 {}，填了才写', () => {
    const box = schema({ id: 'x:y', outputs: [field('result', 'item', { multiple: true })] })
    const bare = workbench({ typeId: 'x:y', values: { result: [sv('item', 'minecraft:diamond_sword')] } })
    expect(JSON.stringify(buildRecipeJson(box, bare).json)).not.toContain('nbt')
    const withNbt = workbench({
      typeId: 'x:y',
      values: { result: [sv('item', 'minecraft:diamond_sword', { nbt: { Enchantments: [{ id: 'minecraft:sharpness', lvl: 5 }] } })] }
    })
    expect(buildRecipeJson(box, withNbt).json['result']).toEqual([
      { item: 'minecraft:diamond_sword', nbt: { Enchantments: [{ id: 'minecraft:sharpness', lvl: 5 }] } }
    ])
  })

  it('有序合成裁出 pattern/key，key 是引用对象', () => {
    const grid = emptyGrid(3, 3)
    putGrid(grid, 3, 1, 1, sv('item', 'minecraft:oak_log'))
    putGrid(grid, 3, 2, 1, sv('item', 'minecraft:oak_log'))
    const shaped = schema({ id: 'minecraft:crafting_shaped', layoutKind: 'shaped', outputs: [field('result', 'item')] })
    const { json } = buildRecipeJson(shaped, workbench({ typeId: 'minecraft:crafting_shaped', layoutKind: 'shaped', gridRows: 3, gridCols: 3, values: { grid, result: sv('item', 'minecraft:oak_planks', { count: 4 }) } }))
    expect(json['pattern']).toEqual(['A', 'A'])
    expect(json['key']).toEqual({ A: { item: 'minecraft:oak_log' } })
    expect(json['type']).toBe('minecraft:crafting_shaped')
  })

  it('schema 未声明的键也原样带出（绝不丢用户参数）', () => {
    const bench = workbench({ typeId: 'create:mixing', layoutKind: 'multi_io', values: { extraFlag: true, category: 'misc' } })
    const { json } = buildRecipeJson(mixing, bench)
    expect(json['extraFlag']).toBe(true)
    expect(json['category']).toBe('misc')
  })
})

describe('文件名与 namespace', () => {
  const bench = workbench({
    typeId: 'create:mixing',
    layoutKind: 'multi_io',
    values: { result: [sv('item', 'minecraft:steel_ingot')], ingredients: [sv('item', 'minecraft:iron_ingot')] }
  })

  it(`<type路径>_<产物id>_<序号>.json`, () => {
    expect(datapackFileName(mixing, bench, 1)).toBe('mixing_steel_ingot_1.json')
    expect(datapackFileName(mixing, bench, 7)).toBe('mixing_steel_ingot_7.json')
  })

  it('子路径产物只取末段，非法字符转下划线', () => {
    const nested = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: { result: [sv('item', 'ars_nouveau:ritual/craft_dimensional_matrix')] }
    })
    expect(datapackFileName(mixing, nested, 1)).toBe('mixing_craft_dimensional_matrix_1.json')
  })

  it('写出的相对路径与配方 ID 一致', () => {
    const out = emitDatapack(mixing, bench, 'recipe_studio')
    expect(out.files[0]?.relativePath).toBe('kubejs/data/recipe_studio/recipes/mixing_steel_ingot_1.json')
    expect(out.files[0]?.recipeId).toBe('recipe_studio:mixing_steel_ingot_1')
  })

  it('namespace 冲突自动加后缀 recipe_studio2', async () => {
    const taken = new Set(['recipe_studio'])
    const resolved = await resolveNamespace(async (ns) => taken.has(ns))
    expect(resolved).toBe('recipe_studio2')
    expect(await resolveNamespace(async (ns) => ns === DATAPACK_BASE)).toBe('recipe_studio2')
  })

  it('未冲突时保持 recipe_studio', async () => {
    expect(await resolveNamespace(async () => false)).toBe('recipe_studio')
  })

  it('已存在同名文件时序号递加', () => {
    const out = emitDatapack(mixing, bench, 'recipe_studio', new Set(['mixing_steel_ingot_1.json']))
    expect(out.files[0]?.fileName).toBe('mixing_steel_ingot_2.json')
  })

  it('jar namespace 探针：空 mods 目录视为未占用', async () => {
    const probe = jarNamespaceProbe('')
    expect(await probe('recipe_studio')).toBe(false)
  })
})
