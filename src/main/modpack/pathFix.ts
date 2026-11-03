/**
 * 路径智能纠正（规格 3.1）。
 * 用户经常选到整合包的上一层（实例目录、`.minecraft`、PCL 的 `versions`），
 * 因此所选目录本身不含 `mods/` 时向下**只扫一层**子目录：
 * - 唯一候选 → 自动采用并给出说明；
 * - 多个候选 → 交给 UI 弹窗让用户选（CandidateModal）；
 * - 没有候选 → 返回固定中文错误，不抛异常、不崩溃（规格六）。
 * 覆盖 `实例名/mods`、`实例名/.minecraft/mods`、`versions/<包名>/mods` 三类常见结构。
 */
import { type Dirent, promises as fsp } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/** 整合包内 mods 目录的固定名（大小写不敏感文件系统下按此名查找）。 */
export const MODS_DIR_NAME = 'mods'

/** 规格 3.1 逐字要求的错误文案，UI 直接展示。 */
export const NO_MODS_ERROR = '所选目录下未找到 mods 文件夹，请选择整合包根目录'

/** 无法读取所选目录（不存在 / 无权限 / 是文件）时的中文错误。 */
export const UNREADABLE_ERROR = '无法读取所选目录，请确认路径存在且有访问权限'

export interface PathFixRoot {
  root: string
  corrected: boolean
  note: string
}
export interface PathFixCandidates {
  candidates: string[]
}
export interface PathFixError {
  error: string
}
export type PathFixResult = PathFixRoot | PathFixCandidates | PathFixError

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fsp.stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** 该目录是否直接含 `mods/`（必须是目录，同名文件不算）。 */
export async function hasModsDir(dir: string): Promise<boolean> {
  return isDirectory(join(dir, MODS_DIR_NAME))
}

/** 一层子目录名，含符号链接目录（stat 会跟随，读不到就跳过）。 */
async function subDirectories(dir: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'en'))
}

/**
 * 把用户选中的路径纠正为真正的整合包根目录。
 * 三种返回形态互斥：`root`（可用）/ `candidates`（要用户选）/ `error`（要重新选）。
 */
export async function resolveModpackRoot(picked: string): Promise<PathFixResult> {
  const trimmed = (picked ?? '').trim().replace(/^"|"$/g, '')
  if (!trimmed) return { error: NO_MODS_ERROR }
  const base = resolve(trimmed)
  if (!(await isDirectory(base))) return { error: UNREADABLE_ERROR }

  if (await hasModsDir(base)) return { root: base, corrected: false, note: '' }

  const found: string[] = []
  for (const name of await subDirectories(base)) {
    const child = join(base, name)
    if (await hasModsDir(child)) found.push(child)
  }

  if (found.length === 1) {
    const rel = relative(base, found[0]).replace(/\\/g, '/')
    return {
      root: found[0],
      corrected: true,
      note: `所选目录未直接包含 mods/，已自动向下定位到子目录 ${rel}`
    }
  }
  if (found.length > 1) return { candidates: found }

  return { error: NO_MODS_ERROR }
}
