/**
 * 插件加载器（规格 3.6.14「加载来源」与安全健壮性约束）。双来源，前者优先：
 * ① `<整合包>/.recipe-studio/plugins/`（跟随整合包分发：作者打包魔改支持，玩家导入即得）
 * ② `userData/plugins/`（用户级，跨整合包复用）。每个来源支持 `xxx.json` 单文件与 `xxx/manifest.json` 目录
 * （目录形态才方便带 JS 钩子文件）。三条铁律：单插件解析失败只 WARN 并跳过；appVersion 不兼容留在列表标
 * incompatible；依赖模组没装整包禁用并写明原因。任何情况都不许让插件静默消失，也不许阻断启动。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import type { ModpackInfo, PluginManifest, RecipeTypeSchema } from '../../shared/types'
import { MODPACK_PLUGIN_DIR, PLUGIN_DIR_NAME } from '../../shared/constants'
import { pluginDisabledFile, userPluginDir } from '../paths'
import { logger } from '../logger'
import { bumpVirtualPatternsVersion, setPluginVirtualMatchers } from '../../shared/search'
import { getCurrentModpack } from '../modpack/state'
import { invalidateSnapshot, refreshEffective, replaceLayer, setLayerProvider, snapshotLayer } from '../schema/registry'
import { addonDegradationNotice, addonState, missingDependencyMods } from './capabilityLink'
import { buildPluginSchema, resolvePluginOverrides, type PluginOrigin, type PluginSchemaRecord } from './merge'
import { formatIssue, formatIssues, parseManifest, type PluginManifestCore } from './manifest'

export interface LoadPluginsOptions {
  /** 覆盖 userData/plugins 根；传 null 表示本次不看用户目录 */
  userDir?: string | null
  /** 覆盖当前 app 版本；留空取 app.getVersion()，取不到时不做兼容判定 */
  appVersion?: string
  /** 覆盖整合包信息（模组清单 / 附属清单） */
  modpack?: ModpackInfo | null
}

interface LoadedRecord {
  core: PluginManifestCore | null
  id: string; name: string; version: string
  origin: PluginOrigin; path: string
  /** manifest 校验后的判定；用户开关与依赖缺失在其上再覆盖一层 */
  base: 'loaded' | 'incompatible' | 'failed'
  reason?: string; missingMods: string[]; notice?: string
  declaredTypes: string[]; schemas: RecipeTypeSchema[]
}

let cache: { key: string; records: LoadedRecord[] } | null = null
let lastModpackPath: string | null = null
let lastOptions: LoadPluginsOptions = {}
/**
 * FIX-02：最近一次加载的**失败**信息。
 *
 * 非 null 表示「上一次读插件目录失败了」——此时 cache 与插件层都保持上一次成功的数据不动，
 * 状态本身对外可见（`getPluginLoadStatus()`），不会被伪装成「成功但为空」。
 */
let loadFailure: { path: string | null; error: string } | null = null
/** FIX-02：当前 cache 里那批 records 实际属于哪个整合包（只在成功加载时写入） */
let cachedPath: string | null = null
const userDisabled = new Set<string>()

/**
 * T-05：插件启停必须**跨重启持久**。
 *
 * 设计取舍：
 * - 只持久化"被关掉"的 id（集合语义），不存完整列表 —— 插件被删/换包后不会残留幽灵条目。
 * - 文件缺失 = 全部启用（默认态），不写空文件。
 * - **读失败按"无禁用"处理并 WARN**，不阻断启动：启停是偏好，不该让一个坏文件挡住整个应用。
 * - **写失败只 WARN**：内存里的开关已经生效（`syncPluginLayer` 已跑），不能因为落盘失败
 *   把 UI 上的开关回滚成"没反应"；下次切换会再试。
 */
let userDisabledLoaded = false

function disabledFilePath(): string | null {
  try {
    return pluginDisabledFile()
  } catch {
    // app 尚未 ready / 测试未提供 userData：本次不持久化
    return null
  }
}

function ensureDisabledLoaded(): void {
  if (userDisabledLoaded) return
  userDisabledLoaded = true
  const file = disabledFilePath()
  if (!file) return
  try {
    if (!existsSync(file)) return
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(raw)) {
      logger.warn('PLUGIN', `插件启停清单格式非法（期望数组），按"全部启用"处理：${file}`)
      return
    }
    for (const id of raw) if (typeof id === 'string' && id.trim()) userDisabled.add(id.trim())
    if (userDisabled.size > 0) logger.info('PLUGIN', `已从 ${file} 恢复 ${userDisabled.size} 个停用插件`)
  } catch (e) {
    logger.warn('PLUGIN', `读取插件启停清单失败（按"全部启用"处理）：${String(e && (e as Error).message)}`)
  }
}

/**
 * T-05：把当前启停清单落盘。
 *
 * **刻意不放进 `setEnabled()`**：`setEnabled` 的语义副作用是 `syncPluginLayer()`（立刻影响 schema 层），
 * 落盘属于「用户操作」而非「程序内部状态变化」。若在 `setEnabled` 里直接写盘，
 * 同进程内多个用例会互相污染（前一个用例关掉的插件，被后一个用例从磁盘读回来，
 * 表现为「启动即停用」）。因此落盘由 IPC 层（`plugins:setEnabled`）显式调用。
 */
export function persistPluginState(): void {
  const file = disabledFilePath()
  if (!file) return
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify([...userDisabled].sort(), null, 2)}\n`, 'utf8')
  } catch (e) {
    logger.warn('PLUGIN', `写入插件启停清单失败（本次开关仍在内存生效）：${String(e && (e as Error).message)}`)
  }
}

interface Semver { major: number; minor: number; patch: number; parts: number; pre: string | null }

export interface AppVersionVerdict { compatible: boolean; reason?: string }

/** 最小 semver（不引依赖）：三段数值 + 可选 -prerelease；范围支持 >= > <= < ^ ~ = 裸值 * 与 || 分组 */
function parseSemver(text: string): Semver | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), patch: Number(m[3] ?? 0), parts: m[3] !== undefined ? 3 : m[2] !== undefined ? 2 : 1, pre: m[4] ?? null }
}

function cmp(a: Semver, b: Semver): number {
  for (const key of ['major', 'minor', 'patch'] as const) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : 1
}

function lower(v: Semver): Semver {
  return { ...v, minor: v.parts > 1 ? v.minor : 0, patch: v.parts > 2 ? v.patch : 0, pre: null }
}

/** 区间上界（不含）：^ 按主版本进位（0.x 退到次版本、0.0.x 退到补丁），~ 与裸偏段值按次版本进位 */
function upper(v: Semver, op: '^' | '~' | 'partial'): Semver {
  if (op === '^' && v.parts > 1 && v.major === 0) return v.parts === 2 || v.minor > 0 ? { ...v, minor: v.minor + 1, patch: 0, pre: null } : { ...v, patch: v.patch + 1, pre: null }
  if (op === '~' && v.parts > 1) return { ...v, minor: v.minor + 1, patch: 0, pre: null }
  return { ...v, major: v.major + 1, minor: 0, patch: 0, pre: null }
}

/** 解析失败返回 null：调用方据此把插件标为不兼容并写出原因，绝不静默放过 */
function parseComparator(token: string): ((current: Semver) => boolean) | null {
  if (/^(\*|x|X|latest)$/.test(token)) return () => true
  const m = /^(>=|<=|>|<|\^|~|=)?\s*(.+)$/.exec(token)
  const target = m ? parseSemver(m[2]) : null
  if (!m || !target) return null
  const op = m[1] ?? ''
  const lo = lower(target)
  const hi = upper(target, op === '^' ? '^' : op === '~' ? '~' : 'partial')
  if (op === '>=') return (c) => cmp(c, lo) >= 0
  if (op === '<') return (c) => cmp(c, lo) < 0
  if (op === '>') return (c) => (target.parts === 3 ? cmp(c, target) > 0 : cmp(c, hi) >= 0)
  if (op === '<=') return (c) => (target.parts === 3 ? cmp(c, target) <= 0 : cmp(c, hi) < 0)
  if ((op === '' || op === '=') && target.parts === 3) return (c) => cmp(c, target) === 0
  return (c) => cmp(c, lo) >= 0 && cmp(c, hi) < 0
}

export function checkAppVersion(range: string, current: string): AppVersionVerdict {
  const trimmed = range.trim()
  if (!trimmed) return { compatible: true }
  const groups = trimmed.split('||').map((g) => g.trim().split(/\s+/).filter(Boolean)).filter((g) => g.length > 0)
  const broken = groups.flat().find((token) => parseComparator(token) === null)
  if (broken) return { compatible: false, reason: `appVersion 范围 “${broken}” 无法解析（支持 >=x.y.z / ^x.y.z / ~x.y.z / x.y.z / * ，多组用 || 分隔）` }
  const cur = parseSemver(current)
  if (groups.length === 0 || !cur) return { compatible: true }
  if (groups.some((group) => group.every((token) => parseComparator(token)!(cur)))) return { compatible: true }
  return { compatible: false, reason: `需要 app ${trimmed}，当前 ${current}` }
}

interface PluginFileEntry { dir: string; file: string; origin: PluginOrigin }

/**
 * 目录列举结果（FIX-02）。
 *
 * `ok: false` 表示**读取失败**，必须与「读取成功但为空」区分：
 * 前者不得被当成「没有插件」，否则会把仍然有效的插件层清空。
 */
interface PluginFilesResult { ok: boolean; entries: PluginFileEntry[]; error?: string }

function listPluginFiles(dir: string | null, origin: PluginOrigin): PluginFilesResult {
  // 「该来源未启用」与「目录确实不存在」都按既有语义视为**没有插件**（成功空）
  if (!dir || !existsSync(dir)) return { ok: true, entries: [] }
  let names: string[] = []
  try {
    names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() || e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'en'))
  } catch (err) {
    // FIX-02：读取失败 ≠ 没有插件。这里**不再**返回空列表冒充成功。
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('PLUGIN', `插件目录读取失败：${dir}（保留上一次成功加载的插件列表与插件层）`, message)
    return { ok: false, entries: [], error: message }
  }
  const out: PluginFileEntry[] = []
  for (const name of names) {
    const full = join(dir, name)
    if (/\.json$/i.test(name)) out.push({ dir, file: full, origin })
    else if (!name.startsWith('.') && existsSync(join(full, 'manifest.json'))) out.push({ dir: full, file: join(full, 'manifest.json'), origin })
  }
  return { ok: true, entries: out }
}

/**
 * 插件文件签名（BH-014）：把「有哪些插件文件、各自多大、最后改于何时」压成一个字符串。
 *
 * 之前缓存键只含路径与版本，用户改了插件清单内容（同一路径）不会触发重载，且插件文档
 * **没有**任何"改动需重启"的说明——于是改完看不到效果，误以为格式还是错的。
 * 用 mtime + size 而不是内容哈希：插件目录很小，stat 成本可忽略，且能覆盖"同长度改写"。
 */
function pluginFilesSignature(entries: readonly PluginFileEntry[]): string {
  return entries
    .map((entry) => {
      try {
        const st = statSync(entry.file)
        return `${entry.file}:${Math.round(st.mtimeMs)}:${st.size}`
      } catch {
        return `${entry.file}:missing`
      }
    })
    .join('|')
}

function resolveDefaults(options: LoadPluginsOptions): { modpack: ModpackInfo | null; userDir: string | null; appVersion: string } {
  let userDir = options.userDir ?? null
  if (options.userDir === undefined) {
    try { userDir = userPluginDir() } catch { logger.debug('PLUGIN', `用户插件目录不可用（userData/${PLUGIN_DIR_NAME}），本次只加载整合包内插件`) }
  }
  let appVersion = options.appVersion ?? ''
  if (options.appVersion === undefined) {
    try { appVersion = app.getVersion() } catch { /* 非 Electron 环境（单测）不做兼容判定，绝不误杀插件 */ }
  }
  return { modpack: options.modpack !== undefined ? options.modpack : getCurrentModpack(), userDir, appVersion }
}

function isUsable(record: LoadedRecord): boolean {
  return record.base === 'loaded' && record.missingMods.length === 0 && !userDisabled.has(record.id)
}

function buildRecord(entry: PluginFileEntry, modpack: ModpackInfo | null, appVersion: string): LoadedRecord {
  const slug = basename(entry.file).replace(/\.json$/i, '') || 'plugin'
  const record: LoadedRecord = { core: null, id: slug, name: slug, version: '0.0.0', origin: entry.origin, path: entry.file, base: 'failed', missingMods: [], declaredTypes: [], schemas: [] }
  let core: PluginManifestCore | null = null
  try {
    const result = parseManifest(JSON.parse(readFileSync(entry.file, 'utf8')) as unknown)
    core = result.data
    record.reason = result.data ? undefined : formatIssues(result.errors)
    for (const warning of result.warnings) logger.warn('PLUGIN', `插件 ${result.data?.id ?? slug} 声明瑕疵（已按提示忽略该项）：${formatIssue(warning)}`, entry.file)
  } catch (err) {
    record.reason = `JSON 解析失败：${err instanceof Error ? err.message : String(err)}`
  }
  if (!core) { logger.warn('PLUGIN', `插件解析或校验失败，已跳过：${entry.file}`, record.reason ?? ''); return record }
  const manifest = core
  Object.assign(record, { core: manifest, id: manifest.id, name: manifest.name, version: manifest.version, base: 'loaded', reason: undefined })
  const verdict = manifest.appVersion ? checkAppVersion(manifest.appVersion, appVersion) : null
  if (verdict && !verdict.compatible) return { ...record, base: 'incompatible', reason: verdict.reason ?? `需要 app ${manifest.appVersion}` }
  record.missingMods = missingDependencyMods(manifest.mods, modpack)
  const state = addonState(manifest.kubejsAddon, modpack)
  if (state && !state.installed) record.notice = addonDegradationNotice(state.addon)
  record.schemas = manifest.typeDecls.map((decl) => buildPluginSchema(decl, manifest, state))
  record.declaredTypes = record.schemas.map((s) => s.id)
  return record
}

function manifestOf(record: LoadedRecord): PluginManifest {
  const blockedByMods = record.missingMods.length > 0
  const status: PluginManifest['status'] = record.base !== 'loaded' ? record.base : blockedByMods || userDisabled.has(record.id) ? 'disabled' : 'loaded'
  const error = status === 'disabled'
    ? blockedByMods ? `依赖模组未安装：${record.missingMods.join(', ')}，插件已整包禁用` : '已在插件管理页关闭'
    : status === 'loaded' ? record.notice ?? record.reason : record.reason
  const core = record.core
  return {
    id: record.id, name: record.name, version: record.version, origin: record.origin, path: record.path, status,
    coveredTypes: status === 'loaded' ? [...record.declaredTypes] : [],
    ...(core ? { author: core.author, appVersion: core.appVersion, mods: core.mods, kubejsAddon: core.kubejsAddon ?? null, fieldNames: core.fieldNames, valueNames: core.valueNames, recipeTypes: core.typeDecls.length > 0 ? (core.typeDecls as unknown[]) : undefined, virtualItemPatterns: core.virtualItemPatterns } : {}),
    ...(error ? { error } : {})
  }
}

function snapshot(records: readonly LoadedRecord[]): PluginManifest[] {
  // T-05：首次构造列表时把持久化的启停清单读进来（懒加载：app 可能尚未 ready）
  ensureDisabledLoaded()
  const seen = new Set<string>()
  return records.map((record) => {
    const manifest = manifestOf(record)
    if (seen.has(manifest.id)) {
      logger.warn('PLUGIN', `插件 id 重复：${manifest.id}（${record.path}）让位于更高优先级来源`)
      return { ...manifest, status: 'disabled' as const, coveredTypes: [], error: '插件 id 与更高优先级来源重复，已忽略' }
    }
    seen.add(manifest.id)
    return manifest
  })
}

/**
 * 本次加载「应当」对应的整合包路径（FIX-01）。
 *
 * - 调用方通过 `options.modpack` 显式指定了整合包（测试与离线报告会这么做）→ 以它为准，
 *   否则会把「显式指定」当成「过期」，把缓存反复刷掉。
 * - 未显式指定（生产恒为 `{}`）→ 跟随会话里的当前整合包。
 */
function authoritativeModpackPath(): string | null {
  const pinned = lastOptions.modpack
  if (pinned !== undefined) return pinned?.path ?? null
  return getCurrentModpack()?.path ?? null
}

/** 指定整合包路径上最近一次读取失败的原因（没有失败记录时为 null）。 */
function failedErrorFor(path: string | null): string | null {
  return loadFailure && loadFailure.path === path ? loadFailure.error : null
}

function currentRecords(): LoadedRecord[] {
  // FIX-01：缓存必须对应**当前**整合包。
  // `lastModpackPath` 只在 `loadPlugins()` 内更新，而生产侧唯一会传入「当前包路径」的入口是
  // `plugins:list`（即进入设置页）。换包后若没人调它，provider（schema 的 plugin 层）与
  // `virtualItemPatterns()` 会一直读到上一个整合包的插件——预览/配方选择/搜索全部受影响。
  // 这里在取数前做一次字符串比较（稳态零 IO、无新增 await），路径不一致才用当前包重新加载。
  const path = authoritativeModpackPath()
  // FIX-02：**当前路径**上一次读取失败时也要重试——否则失败一旦发生就会永久复用旧缓存，
  // 目录恢复后也看不到新插件。只重试失败的那条路径，成功后记录归空，稳态零额外 IO。
  if (!cache || lastModpackPath !== path || failedErrorFor(path) !== null) loadPlugins(path, lastOptions)
  return cache ? cache.records : []
}
function usableRecords(): LoadedRecord[] {
  return currentRecords().filter(isUsable)
}
function schemaRecords(records: readonly LoadedRecord[]): PluginSchemaRecord[] {
  return records.flatMap((r) => r.schemas.map((schema) => ({ pluginId: r.id, origin: r.origin, schema })))
}

export function loadPlugins(modpackPath: string | null, options: LoadPluginsOptions = {}): PluginManifest[] {
  lastModpackPath = modpackPath; lastOptions = options
  const { modpack, userDir, appVersion } = resolveDefaults(options)
  // FIX-02：任一来源**读取失败**就整次失败——不写 cache、不调用 syncPluginLayer
  //（因此不会 replaceLayer('plugin', [])），只记录失败状态并返回上一次成功加载的列表。
  // 同时让快照戳失效，好让下一次 schema 读取触发重建 → 重新经 provider 走到这里再重试。
  const modpackFiles = listPluginFiles(modpackPath ? join(modpackPath, MODPACK_PLUGIN_DIR) : null, 'modpack')
  const userFiles = listPluginFiles(userDir, 'user')
  if (!modpackFiles.ok || !userFiles.ok) {
    loadFailure = { path: modpackPath, error: modpackFiles.error ?? userFiles.error ?? '插件目录读取失败' }
    logger.warn('PLUGIN', '插件加载失败：已保留上一次成功加载的插件列表与插件层（不会清空）', loadFailure.error)
    invalidateSnapshot()
    return snapshot(cache ? cache.records : [])
  }
  const entries = [...modpackFiles.entries, ...userFiles.entries]
  // BH-014：键里加入插件文件签名（数量 + 最大 mtime + 总字节），改了插件内容不必重启应用
  const signature = pluginFilesSignature(entries)
  const key = `${modpackPath ?? ''}\u0000${userDir ?? ''}\u0000${modpack?.modsDir ?? ''}\u0000${appVersion}\u0000${signature}`
  if (!cache || cache.key !== key) {
    const records = entries.map((entry) => buildRecord(entry, modpack, appVersion))
    cache = { key, records }
    cachedPath = modpackPath
    const usable = records.filter(isUsable)
    logger.info('PLUGIN', `插件加载完成：生效 ${usable.length} 个 / 列表共 ${records.length} 项`, entries.map((e) => `${e.origin} → ${e.file}`).join('\n'))
    // BH-004：这里**不再**只做一次性的异步 upsert —— 那种写法会被紧随其后的 clearSchemas 抹掉。
    // 统一走 syncPluginLayer()，并由 ensureSchemas() 在每次重建时通过 provider 重新装配。
    syncPluginLayer()
  } else {
    cachedPath = modpackPath
  }
  // FIX-02：只清除**本次路径**的失败记录。别的包读取成功不能把当前包的失败状态抹掉
  //（`currentPluginOverrides` 会先用上一次的路径取一次，混用会让失败状态在栈内被清空）。
  if (loadFailure && loadFailure.path === modpackPath) loadFailure = null
  return snapshot(cache.records)
}

/** FIX-02：最近一次插件加载的状态（对外可观测，避免「读取失败」被当成「成功但为空」）。 */
export interface PluginLoadStatus {
  /** `failed` 时插件层与缓存保留的是**上一次成功**的数据，不是当前包的读取结果 */
  state: 'ok' | 'failed'
  /** 最近一次加载请求对应的整合包路径 */
  path: string | null
  /** 当前缓存里那批插件数据实际属于哪个整合包（跨包读取失败时会与 `path` 不同） */
  cachedPath: string | null
  /** 失败原因（成功时为 null） */
  error: string | null
}

export function getPluginLoadStatus(): PluginLoadStatus {
  const path = authoritativeModpackPath()
  const error = failedErrorFor(path)
  return {
    state: error ? 'failed' : 'ok',
    path: error ? path : lastModpackPath,
    cachedPath,
    error
  }
}

/** 交给 schema 注册表的插件覆盖层（P6）。同一个 type 多插件声明时按来源优先级取一，冲突由 report 给出。 */
export function getPluginSchemaOverrides(): RecipeTypeSchema[] {
  return resolvePluginOverrides(schemaRecords(usableRecords())).schemas
}

/**
 * 取当前应生效的插件覆盖层，并**顺带做一次 key 感知的缓存刷新**（BUG-HUNT-02 修复 BH-004）。
 *
 * 只读，不写注册表层、不改快照戳——写入由调用方（`schema/service.ensureSchemas` 或 `setEnabled`）负责，
 * 这样两边语义一致、也不会互相触发。
 */
export function currentPluginOverrides(): RecipeTypeSchema[] {
  // 用上一次加载时用过的路径/选项重试一次：缓存键一致时零成本，换包后才会真正重读磁盘
  loadPlugins(lastModpackPath ?? getCurrentModpack()?.path ?? null, lastOptions)
  return getPluginSchemaOverrides()
}

/**
 * 把插件层同步进注册表并让快照戳失效（BUG-HUNT-02 修复 BH-005）。
 *
 * 必须由插件状态变化处显式调用：`plugins:setEnabled` 改的是内存开关，
 * 若不同步，已 `upsert` 进 `plugin` 层的旧 schema 会继续生效到进程结束。
 */
export function syncPluginLayer(): RecipeTypeSchema[] {
  let schemas: RecipeTypeSchema[]
  try {
    schemas = currentPluginOverrides()
  } catch (err) {
    // RV1-003：读取插件覆盖层失败时**保留**当前层，不要把「读取失败」当成「没有插件」
    logger.warn('PLUGIN', '读取插件覆盖层失败，保留上一次的插件层', err instanceof Error ? err.message : String(err))
    return snapshotLayer('plugin')
  }
  replaceLayer('plugin', schemas)
  invalidateSnapshot()
  // 插件增删可能带来新的 virtualItemPatterns，查询期匹配器必须跟着失效
  invalidateVirtualMatchers()
  // RV1-002：只改层不重建 effective 的话，直接 getSchema() 的同步路径（codegen 预览、配方选择）
  // 仍会读到已关闭插件的 schema。这里立即用当前事实重建一次，保证「关掉即不生效」。
  refreshEffective()
  return schemas
}

function mergeDicts(pick: (core: PluginManifestCore) => Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const record of usableRecords()) {
    if (!record.core) continue
    for (const [key, value] of Object.entries(pick(record.core))) if (!(key in out)) out[key] = value
  }
  return out
}

/** 词典类合并：高优先级来源先占位，低优先级不覆盖（部分覆盖插件的全部价值就在这里） */
export function pluginFieldNames(): Record<string, string> {
  return mergeDicts((core) => core.fieldNames)
}
export function pluginValueNames(): Record<string, string> {
  return mergeDicts((core) => core.valueNames)
}
export function virtualItemPatterns(): string[] {
  const out: string[] = []
  for (const record of usableRecords()) for (const pattern of record.core?.virtualItemPatterns ?? []) if (!out.includes(pattern)) out.push(pattern)
  return out
}

const compiledPatterns = new Map<string, RegExp>()

/** 通配：`*` 命中同一路径段内的任意串、`?` 单字符；`occultism:ritual_dummy/*` → 该前缀下全部物品 */
export function patternToRegExp(pattern: string): RegExp {
  const hit = compiledPatterns.get(pattern)
  if (hit) return hit
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.')}$`, 'i')
  compiledPatterns.set(pattern, re)
  return re
}

/**
 * 编译后的虚拟物品匹配器缓存。
 * `virtualItemPatterns()` 每次调用都会遍历全部可用插件并新建数组，而查询期要对**每个物品**判定，
 * 直接复用会把 43k 物品 × N 插件变成明显的卡顿，因此在插件状态变化时一次性重建。
 */
let virtualMatcherCache: RegExp[] | null = null

function virtualMatcherList(): RegExp[] {
  if (!virtualMatcherCache) virtualMatcherCache = virtualItemPatterns().map(patternToRegExp)
  return virtualMatcherCache
}

/** 插件状态变化后必须调用：否则新增/删除的通配不会反映到查询期过滤。 */
function invalidateVirtualMatchers(): void {
  virtualMatcherCache = null
  // REM-02：通知语料层「虚拟物品规则变了」，让它在下一次取语料时重建
  bumpVirtualPatternsVersion()
}

export function matchesVirtualItem(itemId: string): boolean {
  return virtualMatcherList().some((re) => re.test(itemId))
}

export interface PluginHookRef {
  pluginId: string; file: string; typeId: string
  /** 单文件插件是其所在目录，目录插件是其自身 */
  dir: string
}

export function pluginHooks(): PluginHookRef[] {
  const out: PluginHookRef[] = []
  for (const record of usableRecords()) for (const [typeId, file] of Object.entries(record.core?.hooks ?? {})) out.push({ pluginId: record.id, dir: dirname(record.path), file, typeId })
  return out
}

/** 用户开关：关闭的插件留在列表里（status disabled + 原因），同时从词典与覆盖类型中撤出 */
export function setEnabled(id: string, on: boolean): PluginManifest[] {
  ensureDisabledLoaded()
  if (on) { userDisabled.delete(id) } else { userDisabled.add(id) }
  const records = currentRecords()
  if (!records.some((r) => r.id === id)) logger.warn('PLUGIN', `收到未知插件的开关请求：${id}`)
  // BH-005：开关必须立刻反映到 schema 注册表，否则 UI 说「已关闭」而类型仍在生效
  syncPluginLayer()
  return snapshot(records)
}

/** 切换整合包 / 单测之间丢弃磁盘缓存 */
export function resetPluginLoader(): void {
  cache = null; compiledPatterns.clear(); virtualMatcherCache = null
  // FIX-02：失败状态与「缓存属于哪个包」必须一起清掉，否则单测/换包会继承上一次的判定
  loadFailure = null; cachedPath = null
  // T-05：启停清单是**用户偏好**，不随换包/缓存失效而清空；但"是否已从磁盘读过"要重置，
  // 否则单测之间会继承上一个用例的内存态（磁盘上的清单仍是权威来源）。
  userDisabledLoaded = false
}

/**
 * 把 `plugin` 层的数据提供者注册给 schema 注册表（BUG-HUNT-02 修复 BH-004）。
 *
 * 由注册表在 `ensureSchemas()` 重建时回调，这样「清空所有层 → 重新装配」不会把插件层漏掉。
 * 注册表不反向依赖本模块，因此这里用回调注册而不是让 registry import loader（避免循环依赖）。
 */
setLayerProvider('plugin', currentPluginOverrides)

// BH-003：把插件通配接入共享层的虚拟物品判定（查询期 `isVirtualItem` 会用到）
setPluginVirtualMatchers([(itemId: string) => matchesVirtualItem(itemId)])
