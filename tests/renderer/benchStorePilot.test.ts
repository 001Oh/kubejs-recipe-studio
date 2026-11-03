import { beforeEach, describe, expect, it } from 'vitest'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import type { RecipeRecord, SlotValue } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'
import { useBenchStore } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'
import { writeAt } from '@renderer/views/bench/commitOps'
import { samples } from '../schema/fixtures'

const PILOT_SCHEMA: NormalizedSchema = {
  id: 'minecraft:crafting_shaped',
  layoutKind: 'shaped',
  slots: [],
  outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
  revision: 1,
  preserveUnknown: true
}

function record(uid = 'test:shaped'): RecipeRecord {
  return {
    uid,
    recipeId: 'minecraft:pilot',
    type: 'minecraft:crafting_shaped',
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: 'pilot.json',
    partial: false
  }
}

function openedFor(raw: Record<string, unknown>, uid = 'test:shaped'): OpenedRecipe {
  const rawText = JSON.stringify(raw)
  const { normalized, diagnostics } = normalizeRecipe({
    raw,
    rawText,
    schema: PILOT_SCHEMA,
    uid,
    source: { source: 'jar', sourcePath: 'pilot.json' }
  })
  return {
    record: record(uid),
    schema: PILOT_SCHEMA,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText },
    normalized,
    diagnostics,
    notes: []
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

const BASE_RAW = samples.shaped.json as Record<string, unknown>

/** 同 uid、同 pattern/key，但 result/conditions 变了 → rawHash 必不同 */
function changedRaw(index: number): Record<string, unknown> {
  const raw = clone(BASE_RAW)
  raw['result'] = { item: `minecraft:result_${index}` }
  raw['conditions'] = [{ type: 'forge:mod_loaded', modid: `mod_${index}` }]
  return raw
}

function store() {
  return useBenchStore.getState()
}

const NEW_CELL: SlotValue = { kind: 'item', id: 'minecraft:netherite_ingot', count: 1 }

beforeEach(() => {
  useBenchStore.getState().reset()
  useBenchStore.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null })
  // toast 的 setTimeout 不应影响测试进程
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [] })
})

describe('旧路径保持（白名单关闭 / 非试点类型）', () => {
  it('loadFromRecipe 行为不变：无草稿、无冲突、按输入顺序填格', () => {
    const legacy: RecipeRecord = {
      ...record('legacy:1'),
      outputs: [{ id: 'minecraft:torch', count: 4, kind: 'item' }],
      inputs: [
        { id: 'minecraft:stick', count: 1, kind: 'item' },
        { id: 'minecraft:coal', count: 1, kind: 'item' }
      ]
    }
    store().loadFromRecipe(legacy, 'shaped', legacy.type)
    const s = store()
    const grid = s.bench.values['grid'] as SlotValue[]
    expect(grid[0]).toMatchObject({ id: 'minecraft:stick', count: 1 })
    expect(grid[1]).toMatchObject({ id: 'minecraft:coal', count: 1 })
    expect(s.bench.values['outputs']).toEqual([{ kind: 'item', id: 'minecraft:torch', count: 4 }])
    expect(s.draft).toBeNull()
    expect(s.draftConflict).toBeNull()
    expect(s.getDraftPreview()).toBeNull()
  })

  it('已打开试点草稿后再走旧入口：草稿被清空，不混用两套状态', () => {
    expect(store().loadOpenedRecipe(openedFor(BASE_RAW)).ok).toBe(true)
    store().loadFromRecipe(record('legacy:2'), 'shaped', 'minecraft:crafting_shaped')
    const s = store()
    expect(s.draft).toBeNull()
    expect(s.draftConflict).toBeNull()
    expect(s.getDraftPreview()).toBeNull()
  })
})

describe('A/B. 草稿建立与未建模字段', () => {
  it('loadOpenedRecipe：草稿干净（dirtyFields 为空），预览直接回原文', () => {
    const opened = openedFor(BASE_RAW)
    const res = store().loadOpenedRecipe(opened)
    expect(res.ok).toBe(true)
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual([])
    expect(s.draft?.passThrough.map((u) => u.path)).toContain('$.conditions')
    expect(s.loadedFrom).toBe('test:shaped')
    const preview = s.getDraftPreview()
    expect(preview?.kind).toBe('text')
    expect(preview?.text).toBe(opened.raw?.rawText)
  })

  it('原始不可读的打开结果不进入草稿，明确报错原因', () => {
    const bad: OpenedRecipe = { ...openedFor(BASE_RAW), status: 'raw-missing', raw: null, normalized: null }
    const res = store().loadOpenedRecipe(bad)
    expect(res).toEqual({ ok: false, reason: 'raw-missing' })
    expect(store().draft).toBeNull()
    expect(store().getDraftPreview()).toBeNull()
  })

  it('真实编辑才记 dirty；单格编辑只影响该格，未建模字段仍在 passThrough', () => {
    expect(store().loadOpenedRecipe(openedFor(BASE_RAW)).ok).toBe(true)
    store().setGridCell(4, { ...NEW_CELL })
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual(['grid'])
    const preview = s.getDraftPreview()
    expect(preview?.kind).toBe('json')
    expect(preview?.json?.['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    expect(preview?.unknownCount).toBe(s.draft?.passThrough.length)
  })

  it('控件批量写入（record=false，不重复记撤销）也必须记脏', () => {
    expect(store().loadOpenedRecipe(openedFor(BASE_RAW)).ok).toBe(true)
    const cells = [...(store().bench.values['grid'] as SlotValue[])]
    cells[4] = { ...NEW_CELL }
    // 与 commitOps → setValue(key, value, false) 的真实路径一致
    store().setValue('grid', cells, false)
    expect(store().draft?.meta.dirtyFields).toContain('grid')
    expect(store().getDraftPreview()?.kind).toBe('json')
  })

  it('选择器写入（writeAt → commitOps）更新格子并记脏', () => {
    expect(store().loadOpenedRecipe(openedFor(BASE_RAW)).ok).toBe(true)
    const before = store().bench.values['grid']
    writeAt('grid:4', { kind: 'item', id: 'minecraft:emerald', count: 1 })
    const s = store()
    expect((s.bench.values['grid'] as SlotValue[])[4]).toMatchObject({ id: 'minecraft:emerald', count: 1 })
    // 不可变写入：旧数组不被原地改动（否则 undo / dirty 判断都会失真）
    expect((before as SlotValue[])[4]).toMatchObject({ id: 'mekanism:module_base' })
    expect(s.draft?.meta.dirtyFields).toEqual(['grid'])
    expect(s.getDraftPreview()?.kind).toBe('json')
  })

  it('编辑产物：UI 的 outputs 键映射为规范化槽位 result，网格不受影响', () => {
    expect(store().loadOpenedRecipe(openedFor(BASE_RAW)).ok).toBe(true)
    writeAt('list:outputs:0', { kind: 'item', id: 'minecraft:diamond', count: 2 })
    const s = store()
    expect(s.draft?.meta.dirtyFields).toEqual(['result'])
    const preview = s.getDraftPreview()
    expect(preview?.kind).toBe('json')
    expect(preview?.json?.['result']).toEqual({ item: 'minecraft:diamond', count: 2 })
    expect(preview?.json?.['pattern']).toEqual(['I#I', 'IAI', 'PPP'])
    expect(preview?.json?.['conditions']).toEqual(BASE_RAW['conditions'])
  })
})

describe('C. 取消：只丢草稿，原始数据不动', () => {
  it('取消后关闭草稿，重新打开得到原始预览', () => {
    const opened = openedFor(BASE_RAW)
    const before = JSON.stringify(opened.raw?.json)
    expect(store().loadOpenedRecipe(opened).ok).toBe(true)
    store().setGridCell(4, { ...NEW_CELL })
    expect(store().getDraftPreview()?.kind).toBe('json')

    store().cancelDraft()
    let s = store()
    expect(s.draft).toBeNull()
    expect(s.draftConflict).toBeNull()
    expect(s.getDraftPreview()).toBeNull()
    expect((s.bench.values['grid'] as Array<SlotValue | null>).every((c) => c === null)).toBe(true)
    expect(JSON.stringify(opened.raw?.json)).toBe(before)

    expect(store().loadOpenedRecipe(opened).ok).toBe(true)
    s = store()
    expect(s.draft?.meta.dirtyFields).toEqual([])
    expect(s.getDraftPreview()?.text).toBe(opened.raw?.rawText)
  })
})

describe('D. 冲突：默认不覆盖，显式处理才能换基线', () => {
  it('同 uid + 原始变化：挂起冲突，预览暂停，用户修改保留', () => {
    const o1 = openedFor(BASE_RAW)
    expect(store().loadOpenedRecipe(o1).ok).toBe(true)
    store().setGridCell(4, { ...NEW_CELL })

    const o2 = openedFor(changedRaw(2))
    expect(o2.normalized?.rawHash).not.toBe(o1.normalized?.rawHash)
    const res = store().loadOpenedRecipe(o2)
    expect(res).toEqual({ ok: false, conflict: true, reason: 'raw-changed' })

    const s = store()
    expect(s.draftConflict).toBe(o2)
    expect(s.draft?.meta.base?.rawHash).toBe(o1.normalized?.rawHash)
    expect(s.getDraftPreview()).toBeNull()
    expect((s.bench.values['grid'] as SlotValue[])[4]).toMatchObject({ id: 'minecraft:netherite_ingot' })
  })

  it('保留我的修改：基线换成新原始，用户编辑仍在，冲突解除', () => {
    const o1 = openedFor(BASE_RAW)
    const o2 = openedFor(changedRaw(2))
    store().loadOpenedRecipe(o1)
    store().setGridCell(4, { ...NEW_CELL })
    store().loadOpenedRecipe(o2)
    store().resolveConflictKeepMine()

    const s = store()
    expect(s.draftConflict).toBeNull()
    expect(s.draft?.meta.base?.rawHash).toBe(o2.normalized?.rawHash)
    expect(s.draft?.meta.dirtyFields).toContain('grid')
    expect((s.bench.values['grid'] as SlotValue[])[4]).toMatchObject({ id: 'minecraft:netherite_ingot' })
    const preview = s.getDraftPreview()
    expect(preview?.kind).toBe('json')
    // 未编辑字段以新基线为准
    expect(preview?.json?.['result']).toEqual({ item: 'minecraft:result_2' })
    expect(preview?.json?.['conditions']).toEqual([{ type: 'forge:mod_loaded', modid: 'mod_2' }])
  })

  it('保留我的之后再次变化：仍然检测冲突（没有跳过检测）', () => {
    const o1 = openedFor(BASE_RAW)
    const o2 = openedFor(changedRaw(2))
    const o3 = openedFor(changedRaw(3))
    store().loadOpenedRecipe(o1)
    store().setGridCell(4, { ...NEW_CELL })
    store().loadOpenedRecipe(o2)
    store().resolveConflictKeepMine()

    const res = store().loadOpenedRecipe(o3)
    expect(res).toEqual({ ok: false, conflict: true, reason: 'raw-changed' })
    expect(store().draft?.meta.base?.rawHash).toBe(o2.normalized?.rawHash)
    expect(store().draftConflict).toBe(o3)
  })

  it('重新载入：丢弃我的修改，以新原文建立新基线', () => {
    const o1 = openedFor(BASE_RAW)
    const o2 = openedFor(changedRaw(2))
    store().loadOpenedRecipe(o1)
    store().setGridCell(4, { ...NEW_CELL })
    store().loadOpenedRecipe(o2)
    store().resolveConflictReload()

    const s = store()
    expect(s.draftConflict).toBeNull()
    expect(s.draft?.meta.base?.rawHash).toBe(o2.normalized?.rawHash)
    expect(s.draft?.meta.dirtyFields).toEqual([])
    expect((s.bench.values['grid'] as SlotValue[])[4]).toMatchObject({ id: 'mekanism:module_base' })
    expect(s.getDraftPreview()?.text).toBe(o2.raw?.rawText)
  })

  it('另存副本：脱离基线、不覆盖原配方，仍可预览', () => {
    const o1 = openedFor(BASE_RAW)
    const o2 = openedFor(changedRaw(2))
    store().loadOpenedRecipe(o1)
    store().setGridCell(4, { ...NEW_CELL })
    store().loadOpenedRecipe(o2)
    store().resolveConflictSaveCopy()

    const s = store()
    expect(s.draftConflict).toBeNull()
    expect(s.draft?.uid.startsWith('copy:')).toBe(true)
    expect(s.draft?.meta.base).toBeNull()
    expect(s.getDraftPreview()?.kind).toBe('json')
    expect((s.bench.values['grid'] as SlotValue[])[4]).toMatchObject({ id: 'minecraft:netherite_ingot' })
  })
})
