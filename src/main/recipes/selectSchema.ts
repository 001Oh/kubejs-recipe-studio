/**
 * P-C1：为「打开配方」选择合适的 schema（纯逻辑，无 IO）。
 *
 * 实际顺序：试点内置 → 注册表（钉住/插件，由 registry 自身合并）→ 通用兜底。
 * 试点类型优先于 pinned 是**设计选择，不是缺陷**（P3-13）：试点编辑器的字段模型
 * 由内置 schema 固定（槽位/网格/输出键），若让 pin 的自定义 schema 覆盖，同一配方
 * 会在 openRecipe / preview / commit 三条链上出现两套互不兼容的字段模型。
 * 本阶段只内置 `minecraft:crafting_shaped` / `crafting_shapeless` / `create:mixing`
 * 三个试点 schema；其余类型按注册表优先级取，最后落到 generic（只能看原文）。
 * 参考 AUDIT-REMEDIATION-01.md §四。
 */
import type { RecipeTypeSchema } from '../../shared/types'
import type { NormalizedSchema, NormalizedSchemaSlot } from '../../shared/schemaModel'
import { getSchema } from '../schema/registry'
import { PILOT_SCHEMAS, isPilotType } from '../../shared/pilotSchemas'

export type SchemaSourceKind = 'pinned' | 'plugin' | 'builtin' | 'probejs' | 'inferred' | 'generic'

export interface SchemaSelection {
  schema: NormalizedSchema
  source: SchemaSourceKind
  notes: string[]
}

function slotOf(source: RecipeTypeSchema['slots'][number]): NormalizedSchemaSlot {
  const jsonKey = source.key
  return {
    key: source.key,
    kind: source.kind,
    multiple: source.multiple === true,
    ...(source.required ? { required: true } : {}),
    ...(source.registry ? { registry: source.registry } : {}),
    ...(source.compound ? { compound: [...source.compound] } : {}),
    jsonKey,
    ...(source.emitShape ? { emitShape: source.emitShape } : {}),
    ...(source.fields ? { fields: source.fields.map(slotOf) } : {})
  }
}

/** 把注册表里的 RecipeTypeSchema（v1 字段）转成规范化所需的最小视图 */
export function toNormalizedSchema(schema: RecipeTypeSchema): NormalizedSchema {
  return {
    id: schema.id,
    layoutKind: schema.layoutKind,
    slots: schema.slots.map(slotOf),
    outputs: schema.outputs.map(slotOf),
    ...(typeof (schema as { revision?: number }).revision === 'number'
      ? { revision: (schema as { revision?: number }).revision }
      : {}),
    preserveUnknown: true
  }
}

export function selectSchema(typeId: string): SchemaSelection {
  // 试点期间内置 schema 优先：注册表可能已有推断结果，但试点必须固定结构，避免同一配方今天/明天两套槽位
  const pilot = PILOT_SCHEMAS[typeId]
  if (pilot) {
    return { schema: pilot, source: 'builtin', notes: ['使用内置试点 schema（P-C2）'] }
  }
  const registered = getSchema(typeId)
  if (registered) {
    return {
      schema: toNormalizedSchema(registered),
      source: registered.source === 'custom' ? 'pinned' : registered.source,
      notes: [`schema 来自 ${registered.source}（样本 ${registered.sampleCount ?? 0} 条）`]
    }
  }
  return {
    schema: {
      id: typeId,
      layoutKind: 'custom',
      slots: [],
      outputs: [],
      revision: 0,
      preserveUnknown: true
    },
    source: 'generic',
    notes: [`未找到 ${typeId} 的结构化 schema，使用通用模式（仅保留原文，不做字段编辑）`]
  }
}

export { isPilotType }
