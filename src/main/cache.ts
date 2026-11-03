/**
 * 缓存层：物品索引 / 配方摘要 / schema 的 JSON 落盘与失效判定。
 * 失效判据 = mods 目录 mtime + jar 数量 + 总字节数（规格 3.2）。
 */
import { createReadStream, existsSync, promises as fsp, statSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from './logger'
import { cacheFile, ensureModpackCacheDir } from './paths'

export interface ModsSignature {
  mtimeMs: number
  jarCount: number
  totalBytes: number
}

export interface CacheMeta {
  modpackPath: string
  signature: ModsSignature
  /** 元数据检测得到的 MC/KubeJS 版本，参与失效判断（同名目录换包必须重扫） */
  mcVersion: string | null
  kubejsVersion: string | null
  builtAtMs: number
  itemElapsedMs: number
  recipeElapsedMs: number
  appVersion: string
  schemaVersion: number
  /** 解析器版本（启发式 / 图标提取 / 反推规则），语义一变旧缓存必须作废 */
  parserVersion: number
  /** kubejs 脚本、数据包、datapacks 的聚合签名；mods 之外的改动靠它兜底 */
  extras: string
  /**
   * 已成功完成的阶段。只有写到这里、且文件齐全的阶段才算有效；
   * 扫描中断或部分失败时整份 meta 都不落盘（宁可重扫，也不能把半成品当完整）。
   */
  phases: string[]
}

export const CACHE_SCHEMA_VERSION = 2

/**
 * 解析器版本。与 CACHE_SCHEMA_VERSION 分开：前者是「存成什么形状」，
 * 后者是「按什么规则算」，混用一个号会让改字段名顺手顶掉规则变更（或反之）。
 */
export const PARSER_VERSION = 1

/** 计算 mods 目录签名；只统计 *.jar，避免 config 改动导致重扫。 */
export async function computeModsSignature(modsDir: string): Promise<ModsSignature> {
  const names = await fsp.readdir(modsDir)
  let jarCount = 0
  let totalBytes = 0
  let mtimeMs = 0
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.jar')) continue
    const st = statSync(join(modsDir, name))
    if (!st.isFile()) continue
    jarCount += 1
    totalBytes += st.size
    mtimeMs = Math.max(mtimeMs, Math.round(st.mtimeMs))
  }
  return { mtimeMs, jarCount, totalBytes }
}

function sameSignature(a: ModsSignature, b: ModsSignature): boolean {
  return a.mtimeMs === b.mtimeMs && a.jarCount === b.jarCount && a.totalBytes === b.totalBytes
}

/**
 * mods 之外的改动签名：kubejs/server_scripts、kubejs/data、config/openloader/data、datapacks。
 * 这几处是用户自己会改的东西，改完必须能重扫，否则「配方库」会一直显示旧内容。
 */
export async function computeExtrasSignature(modpackPath: string): Promise<string> {
  const roots = [
    join(modpackPath, 'kubejs', 'server_scripts'),
    join(modpackPath, 'kubejs', 'data'),
    join(modpackPath, 'config', 'openloader', 'data'),
    join(modpackPath, 'datapacks')
  ]
  const parts: string[] = []
  for (const root of roots) {
    let count = 0
    let bytes = 0
    let mtime = 0
    await walk(root, (size, mtimeMs) => {
      count += 1
      bytes += size
      mtime = Math.max(mtime, Math.round(mtimeMs))
    })
    parts.push(`${basenameOf(root)}:${count}:${bytes}:${mtime}`)
  }
  return parts.join('|')
}

function basenameOf(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return idx === -1 ? normalized : normalized.slice(idx + 1)
}

async function walk(dir: string, onFile: (size: number, mtimeMs: number) => void): Promise<void> {
  let names: string[]
  try {
    names = await fsp.readdir(dir)
  } catch {
    return
  }
  for (const name of names) {
    const abs = join(dir, name)
    try {
      const st = await fsp.stat(abs)
      if (st.isDirectory()) await walk(abs, onFile)
      else if (st.isFile()) onFile(st.size, st.mtimeMs)
    } catch {
      /* 单个文件读不到不影响签名聚合 */
    }
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  try {
    const chunks: Buffer[] = []
    for await (const chunk of createReadStream(path)) chunks.push(chunk as Buffer)
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch (err) {
    logger.warn('INDEX', `缓存文件损坏，已忽略：${path}`, err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await fsp.mkdir(join(path, '..'), { recursive: true })
  // tmp 名带 pid 与随机尾，避免同一文件被两个阶段并发覆写后再 rename
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(value), 'utf8')
  await fsp.rename(tmp, path)
}

/** 阶段名 → 缓存文件名；未登记的阶段视为「无独立文件」（由内存/其它缓存承担） */
const PHASE_FILE = { items: 'items', recipes: 'recipes', schemas: 'schemas' } as const
type CachePhase = keyof typeof PHASE_FILE

/**
 * 命中条件：签名一致 + 版本一致 + 解析器一致 + `requiredPhases` 全部完成且文件齐全。
 *
 * 失效条件按「谁依赖谁」分开，不搞一刀切：
 * - 物品索引只依赖 mods 签名（它的数据只来自 mods/*.jar）；
 * - 配方库额外依赖 `extras`（kubejs 脚本 / kubejs data / openloader / datapacks 都会改变配方）；
 * 因此只有当 `requiredPhases` 里包含 `recipes` 时才比对 `extras`，切虚拟物品之类显示偏好永远不参与。
 */
export async function isCacheValid(
  modpackPath: string,
  signature: ModsSignature,
  mcVersion: string | null,
  kubejsVersion: string | null,
  options: { requiredPhases?: CachePhase[]; extras?: string } = {}
): Promise<{ valid: boolean; meta: CacheMeta | null; reason: string }> {
  const required = options.requiredPhases ?? (['items'] as CachePhase[])
  const meta = await readJson<CacheMeta>(cacheFile(modpackPath, 'meta'))
  if (!meta) return { valid: false, meta: null, reason: '无缓存记录' }
  if (meta.schemaVersion !== CACHE_SCHEMA_VERSION)
    return { valid: false, meta, reason: `缓存格式版本 ${meta.schemaVersion} ≠ ${CACHE_SCHEMA_VERSION}` }
  if ((meta.parserVersion ?? 0) !== PARSER_VERSION)
    return { valid: false, meta, reason: `解析器版本 ${meta.parserVersion ?? 0} ≠ ${PARSER_VERSION}` }
  if (meta.mcVersion !== mcVersion || meta.kubejsVersion !== kubejsVersion)
    return { valid: false, meta, reason: '整合包版本发生变化' }
  if (!sameSignature(meta.signature, signature)) return { valid: false, meta, reason: 'mods 目录发生变化' }
  if (required.includes('recipes') && options.extras !== undefined && meta.extras !== options.extras)
    return { valid: false, meta, reason: 'kubejs 脚本 / 数据包 / datapacks 发生变化' }
  const done = new Set(meta.phases ?? [])
  for (const phase of required) {
    if (!done.has(phase)) return { valid: false, meta, reason: `阶段未完成：${phase}` }
    const file = PHASE_FILE[phase]
    if (file && !existsSync(cacheFile(modpackPath, file)))
      return { valid: false, meta, reason: `${phase} 缓存文件缺失` }
  }
  // meta 只在全流程成功后落盘；上面的阶段校验已经覆盖「文件缺失 = 上次写入被打断」
  return { valid: true, meta, reason: '命中缓存' }
}

export async function saveCacheMeta(meta: CacheMeta): Promise<void> {
  ensureModpackCacheDir(meta.modpackPath)
  await writeJson(cacheFile(meta.modpackPath, 'meta'), meta)
}
