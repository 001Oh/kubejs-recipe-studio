/**
 * L0 内置精校库的构造工具（规格 3.6.9）。
 * 定位是**体验优化层**，不是覆盖手段：字段名不确定的一律不写，交给 L1 从本包样本反推
 * （禁止事项 8：不为"齐全"编造字段名）。这里只声明「布局 + 语法糖目标 + 有把握的字段」，
 * `builtin.ts` 在物化时补显示名与「未在本包验证」的能力注记。
 */
import type { EmitShape, FieldKind, LayoutKind, ModifierSchema, RecipeSlotSchema, RequirementSpec } from '../../shared/types'

/** 未物化的槽位：displayName 交给 naming 词典补齐，`label` 只用于少数需要精确措辞的字段。 */
export interface SlotInit extends Omit<Partial<RecipeSlotSchema>, 'key' | 'kind' | 'fields'> {
  key: string
  kind: FieldKind
  label?: string
  fields?: SlotInit[]
}

export interface SchemaInit {
  modDisplayName: string
  layout: LayoutKind
  /** 有把握时才填；null → event.custom / 数据包 JSON（禁止事项 14/16/17） */
  emit?: string | null
  displayName?: string
  slots?: SlotInit[]
  outputs?: SlotInit[]
  extra?: SlotInit[]
  modifiers?: ModifierSchema[]
  requirements?: RequirementSpec[]
  notes?: string[]
  grid?: { rows: number; cols: number; maxRows?: number; maxCols?: number }
  cells?: { key: string; row: number; col: number }[]
  supportsChance?: boolean
  docUrl?: string
  /** 字段名是否来自规格 / 官方数据文件（true）还是仅布局与语法糖目标（false） */
  fieldsVerified?: boolean
  /** 未验证字段的说明，物化时并入 capabilityNote */
  note?: string
}

export interface RawSchema {
  id: string
  modId: string
  init: SchemaInit
}

export function s(key: string, kind: FieldKind, init: Partial<SlotInit> = {}): SlotInit {
  return { key, kind, multiple: false, ...init }
}

/** 输入槽（视觉左侧）。 */
export function input(key: string, kind: FieldKind, init: Partial<SlotInit> = {}): SlotInit {
  return { key, kind, multiple: false, zone: 'input', ...init }
}

/** 产物槽（视觉右侧）。 */
export function output(key: string, kind: FieldKind, init: Partial<SlotInit> = {}): SlotInit {
  return { key, kind, multiple: false, zone: 'output', role: 'output', ...init }
}

/** 附加区数值 / 开关（耗能、耗时、概率一类修饰性参数）。 */
export function extra(key: string, kind: FieldKind, init: Partial<SlotInit> = {}): SlotInit {
  return { key, kind, multiple: false, zone: 'extra', role: 'extra', ...init }
}

export function shape(key: string, init: Partial<SlotInit> = {}): SlotInit {
  return { key, kind: 'item', multiple: true, zone: 'input', ...init }
}

export function emit(ns: string, method: string): string {
  return `event.recipes.${ns}.${method}`
}

export function sugar(method: string): string {
  return `event.${method}`
}

export function raw(id: string, modId: string, init: SchemaInit): RawSchema {
  return { id, modId, init }
}

/** 语法糖只能表达前 3 个参数的类型（IE 电弧炉）：能量 / 时间 / 概率副产物必须标 sugarSupported:false。 */
export function noSugar(slot: SlotInit): SlotInit {
  return { ...slot, sugarSupported: false }
}

export function objectShape(shape: EmitShape, slot: SlotInit): SlotInit {
  return { ...slot, emitShape: shape }
}
