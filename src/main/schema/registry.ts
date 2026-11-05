/**
 * Schema 注册表：`Map<typeId, RecipeTypeSchema>` + 层合并（规格 3.6.3 / 3.6.14 优先级）。
 *
 *   用户钉住（customTypesFile）> 插件 > builtin（试点 3 类型）> jar/ProbeJS > 反推
 *
 * **接线现状（2026-11-06 D-49 复核后更新）**：
 * - 实际有数据源的层：pinned（schema:pin 落盘）、plugin（插件通道）、builtin（`PILOT_SCHEMAS`
 *   8 个原版家族）、l0（`src/data/recipeTypes/`，包内容驱动激活）、inferred（扫描收敛点后台构建）；
 * - jar/ProbeJS 层无生产写入方（`classParser.ts` 已随 D-49 删除；ProbeJS 走文本提取 `probeImport`）；
 * - `schemaValidate.ts` **封存**（独立能力：标量槽 constraints enum/integer/min/max、minItems/maxItems、
 *   mustBe、引用 ID 形态——四个校验器中独有，且 L0 声明已开始产生 constraints 输入；
 *   接线条件：产品化「L0 标量约束强制」时在 commit/preview 链调用 `validateNormalized`）；
 * - `schemaMigrate.ts` 已删除（四处 userData 均无历史钉住数据；现行落盘格式即裸数组，
 *   `loadPinned` 直读的就是它，v2 容器是从未启用的设计）；
 * - 渲染层通用 schema 编辑器（layouts/controls/panels 大部分文件）未挂载，
 *   运行时只有试点编辑器 + 通用兜底。详见 README「已实现 / 已接线 / 预留未接线」。
 *
 * 合并**不是后者覆盖前者**：以最高优先层为骨架，低优先层只做字段校验与补全 ——
 * 出现率 ≥10% 而骨架没有的字段追加为可选并标「整合包实测字段」；骨架有而样本里
 * 从未出现的字段降级进 `extraFields`（高级区）。每个 schema 全程携带 source 与 sampleCount。
 * 绝不按模组写专属分支：层与层之间只按 typeId 对齐。
 */
import type { RecipeSlotSchema, RecipeTypeSchema, SchemaSource } from '../../shared/types'
import type { SchemaSummary } from '../../shared/ipc'
import { INFER_FIELD_MIN_RATE, INFER_LOW_CONFIDENCE_SAMPLES } from '../../shared/constants'
import { recipeTypeNameZh } from '../../shared/recipeTypeNames'
import { customTypesFile } from '../paths'
import { readJson, writeJson } from '../cache'
import { logger } from '../logger'
import { decideForSchema, type CapabilityFacts } from './capability'
import { displayNameForField } from './naming'

export type SchemaLayer = 'plugin' | 'builtin' | 'l0' | 'jar' | 'inferred'
export type MergeFacts = CapabilityFacts

const LAYERS: SchemaLayer[] = ['plugin', 'builtin', 'l0', 'jar', 'inferred']
const layerMaps = new Map<SchemaLayer, Map<string, RecipeTypeSchema>>(LAYERS.map((l) => [l, new Map()]))
const effective = new Map<string, RecipeTypeSchema>()
/** 钉住的 schema 落盘在 userData/customRecipeTypes.json；内存里另存一份，钉住后不再被任何层覆盖。 */
let pinned = new Map<string, RecipeTypeSchema>()
let pinnedPath: () => string = customTypesFile

/** 测试与非 Electron 环境可替换钉住文件位置（生产默认 customTypesFile()）。 */
export function setPinnedSchemaPath(resolve: () => string): void {
  pinnedPath = resolve
}

export function putLayer(layer: SchemaLayer, schema: RecipeTypeSchema): void {
  layerMaps.get(layer)?.set(schema.id, schema)
}

export function putMany(layer: SchemaLayer, schemas: readonly RecipeTypeSchema[]): void {
  for (const s of schemas) putLayer(layer, s)
}

export function getSchema(typeId: string): RecipeTypeSchema | null {
  return effective.get(typeId) ?? null
}

export function schemaIds(): string[] {
  return [...effective.keys()].sort((a, b) => a.localeCompare(b, 'en'))
}

export function allSchemas(): RecipeTypeSchema[] {
  return [...effective.values()]
}

export function clearSchemas(): void {
  for (const map of layerMaps.values()) map.clear()
  effective.clear()
  pinned = new Map()
}

/**
 * 整体替换某一层（BUG-HUNT-02 修复 BH-004 / BH-005）。
 *
 * 此前只有 `upsert`（增/改），**没有任何撤销手段**：插件被关闭、或覆盖层需要按新状态重算时，
 * 旧 schema 只能留在层里，直到 `clearSchemas()` 把整层清空——而 `ensureSchemas()` 又只重装
 * builtin + pinned，于是插件层一旦被清空就再也回不来。
 */
export function replaceLayer(layer: SchemaLayer, schemas: readonly RecipeTypeSchema[]): void {
  const map = layerMaps.get(layer)
  if (!map) return
  map.clear()
  for (const schema of schemas) map.set(schema.id, schema)
}

/** 层数据提供者：由拥有该层数据的模块在加载时注册，避免 registry 反向依赖上层模块。 */
type LayerProvider = () => readonly RecipeTypeSchema[]

const providers = new Map<SchemaLayer, LayerProvider>()

export function setLayerProvider(layer: SchemaLayer, provider: LayerProvider): void {
  providers.set(layer, provider)
}

/**
 * 取某层的当前应有内容。
 *
 * BUG-HUNT-02-RV1 修复 RV1-003：**必须区分「这一层确实是空的」与「读取这一层失败」**。
 * 旧实现把 provider 异常吞成 `[]`，调用方随即 `replaceLayer(layer, [])` 把此前**正常**的层清空，
 * 只在日志留一条 WARN——用户表现为「插件突然全部失效」，且下一次重建也救不回来（provider 仍异常）。
 * 现在失败返回 `{ ok: false }`，调用方据此**保留旧层**。
 */
export type LayerFetch = { ok: true; schemas: RecipeTypeSchema[] } | { ok: false; error: string }

/** 取某层当前内容的快照（用于「重建失败时恢复」）。 */
export function snapshotLayer(layer: SchemaLayer): RecipeTypeSchema[] {
  return [...(layerMaps.get(layer)?.values() ?? [])]
}

export function fetchLayer(layer: SchemaLayer): LayerFetch {
  const provider = providers.get(layer)
  if (!provider) return { ok: true, schemas: [] }
  try {
    return { ok: true, schemas: [...provider()] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('SCHEMA', `层 ${layer} 的数据提供者执行失败，保留上一次的层内容`, message)
    return { ok: false, error: message }
  }
}

/**
 * 合并所需的事实提供者（由 `schema/service` 在加载时注册）。
 * 让 registry 能在「层内容变化」时**立即重建 effective**，而不必等下一次 `ensureSchemas()`——
 * 后者只在快照戳失效且有人调用 `schema:*` 时才跑，而 `codegen/preview` 与 `recipes/selectSchema`
 * 都是直接 `getSchema()` 的同步路径（BUG-HUNT-02-RV1 的 RV1-002）。
 */
type FactsProvider = () => MergeFacts

let factsProvider: FactsProvider | null = null

export function setFactsProvider(fn: FactsProvider): void {
  factsProvider = fn
}

/**
 * 用当前事实立即重建生效表。
 *
 * BUG-HUNT-02-RV1 修复 RV1-002：插件启用/禁用后必须让 `getSchema()` 立刻看到新结果，
 * 否则「已关闭的插件仍被预览/配方选择使用」。
 */
export function refreshEffective(): RecipeTypeSchema[] {
  return applyMerge(factsProvider ? factsProvider() : {})
}

/**
 * 合并快照戳放在 registry 而不是 service：插件层变更时（`plugins:setEnabled`）需要
 * **同步**让它失效，否则下一次 `schema:*` 仍会命中旧快照，关闭的插件继续生效。
 */
let snapshotStamp = ''

export function readSnapshotStamp(): string {
  return snapshotStamp
}

export function writeSnapshotStamp(value: string): void {
  snapshotStamp = value
}

export function invalidateSnapshot(): void {
  snapshotStamp = ''
}

function summaryOf(schema: RecipeTypeSchema, group: SchemaSummary['group']): SchemaSummary {
  return {
    id: schema.id,
    displayName: schema.displayName,
    modId: schema.modId,
    modDisplayName: schema.modDisplayName,
    layoutKind: schema.layoutKind,
    source: schema.source,
    sampleCount: schema.sampleCount ?? 0,
    lowConfidence: schema.lowConfidence === true,
    pinned: schema.pinned === true,
    capability: schema.capability,
    channel: schema.channel,
    group
  }
}

/** 侧边栏 / 设置页用的分组列表：钉住与插件单独成组，便于 UI 标注可信度。 */
export function listSchemas(): SchemaSummary[] {
  return schemaIds().map((id) => {
    const schema = effective.get(id) as RecipeTypeSchema
    const group: SchemaSummary['group'] = schema.pinned
      ? 'plugin'
      : schema.source === 'builtin' || schema.source === 'custom'
        ? 'builtin'
        : schema.source === 'plugin'
          ? 'plugin'
          : schema.source === 'probejs'
            ? 'probe'
            : schema.emitTarget === null && schema.slots.length === 0
              ? 'generic'
              : 'inferred'
    return summaryOf(schema, group)
  })
}

function slotsOf(schema: RecipeTypeSchema): RecipeSlotSchema[] {
  return [...schema.slots, ...schema.outputs, ...(schema.extraFields ?? [])]
}

function demote(slot: RecipeSlotSchema): RecipeSlotSchema {
  return { ...slot, required: false, description: '高级（未在本包出现）', sugarSupported: slot.sugarSupported ?? false }
}

function promote(slot: RecipeSlotSchema): RecipeSlotSchema {
  return {
    ...slot,
    required: false,
    sugarSupported: slot.sugarSupported ?? false,
    description: `整合包实测字段（出现率 ${Math.round((slot.occurrenceRate ?? 0) * 100)}%，骨架未声明）`
  }
}

/**
 * 字段校验与补全（规格 3.6.3）：骨架来自高优先层，L1 结果只用于
 * ① 追加骨架缺失的实测字段 ② 把骨架里本包从未出现的字段降级。
 *
 * 稳定性约束（BUG-HUNT-02 修复 BH-006 / BH-007）：
 * - 每个槽位**只遍历一次**，`demoted` 不得重复累积（旧实现两遍 `keep` 共享同一个数组，
 *   `slots` 里 `zone:'extra'` 的槽位会被推两次）。
 * - **不再**用 `keptSlots.length > 0 ? keptSlots : slots` 兜底——兜底会把刚降级的槽位原样放回
 *   `slots`（仍带 `required:true`），使「降级」失效，同一 key 同时存在于 `slots` 与 `extraFields`。
 *   全部降级是合法结果：这些字段仍在 `extraFields` 里可见（UI 的 `declaredFields` 会合并三个区）。
 */
export function augment(skeleton: RecipeTypeSchema, inferred: RecipeTypeSchema): RecipeTypeSchema {
  const skeletonKeys = new Set(slotsOf(skeleton).map((s) => s.key))
  const inferredKeys = new Map(slotsOf(inferred).map((s) => [s.key, s]))
  const hasSamples = (inferred.sampleCount ?? 0) > 0
  const appended = slotsOf(inferred)
    .filter((s) => !skeletonKeys.has(s.key) && (s.occurrenceRate ?? 0) >= INFER_FIELD_MIN_RATE)
    .map(promote)
  const slots = [...skeleton.slots]
  const outputs = [...skeleton.outputs]
  for (const slot of appended) {
    if (slot.zone === 'output') outputs.push(slot)
    else slots.push(slot)
  }

  const demoted: RecipeSlotSchema[] = []
  const demotedKeys = new Set<string>()
  const keepZone = (list: readonly RecipeSlotSchema[]): RecipeSlotSchema[] => {
    const kept: RecipeSlotSchema[] = []
    for (const slot of list) {
      if (hasSamples && !inferredKeys.has(slot.key)) {
        // 同一 key 只降级一次（slots 与 outputs 可能撞名）
        if (!demotedKeys.has(slot.key)) {
          demotedKeys.add(slot.key)
          demoted.push(demote(slot))
        }
        continue
      }
      kept.push(slot)
    }
    return kept
  }
  const keptSlots = keepZone(slots)
  const keptOutputs = keepZone(outputs)
  // RV1-007：降级项可能与骨架自带的 extraFields 撞名；按 key 去重，保证 extraFields 里每个 key 只出现一次
  const extraFields = [...(skeleton.extraFields ?? [])]
  const extraKeys = new Set(extraFields.map((s) => s.key))
  for (const slot of demoted) {
    if (extraKeys.has(slot.key)) continue
    extraKeys.add(slot.key)
    extraFields.push(slot)
  }
  return {
    ...skeleton,
    slots: keptSlots,
    outputs: keptOutputs,
    extraFields,
    sampleCount: inferred.sampleCount ?? skeleton.sampleCount,
    lowConfidence: (inferred.sampleCount ?? 0) < INFER_LOW_CONFIDENCE_SAMPLES,
    capabilityNote: skeleton.capabilityNote
      ? `${skeleton.capabilityNote} · 本包 ${inferred.sampleCount ?? 0} 个样本校验，${demoted.length} 个字段未出现已降级`
      : `本包 ${inferred.sampleCount ?? 0} 个样本校验：新增 ${appended.length} 个实测字段，${demoted.length} 个字段未在本包出现`
  }
}

/** L2（jar / ProbeJS）只提供语义命名与注册表线索；类型与必填性冲突时以 L1 实测优先。 */
function overlayJar(schema: RecipeTypeSchema, jar: RecipeTypeSchema): RecipeTypeSchema {
  const byKey = new Map(slotsOf(jar).map((s) => [s.key, s]))
  const paint = (slot: RecipeSlotSchema): RecipeSlotSchema => {
    const from = byKey.get(slot.key)
    if (!from) return slot
    const next: RecipeSlotSchema = { ...slot }
    if (slot.displayName === slot.key && from.displayName) next.displayName = from.displayName
    if (!slot.registry && from.registry) next.registry = from.registry
    if (slot.kind === 'unknown' && from.kind !== 'unknown') next.kind = from.kind
    if (from.description) next.description = `${slot.description ? `${slot.description} · ` : ''}${from.description}`
    return next
  }
  const merged: RecipeTypeSchema = {
    ...schema,
    slots: schema.slots.map(paint),
    outputs: schema.outputs.map(paint),
    extraFields: (schema.extraFields ?? []).map(paint)
  }
  if (merged.emitTarget === null && jar.emitTarget !== null) merged.emitTarget = jar.emitTarget
  return merged
}

function skeletonFor(typeId: string): { schema: RecipeTypeSchema; source: SchemaSource } | null {
  for (const layer of LAYERS) {
    const hit = layerMaps.get(layer)?.get(typeId)
    if (hit) return { schema: hit, source: hit.source }
  }
  return null
}

/** 五层合并主入口：产出生效表，并逐类型做能力判定与通道选择。 */
export function applyMerge(facts: MergeFacts = {}): RecipeTypeSchema[] {
  // RV1-002 的第二个成因：`applyMerge` 只写不改删，于是某个类型在层里**消失**之后
  // （典型场景：插件被关闭），`effective` 仍留着上一次合并出来的旧对象，`getSchema()` 会继续返回它。
  // 这里先清空生效表再按当前层重建——applyMerge 语义本就是「完整重建」。
  effective.clear()
  const ids = new Set<string>()
  for (const map of layerMaps.values()) for (const id of map.keys()) ids.add(id)
  for (const id of pinned.keys()) ids.add(id)
  const out: RecipeTypeSchema[] = []
  for (const typeId of [...ids].sort((a, b) => a.localeCompare(b, 'en'))) {
    const inferred = layerMaps.get('inferred')?.get(typeId) ?? null
    const jar = layerMaps.get('jar')?.get(typeId) ?? null
    const base = pinned.get(typeId) ?? skeletonFor(typeId)?.schema ?? null
    let schema: RecipeTypeSchema | null = null
    if (base && base.source !== 'inferred') {
      schema = base
      if (inferred && !pinned.has(typeId)) schema = augment(schema, inferred)
      if (jar && !pinned.has(typeId)) schema = overlayJar(schema, jar)
    } else if (jar && jar.source !== 'inferred') {
      schema = jar
      if (inferred) schema = augment(schema, inferred)
    } else schema = inferred ?? jar ?? base

    if (!schema) continue
    const pinnedFlag = pinned.has(typeId)
    const decided: RecipeTypeSchema = { ...schema, pinned: pinnedFlag, displayName: schema.displayName || recipeTypeNameZh(schema.id, displayNameForField(schema.id)) }
    const next = pinnedFlag ? decided : decideForSchema(decided, facts)
    effective.set(typeId, next)
    out.push(next)
  }
  logger.debug('SCHEMA', `五层合并完成：生效 ${out.length} 个配方类型（钉住 ${pinned.size}）`)
  return out
}

export async function loadPinned(): Promise<RecipeTypeSchema[]> {
  const stored = await readJson<RecipeTypeSchema[]>(pinnedPath())
  pinned = new Map((Array.isArray(stored) ? stored : []).filter((s) => s && typeof s.id === 'string').map((s) => [s.id, s]))
  return [...pinned.values()]
}

async function persistPinned(): Promise<void> {
  const list = [...pinned.values()].sort((a, b) => a.id.localeCompare(b.id))
  await writeJson(pinnedPath(), list)
}

/**
 * B121/S-3：schema 变更互斥。pin/unpin 的「内存 set → await 写盘」窗口与 ensureSchemas
 * 重建的「clearSchemas（清空 pinned）→ loadPinned（读旧盘）」窗口重叠时，用户的钉住会
 * 从内存消失，且后续任意 persistPinned 会把不含它的列表整体写盘（静默永久删除）。
 * 三条路径（pin/unpin/重建）统一串行化后，重叠不再可能。锁内不得再取锁（无重入）。
 */
let mutationChain: Promise<unknown> = Promise.resolve()

export function withSchemaMutation<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationChain.then(fn)
  mutationChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/**
 * 钉住：写入 customTypesFile，之后该类型不再被插件 / L1 / L2 覆盖（规格 3.6.4）。
 *
 * BUG-HUNT-02-RV1 修复 RV1-001：**先改内存、后写盘，写盘失败必须回滚内存**。
 * 旧实现 `pinned.set` + `effective.set` 之后才 `await persistPinned()`；失败时错误虽然抛给了
 * 调用方（UI 会显示"钉住失败"），但内存已经被改过——本会话里该类型**实际上已被钉住**，
 * 重启后又静默回退到磁盘里的旧状态，用户会看到"我明明钉过又没了"。
 */
export async function pinSchema(schema: RecipeTypeSchema): Promise<RecipeTypeSchema> {
  return withSchemaMutation(async () => {
    const next: RecipeTypeSchema = { ...schema, pinned: true, source: 'custom' }
    const prevPinned = pinned.get(next.id)
    const prevEffective = effective.get(next.id)
    pinned.set(next.id, next)
    effective.set(next.id, next)
    try {
      await persistPinned()
    } catch (err) {
      // 回滚到调用前的内存状态，保证「内存 == 磁盘」
      if (prevPinned) pinned.set(next.id, prevPinned)
      else pinned.delete(next.id)
      if (prevEffective) effective.set(next.id, prevEffective)
      else effective.delete(next.id)
      logger.error('SCHEMA', `钉住 ${next.id} 写盘失败，已回滚内存状态`, err instanceof Error ? err.message : String(err))
      throw err
    }
    logger.info('SCHEMA', `已钉住配方类型 ${next.id}（写入 customRecipeTypes.json，后续扫描不再覆盖）`)
    return next
  })
}

/** 取消钉住：同样先改内存后写盘，失败时回滚（见 pinSchema 的说明）；与重建共用变更互斥。 */
export async function unpinSchema(typeId: string): Promise<boolean> {
  return withSchemaMutation(async () => {
    const prevPinned = pinned.get(typeId)
    const prevEffective = effective.get(typeId)
    if (!prevPinned) return false
    pinned.delete(typeId)
    try {
      await persistPinned()
    } catch (err) {
      pinned.set(typeId, prevPinned)
      if (prevEffective) effective.set(typeId, prevEffective)
      logger.error('SCHEMA', `取消钉住 ${typeId} 写盘失败，已回滚内存状态`, err instanceof Error ? err.message : String(err))
      throw err
    }
    effective.delete(typeId)
    logger.info('SCHEMA', `已取消钉住 ${typeId}，恢复由插件 / L0 / L2 / L1 合并结果接管`)
    return true
  })
}

export function pinnedIds(): string[] {
  return [...pinned.keys()]
}
