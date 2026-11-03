/** 浮层锚定：统一 320px 宽度与视口夹取（规格 3.4 注册表选择面板）。 */
import type { CSSProperties } from 'react'
import type { Anchor } from '../benchUiStore'

export const PANEL_WIDTH = 320
export const PANEL_MAX_HEIGHT = 340
const GAP = 6
const MARGIN = 8

/** 锚定在槽位下方；下方空间不够时翻到上方，左右夹在视口内 */
export function panelStyle(anchor: Anchor, width = PANEL_WIDTH, height = PANEL_MAX_HEIGHT): CSSProperties {
  const x = Math.min(Math.max(MARGIN, anchor.x), Math.max(MARGIN, window.innerWidth - width - MARGIN))
  const below = anchor.y + GAP
  const flip = below + height > window.innerHeight - MARGIN
  const y = flip ? Math.max(MARGIN, anchor.y - anchor.height - height - GAP) : below
  return { position: 'fixed', left: x, top: y, width, maxHeight: height }
}
