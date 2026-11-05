/**
 * L0 内置精校库的物化器（第 117 批）：RawSchema → NormalizedSchema。
 *
 * 定位：`src/data/recipeTypes/*.ts` 是「布局 + 有把握的字段名」的静态声明；
 * 这里负责把它们转成注册表可装配的 NormalizedSchema，并按包内容过滤激活。
 *
 * 激活条件（T-26 后的包内容驱动）：整合包已检测到该 modId **且** 装有 kubejs。
 * 字段名来自规格 / 官方数据文件的（fieldsVerified=true）才进 slots；
 * `fieldsVerified=false` 的只保留布局，字段交给 L1 从本包样本反推。
 *
 * 注意：本文件不接 `create.ts`（Create 系等 KJS 加载机制批次，负责人裁定）。
 */
import type { NormalizedSchema, NormalizedSchemaSlot } from '../../shared/schemaModel'

import type { RawSchema, SlotInit } from './_helper'
import { arsNouveauSchemas, botaniaSchemas, pneumaticcraftSchemas } from './botania'
import { immersiveengineeringSchemas } from './immersiveengineering'
import { thermalSchemas } from './thermal'

/** 逐包注册：modId → RawSchema 集合。新增内置库 = 在这里加一行。 */
export const L0_PACKS: readonly RawSchema[][] = [
  thermalSchemas,
  botaniaSchemas,
  immersiveengineeringSchemas,
  // B120/D-06：ars(5) / pnc(5) 此前已声明未接线（botania.ts 内），13 条死代码激活归零
  arsNouveauSchemas,
  pneumaticcraftSchemas
]

export const L0_MOD_IDS: readonly string[] = [...new Set(L0_PACKS.flat().map((r) => r.modId))]

function convSlot(init: SlotInit): NormalizedSchemaSlot {
  const out: NormalizedSchemaSlot = {
    key: init.key,
    kind: init.kind,
    multiple: init.multiple === true,
    ...(init.required !== undefined ? { required: init.required } : {}),
    ...(init.zone !== undefined ? { jsonKey: init.key, zone: init.zone } : {})
  }
  // B121/S-2：声明侧语义字段全量透传（此前只带 4 个键，compound/emitShape/sugarSupported/
  // min/max/choices/registry 等在物化时蒸发，L0「精校」到达编辑器只剩骨架）。
  // min/max 按 NormalizedSchemaSlot 的 v2 约定收进 constraints。
  const passthrough = {
    role: init.role,
    label: init.label,
    description: init.description,
    sugarSupported: init.sugarSupported,
    choices: init.choices,
    defaultValue: init.defaultValue,
    firstItemMust: init.firstItemMust,
    orientation: init.orientation,
    registry: init.registry,
    compound: init.compound,
    emitShape: init.emitShape
  } as Partial<NormalizedSchemaSlot>
  for (const [key, value] of Object.entries(passthrough)) {
    if (value !== undefined) (out as unknown as Record<string, unknown>)[key] = value
  }
  if (init.min !== undefined || init.max !== undefined) {
    out.constraints = {
      ...(init.min !== undefined ? { min: init.min } : {}),
      ...(init.max !== undefined ? { max: init.max } : {})
    }
  }
  if (init.fields) out['fields'] = init.fields.map(convSlot)
  return out
}

export function materializeRaw(raw: RawSchema): NormalizedSchema {
  const init = raw.init
  const slots = (init.slots ?? []).map(convSlot)
  const outputs = (init.outputs ?? []).map(convSlot)
  const extras = (init.extra ?? []).map(convSlot)
  // extra 字段并进 slots（试点 UI 的「附加区」按 zone 渲染——zone 已随 convSlot 透传）
  return {
    id: raw.id,
    layoutKind: init.layout,
    slots: [...slots, ...extras],
    outputs,
    revision: 1,
    preserveUnknown: true,
    // B121/S-2：schema 级声明透传（emit 是 L0 语法糖目标的唯一来源；此前连同
    // grid/cells/requirements/notes/modifiers 一并丢失，L0 永远拿不到语法糖与布局预设）
    ...(init.emit !== undefined ? { emit: init.emit } : {}),
    ...(init.supportsChance ? { supportsChance: true } : {}),
    ...(init.modifiers ? { modifiers: init.modifiers } : {}),
    ...(init.requirements ? { requirements: init.requirements } : {}),
    ...(init.notes ? { notes: [...init.notes] } : {}),
    ...(init.grid ? { grid: init.grid } : {}),
    ...(init.cells ? { cells: init.cells } : {}),
    ...(init.docUrl ? { docUrl: init.docUrl } : {})
  }
}

/**
 * B120/D-06：jar 实名与配方类型命名空间不同名的模组。
 * thermal 系的配方 type 是 `thermal:*`（类型命名空间不动），但 jar/模组实名是
 * `thermal_foundation`——按 `installed.has('thermal')` 匹配永远落空，3 条 L0 永不激活。
 */
const MOD_ID_ALIASES: Readonly<Record<string, readonly string[]>> = {
  thermal: ['thermal_foundation']
}

function isModInstalled(modId: string, installed: ReadonlySet<string>): boolean {
  if (installed.has(modId)) return true
  return (MOD_ID_ALIASES[modId] ?? []).some((alias) => installed.has(alias))
}

/**
 * 按包内容过滤：modId（或其 jar 实名别名）已安装且装有 kubejs 才激活该包的类型。
 * `hasKubejs=false` 时整个 L0 层为空（原版家族不受影响）。
 */
export function activeL0Schemas(modpack: { hasKubejs: boolean; installedModIds: readonly string[] } | null): NormalizedSchema[] {
  if (!modpack?.hasKubejs) return []
  const installed = new Set(modpack.installedModIds)
  return L0_PACKS.flat()
    .filter((r) => isModInstalled(r.modId, installed))
    .map(materializeRaw)
}
