/** 通用启发式提取器单测：全部样例取自规格 §3.2 源 C 与 §3.6.12 的真实 JSON 形态。 */
import { describe, expect, it } from 'vitest'
import { extractRecipeIo } from '../../src/main/recipes/heuristics'

describe('原版配方', () => {
  it('crafting_shaped：pattern×key 展开，空格占位跳过，result.count 生效', () => {
    const json = {
      type: 'minecraft:crafting_shaped',
      pattern: ['AA ', 'A A', '   A'],
      key: { A: { item: 'minecraft:oak_log' } },
      result: { item: 'minecraft:oak_planks', count: 4 }
    }
    const r = extractRecipeIo('minecraft:crafting_shaped', json)
    expect(r.partial).toBe(false)
    expect(r.outputs).toEqual([{ id: 'minecraft:oak_planks', count: 4, kind: 'item' }])
    expect(r.inputs).toHaveLength(5) // 5 个 A，5 个空格占位跳过
    expect(r.inputs.every((i) => i.id === 'minecraft:oak_log')).toBe(true)
  })

  it('crafting_shapeless：ingredients 数组', () => {
    const json = {
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ item: 'minecraft:berry_pile' }, { tag: 'forge:conduits' }, 'minecraft:stick'],
      result: { item: 'minecraft:bundle', count: 1 }
    }
    const r = extractRecipeIo('minecraft:crafting_shapeless', json)
    expect(r.partial).toBe(false)
    expect(r.outputs[0]?.id).toBe('minecraft:bundle')
    expect(r.inputs.map((i) => [i.id, i.kind])).toEqual([
      ['minecraft:berry_pile', 'item'],
      ['forge:conduits', 'tag'],
      ['minecraft:stick', 'item']
    ])
  })

  it('smelting：result 为纯字符串物品引用', () => {
    const json = { type: 'minecraft:smelting', ingredient: { item: 'minecraft:sand' }, result: 'minecraft:glass', cookingtime: 170, experience: 0.1 }
    const r = extractRecipeIo('minecraft:smelting', json)
    expect(r.partial).toBe(false)
    expect(r.outputs).toEqual([{ id: 'minecraft:glass', count: 1, kind: 'item' }])
    expect(r.inputs).toEqual([{ id: 'minecraft:sand', count: 1, kind: 'item' }])
  })
})

describe('Create / Mekanism', () => {
  it('create:mixing：results 数组 + 概率 + fluid_ingredients', () => {
    const json = {
      type: 'create:mixing',
      heatRequirement: 'superheated',
      ingredients: [{ item: 'minecraft:raw_iron' }, { count: 2, item: 'minecraft:coal' }],
      fluid_ingredients: [{ amount: 250, fluid: 'minecraft:lava' }],
      results: [
        { id: 'create:crushed_raw_iron', count: 1 },
        { item: 'create:experience_nugget', count: 1, chance: 0.5 }
      ]
    }
    const r = extractRecipeIo('create:mixing', json)
    expect(r.partial).toBe(false)
    expect(r.outputs).toEqual([
      { id: 'create:crushed_raw_iron', count: 1, kind: 'item' },
      { id: 'create:experience_nugget', count: 1, kind: 'item', chance: 0.5 }
    ])
    expect(r.inputs.find((i) => i.id === 'minecraft:lava')).toEqual({ id: 'minecraft:lava', count: 250, kind: 'fluid' })
    expect(r.inputs.find((i) => i.id === 'minecraft:coal')?.count).toBe(2)
  })

  it('mekanism:metallurgic_infusing：infusionInput{amount,tag} + 包装 ingredient', () => {
    const json = {
      type: 'mekanism:metallurgic_infusing',
      input: { amount: 1, ingredient: { item: 'minecraft:nether_quartz' } },
      infusionInput: { amount: 20, tag: 'mekanism:redstone' },
      output: { item: 'minecraft:comparator' }
    }
    const r = extractRecipeIo('mekanism:metallurgic_infusing', json)
    expect(r.partial).toBe(false)
    expect(r.outputs).toEqual([{ id: 'minecraft:comparator', count: 1, kind: 'item' }])
    expect(r.inputs).toEqual([
      { id: 'minecraft:nether_quartz', count: 1, kind: 'item' },
      { id: 'mekanism:redstone', count: 20, kind: 'tag' }
    ])
  })
})

describe('IE / IP（§3.6.12 概率与字符串概率）', () => {
  it('immersiveengineering:arc_furnace：results[base_ingredient,count] + secondaries[chance,output] + slag', () => {
    const json = {
      type: 'immersiveengineering:arc_furnace',
      input: { tag: 'mekanism:crystals/allthemodium' },
      additives: [{ tag: 'mekanism:alloys/atomic' }, { tag: 'mekanism:alloys/atomic' }],
      results: [{ base_ingredient: { tag: 'mekanism:crystals/allthemodium' }, count: 1 }],
      secondaries: [{ chance: 0.2, output: { tag: 'forge:ingots/allthemodium' } }],
      slag: { tag: 'forge:slag' },
      energy: 6144000,
      time: 6000
    }
    const r = extractRecipeIo('immersiveengineering:arc_furnace', json)
    const byId = new Map(r.outputs.map((o) => [o.id, o]))
    expect(byId.get('mekanism:crystals/allthemodium')?.count).toBe(1)
    expect(byId.get('forge:ingots/allthemodium')).toMatchObject({ kind: 'tag', chance: 0.2 })
    expect(byId.get('forge:slag')?.kind).toBe('tag')
    expect(r.inputs.filter((i) => i.id === 'mekanism:alloys/atomic')).toHaveLength(2)
    expect(r.inputs.some((i) => i.id === 'mekanism:crystals/allthemodium' && i.kind === 'tag')).toBe(true)
    expect(r.partial).toBe(false)
  })

  it('immersivepetroleum:distillation：byproducts 字符串概率 "0.07" 解析为 0.07', () => {
    const json = {
      type: 'immersivepetroleum:distillation',
      input: { tag: 'forge:crude_oil', amount: 75 },
      results: [
        { fluid: 'immersivepetroleum:lubricant', amount: 9 },
        { fluid: 'immersivepetroleum:diesel', amount: 27 },
        { fluid: 'immersivepetroleum:gasoline', amount: 39 }
      ],
      byproducts: [{ item: 'immersivepetroleum:bitumen', chance: '0.07' }],
      energy: 2048,
      time: 1
    }
    const r = extractRecipeIo('immersivepetroleum:distillation', json)
    expect(r.inputs).toEqual([{ id: 'forge:crude_oil', count: 75, kind: 'tag' }])
    expect(r.outputs.filter((o) => o.kind === 'fluid')).toHaveLength(3)
    expect(r.outputs.find((o) => o.id === 'immersivepetroleum:diesel')?.count).toBe(27)
    expect(r.outputs.find((o) => o.id === 'immersivepetroleum:bitumen')).toEqual({
      id: 'immersivepetroleum:bitumen',
      count: 1,
      kind: 'item',
      chance: 0.07
    })
    expect(r.partial).toBe(false)
  })
})

describe('AE2 特殊形态', () => {
  it('ae2:inscriber：ingredients 命名对象（top/middle/bottom）', () => {
    const json = {
      type: 'ae2:inscriber',
      mode: 'inscribe',
      ingredients: {
        top: { item: 'ae2:calculation_processor_press' },
        middle: { item: 'ae2:certus_quartz_crystal' }
      },
      result: { item: 'ae2:calculation_processor_print' }
    }
    const r = extractRecipeIo('ae2:inscriber', json)
    expect(r.partial).toBe(false)
    expect(r.outputs[0]?.id).toBe('ae2:calculation_processor_print')
    expect(r.inputs.map((i) => i.id).sort()).toEqual(['ae2:calculation_processor_press', 'ae2:certus_quartz_crystal'])
  })

  it('ae2:entropy：blockstate 输入（registry kind）+ drops 输出', () => {
    const json = {
      type: 'ae2:entropy',
      mode: 'heat',
      input: { block: { id: 'minecraft:cobblestone', moisture: { min: 1, max: 5 } } },
      output: { block: { id: 'minecraft:stone', keep: true }, drops: [{ item: 'minecraft:flint', count: 1 }] }
    }
    const r = extractRecipeIo('ae2:entropy', json)
    expect(r.inputs).toEqual([{ id: 'minecraft:cobblestone', count: 1, kind: 'registry' }])
    expect(r.outputs).toEqual([
      { id: 'minecraft:stone', count: 1, kind: 'registry' },
      { id: 'minecraft:flint', count: 1, kind: 'item' }
    ])
  })
})

describe('引用形式与失败兜底', () => {
  it('全部 7 种物品引用形式：{item}/{tag}/{id}/{fluid}/{fluidStack}/{items}/纯字符串', () => {
    const json = {
      type: 'test:all_forms',
      ingredients: [
        { item: 'a:1' },
        { tag: 'a:2' },
        { id: 'a:3' },
        { fluid: 'a:4' },
        { fluidStack: { fluid: 'a:5', amount: 500 } },
        { items: ['a:6', 'a:7'] },
        'a:8'
      ],
      result: { item: 'a:done' }
    }
    const r = extractRecipeIo('test:all_forms', json)
    expect(r.partial).toBe(false)
    expect(r.inputs.map((i) => i.id)).toEqual(['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6', 'a:7', 'a:8'])
    expect(r.inputs.find((i) => i.id === 'a:2')?.kind).toBe('tag')
    expect(r.inputs.find((i) => i.id === 'a:5')).toEqual({ id: 'a:5', count: 500, kind: 'fluid' })
    expect(r.inputs.find((i) => i.id === 'a:8')?.kind).toBe('item')
  })

  it('完全无法识别的怪异结构：partial=true、不抛错、引用只进 unknownIds', () => {
    const json = { type: 'totally:weird', zzz: { magic: [{ item: 'some:thing' }], why: [1, 2, 3] } }
    expect(() => extractRecipeIo('totally:weird', json)).not.toThrow()
    const r = extractRecipeIo('totally:weird', json)
    expect(r.partial).toBe(true) // 无任何可提取产物 → partial
    expect(r.outputs).toHaveLength(0)
    expect(r.inputs).toHaveLength(0)
    expect(r.unknownIds).toEqual(['some:thing'])
  })

  it('产物已提取 + 未知键引用：不标 partial，只登记 unknownIds', () => {
    const json = { type: 'odd:mod', result: { item: 'odd:gem' }, process: { machine: 'odd:crusher', spin: 42 } }
    const r = extractRecipeIo('odd:mod', json)
    expect(r.outputs).toEqual([{ id: 'odd:gem', count: 1, kind: 'item' }])
    expect(r.partial).toBe(false)
    expect(r.unknownIds).toEqual(['odd:crusher'])
  })

  it('已识别角色键内出现坏引用：产物仍保留，配方标 partial', () => {
    const json = { type: 'odd:mod2', result: { item: 'odd:gem' }, ingredients: ['no_colon_here'] }
    const r = extractRecipeIo('odd:mod2', json)
    expect(r.outputs).toHaveLength(1)
    expect(r.partial).toBe(true)
  })

  it('裸类型名（无命名空间，部分数据包写法）不算解析失败', () => {
    const json = { type: 'crafting_shaped', pattern: ['AA'], key: { A: { item: 'minecraft:stick' } }, result: { item: 'minecraft:block' } }
    const r = extractRecipeIo('crafting_shaped', json)
    expect(r.partial).toBe(false)
  })

  it('条件包装（forge:conditional / fabric load_conditions）：剥离后内层正常解析，不误标 partial', () => {
    const json = {
      'fabric:load_conditions': [{ condition: 'fabric:all_mods_loaded', values: ['create'] }],
      conditions: [{ type: 'forge:mod_loaded', modid: 'create' }],
      type: 'forge:conditional',
      recipes: [
        {
          conditions: [{ type: 'forge:mod_loaded', modid: 'ad_astra' }],
          recipe: {
            type: 'create:crushing',
            ingredients: [{ item: 'ad_astra:deepslate_calorite_ore' }],
            results: [{ item: 'ad_astra:raw_calorite', count: 2 }]
          }
        }
      ]
    }
    const r = extractRecipeIo('forge:conditional', json)
    expect(r.outputs).toEqual([{ id: 'ad_astra:raw_calorite', count: 2, kind: 'item' }])
    expect(r.inputs).toEqual([{ id: 'ad_astra:deepslate_calorite_ore', count: 1, kind: 'item' }])
    expect(r.partial).toBe(false)
    expect(r.unknownIds).toEqual([])
  })

  it('非对象输入 / 非法 type 不抛错', () => {
    expect(extractRecipeIo('bad:type', null).partial).toBe(true)
    expect(extractRecipeIo('', { result: { item: 'a:b' } }).partial).toBe(true)
    expect(extractRecipeIo('a:b', [1, 2]).outputs).toHaveLength(0)
  })
})
