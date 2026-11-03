import { beforeEach, describe, expect, it } from 'vitest'
import type { RecipeRecord, SlotValue } from '@shared/types'
import { useBenchStore } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'
import { writeAt } from '@renderer/views/bench/commitOps'
import { pc2Opened, pc2samples } from '../schema/pc2Fixtures'

function store() {
  return useBenchStore.getState()
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

beforeEach(() => {
  useBenchStore.getState().reset()
  useBenchStore.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [] })
})

describe('P-C2 shapeless 工作台', () => {
  it('打开为草稿（干净），列表顺序/标签/数量就位', () => {
    expect(store().loadOpenedRecipe(pc2Opened('shapelessBrass')).ok).toBe(true)
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual([])
    expect(s.draft?.passThrough.map((u) => u.path)).toContain('$.category')
    const ingredients = s.bench.values['ingredients'] as SlotValue[]
    expect(ingredients).toHaveLength(4)
    expect(ingredients[3]).toMatchObject({ kind: 'tag', id: 'forge:dusts/zinc' })
    expect(s.getDraftPreview()?.text).toBe(JSON.stringify(pc2samples.shapelessBrass.json))
  })

  it('选择器替换一个材料：dirty=ingredients，顺序/标签/产物/category 保持', () => {
    expect(store().loadOpenedRecipe(pc2Opened('shapelessBrass')).ok).toBe(true)
    writeAt('list:ingredients:1', { kind: 'item', id: 'minecraft:emerald', count: 1 })
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual(['ingredients'])
    expect((s.bench.values['ingredients'] as SlotValue[])[1]).toMatchObject({ id: 'minecraft:emerald' })
    const json = s.getDraftPreview()?.json as { ingredients: unknown[]; result: unknown; category: unknown }
    expect(json.ingredients).toEqual([
      { item: 'alltheores:copper_dust' },
      { item: 'minecraft:emerald', count: 1 },
      { item: 'alltheores:copper_dust' },
      { tag: 'forge:dusts/zinc' }
    ])
    expect(json.result).toEqual({ count: 4, item: 'alltheores:brass_dust' })
    expect(json.category).toBe('misc')
  })

  it('追加材料走 append 地址：只追加，不重写已有条目', () => {
    expect(store().loadOpenedRecipe(pc2Opened('shapelessBrass')).ok).toBe(true)
    writeAt('append:ingredients', { kind: 'item', id: 'minecraft:diamond', count: 1 })
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual(['ingredients'])
    expect((s.bench.values['ingredients'] as SlotValue[])).toHaveLength(5)
    const json = s.getDraftPreview()?.json as { ingredients: unknown[] }
    expect(json.ingredients.slice(0, 4)).toEqual(pc2samples.shapelessBrass.json.ingredients)
    expect(json.ingredients[4]).toEqual({ item: 'minecraft:diamond', count: 1 })
  })

  it('改产物数量：dirty=result，输入与 category 不动', () => {
    expect(store().loadOpenedRecipe(pc2Opened('shapelessBrass')).ok).toBe(true)
    const result = clone(store().bench.values['result'] as SlotValue[])
    result[0] = { ...result[0]!, count: 8 }
    store().setValue('result', result)
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual(['result'])
    expect(s.getDraftPreview()?.json?.['result']).toEqual({ item: 'alltheores:brass_dust', count: 8 })
    expect(s.getDraftPreview()?.json?.['ingredients']).toEqual(pc2samples.shapelessBrass.json.ingredients)
    expect(s.getDraftPreview()?.json?.['category']).toBe('misc')
  })

  it('取消后草稿消失，重开仍是原始预览', () => {
    const opened = pc2Opened('shapelessBrass')
    const before = JSON.stringify(opened.raw?.json)
    expect(store().loadOpenedRecipe(opened).ok).toBe(true)
    writeAt('list:ingredients:0', { kind: 'item', id: 'minecraft:emerald', count: 1 })
    store().cancelDraft()
    expect(store().draft).toBeNull()
    expect(store().getDraftPreview()).toBeNull()
    expect(JSON.stringify(opened.raw?.json)).toBe(before)
    expect(store().loadOpenedRecipe(opened).ok).toBe(true)
    expect(store().getDraftPreview()?.text).toBe(JSON.stringify(pc2samples.shapelessBrass.json))
  })
})

describe('P-C2 create:mixing 工作台', () => {
  it('fluix：列表/流体 nbt 就位；替换产物数量后输入与 conditions 保持', () => {
    expect(store().loadOpenedRecipe(pc2Opened('mixingFluix')).ok).toBe(true)
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual([])
    expect(s.bench.values['ingredients'] as SlotValue[]).toHaveLength(4)
    const results = clone(s.bench.values['results'] as SlotValue[])
    results[0] = { ...results[0]!, count: 3 }
    s.setValue('results', results)
    const json = store().getDraftPreview()?.json
    expect(store().draft?.meta.dirtyFields).toEqual(['results'])
    expect(json?.['results']).toEqual([{ item: 'ae2:fluix_crystal', count: 3 }])
    expect(json?.['ingredients']).toEqual(pc2samples.mixingFluix.json.ingredients)
    expect(json?.['conditions']).toEqual(pc2samples.mixingFluix.json.conditions)
  })

  it('概率字符串：只改第二个产物概率，第一个产物的 "2"/"0.35" 仍为字符串', () => {
    expect(store().loadOpenedRecipe(pc2Opened('mixingChance')).ok).toBe(true)
    const results = clone(store().bench.values['results'] as SlotValue[])
    results[1] = { ...results[1]!, chance: 0.1 }
    store().setValue('results', results)
    const outputs = store().getDraftPreview()?.json?.['results'] as Array<Record<string, unknown>>
    expect(outputs[0]).toEqual({ item: 'minecraft:glowstone_dust', count: '2', chance: '0.35' })
    expect(outputs[1]).toEqual({ item: 'minecraft:gold_nugget', chance: 0.1 })
    expect(store().getDraftPreview()?.json?.['processingTime']).toBe(200)
  })

  it('tea：改流体产物 mB 保留 fluidTag 输入与 heatRequirement', () => {
    expect(store().loadOpenedRecipe(pc2Opened('mixingTea')).ok).toBe(true)
    const results = clone(store().bench.values['results'] as SlotValue[])
    results[0] = { ...results[0]!, amount: 750 }
    store().setValue('results', results)
    const json = store().getDraftPreview()?.json
    expect(json?.['results']).toEqual([{ fluid: 'create:tea', amount: 750 }])
    expect(json?.['ingredients']).toEqual(pc2samples.mixingTea.json.ingredients)
    expect(json?.['heatRequirement']).toBe('heated')
  })
})

describe('P-C2 旧路径（白名单关闭 / 非试点）', () => {
  it('loadFromRecipe 对新类型仍是旧 inputs/outputs 映射，且不产生草稿', () => {
    const legacy: RecipeRecord = {
      uid: 'legacy:shapeless',
      recipeId: 'legacy:shapeless',
      type: 'minecraft:crafting_shapeless',
      outputs: [{ id: 'minecraft:torch', count: 4, kind: 'item' }],
      inputs: [
        { id: 'minecraft:stick', count: 1, kind: 'item' },
        { id: 'forge:coal', count: 1, kind: 'tag' }
      ],
      source: 'jar',
      sourcePath: 'legacy.json',
      partial: false
    }
    store().loadFromRecipe(legacy, 'multi_io', legacy.type)
    const s = store()
    expect(s.draft).toBeNull()
    expect(s.getDraftPreview()).toBeNull()
    expect(s.bench.values['inputs']).toEqual([
      { kind: 'item', id: 'minecraft:stick', count: 1, amount: undefined },
      { kind: 'tag', id: 'forge:coal', count: 1, amount: undefined }
    ])
    expect(s.bench.values['outputs']).toEqual([
      { kind: 'item', id: 'minecraft:torch', count: 4, amount: undefined, chance: undefined }
    ])
  })
})

describe('T-26 / UI-U5 Ctrl+Z 语义', () => {
  const legacy = (id: string): RecipeRecord => ({
    uid: `legacy:${id}`,
    recipeId: `legacy:${id}`,
    type: 'minecraft:crafting_shapeless',
    outputs: [{ id: 'minecraft:torch', count: 4, kind: 'item' }],
    inputs: [{ id, count: 1, kind: 'item' }],
    source: 'jar',
    sourcePath: `${id}.json`,
    partial: false
  })

  it('三步撤销：改 A → 改 B → 撤销回 A → 再撤销回原', () => {
    store().loadFromRecipe(legacy('minecraft:a'), 'shapeless', 'minecraft:crafting_shapeless')
    useBenchStore.setState({ past: [], future: [] })
    const base = clone(store().bench)

    store().setListValue('ingredients', 0, { kind: 'item', id: 'minecraft:b', count: 1 })
    const afterA = clone(store().bench)
    store().setListValue('ingredients', 0, { kind: 'item', id: 'minecraft:c', count: 1 })

    expect(store().undo()).toBe(true)
    expect(store().bench).toEqual(afterA)
    expect(store().undo()).toBe(true)
    expect(store().bench).toEqual(base)
    // 栈底：再撤销不再变化
    expect(store().undo()).toBe(false)
    expect(store().bench).toEqual(base)
    // 重做回到 afterA
    expect(store().redo()).toBe(true)
    expect(store().bench).toEqual(afterA)
  })

  it('载入配方是会话边界：清空 undo/redo 栈', () => {
    store().setListValue('ingredients', 0, { kind: 'item', id: 'minecraft:x', count: 1 })
    expect(store().past.length).toBeGreaterThan(0)
    store().loadFromRecipe(legacy('minecraft:b'), 'shapeless', 'minecraft:crafting_shapeless')
    expect(store().past).toEqual([])
    expect(store().future).toEqual([])
    expect(store().undo()).toBe(false)
  })

  it('「清空」可撤销：reset 入栈，Ctrl+Z 能恢复清空前内容', () => {
    store().loadFromRecipe(legacy('minecraft:c'), 'shapeless', 'minecraft:crafting_shapeless')
    useBenchStore.setState({ past: [], future: [] })
    const before = clone(store().bench)
    store().reset()
    expect(store().bench.values['ingredients']).toBeUndefined()
    expect(store().undo()).toBe(true)
    expect(store().bench).toEqual(before)
  })
})
