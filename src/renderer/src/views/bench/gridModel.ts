/**
 * 网格几何计算（规格 3.4「两个硬骨头 A」）。纯函数，可单测。
 * 3×3 与 9×9 共用同一套包围盒逻辑，不按尺寸分支。
 */
import type { SlotValue } from '@shared/types'
import { GRID_MAX_SIZE, GRID_DEFAULT_SIZE } from '@shared/constants'

export interface GridBox {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
  rows: number
  cols: number
}

function filled(slot: SlotValue | null): boolean {
  return !!slot && !!slot.id && slot.id.trim().length > 0
}

/** 非空单元格的最小包围盒；全空返回 null */
export function contentBox(grid: (SlotValue | null)[], rows: number, cols: number): GridBox | null {
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = Number.NEGATIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = Number.NEGATIVE_INFINITY
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled(grid[r * cols + c] ?? null)) continue
      if (r < minRow) minRow = r
      if (r > maxRow) maxRow = r
      if (c < minCol) minCol = c
      if (c > maxCol) maxCol = c
    }
  }
  if (!Number.isFinite(maxRow)) return null
  return { minRow, maxRow, minCol, maxCol, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 }
}

/** 起始尺寸 = 内容包围盒；无内容时用 schema/默认尺寸 */
export function initialGridSize(
  grid: (SlotValue | null)[],
  rows: number,
  cols: number,
  baseRows = GRID_DEFAULT_SIZE,
  baseCols = GRID_DEFAULT_SIZE
): { rows: number; cols: number } {
  const box = contentBox(grid, rows, cols)
  if (!box) return { rows: clampSize(baseRows), cols: clampSize(baseCols) }
  return { rows: clampSize(box.rows), cols: clampSize(box.cols) }
}

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(GRID_MAX_SIZE, Math.max(1, Math.round(n)))
}

/** 「+ 行 / + 列」：最大 9×9，返回夹取后的尺寸 */
export function growSize(rows: number, cols: number, axis: 'row' | 'col'): { rows: number; cols: number } {
  if (axis === 'row') return { rows: Math.min(GRID_MAX_SIZE, rows + 1), cols }
  return { rows, cols: Math.min(GRID_MAX_SIZE, cols + 1) }
}

export function shrinkSize(rows: number, cols: number, axis: 'row' | 'col'): { rows: number; cols: number } {
  if (axis === 'row') return { rows: Math.max(1, rows - 1), cols }
  return { rows, cols: Math.max(1, cols - 1) }
}

/**
 * 「已扩展待填」标记：空白且落在内容包围盒与 schema 基准尺寸之外。
 * 与「有意义的留空」（包围盒内部的空洞）区分开，前者用更淡的虚线边框。
 */
export function pendingMask(
  grid: (SlotValue | null)[],
  rows: number,
  cols: number,
  baseRows: number,
  baseCols: number
): boolean[] {
  const box = contentBox(grid, rows, cols)
  const usedRows = box ? Math.max(box.maxRow + 1, baseRows) : baseRows
  const usedCols = box ? Math.max(box.maxCol + 1, baseCols) : baseCols
  const out: boolean[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(!filled(grid[r * cols + c] ?? null) && (r >= usedRows || c >= usedCols))
    }
  }
  return out
}

export const ZOOM_STEPS = [0.75, 1, 1.5] as const

export function nextZoom(current: number, direction: 1 | -1): number {
  const idx = ZOOM_STEPS.reduce(
    (best, step, i) => (Math.abs(step - current) < Math.abs((ZOOM_STEPS[best] ?? 1) - current) ? i : best),
    0
  )
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + direction))
  return ZOOM_STEPS[next] ?? 1
}

const GAP_PX = 4
const SIDE_RESERVE_PX = 140
const CELL_MIN = 24
const CELL_MAX = 48

/**
 * 格子边长：`clamp(24, (可用宽 - 140) / 列数, 48) × 缩放`，向下取整到整数像素，
 * 保证图标按 16 的整数倍渲染（规格 3.9.8 第 7 条禁止非整数缩放）。
 */
export function cellPixelSize(availablePx: number, cols: number, zoom = 1): number {
  const safeCols = Math.max(1, Math.round(cols))
  const fromWidth = (availablePx - SIDE_RESERVE_PX - GAP_PX * (safeCols - 1)) / safeCols
  const base = Math.min(CELL_MAX, Math.max(CELL_MIN, fromWidth))
  const scaled = Math.floor(base * zoom)
  return Math.max(16, Number.isFinite(scaled) ? scaled : CELL_MIN)
}

/** 图标只允许 16/32/48 整数倍（与 ItemSlot 内部阈值保持一致） */
export function iconSizeFor(cell: number): 16 | 32 | 48 {
  return cell >= 48 ? 48 : cell >= 32 ? 32 : 16
}
