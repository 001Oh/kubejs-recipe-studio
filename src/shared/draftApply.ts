/**
 * 草稿值 → 规范化值的纯函数（P-C3 由渲染端与主进程提交共用）。
 *
 * 不变量：
 * - 只写 dirtyFields；未改动的列表项复用 Normalized 原值（保留原始形态与数值类型）；
 * - 编辑引用时保留 UI 没有控件的 extras / NBT / refKey；
 * - shaped 的网格逐格比对，未改格子不被无谓重写。
 */
import type { NormalizedRecipe, NormalizedValue } from './schemaModel'
import type { SlotValue, WorkbenchState } from './types'
import { BENCH_GRID_KEY, BENCH_OUTPUTS_KEY } from './constants'

/** WorkbenchState 的脏字段值 → NormalizedValue（保持对象形态，数值类型沿用 UI 数字） */
function slotToNormalized(slot: SlotValue | null): NormalizedValue | null {
  if (!slot) return null
  const count = slot.count !== undefined ? { raw: slot.count, numeric: slot.count } : undefined
  const amountRaw = slot.amount ?? slot.count
  const amount = amountRaw !== undefined ? { raw: amountRaw, numeric: amountRaw } : undefined
  const chance = slot.chance !== undefined ? { raw: slot.chance, numeric: slot.chance } : undefined
  if (slot.kind === 'tag') {
    return {
      kind: 'tag',
      id: slot.id,
      asObject: true,
      ...(count ? { count } : {}),
      ...(chance ? { chance } : {}),
      ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
    }
  }
  if (slot.kind === 'fluid') {
    return {
      kind: 'fluid',
      id: slot.id,
      asObject: true,
      ...(amount ? { amount } : {}),
      ...(chance ? { chance } : {}),
      ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
    }
  }
  if (slot.kind === 'registry') {
    return {
      kind: 'registry',
      registry: slot.registryType ?? 'unknown:registry',
      id: slot.id,
      asObject: true,
      ...(amount ? { amount } : {}),
      ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
    }
  }
  return {
    kind: 'item',
    id: slot.id,
    asObject: true,
    ...(count ? { count } : {}),
    ...(chance ? { chance } : {}),
    ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
  }
}

/** 比较「UI 格子」与「规范化原值」是否语义相同（相同则保留原始 JSON 形态与数值类型） */
function cellMatches(orig: NormalizedValue | null, slot: SlotValue | null): boolean {
  if (!orig || !slot) return orig === null && slot === null
  if (orig.kind !== 'item' && orig.kind !== 'tag' && orig.kind !== 'fluid' && orig.kind !== 'registry') return false
  if (orig.kind !== slot.kind) return false
  if (orig.id !== slot.id) return false
  if (orig.kind === 'registry' && (orig.registry ?? '') !== (slot.registryType ?? '')) return false
  const origCount =
    orig.kind === 'item' || orig.kind === 'tag' ? orig.count?.raw : orig.kind === 'fluid' || orig.kind === 'registry' ? orig.amount?.raw : undefined
  const slotCount = orig.kind === 'fluid' || orig.kind === 'registry' ? slot.amount ?? slot.count : slot.count
  if (origCount === undefined ? slotCount !== undefined : slotCount === undefined || Number(origCount) !== slotCount) return false
  const origChance = orig.kind === 'item' || orig.kind === 'tag' ? orig.chance?.raw : undefined
  if (origChance === undefined ? slot.chance !== undefined : slot.chance === undefined || Number(origChance) !== slot.chance) return false
  const sameNbt =
    orig.nbt === undefined ? slot.nbt === undefined : slot.nbt !== undefined && JSON.stringify(orig.nbt) === JSON.stringify(slot.nbt)
  return sameNbt
}

/** 编辑引用时保留原条目里的 extras / NBT（UI 没有对应控件，不能因为改 id 就丢） */
function preserveHiddenRefFields(orig: NormalizedValue | null, next: NormalizedValue | null): NormalizedValue | null {
  if (!orig || !next || orig.kind !== next.kind) return next
  if (orig.kind !== 'item' && orig.kind !== 'tag' && orig.kind !== 'fluid' && orig.kind !== 'registry') return next
  const base = next as Record<string, unknown>
  if (orig.extras && Object.keys(orig.extras).length > 0) base['extras'] = orig.extras
  if (orig.nbt !== undefined && base['nbt'] === undefined) base['nbt'] = orig.nbt
  // 引用键形态（tag / fluidTag / gas…）是原始 JSON 的一部分，不能因为只改数量就换成默认 fluid
  if (orig.refKey !== undefined && base['refKey'] === undefined) base['refKey'] = orig.refKey
  if (orig.asObject === true) base['asObject'] = true
  return next
}

/** 把草稿里的脏字段写回规范化副本（只动脏字段，其余保持原值） */
export function applyDraftToNormalized(
  normalized: NormalizedRecipe,
  workbench: WorkbenchState,
  dirtyFields: readonly string[]
): NormalizedRecipe {
  if (dirtyFields.length === 0) return normalized
  const copy = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
  for (const key of dirtyFields) {
    // UI 产物列表键是 outputs；单产物草稿的规范化槽位可能叫 result
    const slot =
      copy.slots.find((s) => s.key === key) ?? (key === BENCH_OUTPUTS_KEY ? copy.slots.find((s) => s.key === 'result') : undefined)
    if (!slot) continue
    if (slot.key === BENCH_GRID_KEY) {
      const cells = Array.isArray(workbench.values[BENCH_GRID_KEY])
        ? (workbench.values[BENCH_GRID_KEY] as (SlotValue | null)[])
        : []
      const original = slot.value?.kind === 'list' ? slot.value.of : []
      slot.value = {
        kind: 'list',
        path: slot.path,
        of: cells.map((cell, i) =>
          cellMatches(original[i] ?? null, cell)
            ? original[i] ?? null
            : preserveHiddenRefFields(original[i] ?? null, slotToNormalized(cell))
        )
      }
      continue
    }
    if (slot.key === 'result') {
      const outputs = Array.isArray(workbench.values[BENCH_OUTPUTS_KEY])
        ? (workbench.values[BENCH_OUTPUTS_KEY] as SlotValue[])
        : []
      const own = Array.isArray(workbench.values[slot.key]) ? (workbench.values[slot.key] as SlotValue[]) : []
      const candidate = outputs[0] ?? own[0] ?? null
      slot.value = preserveHiddenRefFields(slot.value, slotToNormalized(candidate))
      continue
    }
    const listValue = workbench.values[key]
    if (Array.isArray(listValue)) {
      const original = slot.value?.kind === 'list' ? slot.value.of : []
      slot.value = {
        kind: 'list',
        path: slot.path,
        of: (listValue as SlotValue[]).map((cell, i) =>
          cellMatches(original[i] ?? null, cell)
            ? original[i] ?? null
            : preserveHiddenRefFields(original[i] ?? null, slotToNormalized(cell))
        )
      }
    }
  }
  return copy
}

/** 递归判断规范化值里是否含完全无法表达的引用（UI 没有可编辑形态） */
export function containsUnknownValue(value: NormalizedValue | null): boolean {
  if (!value) return false
  if (value.kind === 'unknown') return true
  if (value.kind === 'list') return value.of.some(containsUnknownValue)
  if (value.kind === 'struct') return Object.values(value.fields).some(containsUnknownValue)
  return false
}

/** 草稿是否存在阻止安全回写的引用（提交层必须独立再查一次） */
export function hasUnsafeUnknown(normalized: NormalizedRecipe): boolean {
  return normalized.slots.some((slot) => containsUnknownValue(slot.value))
}
