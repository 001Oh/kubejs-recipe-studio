/**
 * 注册表槽：非物品参数（灌注类型 / 气体 / 浆液 / 色素）。
 * 不从侧边栏拖拽，点击槽位弹出专用选择面板；紫色底纹 + 缩写角标由 ItemSlot 承担。
 */
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { RegistryOption, SlotValue } from '@shared/types'
import { ItemSlot } from '../../../components/ItemSlot'
import { useAppStore } from '../../../store/appStore'
import { anchorForSlot, useBenchUiStore } from '../benchUiStore'
import { encodeSlot } from '../slotAddress'
import { writeAt } from '../commitOps'
import { asSlot, useFieldValue } from '../valueAccess'
import { fieldLabel } from '../fieldModel'
import { FieldShell } from './FieldShell'
import { SLOT_PX, scoped, type ControlProps } from './controlProps'
import { useSlotBinding } from './useSlotBinding'
import { panelStyle, PANEL_WIDTH, PANEL_MAX_HEIGHT } from '../overlays/anchor'

export function RegistryControl({ field, scope, size }: ControlProps): JSX.Element {
  const value = asSlot(useFieldValue(field.key))
  const slotId = scoped(scope, encodeSlot({ kind: 'value', key: field.key }))
  const openPanel = useBenchUiStore((s) => s.openRegistryPanel)
  const cached = useBenchUiStore((s) => s.registryCache)
  const options = field.registry ? (cached[field.registry] ?? []) : []
  const named = value ? options.find((o) => o.id === value.id) : undefined

  const binding = useSlotBinding({
    slotId,
    value,
    kind: 'registry',
    registry: field.registry,
    nameZh: named?.nameZh ?? field.displayName,
    onActivate: () =>
      openPanel({
        slotId,
        kind: 'registry',
        registry: field.registry ?? value?.registryType ?? '',
        anchor: anchorForSlot(slotId)
      })
  })

  return (
    <FieldShell field={field}>
      <div className="slot-line">
        <ItemSlot {...binding} size={size ?? SLOT_PX} />
        <button
          className="btn tiny"
          title="打开注册表选择面板"
          onClick={() =>
            openPanel({
              slotId,
              kind: 'registry',
              registry: field.registry ?? value?.registryType ?? '',
              anchor: anchorForSlot(slotId)
            })
          }
        >
          {named?.nameZh ?? (value?.id || fieldLabel(field))}
        </button>
        <input
          className="input amount-input"
          type="number"
          min={field.min ?? 0}
          max={field.max}
          value={value?.amount ?? 0}
          title="用量（独立于物品数量）"
          onChange={(e) =>
            writeAt(slotId, {
              kind: 'registry',
              id: value?.id ?? '',
              registryType: field.registry ?? value?.registryType ?? '',
              amount: Number(e.target.value) || 0
            })
          }
        />
      </div>
    </FieldShell>
  )
}

/** 面板本体：搜索 + 色块列表 + 底部用量，键盘 ↑↓ / Enter / Esc / Ctrl+F */
export function RegistryPicker(): JSX.Element | null {
  const target = useBenchUiStore((s) => s.registryPanel)
  const close = useBenchUiStore((s) => s.closeOverlays)
  const load = useBenchUiStore((s) => s.registryOptions)
  const [options, setOptions] = useState<RegistryOption[]>([])
  const [text, setText] = useState('')
  const [amount, setAmount] = useState(10)
  const [cursor, setCursor] = useState(0)
  const pushLog = useAppStore((s) => s.pushLog)

  const registry = target?.registry ?? ''
  useEffect(() => {
    if (!target) return
    let alive = true
    setText('')
    setCursor(0)
    setAmount(options[0]?.defaultAmount ?? 10)
    void load(registry).then((list) => {
      if (alive) setOptions(list)
    })
    return () => {
      alive = false
    }
    // options 只用于取默认用量，不参与依赖
  }, [target?.slotId, registry, close, load])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.nameZh} ${o.nameEn} ${o.id}`.toLowerCase().includes(q))
  }, [options, text])

  if (!target) return null

  const fill = (option: RegistryOption | null, id: string): void => {
    const value: SlotValue = {
      kind: 'registry',
      id,
      registryType: registry,
      amount,
      name: option?.nameZh
    }
    writeAt(target.slotId, value)
    pushLog('DEBUG', 'SCHEMA', `注册表槽填入 ${id} ×${amount}`, registry)
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
        // 面板内的 Ctrl+F / Esc 不外溢到全局键位
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
          setCursor((c) => Math.min(filtered.length - 1, c + 1))
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
          if (hit) fill(hit, hit.id)
          else if (text.trim()) fill(null, text.trim())
        }
      }}
    >
      <header>
        <input
          className="input panel-search"
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
              ? '该注册表暂无候选值（ProbeJS / 样本 / 内置三级来源都没命中），可先直接输入 ID 确认。'
              : '没有匹配项，换个关键字试试。'}
          </p>
        ) : null}
        {filtered.map((option, index) => (
          <button
            key={option.id}
            className={`panel-row${index === cursor ? ' on' : ''}`}
            onMouseEnter={() => setCursor(index)}
            onClick={() => fill(option, option.id)}
            title={`${option.nameZh}\n${option.id}\n来源 ${option.origin}`}
          >
            <span className="swatch" style={{ background: option.color }} />
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
        <button
          className="btn tiny"
          disabled={!text.trim()}
          onClick={() => fill(null, text.trim())}
          title="用当前搜索词作为 ID 填入"
        >
          用输入的 ID
        </button>
      </footer>
    </div>
  )
}
