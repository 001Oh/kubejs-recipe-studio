/**
 * 注册表选择面板（规格 3.4「注册表槽」UI 规范表）：
 * 宽 320px、锚定槽位下方、顶部搜索、类型色块 + 中文名 + ID、底部用量（默认 10）、↑↓/Enter/Esc/Ctrl+F。
 */
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { RegistryOption, SlotValue } from '@shared/types'
import { useAppStore } from '../../../store/appStore'
import { useBenchUiStore } from '../benchUiStore'
import { writeAt } from '../commitOps'
import { panelStyle, PANEL_WIDTH, PANEL_MAX_HEIGHT } from './anchor'

const DEFAULT_AMOUNT = 10

export function RegistryPicker(): JSX.Element | null {
  const target = useBenchUiStore((s) => s.registryPanel)
  const close = useBenchUiStore((s) => s.closeOverlays)
  const load = useBenchUiStore((s) => s.registryOptions)
  const pushLog = useAppStore((s) => s.pushLog)
  const [options, setOptions] = useState<RegistryOption[]>([])
  const [text, setText] = useState('')
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [cursor, setCursor] = useState(0)

  const registry = target?.registry ?? ''
  const slotId = target?.slotId ?? ''

  useEffect(() => {
    if (!slotId) return
    let alive = true
    setText('')
    setCursor(0)
    void load(registry).then((list) => {
      if (!alive) return
      setOptions(list)
      setAmount(list[0]?.defaultAmount ?? DEFAULT_AMOUNT)
    })
    return () => {
      alive = false
    }
  }, [slotId, registry, load])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.nameZh} ${o.nameEn} ${o.id}`.toLowerCase().includes(q))
  }, [options, text])

  if (!target) return null

  const fill = (id: string, option: RegistryOption | null): void => {
    if (!id) return
    const value: SlotValue = { kind: 'registry', id, registryType: registry, amount, name: option?.nameZh }
    writeAt(target.slotId, value)
    pushLog('DEBUG', 'SCHEMA', `注册表槽填入 ${id} ×${amount}`, registry || undefined)
    close()
  }

  return (
    <div
      className="bench-panel registry-panel"
      style={panelStyle(target.anchor, PANEL_WIDTH, PANEL_MAX_HEIGHT)}
      role="dialog"
      aria-label="注册表取值选择"
      tabIndex={-1}
      onKeyDown={(e) => {
        // 面板内的 Esc / Ctrl+F 不外溢到全局键位
        if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'f')) e.stopPropagation()
        if (e.key === 'Escape') {
          close()
          return
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          const input = e.currentTarget.querySelector<HTMLInputElement>('.panel-search')
          input?.focus()
          input?.select()
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setCursor((c) => Math.min(Math.max(0, filtered.length - 1), c + 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setCursor((c) => Math.max(0, c - 1))
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const hit = filtered[cursor]
          if (hit) fill(hit.id, hit)
          else fill(text.trim(), null)
        }
      }}
    >
      <header className="panel-head">
        <input
          className="input mono panel-search"
          autoFocus
          placeholder={`搜索 ${registry || '注册表'} 取值（Ctrl+F）`}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setCursor(0)
          }}
        />
      </header>
      <div className="panel-list">
        {filtered.length === 0 ? (
          <p className="aux panel-empty">
            {options.length === 0
              ? '该注册表暂无候选值：ProbeJS / 配方样本 / 内置列表三级来源都没命中，可直接输入 ID。'
              : '没有匹配项，换个关键字试试。'}
          </p>
        ) : null}
        {filtered.map((option, index) => (
          <button
            key={option.id}
            className={index === cursor ? 'panel-row on' : 'panel-row'}
            onMouseEnter={() => setCursor(index)}
            onClick={() => fill(option.id, option)}
            title={`${option.nameZh}\n${option.id}\n来源 ${option.origin}`}
          >
            <span className="swatch registry-swatch" style={{ background: option.color }} />
            <span className="panel-row-names">
              <span className="item-zh">{option.nameZh}</span>
              <span className="item-sub">{option.id}</span>
            </span>
            <span className="slot-abbr">{option.abbr}</span>
          </button>
        ))}
      </div>
      <footer className="panel-foot">
        <label className="aux" htmlFor="registry-amount">
          用量
        </label>
        <input
          id="registry-amount"
          className="input amount-input"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
        />
        <span className="topbar-spacer" />
        <button className="btn tiny" disabled={!text.trim()} onClick={() => fill(text.trim(), null)}>
          用输入的 ID
        </button>
      </footer>
    </div>
  )
}
