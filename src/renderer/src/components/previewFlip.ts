/**
 * T-26 / UI-U3：浮窗定位的纯函数（无 DOM 依赖，便于单测四种边界）。
 *
 * 规则：默认落在光标右下偏移 `GAP`；若右侧/下方放不下，则翻到光标左/上侧。
 */
export const PREVIEW_GAP = 12
export const PREVIEW_SIZE = { w: 240, h: 120 }

export interface Point {
  x: number
  y: number
}

export function flipOf(
  anchor: Point,
  viewport: { w: number; h: number },
  size: { w: number; h: number } = PREVIEW_SIZE,
  gap: number = PREVIEW_GAP
): Point & { flippedX: boolean; flippedY: boolean } {
  const flippedX = anchor.x + gap + size.w > viewport.w
  const flippedY = anchor.y + gap + size.h > viewport.h
  return {
    x: flippedX ? anchor.x - gap - size.w : anchor.x + gap,
    y: flippedY ? anchor.y - gap - size.h : anchor.y + gap,
    flippedX,
    flippedY
  }
}
