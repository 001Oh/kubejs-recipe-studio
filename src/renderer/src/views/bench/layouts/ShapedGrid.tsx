/**
 * shaped 布局：3×3 / 2×2 / 1×1 起始尺寸按内容包围盒自适应，可扩到 9×9（Create 机械合成）。
 * 空格分两种：包围盒内的空洞（有意义留空）与「已扩展待填」（更淡的虚线）。
 */
import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import type { RecipeTypeSchema, SlotValue } from '@shared/types'
import { GRID_MAX_SIZE } from '@shared/constants'
import { ItemSlot } from '../../../components/ItemSlot'
import { GRID_KEY, useBenchStore } from '../../../store/benchStore'
import { encodeSlot } from '../slotAddress'
import { bucketFields } from '../fieldModel'
import { asSlotArray, useFieldValue } from '../valueAccess'
import { cellPixelSize, growSize, nextZoom, pendingMask, shrinkSize, ZOOM_STEPS } from '../gridModel'
import { useBenchUiStore } from '../benchUiStore'
import { useElementWidth } from '../useElementWidth'
import { useSlotBinding } from '../controls/useSlotBinding'
import { FieldList, OutputsOf, Zone } from './ZoneShell'

function Cell({
  index,
  value,
  size,
  pending
}: {
  index: number
  value: SlotValue | null
  size: number
  pending: boolean
}): JSX.Element {
  const binding = useSlotBinding({ slotId: encodeSlot({ kind: 'grid', index }), value, kind: 'item' })
  return (
    <div className={`grid-cell${pending ? ' pending-cell' : ''}`}>
      <ItemSlot {...binding} size={size} />
    </div>
  )
}

export function ShapedGrid({ schema, narrow }: { schema: RecipeTypeSchema | null; narrow: boolean }): JSX.Element {
  const bench = useBenchStore((s) => s.bench)
  const setGridSize = useBenchStore((s) => s.setGridSize)
  const cells = useFieldValue(GRID_KEY)
  const zoom = useBenchUiStore((s) => s.zoom)
  const setZoom = useBenchUiStore((s) => s.setZoom)
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const rows = bench.gridRows ?? 3
  const cols = bench.gridCols ?? 3
  const baseRows = schema?.grid?.rows ?? 3
  const baseCols = schema?.grid?.cols ?? 3
  const list = useMemo(() => asSlotArray(cells), [cells])
  const pending = useMemo(() => pendingMask(list, rows, cols, baseRows, baseCols), [list, rows, cols, baseRows, baseCols])
  const cell = cellPixelSize(width > 0 ? width : 360, cols, zoom)

  // Ctrl + 滚轮缩放：必须用非 passive 的原生监听才能吃掉浏览器缩放
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      setZoom(nextZoom(zoom, e.deltaY < 0 ? 1 : -1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

  const grow = (axis: 'row' | 'col'): void => {
    const size = growSize(rows, cols, axis)
    setGridSize(size.rows, size.cols)
  }
  const shrink = (axis: 'row' | 'col'): void => {
    const size = shrinkSize(rows, cols, axis)
    setGridSize(size.rows, size.cols)
  }

  return (
    <div className={`bench-board${narrow ? ' narrow' : ''}`}>
      <div className="board-left">
        <Zone
          zone="input"
          title={`有序网格 ${rows}×${cols}`}
          note="生成时自动裁剪空白行列；多余的空白行会导致有序合成匹配失败"
          aside={
            <span className="zoom-ctl" role="group" aria-label="网格缩放">
              {ZOOM_STEPS.map((step) => (
                <button
                  key={step}
                  className={step === zoom ? 'chip on' : 'chip'}
                  onClick={() => setZoom(step)}
                  title={`${Math.round(step * 100)}%`}
                >
                  {Math.round(step * 100)}%
                </button>
              ))}
            </span>
          }
        >
          <div className="grid-scroll" ref={scrollRef}>
            <div className="grid-wrap" style={{ ['--cols' as string]: String(cols) }} ref={ref}>
              {Array.from({ length: rows * cols }, (_, index) => (
                <Cell key={index} index={index} value={list[index] ?? null} size={cell} pending={pending[index] ?? false} />
              ))}
            </div>
          </div>
          <div className="grid-tools">
            <button className="btn micro" onClick={() => grow('row')}>
              + 行
            </button>
            <button className="btn micro" disabled={rows <= 1} onClick={() => shrink('row')}>
              － 行
            </button>
            <button className="btn micro" onClick={() => grow('col')}>
              + 列
            </button>
            <button className="btn micro" disabled={cols <= 1} onClick={() => shrink('col')}>
              － 列
            </button>
            <span className="aux">
              上限 {GRID_MAX_SIZE}×{GRID_MAX_SIZE} · Ctrl+滚轮缩放
            </span>
          </div>
        </Zone>
      </div>
      <span className={`flow-arrow${narrow ? ' down' : ''}`} aria-hidden="true">
        {narrow ? '↓' : '→'}
      </span>
      <div className="board-right">
        <Zone zone="output" title="产物" note={schema?.supportsChance ? '右键槽位可设概率' : undefined}>
          <FieldList fields={schema ? bucketFields(schema).outputs : OutputsOf({ schema: null })} />
        </Zone>
      </div>
    </div>
  )
}
