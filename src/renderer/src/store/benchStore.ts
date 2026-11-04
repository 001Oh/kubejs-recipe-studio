/**
 * 工作台状态：通用字典 BenchValues，不按配方类型写死结构（规格 3.4）。
 * 撤销/重做只快照字典，与 schema 无关；历史上限 100 步。
 */
import { create } from 'zustand'
import type { BenchValues, LayoutKind, RecipeRecord, SlotValue, WorkbenchState } from '@shared/types'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedRecipe, NormalizedSchema, SchemaDiagnostic, UnknownField } from '@shared/schemaModel'
import type { RecipeDraftMeta } from '@shared/draftState'
import { checkDraftConflict, markFieldDirty } from '@shared/draftState'
import { HISTORY_MAX, GRID_DEFAULT_SIZE, BENCH_OUTPUTS_KEY } from '@shared/constants'
import { draftPreview, normalizedToDraft, type DraftPreview } from './draftBridge'
import { useAppStore } from './appStore'

export const GRID_KEY = 'grid'
export const INPUTS_KEY = 'inputs'
export const OUTPUTS_KEY = 'outputs'

/** P-C1 草稿：规范化模型 + 基线 + 未建模字段（只活在内存，不持久化） */
export interface PilotDraft {
  uid: string
  meta: RecipeDraftMeta
  passThrough: UnknownField[]
  normalized: NormalizedRecipe
  schema: NormalizedSchema
  diagnostics: SchemaDiagnostic[]
  unsafeReason?: string
  banners: { level: 'info' | 'warn'; text: string }[]
}

export interface BenchStore {
  bench: WorkbenchState
  past: WorkbenchState[]
  future: WorkbenchState[]
  /** 载入现有配方后的提示条来源 uid */
  loadedFrom: string | null
  /** 试点草稿；null = 当前走旧路径（白名单关闭或非试点类型） */
  draft: PilotDraft | null
  /** 原始数据变化且未处理时，挂起的新版本（默认不覆盖用户编辑） */
  draftConflict: OpenedRecipe | null
  /** P3-22a：提交撞 CONFLICT 后读取最新原始失败——置冲突处理横幅（重试读取/取消草稿），提交按钮不禁用 */
  conflictLoadFailed: boolean
  /** 提交进行中（防重复点击） */
  committing: boolean
  /** 最近一次成功保存（路径与时间，用于面板展示） */
  lastCommit: { path: string; uid: string; at: number } | null

  snapshot: () => void
  setTypeId: (typeId: string, layoutKind: LayoutKind, keys?: string[], rows?: number, cols?: number) => void
  setGridSize: (rows: number, cols: number) => void
  setValue: (key: string, value: BenchValues[string], record?: boolean) => void
  setGridCell: (index: number, value: SlotValue | null) => void
  setListValue: (key: string, index: number, value: SlotValue | null) => void
  appendListValue: (key: string, value: SlotValue) => void
  removeListValue: (key: string, index: number) => void
  setActiveSlot: (key: string | null) => void
  setModifier: (key: string, value: number | boolean | string) => void
  loadFromRecipe: (record: RecipeRecord, layoutKind: LayoutKind, typeId: string) => void
  /** 试点入口：用原始+规范化建立草稿；同 uid 且 hash 变化时挂起冲突，不覆盖 */
  loadOpenedRecipe: (opened: OpenedRecipe) => { ok: boolean; conflict?: boolean; reason?: string }
  /** 冲突处理①：以新原始为准（丢弃我的修改） */
  resolveConflictReload: () => void
  /** 冲突处理②：保留我的修改，基线换成新原始 */
  resolveConflictKeepMine: () => void
  /** 冲突处理③：另存为副本（脱离基线，后续不覆盖原配方） */
  resolveConflictSaveCopy: () => void
  /** 取消编辑：丢弃草稿，原始数据不动 */
  cancelDraft: () => void
  /** 当前草稿的预览（未编辑时优先原文）；冲突未解决或非草稿时返回 null */
  getDraftPreview: () => DraftPreview | null
  reset: () => void
  undo: () => boolean
  redo: () => boolean
}

function cloneBench(b: WorkbenchState): WorkbenchState {
  return JSON.parse(JSON.stringify(b)) as WorkbenchState
}

function emptyBench(): WorkbenchState {
  return {
    typeId: 'minecraft:crafting_shaped',
    layoutKind: 'shaped',
    values: { [GRID_KEY]: new Array(GRID_DEFAULT_SIZE * GRID_DEFAULT_SIZE).fill(null) },
    gridRows: GRID_DEFAULT_SIZE,
    gridCols: GRID_DEFAULT_SIZE,
    activeSlotKey: null,
    modifiers: {}
  }
}

/** 有试点草稿时，只有真正的用户编辑才会把字段记为脏 */
function touchDirty(get: () => BenchStore, set: (partial: Partial<BenchStore>) => void, key: string): void {
  const draft = get().draft
  if (!draft) return
  // UI 的产物列表统一叫 outputs；规范化槽位可能是 result/results，按草稿 schema 映射回真实字段
  const singleOutput = draft.schema.outputs.length === 1 ? draft.schema.outputs[0]?.key : undefined
  const field = key === BENCH_OUTPUTS_KEY && singleOutput ? singleOutput : key
  set({ draft: { ...draft, meta: markFieldDirty(draft.meta, field) } })
}

function asSlotArray(v: BenchValues[string] | undefined): (SlotValue | null)[] {
  return Array.isArray(v) ? (v as (SlotValue | null)[]) : []
}

function acceptsList(layout: LayoutKind): boolean {
  return layout === 'shapeless' || layout === 'multi_io' || layout === 'single_io' || layout === 'custom'
}

/**
 * 切换类型时的保留策略：同名 key → 近似 key（inputs↔ingredients 等）→ 丢弃并统计。
 * grid 只在目标仍是网格时带走，避免把 9 个格子塞进列表表单。
 */
function carryValues(
  prev: WorkbenchState,
  target: LayoutKind,
  declaredKeys: string[]
): { values: BenchValues; kept: number; dropped: string[] } {
  const values: BenchValues = {}
  const dropped: string[] = []
  let kept = 0
  const alias: Record<string, string> = {
    inputs: 'ingredients',
    ingredients: 'inputs',
    outputs: 'results',
    results: 'outputs'
  }
  const declared = new Set(declaredKeys)

  for (const [key, value] of Object.entries(prev.values)) {
    if (key === GRID_KEY) {
      if (target === 'shaped' || target === 'custom') {
        values[GRID_KEY] = value
        kept += 1
      } else dropped.push(key)
      continue
    }
    if (key === INPUTS_KEY || key === OUTPUTS_KEY) {
      if (acceptsList(target)) {
        values[key] = value
        kept += 1
      } else if (declared.has(key)) {
        values[key] = value
        kept += 1
      } else dropped.push(key)
      continue
    }
    const candidates = [key, alias[key] ?? ''].filter(Boolean)
    const hit = candidates.find((c) => declared.has(c))
    if (hit) {
      values[hit] = value
      kept += 1
    } else if (declared.has(key)) {
      values[key] = value
      kept += 1
    } else {
      dropped.push(key)
    }
  }
  if (target === 'shaped' && !values[GRID_KEY]) {
    values[GRID_KEY] = new Array(GRID_DEFAULT_SIZE * GRID_DEFAULT_SIZE).fill(null)
  }
  if (acceptsList(target) && !values[OUTPUTS_KEY]) values[OUTPUTS_KEY] = []
  return { values, kept, dropped }
}

export const useBenchStore = create<BenchStore>((set, get) => ({
  bench: emptyBench(),
  past: [],
  future: [],
  loadedFrom: null,
  draft: null,
  draftConflict: null,
  conflictLoadFailed: false,
  committing: false,
  lastCommit: null,

  snapshot() {
    set({ past: [...get().past, cloneBench(get().bench)].slice(-HISTORY_MAX), future: [] })
  },

  setTypeId(typeId, layoutKind, keys = [], rows = GRID_DEFAULT_SIZE, cols = GRID_DEFAULT_SIZE) {
    const prev = get().bench
    const carried = carryValues(prev, layoutKind, keys)
    const next: WorkbenchState = {
      typeId,
      layoutKind,
      gridRows: layoutKind === 'shaped' ? rows : undefined,
      gridCols: layoutKind === 'shaped' ? cols : undefined,
      values: carried.values,
      activeSlotKey: null,
      modifiers: {}
    }
    get().snapshot()
    set({ bench: next })
    const app = useAppStore.getState()
    app.pushLog('INFO', 'RECIPE', `切换配方类型 → ${typeId}`)
    if (carried.dropped.length > 0) {
      app.toast(
        `${carried.kept} 个字段已保留，${carried.dropped.length} 个字段因新类型不含（${carried.dropped.join('、')}）已清除`,
        'warn'
      )
    }
  },

  setGridSize(rows, cols) {
    const b = get().bench
    const cells = [...asSlotArray(b.values[GRID_KEY])]
    const next: (SlotValue | null)[] = new Array(rows * cols).fill(null)
    const prevCols = b.gridCols ?? GRID_DEFAULT_SIZE
    const prevRows = b.gridRows ?? GRID_DEFAULT_SIZE
    for (let r = 0; r < Math.min(rows, prevRows); r++) {
      for (let c = 0; c < Math.min(cols, prevCols); c++) {
        next[r * cols + c] = cells[r * prevCols + c] ?? null
      }
    }
    get().snapshot()
    set({ bench: { ...b, gridRows: rows, gridCols: cols, values: { ...b.values, [GRID_KEY]: next } } })
    touchDirty(get, set, GRID_KEY)
  },

  setValue(key, value, record = true) {
    const b = get().bench
    if (record) get().snapshot()
    set({ bench: { ...b, values: { ...b.values, [key]: value } } })
    // record 只控制撤销快照：拖拽/选择器批量写入传 false，但仍是用户编辑，必须记脏
    touchDirty(get, set, key)
  },

  setGridCell(index, value) {
    const b = get().bench
    const cells = [...asSlotArray(b.values[GRID_KEY])]
    while (cells.length <= index) cells.push(null)
    cells[index] = value
    get().snapshot()
    set({ bench: { ...b, values: { ...b.values, [GRID_KEY]: cells } } })
    touchDirty(get, set, GRID_KEY)
  },

  setListValue(key, index, value) {
    const b = get().bench
    const list = [...asSlotArray(b.values[key])]
    if (value === null) list.splice(index, 1)
    else list[index] = value
    get().snapshot()
    set({ bench: { ...b, values: { ...b.values, [key]: list } } })
    touchDirty(get, set, key)
  },

  appendListValue(key, value) {
    const b = get().bench
    get().snapshot()
    set({ bench: { ...b, values: { ...b.values, [key]: [...asSlotArray(b.values[key]), value] } } })
    touchDirty(get, set, key)
  },

  removeListValue(key, index) {
    get().setListValue(key, index, null)
  },

  setActiveSlot(key) {
    set({ bench: { ...get().bench, activeSlotKey: key } })
  },

  setModifier(key, value) {
    const b = get().bench
    get().snapshot()
    set({ bench: { ...b, modifiers: { ...(b.modifiers ?? {}), [key]: value } } })
    // P3-23d：修饰符也是草稿内容，只改修饰符不应被 NO_CHANGES 拒绝
    touchDirty(get, set, `modifiers.${key}`)
  },

  loadFromRecipe(record, layoutKind, typeId) {
    const values: BenchValues = {}
    if (layoutKind === 'shaped') {
      const cells: (SlotValue | null)[] = new Array(GRID_DEFAULT_SIZE * GRID_DEFAULT_SIZE).fill(null)
      record.inputs.forEach((input, i) => {
        if (i < cells.length) cells[i] = { kind: input.kind === 'tag' ? 'tag' : 'item', id: input.id, count: input.count }
      })
      values[GRID_KEY] = cells
    } else {
      values[INPUTS_KEY] = record.inputs.map(
        (input): SlotValue => ({
          kind: input.kind === 'fluid' ? 'fluid' : input.kind === 'tag' ? 'tag' : 'item',
          id: input.id,
          count: input.kind === 'fluid' ? undefined : input.count,
          amount: input.kind === 'fluid' ? input.count : undefined
        })
      )
    }
    values[OUTPUTS_KEY] = record.outputs.map(
      (output): SlotValue => ({
        kind: output.kind === 'fluid' ? 'fluid' : 'item',
        id: output.id,
        count: output.kind === 'fluid' ? undefined : output.count,
        amount: output.kind === 'fluid' ? output.count : undefined,
        chance: output.chance
      })
    )
    // T-26 / UI-U5：载入配方是会话边界——清空 undo/redo 栈，
    // 不让 Ctrl+Z 把人带回「上一个配方」的状态（那份状态已不属于当前编辑）。
    set({ past: [], future: [] })
    set({
      bench: {
        typeId,
        layoutKind,
        values,
        gridRows: layoutKind === 'shaped' ? GRID_DEFAULT_SIZE : undefined,
        gridCols: layoutKind === 'shaped' ? GRID_DEFAULT_SIZE : undefined,
        activeSlotKey: null,
        modifiers: {}
      },
      loadedFrom: record.uid,
      draft: null,
      draftConflict: null,
      lastCommit: null
    })
    useAppStore.getState().pushLog(
      'INFO',
      'RECIPE',
      `从配方 ${record.uid} 载入工作台（${record.inputs.length} 个材料 / ${record.outputs.length} 个产物）`,
      record.partial ? '原始脚本含动态逻辑，仅载入可静态解析的部分' : undefined
    )
  },

  loadOpenedRecipe(opened) {
    if (!opened.normalized) return { ok: false, reason: opened.status }
    const loaded = normalizedToDraft(opened)
    if (!loaded) return { ok: false, reason: 'normalize-failed' }
    const current = get().draft
    if (current && current.uid === loaded.meta.base?.uid) {
      // 原始数据变化：默认不覆盖，挂起冲突交给用户显式处理
      if (checkDraftConflict(current.meta, loaded.normalized.rawHash) === 'conflict') {
        set({ draftConflict: opened })
        return { ok: false, conflict: true, reason: 'raw-changed' }
      }
    }
    get().snapshot()
    // P2-3：打开草稿同样是会话边界（对照 loadFromRecipe 的 T-26/UI-U5）——
    // 不清栈的话 Ctrl+Z 会把 bench 拉回上一个配方的值，而 draft 仍是新草稿，
    // 继续提交就会把 A 配方的格子写进 B 配方文件。
    set({
      past: [],
      future: [],
      bench: loaded.workbench,
      draft: {
        uid: loaded.meta.base?.uid ?? opened.record.uid,
        meta: loaded.meta,
        passThrough: loaded.passThrough,
        normalized: loaded.normalized,
        schema: loaded.schema,
        diagnostics: loaded.diagnostics,
        ...(loaded.unsafeReason ? { unsafeReason: loaded.unsafeReason } : {}),
        banners: loaded.banners
      },
      draftConflict: null,
      conflictLoadFailed: false,
      lastCommit: null,
      loadedFrom: opened.record.uid
    })
    return { ok: true }
  },

  resolveConflictReload() {
    const pending = get().draftConflict
    if (!pending) return
    const loaded = normalizedToDraft(pending)
    if (!loaded) return
    get().snapshot()
    set({
      bench: loaded.workbench,
      draft: {
        uid: loaded.meta.base?.uid ?? pending.record.uid,
        meta: loaded.meta,
        passThrough: loaded.passThrough,
        normalized: loaded.normalized,
        schema: loaded.schema,
        diagnostics: loaded.diagnostics,
        ...(loaded.unsafeReason ? { unsafeReason: loaded.unsafeReason } : {}),
        banners: loaded.banners
      },
      draftConflict: null,
      conflictLoadFailed: false,
      lastCommit: null,
      loadedFrom: pending.record.uid
    })
    useAppStore.getState().toast('已重新载入最新原始数据（你的修改已丢弃）', 'info')
  },

  resolveConflictKeepMine() {
    const pending = get().draftConflict
    const draft = get().draft
    if (!pending || !draft) return
    const loaded = normalizedToDraft(pending)
    if (!loaded) return
    // P2-4：换基线可能连 schema 一起换（外部改动改变了槽位结构）。dirtyFields 必须
    // 按新 normalized 槽位重算——否则脏键指向不存在的槽、基线已换新、提交畅通，
    // 写入内容与 UI 意图静默偏离。失效的键丢弃并向用户点名。
    const validKeys = new Set(loaded.normalized.slots.map((s) => s.key))
    if (validKeys.has('result')) validKeys.add(BENCH_OUTPUTS_KEY) // UI 产物列表键 → result 别名
    const kept = draft.meta.dirtyFields.filter((k) => validKeys.has(k))
    const dropped = draft.meta.dirtyFields.filter((k) => !validKeys.has(k))
    // 保留当前编辑值，但把基线换成新原始；未知字段以新原文为准
    set({
      draftConflict: null,
      conflictLoadFailed: false,
      draft: {
        ...draft,
        normalized: loaded.normalized,
        schema: loaded.schema,
        diagnostics: loaded.diagnostics,
        ...(loaded.unsafeReason ? { unsafeReason: loaded.unsafeReason } : {}),
        passThrough: loaded.passThrough,
        banners: loaded.banners,
        meta: loaded.meta.base ? { ...draft.meta, base: loaded.meta.base, dirtyFields: kept } : { ...draft.meta, dirtyFields: kept }
      }
    })
    if (dropped.length > 0) {
      useAppStore
        .getState()
        .toast(`已保留你的修改，基线已更新；${dropped.length} 个字段因结构变更已失效（${dropped.join('、')}），请重新确认`, 'warn')
    } else {
      useAppStore.getState().toast('已保留你的修改，基线更新为最新原始数据', 'warn')
    }
  },

  resolveConflictSaveCopy() {
    const draft = get().draft
    if (!draft) return
    // C7-F7：旧实现用 `#${Date.now()}` 拼 uid，落到文件名就是 `..._1698923456789` 这种不可读串；
    // 改成可读时间戳（精确到秒）+ 4 位随机后缀，既便于人在目录里辨认，也避免同秒内两次另存撞名。
    const stamp = ((): string => {
      const d = new Date()
      const p = (n: number): string => String(n).padStart(2, '0')
      const rand = Math.random().toString(36).slice(2, 6)
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`
    })()
    set({
      draftConflict: null,
      conflictLoadFailed: false,
      draft: { ...draft, uid: `copy:${draft.uid}#${stamp}`, meta: { ...draft.meta, base: null } }
    })
    useAppStore.getState().toast('已另存为副本（脱离原始基线，不会覆盖原配方）', 'info')
  },

  cancelDraft() {
    const had = get().draft
    get().snapshot()
    // P2-3：取消草稿同样是会话边界——不清栈的话 undo 会复活已取消草稿的 bench 值
    //（draft 已为 null，走 WriteDialog 通用路径时试点键值会被当普通字段导出）。
    set({ past: [], future: [], bench: emptyBench(), draft: null, draftConflict: null, loadedFrom: null, lastCommit: null })
    if (had) useAppStore.getState().pushLog('INFO', 'RECIPE', `已取消草稿 ${had.uid}（原始数据未改动）`)
  },

  getDraftPreview() {
    const draft = get().draft
    if (!draft || get().draftConflict) return null
    return draftPreview({
      workbench: get().bench,
      meta: draft.meta,
      passThrough: draft.passThrough,
      normalized: draft.normalized,
      schema: draft.schema,
      diagnostics: draft.diagnostics,
      banners: draft.banners
    })
  },

  reset() {
    get().snapshot()
    set({ bench: emptyBench(), loadedFrom: null, draft: null, draftConflict: null, lastCommit: null })
  },

  undo() {
    const { past, bench } = get()
    if (past.length === 0) return false
    const prev = past[past.length - 1]
    set({
      bench: prev,
      past: past.slice(0, -1),
      future: [cloneBench(bench), ...get().future].slice(0, HISTORY_MAX)
    })
    useAppStore.getState().pushLog('DEBUG', 'RECIPE', '撤销一步')
    return true
  },

  redo() {
    const { future, bench } = get()
    if (future.length === 0) return false
    const next = future[0]
    set({
      bench: next,
      future: future.slice(1),
      past: [...get().past, cloneBench(bench)].slice(-HISTORY_MAX)
    })
    useAppStore.getState().pushLog('DEBUG', 'RECIPE', '重做一步')
    return true
  }
}))
