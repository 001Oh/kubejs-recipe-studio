/**
 * 工作台通用字典（BenchValues）读取原语。发射器 / 校验器共用一份，
 * 保证「同一种填法在三条通道里含义一致」；不按配方类型分支（规格 3.6.11）。
 */
import type { ModifierSchema, RecipeSlotSchema, SlotValue, WorkbenchState } from '../../shared/types'
import { GRID_MAX_SIZE } from '../../shared/constants'

/** JSON 可直接表达的取值（无函数、无 undefined） */
export type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain }

const DEFAULT_NAMESPACE = 'minecraft'

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function isSlotValue(v: unknown): v is SlotValue {
  if (!isRecord(v)) return false
  return v['kind'] === 'item' || v['kind'] === 'fluid' || v['kind'] === 'tag' || v['kind'] === 'registry'
}

/** 空值判定：null / undefined / 空串 / 无 id 的槽位 / 空数组 都算「用户没填」 */
export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim().length === 0
  if (Array.isArray(v)) return v.every(isBlank)
  if (isSlotValue(v)) return typeof v.id !== 'string' || v.id.trim().length === 0
  if (isRecord(v)) return Object.values(v).every(isBlank)
  return false
}

export function slotOf(v: unknown): SlotValue | null {
  if (!isSlotValue(v)) return null
  const id = typeof v.id === 'string' ? v.id.trim() : ''
  return id ? { ...v, id } : null
}

/** 单值 / 数组归一为数组（`multiple:false` 字段给成数组时也接受，校验器负责报形态错） */
export function slotList(v: unknown): SlotValue[] {
  if (Array.isArray(v)) return v.map(slotOf).filter((s): s is SlotValue => s !== null)
  const one = slotOf(v)
  return one ? [one] : []
}

export function fullId(id: string): string {
  const trimmed = id.trim()
  if (!trimmed) return trimmed
  return trimmed.includes(':') ? trimmed : `${DEFAULT_NAMESPACE}:${trimmed}`
}

/** 带命名空间的材料引用；标签保留 `#`（KubeJS 与原版 JSON 的通用写法） */
export function referenceOf(sv: SlotValue): string {
  const id = fullId(sv.id)
  return sv.kind === 'tag' ? `#${id}` : id
}

/** 数值解析：容忍字符串数字（IP 的 `chance:"0.07"` 必须当 7%，规格 §八） */
export function numericOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t || !/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(t)) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function boolOf(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v !== 0 : null
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (t === 'true' || t === '1') return true
    if (t === 'false' || t === '0') return false
  }
  return null
}

function optionalNumber(v: unknown): number | undefined {
  const n = numericOf(v)
  return n === null ? undefined : n
}

export function countOf(sv: SlotValue): number | undefined {
  return optionalNumber(sv.count)
}

export function amountOf(sv: SlotValue): number | undefined {
  return optionalNumber(sv.amount)
}

export function chanceOf(sv: SlotValue): number | undefined {
  return optionalNumber(sv.chance)
}

export function stringOf(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  const n = numericOf(v)
  return n === null ? null : String(v)
}

/** 原样搬运未知结构：数组/对象递归裁剪 undefined，绝不塞默认值 */
export function plainOf(v: unknown): Plain | undefined {
  if (v === null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) {
    const out: Plain[] = []
    for (const item of v) {
      const p = plainOf(item)
      if (p !== undefined) out.push(p)
    }
    return out
  }
  if (isRecord(v)) {
    const out: Record<string, Plain> = {}
    for (const [k, item] of Object.entries(v)) {
      const p = plainOf(item)
      if (p !== undefined) out[k] = p
    }
    return out
  }
  return undefined
}

export function gridCells(workbench: WorkbenchState): (SlotValue | null)[] {
  const raw = workbench.values['grid']
  if (!Array.isArray(raw)) return []
  return raw.map((cell) => slotOf(cell))
}

/** 网格尺寸缺省 3×3；越界钳到 1…GRID_MAX_SIZE，供裁剪函数使用 */
export function gridSize(workbench: WorkbenchState): { rows: number; cols: number } {
  const rows = clampDim(workbench.gridRows)
  const cols = clampDim(workbench.gridCols)
  return { rows, cols }
}

function clampDim(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) return 3
  return Math.min(value, GRID_MAX_SIZE)
}

export interface ModifierEntry {
  schema: ModifierSchema
  value: number | boolean | string
}

/** 修饰符按 schema 声明顺序输出（规格：链式顺序 = schema 顺序，不随用户点击顺序变化） */
export function modifierEntries(schema: { modifiers?: ModifierSchema[] }, workbench: WorkbenchState): ModifierEntry[] {
  const declared = schema.modifiers ?? []
  const bag = workbench.modifiers ?? {}
  const out: ModifierEntry[] = []
  for (const mod of declared) {
    const raw = bag[mod.key]
    if (raw === undefined || raw === null || raw === false || raw === '') continue
    if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string') {
      out.push({ schema: mod, value: raw })
    }
  }
  return out
}

/** schema 声明的全部字段（slots → outputs → extraFields 顺序 = positional 参数顺序基准） */
export function declaredFields(schema: {
  slots?: RecipeSlotSchema[]
  outputs?: RecipeSlotSchema[]
  extraFields?: RecipeSlotSchema[]
}): RecipeSlotSchema[] {
  return [...(schema.slots ?? []), ...(schema.outputs ?? []), ...(schema.extraFields ?? [])]
}

export function fieldKeys(schema: {
  slots?: RecipeSlotSchema[]
  outputs?: RecipeSlotSchema[]
  extraFields?: RecipeSlotSchema[]
}): Set<string> {
  return new Set(declaredFields(schema).map((f) => f.key))
}
