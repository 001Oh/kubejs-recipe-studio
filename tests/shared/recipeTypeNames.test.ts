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

  it('已知 ns 但未知尾部：无 ns 组合可用 → fallback（不猜译名）', () => {
    expect(recipeTypeNameZh('mekanism:mek_data', '数据')).toBe('数据')
  })

  it('无冒号的裸 id：走尾部映射或 fallback', () => {
    expect(recipeTypeNameZh('crafting_shaped', 'x')).toBe('x')
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
})
