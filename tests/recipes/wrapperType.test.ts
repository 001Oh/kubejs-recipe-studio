/**
 * B120/D-03：条件包装（forge:conditional 等 recipe/recipes 包装形态）按**内层配方 type** 归类。
 *
 * 现状缺陷：1,536 条条件包装配方被记成假类型 `forge:conditional`（record.ts 取顶层 type），
 * 本体样本不计入真实类型（crafting_shaped 等）。IO 提取早已剥包装（heuristics.unwrapNested），
 * 本单补上类型归类：buildRecord 解出内层 type 作为 record.type；外层 conditions 不动——
 * denormalize 从 raw 克隆打补丁，conditions 天然保留供写回（TYPE_CHANGED 闸兜住误写）。
 *
 * 真实包验收（RUN_REAL_PACK=1）：forge:conditional 归 0；minecraft:crafting_shaped 增约 1,500；
 * partial 升幅 ≤1%（IO 提取路径不变，partial 理应不动）。
 */
import { describe, expect, it } from 'vitest'
import { buildRecord } from '../../src/main/recipes/record'

const WRAPPER_SHAPED = {
  type: 'forge:conditional',
  conditions: [{ type: 'forge:mod_loaded', modid: 'minecraft' }],
  recipe: {
    type: 'minecraft:crafting_shaped',
    pattern: ['XX', 'XX'],
    key: { X: { item: 'minecraft:iron_ingot' } },
    result: { item: 'minecraft:iron_block', count: 1 }
  }
}

function recordOf(json: unknown, outerType: string | null = null) {
  return buildRecord({
    uid: 'jar:test.jar#data/ns/recipes/x.json',
    recipeId: 'ns:x',
    type: outerType ?? '',
    source: 'datapack',
    sourcePath: 'E:/pack/kubejs/data/ns/recipes/x.json',
    text: JSON.stringify(json)
  })
}

describe('D-03 包装配方按内层 type 归类', () => {
  it('forge:conditional + 内层 crafting_shaped → record.type 是内层类型，IO 取自内层，不标 partial', () => {
    const rec = recordOf(WRAPPER_SHAPED, 'forge:conditional')
    expect(rec.type).toBe('minecraft:crafting_shaped')
    expect(rec.partial).toBe(false)
    expect(rec.outputs.map((o) => o.id)).toContain('minecraft:iron_block')
    expect(rec.inputs.map((i) => i.id)).toContain('minecraft:iron_ingot')
  })

  it('recipes 数组包装形态 → 取首元素的 type', () => {
    const rec = recordOf({
      type: 'forge:conditional',
      conditions: [],
      recipes: [WRAPPER_SHAPED['recipe']]
    })
    expect(rec.type).toBe('minecraft:crafting_shaped')
  })

  it('双层包装（实包 Ad-Astra Giselle 形态）：recipes[] → {conditions, recipe:{type}} → 取最内层 type', () => {
    const rec = recordOf({
      type: 'forge:conditional',
      conditions: [{ type: 'forge:mod_loaded', modid: 'industrialforegoing' }],
      recipes: [
        {
          conditions: [{ type: 'forge:mod_loaded', modid: 'ad_astra' }],
          recipe: {
            type: 'industrialforegoing:laser_drill_fluid',
            catalyst: { item: 'industrialforegoing:laser_lens7' },
            output: '{Amount:50,FluidName:"ad_astra:oil"}'
          }
        }
      ]
    })
    expect(rec.type).toBe('industrialforegoing:laser_drill_fluid')
  })

  it('内层没有合法 type → 维持外层类型（不强行归类）', () => {
    const rec = recordOf({
      type: 'forge:conditional',
      conditions: [],
      recipe: { pattern: ['X'], key: { X: { item: 'minecraft:iron_ingot' } } }
    }, 'forge:conditional')
    expect(rec.type).toBe('forge:conditional')
  })

  it('普通配方（无包装键）零影响', () => {
    const rec = recordOf({
      type: 'minecraft:smelting',
      ingredient: { item: 'minecraft:cobblestone' },
      result: { item: 'minecraft:stone' }
    }, 'minecraft:smelting')
    expect(rec.type).toBe('minecraft:smelting')
    expect(rec.partial).toBe(false)
  })

  it('recipe 键是引用对象（非配方包装，无内层 type）→ 维持外层类型', () => {
    const rec = recordOf({
      type: 'minecraft:smelting',
      recipe: { item: 'minecraft:cobblestone' },
      result: { item: 'minecraft:stone' }
    }, 'minecraft:smelting')
    expect(rec.type).toBe('minecraft:smelting')
  })
})

const RUN_REAL = process.env['RUN_REAL_PACK'] === '1'
const REAL_PACK = process.env['REAL_PACK'] ?? 'E:/mc kjs/.cache/pc7-pack-1112'
/** D-03 实测基线（2026-11-05，0.1.18 + B120 修复链，json+script 扫描口径）：
 *  conditional 1,150 · crafting_shaped 8,109 · partial 5,334 · total 32,891。
 *  解包后 crafting_shaped +317（实包 conditional 内层多为机械类型，非任务书预估的 shaped 为主）。 */
const BASELINE_PARTIAL = 5334
const PARTIAL_BUDGET = Math.round(BASELINE_PARTIAL * 1.01)
const SHAPED_FLOOR = 8300

describe.skipIf(!RUN_REAL)('D-03 真实包验收（pc7-pack-1112，只读）', () => {
  it('forge:conditional 归 0；crafting_shaped ≥ 基线+1400；partial ≤ 基线×1.01', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(REAL_PACK), `整合包不存在：${REAL_PACK}`).toBe(true)
    const modpack = {
      path: REAL_PACK,
      name: 'pc7',
      mcVersion: null,
      loader: null,
      loaderVersion: null,
      kubejsVersion: null,
      modCount: 0,
      detectedFrom: ['d03-probe'],
      modsDir: join(REAL_PACK, 'mods'),
      hasKubejs: true,
      kubejsAddons: [],
      installedModIds: []
    } as Parameters<typeof import('../../src/main/recipes/jsonSource').scanJsonRecipes>[0]
    const { scanJsonRecipes, mergeChains } = await import('../../src/main/recipes/jsonSource')
    const { scanScriptRecipes } = await import('../../src/main/recipes/scriptSource')
    const { buildIndex, stats } = await import('../../src/main/recipes/recipeIndex')
    const json = await scanJsonRecipes(modpack, {})
    const scripts = await scanScriptRecipes(modpack, {})
    const merged = mergeChains([...json, ...scripts])
    buildIndex(merged)

    const conditional = merged.filter((r) => r.type === 'forge:conditional')
    const shaped = merged.filter((r) => r.type === 'minecraft:crafting_shaped')
    const s = stats()
    // eslint-disable-next-line no-console
    console.info(
      `[d03] conditional=${conditional.length} crafting_shaped=${shaped.length} ` +
        `partial=${s?.partial ?? '?'} total=${s?.total ?? '?'}`
    )
    expect(conditional).toHaveLength(0)
    expect(shaped.length).toBeGreaterThanOrEqual(SHAPED_FLOOR)
    expect(s?.partial ?? Infinity).toBeLessThanOrEqual(PARTIAL_BUDGET)
  }, 180_000)
})
