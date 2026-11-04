/**
 * 「在资源管理器中定位源文件」通道（第 115 批续做）。
 *
 * 安全前提：渲染进程**永远不传路径**，只传配方 uid；路径由主进程从 `file:` uid 解析，
 * 再用 `inside(modpackRoot, …)` 做越界校验。这样即使渲染进程被完全接管，也只能"显示"
 * 整合包目录内的文件（`showItemInFolder` 只定位、不执行）。
 *
 * 三条拒绝路径（都带机器可读 code，UI 据此降级为"复制路径"）：
 *   - OUTSIDE_ROOT      uid 解析出的路径落在整合包根目录之外
 *   - SOURCE_NOT_FOUND  uid 不是 file: 形态（jar / 数据包内嵌条目没有独立文件）、或文件已不存在
 *   - NO_MODPACK        尚未导入整合包
 *
 * 不复用 codegen/writer、cacheHandlers、commitRecipe 里各自的 `inside()`：那三处是私有的，
 * 本批约束是「不重构既有模块」，故按同一语义在本文件内实现一份（同样的 relative 判定）。
 */
import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { shell } from 'electron'
import type { ModpackInfo } from '../../shared/types'
import { registerHandler } from '../ipcRegistry'
import { getCurrentModpack } from '../modpack/state'
import { logger } from '../logger'

export interface RevealRequest {
  /** 配方 uid（`file:<绝对路径>` 或 `file:<绝对路径>#recipe#<n>`） */
  uid: string
}

export interface RevealDeps {
  modpack: ModpackInfo | null
  /** 便于测试注入；生产传 electron 的 `shell.showItemInFolder` */
  showItemInFolder: (path: string) => void
}

export interface RevealResult {
  revealed: true
  /** 包内绝对路径（Windows 反斜杠形式，便于展示与排查） */
  path: string
  /** 相对整合包根目录的路径（正斜杠，展示用） */
  relativePath: string
}

/** name 即错误码：ipcRegistry 会把 Error.name 原样回传给渲染层 */
class RevealError extends Error {
  constructor(message: string, code: string) {
    super(message)
    this.name = code
  }
}

/** 与 codegen/writer、commitRecipe 同义的根目录校验：目标必须严格落在 root 之内 */
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * 从 `file:` uid 取磁盘路径。
 * 同时兼容三种既有写法（见 jsonSource.ts / commitRecipe.ts / scriptSource.ts）：
 *   `file:E:/pack/kubejs/data/x.json`（正斜杠）
 *   `file:E:\pack\kubejs\data\x.json`（反斜杠）
 *   `file:E:/pack/kubejs/server_scripts/a.js#recipe#3`（脚本内第 n 条）
 */
export function pathFromFileUid(uid: string): string | null {
  if (typeof uid !== 'string') return null
  const trimmed = uid.trim()
  if (!/^file:/i.test(trimmed)) return null
  const rest = trimmed.slice('file:'.length)
  // 只允许 file: 前缀 + 路径；`#` 之后是条目定位信息，不属于路径
  const hashIdx = rest.indexOf('#')
  const raw = (hashIdx >= 0 ? rest.slice(0, hashIdx) : rest).trim()
  if (raw === '') return null
  return raw.replace(/\//g, '\\')
}

export async function revealSource(req: RevealRequest, deps: RevealDeps): Promise<RevealResult> {
  const uid = typeof req?.uid === 'string' ? req.uid : ''
  if (uid === '') throw new RevealError('缺少配方 uid，无法定位源文件', 'INVALID_REQUEST')

  const modpack = deps.modpack
  if (!modpack) throw new RevealError('尚未导入整合包，无法定位源文件', 'NO_MODPACK')

  const resolved = pathFromFileUid(uid)
  if (!resolved) {
    // jar / datapack 内嵌条目：没有独立的磁盘文件可定位。禁止"猜路径"回退。
    throw new RevealError(`该配方没有独立的源文件（${uid}），无法在资源管理器中定位`, 'SOURCE_NOT_FOUND')
  }

  // 越界校验必须在 stat 之前：包外路径不允许探测存在性
  if (!inside(modpack.path, resolved)) {
    throw new RevealError(`源文件不在当前整合包目录内，已拒绝：${resolved}`, 'OUTSIDE_ROOT')
  }

  let isFile = false
  try {
    isFile = (await stat(resolved)).isFile()
  } catch {
    isFile = false
  }
  if (!isFile) throw new RevealError(`源文件已不存在：${resolved}`, 'SOURCE_NOT_FOUND')

  deps.showItemInFolder(resolved)
  const relativePath = relative(resolve(modpack.path), resolve(resolved)).replace(/\\/g, '/')
  logger.info('IO', `已在资源管理器中定位源文件：${relativePath}`, resolved)
  return { revealed: true, path: resolved, relativePath }
}

/**
 * 接线（由 handlers/index.ts 调用）。
 * 用 `showItemInFolder` 而不是 `openPath`：只在资源管理器里选中文件，不把 .json/.js
 * 交给系统默认程序执行。
 */
export function registerSourceHandlers(): void {
  registerHandler('source:reveal', (req) =>
    revealSource(req, {
      modpack: getCurrentModpack(),
      showItemInFolder: (target) => shell.showItemInFolder(target)
    })
  )
}
