/**
 * 插件 manifest 的解析与校验（规格 3.6.14）。手写守卫，不引入 schema 库。三条硬要求：
 * 1. 校验失败必须点名具体字段（`field` + 中文说明），作者照着报错就能改文件；
 * 2. 插件可以只声明一部分（例如只给 fieldNames）——除 id/name/version 外全部可选；
 * 3. 单条 recipeTypes / 单个槽位坏掉只丢那一条并记 warning，绝不牵连整个插件。
 * 槽位字段名与共享类型 RecipeSlotSchema 一致，作者抄 schema 不必学第二套词汇。
 */
import type { EmitShape, FieldKind, LayoutKind, ModifierSchema, RecipeSlotSchema, RecipeTypeSchema, RequirementSpec } from '../../shared/types'

/** 内置布局原语白名单：插件不得自定义 UI 组件 */
export const LAYOUT_KINDS: readonly LayoutKind[] = ['shaped', 'shapeless', 'single_io', 'multi_io', 'sequence', 'custom']
export const FIELD_KINDS: readonly FieldKind[] = ['item', 'fluid', 'tag', 'registry', 'number', 'boolean', 'choice', 'text', 'struct', 'nbt', 'blockstate', 'unknown']
const EMIT_SHAPES = ['scalar', 'object', 'positional']
const ROLES = ['requirement', 'input', 'output', 'extra']
const ZONES = ['input', 'output', 'extra']
const REQ_KINDS = ['structure', 'time', 'dimension', 'research', 'other']
const KNOWN_TOP_KEYS = ['id', 'name', 'version', 'author', 'appVersion', 'mods', 'kubejsAddon', 'recipeTypes', 'fieldNames', 'valueNames', 'virtualItemPatterns', 'hooks', 'description', 'homepage']
const KNOWN_TYPE_KEYS = ['id', 'displayName', 'modId', 'modDisplayName', 'layoutKind', 'emitTarget', 'customTemplate', 'slots', 'outputs', 'extraFields', 'modifiers', 'requirements', 'notes', 'grid', 'cells', 'supportsChance', 'docUrl']

export interface ManifestIssue {
  field: string; message: string
}

/** 槽位声明 = 共享槽位类型 + 一个只用于取枚举值的语法糖字段 */
export type PluginSlotDecl = RecipeSlotSchema & { choicesSource?: string }

export type PluginTypeDecl = Pick<RecipeTypeSchema, 'id' | 'displayName' | 'modId' | 'layoutKind' | 'slots' | 'outputs' | 'extraFields'> & {
  emitTarget: string | null
} & Partial<Pick<RecipeTypeSchema, 'modDisplayName' | 'customTemplate' | 'modifiers' | 'requirements' | 'notes' | 'grid' | 'cells' | 'docUrl' | 'supportsChance'>>

export interface PluginManifestCore {
  id: string; name: string; version: string; author?: string; appVersion?: string; mods?: string[]; kubejsAddon?: string | null
  typeDecls: PluginTypeDecl[]
  fieldNames: Record<string, string>
  valueNames: Record<string, string>
  virtualItemPatterns: string[]
  /** typeId → 相对插件目录的钩子文件名；不写 hooks 的 JSON 插件永不执行任何代码 */
  hooks: Record<string, string>
}

export interface ManifestParseResult {
  /** null 表示 manifest 本体不可用（致命错误） */
  data: PluginManifestCore | null; errors: ManifestIssue[]; warnings: ManifestIssue[]
}

export const formatIssue = (issue: ManifestIssue): string => `${issue.field}：${issue.message}`
export const formatIssues = (issues: ManifestIssue[]): string => issues.map(formatIssue).join('；')

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function strOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function numOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function strArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.map(strOf)
  return out.every((s): s is string => s !== null) ? out : null
}

/** 白名单枚举取值；命中返回该值，未命中记 warning 并返回 null */
function enumOf(value: unknown, allowed: string[], field: string, res: ManifestParseResult): string | null {
  const s = strOf(value)
  if (!s) return null
  if (allowed.includes(s)) return s
  res.warnings.push({ field, message: `取值 "${s}" 不在允许列表 [${allowed.join(' / ')}]，已忽略` })
  return null
}

function unknownKeys(obj: Record<string, unknown>, allowed: string[], field: string, res: ManifestParseResult): void {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) res.warnings.push({ field: `${field}.${key}`, message: '未知字段，已忽略' })
}

function dictOf(value: unknown, field: string, res: ManifestParseResult): Record<string, string> {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) return res.warnings.push({ field, message: '应为 { "键": "中文名" } 对象，已忽略' }), {}
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(value)) {
    const s = strOf(val)
    if (s) out[key] = s
    else res.warnings.push({ field: `${field}.${key}`, message: '值必须是非空字符串，已忽略该项' })
  }
  return out
}

function choicesOf(value: unknown, field: string, res: ManifestParseResult): { value: string; label: string }[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return res.warnings.push({ field, message: '应为数组，已忽略' }), undefined
  const out: { value: string; label: string }[] = []
  for (const entry of value) {
    const inline = strOf(entry)
    if (inline) out.push({ value: inline, label: inline })
    else if (isRecord(entry)) {
      const v = strOf(entry['value'])
      if (v) out.push({ value: v, label: strOf(entry['label']) ?? v })
      else res.warnings.push({ field, message: '选项缺少 value，已忽略该项' })
    }
  }
  return out.length > 0 ? out : undefined
}

function parseSlot(raw: unknown, path: string, res: ManifestParseResult): PluginSlotDecl | null {
  if (!isRecord(raw)) return res.warnings.push({ field: path, message: '槽位应为对象，已忽略' }), null
  const key = strOf(raw['key'])
  if (!key) return res.warnings.push({ field: `${path}.key`, message: '缺少 key，该槽位被丢弃' }), null
  const rawKind = strOf(raw['kind'])
  let kind = rawKind
  if (rawKind && !FIELD_KINDS.includes(rawKind as FieldKind)) {
    res.warnings.push({ field: `${path}.kind`, message: `未知控件形态 "${rawKind}"，已按 unknown 归入高级参数` })
    kind = 'unknown'
  }
  const children = Array.isArray(raw['fields']) ? parseSlotList(raw['fields'], `${path}.fields`, res) : undefined
  const slot: PluginSlotDecl = {
    key, displayName: strOf(raw['displayName']) ?? key, kind: (kind ?? 'unknown') as FieldKind,
    multiple: raw['multiple'] === true, required: raw['required'] === true || undefined,
    min: numOf(raw['min']), max: numOf(raw['max']), registry: strOf(raw['registry']) ?? undefined,
    emitShape: (enumOf(raw['emitShape'], EMIT_SHAPES, `${path}.emitShape`, res) as EmitShape | null) ?? undefined,
    role: (enumOf(raw['role'], ROLES, `${path}.role`, res) as RecipeSlotSchema['role'] | null) ?? undefined,
    zone: (enumOf(raw['zone'], ZONES, `${path}.zone`, res) as RecipeSlotSchema['zone'] | null) ?? undefined,
    defaultValue: raw['defaultValue'], choices: choicesOf(raw['choices'], `${path}.choices`, res),
    choicesSource: strOf(raw['choicesSource']) ?? undefined, compound: strArray(raw['compound']) ?? undefined,
    sugarSupported: raw['sugarSupported'] === false ? false : undefined,
    orientation: (enumOf(raw['orientation'], ['vertical', 'horizontal'], `${path}.orientation`, res) as 'vertical' | null) ?? undefined,
    firstItemMust: strOf(raw['firstItemMust']) ?? undefined, description: strOf(raw['description']) ?? undefined,
    ...(children && children.length > 0 ? { fields: children } : {})
  }
  if (slot.kind === 'choice' && !slot.choices && !slot.choicesSource) {
    res.warnings.push({ field: `${path}.choices`, message: 'choice 槽位既未给 choices 也未给 choicesSource，暂按文本处理' })
    slot.kind = 'text'
  }
  return slot
}

function parseSlotList(raw: unknown, path: string, res: ManifestParseResult): PluginSlotDecl[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return res.warnings.push({ field: path, message: '应为数组，已忽略' }), []
  return raw.map((entry, i) => parseSlot(entry, `${path}[${i}]`, res)).filter((s): s is PluginSlotDecl => s !== null)
}

function requirementsOf(raw: unknown, path: string, res: ManifestParseResult): RequirementSpec[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: RequirementSpec[] = []
  raw.forEach((entry, i) => {
    const inline = strOf(entry)
    if (inline) out.push({ kind: 'other', text: inline })
    else if (isRecord(entry)) {
      const text = strOf(entry['text'])
      if (text) out.push({ kind: (enumOf(entry['kind'], REQ_KINDS, `${path}[${i}].kind`, res) ?? 'other') as RequirementSpec['kind'], text })
      else res.warnings.push({ field: `${path}[${i}].text`, message: '前置条件缺少 text，已忽略' })
    }
  })
  return out.length > 0 ? out : undefined
}

function modifiersOf(raw: unknown, path: string, res: ManifestParseResult): ModifierSchema[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ModifierSchema[] = []
  raw.forEach((entry, i) => {
    const key = isRecord(entry) ? strOf(entry['key']) : null
    const kind = isRecord(entry) ? enumOf(entry['kind'], ['boolean', 'number'], `${path}[${i}].kind`, res) : null
    if (!key || !kind) return res.warnings.push({ field: `${path}[${i}]`, message: '修饰符需要 key 与 kind(boolean|number)，已忽略' })
    const chain = isRecord(entry) && entry['chain'] !== undefined ? (entry['chain'] === null ? null : strOf(entry['chain'])) : undefined
    const min = isRecord(entry) ? numOf(entry['min']) : undefined
    const max = isRecord(entry) ? numOf(entry['max']) : undefined
    const displayName = isRecord(entry) ? strOf(entry['displayName']) : null
    out.push({ key, kind: kind as 'boolean' | 'number', displayName: displayName ?? key, ...(chain !== undefined ? { chain } : {}), min, max })
  })
  return out.length > 0 ? out : undefined
}

function gridOf(raw: unknown, path: string, res: ManifestParseResult): RecipeTypeSchema['grid'] {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) return res.warnings.push({ field: `${path}.grid`, message: '应为 { rows, cols } 对象，已忽略' }), undefined
  const rows = numOf(raw['rows'])
  const cols = numOf(raw['cols'])
  if (rows === undefined || cols === undefined) return res.warnings.push({ field: `${path}.grid`, message: '需要数值 rows 与 cols，已忽略' }), undefined
  const maxRows = numOf(raw['maxRows'])
  const maxCols = numOf(raw['maxCols'])
  return { rows, cols, ...(maxRows !== undefined ? { maxRows } : {}), ...(maxCols !== undefined ? { maxCols } : {}) }
}

function cellsOf(raw: unknown, path: string, res: ManifestParseResult): RecipeTypeSchema['cells'] {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return res.warnings.push({ field: `${path}.cells`, message: '应为数组，已忽略' }), undefined
  const out: { key: string; row: number; col: number }[] = []
  for (const entry of raw) {
    const key = isRecord(entry) ? strOf(entry['key']) : null
    const row = isRecord(entry) ? numOf(entry['row']) : undefined
    const col = isRecord(entry) ? numOf(entry['col']) : undefined
    if (key && row !== undefined && col !== undefined) out.push({ key, row, col })
    else res.warnings.push({ field: `${path}.cells`, message: '每项需要 key 与数值 row/col，已忽略该项' })
  }
  return out.length > 0 ? out : undefined
}

function parseTypeDecl(raw: unknown, index: number, res: ManifestParseResult, pluginId: string): PluginTypeDecl | null {
  const path = `recipeTypes[${index}]`
  if (!isRecord(raw)) return res.warnings.push({ field: path, message: '配方类型声明应为对象，该条已丢弃' }), null
  unknownKeys(raw, KNOWN_TYPE_KEYS, path, res)
  const id = strOf(raw['id'])
  if (!id) return res.warnings.push({ field: `${path}.id`, message: '缺少配方类型 ID（如 "occultism:ritual"），该条已丢弃' }), null
  if (!id.includes(':')) res.warnings.push({ field: `${path}.id`, message: '类型 ID 建议写成 "命名空间:名称"，已按原样使用' })
  // 布局只认六个内置原语：插件不得带自定义 UI 组件（规格 3.6.14），也不给第二条含糊的枚举告警
  const layoutValue = strOf(raw['layoutKind'])
  const layout = layoutValue && (LAYOUT_KINDS as readonly string[]).includes(layoutValue) ? (layoutValue as LayoutKind) : null
  if (!layout) {
    res.warnings.push({
      field: `${path}.layoutKind`,
      message: `只允许内置布局 [${LAYOUT_KINDS.join(' / ')}]，收到 "${layoutValue ?? '未填'}"，该条已丢弃（插件不得自定义 UI 组件）`
    })
    return null
  }
  const emitTarget = raw['emitTarget'] === null ? null : strOf(raw['emitTarget'])
  const template = isRecord(raw['customTemplate']) ? (raw['customTemplate'] as Record<string, unknown>) : undefined
  const slots = parseSlotList(raw['slots'], `${path}.slots`, res)
  const outputs = parseSlotList(raw['outputs'], `${path}.outputs`, res)
  const extraFields = parseSlotList(raw['extraFields'], `${path}.extraFields`, res)
  if (slots.length === 0 && outputs.length === 0 && !template && !emitTarget) {
    return res.warnings.push({ field: path, message: '既无 slots/outputs 也无 emitTarget/customTemplate，对表单无贡献，该条已丢弃' }), null
  }
  const notes = strArray(raw['notes']) ?? undefined
  const requirements = requirementsOf(raw['requirements'], `${path}.requirements`, res)
  const modifiers = modifiersOf(raw['modifiers'], `${path}.modifiers`, res)
  const modDisplayName = strOf(raw['modDisplayName'])
  const docUrl = strOf(raw['docUrl'])
  const grid = gridOf(raw['grid'], path, res)
  const cells = cellsOf(raw['cells'], path, res)
  return {
    id, displayName: strOf(raw['displayName']) ?? id, modId: strOf(raw['modId']) ?? id.split(':')[0] ?? pluginId,
    layoutKind: layout as LayoutKind, emitTarget: emitTarget ?? null, slots, outputs, extraFields,
    ...(modDisplayName ? { modDisplayName } : {}), ...(template ? { customTemplate: template } : {}),
    ...(modifiers ? { modifiers } : {}), ...(requirements ? { requirements } : {}), ...(notes ? { notes } : {}),
    ...(grid ? { grid } : {}), ...(cells ? { cells } : {}), ...(docUrl ? { docUrl } : {}),
    ...(raw['supportsChance'] === true ? { supportsChance: true } : {})
  }
}

export function parseManifest(raw: unknown): ManifestParseResult {
  const res: ManifestParseResult = { data: null, errors: [], warnings: [] }
  if (!isRecord(raw)) {
    res.errors.push({ field: '(根节点)', message: 'manifest 应为 JSON 对象' })
    return res
  }
  unknownKeys(raw, KNOWN_TOP_KEYS, 'manifest', res)
  const id = strOf(raw['id'])
  const name = strOf(raw['name'])
  const version = strOf(raw['version'])
  if (!id) res.errors.push({ field: 'id', message: '缺少非空字符串 id' })
  if (!name) res.errors.push({ field: 'name', message: '缺少非空字符串 name' })
  if (!version) res.errors.push({ field: 'version', message: '缺少非空字符串 version（如 "1.0.0"）' })
  if (res.errors.length > 0) return res
  // 上面已拦掉缺字段，这里的兜底只为让 TS 与运行期都拿到完整字符串
  const pluginId = id ?? 'unnamed-plugin'
  const mods = Array.isArray(raw['mods']) ? strArray(raw['mods']) ?? undefined : undefined
  if (Array.isArray(raw['mods']) && !mods) res.warnings.push({ field: 'mods', message: '应为非空字符串数组，已忽略' })
  const patterns = Array.isArray(raw['virtualItemPatterns']) ? strArray(raw['virtualItemPatterns']) ?? undefined : undefined
  if (Array.isArray(raw['virtualItemPatterns']) && !patterns) res.warnings.push({ field: 'virtualItemPatterns', message: '应为非空字符串数组，已忽略' })
  const addon = raw['kubejsAddon'] === null ? null : strOf(raw['kubejsAddon'])
  if (raw['kubejsAddon'] !== undefined && raw['kubejsAddon'] !== null && !addon) res.warnings.push({ field: 'kubejsAddon', message: '应为字符串或 null，已忽略' })
  const hooks: Record<string, string> = {}
  if (raw['hooks'] !== undefined && raw['hooks'] !== null) {
    if (!isRecord(raw['hooks'])) res.warnings.push({ field: 'hooks', message: '应为 { "类型ID": "钩子.js" } 对象，已忽略' })
    else for (const [key, val] of Object.entries(raw['hooks'])) {
      const file = strOf(val)
      if (file && /\.(js|cjs)$/.test(file)) hooks[key] = file
      else res.warnings.push({ field: `hooks.${key}`, message: '钩子必须是 .js / .cjs 文件名，已忽略' })
    }
  }
  const declaredTypes = raw['recipeTypes']
  if (declaredTypes !== undefined && declaredTypes !== null && !Array.isArray(declaredTypes)) {
    res.errors.push({ field: 'recipeTypes', message: '应为数组' }); return res
  }
  const typeDecls: PluginTypeDecl[] = []
  const seen = new Set<string>()
  if (Array.isArray(declaredTypes)) {
    declaredTypes.forEach((entry, i) => {
      const decl = parseTypeDecl(entry, i, res, pluginId)
      if (!decl) return
      if (seen.has(decl.id)) return res.warnings.push({ field: `recipeTypes[${i}].id`, message: `类型 ${decl.id} 在本插件内重复，后一条已丢弃` })
      seen.add(decl.id)
      typeDecls.push(decl)
    })
  }
  const fieldNames = dictOf(raw['fieldNames'], 'fieldNames', res)
  const valueNames = dictOf(raw['valueNames'], 'valueNames', res)
  const author = strOf(raw['author'])
  const appVersion = strOf(raw['appVersion'])
  if (typeDecls.length === 0 && Object.keys(fieldNames).length + Object.keys(valueNames).length === 0) {
    res.warnings.push({ field: 'recipeTypes', message: '本插件既无类型声明也无词典，实际不产生任何效果' })
  }
  res.data = {
    id: pluginId, name: name ?? pluginId, version: version ?? '0.0.0', typeDecls, fieldNames, valueNames,
    virtualItemPatterns: patterns ?? [], hooks, ...(author ? { author } : {}), ...(appVersion ? { appVersion } : {}),
    // kubejsAddon 只有两种合法写法：显式 null（明确不依赖附属）或非空字符串。
    // 数字/布尔/空串一律视为「没写这个字段」，不能写成 null 让下游误以为声明了「不依赖」。
    ...(mods ? { mods } : {}), ...(raw['kubejsAddon'] === null ? { kubejsAddon: null } : addon ? { kubejsAddon: addon } : {})
  }
  return res
}
