/**
 * 控件写入的唯一出口：把一次交互换算成若干字典修改，压成一步历史快照（规格 3.4 撤销/重做）。
 * 控件只认 slotId / key，不认配方类型，也不各自 snapshot。
 */
import type { BenchValues, SlotValue } from '@shared/types'
import { GRID_DEFAULT_SIZE } from '@shared/constants'
import { useBenchStore } from '../../store/benchStore'
import {
  applyOps,
  clearOps,
  countValue,
  decodeSlot,
  pickValue,
  readSlot,
  withValue,
  writeToSlot,
  type DropOp
} from './slotAddress'
import { useBenchUiStore } from './benchUiStore'
import { allFieldsFlat } from './fieldModel'

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function fieldKindOfKey(key: string): string | null {
  const schema = useBenchUiStore.getState().schema
  const flat = allFieldsFlat(schema)
  const hit = flat.find((f) => f.key === key) ?? flat.find((f) => key.startsWith(`${f.key}.`))
  if (hit) return hit.kind
  // 顶层直接以 key 登记的字段（slots 之外的 extraFields 已含在 flat 中）
  return null
}

export function commitOps(ops: DropOp[]): void {
  if (ops.length === 0) return
  const store = useBenchStore.getState()
  const bench = store.bench
  const rows = bench.gridRows ?? GRID_DEFAULT_SIZE
  const cols = bench.gridCols ?? GRID_DEFAULT_SIZE
  const next = applyOps(bench.values, ops, rows, cols)
  const changed = Object.keys(next).filter((key) => !same(bench.values[key], next[key]))
  if (changed.length === 0) return
  store.snapshot()
  for (const key of changed) store.setValue(key, next[key], false)
}

/** blockstate 字段的值是 `{block, properties}`，不是 SlotValue：写入时按 schema 形态转换 */
function toBlockstate(key: string, value: SlotValue): BenchValues {
  const current = pickValue(useBenchStore.getState().bench.values, key)
  const properties =
    current && typeof current === 'object' && !Array.isArray(current)
      ? ((current as Record<string, unknown>)['properties'] as Record<string, unknown> ?? {})
      : {}
  return { block: value.id, properties }
}

/** 直接按 slotId 写入一个槽位值（null = 清空 / 移除列表项） */
export function writeAt(slotId: string, value: SlotValue | null): void {
  const addr = decodeSlot(slotId)
  if (!addr) {
    // U-15：以前这里静默 return，picker 选了物却「什么都没发生」且无任何线索。
    console.warn('[bench] writeAt 无法解析槽位地址，已丢弃：', slotId)
    return
  }
  if (value === null) {
    commitOps(clearOps(addr))
    return
  }
  if (addr.kind === 'value' && fieldKindOfKey(addr.key) === 'blockstate') {
    setKey(addr.key, toBlockstate(addr.key, value))
    return
  }
  commitOps(writeToSlot(addr, value, useBenchStore.getState().bench))
}

export function clearAt(slotId: string): void {
  writeAt(slotId, null)
}

/** 滚轮 ±1 / Shift 滚轮 ±8（流体与注册表走 amount，物品走 count） */
export function bumpCountAt(slotId: string, delta: number): void {
  const addr = decodeSlot(slotId)
  if (!addr) return
  const bench = useBenchStore.getState().bench
  const current = readSlot(bench, addr)
  if (!current) return
  const max = current.kind === 'fluid' || current.kind === 'registry' ? 1_000_000 : 999
  commitOps(writeToSlot(addr, countValue(current, delta, max), bench))
}

/** 非槽位值（number/boolean/text/choice/struct/json）的写入；一步历史 */
export function setKey(key: string, value: BenchValues[string]): void {
  const store = useBenchStore.getState()
  const next = withValue(store.bench.values, key, value)
  const head = key.split('.')[0] as string
  if (same(store.bench.values[head], next[head])) return
  store.setValue(head, next[head])
}
