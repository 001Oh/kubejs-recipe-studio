/**
 * P-C6：覆盖配方文件前的原文件备份。
 *
 * 硬性要求（与评审 A 对应）：
 * - 备份必须与目标文件一一对应：文件名带目标 basename、时间戳与目标路径哈希，另写 `.meta.json` 记录 target；
 * - 备份写入也走 tmp + rename，避免出现「半截备份」被当成有效原文；
 * - 目标文件已存在同名备份时用 `wx` 递增后缀，绝不覆盖旧备份；
 * - 任何一步失败都抛错，由调用方在**写盘之前**中止覆盖（不允许「备份失败也继续覆盖」）。
 *
 * 位置：`<userData>/recipe-backups/<modpackHash>/`，不在 `kubejs/data` 下（否则会被扫描成配方）。
 */
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'
import { ensureRecipeBackupDir, ensureRecipeBackupTrashDir } from '../paths'
import { logger } from '../logger'
import { enforceBackupRetention, purgeTrash } from './backupRetention'

export interface BackupResult {
  /** 备份内容文件（绝对路径，仅用于日志与手动恢复） */
  file: string
  /** 描述这次备份的元数据文件 */
  metaFile: string
  /** 原内容哈希（与 commitRecipe 的 hashRaw 不同：这里是原文文本 sha256） */
  sha256: string
  bytes: number
}

export interface BackupInput {
  /** 被覆盖的目标文件绝对路径 */
  target: string
  /** 目标文件当前内容（调用方已读取，保证与哈希校验用的是同一份文本） */
  content: string
  /** 当前整合包根目录，用于分目录与记录来源 */
  modpackPath: string
  now?: number
}

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function writeFileAtomic(path: string, text: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  let handle: Awaited<ReturnType<typeof fsp.open>> | null = null
  try {
    handle = await fsp.open(tmp, 'wx')
    await handle.writeFile(text, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await fsp.rename(tmp, path)
  } catch (err) {
    if (handle) await handle.close().catch(() => undefined)
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

/** 备份目标文件的当前内容；失败抛错（调用方必须中止覆盖） */
export async function backupOriginalFile(input: BackupInput): Promise<BackupResult> {
  const at = input.now ?? Date.now()
  const dir = ensureRecipeBackupDir(input.modpackPath)
  const hash = sha256Of(input.content)
  const stem = `${basename(input.target)}.${stamp(at)}.${hash.slice(0, 6)}`
  let file = join(dir, stem)
  // `wx` 语义：绝不覆盖已有备份；撞名（同一秒 + 同哈希）时递增后缀
  for (let i = 1; i < 100; i += 1) {
    try {
      await fsp.writeFile(file, '', { flag: 'wx' })
      break
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST' || i === 99) throw err
      file = join(dir, `${stem}-${i}`)
    }
  }
  try {
    await writeFileAtomic(file, input.content)
    const metaFile = `${file}.meta.json`
    await writeFileAtomic(
      metaFile,
      `${JSON.stringify(
        {
          target: input.target,
          backup: file,
          sha256: hash,
          bytes: Buffer.byteLength(input.content, 'utf8'),
          atMs: at,
          modpackPath: input.modpackPath
        },
        null,
        2
      )}\n`
    )
    logger.info('IO', `已备份原文件：${basename(file)}（${Buffer.byteLength(input.content, 'utf8')} 字节）`, file)
    // C7-F1：备份**已成功落盘**之后才做保留策略。这里故意吞掉异常——保留策略失败
    // 只意味着"旧备份没被清理"，绝不能反过来让一次成功的备份变成失败、更不能阻断覆盖。
    try {
      const trashDir = ensureRecipeBackupTrashDir(input.modpackPath)
      await enforceBackupRetention(dir, trashDir)
      await purgeTrash(trashDir, { now: at })
    } catch (err) {
      logger.warn('IO', `备份保留策略失败（不影响本次备份，下次备份会再试）：${String(err && (err as Error).message)}`)
    }
    return { file, metaFile, sha256: hash, bytes: Buffer.byteLength(input.content, 'utf8') }
  } catch (err) {
    // 备份不完整时清掉残留，避免留下“看起来像备份”的半成品
    await fsp.rm(file, { force: true }).catch(() => undefined)
    throw err
  }
}
