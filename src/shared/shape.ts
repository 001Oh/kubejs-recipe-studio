/**
 * 有序合成的形状裁剪（规格 §五 形状裁剪 + 3.4）。纯函数、无 IO、无 Electron 依赖。
 * 同一份代码同时服务 3×3（原版合成）与 9×9（Create 机械合成）：
 * 算法只依赖 rows/cols 入参与最小包围盒，绝不按尺寸分支（规格禁止事项不许为 9×9 重写）。
 */
import type { SlotValue } from './types'
import { GRID_MAX_SIZE } from './constants'
import { formatCountPrefix } from './text'

export type ShapeResult =
  | { ok: true; pattern: string[]; key: Record<string, string>; rows: number; cols: number }
  | { ok: false; error: string }

/** 全空网格必须拒绝生成（规格 §五） */
export const EMPTY_SHAPE_ERROR = '网格为空，无法生成有序合成'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DEFAULT_NAMESPACE = 'minecraft'

/** 缺命名空间时补 minecraft:；tag 输出 `#ns:tag`，物品/流体/注册表输出 `ns:id` */
function referenceOf(slot: SlotValue): string {
  const raw = slot.id.trim()
  const namespaced = raw.includes(':') ? raw : `${DEFAULT_NAMESPACE}:${raw}`
  return slot.kind === 'tag' ? `#${namespaced}` : namespaced
}

/** 同 kind + 同引用 + 同数量复用同一字母；数量不同是不同成分，另分一个字母 */
function signatureOf(slot: SlotValue): string {
  return `${slot.kind}|${referenceOf(slot)}|${slot.count ?? 1}`
}

function keyOf(slot: SlotValue): string {
  return formatCountPrefix(referenceOf(slot), slot.count ?? 1)
}

interface Filled {
  row: number
  col: number
  slot: SlotValue
}

function failure(error: string): ShapeResult {
  return { ok: false, error }
}

/**
 * 裁剪非空单元格的最小包围盒，空行空列完全移除（KubeJS 有序合成的硬性要求），
 * 包围盒内部的空洞保留为空格，pattern 行等长。
 */
export function trimShape(grid: (SlotValue | null)[], rows: number, cols: number): ShapeResult {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return failure(`网格尺寸非法：${rows}x${cols}`)
  }
  if (rows > GRID_MAX_SIZE || cols > GRID_MAX_SIZE) {
    return failure(`网格尺寸超出上限 ${GRID_MAX_SIZE}x${GRID_MAX_SIZE}`)
  }
  if (grid.length !== rows * cols) {
    return failure(`网格长度 ${grid.length} 与 ${rows}x${cols} 不匹配`)
  }

  const filled: Filled[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slot = grid[r * cols + c]
      if (!slot || !slot.id || slot.id.trim().length === 0) continue
      filled.push({ row: r, col: c, slot })
    }
  }
  if (filled.length === 0) return failure(EMPTY_SHAPE_ERROR)

  let minRow = filled[0]!.row
  let maxRow = minRow
  let minCol = filled[0]!.col
  let maxCol = minCol
  for (const cell of filled) {
    minRow = Math.min(minRow, cell.row)
    maxRow = Math.max(maxRow, cell.row)
    minCol = Math.min(minCol, cell.col)
    maxCol = Math.max(maxCol, cell.col)
  }

  // 按行主序的首次出现分配 A、B、C…，最多 26 个字母
  const letters = new Map<string, string>()
  for (const cell of filled) {
    const sig = signatureOf(cell.slot)
    if (letters.has(sig)) continue
    if (letters.size >= LETTERS.length) {
      return failure(`物品种类超过 ${LETTERS.length} 个字母上限，无法生成有序合成 pattern`)
    }
    letters.set(sig, LETTERS[letters.size] as string)
  }

  const shapeRows = maxRow - minRow + 1
  const shapeCols = maxCol - minCol + 1
  const byPosition = new Map<number, string>()
  for (const cell of filled) {
    byPosition.set(cell.row * cols + cell.col, letters.get(signatureOf(cell.slot)) as string)
  }
  const pattern: string[] = []
  for (let r = minRow; r <= maxRow; r++) {
    let line = ''
    for (let c = minCol; c <= maxCol; c++) {
      line += byPosition.get(r * cols + c) ?? ' '
    }
    pattern.push(line)
  }

  const key: Record<string, string> = {}
  for (const cell of filled) {
    const letter = letters.get(signatureOf(cell.slot)) as string
    if (!(letter in key)) key[letter] = keyOf(cell.slot)
  }

  return { ok: true, pattern, key, rows: shapeRows, cols: shapeCols }
}
