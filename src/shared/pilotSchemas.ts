/**
 * 试点内置 schema（P-C1/P-C2 白名单类型）的唯一来源。
 * 主进程 selectSchema 与测试共用这里，避免「测试里另抄一份 schema」造成漂移。
 */
import type { NormalizedSchema } from './schemaModel'

export const PILOT_SCHEMAS: Record<string, NormalizedSchema> = {
  'minecraft:crafting_shaped': {
    id: 'minecraft:crafting_shaped',
    layoutKind: 'shaped',
    slots: [],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'minecraft:crafting_shapeless': {
    id: 'minecraft:crafting_shapeless',
    layoutKind: 'shapeless',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'create:mixing': {
    id: 'create:mixing',
    layoutKind: 'multi_io',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'results', kind: 'item', multiple: true }],
    revision: 1,
    preserveUnknown: true,
    supportsChance: true
  }
}

export function isPilotType(typeId: string): boolean {
  return typeId in PILOT_SCHEMAS
}
