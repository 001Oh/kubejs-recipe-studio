/**
 * P-B：Schema / 规范化模型的类型定义。**只加类型与常量，不接线任何现有流程。**
 *
 * 三层：
 *   RawSource（不可变原始） → NormalizedRecipe（按 schema 规范化 + 未认领字段保留） → RecipeDraft（编辑态，见 draftState.ts）
 * 现有 `RecipeRecord` 摘要与 `SlotValue` 编辑槽位保持不变；这里是为后续生成器准备的新模型。
 */
import type { FieldKind, LayoutKind, ModifierSchema, RequirementSpec } from './types'

/** 钉住 schema / schemas.json 的存储格式版本（形状变化才 +1） */
export const SCHEMA_FORMAT_VERSION = 2
/** 草稿（若将来持久化）的格式版本 */
export const DRAFT_FORMAT_VERSION = 1
/** unknowns 常规展开的最大层数 */
export const UNKNOWN_EXPAND_MAX_DEPTH = 3
/** 单个 unknown 条目展开后的最大字节数（超出只留路径与说明，原始数据仍在 RawSource） */
export const UNKNOWN_EXPAND_MAX_BYTES = 8 * 1024

export type JsonPrimitive = string | number | boolean | null

/**
 * 数值型字段（count/amount/chance）必须保留原始 JSON 类型：
 * `0.07` 与 `"0.07"` 在数据包里语义不同（IP 蒸馏塔用字符串概率），规范化不得归一。
 */
export interface Quantity {
  raw: number | string
  /** 便于校验/排序的数值视图；无法解析为数字时为 null，raw 仍然原样保留 */
  numeric: number | null
}

export interface NormalizedRefBase {
  /** 该值在原 JSON 里的位置（校验报错、回写定位都用它） */
  path?: string
}

export interface NormalizedItem extends NormalizedRefBase {
  kind: 'item'
  id: string
  /** 原始对象用的引用键名（item / id …），反解时保持 */
  refKey?: string
  /** 原始里是对象形态（{item:...}）还是裸字符串；反解时保持同形态 */
  asObject?: boolean
  count?: Quantity
  chance?: Quantity
  nbt?: unknown
  /** 引用对象里 schema 未建模的键（如自定义 input 的 type）；编辑时原样带回，绝不静默丢 */
  extras?: Record<string, unknown>
}

export interface NormalizedFluid extends NormalizedRefBase {
  kind: 'fluid'
  id: string
  refKey?: string
  asObject?: boolean
  amount?: Quantity
  chance?: Quantity
  nbt?: unknown
  extras?: Record<string, unknown>
}

export interface NormalizedTag extends NormalizedRefBase {
  kind: 'tag'
  id: string
  refKey?: string
  asObject?: boolean
  count?: Quantity
  chance?: Quantity
  nbt?: unknown
  extras?: Record<string, unknown>
}

export interface NormalizedRegistry extends NormalizedRefBase {
  kind: 'registry'
  registry: string
  id: string
  refKey?: string
  asObject?: boolean
  amount?: Quantity
  nbt?: unknown
  extras?: Record<string, unknown>
}

export interface NormalizedScalar extends NormalizedRefBase {
  kind: 'scalar'
  value: JsonPrimitive
}

export interface NormalizedStruct extends NormalizedRefBase {
  kind: 'struct'
  fields: Record<string, NormalizedValue>
  /** struct 内部未被 schema 认领的子键（P-C 专项：不得丢失） */
  unknowns?: UnknownField[]
}

export interface NormalizedNested extends NormalizedRefBase {
  kind: 'nested'
  typeId: string
  slots: NormalizedSlot[]
  unknowns: UnknownField[]
}

export interface NormalizedBlockState extends NormalizedRefBase {
  kind: 'blockstate'
  block: string
  props: Record<string, string | string[] | { min: string; max: string }>
}

export interface NormalizedUnknownValue extends NormalizedRefBase {
  kind: 'unknown'
  /** 原值（JSON 安全类型），不丢数据 */
  value: unknown
}

export type NormalizedValue =
  | NormalizedItem
  | NormalizedFluid
  | NormalizedTag
  | NormalizedRegistry
  | NormalizedScalar
  | NormalizedStruct
  | NormalizedNested
  | NormalizedBlockState
  | NormalizedUnknownValue
  | { kind: 'list'; of: (NormalizedValue | null)[]; path?: string }

export interface NormalizedSlot {
  key: string
  value: NormalizedValue | null
  path?: string
  /** 原 JSON 里该字段是单值还是数组（schema.multiple 与实际不符时用于诊断） */
  wasArray?: boolean
}

export type UnknownReason = 'not-in-schema' | 'ambient-condition' | 'dynamic'

export interface UnknownField {
  /** JSON 路径，数组用 [i]，如 $.secondaries[0].chance */
  path: string
  /**
   * 条目的原始值（B121/S-1 起一律保存原文，不再置 undefined）——
   * 展示层用限幅视图，反解（struct 回写）用原始值保真；RawSource.raw 仍另存完整原文。
   */
  value?: unknown
  reason: UnknownReason
  /** 是否因深度上限被截断（深层只留类型骨架，用于展示估算） */
  truncatedDepth?: boolean
  /** 是否因超出单条字节数上限被截断（与 truncatedDepth 互不蕴含） */
  truncatedBytes?: boolean
  /** 展开字节数（超过 UNKNOWN_EXPAND_MAX_BYTES 时只记数字） */
  bytes?: number
}

export type PartialReason =
  | 'unmapped-type'
  | 'unclaimed-keys'
  | 'unknown-ref'
  | 'dynamic-script'
  | 'parse-failed'
  | 'ambient-conditions'
  | 'unknowns-truncated'

export interface NormalizedPartial {
  isPartial: boolean
  reasons: PartialReason[]
}

export type RecipeSourceKind = 'jar' | 'datapack' | 'kubejs'

export interface RawSource {
  uid: string
  source: RecipeSourceKind
  sourcePath: string
  jarPath?: string
  entryPath?: string
  /** 原始 JSON 文本（未解析或需要文本级保留时用） */
  rawText?: string
  /** 原始 JSON 对象（未修改的深拷贝，规范化不写它） */
  raw?: unknown
  /** kubejs 脚本里含变量/插值时为 true，表示只能原样保留 */
  dynamic: boolean
}

export interface SchemaRef {
  id: string
  revision?: number
  source?: 'plugin' | 'builtin' | 'jar' | 'inferred' | 'custom'
}

export interface NormalizedRecipe {
  typeId: string
  schemaRef: SchemaRef
  slots: NormalizedSlot[]
  unknowns: UnknownField[]
  partial: NormalizedPartial
  /** canonicalStringify(raw) 的 sha1，用作冲突检测 */
  rawHash: string
  source: RawSource
}

/** 规范化输入所需的 schema 视图：只依赖这些字段，不依赖 registry/Electron */
export interface NormalizedSchemaSlot {
  key: string
  kind: FieldKind
  multiple: boolean
  required?: boolean
  registry?: string
  /** 该槽位在原 JSON 里的真实键名（缺省 = key） */
  jsonKey?: string
  /** 与主键同层/同对象内的配对键（count/amount/chance），规范化时合并、反解时还原 */
  compound?: string[]
  /** 生成形态（v1 字段，保留兼容） */
  emitShape?: 'key' | 'object' | 'scalar' | 'positional'
  /** v2：生成的键名与形态（优先于 emitShape） */
  emit?: { key?: string; shape?: 'key' | 'object' | 'scalar' | 'positional' }
  /** v2：字段约束（校验器直接消费；缺省时可用调用方注入的约束表覆盖） */
  constraints?: SlotConstraints
  /** struct 子字段 */
  fields?: NormalizedSchemaSlot[]
  /** 反解时把 compound 键写回哪一层：'sibling'（父对象，默认）或 'inner'（值对象内部） */
  compoundPlacement?: 'sibling' | 'inner'
  /**
   * B121/S-2：以下为「声明侧（L0 SlotInit / 插件槽位）→ 注册表 → 规范化视图」必须
   * 全链透传的语义字段。此前 convSlot/slotOf 各丢一批，L0 精校声明到达编辑器时只剩骨架。
   */
  /** 视觉区（与 RecipeSlotSchema.zone 同义）；缺省由装配方按 slots/outputs 归位 */
  zone?: 'input' | 'output' | 'extra'
  role?: 'requirement' | 'input' | 'output' | 'extra'
  /** 语法糖能否表达该字段（false + 用户填值 → 通道降级） */
  sugarSupported?: boolean
  choices?: { value: string; label: string; color?: string }[]
  defaultValue?: unknown
  /** 首项固定约束（AE2 transform 等） */
  firstItemMust?: string
  orientation?: 'vertical' | 'horizontal'
  description?: string
  /** 构造期精确措辞（仅 L0 内部使用，物化后由 displayName 消费） */
  label?: string
}

export interface NormalizedSchema {
  id: string
  layoutKind: LayoutKind
  slots: NormalizedSchemaSlot[]
  outputs: NormalizedSchemaSlot[]
  revision?: number
  preserveUnknown?: boolean
  /** 产物是否支持概率字段（仅影响试点 UI 的展示，不改变规范化规则） */
  supportsChance?: boolean
  /**
   * B121/S-2：schema 级声明（原 SchemaInit 独有），物化时透传、装配时还原到
   * RecipeTypeSchema——emit 是语法糖目标的唯一 L0 来源，此前被 materializeRaw 丢弃。
   */
  /** 语法糖目标（`event.recipes.<ns>.<method>`）；null = 明确无糖，不得回落 VANILLA_TARGETS */
  emit?: string | null
  modifiers?: ModifierSchema[]
  requirements?: RequirementSpec[]
  notes?: string[]
  grid?: { rows: number; cols: number; maxRows?: number; maxCols?: number }
  /** custom 布局的格子坐标数组 */
  cells?: { key: string; row: number; col: number }[]
  docUrl?: string
}

export type DiagnosticCode =
  | 'REQUIRED_MISSING'
  | 'TYPE_MISMATCH'
  | 'ENUM_INVALID'
  | 'RANGE_INVALID'
  | 'INTEGER_INVALID'
  | 'PATTERN_INVALID'
  | 'MUST_BE_INVALID'
  | 'ITEMS_COUNT_INVALID'
  | 'CHANCE_OUT_OF_RANGE'
  | 'FLUID_AMOUNT_INVALID'
  | 'REF_UNKNOWN_ITEM'
  | 'UNKNOWN_FIELD_PRESERVED'
  | 'UNKNOWN_TRUNCATED'
  | 'SUGAR_UNSUPPORTED'
  | 'NBT_INVALID'
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'SCHEMA_MIGRATION_FAILED'
  | 'RAW_UNAVAILABLE'
  | 'SCHEMA_GENERIC'
  | 'TYPE_UNMAPPED'
  | 'PARTIAL_RECIPE'

export type DiagnosticSeverity = 'error' | 'warn' | 'info'

export interface SchemaDiagnostic {
  level: DiagnosticSeverity
  code: DiagnosticCode
  message: string
  /** schema 槽位键 */
  field?: string
  /** JSON 路径，精确定位到值 */
  path?: string
  hint?: string
}

export interface SlotConstraints {
  min?: number
  max?: number
  integer?: boolean
  minItems?: number
  maxItems?: number
  enum?: string[]
  pattern?: string
  mustBe?: 'item' | 'fluid' | 'tag' | 'registry'
}
