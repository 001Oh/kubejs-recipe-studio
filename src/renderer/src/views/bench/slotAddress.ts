/**
 * 槽位地址编码 + 落点决策（规格 3.4 交互规范表）。
 * 地址只描述「值存在通用字典的哪里」，不含任何配方类型信息，因此 shaped / list / custom / sequence
 * 步骤共用同一套落点逻辑；纯函数，可单测。
 */
import type { BenchValues, RecipeTypeSchema, SequenceStep, SlotValue, WorkbenchState } from '@shared/types'
import { GRID_KEY, INPUTS_KEY, OUTPUTS_KEY } from '../../store/benchStore'
import { allFieldsFlat, declaredFields, zoneOf, type Zone } from './fieldModel'
import type { FieldKind } from '@shared/types'

export type SlotAddress =
  | { kind: 'grid'; index: number }
  | { kind: 'value'; key: string }
  | { kind: 'list'; key: string; index: number }
  | { kind: 'append'; key: string }
  | { kind: 'surface' }
  | { kind: 'step'; step: number; inner: SlotAddress }

export type DropOp =
  | { op: 'gridSet'; index: number; value: SlotValue | null }
  | { op: 'valueSet'; key: string; value: SlotValue | null }
  | { op: 'listSet'; key: string; index: number; value: SlotValue }
  | { op: 'listInsert'; key: string; index: number; value: SlotValue }
  | { op: 'listRemove'; key: string; index: number }
  | { op: 'step'; step: number; ops: DropOp[] }

export type ZoneResolver = (key: string) => Zone
export type KindResolver = (key: string) => FieldKind | null

/** 字段键 → kind（blockstate 的落点要还原成 `{block, properties}` 形态） */
export function makeKindResolver(schema: RecipeTypeSchema | null): KindResolver {
  const map = new Map<string, FieldKind>()
  for (const field of allFieldsFlat(schema)) map.set(field.key, field.kind)
  return (key: string): FieldKind | null => {
    const direct = map.get(key)
    if (direct) return direct
    const dot = key.indexOf('.')
    return dot > 0 ? map.get(key.slice(0, dot)) ?? null : null
  }
}

/** 字段键 → 视觉区；struct 子键回退到父字段（'gas_input.amount' → 'gas_input'） */
export function makeZoneResolver(schema: RecipeTypeSchema | null): ZoneResolver {
  const map = new Map<string, Zone>()
  for (const field of declaredFields(schema)) map.set(field.key, zoneOf(field))
  map.set(GRID_KEY, 'input')
  map.set(INPUTS_KEY, 'input')
  map.set(OUTPUTS_KEY, 'output')
  return (key: string): Zone => {
    const direct = map.get(key)
    if (direct) return direct
    const dot = key.indexOf('.')
    return dot > 0 ? (map.get(key.slice(0, dot)) ?? 'extra') : 'extra'
  }
}

export function encodeSlot(addr: SlotAddress): string {
  switch (addr.kind) {
    case 'grid':
      return `grid:${addr.index}`
    case 'value':
      return `value:${addr.key}`
    case 'list':
      return `list:${addr.key}:${addr.index}`
    case 'append':
      return `append:${addr.key}`
    case 'surface':
      return 'surface'
    case 'step':
      return `step:${addr.step}:${encodeSlot(addr.inner)}`
  }
}

/** 反解析：非法输入返回 null，调用方忽略事件即可（拖拽 id 可能来自其它视图） */
export function decodeSlot(id: string): SlotAddress | null {
  if (id === 'surface') return { kind: 'surface' }
  const first = id.indexOf(':')
  if (first <= 0) return null
  const head = id.slice(0, first)
  const rest = id.slice(first + 1)
  if (head === 'grid') {
    const index = Number.parseInt(rest, 10)
    return Number.isInteger(index) && index >= 0 ? { kind: 'grid', index } : null
  }
  if (head === 'value') return rest ? { kind: 'value', key: rest } : null
  if (head === 'append') return rest ? { kind: 'append', key: rest } : null
  if (head === 'list') {
    const last = rest.lastIndexOf(':')
    if (last <= 0) return null
    const index = Number.parseInt(rest.slice(last + 1), 10)
    return Number.isInteger(index) && index >= 0 ? { kind: 'list', key: rest.slice(0, last), index } : null
  }
  if (head === 'step') {
    const second = rest.indexOf(':')
    if (second <= 0) return null
    const step = Number.parseInt(rest.slice(0, second), 10)
    const inner = decodeSlot(rest.slice(second + 1))
    return Number.isInteger(step) && step >= 0 && inner ? { kind: 'step', step, inner } : null
  }
  return null
}

function asList(value: BenchValues[string] | undefined): (SlotValue | null)[] {
  return Array.isArray(value) ? (value as (SlotValue | null)[]) : []
}

/** 取字典里的值：支持 `parent.child` 形式的 struct 子键（嵌套对象，不拍平） */
export function pickValue(values: BenchValues, key: string): BenchValues[string] {
  if (!key.includes('.')) return values[key]
  let cursor: unknown = values
  for (const part of key.split('.')) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor as BenchValues[string]
}

/** 写值：沿 `parent.child` 路径做不可变更新，中间对象缺失时补壳 */
export function withValue(values: BenchValues, key: string, value: BenchValues[string]): BenchValues {
  if (!key.includes('.')) return { ...values, [key]: value }
  const parts = key.split('.')
  const head = parts[0] as string
  const rest = parts.slice(1).join('.')
  const child = (values[head] ?? {}) as BenchValues
  return { ...values, [head]: withValue(child, rest, value) }
}

function asSlot(value: BenchValues[string] | undefined): SlotValue | null {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'id' in (value as object)) {
    return value as SlotValue
  }
  return null
}

function stepList(values: BenchValues): SequenceStep[] {
  const raw = values['steps']
  return Array.isArray(raw) ? [...(raw as SequenceStep[])] : []
}

export function stepsOf(bench: WorkbenchState): SequenceStep[] {
  return stepList(bench.values)
}

/** 取该地址所在作用域的值字典（顶层 bench.values，或某个序列步骤的 values） */
export function scopeValues(bench: WorkbenchState, addr: SlotAddress): BenchValues {
  if (addr.kind === 'step') return stepsOf(bench)[addr.step]?.values ?? {}
  return bench.values
}

/** 读一个地址当前值；空槽返回 null */
export function readSlot(bench: WorkbenchState, addr: SlotAddress): SlotValue | null {
  if (addr.kind === 'surface' || addr.kind === 'append') return null
  const values = scopeValues(bench, addr)
  if (addr.kind === 'grid') return asList(pickValue(values, GRID_KEY))[addr.index] ?? null
  if (addr.kind === 'step') return readSlot(bench, addr.inner)
  if (addr.kind === 'list') return asList(pickValue(values, addr.key))[addr.index] ?? null
  return asSlot(pickValue(values, addr.key))
}

function gridCells(values: BenchValues, rows: number, cols: number): (SlotValue | null)[] {
  const cells = asList(pickValue(values, GRID_KEY))
  if (cells.length === rows * cols) return cells
  const sized: (SlotValue | null)[] = new Array(rows * cols).fill(null)
  for (let i = 0; i < Math.min(cells.length, sized.length); i++) sized[i] = cells[i] ?? null
  return sized
}

/** 第一个空材料格 / 第一个空材料槽（拖到工作台空白区时自动填入） */
export function firstEmptyMaterial(bench: WorkbenchState, resolveZone: ZoneResolver): SlotAddress {
  const rows = bench.gridRows ?? 3
  const cols = bench.gridCols ?? 3
  if (Array.isArray(bench.values[GRID_KEY]) && rows * cols > 0) {
    const cells = gridCells(bench.values, rows, cols)
    const idx = cells.findIndex((cell) => !cell || !cell.id)
    if (idx >= 0) return { kind: 'grid', index: idx }
  }
  const listKeys = Object.keys(bench.values).filter(
    (key) =>
      key !== GRID_KEY &&
      key !== OUTPUTS_KEY &&
      Array.isArray(bench.values[key]) &&
      (resolveZone(key) === 'input' || key === INPUTS_KEY)
  )
  return { kind: 'append', key: listKeys[0] ?? INPUTS_KEY }
}

export interface DropContext {
  bench: WorkbenchState
  resolveZone: ZoneResolver
}

export interface DropOptions {
  /** Alt/Shift 拖拽 = 插入到该位置并把后面的元素后移 */
  insert: boolean
  /** 拖拽来源槽位（槽位之间 = 交换） */
  source: SlotAddress | null
}

/** 落点决策：返回一批对字典的原子修改（顶层作用域） */
export function planDrop(target: SlotAddress, incoming: SlotValue, ctx: DropContext, opts: DropOptions): DropOp[] {
  const { bench } = ctx
  if (target.kind === 'surface') return planDrop(firstEmptyMaterial(bench, ctx.resolveZone), incoming, ctx, opts)

  if (target.kind === 'step') {
    const stepValues = stepsOf(bench)[target.step]?.values ?? {}
    const scoped: DropContext = { bench: { ...bench, values: stepValues }, resolveZone: ctx.resolveZone }
    const inner =
      opts.source && opts.source.kind === 'step' && opts.source.step === target.step ? opts.source.inner : null
    const ops = planDropInner(target.inner, incoming, scoped, { ...opts, source: inner })
    return ops.length > 0 ? [{ op: 'step', step: target.step, ops }] : []
  }

  return planDropInner(target, incoming, ctx, opts)
}

/** 同一作用域判定：同一列表 / 同一网格 / 两个单槽，才做交换而不是覆盖 */
function scopeKey(addr: SlotAddress): string {
  if (addr.kind === 'list' || addr.kind === 'append') return `list:${addr.key}`
  if (addr.kind === 'grid') return 'grid'
  if (addr.kind === 'value') return `value:${addr.key}`
  if (addr.kind === 'step') return `step:${addr.step}|${scopeKey(addr.inner)}`
  return 'surface'
}

function swappable(source: SlotAddress, target: SlotAddress): boolean {
  if (target.kind === 'append' || target.kind === 'surface') return false
  if (source.kind === 'value' && target.kind === 'value') return source.key !== target.key
  return scopeKey(source) === scopeKey(target)
}

function planDropInner(target: SlotAddress, incoming: SlotValue, ctx: DropContext, opts: DropOptions): DropOp[] {
  const { bench } = ctx
  if (target.kind === 'surface' || target.kind === 'step') return []

  const source = opts.source
  if (source && !opts.insert && swappable(source, target)) {
    if (source.kind === 'grid' && target.kind === 'grid' && source.index === target.index) return []
    if (source.kind === 'list' && target.kind === 'list' && source.index === target.index) return []
    const old = readSlot(bench, source)
    return [...writeToSlot(target, old ?? incoming, bench), ...writeToSlot(source, incoming, bench)]
  }

  if (target.kind === 'grid') return [{ op: 'gridSet', index: target.index, value: incoming }]
  if (target.kind === 'append') return [{ op: 'listInsert', key: target.key, index: -1, value: incoming }]
  if (target.kind === 'list') {
    const current = asList(scopeValues(bench, target)[target.key])[target.index]
    if (opts.insert || !current || !current.id) {
      return [{ op: 'listInsert', key: target.key, index: target.index, value: incoming }]
    }
    return [{ op: 'listSet', key: target.key, index: target.index, value: incoming }]
  }
  return writeToSlot(target, incoming, bench)
}

/** 把「写入某个地址」换算成 ops（列表越界时自动插入而不是丢弃） */
export function writeToSlot(addr: SlotAddress, value: SlotValue, bench: WorkbenchState): DropOp[] {
  if (addr.kind === 'grid') return [{ op: 'gridSet', index: addr.index, value }]
  if (addr.kind === 'value') return [{ op: 'valueSet', key: addr.key, value }]
  if (addr.kind === 'append') return [{ op: 'listInsert', key: addr.key, index: -1, value }]
  if (addr.kind === 'step') return [{ op: 'step', step: addr.step, ops: writeToSlot(addr.inner, value, bench) }]
  if (addr.kind === 'list') {
    const current = asList(scopeValues(bench, addr)[addr.key])[addr.index]
    return current
      ? [{ op: 'listSet', key: addr.key, index: addr.index, value }]
      : [{ op: 'listInsert', key: addr.key, index: addr.index, value }]
  }
  return []
}

/** 清空一个槽位 */
export function clearOps(addr: SlotAddress): DropOp[] {
  if (addr.kind === 'grid') return [{ op: 'gridSet', index: addr.index, value: null }]
  if (addr.kind === 'value') return [{ op: 'valueSet', key: addr.key, value: null }]
  if (addr.kind === 'list') return [{ op: 'listRemove', key: addr.key, index: addr.index }]
  if (addr.kind === 'step') return [{ op: 'step', step: addr.step, ops: clearOps(addr.inner) }]
  return []
}

/** 数量 ±n：物品/标签用 count，流体/注册表用 amount；夹到 [1, max] */
export function countValue(value: SlotValue, delta: number, max = 9999): SlotValue {
  if (value.kind === 'fluid' || value.kind === 'registry') {
    return { ...value, amount: Math.min(max, Math.max(1, (value.amount ?? 1) + delta)) }
  }
  return { ...value, count: Math.min(max, Math.max(1, (value.count ?? 1) + delta)) }
}

/** 把 ops 应用到某个作用域的字典，返回新字典（纯函数，撤销/重做仍由 benchStore 快照负责） */
export function applyOps(values: BenchValues, ops: DropOp[], rows: number, cols: number): BenchValues {
  let out: BenchValues = { ...values }
  for (const item of ops) {
    if (item.op === 'gridSet') {
      // 必须复制：gridCells 可能直接返回 store 里的原数组，原地改会绕过「是否变化」判断与撤销快照
      const cells = [...gridCells(out, rows, cols)]
      cells[item.index] = item.value
      out = { ...out, [GRID_KEY]: cells }
      continue
    }
    if (item.op === 'valueSet') {
      out = withValue(out, item.key, item.value)
      continue
    }
    if (item.op === 'step') {
      const steps = stepList(out)
      const target = steps[item.step]
      if (!target) continue
      steps[item.step] = { ...target, values: applyOps(target.values, item.ops, rows, cols) }
      out = { ...out, steps }
      continue
    }
    const list = [...asList(pickValue(out, item.key))]
    if (item.op === 'listSet') list[item.index] = item.value
    else if (item.op === 'listRemove') list.splice(item.index, 1)
    else list.splice(item.index < 0 ? list.length : item.index, 0, item.value)
    out = withValue(out, item.key, list)
  }
  return out
}
