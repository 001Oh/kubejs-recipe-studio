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
import { botaniaSchemas } from './botania'
import { immersiveengineeringSchemas } from './immersiveengineering'
import { thermalSchemas } from './thermal'

/** 逐包注册：modId → RawSchema 集合。新增内置库 = 在这里加一行。 */
const L0_PACKS: readonly RawSchema[][] = [thermalSchemas, botaniaSchemas, immersiveengineeringSchemas]

export const L0_MOD_IDS: readonly string[] = [...new Set(L0_PACKS.flat().map((r) => r.modId))]

function convSlot(init: SlotInit): NormalizedSchemaSlot {
  const out: NormalizedSchemaSlot = {
    key: init.key,
    kind: init.kind,
    multiple: init.multiple === true,
    ...(init.required !== undefined ? { required: init.required } : {}),
    ...(init.zone !== undefined ? { jsonKey: init.key } : {})
  }
  // RecipeSlotSchema 与 NormalizedSchemaSlot 同构；zone/role/emit 等可选字段原样透传
  const extra = init
  for (const key of ['zone', 'role', 'label', 'docUrl'] as const) {
    if ((extra as unknown as Record<string, unknown>)[key] !== undefined) (out as unknown as Record<string, unknown>)[key] = (extra as unknown as Record<string, unknown>)[key]
  }
  if (init.fields) out['fields'] = init.fields.map(convSlot)
  return out
}

export function materializeRaw(raw: RawSchema): NormalizedSchema {
  const init = raw.init
  const slots = (init.slots ?? []).map(convSlot)
  const outputs = (init.outputs ?? []).map(convSlot)
  const extras = (init.extra ?? []).map(convSlot)
  // extra 字段并进 slots（试点 UI 的「附加区」按 zone 渲染）
  return {
    id: raw.id,
    layoutKind: init.layout,
    slots: [...slots, ...extras],
    outputs,
    revision: 1,
    preserveUnknown: true,
    ...(init.supportsChance ? { supportsChance: true } : {})
  }
}

/**
 * 按包内容过滤：modId 已安装且装有 kubejs 才激活该包的类型。
 * `hasKubejs=false` 时整个 L0 层为空（原版家族不受影响）。
 */
export function activeL0Schemas(modpack: { hasKubejs: boolean; installedModIds: readonly string[] } | null): NormalizedSchema[] {
  if (!modpack?.hasKubejs) return []
  const installed = new Set(modpack.installedModIds)
  return L0_PACKS.flat()
    .filter((r) => installed.has(r.modId))
    .map(materializeRaw)
}
