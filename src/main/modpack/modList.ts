/**
 * 模组清单：扫描 `mods/*.jar` 内的 `META-INF/mods.toml` / `META-INF/neoforge.mods.toml` /
 * `fabric.mod.json`，读出 modId 集合与依赖声明。条目按需流式读取（`zip.readMany`），绝不解压到磁盘。
 *
 * mods.toml 宽松解析器**能**处理：
 * - `[[mods]]` 块里的 `modId = "xxx"`（等号两侧空格、单/双引号、行尾 `# 注释`、`modId="a"` 紧凑写法）
 * - 一个 jar 声明多个 `[[mods]]`（全部收集）；`modId = ["a", "b"]` 数组写法
 * - `'''…'''` / `"""…"""` 多行字符串：先整体屏蔽（保留行数），所以 description 里的 "modId" 字样不会误判
 * - `[[dependencies.<modId>]]` 块里的 `modId` → 记为该 mod 的依赖，供下游推断「附属 → 主模组」
 *
 * **不能**处理（这些 jar 只会缺 modId，扫描照常继续）：
 * - 跨行的数组 / 内联表（`mods = [{modId="a"}]`）、`[table.sub]` 嵌套表里的 modId
 * - TOML 转义序列（值原样返回，不做反转义）、多行字符串内部再出现 `'''` 的畸形写法
 * - 键名不带引号以外的奇特变体（如 `modId   =   'x'` 之外的 `mod_id` 之类非标准字段）
 *
 * 附属能力判定一律以扫描结果（modId + 依赖声明）为准，不用硬编码附属表（规格 3.6.1）。
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SCAN_WORKER_MAX_CONCURRENCY } from '../../shared/constants'
import { logger } from '../logger'
import { readMany } from '../scanner/zip'

const MODS_TOML = 'META-INF/mods.toml'
const NEOFORGE_MODS_TOML = 'META-INF/neoforge.mods.toml'
const FABRIC_JSON = 'fabric.mod.json'
const META_ENTRIES = new Set([MODS_TOML, NEOFORGE_MODS_TOML, FABRIC_JSON])

export type MetaFormat = 'forge' | 'neoforge' | 'fabric'

export interface ModMetaEntry {
  jar: string
  modId: string
  format: MetaFormat
  /** 该 mod 在 mods.toml `[[dependencies.*]]` / fabric.mod.json `depends` 里声明的依赖 modId */
  depends: string[]
}

export interface ModScanResult {
  installedModIds: string[]
  /** modId 形如 kubejs_xxx / kubejs-xxx 的附属，已去重排序 */
  kubejsAddons: string[]
  failed: { name: string; error: string }[]
  entries: ModMetaEntry[]
  formatCounts: Record<MetaFormat, number>
  /** modId → 依赖 modId 列表；下游据此推断附属对应的主模组 */
  dependencies: Record<string, string[]>
}

export interface ModInventory {
  installedModIds: string[]
  kubejsAddons: string[]
  failed: { name: string; error: string }[]
}

export type ProgressFn = (done: number, total: number, name: string) => void

/** KubeJS 附属 modId 判据：以 `kubejs_` / `kubejs-` 开头且不是本体。 */
export function isKubejsAddonModId(modId: string): boolean {
  const lower = modId.toLowerCase()
  return lower !== 'kubejs' && /^kubejs[-_]/.test(lower)
}

/** 列出目录下顶层 `*.jar` 文件名（子目录与 .litemod 之类不算）。 */
export async function listJarNames(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  return names.filter((n) => n.toLowerCase().endsWith('.jar'))
}

/** 只取 [[mods]] 族的 modId；数组值里的多个引号串都收。 */
const MOD_ID_LINE = /^\s*(?:"?modId"?|'?modId'?)\s*=\s*(.+)$/i
const QUOTED = /["']([^"']+)["']/g
const ARRAY_HEADER = /^\s*\[\[([^\]]+)\]\]/
const TABLE_HEADER = /^\s*\[([^\]]+)\]/

/** 把 `'''…'''` / `"""…"""` 多行字符串整段抹掉（用等量换行占位，行号不变）。 */
function blanketMultilineStrings(text: string): string {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const three = text.slice(i, i + 3)
    if (three === "'''" || three === '"""') {
      const close = text.indexOf(three, i + 3)
      const block = close === -1 ? text.slice(i) : text.slice(i, close + 3)
      out.push('\n'.repeat((block.match(/\n/g)?.length ?? 0) + 1))
      i += block.length
      continue
    }
    out.push(text[i] ?? '')
    i += 1
  }
  return out.join('')
}

/** 去掉行尾 `#` 注释：只在引号之外才截断。 */
function stripComment(line: string): string {
  let quote = ''
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] ?? ''
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '#') return line.slice(0, i)
  }
  return line
}

function modIdsFromValue(value: string): string[] {
  const ids: string[] = []
  for (const m of value.matchAll(QUOTED)) if (m[1]) ids.push(m[1].trim())
  return ids
}

export interface ModsTomlFacts {
  modIds: string[]
  /** key = 声明方 modId，value = 被依赖的 modId 列表 */
  dependencies: Record<string, string[]>
}

/** 宽松解析 mods.toml：按行扫描表头，只在 `[[mods]]` 块内取 modId。 */
export function parseModsToml(raw: string): ModsTomlFacts {
  const text = blanketMultilineStrings(raw.replace(/^\uFEFF/, ''))
  const modIds: string[] = []
  const dependencies: Record<string, string[]> = {}
  let inMods = false
  /** 当前 `[[dependencies.<owner>]]` 的 owner；无 owner 时归到最后声明的 mod */
  let depOwner: string | null = null
  let lastModId: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine)
    const arrayHeader = ARRAY_HEADER.exec(line)
    const tableHeader = arrayHeader ? null : TABLE_HEADER.exec(line)
    if (arrayHeader || tableHeader) {
      const name = ((arrayHeader?.[1] ?? tableHeader?.[1] ?? '') as string).trim().toLowerCase()
      inMods = name === 'mods'
      if (name.startsWith('dependencies')) {
        const inner = ((arrayHeader?.[1] ?? '') as string).trim()
        const dot = inner.indexOf('.')
        depOwner = dot >= 0 ? inner.slice(dot + 1).trim() : lastModId
      } else {
        depOwner = null
      }
      continue
    }

    const idLine = MOD_ID_LINE.exec(line)
    if (!idLine) continue
    const ids = modIdsFromValue(idLine[1] ?? '')
    if (ids.length === 0) continue
    if (inMods) {
      for (const id of ids) {
        if (!modIds.includes(id)) modIds.push(id)
        lastModId = id
      }
      continue
    }
    if (depOwner) {
      const bucket = (dependencies[depOwner] ??= [])
      for (const id of ids) if (!bucket.includes(id)) bucket.push(id)
    }
  }
  return { modIds, dependencies }
}

export interface FabricFacts {
  modIds: string[]
  dependencies: string[]
}

/** fabric.mod.json：正常走 JSON.parse，坏 JSON 退到正则取顶层 "id"。 */
export function parseFabricModJson(raw: string): FabricFacts {
  const text = raw.replace(/^\uFEFF/, '')
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const modIds = typeof obj['id'] === 'string' ? [obj['id']] : []
      return { modIds, dependencies: dependsKeys(obj['depends']) }
    }
  } catch {
    /* 落到正则 */
  }
  const m = /^\s*\{?\s*,?\s*"id"\s*:\s*"([^"]+)"/.exec(text)
  return { modIds: m?.[1] ? [m[1]] : [], dependencies: [] }
}

function dependsKeys(depends: unknown): string[] {
  if (!depends || typeof depends !== 'object') return []
  if (Array.isArray(depends)) return depends.filter((x): x is string => typeof x === 'string')
  const obj = depends as Record<string, unknown>
  return Object.keys(obj).filter((k) => {
    const v = obj[k]
    return typeof v === 'string' || typeof v === 'object' || Array.isArray(v) || typeof v === 'number'
  })
}

/** 简易并发池：并发 = 常量上限，顺序无关，失败不中断。 */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length || 1) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await fn(items[index])
    }
  })
  await Promise.all(runners)
}

function formatOf(entryName: string): MetaFormat {
  if (entryName === FABRIC_JSON) return 'fabric'
  return entryName === NEOFORGE_MODS_TOML ? 'neoforge' : 'forge'
}

/**
 * 完整扫描：modId 集合 + 附属 + 依赖声明 + 元数据格式计数（后者供加载器兜底判定）。
 * 单个 jar 读失败只记 ERROR 并进 failed 数组，绝不中断。
 */
export async function scanModMetadata(modsDir: string, onProgress?: ProgressFn): Promise<ModScanResult> {
  const jars = await listJarNames(modsDir)
  const result: ModScanResult = {
    installedModIds: [],
    kubejsAddons: [],
    failed: [],
    entries: [],
    formatCounts: { forge: 0, neoforge: 0, fabric: 0 },
    dependencies: {}
  }
  let done = 0

  await pool(jars, SCAN_WORKER_MAX_CONCURRENCY, async (name) => {
    try {
      const buffers = await readMany(join(modsDir, name), META_ENTRIES)
      for (const [entryName, buffer] of buffers) {
        const text = buffer.toString('utf8')
        const format = formatOf(entryName)
        const facts = format === 'fabric' ? fabricToFacts(parseFabricModJson(text)) : parseModsToml(text)
        for (const modId of facts.modIds) {
          const depends = facts.dependencies[modId] ?? []
          result.entries.push({ jar: name, modId, format, depends })
          result.formatCounts[format] += 1
          const bucket = (result.dependencies[modId] ??= [])
          for (const dep of depends) if (!bucket.includes(dep)) bucket.push(dep)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('MODPACK', `${name} 元数据读取失败（已跳过）`, message)
      result.failed.push({ name, error: message })
    } finally {
      done += 1
      onProgress?.(done, jars.length, name)
    }
  })

  if (result.failed.length > 0) {
    logger.warn(
      'MODPACK',
      `${result.failed.length} 个 mod 元数据解析失败（已跳过，不影响其余扫描）`,
      result.failed.map((f) => `${f.name}：${f.error}`).join('\n')
    )
  }

  result.installedModIds = uniqueSorted(result.entries.map((e) => e.modId))
  result.kubejsAddons = result.installedModIds.filter(isKubejsAddonModId)
  return result
}

function fabricToFacts(facts: FabricFacts): ModsTomlFacts {
  const dependencies: Record<string, string[]> = {}
  for (const id of facts.modIds) dependencies[id] = facts.dependencies
  return { modIds: facts.modIds, dependencies }
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))].sort((a, b) => a.localeCompare(b, 'en'))
}

/**
 * 规格交付口径：mods 目录 → 已装 modId 全集、KubeJS 附属列表、失败清单。
 * 附属→主模组的对应关系由 `scanModMetadata` 的 `dependencies` 提供，这里不猜。
 */
export async function readModInventory(modsDir: string, onProgress?: ProgressFn): Promise<ModInventory> {
  const scan = await scanModMetadata(modsDir, onProgress)
  return { installedModIds: scan.installedModIds, kubejsAddons: scan.kubejsAddons, failed: scan.failed }
}
