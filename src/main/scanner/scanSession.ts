/**
 * OPT4-R4（A）：扫描会话的「本次产物记录器」——用于**取消时把本次写出的东西清干净**。
 *
 * 硬约束：
 * - **只清理记录内的路径**，绝不遍历目录、绝不触碰既有文件；
 * - 单个 `unlink` 失败只计数并告警，**不中断其余清理、不抛**；
 * - **完成/失败（非取消）时不清理**，只丢弃记录。
 */
import { unlink } from 'node:fs/promises'
import { logger } from '../logger'

interface Session {
  icons: Set<string>
  cacheFiles: Set<string>
}

let session: Session | null = null

/** 清理并发批大小：37k 文件串行要数十秒，32 路并发可压到数秒 */
const BATCH = 32

export function startScanSession(): void {
  session = { icons: new Set(), cacheFiles: new Set() }
}

export function endScanSession(): void {
  session = null
}

/** 记录本次写出的图标；无会话时静默忽略（如非扫描路径的写图标） */
export function recordIcon(path: string): void {
  session?.icons.add(path)
}

/** 记录本次写/更新的缓存文件 */
export function recordCacheFile(path: string): void {
  session?.cacheFiles.add(path)
}

export interface CleanupReport {
  removed: number
  failed: number
  /** 本次记录的路径总数（0 表示无需清理） */
  total: number
}

export async function cleanupScanSession(): Promise<CleanupReport> {
  if (!session) return { removed: 0, failed: 0, total: 0 }
  const all = [...session.icons, ...session.cacheFiles]
  let removed = 0
  let failed = 0
  // 冷扫一次能写出 3.7 万张图标——串行 `await unlink` 要几十秒，
  // 调用方（取消流程）等不到就以为「没清」。改分批并发（每批 BATCH）。
  logger.info('SCAN', `取消清理：开始，共 ${all.length} 个`)
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH)
    const results = await Promise.allSettled(chunk.map((p) => unlink(p)))
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        removed += 1
        return
      }
      // ENOENT = 已经被删/没写成，不算失败
      const code = (r.reason as NodeJS.ErrnoException | undefined)?.code
      if (code === 'ENOENT') {
        removed += 1
        return
      }
      failed += 1
      logger.warn('SCAN', `取消清理：无法删除 ${chunk[idx]}`, String(r.reason))
    })
  }
  session = null
  logger.info('SCAN', `取消清理：已清理本次产物 ${removed}/${all.length}（失败 ${failed}）`)
  return { removed, failed, total: all.length }
}

/** 仅供测试：读取当前会话记录（无会话返回 null） */
export function scanSessionSnapshot(): { icons: string[]; cacheFiles: string[] } | null {
  if (!session) return null
  return { icons: [...session.icons], cacheFiles: [...session.cacheFiles] }
}
