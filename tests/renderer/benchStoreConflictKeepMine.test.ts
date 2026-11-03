/**
 * P2-4：resolveConflictKeepMine 换基线时 schema 可能一并被换（外部改动改变了槽位结构）。
 * dirtyFields 必须按新 normalized 槽位重算：保留仍能映射的键、丢弃失效键并提示。
 * 修复前：旧 dirtyFields 原样保留 + 基线换新 → 提交畅通但内容与 UI 意图静默偏离。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import type { RecipeRecord, SlotValue } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'
import { GRID_KEY, useBenchStore } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'

const SHAPED_SCHEMA: NormalizedSchema = {
  id: 'minecraft:crafting_shaped',
  layoutKind: 'shaped',
  slots: [],
  outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
  revision: 1,
  preserveUnknown: true
}

const CUSTOM_NO_GRID_SCHEMA: NormalizedSchema = {
  id: 'minecraft:crafting_shaped',
  layoutKind: 'custom',
  revision: 2,
  preserveUnknown: true,
  slots: [],
  outputs: []
}

function record(uid: string): RecipeRecord {
  return { uid, recipeId: 'minecraft:x', type: 'minecraft:crafting_shaped', outputs: [], inputs: [], source: 'jar', sourcePath: 'p.json', partial: false }
}

function openedFor(raw: Record<string, unknown>, uid: string, schema: NormalizedSchema): OpenedRecipe {
  const rawText = JSON.stringify(raw)
  const { normalized, diagnostics } = normalizeRecipe({ raw, rawText, schema, uid, source: { source: 'jar', sourcePath: 'p.json' } })
  return {
    record: record(uid),
    schema,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText },
    normalized,
    diagnostics,
    notes: []
  }
}

const RAW = {
  type: 'minecraft:crafting_shaped',
  pattern: ['XX ', 'XX ', '   '],
  key: { X: { item: 'minecraft:stone' } },
  result: { item: 'minecraft:bricks', count: 4 }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function changedRaw(): Record<string, unknown> {
  const raw = clone(RAW)
  raw['result'] = { item: 'minecraft:golden_block', count: 2 }
  return raw
}

beforeEach(() => {
  useBenchStore.getState().reset()
  useBenchStore.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null })
  useAppStore.setState({ toast: vi.fn(), pushLog: () => {}, toasts: [] })
})

function cell(id: string): SlotValue {
  return { kind: 'item', id, count: 1 }
}

describe('P2-4 keepMine 换 schema 后重算 dirtyFields', () => {
  it('结构变更后：失效键被丢弃、仍有效键保留、UI 提示失效明细（修复前 dirtyFields 原样保留 → 红）', () => {
    const store = useBenchStore.getState()
    expect(store.loadOpenedRecipe(openedFor(clone(RAW), 'test:b', SHAPED_SCHEMA)).ok).toBe(true)
    store.setGridCell(0, cell('minecraft:diamond'))
    expect(useBenchStore.getState().draft?.meta.dirtyFields).toEqual(['grid'])

    // 外部改动：同 uid、raw 变化、schema 换成无 grid 槽的 custom（结构变更）
    useBenchStore.setState({ draftConflict: openedFor(changedRaw(), 'test:b', CUSTOM_NO_GRID_SCHEMA) })
    useBenchStore.getState().resolveConflictKeepMine()

    const draft = useBenchStore.getState().draft
    expect(draft).not.toBeNull()
    // 修复后：'grid' 不在新 normalized 槽位里，必须被丢弃
    expect(draft?.meta.dirtyFields).toEqual([])
    // UI 必须明确提示哪些修改失效
    const toast = useAppStore.getState().toast as ReturnType<typeof vi.fn>
    const texts = toast.mock.calls.map((c) => String(c[0]))
    expect(texts.some((t) => t.includes('失效') && t.includes('grid'))).toBe(true)
  })

  it('结构未变时：全部脏键保留，行为与修复前一致（防误伤守卫）', () => {
    const store = useBenchStore.getState()
    expect(store.loadOpenedRecipe(openedFor(clone(RAW), 'test:b', SHAPED_SCHEMA)).ok).toBe(true)
    store.setGridCell(0, cell('minecraft:diamond'))
    useBenchStore.getState().setValue('result', [cell('minecraft:gold_block')], false)
    const dirtyBefore = clone(useBenchStore.getState().draft?.meta.dirtyFields ?? [])

    // 同 schema 的外部改动（只有 result 值变了）
    useBenchStore.setState({ draftConflict: openedFor(changedRaw(), 'test:b', SHAPED_SCHEMA) })
    useBenchStore.getState().resolveConflictKeepMine()

    expect(useBenchStore.getState().draft?.meta.dirtyFields).toEqual(dirtyBefore)
    expect(useBenchStore.getState().draft?.meta.dirtyFields).toContain(GRID_KEY)
  })
})
