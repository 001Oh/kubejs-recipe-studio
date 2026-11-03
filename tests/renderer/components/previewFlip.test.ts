/**
 * T-26 / UI-U3：浮窗定位四边界单测（pure function，无 DOM 依赖）。
 *
 * 为什么用单测而不是实机：`.item-list` 的 clientHeight 仅 161 px，
 * 实机上光标物理触不到视口右/下边界（详见 UI-AVAILABILITY §四十六）。
 */
import { describe, expect, it } from 'vitest'
import { flipOf, PREVIEW_GAP, PREVIEW_SIZE } from '../../../src/renderer/src/components/previewFlip'

const VP = { w: 1000, h: 800 }
const SIZE = { w: 240, h: 120 }

describe('flipOf 四边界', () => {
  it('右下均不超界 → 正常右下偏移', () => {
    const p = flipOf({ x: 100, y: 100 }, VP, SIZE)
    expect(p).toEqual({ x: 100 + PREVIEW_GAP, y: 100 + PREVIEW_GAP, flippedX: false, flippedY: false })
  })

  it('右侧超界 → 翻到光标左侧', () => {
    const p = flipOf({ x: 900, y: 100 }, VP, SIZE)
    expect(p.flippedX).toBe(true)
    expect(p.flippedY).toBe(false)
    expect(p.x).toBe(900 - PREVIEW_GAP - SIZE.w)
    expect(p.y).toBe(100 + PREVIEW_GAP)
  })

  it('下方超界 → 翻到光标上方', () => {
    const p = flipOf({ x: 100, y: 750 }, VP, SIZE)
    expect(p.flippedX).toBe(false)
    expect(p.flippedY).toBe(true)
    expect(p.y).toBe(750 - PREVIEW_GAP - SIZE.h)
    expect(p.x).toBe(100 + PREVIEW_GAP)
  })

  it('右下均超界 → 左上翻转', () => {
    const p = flipOf({ x: 950, y: 780 }, VP, SIZE)
    expect(p).toEqual({
      x: 950 - PREVIEW_GAP - SIZE.w,
      y: 780 - PREVIEW_GAP - SIZE.h,
      flippedX: true,
      flippedY: true
    })
  })

  it('恰好等于边界时不翻转（用 > 而非 >=）', () => {
    const p = flipOf({ x: VP.w - PREVIEW_GAP - SIZE.w, y: VP.h - PREVIEW_GAP - SIZE.h }, VP, SIZE)
    expect(p.flippedX).toBe(false)
    expect(p.flippedY).toBe(false)
  })

  it('默认尺寸与间距来自常量（小视口必翻转）', () => {
    const p = flipOf({ x: 0, y: 0 }, { w: 100, h: 100 })
    // 100x100 的视口放不下 240x120 的浮窗 → 两个方向都翻到光标左上（坐标为负是预期）
    expect(p.flippedX).toBe(true)
    expect(p.flippedY).toBe(true)
    expect(p.x).toBe(0 - PREVIEW_GAP - PREVIEW_SIZE.w)
    expect(p.y).toBe(0 - PREVIEW_GAP - PREVIEW_SIZE.h)
  })
})
