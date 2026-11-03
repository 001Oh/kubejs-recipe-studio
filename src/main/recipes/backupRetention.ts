/**
 * C7-F1：备份**保留策略**与隔离区清理。
 *
 * ## 职责边界（硬约束）
 * 本模块**只操作备份目录与隔离区**：
 * - 读：`<userData>/recipe-backups/<modpackHash>/` 下的 `*` 与 `*.meta.json`；
 * - 移：把**超额的旧备份**移入 `<userData>/recipe-backups-trash/<modpackHash>/`（同卷 `rename`）；
 * - 删：隔离区内**超过 TTL**（D-36 = 2 天）的条目。
 * **绝不读写** `kubejs/data/**` 下的配方原文——主数据写盘路径（`commitRecipe` / `codegen` 的
 * `writeOne` / `backupExisting`）不在本模块的调用链内，见 `PROJECT-T31-IMPLEMENT-01.md` §调用链证据。
 *
 * ## 规则
 * 1. **按目标（`meta.target`）计数**，上限 `BACKUP_KEEP_LIMIT = 50`（硬上限）；
 * 2. 超额时**最旧优先**移入隔离区；
 * 3. **每个目标永远保留最新一份**——即使上限被配成 0，也至少留 1；
 * 4. 备份与其 `.meta.json` **成对移动**（元数据丢了就等于无法还原到哪个目标）；
 * 5. 隔离区条目**超过** 2 天（严格大于）才永久删除：**恰好 2 天整不删**，避免边界抖动误删。
 */
import { promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'
import { logger } from '../logger'

/** 每个目标的备份数量硬上限 */
export const BACKUP_KEEP_LIMIT = 50

/** 隔离区保留时长（D-36：2 天） */
export const TRASH_TTL_MS = 2 * 24 * 60 * 60 * 1000

const META_SUFFIX = '.meta.json'
const TMP_SUFFIX = '.tmp'

export interface BackupEntry {
  /** 备份内容文件绝对路径 */
  file: string
  /** 对应元数据文件绝对路径（可能不存在，历史备份兼容） */
  metaFile: string
  /** 归属目标：优先取 meta.target，缺失时退回文件名首个 `.` 之前的部分 */
  target: string
  /** 排序用的时间（meta.atMs 优先，其次文件 mtime） */
  atMs: number
}

interface MetaShape {
  target?: unknown
  atMs?: unknown
}

async function readMeta(metaFile: string): Promise<MetaShape | null> {
  try {
    const raw = await fsp.readFile(metaFile, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as MetaShape) : null
  } catch {
    return null
  }
}

/** 列出备份目录里的内容文件（排除 `.meta.json` 与 `.tmp` 残留），附带归属与时间 */
export async function listBackups(dir: string): Promise<BackupEntry[]> {
  let names: string[]
  try {
    names = await fsp.readdir(dir)
  } catch {
    // 目录不存在 = 还没有任何备份，不是错误
    return []
  }
  const out: BackupEntry[] = []
  for (const name of names) {
    if (name.endsWith(META_SUFFIX) || name.endsWith(TMP_SUFFIX)) continue
    const file = join(dir, name)
    let st: Awaited<ReturnType<typeof fsp.stat>>
    try {
      st = await fsp.stat(file)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const metaFile = `${file}${META_SUFFIX}`
    const meta = await readMeta(metaFile)
    const target = typeof meta?.target === 'string' && meta.target ? meta.target : name.split('.')[0]
    const atMs = typeof meta?.atMs === 'number' && Number.isFinite(meta.atMs) ? meta.atMs : st.mtimeMs
    out.push({ file, metaFile, target, atMs })
  }
  return out.sort((a, b) => a.atMs - b.atMs)
}

/** 成对移动：内容文件 + `.meta.json`（meta 不存在时只移动内容文件，属历史遗留） */
async function movePair(entry: BackupEntry, trashDir: string): Promise<void> {
  const destFile = join(trashDir, basename(entry.file))
  await fsp.rename(entry.file, destFile)
  try {
    await fsp.rename(entry.metaFile, `${destFile}${META_SUFFIX}`)
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') {
      // 元数据移动失败：把内容文件挪回来，避免出现"半对"
      await fsp.rename(destFile, entry.file).catch(() => undefined)
      throw err
    }
  }
}

export interface RetentionResult {
  /** 仍在备份目录中的条目数 */
  kept: number
  /** 本次移入隔离区的条目数 */
  moved: number
}

/**
 * 执行保留策略。幂等：重复调用不会再次移动（已超额的不存在）。
 * 只在**备份成功后**调用；任何异常由调用方决定是否吞掉（备份本身已成功）。
 */
export async function enforceBackupRetention(
  dir: string,
  trashDir: string,
  options: { limit?: number } = {}
): Promise<RetentionResult> {
  const limit = Math.max(1, Math.floor(options.limit ?? BACKUP_KEEP_LIMIT))
  const entries = await listBackups(dir)
  if (entries.length === 0) return { kept: 0, moved: 0 }

  // atMs 升序 → 分组内先按时间倒序（最新在前）
  const byTarget = new Map<string, BackupEntry[]>()
  for (const e of entries) {
    const list = byTarget.get(e.target)
    if (list) list.push(e)
    else byTarget.set(e.target, [e])
  }

  let moved = 0
  for (const list of byTarget.values()) {
    const newestFirst = [...list].sort((a, b) => b.atMs - a.atMs)
    // 第 1 份永远保留；超额部分从最旧开始移
    const extras = newestFirst.slice(limit)
    if (extras.length === 0) continue
    // 隔离区可能还没建（首次触发保留策略时），先补建再移
    await fsp.mkdir(trashDir, { recursive: true })
    for (const entry of extras) {
      await movePair(entry, trashDir)
      moved++
    }
  }

  if (moved > 0) {
    logger.info('IO', `备份保留策略：${moved} 份超额旧备份已移入隔离区（每目标保留 ${limit} 份，最新一份必留）`)
  }
  return { kept: entries.length - moved, moved }
}

export interface PurgeResult {
  /** 永久删除的条目数 */
  purged: number
  /** 仍在隔离区、未到 TTL 的条目数 */
  kept: number
}

/**
 * 清理隔离区中**超过 TTL** 的条目（内容文件 + `.meta.json` 成对删除）。
 * 判定用 `now - atMs > ttlMs`：**恰好等于 TTL 不删**（边界保守，宁可多留一会儿）。
 */
export async function purgeTrash(
  trashDir: string,
  options: { now?: number; ttlMs?: number } = {}
): Promise<PurgeResult> {
  const now = options.now ?? Date.now()
  const ttlMs = options.ttlMs ?? TRASH_TTL_MS
  const entries = await listBackups(trashDir)
  let purged = 0
  for (const entry of entries) {
    if (now - entry.atMs <= ttlMs) continue
    await fsp.rm(entry.file, { force: true })
    await fsp.rm(entry.metaFile, { force: true })
    purged++
  }
  if (purged > 0) logger.info('IO', `隔离区清理：${purged} 份超过 ${Math.round(ttlMs / 3600_000)} 小时的旧备份已永久删除`)
  return { purged, kept: entries.length - purged }
}
