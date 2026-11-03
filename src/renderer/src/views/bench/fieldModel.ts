/**
 * 字段分层与语义重排（规格 3.4「主/次参数分层」「视觉顺序≠参数顺序」「三级降级」、3.6.13 语义命名）。
 * 纯函数：只看 kind 与字段名语义，绝不出现配方类型 ID 分支。
 */
import type { BenchValues, FieldKind, RecipeSlotSchema, RecipeTypeSchema, RequirementSpec } from '@shared/types'
import { readableFromPath } from '@shared/text'

export type Tier = 'primary' | 'secondary' | 'advanced'
export type Zone = 'input' | 'output' | 'extra'
export type DegradeLevel = 'full' | 'partial' | 'json'

/** 主参数：大槽位区（引用型 + 引用型的组合形态） */
const PRIMARY_KINDS: readonly FieldKind[] = ['item', 'fluid', 'tag', 'registry', 'struct', 'nbt', 'blockstate']
/** 次要参数：小控件聚一行 */
const SECONDARY_KINDS: readonly FieldKind[] = ['number', 'boolean', 'choice', 'text']

export function tierOf(kind: FieldKind): Tier {
  if (kind === 'unknown') return 'advanced'
  if (SECONDARY_KINDS.includes(kind)) return 'secondary'
  if (PRIMARY_KINDS.includes(kind)) return 'primary'
  return 'advanced'
}

export function isReferenceKind(kind: FieldKind): boolean {
  return kind === 'item' || kind === 'fluid' || kind === 'tag' || kind === 'registry'
}

const OUTPUT_HINTS = ['output', 'result', 'byproduct', 'secondar', 'slag', 'product']
const INPUT_HINTS = ['input', 'ingredient', 'catalyst', 'template', 'additive', 'mold', 'die', 'tool', 'fuel', 'catalis']

/** 视觉区：schema 显式声明优先，其次 role，最后按字段名语义（规格 3.4 判定规则） */
export function zoneOf(field: RecipeSlotSchema): Zone {
  if (field.zone) return field.zone
  if (field.role === 'output') return 'output'
  if (field.role === 'input') return 'input'
  if (field.role === 'requirement') return 'extra'
  const key = normalizeKey(field.key)
  if (OUTPUT_HINTS.some((h) => key.includes(h))) return 'output'
  if (INPUT_HINTS.some((h) => key.includes(h))) return 'input'
  return 'extra'
}

function normalizeKey(key: string): string {
  return camelToSnake(key).toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function camelToSnake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
}

/** 全部可声明字段：slots + outputs + extraFields，去掉被配对合并吃掉的原始键（3.6.12 compound） */
export function declaredFields(schema: RecipeTypeSchema | null): RecipeSlotSchema[] {
  if (!schema) return []
  const merged = [...schema.slots, ...schema.outputs, ...(schema.extraFields ?? [])]
  const consumed = new Set<string>(merged.flatMap((f) => (f.compound ?? []).map((c) => c)))
  const seen = new Set<string>()
  const out: RecipeSlotSchema[] = []
  for (const field of merged) {
    if (consumed.has(field.key) || seen.has(field.key)) continue
    seen.add(field.key)
    out.push(field)
  }
  return out
}

export interface FieldBuckets {
  inputs: RecipeSlotSchema[]
  outputs: RecipeSlotSchema[]
  /** 下方附加区的主参数（既非材料也非产物） */
  extras: RecipeSlotSchema[]
  /** 次要参数行（number/boolean/choice/text） */
  secondaries: RecipeSlotSchema[]
  /** 高级参数折叠区（unknown） */
  advanced: RecipeSlotSchema[]
  /** 前置条件字段（role=requirement，同时进摘要条） */
  requirements: RecipeSlotSchema[]
}

const emptyBuckets = (): FieldBuckets => ({
  inputs: [],
  outputs: [],
  extras: [],
  secondaries: [],
  advanced: [],
  requirements: []
})

/** 一次分区，供 BenchView / ZoneBoard / SecondaryPanel / AdvancedPanel 各自取用 */
export function bucketFields(schema: RecipeTypeSchema | null): FieldBuckets {
  const buckets = emptyBuckets()
  for (const field of declaredFields(schema)) {
    if (field.role === 'requirement') buckets.requirements.push(field)
    const tier = tierOf(field.kind)
    if (tier === 'advanced') {
      buckets.advanced.push(field)
      continue
    }
    if (tier === 'secondary') {
      buckets.secondaries.push(field)
      continue
    }
    const zone = zoneOf(field)
    if (zone === 'output') buckets.outputs.push(field)
    else if (zone === 'input') buckets.inputs.push(field)
    else buckets.extras.push(field)
  }
  return buckets
}

/** 全部可声明字段（含 struct 子键的完整路径），用于撤销时的键匹配与 kind/zone 查询 */
export function flattenFields(fields: RecipeSlotSchema[], prefix = ''): RecipeSlotSchema[] {
  const out: RecipeSlotSchema[] = []
  for (const field of fields) {
    const key = prefix ? `${prefix}.${field.key}` : field.key
    out.push({ ...field, key })
    if (field.kind === 'struct' && field.fields && field.fields.length > 0) {
      out.push(...flattenFields(field.fields, key))
    }
  }
  return out
}

export function allFieldsFlat(schema: RecipeTypeSchema | null): RecipeSlotSchema[] {
  return flattenFields(declaredFields(schema))
}

export function degradeOf(schema: RecipeTypeSchema | null): DegradeLevel {
  if (!schema) return 'json'
  const fields = declaredFields(schema)
  if (fields.length === 0) return 'json'
  return fields.some((f) => f.kind === 'unknown') ? 'partial' : 'full'
}

/** 内置词典（规格 3.6.13 第 1 层）：只映射语义，不代表任何配方类型 */
const NAME_DICT: Record<string, string> = {
  output: '产物',
  outputs: '产物列表',
  result: '产物',
  results: '产物列表',
  result_item: '产物物品',
  input: '输入',
  inputs: '输入列表',
  ingredient: '材料',
  ingredients: '材料',
  base_ingredient: '基础材料',
  additives: '副材料',
  secondaries: '概率副产物',
  byproducts: '副产物',
  slag: '废渣',
  catalyst: '催化剂',
  template: '模板',
  mold: '模具',
  die: '模具',
  tool: '工具',
  fuel: '燃料',
  activation_item: '激活物',
  activator: '激活物',
  pentacle_id: '法阵等级',
  ritual: '仪式（JEI 占位物品）',
  require_sacrifice: '仪式中需活体献祭',
  require_item_use: '需手持物品右键',
  infusion_input: '灌注物',
  gas: '气体',
  gas_input: '气体输入',
  gas_output: '气体输出',
  slurry_input: '浆液输入',
  slurry_output: '浆液输出',
  pigment: '色素',
  stack: '化学品',
  fluid: '流体',
  fluid_input: '流体输入',
  fluid_output: '流体输出',
  energy: '能量',
  time: '时长',
  processing_time: '处理时长',
  duration: '持续时间',
  mana: '魔力',
  source: '源质',
  blood: '血液量',
  pressure: '压力',
  temperature: '温度',
  heat: '加热',
  water: '需水量',
  count: '数量',
  amount: '用量',
  chance: '概率',
  loops: '循环次数',
  transitional_item: '过渡物品',
  steps: '序列步骤',
  tier: '等级',
  level: '等级',
  research: '研究进度',
  structure: '结构',
  dimension: '维度',
  chalk_color: '粉笔颜色'
}

/** 语义显示名三层回退：schema.displayName → 词典 → 命名规律 → 原样可读化 */
export function fieldLabel(field: RecipeSlotSchema): string {
  const declared = field.displayName?.trim()
  if (declared) return declared
  const key = normalizeKey(field.key)
  const dict = NAME_DICT[key] ?? NAME_DICT[key.replace(/s$/, '')]
  if (dict) return dict
  const body = readableFromPath(key.replace(/_/g, ' ')) || field.key
  if (/^require_/.test(key)) return `需要${body.replace(/^需要/, '')}`
  if (key.endsWith('_mod') || /mod$/.test(key)) return `${body} 倍率`
  if (key.endsWith('_item')) return `${body} 物品`
  if (key.endsWith('_tag')) return `${body} 标签`
  if (key.endsWith('_id')) return `${body} 类型`
  return body
}

/** 布尔开关写成完整句子（规格 3.4 B.5） */
export function booleanSentence(field: RecipeSlotSchema): string {
  const label = fieldLabel(field)
  return /[需要允许禁]|了/.test(label) ? label : `需要${label}`
}

/** 激活物字段：琥珀边框 + 「激活」角标（由字段语义判定，不按配方类型判定） */
export function isActivatorField(field: RecipeSlotSchema): boolean {
  const key = normalizeKey(field.key)
  if (/^(activation|activator|ritual_item|focus_item)/.test(key)) return true
  return fieldLabel(field).includes('激活')
}

/** 长列表（仪式材料 12 项、花瓣药房）改用网格而非纵向列表：容量 ≥8 即网格 */
export function prefersGrid(field: RecipeSlotSchema, currentLength: number): boolean {
  const capacity = Math.max(field.max ?? 0, currentLength)
  return capacity >= 8
}

export function requirementKindOf(key: string): RequirementSpec['kind'] {
  const k = normalizeKey(key)
  if (/time|day|night|hour/.test(k)) return 'time'
  if (/dimension|level|world/.test(k)) return 'dimension'
  if (/research|progress|knowledge/.test(k)) return 'research'
  if (/structure|pentacle|altar|matrix|shape|block/.test(k)) return 'structure'
  return 'other'
}

function displayValueOf(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return String(value.length)
  return ''
}

/** 前置条件摘要条：schema.requirements 打底 + role='requirement' 字段的当前值追加（3.6.13） */
export function requirementItems(schema: RecipeTypeSchema | null, values: BenchValues): RequirementSpec[] {
  if (!schema) return []
  const items: RequirementSpec[] = [...(schema.requirements ?? [])]
  for (const field of bucketFields(schema).requirements) {
    const text = displayValueOf(values[field.key])
    if (!text) continue
    items.push({ kind: requirementKindOf(field.key), text: `${fieldLabel(field)} · ${text}` })
  }
  return items
}

/** 字段当前值的简短文本（tooltip / 摘要条共用） */
export function valueSummary(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} 项`
  return displayValueOf(value)
}
