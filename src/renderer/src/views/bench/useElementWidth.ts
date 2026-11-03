/**
 * 容器宽度观察（规格 3.4「断点不做固定像素判断，用 ResizeObserver 观察容器实际宽度」）。
 * 同时给网格提供可用宽度，格子尺寸因此是整数像素。
 */
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export function useElementWidth<T extends HTMLElement>(): { ref: RefObject<T>; width: number } {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
