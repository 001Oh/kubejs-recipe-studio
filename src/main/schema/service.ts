/**
 * P0：Schema 注册表的对外服务层（供 `schema:*` IPC 使用）。
 *
 * 只做三件事，不引入新的 Schema 体系：
 * 1. **组装**：把现有数据源填进既有注册表（`schema/registry.ts`）——
 *    ① 内置试点 schema（`shared/pilotSchemas.ts`，工作台实际在用的 3 个类型）
 *    ② 用户钉住的 schema（`userData/customRecipeTypes.json`）
 *    ③ 注册表里已经存在的其它层（插件 / L2 / L1，若将来接线则自动生效）
 * 2. **事实**：样本数直接取已扫描的配方索引（内存中的 `allRecords()`），**不触发任何磁盘扫描**；
 *    附属与已装模组取自当前整合包信息。
 * 3. **快照**：以「整合包路径 + 记录数 + 类型数」为戳，仅在该变化时重新合并，避免每次调用重算。
 *
 * 现状（2026-11-02 校正）：旧注释曾称「插件 recipeTypes 未暴露为 schema 层」，与实现不符，已更正。
 * - L1 推断（`schema/infer.ts`）**仍无任何调用方**（全仓 grep 无 import）→ 大多数配方类型没有结构化 schema；
 * - 插件清单里的 `recipeTypes` **已接入 schema 层**：`plugins/loader.ts` 通过
 *   `setLayerProvider('plugin', currentPluginOverrides)` 把插件声明的类型装配进 `plugin` 层，
 *   `ensureSchemas()` 每次重建都会重新装配（BH-004/BH2-001 的修复结果）。
 *
 * 插件读取失败时的语义（FIX-02 / FIX-03 已落地，此前注释描述的旧行为作废）：
 * - **失败不清层**：读取失败时 `loadPlugins` 不写缓存、不调 `syncPluginLayer`，`plugin` 层继续用
 *   **上一次成功**的数据，并把失败按路径记入 `loadFailure`（`getPluginLoadStatus().state === 'failed'`）；
 * - **失败不写快照戳**：`ensureSchemas` 只在 `pluginLayer.ok && status.state !== 'failed'` 时
 *   `writeSnapshotStamp`，因此失败期间的每次读取都会完整重建（用正确性换性能，可接受）；
 * - **可重试**：目录恢复后**一次正常读取**即可重新加载，无需进设置页、无需切包；
 * - **可观测**：三态严格区分「目录不存在 / 存在但读不出 / 读成功但为空」，失败不会被伪装成空列表；
 *   UI 侧通过 `plugins:loadStatus` 读取该状态并显式提示（T-07）。
 */
import type { RecipeSlotSchema, RecipeTypeSchema } from '../../shared/types'
import type { SchemaSummary } from '../../shared/ipc'
import type { NormalizedSchema, NormalizedSchemaSlot } from '../../shared/schemaModel'
import { PILOT_SCHEMAS } from '../../shared/pilotSchemas'
import { resolveSugarTarget } from '../codegen/emitScript'
import { getCurrentModpack } from '../modpack/state'
import { allRecords, typeUniverse } from '../recipes/recipeIndex'
import { getPluginLoadStatus } from '../plugins/loader'
import { buildCoverageReport, type CapabilityFacts } from './capability'
import { displayNameForField } from './naming'
import {
  allSchemas,
  applyMerge,
  clearSchemas,
  getSchema,
  fetchLayer,
  invalidateSnapshot,
  listSchemas,
  loadPinned,
  pinSchema,
  putMany,
  readSnapshotStamp,
  replaceLayer,
  setFactsProvider,
  snapshotLayer,
  unpinSchema,
  writeSnapshotStamp
} from './registry'

function slotOf(source: NormalizedSchemaSlot, zone: 'input' | 'output'): RecipeSlotSchema {
  const slot: RecipeSlotSchema = {
    key: source.key,
    displayName: displayNameForField(source.key),
    kind: source.kind,
    multiple: source.multiple,
    zone
  }
  if (source.required) slot.required = true
  if (source.registry) slot.registry = source.registry
  if (source.compound && source.compound.length > 0) slot.compound = [...source.compound]
  if (source.fields && source.fields.length > 0) slot.fields = source.fields.map((f) => slotOf(f, 'input'))
  return slot
}

/** 试点 schema（NormalizedSchema）→ 注册表格式（RecipeTypeSchema），只补齐结构字段，不添加任何语义 */
export function pilotToSchema(pilot: NormalizedSchema): RecipeTypeSchema {
  const modId = pilot.id.includes(':') ? pilot.id.slice(0, pilot.id.indexOf(':')) : 'minecraft'
  const base: RecipeTypeSchema = {
    id: pilot.id,
    displayName: displayNameForField(pilot.id.includes(':') ? pilot.id.slice(pilot.id.indexOf(':') + 1) : pilot.id),
    modId,
    modDisplayName: modId,
    source: 'builtin',
    layoutKind: pilot.layoutKind,
    emitTarget: null,
    slots: pilot.slots.map((s) => slotOf(s, 'input')),
    outputs: pilot.outputs.map((s) => slotOf(s, 'output')),
    channel: 'datapack-json',
    capability: 'compatible'
  }
  // 语法糖目标只从既有映射里查（原版 7 种），查不到就保持 null，由 capability 判定如实标注
  base.emitTarget = resolveSugarTarget(base)
  return base
}

/** 当前整合包 + 配方索引能提供的全部事实（纯内存，无磁盘 I/O） */
export function schemaFacts(): CapabilityFacts {
  const counts = new Map<string, number>()
  for (const rec of allRecords()) counts.set(rec.type, (counts.get(rec.type) ?? 0) + 1)
  for (const type of typeUniverse()) if (!counts.has(type)) counts.set(type, 0)
  const info = getCurrentModpack()
  return {
    sampleCounts: counts,
    addons: info?.kubejsAddons ?? [],
    installedModIds: info?.installedModIds ?? []
  }
}

let inflight: Promise<void> | null = null

/** RV1-002：把合并所需的事实交给 registry，使它能同步重建 effective（插件开关即时生效）。 */
setFactsProvider(() => schemaFacts())

/**
 * 合并快照的戳。REM-01：除路径与索引规模外，**还要带附属/模组数量**——
 * 换包后若路径变化但用户是"同目录换内容"，或重新检测到不同的附属集合，
 * 只比路径+计数会漏掉，导致 `capability` / `channel` 仍按旧包判定。
 */
function factsKey(): string {
  const info = getCurrentModpack()
  const addons = info?.kubejsAddons.length ?? 0
  const installed = info?.installedModIds.length ?? 0
  return `${info?.path ?? ''}|${allRecords().length}|${typeUniverse().length}|${addons}|${installed}`
}

/**
 * 惰性组装：只在整合包或配方索引变化时重建，其余调用直接命中已有注册表。
 *
 * 并发约束（BUG-HUNT-02 修复 BH-002）：**不能用「先写戳、后组装」**——旧实现在
 * `await loadPinned()` 之前就把 `stamp` 写上，同一 tick 内的第二个调用看到戳已更新就立刻返回，
 * 而此时 `effective` 还没被 `applyMerge` 填充，于是 `schema:list` 返回 `[]`、`schema:get` 返回 `null`。
 * `SequenceEditor` 的 `for (...) void ensureSchema(t)` 会一次发多个并发请求，正好命中这个窗口。
 *
 * 现在改为**共享同一个 in-flight Promise**，并且**只在组装成功后**才写戳；
 * 组装失败时戳保持旧值，下一次调用会重试（满足「失败后可重试」）。
 */
export async function ensureSchemas(): Promise<void> {
  for (;;) {
    const key = factsKey()
    if (key === readSnapshotStamp()) return
    if (inflight) {
      await inflight
      continue
    }
    const task = (async (): Promise<void> => {
      // RV1-003：clearSchemas 会把插件层一并清空，所以先快照；provider 失败时恢复快照，
      // 而不是让一次「读取插件失败」变成「所有插件类型消失」
      const prevPluginLayer = snapshotLayer('plugin')
      clearSchemas()
      putMany('builtin', Object.values(PILOT_SCHEMAS).map(pilotToSchema))
      const pluginLayer = fetchLayer('plugin')
      replaceLayer('plugin', pluginLayer.ok ? pluginLayer.schemas : prevPluginLayer)
      await loadPinned()
      applyMerge(schemaFacts())
      // FIX-03：插件层没有成功装配时**不得**写「完整成功」的快照戳。
      // 戳只表达「生效表对应当前 facts（包路径/索引规模/附属数/模组数）」，并不包含插件加载状态；
      // 一旦在插件读取失败时照写，下一次读取会在 `key === readSnapshotStamp()` 处短路，
      // 于是 FIX-02 在 provider（`currentRecords`）里的失败重试条件永远走不到——
      // 插件目录恢复后也就无法自动恢复。
      if (pluginLayer.ok && getPluginLoadStatus().state !== 'failed') writeSnapshotStamp(key)
    })()
    inflight = task
    try {
      await task
    } finally {
      inflight = null
    }
    return
  }
}

/** 供测试重置快照戳（不改注册表内容） */
export function invalidateSchemaSnapshot(): void {
  invalidateSnapshot()
}

export async function schemaSummaries(): Promise<SchemaSummary[]> {
  await ensureSchemas()
  return listSchemas()
}

export async function schemaById(typeId: string): Promise<RecipeTypeSchema | null> {
  await ensureSchemas()
  return getSchema(typeId)
}

/**
 * 钉住 / 取消钉住。
 *
 * BUG-HUNT-02 修复 BH-001：`override` 是调用方（`schema:pin`）提交并已校验过的那一份 schema。
 * 旧实现完全忽略它，只按 `typeId` 从注册表重新取当前版本落盘——于是「钉住」保存的可能是
 * 注册表重建后的另一份内容，与用户所见不一致，却照样返回成功。
 */
export async function togglePin(
  typeId: string,
  on: boolean,
  override?: RecipeTypeSchema
): Promise<{ schema: RecipeTypeSchema | null; changed: boolean }> {
  await ensureSchemas()
  if (on) {
    const current = getSchema(typeId)
    if (!current) return { schema: null, changed: false }
    // 以提交的那一份为准；id 强制对齐 typeId（assertPinnable 已在 handler 侧校验过一致性）
    const source: RecipeTypeSchema = override ? { ...override, id: typeId } : current
    const pinned = await pinSchema(source)
    applyMerge(schemaFacts())
    return { schema: getSchema(typeId) ?? pinned, changed: true }
  }
  const changed = await unpinSchema(typeId)
  // 取消钉住后该类型回到合并结果；试点内置类型仍然存在
  applyMerge(schemaFacts())
  return { schema: getSchema(typeId), changed }
}

export async function coverage(): Promise<ReturnType<typeof buildCoverageReport>> {
  await ensureSchemas()
  const info = getCurrentModpack()
  return buildCoverageReport(allSchemas(), schemaFacts(), info?.mcVersion ?? null)
}
