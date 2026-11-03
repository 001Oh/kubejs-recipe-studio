/**
 * 内联数量编辑器：右键「设置数量…」的小气泡（规格 3.9.8 第 1 条禁止用弹窗承载高频操作）。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useBenchStore } from '../../../store/benchStore'
import { readSlot, decodeSlot } from '../slotAddress'
import { writeAt } from '../commitOps'
import { useBenchUiStore } from '../benchUiStore'
import { panelStyle } from './anchor'

const QUICK = [1, 8, 16, 64]

export function CountEditor(): JSX.Element | null {
  const target = useBenchUiStore((s) => s.countEditor)
  const close = useBenchUiStore((s) => s.closeOverlays)
  const bench = useBenchStore((s) => s.bench)
  const addr = target ? decodeSlot(target.slotId) : null
  const value = addr ? readSlot(bench, addr) : null
  const usesAmount = value?.kind === 'fluid' || value?.kind === 'registry'
  const [text, setText] = useState('0')

  useEffect(() => {
    if (!value) return
    setText(String(usesAmount ? (value.amount ?? 1) : (value.count ?? 1)))
  }, [target?.slotId, value?.amount, value?.count, usesAmount])

  if (!target || !value) return null

  const apply = (next: number): void => {
    if (!Number.isFinite(next) || next < 1) return
    writeAt(target.slotId, usesAmount ? { ...value, amount: Math.round(next) } : { ...value, count: Math.round(next) })
    close()
  }

  return (
    <div
      className="bench-panel count-panel"
      style={panelStyle(target.anchor, 220, 150)}
      role="dialog"
      aria-label="设置数量"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          close()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          apply(Number(text))
        }
      }}
    >
      <input
        className="input mono"
        autoFocus
        type="number"
        min={1}
        value={text}
        aria-label={usesAmount ? '用量' : '数量'}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="quick-row">
        {QUICK.map((n) => (
          <button key={n} className="btn micro" onClick={() => apply(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="aux">
        {usesAmount ? '用量（mb / 份数）' : '数量'} · 滚轮 ±1 · Shift 滚轮 ±8
      </p>
    </div>
  )
}
