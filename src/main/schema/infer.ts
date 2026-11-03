/**
 * L1 反推引擎（规格 3.6.4 九步）：① 分组 → ② 采样 min(50,n) 优先 partial=false → ③ 惰性读完整 JSON →
 * ④ 递归归纳（深度 ≤3，出现次数/类型/数组一致性）→ ⑤ 出现率筛 → ⑥ 值形状判类型 → ⑦ 数组与元素递归 →
 * ⑧ 语义命名 → ⑨ 产出 `source:'inferred'` + sampleCount。**只做字段结构，不生成默认值。**
 * 样本全部读不出结构时 schema=null，由编排层退到 L3 通用模式并记 WARN。
 */
import type { FieldKind, RecipeRecord, RecipeSlotSchema, RecipeTypeSchema } from '../../shared/types'
import { INFER_FIELD_MIN_RATE, INFER_LOW_CONFIDENCE_SAMPLES, INFER_MAX_DEPTH, INFER_SAMPLE_LIMIT } from '../../shared/constants'
import { choicesFromValues, displayNameForField, modDisplayName, roleForField, zoneForField, type NamingContext } from './naming'
import { classifyPrimitive, evidenceOfValue, isNumericStringOnly, isWrapperKey, orientationForLevel, planLevelMerge, registryKindOf, type InducedField, type PairMerge } from './primitives'

/** 配方样本源：由 scanSchemas 用 recipeIndex + lazy 适配（配方模块的唯一调用点）。 */
export interface RecipeSampleSource {
  typeUniverse(): string[]
  recordsByType(type: string, limit: number): RecipeRecord[]
  readFull(record: RecipeRecord): Promise<{ json: unknown; sourcePath: string }>
}

export interface InferResult {
  typeId: string
  schema: RecipeTypeSchema | null
  /** 该 type 分组内的配方条数 */
  groupSize: number
  /** 成功读取并参与归纳的样本数（= schema.sampleCount） */
  sampleCount: number
  droppedFields: string[]
  failure?: string
}

export interface InferOptions { sampleLimit?: number; naming?: NamingContext; concurrency?: number }

type ShapeTable = Record<'string' | 'number' | 'boolean' | 'object' | 'array' | 'null', number>

/** 步骤 ④：按 JSON 路径累积形态事实，桶路径数组段以 `[]` 表示（`results[].count`）。 */
class Inducer {
  private readonly buckets = new Map<string, InducedField>()
  private readonly parentOf = new Map<string, string>()
  private readonly signatures = new Map<string, Set<string>>()

  constructor(private readonly samples: number) {}

  private field(key: string, path: string, depth: number, parentPath: string): InducedField {
    const existing = this.buckets.get(path)
    if (existing) return existing
    const shapes: ShapeTable = { string: 0, number: 0, boolean: 0, object: 0, array: 0, null: 0 }
    const f: InducedField = { key, path, depth, samples: this.samples, occurrences: 0, presence: [], isArray: false, elementUniform: true, children: [], shapeCounts: shapes, stringValues: [], min: null, max: null, refKeys: [], nestedCount: 0, nbtCount: 0, blockstateCount: 0, truncated: false }
    this.buckets.set(path, f)
    this.parentOf.set(path, parentPath)
    return f
  }

  walk(key: string, path: string, parentPath: string, depth: number, index: number, value: unknown): void {
    const f = this.field(key, path, depth, parentPath)
    if (!f.presence.includes(index)) {
      f.presence.push(index)
      f.occurrences += 1
    }
    const sig = Array.isArray(value) ? 'array' : value === null || typeof value !== 'object' ? typeof value : `obj:${Object.keys(value).sort().join(',')}`
    const sigs = this.signatures.get(path) ?? new Set<string>()
    sigs.add(sig)
    this.signatures.set(path, sigs)
    const ev = evidenceOfValue(value)
    f.shapeCounts[ev.shape] += 1
    if (ev.shape === 'array') f.isArray = true
    for (const k of ev.refKeys) if (!f.refKeys.includes(k)) f.refKeys.push(k)
    if (ev.nestedRecipe) f.nestedCount += 1
    if (ev.hasNbt) f.nbtCount += 1
    if (ev.blockstate) f.blockstateCount += 1
    if (ev.shape === 'string' && ev.stringValue !== undefined && f.stringValues.length < 32 && !f.stringValues.includes(ev.stringValue)) f.stringValues.push(ev.stringValue)
    if (ev.shape === 'number' && ev.numberValue !== undefined) {
      f.min = f.min === null ? ev.numberValue : Math.min(f.min, ev.numberValue)
      f.max = f.max === null ? ev.numberValue : Math.max(f.max, ev.numberValue)
    }
    if (depth >= INFER_MAX_DEPTH) {
      f.truncated = true
      return
    }
    if (Array.isArray(value)) {
      const elementPath = `${path}[]`
      this.field(key, elementPath, depth, path)
      for (const el of value) this.walk(key, elementPath, path, depth, index, el)
      return
    }
    if (ev.shape === 'object' && typeof value === 'object' && value !== null) {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) this.walk(childKey, `${path}.${childKey}`, path, depth + 1, index, childValue)
    }
  }

  /** 路径桶 → 字段树（元素桶 `x[]` 作为 `x` 的结构层）。 */
  tree(): InducedField[] {
    const roots: InducedField[] = []
    for (const [path, f] of this.buckets) {
      f.elementUniform = (this.signatures.get(path)?.size ?? 1) <= 1
      f.children = []
    }
    for (const [path, f] of this.buckets) {
      const parentPath = this.parentOf.get(path) ?? ''
      const parent = parentPath && parentPath !== path ? this.buckets.get(parentPath) : undefined
      if (parent) parent.children.push(f)
      else if (parentPath === '') roots.push(f)
    }
    for (const f of this.buckets.values()) f.children.sort((a, b) => a.key.localeCompare(b.key))
    return roots
  }
}

/** 步骤 ⑦：数组字段用元素桶代表其结构层。 */
const levelOf = (f: InducedField): InducedField => f.children.find((c) => c.path.endsWith('[]')) ?? f
const rateOf = (f: InducedField): number => (f.samples > 0 ? f.occurrences / f.samples : 0)
const structuralSiblings = (f: InducedField): InducedField[] => levelOf(f).children.filter((c) => !c.path.endsWith('[]'))
const splitType = (typeId: string): { ns: string; path: string } => {
  const i = typeId.indexOf(':')
  return i < 0 ? { ns: typeId, path: typeId } : { ns: typeId.slice(0, i), path: typeId.slice(i + 1) }
}

/** 步骤 ⑥：值形状优先于 JSON 类型（choice 枚举、number 记 min/max、混合类型 unknown）。 */
function kindForField(f: InducedField): FieldKind {
  const g = levelOf(f)
  const primitive = classifyPrimitive(g)
  if (primitive === 'nested') return 'struct'
  if (primitive === 'blockstate') return 'blockstate'
  if (primitive === 'nbt') return 'nbt'
  if (primitive === 'reference' || primitive === 'reference_amount') return registryKindOf(f.key, g.refKeys[0] ?? 'item')
  if (primitive === 'struct') return 'struct'
  const c = g.shapeCounts
  if (c.string + c.number + c.boolean > 0 && c.object + c.array > 0) return 'unknown'
  if (c.boolean > 0 && c.number + c.string === 0) return 'boolean'
  if (c.number > 0) return 'number'
  if (c.string > 0) {
    if (isNumericStringOnly(g.stringValues)) return 'number'
    return g.stringValues.length > 0 && g.stringValues.length <= 20 ? 'choice' : 'text'
  }
  return c.object > 0 ? 'struct' : 'unknown'
}

function descriptionOf(f: InducedField): string | undefined {
  const parts: string[] = []
  if (classifyPrimitive(levelOf(f)) === 'nested') parts.push('嵌套子配方（对象自身含 type 字段）→ 序列步骤编辑器')
  if (f.truncated) parts.push(`嵌套深度超过 ${INFER_MAX_DEPTH}，未展开`)
  if (f.stringValues.length > 0 && f.stringValues.every((v) => Number.isFinite(Number(v)))) parts.push('样本中为字符串数值（如 "0.07"），还原 JSON 需转回字符串')
  if (f.elementUniform === false) parts.push('数组元素结构不一致，建议降级 JSON 编辑')
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function baseSlot(f: InducedField, ctx: NamingContext): RecipeSlotSchema {
  const kind = kindForField(f)
  const rate = rateOf(f)
  const slot: RecipeSlotSchema = {
    key: f.key, displayName: displayNameForField(f.key, ctx), kind, multiple: f.isArray, required: rate >= 1,
    occurrenceRate: Math.round(rate * 1000) / 1000, zone: zoneForField(f.key), role: roleForField(f.key, kind)
  }
  if (kind === 'number' && f.min !== null && f.max !== null) Object.assign(slot, { min: f.min, max: f.max })
  if (kind === 'choice' && levelOf(f).stringValues.length > 0) slot.choices = choicesFromValues(levelOf(f).stringValues, ctx)
  const description = descriptionOf(f)
  if (description) slot.description = description
  return slot
}

/** 配对合并产物：引用槽吸收数量槽，原键名存进 `compound` 以便还原（规格 3.6.12）。 */
function pairSlot(container: InducedField, merge: PairMerge, ctx: NamingContext): RecipeSlotSchema {
  const refChild = container.children.find((c) => c.key === merge.refKey)
  const quantChild = container.children.find((c) => c.key === merge.quantKey)
  const host = refChild ?? container
  const key = merge.absorbsWholeLevel ? container.key : merge.refKey
  const kind = registryKindOf(key, levelOf(host).refKeys[0] ?? merge.refKey)
  const notes = [`配对合并（${merge.pattern.name}，共现 ${(merge.coOccurrence * 100).toFixed(0)}%）`]
  if (quantChild && quantChild.shapeCounts.string > 0 && quantChild.shapeCounts.number === 0) notes.push('数值侧在样本中是字符串（如 "0.07"），还原 JSON 需转回字符串')
  const extra = descriptionOf(host)
  if (extra) notes.push(extra)
  return {
    ...baseSlot(host, ctx), key, displayName: displayNameForField(key, ctx), kind,
    zone: zoneForField(key), role: roleForField(key, kind), multiple: container.isArray,
    required: rateOf(container) >= 1, occurrenceRate: Math.round(Math.min(rateOf(container), rateOf(host)) * 1000) / 1000,
    compound: merge.absorbsWholeLevel ? [merge.refKey, merge.quantKey] : [merge.quantKey],
    emitShape: 'object', description: notes.join(' · ')
  }
}

/** 需要继续渲染成分组表单的子字段（包装键已被引用槽 / 配对吸收）。 */
function structuralChildren(f: InducedField, kind: FieldKind): InducedField[] {
  const children = levelOf(f).children.filter((c) => !c.path.endsWith('[]'))
  if (kind === 'struct') return children
  if (kind === 'blockstate') return children.filter((c) => c.key !== 'id' && c.key !== 'keep')
  if (kind === 'nbt') return []
  return children.filter((c) => !isWrapperKey(c.key))
}

/** 步骤 ⑤⑦ + 配对合并：一层子字段 → 槽位（出现率 <10% 丢弃并记录）。 */
function buildSlots(siblings: InducedField[], ctx: NamingContext, dropped: string[]): RecipeSlotSchema[] {
  const merges = planLevelMerge(siblings)
  const byRef = new Map(merges.map((m) => [m.refKey, m]))
  const consumed = new Set(merges.map((m) => m.quantKey))
  const out: RecipeSlotSchema[] = []
  for (const f of siblings) {
    if (f.key === 'type' && f.depth === 0) continue
    if (rateOf(f) < INFER_FIELD_MIN_RATE) {
      dropped.push(f.path)
      continue
    }
    if (consumed.has(f.key)) continue
    const merge = byRef.get(f.key)
    if (merge) {
      out.push(pairSlot(f, merge, ctx))
      continue
    }
    const children = structuralSiblings(f)
    const inner = planLevelMerge(children)
    if (children.length === 2 && inner.length === 1 && inner[0].absorbsWholeLevel && kindForField(f) !== 'struct') {
      out.push(pairSlot(f, inner[0], ctx))
      continue
    }
    const slot = baseSlot(f, ctx)
    const structural = structuralChildren(f, slot.kind)
    if (structural.length > 0) {
      slot.fields = buildSlots(structural, ctx, dropped)
      const vertical = orientationForLevel(structural.map((c) => c.key))
      if (vertical) slot.orientation = vertical
    }
    out.push(slot)
  }
  return out
}

function layoutFor(slots: readonly RecipeSlotSchema[], roots: readonly InducedField[]): RecipeTypeSchema['layoutKind'] {
  const keys = new Set(roots.map((f) => f.key))
  if (keys.has('pattern') && (keys.has('key') || keys.has('keys'))) return 'shaped'
  if (roots.some((f) => classifyPrimitive(levelOf(f)) === 'nested')) return 'sequence'
  const refs = slots.filter((s) => ['item', 'fluid', 'tag', 'registry', 'blockstate', 'nbt'].includes(s.kind))
  return refs.length <= 1 ? 'single_io' : 'multi_io'
}

/** 步骤 ①②③⑨：单个 type 的完整反推。 */
export async function inferSchemaForType(typeId: string, source: RecipeSampleSource, options: InferOptions = {}): Promise<InferResult> {
  const limit = Math.max(1, options.sampleLimit ?? INFER_SAMPLE_LIMIT)
  const ctx = options.naming ?? {}
  const records = source.recordsByType(typeId, limit * 4)
  if (records.length === 0) return { typeId, schema: null, groupSize: 0, sampleCount: 0, droppedFields: [], failure: '无样本' }
  const picked = pickSamples(records, limit)
  const inducer = new Inducer(picked.length)
  let readOk = 0
  let cursor = 0
  const consume = async (index: number): Promise<void> => {
    try {
      const full = await source.readFull(picked[index])
      readOk += 1
      if (full.json && typeof full.json === 'object' && !Array.isArray(full.json)) {
        for (const [key, value] of Object.entries(full.json as Record<string, unknown>)) if (key !== 'type') inducer.walk(key, key, '', 0, index, value)
      }
    } catch {
      /* 单条读失败不影响其余样本（规格第六章） */
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, options.concurrency ?? 4), picked.length) }, async () => {
    while (cursor < picked.length) await consume(cursor++)
  }))
  if (readOk === 0) return { typeId, schema: null, groupSize: records.length, sampleCount: 0, droppedFields: [], failure: '样本 JSON 全部无法读取' }
  const roots = inducer.tree()
  const dropped: string[] = []
  const all = buildSlots(roots, ctx, dropped)
  if (all.length === 0) return { typeId, schema: null, groupSize: records.length, sampleCount: readOk, droppedFields: dropped, failure: '样本结构无法归纳' }
  const { ns, path } = splitType(typeId)
  const modName = modDisplayName(ns, ctx)
  const schema: RecipeTypeSchema = {
    id: typeId, displayName: `${modName} · ${displayNameForField(path, ctx)}`, modId: ns, modDisplayName: modName,
    source: 'inferred', sampleCount: readOk, lowConfidence: readOk < INFER_LOW_CONFIDENCE_SAMPLES,
    layoutKind: layoutFor(all, roots), emitTarget: null, customTemplate: { type: typeId },
    slots: all.filter((s) => s.zone !== 'output'), outputs: all.filter((s) => s.zone === 'output'),
    supportsChance: all.some((s) => (s.compound ?? []).includes('chance') || s.key === 'chance'),
    channel: 'datapack-json', capability: 'compatible',
    capabilityNote: `基于 ${readOk} 个真实配方归纳（字段与结构来自本包样本实测）`
  }
  return { typeId, schema, groupSize: records.length, sampleCount: readOk, droppedFields: dropped }
}

/** 步骤 ②：优先 partial=false 的样本，凑满 min(50,n)。 */
export function pickSamples(records: readonly RecipeRecord[], limit: number): RecipeRecord[] {
  const complete = records.filter((r) => !r.partial)
  return [...complete, ...records.filter((r) => r.partial)].slice(0, Math.max(1, limit))
}

/** 步骤 ①：按 type 全局分组（绝不按模组分组，否则同类型字段集被割裂，规格 3.6.5 ①）。 */
export function groupByType(records: readonly RecipeRecord[]): Map<string, RecipeRecord[]> {
  const map = new Map<string, RecipeRecord[]>()
  for (const rec of records) {
    if (!rec.type) continue
    map.set(rec.type, [...(map.get(rec.type) ?? []), rec])
  }
  return map
}

/** 步骤 ①→⑨ 批处理：逐类型归纳，样本读完即释放，绝不整包常驻内存（禁止事项 10）。 */
export async function inferAll(source: RecipeSampleSource, types: readonly string[], onProgress?: (done: number, total: number, typeId: string) => void, options: InferOptions = {}): Promise<InferResult[]> {
  const out: InferResult[] = []
  for (let i = 0; i < types.length; i += 1) {
    out.push(await inferSchemaForType(types[i], source, options))
    onProgress?.(i + 1, types.length, types[i])
  }
  return out
}
