import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { recipeTypeNameZh } from '../../src/shared/recipeTypeNames'

describe('recipeTypeNameZh：配方类型中文名三级解析', () => {
  it('整 id 定制译名优先', () => {
    expect(recipeTypeNameZh('minecraft:crafting_shaped')).toBe('有序合成（3×3）')
    expect(recipeTypeNameZh('create:mixing')).toBe('机械动力 · 动力搅拌器')
  })

  it('ns + 尾部组合：内置表未覆盖的类型走「模组中文 · 动作中文」', () => {
    expect(recipeTypeNameZh('mekanism:chemical_infusing')).toBe('通用机械 · 化学灌注')
    expect(recipeTypeNameZh('create:crushing')).toBe('机械动力 · 粉碎轮')
    expect(recipeTypeNameZh('hephaestus:casting_table')).toBe('匠魂 · 铸造台')
    expect(recipeTypeNameZh('productivemetalworks:item_melting')).toBe('生产力金属加工 · 物品熔炼')
  })

  it('未知命名空间/未知尾部：返回 fallback', () => {
    expect(recipeTypeNameZh('unknownmod:weird_type', 'Some Type')).toBe('Some Type')
    expect(recipeTypeNameZh('unknownmod:weird_type')).toBe('unknownmod:weird_type')
  })

  // 第 118 批改口径：包内全部 416 种类型都必须有中文译名（负责人要求「所有配方类型都有中文」），
  // 旧断言「已知 ns 未知尾部走 fallback 不猜译名」已被全覆盖表取代——mek_data 现有正式译名。
  it('已知 ns 但未知尾部：整 id 表优先于组合表', () => {
    expect(recipeTypeNameZh('mekanism:mek_data', '数据')).toBe('通用机械 · 数据模型')
    expect(recipeTypeNameZh('unknownmod:weird_type', 'Some Type')).toBe('Some Type')
  })

  // 第 118 批改口径：裸 id（无冒号，KJS/数据包不规范写法）也入整 id 表，不再落 fallback。
  it('无冒号的裸 id：走整 id 表', () => {
    expect(recipeTypeNameZh('crafting_shaped', 'x')).toBe('有序合成（3×3）')
    expect(recipeTypeNameZh('crafting_shapeless', 'x')).toBe('无序合成')
    expect(recipeTypeNameZh('smelting', 'x')).toBe('熔炼')
  })

  // T-117 实机验收发现：smithing_transform 在真实下拉里渲染成拉丁文「smithing transform」
  // （tailOf 按首个冒号切分，tail 是 smithing_transform 整体，`smithing: '锻造'` 命中不了）。
  // 该用例对内置 8 项逐条断言「不给 fallback 也必须是中文」，防止同类遗漏。
  it('内置原版家族 8 项：不传 fallback 也必须渲染成中文', () => {
    const BUILTIN_IDS = [
      'minecraft:blasting',
      'minecraft:campfire_cooking',
      'minecraft:crafting_shaped',
      'minecraft:crafting_shapeless',
      'minecraft:smelting',
      'minecraft:smithing_transform',
      'minecraft:smoking',
      'minecraft:stonecutting'
    ]
    for (const id of BUILTIN_IDS) expect(recipeTypeNameZh(id), id).toMatch(/[\u4e00-\u9fa5]/u)
  })

  // 第 118 批实机截图暴露：类型下拉里 brewery / elven trade / petal apothecary 是英文，
  // mana_infusion 渲染成中英混排「mana 灌注」（词表只命中 infusion，mana 未命中）。
  // 这条用例把 L0 库里全部类型钉成「不许出现拉丁字母开头的纯英文名」。
  it('L0 库全部类型：不传 fallback 必须渲染成中文（禁止英文/中英混排）', () => {
    const L0_IDS = [
      // 植物魔法
      'botania:petal_apothecary',
      'botania:runic_altar',
      'botania:terra_plate',
      'botania:mana_infusion',
      'botania:elven_trade',
      'botania:pure_daisy',
      'botania:brewery',
      // 新生魔艺
      'ars_nouveau:enchanting_apparatus',
      'ars_nouveau:imbuement',
      'ars_nouveau:crush',
      'ars_nouveau:glyph',
      'ars_nouveau:sourcelink',
      // 气动工艺
      'pneumaticcraft:pressure_chamber',
      'pneumaticcraft:assembly',
      'pneumaticcraft:explosion',
      'pneumaticcraft:refinery',
      'pneumaticcraft:thermopneumatic',
      // 沉浸工程
      'immersiveengineering:arc_furnace',
      'immersiveengineering:blast_furnace',
      'immersiveengineering:coke_oven',
      'immersiveengineering:crusher',
      'immersiveengineering:sawmill',
      'immersiveengineering:metal_press',
      'immersiveengineering:bottling_machine',
      'immersiveengineering:fermenter',
      'immersiveengineering:squeezer',
      'immersiveengineering:refinery',
      'immersiveengineering:mixer',
      'immersiveengineering:assembler',
      // 热力
      'thermal:insolator',
      'thermal:bottler',
      'thermal:rock_gen'
    ]
    for (const id of L0_IDS) {
      const zh = recipeTypeNameZh(id)
      expect(zh, id).toMatch(/[\u4e00-\u9fa5]/u)
      // 中英混排（如「mana 灌注」）也要拦：不允许出现连续的拉丁词
      expect(zh, `${id} 出现英文词：${zh}`).not.toMatch(/[A-Za-z]{3,}/u)
    }
  })

  it('同名尾部按整 id 区分（IE 蒸馏塔 vs 气动炼油厂）', () => {
    expect(recipeTypeNameZh('immersiveengineering:refinery')).toBe('蒸馏塔')
    expect(recipeTypeNameZh('pneumaticcraft:refinery')).toBe('炼油厂')
  })

  // 第 118 批：真实整合包（PC7, 295 jar）实测 416 种类型全量快照，
  // 每一种都必须渲染出中文名（含禁英文/中英混排）。fixture 由实机缓存生成。
  it('真实包 416 种类型全覆盖：每种都必须有中文（禁止英文/中英混排）', () => {
    const raw = readFileSync(new URL('./fixtures/recipeTypeIds-416.json', import.meta.url), 'utf8')
    const ids = JSON.parse(raw) as string[]
    expect(ids.length).toBe(416)
    for (const id of ids) {
      const zh = recipeTypeNameZh(id)
      expect(zh, `${id} 渲染成非中文：${zh}`).toMatch(/[\u4e00-\u9fa5]/u)
      expect(zh, `${id} 出现英文词：${zh}`).not.toMatch(/[A-Za-z]{3,}/u)
    }
  })
})
