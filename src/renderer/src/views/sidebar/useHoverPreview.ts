/**
 * T-26 / UI-U3：悬停触发 hook —— 悬停满 `HOVER_DELAY_MS` 才显示浮窗。
 *
 * 返回值直接展开到目标元素上：
 *   `<div {...useHoverPreview(id)}>`
 * 不改变既有组件的任何 prop 契约（纯新增 attach）。
 */
import { useCallback, useEffect, useRef } from 'react'
import { HOVER_DELAY_MS, usePreviewStore } from '@renderer/store/previewStore'

export interface HoverHandlers {
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export function useHoverPreview(id: string | null | undefined): HoverHandlers {
  const timer = useRef<number | null>(null)
  const pos = useRef({ x: 0, y: 0 })
  const show = usePreviewStore((s) => s.show)
  const hide = usePreviewStore((s) => s.hide)

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => clear, [clear])

  return {
    onMouseEnter: (e) => {
      if (!id) return
      // 滚动后的抑制窗口内不唤起（虚拟列表重渲染会让光标下换行并触发 mouseenter）
      if (Date.now() < usePreviewStore.getState().hiddenUntil) return
      pos.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = window.setTimeout(() => {
        timer.current = null
        show(id, pos.current)
      }, HOVER_DELAY_MS)
    },
    onMouseMove: (e) => {
      // 只在已显示时跟随，未显示时更新锚点供计时到点使用
      pos.current = { x: e.clientX, y: e.clientY }
      if (timer.current === null && usePreviewStore.getState().id === id) show(id as string, pos.current)
    },
    onMouseLeave: () => {
      clear()
      hide()
    }
  }
}
