/**
 * T-26 / UI-U3：物品预览浮窗的状态与悬停触发（与 UI 解耦，便于单测与整体移除）。
 *
 * 设计要点：
 * - **懒**：只有悬停满 `HOVER_DELAY_MS` 才会 `show()`，短促划过不发任何查询；
 * - **会话内缓存**：同一物品的 {mod, recipeCount} 只查一次；
 * - **可整体移除**：删除本文件 + `ItemPreview.tsx` + 三处 `useHoverPreview` 调用即完全回退。
 */
import { create } from 'zustand'
import { HOVER_DELAY_MS } from '@shared/constants'

export interface PreviewAnchor {
  x: number
  y: number
}

interface PreviewState {
  id: string | null
  anchor: PreviewAnchor | null
  /**
   * T-26：滚动/滚轮后的**抑制窗口**（时间戳）。实测：wheel 触发 hide 后，
   * 虚拟列表重渲染会让光标下换成另一行并再次触发 `mouseenter`，
   * 400 ms 后浮窗又冒出来。故滚动后一段时间内拒绝新的悬停唤起。
   */
  hiddenUntil: number
  show: (id: string, anchor: PreviewAnchor) => void
  hide: () => void
  /** 隐藏并在 `ms` 内拒绝再次唤起（滚动用） */
  suppressFor: (ms: number) => void
}

export const SUPPRESS_AFTER_SCROLL_MS = 800

export const usePreviewStore = create<PreviewState>((set) => ({
  id: null,
  anchor: null,
  hiddenUntil: 0,
  show: (id, anchor) => set({ id, anchor }),
  hide: () => set({ id: null, anchor: null }),
  suppressFor: (ms) => set({ id: null, anchor: null, hiddenUntil: Date.now() + ms })
}))

/** 会话内缓存：id → { mod, recipeCount }；`recipeCount` 为 null 表示「查询失败，不要缓存」 */
export interface PreviewInfo {
  mod: string
  recipeCount: number
}

const cache = new Map<string, PreviewInfo>()

export function previewCacheGet(id: string): PreviewInfo | undefined {
  return cache.get(id)
}

export function previewCacheSet(id: string, info: PreviewInfo): void {
  cache.set(id, info)
}

export function previewCacheClear(): void {
  cache.clear()
}

/** 从物品 id 推断来源 mod（`minecraft:stone` → `minecraft`） */
export function modOf(id: string): string {
  const colon = id.indexOf(':')
  return colon > 0 ? id.slice(0, colon) : 'minecraft'
}

export { HOVER_DELAY_MS }
