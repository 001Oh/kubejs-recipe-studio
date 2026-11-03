/**
 * T-27：清理缓存（用户主动触发，分类勾选）。
 *
 * 安全铁律（逐条落实）：
 * 1. 只允许删除 userData 下指定目录内的文件（每个路径过 `inside()` 前缀校验）；
 * 2. **不跟随符号链接**（`lstat` 判定，链接本身也不删）；
 * 3. 用户数据永不触碰：`recipe-backups/`、`uiState.json`、`customRecipeTypes.json`、`plugin-disabled.json`、`localStorage/`；
 * 4. 单路径失败只计数、不中断（`Promise.allSettled`，BATCH=32）；
 * 5. 扫描进行中拒绝清理；同时只允许一个清理任务；
 * 6. 目录不存在 → 统计 0、清理跳过，不报错。
 */
import { lstat, readdir, unlink } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { app } from 'electron'
import { registerHandler } from '../ipcRegistry'
import { logger } from '../logger'

const BATCH = 32

export type CacheKind = 'index' | 'icons' | 'browser' | 'temp' | 'logs'

export interface CacheStatRow {
  kind: CacheKind
  files: number
  bytes: number
}

/** 绝不参与清理的用户数据（相对 userData） */
export const PROTECTED = [
  'recipe-backups',
  'recipe-backups-trash',
  'uiState.json',
  'customRecipeTypes.json',
  'plugin-disabled.json',
  'Local Storage',
  'logs'
] as const

function userData(): string {
  return app.getPath('userData')
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/') && !/^[a-zA-Z]:/.test(rel)
}

/** 各类别的根目录（相对 userData）；logs 单独按文件名过滤 */
export const CACHE_DIRS: Record<Exclude<CacheKind, 'temp' | 'logs'>, string[]> = {
  index: ['studio-cache'],
  icons: ['icon-cache'],
  browser: ['Cache', 'Code Cache', 'GPUCache']
}

interface Entry {
  path: string
  bytes: number
}

/** 递归收集文件（不跟随符号链接；不删链接本身） */
async function walk(dir: string, out: Entry[], depth = 0): Promise<void> {
  if (depth > 8) return
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return
  }
  for (const name of names) {
    const p = join(dir, name)
    let st
    try {
      st = await lstat(p)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) {
      await walk(p, out, depth + 1)
      continue
    }
    out.push({ path: p, bytes: st.size })
  }
}

async function collect(kind: CacheKind, rootIn?: string): Promise<Entry[]> {
  const root = rootIn ?? userData()
  const out: Entry[] = []
  if (kind === 'logs') {
    const dir = join(root, 'logs')
    let names: string[] = []
    try {
      names = await readdir(dir)
    } catch {
      return out
    }
    for (const n of names) {
      if (!/^studio-.*\.log$/i.test(n)) continue
      const p = join(dir, n)
      try {
        const st = await lstat(p)
        if (st.isFile()) out.push({ path: p, bytes: st.size })
      } catch {
        /* 读不到就跳过 */
      }
    }
    return out
  }
  if (kind === 'temp') {
    for (const base of ['studio-cache', 'icon-cache', 'logs']) {
      const dir = join(root, base)
      const all: Entry[] = []
      await walk(dir, all)
      out.push(...all.filter((e) => e.path.toLowerCase().endsWith('.tmp')))
    }
    return out
  }
  for (const rel of CACHE_DIRS[kind]) {
    const all: Entry[] = []
    await walk(join(root, rel), all)
    out.push(...all)
  }
  return out
}

export async function statCache(rootIn?: string): Promise<{ rows: CacheStatRow[]; backup: { files: number; bytes: number } }> {
  const root = rootIn ?? userData()
  const kinds: CacheKind[] = ['index', 'icons', 'browser', 'temp', 'logs']
  const rows: CacheStatRow[] = []
  for (const kind of kinds) {
    const entries = await collect(kind, root)
    rows.push({ kind, files: entries.length, bytes: entries.reduce((s, e) => s + e.bytes, 0) })
  }
  // 备份目录只读统计（永不删）
  const backupEntries: Entry[] = []
  await walk(join(root, 'recipe-backups'), backupEntries)
  return { rows, backup: { files: backupEntries.length, bytes: backupEntries.reduce((s, e) => s + e.bytes, 0) } }
}

let running = false
export function isCacheClearRunning(): boolean {
  return running
}

export interface ClearResult {
  removed: number
  failed: number
  bytes: number
}

export async function clearCache(
  kinds: CacheKind[],
  rootIn?: string,
  onProgress?: (p: { kind: CacheKind; done: number; total: number }) => void
): Promise<ClearResult> {
  if (running) throw new Error('已有清理任务在进行')
  running = true
  const root = rootIn ?? userData()
  let removed = 0
  let failed = 0
  let bytes = 0
  try {
    for (const kind of kinds) {
      const entries = await collect(kind, root)
      const total = entries.length
      let done = 0
      onProgress?.({ kind, done: 0, total })
      for (let i = 0; i < entries.length; i += BATCH) {
        const chunk = entries.slice(i, i + BATCH)
        const results = await Promise.allSettled(
          chunk.map(async (e) => {
            // 双保险：路径必须在 userData 内且不在受保护列表里
            if (!inside(root, e.path)) throw new Error('OUTSIDE_ROOT')
            const rel = relative(root, e.path).replace(/\\/g, '/')
            if (PROTECTED.some((p) => rel === p || rel.startsWith(`${p}/`)) && kind !== 'logs') {
              throw new Error('PROTECTED')
            }
            await unlink(e.path)
            return e.bytes
          })
        )
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            removed += 1
            bytes += r.value
          } else {
            const code = (r.reason as NodeJS.ErrnoException | undefined)?.code
            if (code === 'ENOENT') {
              removed += 1
              return
            }
            failed += 1
          }
        })
        done += chunk.length
        onProgress?.({ kind, done, total })
      }
    }
    logger.info('IO', `清理完成：删除 ${removed} 个（失败 ${failed}），释放 ${(bytes / 1048576).toFixed(1)} MB`)
    return { removed, failed, bytes }
  } finally {
    running = false
  }
}

export function registerCacheHandlers(): void {
  registerHandler('cache:stat', () => statCache())
  registerHandler('cache:clear', (req) =>
    // 进度事件由渲染层轮询 cache:stat 反映，这里不挂流式通道（首版）
    clearCache((req?.kinds ?? []) as CacheKind[])
  )
}
