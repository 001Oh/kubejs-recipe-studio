/**
 * 次要参数控件：number / boolean / choice / text（规格 3.4 控件表 6-9 行）。
 * 渲染分支只看 kind；写一律走 setKey，struct 子键的嵌套由它处理。
 */
import { useState } from 'react'
import type { JSX } from 'react'
import type { RecipeSlotSchema } from '@shared/types'
import { booleanSentence, fieldLabel } from '../fieldModel'
import { asBoolean, asNumber, asString, useFieldValue } from '../valueAccess'
import { setKey } from '../commitOps'
import { FieldShell } from './FieldShell'
import type { ControlProps } from './controlProps'

function write(field: RecipeSlotSchema, value: number | boolean | string): void {
  setKey(field.key, value)
}

export function NumberControl({
  field,
  onWrite
}: ControlProps & {
  /** B124/D-37：可选写入拦截（位置参数回填用）。缺省 = 原行为（setKey），存量调用方零变化 */
  onWrite?: (field: RecipeSlotSchema, value: number) => void
}): JSX.Element {
  const raw = useFieldValue(field.key)
  const value = asNumber(raw, Number(field.defaultValue ?? 0))
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? String(value)
  const belowMin = field.min !== undefined && value < field.min
  const aboveMax = field.max !== undefined && value > field.max
  const bad = belowMin || aboveMax
  return (
    <FieldShell field={field} tone="secondary">
      <div className="scalar-line">
        <input
          className="input number-input"
          type="number"
          min={field.min}
          max={field.max}
          step={field.max !== undefined && field.max <= 1 ? 0.01 : 1}
          value={shown}
          aria-invalid={bad}
          onChange={(e) => {
            setText(e.target.value)
            const next = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(next)) (onWrite ?? write)(field, next)
          }}
          onBlur={() => setText(null)}
        />
        {field.min !== undefined || field.max !== undefined ? (
          <span className={bad ? 'aux range-hint bad' : 'aux range-hint'}>
            {field.min ?? 0}–{field.max ?? '∞'}
          </span>
        ) : null}
      </div>
      {bad ? <p className="inline-warn">超出 schema 声明范围</p> : null}
    </FieldShell>
  )
}

export function BooleanControl({ field }: ControlProps): JSX.Element {
  const value = asBoolean(useFieldValue(field.key))
  return (
    <FieldShell field={field} tone="secondary">
      <label className="switch" title={field.description ?? field.key}>
        <input type="checkbox" checked={value} onChange={(e) => write(field, e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
        <span className="switch-text">{booleanSentence(field)}</span>
      </label>
    </FieldShell>
  )
}

export function ChoiceControl({ field }: ControlProps): JSX.Element {
  const raw = useFieldValue(field.key)
  const choices = field.choices ?? []
  const current = asString(raw) || String(field.defaultValue ?? choices[0]?.value ?? '')

  if (choices.length === 0) {
    return (
      <FieldShell field={field} tone="secondary">
        <input
          className="input mono"
          value={asString(raw)}
          placeholder="枚举值 ID"
          onChange={(e) => write(field, e.target.value)}
        />
      </FieldShell>
    )
  }

  // 选项 ≤5 用分段选择器（法阵等级需要一眼看完），>5 用下拉（规格控件表）
  if (choices.length <= 5) {
    return (
      <FieldShell field={field} tone="secondary">
        <div className="segmented" role="group" aria-label={fieldLabel(field)}>
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className={choice.value === current ? 'segment on' : 'segment'}
              onClick={() => write(field, choice.value)}
              title={choice.value}
            >
              {choice.color ? <span className="swatch" style={{ background: choice.color }} /> : null}
              {choice.label}
            </button>
          ))}
        </div>
      </FieldShell>
    )
  }

  return (
    <FieldShell field={field} tone="secondary">
      <select className="input" value={current} onChange={(e) => write(field, e.target.value)}>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function TextControl({ field }: ControlProps): JSX.Element {
  const raw = useFieldValue(field.key)
  return (
    <FieldShell field={field} tone="secondary">
      <input
        className="input mono"
        value={asString(raw)}
        placeholder={field.description ?? fieldLabel(field)}
        onChange={(e) => write(field, e.target.value)}
      />
    </FieldShell>
  )
}
