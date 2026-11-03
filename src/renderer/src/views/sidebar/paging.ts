/**
 * 侧栏分页的纯逻辑（便于单测）：
 * - 单页条数只认 `SIDEBAR_PAGE_SIZE`，不再散落魔法数；
 * - `nextPageOffset` 决定「还能不能取下一页」，`shouldPrefetch` 决定「滚到什么时候该取」；
 * - 搜索词 / 筛选 / 虚拟开关变化时由调用方重置为第一页（offset=0、整表替换）。
 */
import type { ItemHit } from '@shared/types'

export interface PageWindow {
  /** 当前已载入的条数 */
  loaded: number
  /** 本次查询命中的总条数（含未载入部分） */
  matched: number
  pageSize: number
}

/** 下一页的 offset；已取完返回 null */
export function nextPageOffset(w: PageWindow): number | null {
  if (w.pageSize <= 0) return null
  if (w.loaded >= w.matched) return null
  return w.loaded
}

/** 当可见区最后一行距离已载入末尾不足 threshold 行时预取下一页 */
export function shouldPrefetch(lastVisibleIndex: number, w: PageWindow, threshold = 20): boolean {
  if (lastVisibleIndex < 0) return false
  if (nextPageOffset(w) === null) return false
  return w.loaded - 1 - lastVisibleIndex <= threshold
}

/** 追加去重：同一物品可能因数据变化出现在两页里，保留先到的那条 */
export function appendUnique(prev: readonly ItemHit[], next: readonly ItemHit[]): ItemHit[] {
  const seen = new Set(prev.map((hit) => hit.item.id))
  const out = [...prev]
  for (const hit of next) {
    if (seen.has(hit.item.id)) continue
    seen.add(hit.item.id)
    out.push(hit)
  }
  return out
}
