/** 字典值 → 控件所需类型的窄转换（BenchValues 是 unknown 兜底，控件里集中收口一次）。 */
import type { BenchValues, FieldKind, SlotKind, SlotValue } from '@shared/types'
import { useBenchStore } from '../../store/benchStore'
import { pickValue } from './slotAddress'

export function asSlot(value: unknown): SlotValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record['id'] !== 'string') return null
  return value as SlotValue
}

export function asSlotList(value: unknown): SlotValue[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is SlotValue => asSlot(item) !== null)
}

export function asSlotArray(value: unknown): (SlotValue | null)[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => asSlot(item))
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === '1'
  if (typeof value === 'number') return value !== 0
  return false
}

export function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function slotKindOf(kind: FieldKind): SlotKind {
  if (kind === 'fluid' || kind === 'tag' || kind === 'registry') return kind
  return 'item'
}

/** 空槽的占位值：只带 kind，绝不自动塞 count=1 之外的字段（规格 3.6.12 NBT 也不自动塞 {}） */
export function emptySlot(kind: FieldKind, registry?: string): SlotValue {
  const slotKind = slotKindOf(kind)
  return slotKind === 'registry' ? { kind: 'registry', id: '', registryType: registry ?? '' } : { kind: slotKind, id: '' }
}

/** 主色块（注册表 / 概率条）用色的唯一来源，避免控件各写一套 */
export function registryColorOf(color: string | undefined): string {
  return color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : 'var(--registry)'
}

/** 订阅某个字段键的当前值，支持 struct 的 `parent.child` 路径 */
export function useFieldValue(key: string): BenchValues[string] {
  return useBenchStore((s) => pickValue(s.bench.values, key))
}

export function useFieldSlot(key: string): SlotValue | null {
  return useBenchStore((s) => asSlot(pickValue(s.bench.values, key)))
}

export function useFieldSlots(key: string): SlotValue[] {
  return useBenchStore((s) => asSlotList(pickValue(s.bench.values, key)))
}

/**
 * 控件层读取：`index === undefined` 取单值槽，否则取列表的第 index 项。
 * 注意：序列组装的步骤内字段走 `steps[n].values`，目前只有顶层字典；
 * 等步骤编辑器接入时，这里需要增补 step 作用域参数（不要在不带作用域的情况下复用）。
 */
export function useSlotAt(key: string, index?: number): SlotValue | null {
  return useBenchStore((s) => {
    const raw = pickValue(s.bench.values, key)
    if (index === undefined) return asSlot(raw)
    const list = asSlotArray(raw)
    return list[index] ?? null
  })
}

export function useSlotsOf(key: string): SlotValue[] {
  return useBenchStore((s) => asSlotList(pickValue(s.bench.values, key)))
}
