/**
 * 形态原语识别与配对字段合并（规格 3.6.12）。
 * 任何配方参数拆到底都是 9 种原语的组合；L1 反推只判「这个字段属于哪种原语」，
 * 完全不关心它来自哪个模组——这是通用表单能覆盖未知模组的原因。
 *
 * 配对合并是「通用表单」与「好用表单」的分水岭：`{base_ingredient, count}` 必须
 * 渲染成「物品槽 + 数量角标」，而不是一个物品槽旁一个孤零零的数字框。
 * 合并仅在两键**共现率 > PAIR_CO_OCCURRENCE_MIN(95%)** 时发生，合并后原键名存进
 * `compound`，生成 JSON 时能原样还原。
 */
import type { FieldKind } from '../../shared/types'
import { PAIR_CO_OCCURRENCE_MIN } from '../../shared/constants'
import { zoneForField } from './naming'

export type PrimitiveKind =
  | 'scalar'
  | 'reference'
  | 'reference_amount'
  | 'list'
  | 'struct'
  | 'nested'
  | 'modifier'
  | 'nbt'
  | 'blockstate'

export type ScalarShape = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'

/** L1 归纳出的中间事实：一个 JSON 路径在样本中的形态统计（infer.ts 产出，primitives 消费）。 */
export interface InducedField {
  key: string
  /** 完整路径，数组段以 `[]` 表示，如 `results[].base_ingredient` */
  path: string
  depth: number
  /** 参与归纳的样本总数（出现率分母） */
  samples: number
  /** 该路径出现的样本数 */
  occurrences: number
  /** 出现该路径的样本下标（用于共现率计算） */
  presence: number[]
  isArray: boolean
  /** 数组元素结构是否一致（一致才递归提取元素 schema） */
  elementUniform: boolean
  /** 对象 / 数组元素子字段 */
  children: InducedField[]
  shapeCounts: Record<ScalarShape, number>
  /** 观测到的字符串值（上限截断，用于 choice 枚举与数字串识别） */
  stringValues: string[]
  min: number | null
  max: number | null
  /** 观测到的引用包装键：item / tag / fluid / gas / block / id / slurry / pigment … */
  refKeys: string[]
  /** 对象自身含 `type` 字段（→ nested recipe）的样本数 */
  nestedCount: number
  /** `{item|tag, nbt}` 的样本数 */
  nbtCount: number
  /** `{block:{id, …属性}}` / `{id, …属性}` 方块状态形态的样本数 */
  blockstateCount: number
  /** 超过深度上限未展开 */
  truncated: boolean
}

/** 单个值的形态证据（对任意 JSON 值求值，不依赖任何模组知识）。 */
export interface ValueEvidence {
  shape: ScalarShape
  stringValue?: string
  numberValue?: number
  refKeys: string[]
  objectKeys: string[]
  nestedRecipe: boolean
  hasNbt: boolean
  blockstate: boolean
}

const REFERENCE_KEYS = ['item', 'tag', 'fluid', 'gas', 'block', 'id', 'slurry', 'pigment', 'infuse_type', 'ingredient', 'stack']
const QUANTITY_KEYS = ['count', 'amount', 'size']
const CHANCE_KEYS = ['chance', 'probability']
const ID_LIKE = /^[a-z0-9_.-]+:[a-z0-9_.\-/]+$/u

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumericString(text: string): boolean {
  if (ID_LIKE.test(text)) return false
  return text.trim().length > 0 && Number.isFinite(Number(text))
}

/** 值是否为「方块状态」形态：`{block:{id,…}}` 或 `{id, …属性}`（属性含数组/对象/范围）。 */
function looksBlockstate(obj: Record<string, unknown>): boolean {
  const block = obj.block
  if (isRecord(block) && typeof block.id === 'string') return true
  if (typeof block === 'string') return false
  if (typeof obj.id === 'string' && ID_LIKE.test(obj.id)) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'id' || k === 'keep' || k === 'item' || k === 'tag') continue
      if (Array.isArray(v) || isRecord(v) || typeof v === 'string' || typeof v === 'number') return true
    }
  }
  return false
}

/** 值是否为「带 NBT 约束的物品」：`{item|tag, nbt}`。 */
function looksNbt(obj: Record<string, unknown>): boolean {
  if (obj.nbt === undefined) return false
  return obj.item !== undefined || obj.tag !== undefined || typeof obj.id === 'string'
}

export function evidenceOfValue(value: unknown): ValueEvidence {
  if (value === null || value === undefined) return { shape: 'null', refKeys: [], objectKeys: [], nestedRecipe: false, hasNbt: false, blockstate: false }
  if (typeof value === 'string') return { shape: 'string', stringValue: value, refKeys: [], objectKeys: [], nestedRecipe: false, hasNbt: false, blockstate: false }
  if (typeof value === 'number') return { shape: 'number', numberValue: value, refKeys: [], objectKeys: [], nestedRecipe: false, hasNbt: false, blockstate: false }
  if (typeof value === 'boolean') return { shape: 'boolean', refKeys: [], objectKeys: [], nestedRecipe: false, hasNbt: false, blockstate: false }
  if (Array.isArray(value)) return { shape: 'array', refKeys: [], objectKeys: [], nestedRecipe: false, hasNbt: false, blockstate: false }
  if (!isRecord(value)) return { shape: 'null', refKeys: [], objectKeys: [], nestedRecipe: false, hasNbt: false, blockstate: false }
  const keys = Object.keys(value)
  const refKeys = keys.filter((k) => REFERENCE_KEYS.includes(k))
  return {
    shape: 'object',
    refKeys,
    objectKeys: keys,
    nestedRecipe: typeof value.type === 'string' && ID_LIKE.test(value.type),
    hasNbt: looksNbt(value),
    blockstate: !looksNbt(value) && looksBlockstate(value)
  }
}

/** 9 种原语判定（对归纳后的字段事实求值）。 */
export function classifyPrimitive(field: InducedField): PrimitiveKind {
  if (field.isArray) return 'list'
  if (field.nestedCount > 0 && field.nestedCount >= field.occurrences) return 'nested'
  if (field.blockstateCount > 0 && field.blockstateCount >= field.occurrences / 2) return 'blockstate'
  if (field.nbtCount > 0 && field.nbtCount >= field.occurrences / 2) return 'nbt'
  const innerMerges = planLevelMerge(field.children)
  if (field.refKeys.length > 0) return innerMerges.length > 0 ? 'reference_amount' : 'reference'
  if (field.shapeCounts.object > 0 && field.children.length > 0) {
    if (innerMerges.some((m) => m.absorbsWholeLevel)) return 'reference_amount'
    return 'struct'
  }
  if (field.depth === 0 && field.shapeCounts.object === 0 && field.shapeCounts.array === 0) {
    if (zoneForField(field.key) === 'extra') return 'modifier'
    return 'scalar'
  }
  if (field.shapeCounts.object > 0) return 'struct'
  return 'scalar'
}

/** 配对模式表（规格 3.6.12 表格，逐条对应）。 */
export interface PairPattern {
  name: string
  refKeys: readonly string[]
  quantKeys: readonly string[]
  /** 合并后承载的数量语义 */
  quant: 'count' | 'amount' | 'chance'
  kindHint: FieldKind
}

export const PAIR_PATTERNS: readonly PairPattern[] = [
  { name: '流体量', refKeys: ['fluid', 'fluidstack'], quantKeys: ['amount', 'mb'], quant: 'amount', kindHint: 'fluid' },
  { name: '计数物品', refKeys: ['item', 'ingredient', 'base_ingredient', 'result', 'output', 'stack'], quantKeys: ['count', 'size'], quant: 'count', kindHint: 'item' },
  { name: '概率物品', refKeys: ['item', 'output', 'result', 'byproduct', 'base_ingredient', 'ingredient'], quantKeys: ['chance', 'probability'], quant: 'chance', kindHint: 'item' },
  { name: '注册表量', refKeys: ['gas', 'slurry', 'pigment', 'infuse_type', 'infusion_type', 'input'], quantKeys: ['amount', 'count'], quant: 'amount', kindHint: 'registry' },
  { name: '带量标签', refKeys: ['tag'], quantKeys: ['amount', 'count', 'mb'], quant: 'amount', kindHint: 'tag' }
]

export function matchPairPattern(refKey: string, quantKey: string): PairPattern | null {
  const norm = (k: string): string => k.toLowerCase()
  for (const p of PAIR_PATTERNS) {
    if (p.refKeys.map(norm).includes(norm(refKey)) && p.quantKeys.map(norm).includes(norm(quantKey))) return p
  }
  return null
}

export interface PairMerge {
  /** 引用侧键名（合并后控件的主键） */
  refKey: string
  /** 数值侧键名（写进 compound 以便还原） */
  quantKey: string
  pattern: PairPattern
  coOccurrence: number
  /** 引用与数值同属一层且该层只有这一对 → 整层塌缩进父字段 */
  absorbsWholeLevel: boolean
  /** 父字段键（absorbsWholeLevel 时有值：塌缩后原键名顺序） */
  originalKeys: string[]
}

function jaccard(a: readonly number[], b: readonly number[]): number {
  const setB = new Set(b)
  let joint = 0
  for (const idx of a) if (setB.has(idx)) joint += 1
  const union = new Set([...a, ...b]).size
  if (union === 0) return 0
  return joint / union
}

/** 注册表 vs 标签：靠通用英文词根判定（infuse/gas/slurry/pigment/chemical），不查模组表。 */
export function registryKindOf(containerKey: string, refKey: string): FieldKind {
  const lower = `${containerKey} ${refKey}`.toLowerCase()
  if (lower.includes('fluid')) return 'fluid'
  if (/(gas|slurry|pigment|infus|chemical|slurrry)/u.test(lower)) return 'registry'
  if (refKey === 'tag') return 'tag'
  if (refKey === 'item' || refKey === 'id' || refKey === 'ingredient' || refKey === 'stack' || refKey === 'base_ingredient') return 'item'
  return 'registry'
}

/**
 * 在同一层子字段里规划配对合并。
 * 判据：键名命中模式表 **且** 共现率 > 95%（PAIR_CO_OCCURRENCE_MIN）；否则退回独立字数字段。
 */
export function planLevelMerge(siblings: readonly InducedField[]): PairMerge[] {
  const merges: PairMerge[] = []
  const used = new Set<string>()
  for (const ref of siblings) {
    if (used.has(ref.key) || ref.isArray) continue
    let chosen: PairMerge | null = null
    for (const sibling of siblings) {
      if (sibling.key === ref.key || used.has(sibling.key) || sibling.isArray) continue
      const pattern = matchPairPattern(ref.key, sibling.key)
      if (!pattern) continue
      if (!siblingHasQuantShape(sibling, pattern.quant)) continue
      const rate = jaccard(ref.presence, sibling.presence)
      if (rate <= PAIR_CO_OCCURRENCE_MIN) continue
      chosen = {
        refKey: ref.key,
        quantKey: sibling.key,
        pattern,
        coOccurrence: rate,
        absorbsWholeLevel: siblings.length === 2,
        originalKeys: [ref.key, sibling.key]
      }
      break
    }
    if (chosen) {
      used.add(chosen.refKey)
      used.add(chosen.quantKey)
      merges.push(chosen)
    }
  }
  return merges
}

function siblingHasQuantShape(field: InducedField, quant: 'count' | 'amount' | 'chance'): boolean {
  const numeric = field.shapeCounts.number + field.shapeCounts.string
  if (numeric === 0) return false
  if (field.shapeCounts.object + field.shapeCounts.array + field.shapeCounts.boolean > 0) return false
  if (quant !== 'chance') return true
  // 概率侧允许字符串数字（IP 蒸馏塔 `"0.07"`）
  return field.shapeCounts.number > 0 || field.stringValues.every((v) => Number.isFinite(Number(v)))
}

/** 合并后的槽位键名与还原信息（`compound` 存原始键名，供生成 JSON 还原）。 */
export function mergedSlotKeys(merge: PairMerge, containerKey: string): { key: string; compound: string[] } {
  if (merge.absorbsWholeLevel) {
    return { key: containerKey, compound: [merge.refKey, merge.quantKey] }
  }
  return { key: merge.refKey, compound: [merge.quantKey] }
}

/** 引用与数量在 JSON 里的「包装键」：合并/塌缩后不再作为独立子字段渲染。 */
export function isWrapperKey(key: string): boolean {
  const lower = key.toLowerCase()
  return REFERENCE_KEYS.includes(lower) || QUANTITY_KEYS.includes(lower) || CHANCE_KEYS.includes(lower) || lower === 'nbt' || lower === 'keep' || lower === 'drops'
}

/** 命名槽位若为 top/middle/bottom，语义是垂直的（AE2 压印器机身三格），必须竖向排布（§3.6.17 坑 1）。 */
export function orientationForLevel(keys: readonly string[]): 'vertical' | undefined {
  const lower = keys.map((k) => k.toLowerCase())
  if (lower.some((k) => k === 'top' || k === 'bottom' || k === 'middle')) return 'vertical'
  return undefined
}

/** 值是否全部为形如 `ns:id` 的字符串（用于纯引用标量）。 */
export function allIdStrings(values: readonly string[]): boolean {
  return values.length > 0 && values.every((v) => ID_LIKE.test(v))
}

export function isIdLike(value: string): boolean {
  return ID_LIKE.test(value)
}

export function isNumericStringOnly(values: readonly string[]): boolean {
  return values.length > 0 && values.every(isNumericString)
}

export const QUANTITY_KEY_SET = QUANTITY_KEYS
export const CHANCE_KEY_SET = CHANCE_KEYS
