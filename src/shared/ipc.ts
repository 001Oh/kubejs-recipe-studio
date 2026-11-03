/** IPC 契约：channel、请求/响应、事件与渲染进程桥接接口统一定义在此。 */
import type {
  CoverageReport,
  Diagnostic,
  GenerationChannel,
  GenerationPreference,
  IndexSummary,
  ItemEntry,
  ItemHit,
  LogEntry,
  ModpackInfo,
  PluginManifest,
  RecipeRecord,
  RecipeStats,
  RecipeTypeSchema,
  RegistryOption,
  ScanProgress,
  UiState,
  WorkbenchState
} from './types'
import type { NormalizedRecipe, NormalizedSchema, SchemaDiagnostic } from './schemaModel'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }

/** Diagnostic 的唯一定义在 types.ts；这里重导出，让既有 import 路径继续可用 */
export type { Diagnostic }

export interface ImportResult {
  info: ModpackInfo
  /** 所选目录不含 mods/ 时给出的纠正说明 */
  corrected: boolean
  note: string
}

export interface ImportCandidates {
  candidates: string[]
}

export interface ItemsQuery {
  text: string
  modId?: string
  onlyRegistered?: boolean
  onlyWithRecipes?: boolean
  onlyFavorites?: boolean
  /**
   * 是否把虚拟物品（`ritual_dummy` 等，规格 3.6.13）纳入结果。默认 false（隐藏）。
   * 只影响查询结果，不影响物品索引与搜索语料：切换它不重扫、不重建语料、不作废缓存。
   */
  includeVirtual?: boolean
  offset: number
  limit: number
}

export interface ItemsQueryResult {
  total: number
  matched: number
  hits: ItemHit[]
  elapsedMs: number
}

export interface RecipePage {
  total: number
  items: RecipeRecord[]
}

/** P-C1：打开一条配方用于新工作台草稿（原始是权威来源，摘要只做索引） */
export interface OpenedRecipe {
  record: RecipeRecord
  schema: NormalizedSchema
  schemaSource: 'pinned' | 'plugin' | 'builtin' | 'probejs' | 'inferred' | 'generic'
  /** ok = 原始可读；raw-missing = 源失效；parse-failed = 原始损坏 */
  status: 'ok' | 'raw-missing' | 'parse-failed'
  /** file = 从 jar/文件读到；reconstructed = kubejs 脚本按摘要重建（非原文） */
  rawKind: 'file' | 'reconstructed' | null
  raw: { json: unknown; rawText: string } | null
  normalized: NormalizedRecipe | null
  diagnostics: SchemaDiagnostic[]
  notes: string[]
}

/** P-C3：提交草稿（只允许三种试点类型；后端独立复核基线/安全/写盘/回读） */
export interface CommitRecipeRequest {
  /** 打开草稿时的原始 uid（另存副本时仍是原配方 uid） */
  uid: string
  mode: 'overwrite' | 'copy' | 'create'
  /** overwrite 必填；copy 可空（以最新原始为底写入新配方） */
  expectedRawHash: string | null
  expectedSchemaId: string
  expectedSchemaRevision?: number
  workbench: WorkbenchState
  dirtyFields: string[]
}

export interface CommitRecipeResult {
  mode: 'overwrite' | 'copy' | 'create'
  recipeId: string
  savedUid: string
  /** 实际写盘路径（绝对路径） */
  savedPath: string
  /** 相对整合包根目录的路径（展示用） */
  savedRelativePath: string
  savedRawHash: string
  /** 写盘后从磁盘重新读取并规范化得到的新 baseline */
  opened: OpenedRecipe
  dirtyFields: string[]
  bytes: number
  /** P-C6：覆盖前是否已把原文件备份到 userData（新建文件为 false） */
  backupCreated: boolean
  /** P-C5：内存索引是否已随提交更新；false 时 indexWarning 必有值，UI 必须提示重扫 */
  indexUpdated: boolean
  indexWarning?: string
}

/**
 * T-07：插件加载状态（与 `plugins:list` 分开，见通道注释）。
 * `state === 'failed'` 时，列表里显示的是**上一次成功**的数据。
 */
export interface PluginLoadState {
  state: 'ok' | 'failed'
  /** 最近一次加载请求对应的整合包路径 */
  path: string | null
  /** 缓存里那批插件实际属于哪个整合包（跨包读取失败时会与 `path` 不同） */
  cachedPath: string | null
  error: string | null
}

export interface SchemaSummary {
  id: string
  displayName: string
  modId: string
  modDisplayName: string
  layoutKind: RecipeTypeSchema['layoutKind']
  source: RecipeTypeSchema['source']
  sampleCount: number
  lowConfidence: boolean
  pinned: boolean
  capability: RecipeTypeSchema['capability']
  channel: GenerationChannel
  group: 'builtin' | 'inferred' | 'probe' | 'plugin' | 'generic'
}

export interface CodePreview {
  code: string
  channel: GenerationChannel
  /** 数据包模式下将要写出的文件 */
  datapackFiles: { relativePath: string; json: string }[]
  fileName: string
  header: string
  notes: string[]
  diagnostics: Diagnostic[]
  syntaxOk: boolean
  syntaxError?: { line: number; message: string }
  /** 语法糖无法表达、已自动降级的字段 */
  sugarUnsupportedFields: string[]
  /** 语法糖签名未在本包 ProbeJS/附属中验证 */
  sugarUnverified: boolean
  blockedFromSugar: boolean
  missingAddon: string | null
  duplicateOf: string | null
  canWrite: boolean
  /** 本次生成将要占用的配方 ID（数据包模式为 `<ns>:<文件名>`），用于 ID 冲突检查 */
  recipeId: string | null
  /** 实际使用的配方类型 ID（schema.id），便于渲染端回填 */
  typeId: string
}

export interface WriteRequest {
  workbench: WorkbenchState
  mode: 'new' | 'append'
  fileName: string
  appendTo: string | null
  channel: GenerationChannel
  overwriteConfirmed: boolean
  /** 仅导出到任意目录（无写权限时的替代出口） */
  alternateDir: string | null
}

export interface WriteResult {
  writtenPaths: string[]
  bytes: number
  backupPath: string | null
  appendedTo: string | null
  message: string
}

export interface TargetCheck {
  fileExists: boolean
  recipeIdConflicts: { recipeId: string; definedBy: string[]; effective: string }[]
  datapackNamespaceUsed: boolean
}

export interface ScriptEntry {
  name: string
  order: number
  path: string
  bytes: number
}

export interface RegistryOptionQuery {
  registry: string
  typeId?: string
}

export interface ProbeImportResult {
  files: string[]
  addedIds: number
  verifiedIds: number
  fluidIds: number
  note: string
}

/** channel → 请求/响应映射。新增操作必须在此登记，禁止散落裸 channel。 */
export interface CacheStatRow { kind: string; files: number; bytes: number }
export interface CacheStatResult { rows: CacheStatRow[]; backup: { files: number; bytes: number } }
export interface CacheClearResult { removed: number; failed: number; bytes: number }

export interface InvokeMap {
  'app:runtime': { req: undefined; res: { appVersion: string; userData: string; platform: string } }
  'app:pickDirectory': { req: { title?: string; defaultPath?: string } | undefined; res: { path: string | null } }
  'ui:get': { req: undefined; res: UiState }
  'ui:patch': { req: Partial<UiState>; res: UiState }
  'modpack:import': { req: { path: string }; res: ImportResult | ImportCandidates }
  'modpack:current': {
    req: undefined
    res: { info: ModpackInfo | null; summary: IndexSummary | null; favorites: string[] }
  }
  'modpack:scan': { req: { rebuild: boolean }; res: { started: boolean; reason?: string } }
  'modpack:scanCancel': { req: undefined; res: { canceled: boolean } }
  /** U-17：卸载当前整合包（只清状态/索引/恢复键，不删包目录与缓存） */
  'modpack:clear': { req: undefined; res: { ok: boolean; cleared: Record<string, boolean> } }
  /** T-27：清理缓存 */
  'cache:stat': { req: undefined; res: CacheStatResult }
  'cache:clear': { req: { kinds: string[] }; res: CacheClearResult }
  'items:query': { req: ItemsQuery; res: ItemsQueryResult }
  'items:get': { req: { id: string }; res: ItemEntry | null }
  /** 批量取图标可用性：槽位与卡片只有物品 ID 时，用它换 iconKey（主进程按 sha1 派生，不依赖索引） */
  'items:icons': { req: { ids: string[] }; res: Record<string, string | null> }
  'items:mods': { req: undefined; res: { modId: string; count: number }[] }
  'favorites:set': { req: { id: string; on: boolean }; res: string[] }
  'probe:import': { req: { paths: string[] }; res: ProbeImportResult }
  'recipes:byOutput': { req: { id: string; offset: number; limit: number }; res: RecipePage }
  'recipes:open': { req: { uid: string }; res: OpenedRecipe }
  'recipes:commit': { req: CommitRecipeRequest; res: CommitRecipeResult }
  'recipes:byInput': { req: { id: string; offset: number; limit: number }; res: RecipePage }
  'recipes:full': { req: { uid: string }; res: { json: unknown; sourcePath: string } }
  'recipes:stats': { req: undefined; res: RecipeStats | null }
  'schema:list': { req: undefined; res: SchemaSummary[] }
  'schema:get': { req: { typeId: string }; res: RecipeTypeSchema | null }
  'schema:registryOptions': { req: RegistryOptionQuery; res: RegistryOption[] }
  'schema:pin': { req: { typeId: string; schema: RecipeTypeSchema }; res: RecipeTypeSchema }
  'schema:unpin': { req: { typeId: string }; res: boolean }
  'schema:coverage': { req: undefined; res: CoverageReport }
  'plugins:list': { req: undefined; res: PluginManifest[] }
  'plugins:setEnabled': { req: { id: string; on: boolean }; res: PluginManifest[] }
  /**
   * T-07：最近一次插件加载的状态。
   * 与 `plugins:list` 分开的理由：列表是"有哪些插件"，本通道是"上一次读取成不成功"——
   * `failed` 时列表里显示的是**上一次成功**的数据，必须让 UI 能说明这一点。
   */
  'plugins:loadStatus': { req: undefined; res: PluginLoadState }
  'codegen:preview': {
    req: { workbench: WorkbenchState; preference?: GenerationPreference }
    res: CodePreview
  }
  'codegen:checkTarget': {
    req: { workbench: WorkbenchState; fileName: string; channel?: GenerationChannel; namespace?: string }
    res: TargetCheck
  }
  'codegen:write': { req: WriteRequest; res: WriteResult }
  'scripts:list': { req: undefined; res: ScriptEntry[] }
  'scripts:rename': { req: { name: string; to: string }; res: ScriptEntry[] }
  'logs:export': { req: { entries: LogEntry[] }; res: { path: string } }
}

export type InvokeName = keyof InvokeMap
export type InvokeReq<N extends InvokeName> = InvokeMap[N]['req']
export type InvokeRes<N extends InvokeName> = InvokeMap[N]['res']

export type StudioEvent =
  | { kind: 'log'; entry: LogEntry }
  | { kind: 'progress'; progress: ScanProgress }
  | { kind: 'index-ready'; summary: IndexSummary }
  | { kind: 'scan-canceled' }
  | { kind: 'scan-failed'; error: string; phase: ScanProgress['phase'] | 'import' }

/** preload 通过 contextBridge 暴露的唯一对象；渲染进程拿不到任何 fs。 */
export interface StudioBridge {
  invoke<N extends InvokeName>(name: N, req?: InvokeReq<N>): Promise<IpcResult<InvokeRes<N>>>
  onEvent(cb: (event: StudioEvent) => void): () => void
  iconUrl(iconKey: string): string
}

export const INVOKE_CHANNELS = [
  'app:runtime',
  'app:pickDirectory',
  'ui:get',
  'ui:patch',
  'modpack:import',
  'modpack:current',
  'modpack:scan',
  'modpack:scanCancel',
  'modpack:clear',
  'cache:stat',
  'cache:clear',
  'items:query',
  'items:get',
  'items:icons',
  'items:mods',
  'favorites:set',
  'probe:import',
  'recipes:byOutput',
  'recipes:open',
  'recipes:commit',
  'recipes:byInput',
  'recipes:full',
  'recipes:stats',
  'schema:list',
  'schema:get',
  'schema:registryOptions',
  'schema:pin',
  'schema:unpin',
  'schema:coverage',
  'plugins:list',
  'plugins:setEnabled',
  'plugins:loadStatus',
  'codegen:preview',
  'codegen:checkTarget',
  'codegen:write',
  'scripts:list',
  'scripts:rename',
  'logs:export'
] as const satisfies readonly InvokeName[]

export const EVENT_CHANNEL = 'studio:event'
export const INVOKE_CHANNEL = 'studio:invoke'
