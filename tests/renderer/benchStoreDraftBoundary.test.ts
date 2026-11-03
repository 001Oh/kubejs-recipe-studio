/**
 * P2-3：撤销栈跨草稿边界。草稿路径（loadOpenedRecipe / cancelDraft，以及 BenchView 的
 * startBlankDraft）是会话边界——清空 past/future，对齐 loadFromRecipe（T-26/UI-U5）的既有模式。
 * 修复前：undo 会把 bench 拉回上一个配方的值而 draft 仍是新草稿（A 配方格子写进 B 配方文件）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import type { RecipeRecord, SlotValue } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'
import { GRID_KEY, useBenchStore } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'

const PILOT_SCHEMA: NormalizedSchema = {
  id: 'minecraft:crafting_shaped',
  layoutKind: 'shaped',
  slots: [],
  outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
  revision: 1,
  preserveUnknown: true
}

function record(uid: string): RecipeRecord {
  return { uid, recipeId: 'minecraft:x', type: 'minecraft:crafting_shaped', outputs: [], inputs: [], source: 'jar', sourcePath: 'p.json', partial: false }
}

function openedFor(raw: Record<string, unknown>, uid: string): OpenedRecipe {
  const rawText = JSON.stringify(raw)
  const { normalized, diagnostics } = normalizeRecipe({ raw, rawText, schema: PILOT_SCHEMA, uid, source: { source: 'jar', sourcePath: 'p.json' } })
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

const RAW_A = {
  type: 'minecraft:crafting_shaped',
  pattern: ['XX ', 'XX ', '   '],
  key: { X: { item: 'minecraft:stone' } },
  result: { item: 'minecraft:bricks', count: 4 }
}
function rawB(): Record<string, unknown> {
  return {
    ...JSON.parse(JSON.stringify(RAW_A)) as Record<string, unknown>,
    key: { X: { item: 'minecraft:iron_ingot' } },
    result: { item: 'minecraft:iron_block', count: 1 }
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

const CELL: SlotValue = { kind: 'item', id: 'minecraft:diamond', count: 1 }

beforeEach(() => {
  useBenchStore.getState().reset()
  useBenchStore.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [] })
})

describe('P2-3 撤销栈不跨草稿边界', () => {
  it('打开草稿 B 后 undo 不得回到配方 A 的格子', () => {
    const store = useBenchStore.getState()
    expect(store.loadOpenedRecipe(openedFor(clone(RAW_A), 'test:a')).ok).toBe(true)
    store.setGridCell(0, CELL)
    const gridAEdited = clone(useBenchStore.getState().bench.values[GRID_KEY])

    expect(useBenchStore.getState().loadOpenedRecipe(openedFor(rawB(), 'test:b')).ok).toBe(true)
    const gridB = clone(useBenchStore.getState().bench.values[GRID_KEY])
    expect(gridB).not.toEqual(gridAEdited)

    // 草稿边界之后撤销不得跨配方：undo 应无栈可退（或至少不得出现 A 的格子）
    const undone = useBenchStore.getState().undo()
    expect(undone).toBe(false)
    expect(useBenchStore.getState().bench.values[GRID_KEY]).toEqual(gridB)
  })

  it('cancelDraft 后 undo 不得复活已取消草稿的格子', () => {
    const store = useBenchStore.getState()
    expect(store.loadOpenedRecipe(openedFor(rawB(), 'test:b')).ok).toBe(true)
    store.setGridCell(0, { kind: 'item', id: 'minecraft:gold_ingot', count: 2 })
    store.cancelDraft()
    expect(useBenchStore.getState().draft).toBeNull()

    expect(useBenchStore.getState().undo()).toBe(false)
    expect(useBenchStore.getState().bench.values[GRID_KEY]).toEqual(new Array(9).fill(null))
  })

  it('打开草稿 B 后 redo 栈同样不得带回 A 的历史', () => {
    const store = useBenchStore.getState()
    expect(store.loadOpenedRecipe(openedFor(clone(RAW_A), 'test:a')).ok).toBe(true)
    store.setGridCell(0, CELL)
    useBenchStore.getState().undo()
    // A 内部 undo 留下了 future；切到草稿 B 后 future 必须被清空
    expect(useBenchStore.getState().loadOpenedRecipe(openedFor(rawB(), 'test:b')).ok).toBe(true)
    expect(useBenchStore.getState().redo()).toBe(false)
  })
})
