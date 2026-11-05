/**
 * 优先级合并（规格 3.6.14「加载与优先级」+ 架构决策 6）。
 *
 *   用户手动钉住 / 自定义   ← 最高，任何来源都不覆盖
 *   插件（本包 → 用户目录）
 *   内置精校库 L0
 *   ProbeJS / class 推断 L2
 *   L1 反推                  ← 兜底，永远可用
 *
 * **接线现状（2026-11-06 D-49.2 更新）**：上表五层均已接线（B120/D-05、D-06 接通 L0/L1；
 * jar 层除外——classParser 已随 D-49.4 删除，ProbeJS 走文本提取 probeImport）。
 * 规则 2「插件与 L1 叠加」由 registry.augment 在 applyMerge 中兑现（规格 3.6.3：
 * 出现率 ≥10% 追加为「整合包实测字段」、骨架未出现字段降级「高级（未在本包出现）」）；
 * 本文件中与该门槛语义不符的早期平行实现 overlayPluginOntoInferred 已删除
 * （D-49.2，委托方拍板），其专属测试同步移除。
 *
 * 两条容易被写错的规则在这里定死：
 * 1. 同 `type` 被多个插件声明 → 按来源优先级取第一个，其余记为冲突（插件页要能看见）；
 * 2. 插件与 L1 是**叠加**关系：插件没写到的字段仍由 L1 补全，绝不因为装了插件就把反推结果丢掉。
 */
import type { PluginManifest, RecipeSlotSchema, RecipeTypeSchema, SchemaSource } from '../../shared/types'
import type { PluginManifestCore, PluginSlotDecl, PluginTypeDecl } from './manifest'
import type { AddonState } from './capabilityLink'
import { applyAddonCapability, prettyModName } from './capabilityLink'

/** 数值越小优先级越高 */
export const LAYER_RANK: Record<SchemaSource, number> = {
  custom: 0,
  plugin: 1,
  builtin: 2,
  probejs: 3,
  inferred: 4
}

export type PluginOrigin = 'modpack' | 'user'
export const ORIGIN_RANK: Record<PluginOrigin, number> = { modpack: 0, user: 1 }

export interface PluginSchemaRecord {
  pluginId: string
  origin: PluginOrigin
  schema: RecipeTypeSchema
}

export interface TypeConflict {
  type: string
  winner: string
  winnerOrigin: PluginOrigin
  losers: string[]
}

export function schemaRank(schema: RecipeTypeSchema): number {
  if (schema.pinned) return 0
  return LAYER_RANK[schema.source]
}

/** 严格更高优先级才覆盖；同级由调用顺序决定（先到先得） */
export function takesPrecedence(candidate: RecipeTypeSchema, existing: RecipeTypeSchema): boolean {
  return schemaRank(candidate) < schemaRank(existing)
}

/** 五层收敛：每个 type 只留优先级最高的一份，顺序按首次出现 */
export function selectWinningSchemas(all: readonly RecipeTypeSchema[]): RecipeTypeSchema[] {
  const winner = new Map<string, RecipeTypeSchema>()
  for (const schema of all) {
    const current = winner.get(schema.id)
    if (!current || takesPrecedence(schema, current)) winner.set(schema.id, schema)
  }
  return all.filter((schema) => winner.get(schema.id) === schema)
}

/** 插件层内部按来源优先级取一，并把被压掉的声明报成冲突 */
export function resolvePluginOverrides(records: readonly PluginSchemaRecord[]): {
  schemas: RecipeTypeSchema[]
  conflicts: TypeConflict[]
} {
  const byType = new Map<string, PluginSchemaRecord>()
  const conflicts = new Map<string, TypeConflict>()
  for (const record of records) {
    const current = byType.get(record.schema.id)
    if (current) {
      const entry = conflicts.get(record.schema.id) ?? {
        type: record.schema.id,
        winner: current.pluginId,
        winnerOrigin: current.origin,
        losers: []
      }
      if (!entry.losers.includes(record.pluginId)) entry.losers.push(record.pluginId)
      conflicts.set(record.schema.id, entry)
      continue
    }
    byType.set(record.schema.id, record)
  }
  return {
    schemas: [...byType.values()].map((r) => r.schema),
    conflicts: [...conflicts.values()]
  }
}

/** 只看 manifest 列表算冲突（插件页与降级判定用，不依赖 schema 是否已构建） */
export function planTypeConflicts(plugins: readonly PluginManifest[]): TypeConflict[] {
  const owner = new Map<string, PluginManifest>()
  const conflicts = new Map<string, TypeConflict>()
  for (const plugin of plugins) {
    if (plugin.status !== 'loaded') continue
    for (const type of plugin.coveredTypes) {
      const current = owner.get(type)
      if (!current) {
        owner.set(type, plugin)
        continue
      }
      const entry = conflicts.get(type) ?? { type, winner: current.id, winnerOrigin: current.origin, losers: [] }
      if (!entry.losers.includes(plugin.id)) entry.losers.push(plugin.id)
      conflicts.set(type, entry)
    }
  }
  return [...conflicts.values()]
}

/** 全局字段名词典套用到槽位；作者没显式写 displayName（默认等于 key）时才改名 */
export function applyFieldNames<T extends RecipeSlotSchema>(slots: readonly T[], dict: Record<string, string>): T[] {
  return slots.map((slot) => {
    const renamed: T = {
      ...slot,
      ...(dict[slot.key] && slot.displayName === slot.key ? { displayName: dict[slot.key] } : {}),
      ...(slot.fields ? { fields: applyFieldNames(slot.fields, dict) } : {})
    }
    return renamed
  })
}

function labelsFromValueNames(valueNames: Record<string, string>): { value: string; label: string }[] {
  return Object.entries(valueNames).map(([value, label]) => ({ value, label }))
}

function finalizeSlot(slot: PluginSlotDecl, core: PluginManifestCore): RecipeSlotSchema {
  const { choicesSource, ...rest } = slot
  const built: RecipeSlotSchema = { ...rest }
  const labelled = built.choices?.map((c) => ({ value: c.value, label: core.valueNames[c.value] ?? c.label }))
  return {
    ...built,
    ...(labelled && labelled.length > 0 ? { choices: labelled } : {}),
    ...(!built.choices && choicesSource?.startsWith('values:') ? { choices: labelsFromValueNames(core.valueNames) } : {})
  }
}

/** 插件声明 → 完整 RecipeTypeSchema（source: 'plugin'），并按附属检测结果定通道 */
export function buildPluginSchema(decl: PluginTypeDecl, core: PluginManifestCore, addon: AddonState | null): RecipeTypeSchema {
  const dict = core.fieldNames
  const slots = decl.slots.map((s) => finalizeSlot(s, core))
  const outputs = decl.outputs.map((s) => finalizeSlot(s, core))
  const declaredExtra = decl.extraFields ?? []
  const extraFields = declaredExtra.map((s) => finalizeSlot(s, core))
  const authoredName = decl.displayName !== decl.id
  const base: RecipeTypeSchema = {
    id: decl.id,
    displayName: authoredName ? decl.displayName : dict[decl.id] ?? decl.displayName,
    modId: decl.modId,
    modDisplayName: decl.modDisplayName ?? prettyModName(decl.modId),
    source: 'plugin',
    layoutKind: decl.layoutKind,
    emitTarget: decl.emitTarget,
    slots: applyFieldNames(slots, dict),
    outputs: applyFieldNames(outputs, dict),
    ...(declaredExtra.length > 0 ? { extraFields: applyFieldNames(extraFields, dict) } : {}),
    ...(decl.customTemplate ? { customTemplate: decl.customTemplate } : {}),
    ...(decl.modifiers ? { modifiers: decl.modifiers } : {}),
    ...(decl.requirements ? { requirements: decl.requirements } : {}),
    ...(decl.notes ? { notes: [...decl.notes] } : {}),
    ...(decl.grid ? { grid: decl.grid } : {}),
    ...(decl.cells ? { cells: decl.cells } : {}),
    ...(decl.docUrl ? { docUrl: decl.docUrl } : {}),
    ...(decl.supportsChance ? { supportsChance: true } : {}),
    channel: 'event-custom',
    capability: 'compatible'
  }
  return applyAddonCapability(base, addon)
}

