/**
 * 配方类型选择器：候选来自 schema:list，每项带能力徽章与可信度标记，
 * 最底部固定「⚙ 通用 / 任意模组配方」（规格 3.6.8 / 3.4）。Ctrl+E 聚焦。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { SchemaSummary } from '@shared/ipc'
import { recipeTypeNameZh } from '@shared/recipeTypeNames'
import { useBenchStore } from '../../../store/benchStore'
import { GENERIC_TYPE_ID, useBenchUiStore } from '../benchUiStore'

const CAPABILITY_LABEL: Record<SchemaSummary['capability'], string> = {
  sugar: '✓ 语法糖',
  compatible: '✓ 兼容',
  unsupported: '✗ 不支持'
}

const CAPABILITY_TONE: Record<SchemaSummary['capability'], string> = {
  sugar: 'cap-ok',
  compatible: 'cap-warn',
  unsupported: 'cap-bad'
}

function describe(summary: SchemaSummary): string {
  const bits: string[] = [summary.modDisplayName || summary.modId]
  if (summary.source === 'inferred' && summary.sampleCount > 0) bits.push(`基于 ${summary.sampleCount} 个真实配方归纳`)
  if (summary.source === 'builtin') bits.push('内置精校')
  if (summary.source === 'probejs') bits.push('ProbeJS 实证')
  if (summary.source === 'custom' || summary.pinned) bits.push('已钉住')
  if (summary.lowConfidence) bits.push('低可信度')
  return bits.join(' · ')
}

const GENERIC_ROW: SchemaSummary = {
  id: GENERIC_TYPE_ID,
  displayName: '⚙ 通用 / 任意模组配方',
  modId: '',
  modDisplayName: 'event.custom / 数据包',
  layoutKind: 'shapeless',
  source: 'custom',
  sampleCount: 0,
  lowConfidence: false,
  pinned: false,
  capability: 'compatible',
  channel: 'event-custom',
  group: 'generic'
}

export function TypeSelect({
  disabled = false,
  disabledReason
}: {
  /** 草稿打开时禁止切换类型：切了会和草稿里的槽位结构对不上 */
  disabled?: boolean
  disabledReason?: string
} = {}): JSX.Element {
  const summaries = useBenchUiStore((s) => s.summaries)
  const loaded = useBenchUiStore((s) => s.summariesLoaded)
  const applyType = useBenchUiStore((s) => s.applyType)
  const schema = useBenchUiStore((s) => s.schema)
  const typeId = useBenchStore((s) => s.bench.typeId)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // 清单未加载时补一次：类型选择器是唯一入口，不能因为别处没触发就一直空着
    if (!useBenchUiStore.getState().summariesLoaded) void useBenchUiStore.getState().loadSummaries()
  }, [])

  useEffect(() => {
    const focus = (): void => {
      if (disabled) return
      setOpen(true)
      useBenchUiStore.getState().setWriteOpen(false)
      inputRef.current?.focus()
    }
    window.addEventListener('studio:focus-type-select', focus)
    return () => window.removeEventListener('studio:focus-type-select', focus)
  }, [disabled])

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase()
    const hits = summaries.filter((s) => {
      if (!q) return true
      return `${s.displayName} ${s.id} ${s.modId} ${s.modDisplayName}`.toLowerCase().includes(q)
    })
    // 通用通道永远在最底部（规格 3.6.8）
    return [...hits, GENERIC_ROW]
  }, [summaries, text])

  const current = summaries.find((s) => s.id === typeId)
  const choose = (summary: SchemaSummary): void => {
    setOpen(false)
    setText('')
    if (summary.id !== typeId) void applyType(summary.id)
  }

  return (
    <div className="type-select">
      <div className="type-trigger">
        <button
          className="btn type-open"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          title={disabled ? disabledReason ?? '草稿打开时不能切换类型' : '切换配方类型（Ctrl+E）'}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          {current?.displayName ?? schema?.displayName ?? (typeId === GENERIC_TYPE_ID ? '⚙ 通用配方' : recipeTypeNameZh(typeId))}
        </button>
        {current ? (
          <span className={`badge ${CAPABILITY_TONE[current.capability]}`}>{CAPABILITY_LABEL[current.capability]}</span>
        ) : null}
        {typeId === GENERIC_TYPE_ID ? <span className="badge">通用通道</span> : null}
        {typeId !== GENERIC_TYPE_ID && !current && loaded ? <span className="badge cap-warn">无 schema</span> : null}
      </div>

      {open ? (
        <div className="type-popover" role="dialog" aria-label="配方类型">
          <input
            ref={inputRef}
            className="input mono panel-search"
            autoFocus
            placeholder="搜索配方类型 / 模组（中文名、ID、拼音均可）"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
                return
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(rows.length - 1, c + 1))
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const hit = rows[cursor]
                if (hit) choose(hit)
              }
            }}
          />
          <div className="type-list" role="listbox">
            {!loaded ? <p className="aux panel-empty">正在读取配方类型清单…</p> : null}
            {loaded && rows.length === 1 ? (
              <p className="aux panel-empty">
                没有匹配的类型。可直接选下方「⚙ 通用 / 任意模组配方」手工输入类型 ID。
              </p>
            ) : null}
            {rows.map((row, index) => (
              <button
                key={row.id}
                role="option"
                aria-selected={row.id === typeId}
                className={`type-row${index === cursor ? ' on' : ''}${row.id === typeId ? ' current' : ''}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(row)}
                title={`${row.id}\n${describe(row)}`}
              >
                <span className="type-row-main">
                  <span className="item-zh">
                    {/* T-117：插件新增的类型没有中文 displayName 时，用同一份中文映射兜底 */}
                    {recipeTypeNameZh(row.id, row.displayName)}
                    {row.pinned ? <span className="badge pin">钉</span> : null}
                  </span>
                  <span className="item-sub">{row.id}</span>
                </span>
                <span className={`badge ${CAPABILITY_TONE[row.capability]}`}>{CAPABILITY_LABEL[row.capability]}</span>
              </button>
            ))}
          </div>
          <footer className="panel-foot">
            <span className="aux">共 {summaries.length} 个类型 · 基于本次扫描归纳</span>
            <span className="topbar-spacer" />
            <input
              className="input mono"
              style={{ width: 180 }}
              placeholder="直接输入类型 ID"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const value = (e.target as HTMLInputElement).value.trim()
                if (!value) return
                e.stopPropagation()
                setOpen(false)
                void applyType(value)
              }}
            />
          </footer>
        </div>
      ) : null}
    </div>
  )
}
