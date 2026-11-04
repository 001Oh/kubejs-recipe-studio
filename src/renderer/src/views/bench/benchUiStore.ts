/**
 * 工作台运行时状态：schema 拉取与缓存、响应式断点、网格缩放、三类浮层目标、写入对话框开关。
 * 与 benchStore（值字典 + 历史）分开，控件里不再出现配方类型分支，也不做超过 3 层的 prop 传递。
 */
import { create } from 'zustand'
import type { SchemaSummary } from '@shared/ipc'
import type {
  FieldKind,
  LayoutKind,
  RecipeTypeSchema,
  RegistryOption,
  SlotValue
} from '@shared/types'
import { GRID_DEFAULT_SIZE } from '@shared/constants'
import { call, callOrThrow } from '../../api'
import { useAppStore } from '../../store/appStore'
import { GRID_KEY, INPUTS_KEY, OUTPUTS_KEY, useBenchStore } from '../../store/benchStore'
import { allFieldsFlat } from './fieldModel'
import { initialGridSize } from './gridModel'

/** 下拉最底部固定的兜底通道（规格 3.6.8） */
export const GENERIC_TYPE_ID = '__generic__'
/** 容器宽度低于此值：箭头改向下，横向布局改纵向（用 ResizeObserver 而非窗口断点） */
export const NARROW_WIDTH = 620

export interface Anchor {
  x: number
  y: number
  width: number
  height: number
}

export interface PickerTarget {
  slotId: string
  kind: FieldKind
  registry?: string
  anchor: Anchor
}

export interface CountTarget {
  slotId: string
  anchor: Anchor
}

function fallbackAnchor(): Anchor {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2, width: 0, height: 0 }
}

/** 用 ItemSlot 的 data-slot 属性定位浮层，避免把 ref 一路传到控件里 */
export function anchorForSlot(slotId: string): Anchor {
  const el = document.querySelector(`[data-slot="${CSS.escape(slotId)}"]`)
  if (!el) return fallbackAnchor()
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom, width: r.width, height: r.height }
}

function asGrid(value: unknown): (SlotValue | null)[] {
  return Array.isArray(value) ? (value as (SlotValue | null)[]) : []
}

interface BenchUiStore {
  summaries: SchemaSummary[]
  summariesLoaded: boolean
  /** P3-21：schema:list 的失败原因；null = 加载成功。失败与「确实没有类型」必须可区分 */
  summariesError: string | null
  /** 当前配方类型的完整 schema；null = 拿不到（走三级降级） */
  schema: RecipeTypeSchema | null
  schemaTypeId: string
  schemaLoading: boolean
  schemaCache: Record<string, RecipeTypeSchema | null>
  registryCache: Record<string, RegistryOption[]>

  narrow: boolean
  zoom: number
  picker: PickerTarget | null
  registryPanel: PickerTarget | null
  countEditor: CountTarget | null
  writeOpen: boolean
  advancedOpen: boolean
  jsonOpen: boolean

  loadSummaries: () => Promise<void>
  ensureSchema: (typeId: string) => Promise<RecipeTypeSchema | null>
  applyType: (typeId: string) => Promise<void>
  syncCurrentSchema: () => Promise<void>
  registryOptions: (registry: string) => Promise<RegistryOption[]>
  pinCurrent: () => Promise<void>
  unpinCurrent: () => Promise<void>

  setNarrow: (narrow: boolean) => void
  setZoom: (zoom: number) => void
  openPicker: (target: Omit<PickerTarget, 'anchor'> & { anchor?: Anchor }) => void
  openRegistryPanel: (target: Omit<PickerTarget, 'anchor'> & { anchor?: Anchor }) => void
  openCountEditor: (slotId: string) => void
  closeOverlays: () => void
  setWriteOpen: (open: boolean) => void
  setAdvancedOpen: (open: boolean) => void
  setJsonOpen: (open: boolean) => void
  /** 第 116 批：槽位剪贴板（中键复制/粘贴）。只存物品 id，数量恒为 1（负责人裁定：粘贴仅物品） */
  slotClipboard: { id: string } | null
  setSlotClipboard: (item: { id: string } | null) => void
}

export const useBenchUiStore = create<BenchUiStore>((set, get) => ({
  summaries: [],
  summariesLoaded: false,
  summariesError: null,
  schema: null,
  schemaTypeId: '',
  schemaLoading: false,
  schemaCache: {},
  registryCache: {},

  narrow: false,
  zoom: 1,
  slotClipboard: null,
  picker: null,
  registryPanel: null,
  countEditor: null,
  writeOpen: false,
  advancedOpen: false,
  jsonOpen: false,

  async loadSummaries() {
    // P3-21：失败与「确实没有类型」可区分——错误进 summariesError，由 UI 呈现「读取失败，请重试」
    try {
      const list = await callOrThrow('schema:list')
      set({ summaries: list ?? [], summariesLoaded: true, summariesError: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ summaries: [], summariesLoaded: true, summariesError: message })
      useAppStore.getState().pushLog('ERROR', 'SCHEMA', 'schema:list 加载失败', message)
    }
  },

  async ensureSchema(typeId) {
    if (typeId === GENERIC_TYPE_ID) {
      set({ schema: null, schemaTypeId: typeId, schemaCache: { ...get().schemaCache, [typeId]: null } })
      return null
    }
    const cached = get().schemaCache[typeId]
    if (cached !== undefined) {
      set({ schema: cached, schemaTypeId: typeId, schemaLoading: false })
      return cached
    }
    set({ schemaLoading: true, schemaTypeId: typeId })
    // BH-009：「加载失败」与「这个类型本来就没有 schema」必须分开。
    // 旧写法用 call()（失败返回 null）并把 null 写进 schemaCache，而缓存判定是 `!== undefined`，
    // 于是一次瞬时失败会让该类型在整场会话里都拿不到 schema，且不会重试。
    try {
      const schema = await callOrThrow('schema:get', { typeId })
      const schemaCache = { ...get().schemaCache, [typeId]: schema }
      // P3-21：迟到返回不覆盖当前选择——用户可能已切到别的类型；schema/schemaTypeId/
      // schemaLoading 属于「最新一次请求」。缓存照常更新（旧类型的 schema 对旧类型仍有效）。
      if (get().schemaTypeId !== typeId) {
        set({ schemaCache })
        return schema
      }
      set({ schema, schemaTypeId: typeId, schemaLoading: false, schemaCache })
      return schema
    } catch (err) {
      if (get().schemaTypeId !== typeId) return null
      set({ schema: null, schemaLoading: false })
      useAppStore.getState().toast(`配方类型 ${typeId} 的字段定义加载失败，可重试`, 'error')
      useAppStore.getState().pushLog('ERROR', 'SCHEMA', `schema:get 失败：${typeId}`, err instanceof Error ? err.message : String(err))
      return null
    }
  },

  async applyType(typeId) {
    const schema = await get().ensureSchema(typeId)
    const bench = useBenchStore.getState().bench
    const layoutKind: LayoutKind =
      schema?.layoutKind ?? (typeId === GENERIC_TYPE_ID ? 'shapeless' : bench.layoutKind)
    // struct 子键也要声明出来，否则切换类型时 carryValues 会把它们当无主字段丢弃
    const keys = allFieldsFlat(schema).map((f) => f.key)
    if (keys.length === 0) keys.push(INPUTS_KEY, OUTPUTS_KEY)
    const baseRows = schema?.grid?.rows ?? GRID_DEFAULT_SIZE
    const baseCols = schema?.grid?.cols ?? GRID_DEFAULT_SIZE
    // shaped 起始尺寸按内容包围盒自适应（规格 3.4 A.1）
    const size =
      layoutKind === 'shaped'
        ? initialGridSize(
            asGrid(bench.values[GRID_KEY]),
            bench.gridRows ?? baseRows,
            bench.gridCols ?? baseCols,
            baseRows,
            baseCols
          )
        : { rows: baseRows, cols: baseCols }
    useBenchStore.getState().setTypeId(typeId, layoutKind, keys, size.rows, size.cols)
    set({ advancedOpen: false })
  },

  /** 进入工作台时补齐当前类型的 schema（浏览视图载入的配方可能还没取过 schema） */
  async syncCurrentSchema() {
    const typeId = useBenchStore.getState().bench.typeId
    if (get().schemaTypeId === typeId && !get().schemaLoading) return
    const schema = await get().ensureSchema(typeId)
    const bench = useBenchStore.getState().bench
    if (!schema || bench.typeId !== typeId || schema.layoutKind === bench.layoutKind) return
    const keys = allFieldsFlat(schema).map((f) => f.key)
    if (keys.length === 0) keys.push(INPUTS_KEY, OUTPUTS_KEY)
    useBenchStore.getState().setTypeId(typeId, schema.layoutKind, keys, schema.grid?.rows, schema.grid?.cols)
  },

  async registryOptions(registry) {
    const cached = get().registryCache[registry]
    if (cached) return cached
    const list = await call('schema:registryOptions', { registry })
    const options = list ?? []
    set({ registryCache: { ...get().registryCache, [registry]: options } })
    return options
  },

  async pinCurrent() {
    const schema = get().schema
    if (!schema) return
    // BH-010：失败必须让用户看见，不能点了没反应（call() 把失败折成 null，旧写法直接 return 了）
    try {
      const pinned = await callOrThrow('schema:pin', { typeId: schema.id, schema })
      set({ schemaCache: { ...get().schemaCache, [schema.id]: pinned }, schema: pinned })
      useAppStore.getState().toast(`已钉住 ${schema.displayName}，后续以本包为准`, 'success')
    } catch (err) {
      useAppStore.getState().toast(`钉住失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  },

  async unpinCurrent() {
    const schema = get().schema
    if (!schema) return
    try {
      const ok = await callOrThrow('schema:unpin', { typeId: schema.id })
      if (!ok) {
        // 本来就没钉住：不是错误，但也不能一声不响
        useAppStore.getState().toast(`${schema.displayName} 当前并未钉住`, 'info')
        return
      }
      // 解除钉住后重新拉一次合并结果，避免界面还停在旧的钉住版本
      const fresh = await call('schema:get', { typeId: schema.id })
      if (fresh) {
        set({ schema: fresh, schemaCache: { ...get().schemaCache, [schema.id]: fresh } })
      } else {
        // 拉不到就**删掉缓存项**（不能写 null/undefined：前者会被当成「该类型无 schema」永久命中）
        const nextCache = { ...get().schemaCache }
        delete nextCache[schema.id]
        set({ schema: null, schemaCache: nextCache })
      }
      useAppStore.getState().toast(`已取消钉住 ${schema.displayName}`, 'info')
    } catch (err) {
      useAppStore.getState().toast(`取消钉住失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  },

  setNarrow(narrow) {
    if (get().narrow !== narrow) set({ narrow })
  },

  setZoom(zoom) {
    set({ zoom })
  },

  openPicker(target) {
    set({ picker: { ...target, anchor: target.anchor ?? anchorForSlot(target.slotId) }, registryPanel: null })
  },

  openRegistryPanel(target) {
    set({
      registryPanel: { ...target, anchor: target.anchor ?? anchorForSlot(target.slotId) },
      picker: null
    })
  },

  openCountEditor(slotId) {
    set({ countEditor: { slotId, anchor: anchorForSlot(slotId) } })
  },

  closeOverlays() {
    set({ picker: null, registryPanel: null, countEditor: null })
  },

  setWriteOpen(open) {
    set({ writeOpen: open })
  },
  setAdvancedOpen(open) {
    set({ advancedOpen: open })
  },
  setJsonOpen(open) {
    set({ jsonOpen: open })
  },
  setSlotClipboard(item) {
    set({ slotClipboard: item })
  }
}))
