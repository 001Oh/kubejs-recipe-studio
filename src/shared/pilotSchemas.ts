/**
 * 内置 schema 的唯一来源（原版家族 + 动力合成器）。
 * 主进程 selectSchema 与测试共用这里，避免「测试里另抄一份 schema」造成漂移。
 *
 * U-22 后时代（T-26 白名单废除）：注册表里存在的类型即可结构化编辑；
 * 通用模式（event.custom）只服务「注册表里没有」的类型。
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
  // 原版家族：单输入 + 产物
  'minecraft:stonecutting': {
    id: 'minecraft:stonecutting',
    layoutKind: 'single_io',
    slots: [{ key: 'ingredient', kind: 'item', multiple: false, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  // 锻造：模板 + 基础 + 附加 + 产物
  'minecraft:smithing_transform': {
    id: 'minecraft:smithing_transform',
    layoutKind: 'multi_io',
    slots: [
      { key: 'template', kind: 'item', multiple: false, required: true },
      { key: 'base', kind: 'item', multiple: false, required: true },
      { key: 'addition', kind: 'item', multiple: false, required: true }
    ],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'minecraft:smelting': {
    id: 'minecraft:smelting',
    layoutKind: 'single_io',
    slots: [{ key: 'ingredient', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'minecraft:blasting': {
    id: 'minecraft:blasting',
    layoutKind: 'single_io',
    slots: [{ key: 'ingredient', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'minecraft:smoking': {
    id: 'minecraft:smoking',
    layoutKind: 'single_io',
    slots: [{ key: 'ingredient', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'minecraft:campfire_cooking': {
    id: 'minecraft:campfire_cooking',
    layoutKind: 'single_io',
    slots: [{ key: 'ingredient', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  }
}

/** T-26 白名单废除后：注册表里存在（即 PILOT_SCHEMAS 或后续 L0/插件层）即可结构化 */
export function isPilotType(typeId: string): boolean {
  return typeId in PILOT_SCHEMAS
}
