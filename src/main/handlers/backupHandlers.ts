/**
 * B129/D-57：备份列表与恢复 IPC。
 *
 * 安全四红线（缺一即是漏洞）：
 * 1. restore 的 target 只从 meta.json 读——绝不从前端传参（防「任意文件写入」）
 * 2. 写回前校验 target 在当前整合包内（realpath + lexical 双重）且包路径一致
 * 3. 恢复前对当前内容做二次备份（undo 点），恢复错了能再恢复
 * 4. 恢复不删除任何备份文件——保留策略交给既有 enforceBackupRetention
 *
 * 封板区零改动：backup.ts / backupRetention.ts / paths.ts 仅 import。
 */
import { promises as fsp } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { registerHandler } from '../ipcRegistry'
import { getCurrentModpack } from '../modpack/state'
import { recipeBackupDir } from '../paths'
import { listBackups } from '../recipes/backupRetention'
import { backupOriginalFile, sha256Of } from '../recipes/backup'
import { logger } from '../logger'

export interface BackupListEntry {
  file: string
  target: string
  atMs: number
  bytes: number
  sha256: string
  exists: boolean
}

export interface BackupRestoreResult {
  target: string
  before: string
  after: string | null
  undoBackup: string | null
  bytes: number
  dryRun: boolean
  restored: boolean
}

class BackupRestoreError extends Error {
  constructor(message: string, code: string) {
    super(message)
    this.name = code
  }
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

async function isInsideReal(root: string, target: string): Promise<boolean> {
  if (!inside(root, target)) return false
  try {
    const realRoot = await realpath(resolve(root))
    const realTarget = await realpath(resolve(target))
    return inside(realRoot, realTarget)
  } catch {
    // 目标不存在 → 词法已通过，不追加 realpath 限制
    return true
  }
}

/** 列出当前整合包的所有备份（按时间倒序，含元数据与目标存在性） */
export async function listBackupsFor(modpackPath: string): Promise<BackupListEntry[]> {
  const dir = recipeBackupDir(modpackPath)
  const entries = await listBackups(dir)
  const result: BackupListEntry[] = []
  for (const entry of entries) {
    let sha256 = ''
    let bytes = 0
    try {
      const meta = JSON.parse(await fsp.readFile(entry.metaFile, 'utf8'))
      sha256 = typeof meta.sha256 === 'string' ? meta.sha256 : ''
      bytes = typeof meta.bytes === 'number' ? meta.bytes : 0
    } catch { /* meta 损坏 → 保留空值，不阻塞列表 */ }
    let exists = false
    try { exists = (await fsp.stat(entry.target)).isFile() } catch { /* target 已删 */ }
    result.push({
      file: entry.file,
      target: entry.target,
      atMs: entry.atMs,
      bytes,
      sha256,
      exists
    })
  }
  return result.sort((a, b) => b.atMs - a.atMs)
}

/**
 * 从备份恢复到原路径。
 * @param backupFile 备份文件绝对路径（不含 .meta.json 后缀）
 * @param currentModpackPath 当前整合包根目录绝对路径
 * @param dryRun true = 只读预览，不写盘
 */
export async function restoreBackupFromFile(
  backupFile: string,
  currentModpackPath: string,
  dryRun?: boolean
): Promise<BackupRestoreResult> {
  // 红线 1：target 只从 meta.json 读，绝不从前端传参
  const metaPath = backupFile + '.meta.json'
  let meta: { target?: unknown; sha256?: unknown; modpackPath?: unknown; bytes?: unknown }
  try {
    meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
  } catch {
    throw new BackupRestoreError(`备份元数据读取失败：${metaPath}`, 'META_READ_FAILED')
  }
  const target = typeof meta.target === 'string' ? meta.target : ''
  if (!target) throw new BackupRestoreError('备份元数据缺少 target 路径', 'META_INVALID')

  // 红线 2a：包路径一致性（防止拿 A 包的备份写进 B 包）
  if (meta.modpackPath !== currentModpackPath) {
    throw new BackupRestoreError(
      `备份属于 ${meta.modpackPath}，当前整合包是 ${currentModpackPath}，拒绝跨包恢复`,
      'MODPACK_MISMATCH'
    )
  }

  // 红线 2b：目标在包内（词法 + realpath 双重校验）
  if (!(await isInsideReal(currentModpackPath, target))) {
    throw new BackupRestoreError(`恢复目标越出整合包目录：${target}`, 'OUTSIDE_ROOT')
  }

  // 读取备份内容
  let backupContent: string
  try {
    backupContent = await fsp.readFile(backupFile, 'utf8')
  } catch (err) {
    throw new BackupRestoreError(`备份文件读取失败：${basename(backupFile)}`, 'BACKUP_READ_FAILED')
  }

  // 备份完整性校验（备份自身没坏才能恢复）
  const actualHash = sha256Of(backupContent)
  if (meta.sha256 && actualHash !== meta.sha256) {
    throw new BackupRestoreError('备份文件内容与元数据 sha256 不匹配（可能已损坏）', 'BACKUP_CORRUPT')
  }

  // 读取当前目标内容（可能不存在——target 被外部删除）
  let currentContent: string | null = null
  try { currentContent = await fsp.readFile(target, 'utf8') } catch { /* 不存在 */ }

  // dryRun：只读预览，不写盘
  if (dryRun) {
    return {
      target,
      before: backupContent,
      after: currentContent ?? '',
      undoBackup: null,
      bytes: typeof meta.bytes === 'number' ? meta.bytes : 0,
      dryRun: true,
      restored: false
    }
  }

  // 红线 3：恢复前对当前内容做二次备份（undo 点）
  let undoBackup: string | null = null
  if (currentContent !== null) {
    const undo = await backupOriginalFile({
      target,
      content: currentContent,
      modpackPath: currentModpackPath
    })
    undoBackup = undo.file
  }

  // 原子写：tmp → rename
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.restore.tmp`)
  try {
    await fsp.mkdir(dirname(target), { recursive: true })
    await fsp.writeFile(tmp, backupContent, 'utf8')
    await fsp.rename(tmp, target)
  } catch (err) {
    try { await fsp.unlink(tmp) } catch { /* tmp 可能没创建 */ }
    throw new BackupRestoreError(
      `恢复写入失败（${target}）：${err instanceof Error ? err.message : String(err)}`,
      'RESTORE_WRITE_FAILED'
    )
  }

  // 回读校验（与备份内容逐字节比较）
  const verify = await fsp.readFile(target, 'utf8')
  if (verify !== backupContent) {
    throw new BackupRestoreError(`恢复后回读不一致：${target}`, 'WRITE_VERIFY_FAILED')
  }

  logger.info('IO', `已恢复备份到 ${target}${undoBackup ? `（撤销点：${undoBackup}）` : ''}`)
  return {
    target,
    before: backupContent,
    after: currentContent ?? '',
    undoBackup,
    bytes: typeof meta.bytes === 'number' ? meta.bytes : 0,
    dryRun: false,
    restored: true
  }
}

/** IPC 注册（由 handlers/index.ts 调用） */
export function registerBackupHandlers(): void {
  registerHandler('backup:list', async () => {
    const modpack = getCurrentModpack()
    if (!modpack) throw new BackupRestoreError('尚未导入整合包，无法列出备份', 'NO_MODPACK')
    return { entries: await listBackupsFor(modpack.path) }
  })

  registerHandler('backup:restore', async (req) => {
    const modpack = getCurrentModpack()
    if (!modpack) throw new BackupRestoreError('尚未导入整合包，无法恢复备份', 'NO_MODPACK')
    return restoreBackupFromFile(req.backupFile, modpack.path, req.dryRun)
  })
}
