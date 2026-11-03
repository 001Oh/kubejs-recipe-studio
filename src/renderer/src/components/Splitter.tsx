/** 分隔条：4px，hover 变品牌色；拖拽实时提交给 store，磁盘写入由主进程节流。 */
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

interface Props {
  axis: 'x' | 'y'
  size: number
  min: number
  max: number
  /** right 表示该分隔条控制右侧面板（拖拽方向取反） */
  side?: 'left' | 'right'
  onCommit: (next: number) => void
}

export function Splitter({ axis, size, min, max, side = 'left', onCommit }: Props): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ pos: 0, size: 0 })

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent): void => {
      const delta = (axis === 'x' ? e.clientX : e.clientY) - startRef.current.pos
      const signed = side === 'right' || axis === 'y' ? -delta : delta
      onCommit(Math.min(max, Math.max(min, Math.round(startRef.current.size + signed))))
    }
    const up = (): void => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    const prevCursor = document.body.style.cursor
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = prevCursor
    }
  }, [dragging, axis, side, min, max, onCommit])

  return (
    <div
      className={axis === 'x' ? `splitters${dragging ? ' active' : ''}` : `splitter-row${dragging ? ' active' : ''}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      tabIndex={0}
      title="拖拽调整面板尺寸"
      onPointerDown={(e) => {
        e.preventDefault()
        startRef.current = { pos: axis === 'x' ? e.clientX : e.clientY, size }
        setDragging(true)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 20 : 4
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          onCommit(Math.min(max, Math.max(min, size + (e.key === 'ArrowUp' ? step : side === 'right' ? step : -step))))
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          onCommit(
            Math.min(max, Math.max(min, size + (e.key === 'ArrowDown' ? -step : side === 'right' ? -step : step)))
          )
        }
      }}
    />
  )
}
