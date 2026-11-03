/** 跨进程领域模型（规格第四章）。主/渲染/preload 唯一事实来源，禁止各进程自定义同义类型。 */
import type { ThemeId } from './theme'

export type Loader = 'forge' | 'neoforge' | 'fabric' | 'quilt'
export type Confidence = 'lang' | 'block' | 'model' | 'texture'
export type SlotKind = 'item' | 'fluid' | 'tag' | 'registry'
export type RecipeSource = 'jar' | 'datapack' | 'kubejs'
export type SchemaSource = 'builtin' | 'inferred' | 'probejs' | 'custom' | 'plugin'
export type LayoutKind = 'shaped' | 'shapeless' | 'single_io' | 'multi_io' | 'sequence' | 'custom'
export type EmitShape = 'scalar' | 'object' | 'positional'
/** 渲染控件形态：11 种之一，UI 只按 kind 分支，不按配方类型分支 */
export type FieldKind =
  | 'item'
  | 'fluid'
  | 'tag'
  | 'registry'
  | 'number'
  | 'boolean'
  | 'choice'
  | 'text'
  | 'struct'
  | 'nbt'
  | 'blockstate'
  | 'unknown'

export interface ModpackInfo {
  path: string
  name: string
  mcVersion: string | null
  loader: Loader | null
  loaderVersion: string | null
  kubejsVersion: string | null
  modCount: number
  /** 元数据来源，便于 UI 标注可信度，例如 "modrinth.index.json" */
  detectedFrom: string[]
  /** mods 目录绝对路径（路径纠正后的真实工作目录） */
  modsDir: string
  hasKubejs: boolean
  /** 已安装的 KubeJS 附属模组 modId，例如 kubejs_create */
  kubejsAddons: string[]
  /** 已安装模组的 modId 全集（来自 mods.toml / fabric.mod.json） */
  installedModIds: string[]
}

export interface ItemEntry {
  id: string
  nameZh: string
  nameEn: string
  modId: string
  confidence: Confidence
  verified: boolean
  hasIcon: boolean
  /** sha1(id)，前端经 app-icon://<hash> 取图 */
  iconKey: string | null
  pyFull: string[]
  pyInitials: string[]
  /** 虚拟物品（ritual_dummy 等），侧边栏默认隐藏 */
  virtual: boolean
  /** 该物品是否至少被一条已知配方产出 */
  hasRecipe: boolean
}

export interface HighlightRange {
  start: number
  end: number
  /** 命中的字段，决定高亮渲染位置 */
  field: 'nameZh' | 'nameEn' | 'id' | 'pyFull' | 'pyInitials'
}

export interface ItemHit {
  item: ItemEntry
  score: number
  highlights: HighlightRange[]
}

export interface SlotValue {
  kind: SlotKind
  id: string
  registryType?: string
  count?: number
  amount?: number
  chance?: number
  /** 显示名快照，便于 tooltip 不必回查索引 */
  name?: string
  /** NBT 约束（原语 8）；undefined 表示不限制 NBT，绝不自动塞 {} */
  nbt?: unknown
}

export type BenchValue = SlotValue | SlotValue[] | number | boolean | string | null | unknown
export type BenchValues = Record<string, BenchValue>

export interface WorkbenchState {
  typeId: string
  layoutKind: LayoutKind
  /** 通用字典：不按类型写死结构；shaped 用 key 'grid' 存 SlotValue[] */
  values: BenchValues
  /** 网格尺寸（shaped / custom 布局） */
  gridRows?: number
  gridCols?: number
  /** 修饰符链，按 schema 声明顺序追加，例如 heated / processingTime(500) */
  modifiers?: Record<string, number | boolean | string>
  activeSlotKey: string | null
  /** 序列组装（nested recipe）步骤 */
  steps?: SequenceStep[]
  transitionalItem?: SlotValue | null
  loops?: number
}

export interface SequenceStep {
  key: string
  typeId: string
  values: BenchValues
  modifiers?: Record<string, number | boolean | string>
}

export interface RecipeIO {
  id: string
  count: number
  kind: 'item' | 'fluid' | 'tag' | 'registry'
  chance?: number
}

export interface RecipeRecord {
  uid: string
  /** 配方 ID（data/<ns>/recipes/<path>.json 推导），无则为 uid 尾段 */
  recipeId: string
  type: string
  outputs: RecipeIO[]
  inputs: RecipeIO[]
  source: RecipeSource
  sourcePath: string
  /** jar 内条目需要知道来自哪个 jar 才能惰性读取 */
  jarPath?: string
  entryPath?: string
  partial: boolean
  /** 同一配方 ID 的完整定义链（规格 3.6.5 ②） */
  definedBy?: string[]
  /** 该 id 在物品索引中缺失，UI 标 ⚠ 未知物品 */
  unknownIds?: string[]
}

export interface RecipeStats {
  total: number
  vanilla: number
  modded: number
  kubejs: number
  partial: number
  types: number
  elapsedMs: number
}

export interface RecipeSlotSchema {
  key: string
  displayName: string
  kind: FieldKind
  /** kind==='registry' 必填，如 mekanism:infuse_type */
  registry?: string
  emitShape?: EmitShape
  multiple: boolean
  required?: boolean
  min?: number
  max?: number
  choices?: { value: string; label: string; color?: string }[]
  defaultValue?: unknown
  /** 语义角色：requirement 会汇总进前置条件摘要条 */
  role?: 'requirement' | 'input' | 'output' | 'extra'
  /** 视觉区：左材料 / 右产物 / 下附加；缺省按字段名判定 */
  zone?: 'input' | 'output' | 'extra'
  /** 合并进本控件的原始键名，生成 JSON 时还原 */
  compound?: string[]
  /** 语法糖能否表达该字段；false 时用户填了会触发降级 */
  sugarSupported?: boolean
  /** struct 子字段 */
  fields?: RecipeSlotSchema[]
  /** 垂直排布（AE2 压印器 top/middle/bottom） */
  orientation?: 'vertical' | 'horizontal'
  /** 首项固定约束（AE2 transform）*/
  firstItemMust?: string
  /** 出现率与样本数（L1 反推可信度） */
  occurrenceRate?: number
  description?: string
}

export interface ModifierSchema {
  key: string
  displayName: string
  kind: 'boolean' | 'number'
  /** 语法糖链式调用名，如 heated；为 null 表示只能进 JSON 字段 */
  chain?: string | null
  min?: number
  max?: number
  defaultValue?: unknown
}

export interface RequirementSpec {
  kind: 'structure' | 'time' | 'dimension' | 'research' | 'other'
  text: string
}

export interface RecipeTypeSchema {
  id: string
  displayName: string
  modId: string
  modDisplayName: string
  source: SchemaSource
  sampleCount?: number
  lowConfidence?: boolean
  pinned?: boolean
  layoutKind: LayoutKind
  /** 语法糖目标，如 event.recipes.create.mixing；null → event.custom / 数据包 */
  emitTarget: string | null
  customTemplate?: Record<string, unknown>
  slots: RecipeSlotSchema[]
  outputs: RecipeSlotSchema[]
  extraFields?: RecipeSlotSchema[]
  supportsChance?: boolean
  modifiers?: ModifierSchema[]
  requirements?: RequirementSpec[]
  /** 前置条件摘要条之外的提示，如 AE2 inscribe 不消耗模板 */
  notes?: string[]
  grid?: { rows: number; cols: number; maxRows?: number; maxCols?: number }
  /** custom 布局的格子坐标数组 */
  cells?: { key: string; row: number; col: number }[]
  docUrl?: string
  /** 实际生效的生成通道 */
  channel: GenerationChannel
  /** 能力徽章 */
  capability: 'sugar' | 'compatible' | 'unsupported'
  capabilityNote?: string
}

export type GenerationChannel = 'kubejs-sugar' | 'event-custom' | 'datapack-json'
export type GenerationPreference = 'auto' | 'always-sugar' | 'always-datapack'

export interface RegistryOption {
  id: string
  registry: string
  nameZh: string
  nameEn: string
  color: string
  abbr: 'INF' | 'GAS' | 'SLR' | 'PGM' | 'REG'
  /** 来源：probe / sample / builtin */
  origin: 'probejs' | 'sample' | 'builtin'
  defaultAmount: number
}

export interface CoverageReport {
  mcVersion: string | null
  totalTypes: number
  structurable: number
  genericOnly: number
  unsupported: number
  channelCounts: Record<GenerationChannel, number>
  addons: { modId: string; installed: boolean; suggests?: string }[]
  unsupportedTypes: { type: string; reason: string; suggestion: string }[]
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  author?: string
  appVersion?: string
  mods?: string[]
  kubejsAddon?: string | null
  recipeTypes?: unknown[]
  fieldNames?: Record<string, string>
  valueNames?: Record<string, string>
  virtualItemPatterns?: string[]
  /** 加载来源与运行时状态 */
  origin: 'modpack' | 'user'
  path: string
  status: 'loaded' | 'incompatible' | 'failed' | 'disabled'
  coveredTypes: string[]
  error?: string
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
export type LogSource = 'MODPACK' | 'SCAN' | 'INDEX' | 'RECIPE' | 'IO' | 'UI' | 'SCHEMA' | 'PLUGIN'

export interface LogEntry {
  ts: number
  level: LogLevel
  source: LogSource
  message: string
  detail?: string
}

export interface ScanProgress {
  phase: 'items' | 'recipes' | 'probe' | 'schema'
  current: number
  total: number
  label: string
  elapsedMs: number
}

export interface IndexSummary {
  items: number
  namespaces: number
  itemElapsedMs: number
  missingZhNames: number
  placeholderIconRatio: number
  /** 缺图标的物品数 */
  iconMissing?: number
  /** 其中「整个整合包里根本没有对应模型/贴图」的数量：这类是资源缺失，不是提取器缺陷 */
  iconMissingNoAssets?: number
  recipes: RecipeStats | null
  cacheHit: boolean
  cachePath: string
  failedMods: { name: string; error: string }[]
  /** 图标占位比例超过 5% 说明提取器有缺陷（规格禁止事项 19） */
  iconWarning: boolean
  /** 各阶段耗时（毫秒）：分开记录，优化时先看真实瓶颈 */
  timings?: {
    itemsMs: number
    recipesMs: number
    corpusMs: number
    cacheWriteMs: number
    totalMs: number
  }
}

export interface UiState {
  sidebarWidth: number
  codeWidth: number
  logHeight: number
  sidebarCollapsed: boolean
  codeCollapsed: boolean
  logCollapsed: boolean
  /** 主题 id（见 shared/theme.ts）；历史值 'dark' 读取时归一为 'graphite' */
  theme: ThemeId
  generationPreference: GenerationPreference
  showVirtualItems: boolean
  browseMode: 'list' | 'detail'
  /** P-C1 试点：走新草稿链路的配方类型白名单（空数组 = 完全回旧路径） */
  benchV2?: string[]
  /**
   * T-25：上次使用的整合包根目录（冷启动恢复用）。
   * 只存路径与检测到的名字，不存任何全局/绝对路径常量；空 = 没有可恢复的包。
   */
  lastModpackPath?: string
  /** T-25：与 lastModpackPath 配套的包名，用于恢复时校验「目录没被换成别的包」。 */
  lastModpackName?: string
  maximized: boolean
  x: number | null
  y: number | null
  width: number
  height: number
}

/** 生成前校验的一条结论。field 定位到具体字段，供 UI 内联提示。 */
export interface Diagnostic {
  level: 'error' | 'warn' | 'info'
  field?: string
  message: string
}
