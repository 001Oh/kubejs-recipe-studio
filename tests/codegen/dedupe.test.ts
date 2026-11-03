/**
 * 会话内结构重复 + AE2 压印器翻转等价 + 目标检查（规格 3.7 去重提示 / 3.6.17 坑 1 / 3.6.5 ②③）。
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RecipeRecord } from '../../src/shared/types'
import { buildIndex, clearIndex } from '../../src/main/recipes/recipeIndex'
import {
  checkTarget,
  clearSession,
  findDuplicate,
  generatedRecipeId,
  recipeIdBase,
  recipeIdConflicts,
  rememberGeneration,
  sessionGenerations
} from '../../src/main/codegen/dedupe'
import { defaultScriptFileName } from '../../src/main/codegen/writer'
import { sv, workbench } from './helpers'

function bench(items: string[], output: string) {
  return workbench({
    typeId: 'create:mixing',
    layoutKind: 'multi_io',
    values: { result: sv('item', output), ingredients: items.map((id) => sv('item', id)) }
  })
}

function inscriber(top: string, middle: string, bottom?: string) {
  return workbench({
    typeId: 'ae2:inscriber',
    layoutKind: 'custom',
    values: {
      ingredients: { top: sv('item', top), middle: sv('item', middle), ...(bottom ? { bottom: sv('item', bottom) } : {}) },
      result: sv('item', 'ae2:calculation_processor_print')
    }
  })
}

beforeEach(() => clearSession())
afterEach(() => clearSession())

describe('会话内结构重复', () => {
  it('同结构第二次生成被判定重复并给出来源标识', () => {
    const first = bench(['minecraft:iron_ingot'], 'minecraft:steel_ingot')
    rememberGeneration(first, 'recipe_studio_20261030_214000.js')
    expect(findDuplicate(bench(['minecraft:iron_ingot'], 'minecraft:steel_ingot'))).toEqual({
      label: 'recipe_studio_20261030_214000.js',
      flipped: false
    })
    expect(findDuplicate(bench(['minecraft:copper_ingot'], 'minecraft:steel_ingot'))).toBeNull()
  })

  it('无序材料顺序不同仍算同一配方', () => {
    rememberGeneration(bench(['minecraft:dirt', 'minecraft:sand'], 'minecraft:gravel'), 'a.js')
    expect(findDuplicate(bench(['minecraft:sand', 'minecraft:dirt'], 'minecraft:gravel'))?.label).toBe('a.js')
  })

  it('数量与概率参与签名：1x 与 2x、0.2 与 0.3 是不同配方', () => {
    rememberGeneration(bench(['minecraft:iron_ingot'], 'minecraft:steel_ingot'), 'a.js')
    const more = workbench({
      typeId: 'create:mixing',
      layoutKind: 'multi_io',
      values: {
        result: sv('item', 'minecraft:steel_ingot'),
        ingredients: [sv('item', 'minecraft:iron_ingot', { count: 2 })]
      }
    })
    expect(findDuplicate(more)).toBeNull()
  })

  it('同一生成重复登记不产生两条记录', () => {
    const b = bench(['minecraft:iron_ingot'], 'minecraft:steel_ingot')
    rememberGeneration(b, 'a.js')
    rememberGeneration(b, 'a.js')
    expect(sessionGenerations()).toHaveLength(1)
  })
})

describe('AE2 压印器翻转等价', () => {
  it('top/bottom 互换视为同一配方，并标 flipped', () => {
    rememberGeneration(inscriber('ae2:press_calc', 'ae2:certus_quartz_crystal', 'ae2:press_logic'), 'inscriber_a.js')
    const hit = findDuplicate(inscriber('ae2:press_logic', 'ae2:certus_quartz_crystal', 'ae2:press_calc'))
    expect(hit?.label).toBe('inscriber_a.js')
    expect(hit?.flipped).toBe(true)
  })

  it('middle 不参与翻转：middle 改了就不是重复', () => {
    rememberGeneration(inscriber('ae2:press_calc', 'ae2:certus_quartz_crystal', 'ae2:press_logic'), 'inscriber_a.js')
    expect(findDuplicate(inscriber('ae2:press_logic', 'ae2:silicon_crystal', 'ae2:press_calc'))).toBeNull()
  })
})

describe('配方 ID 占用与目标检查', () => {
  const record = (over: Partial<RecipeRecord>): RecipeRecord => ({
    uid: `jar:${over.recipeId ?? 'x'}`,
    recipeId: 'recipe_studio:mixing_steel_ingot',
    type: 'create:mixing',
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: 'create-1.20.1.jar#data/create/recipes/mixing_steel_ingot.json',
    partial: false,
    ...over
  })

  it('同 ID 多来源 → 完整定义链 + 当前生效来源（KubeJS > 数据包 > jar）', () => {
    const conflicts = recipeIdConflicts('recipe_studio:mixing_steel_ingot', [
      record({ source: 'jar', sourcePath: 'create.jar#data/create/recipes/mixing_steel_ingot.json', definedBy: ['thermal.jar#data/thermal/recipes/mixing_steel_ingot.json'] }),
      record({ uid: 'dp:1', source: 'datapack', sourcePath: 'datapack/mypack/data/recipe_studio/recipes/mixing_steel_ingot.json' }),
      record({ uid: 'kjs:1', source: 'kubejs', sourcePath: 'kubejs/data/mypack/recipes/mixing_steel_ingot.json' })
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.effective).toBe('kubejs/data/mypack/recipes/mixing_steel_ingot.json')
    expect(conflicts[0]?.definedBy.length).toBeGreaterThanOrEqual(4)
  })

  it('序号不同视为同一产物家族，仍然报冲突', () => {
    expect(recipeIdBase('recipe_studio:mixing_gravel_2')).toBe('recipe_studio:mixing_gravel')
    const conflicts = recipeIdConflicts('recipe_studio:mixing_gravel_3', [record({ recipeId: 'recipe_studio:mixing_gravel_1' })])
    expect(conflicts[0]?.recipeId).toBe('recipe_studio:mixing_gravel_3')
  })

  it('未被占用时返回空数组', () => {
    expect(recipeIdConflicts('recipe_studio:brand_new_thing', [record({ recipeId: 'other:id' })])).toEqual([])
  })

  it('配方 ID 由工作台显式值优先，其次 namespace + 文件名', () => {
    const bench = workbench({ typeId: 'create:mixing', values: { recipeId: 'mypack:custom_name' } })
    expect(generatedRecipeId(bench, 'recipe_studio', 'whatever.json', 'create:mixing')).toBe('mypack:custom_name')
    expect(generatedRecipeId(workbench({ typeId: 'create:mixing', values: {} }), 'recipe_studio', 'mixing_gravel_1.json', 'create:mixing')).toBe(
      'recipe_studio:mixing_gravel_1'
    )
  })

  let root = ''
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kjs-dedupe-'))
    await mkdir(join(root, 'kubejs', 'server_scripts'), { recursive: true })
  })
  afterEach(async () => {
    clearIndex()
    await rm(root, { recursive: true, force: true })
  })

  it('checkTarget：同名文件存在 + namespace 被占用 + 索引里的 ID 冲突一起报', async () => {
    const fileName = defaultScriptFileName(Date.now())
    await writeFile(join(root, 'kubejs', 'server_scripts', fileName), '// 已存在\n', 'utf8')
    buildIndex([record({ recipeId: 'recipe_studio:mixing_steel_ingot_1' })])
    const check = await checkTarget(
      'recipe_studio:mixing_steel_ingot_1',
      fileName,
      'recipe_studio',
      { modpack: () => ({ path: root, name: 'tmp', mcVersion: null, loader: null, loaderVersion: null, kubejsVersion: null, modCount: 0, detectedFrom: [], modsDir: join(root, 'mods'), hasKubejs: false, kubejsAddons: [], installedModIds: [] }), semantic: {} },
      async (ns) => ns === 'recipe_studio'
    )
    expect(check.fileExists).toBe(true)
    expect(check.datapackNamespaceUsed).toBe(true)
    expect(check.recipeIdConflicts).toHaveLength(1)
    expect(existsSync(join(root, 'kubejs', 'server_scripts', fileName))).toBe(true)
  })

  it('探针缺省时用上下文的 namespace 集合', async () => {
    const check = await checkTarget('some:id', 'nope.js', 'recipe_studio', { usedNamespaces: () => new Set(['recipe_studio']), semantic: {} })
    expect(check.fileExists).toBe(false)
    expect(check.datapackNamespaceUsed).toBe(true)
  })
})
