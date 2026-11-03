/**
 * 键值对编辑器：unknown 字段、NBT 约束、方块状态属性、「额外 JSON 字段」共用。
 * 值按 JSON 字面量解析；敲到一半不吞输入（jsonModel 的 rowsFromValue / valueFromRows）。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { rowsFromValue, sanitizeKey, valueFromRows, type KvRow } from '../jsonModel'

interface Props {
  value: unknown
  onChange: (next: unknown) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  suggestions?: string[]
  readOnly?: boolean
}

const DEFAULT_VALUE_HINT = 'JSON 字面量：4000 / "abc" / true / {"item":"minecraft:coal"}'

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = '字段名',
  valuePlaceholder = DEFAULT_VALUE_HINT,
  suggestions,
  readOnly
}: Props): JSX.Element {
  const [rows, setRows] = useState<KvRow[]>(() => rowsFromValue(value))
  // 外部值结构变化才重建，避免覆盖正在输入的行
  const fingerprint = JSON.stringify(rowsFromValue(value))
  useEffect(() => {
    setRows((prev) => (JSON.stringify(prev) === fingerprint ? prev : rowsFromValue(value)))
  }, [fingerprint])

  const sync = (next: KvRow[]): void => {
    setRows(next)
    onChange(valueFromRows(next))
  }

  return (
    <div className="kv-editor">
      {rows.map((row, index) => (
        <div className="kv-row" key={`${row.key}-${index}`}>
          <input
            className="input mono kv-key"
            list={suggestions && suggestions.length > 0 ? 'bench-kv-keys' : undefined}
            value={row.key}
            placeholder={keyPlaceholder}
            disabled={readOnly}
            onChange={(e) => sync(rows.map((old, i) => (i === index ? { ...old, key: sanitizeKey(e.target.value) } : old)))}
          />
          <input
            className="input mono kv-value"
            value={row.json}
            placeholder={valuePlaceholder}
            disabled={readOnly}
            onChange={(e) => sync(rows.map((old, i) => (i === index ? { ...old, json: e.target.value } : old)))}
          />
          <button className="btn micro" disabled={readOnly} onClick={() => sync(rows.filter((_, i) => i !== index))}>
            ✕
          </button>
        </div>
      ))}
      {suggestions && suggestions.length > 0 ? (
        <datalist id="bench-kv-keys">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
      <div className="kv-row">
        <button className="btn micro" disabled={readOnly} onClick={() => sync([...rows, { key: '', json: '0' }])}>
          + 添加字段
        </button>
        {rows.length === 0 ? <span className="aux">无内容</span> : null}
      </div>
    </div>
  )
}
