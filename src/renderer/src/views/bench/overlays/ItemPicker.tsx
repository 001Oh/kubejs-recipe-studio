/**
 * 物品选择器浮层：双击槽位呼出（规格 3.4 交互表），复用侧边栏的 items:query 检索。
 * 同时接受手输 ID / `2x ns:id` / `#tag`，让产物槽的数量前缀语法可用。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ItemHit, SlotKind } from '@shared/types'
import { SEARCH_DEBOUNCE_MS } from '@shared/constants'
import { parseSlotInput } from '../../../store/slotUtils'
import { call } from '../../../api'
import { useAppStore } from '../../../store/appStore'
import { writeAt } from '../commitOps'
import { useBenchUiStore } from '../benchUiStore'
import { ItemIcon } from '../../../components/ItemIcon'
import { panelStyle, PANEL_MAX_HEIGHT } from './anchor'

const PAGE = 24

function slotKindFor(kind: string): SlotKind {
  if (kind === 'fluid') return 'fluid'
  if (kind === 'tag') return 'tag'
  return 'item'
}

export function ItemPicker(): JSX.Element | null {
  const target = useBenchUiStore((s) => s.picker)
  const close = useBenchUiStore((s) => s.closeOverlays)
  const favorites = useAppStore((s) => s.favorites)
  const [text, setText] = useState('')
  const [hits, setHits] = useState<ItemHit[]>([])
  const [cursor, setCursor] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!target) return
    setText('')
    setCursor(0)
  }, [target?.slotId])

  useEffect(() => {
    const t = setTimeout(() => {
      const mine = ++seq.current
      void call('items:query', { text, offset: 0, limit: PAGE }).then((res) => {
        if (mine !== seq.current) return
        setHits(res?.hits ?? [])
        setTruncated(!!res && res.matched > res.hits.length)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])

  const raw = useMemo(() => parseSlotInput(text, slotKindFor(target?.kind ?? 'item')), [text, target?.kind])

  if (!target) return null

  const fill = (id: string, count: number): void => {
    const kind = slotKindFor(target.kind)
    const base = kind === 'fluid' || kind === 'registry' ? { amount: count } : { count }
    writeAt(target.slotId, { kind, id, ...base })
    close()
  }

  return (
    <div
      className="bench-panel picker-panel"
      style={panelStyle(target.anchor, 320, PANEL_MAX_HEIGHT)}
      role="dialog"
      aria-label="物品选择器"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'f')) e.stopPropagation()
        if (e.key === 'Escape') {
          close()
          return
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          e.currentTarget.querySelector<HTMLInputElement>('.panel-search')?.select()
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setCursor((c) => Math.min(hits.length - 1, c + 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setCursor((c) => Math.max(0, c - 1))
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const hit = hits[cursor]
          if (hit) fill(hit.item.id, hit.item.id === raw?.id ? (raw.count ?? 1) : 1)
          else if (raw) fill(raw.id, raw.count ?? 1)
        }
      }}
    >
      <header>
        <input
          className="input mono panel-search"
          autoFocus
          placeholder="搜索物品（中文名 / 拼音 / ID / 2x / #tag）"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setCursor(0)
          }}
        />
      </header>
      <div className="panel-list">
        {hits.length === 0 ? (
          <p className="aux panel-empty">
            {text.trim() === '' ? '输入关键字开始检索，支持拼音与首字母（如 jgs）。' : `没有匹配「${text}」的物品。`}
          </p>
        ) : null}
        {hits.map((hit, index) => (
          <button
            key={hit.item.id}
            className={index === cursor ? 'panel-row on' : 'panel-row'}
            onMouseEnter={() => setCursor(index)}
            onClick={() => fill(hit.item.id, 1)}
            title={`${hit.item.id}\n${hit.item.modId}`}
          >
            <ItemIcon
              item={{
                id: hit.item.id,
                name: hit.item.nameZh,
                iconKey: hit.item.iconKey,
                hasIcon: hit.item.hasIcon
              }}
              size={32}
            />
            <span className="panel-row-names">
              <span className="item-zh">
                {hit.item.nameZh}
                {favorites.includes(hit.item.id) ? <span className="star on">★</span> : null}
              </span>
              <span className="item-sub">{hit.item.id}</span>
            </span>
            {hit.item.virtual ? <span className="badge">虚拟</span> : null}
          </button>
        ))}
        {truncated ? <p className="aux panel-empty">结果过多，继续输入以缩小范围。</p> : null}
      </div>
      <footer className="panel-foot">
        <button className="btn tiny" disabled={!raw} onClick={() => raw && fill(raw.id, raw.count ?? 1)}>
          使用输入的 {raw ? `${raw.kind === 'tag' ? '#' : ''}${raw.id}${(raw.count ?? 1) > 1 ? ` ×${raw.count}` : ''}` : 'ID'}
        </button>
        <span className="topbar-spacer" />
        <span className="aux">↑↓ 选择 · Enter 填入 · Esc 关闭</span>
      </footer>
    </div>
  )
}
