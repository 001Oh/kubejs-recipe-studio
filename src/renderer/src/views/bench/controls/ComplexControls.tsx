/**
 * 复杂形态控件：nbt（原语 8）/ blockstate（原语 9）/ unknown（兜底键值对）。
 * 属性与 NBT 约束沿 `key.nbt` / `key.properties` 嵌套写进同一个字典项，绝不自动塞空对象。
 */
import { useState } from 'react'
import type { JSX } from 'react'
import { ItemSlot } from '../../../components/ItemSlot'
import { setKey, writeAt } from '../commitOps'
import { fieldLabel } from '../fieldModel'
import { asRecord, asString, useFieldValue, useSlotAt } from '../valueAccess'
import { FieldShell } from './FieldShell'
import { SLOT_PX, slotIdFor, type ControlProps } from './controlProps'
import { useSlotBinding } from './useSlotBinding'
import { InlineSlotInput } from './RefControls'
import { KeyValueEditor } from '../panels/KeyValueEditor'

export function NbtControl({ field, scope, size, index }: ControlProps): JSX.Element {
  const value = useSlotAt(field.key, index)
  const slotId = slotIdFor(field, scope, index)
  const binding = useSlotBinding({ slotId, value, kind: 'nbt', nameZh: field.displayName })
  const constrained = value?.nbt !== undefined
  return (
    <FieldShell field={field}>
      <div className="slot-line">
        <ItemSlot {...binding} size={size ?? SLOT_PX} />
        <label className="switch" title="勾选后才写入 NBT 约束；不勾则完全不带该字段">
          <input
            type="checkbox"
            checked={constrained}
            disabled={!value}
            onChange={(e) => {
              if (!value) return
              const next = { ...value }
              if (e.target.checked) next.nbt = {}
              else delete next.nbt
              writeAt(slotId, next)
            }}
          />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-text">限制 NBT</span>
        </label>
      </div>
      {constrained ? (
        <KeyValueEditor
          value={value?.nbt}
          onChange={(next) => {
            if (!value) return
            writeAt(slotId, { ...value, nbt: next })
          }}
        />
      ) : null}
    </FieldShell>
  )
}

/** 方块状态：值形如 `{ kind:'item', id:<block>, properties:{...} }`，properties 由本控件维护 */
export function BlockstateControl({ field, scope, size, index }: ControlProps): JSX.Element {
  const value = useSlotAt(field.key, index)
  const slotId = slotIdFor(field, scope, index)
  const binding = useSlotBinding({ slotId, value, kind: 'blockstate', nameZh: field.displayName })
  const propsPath = `${field.key}.properties`
  const properties = asRecord(useFieldValue(propsPath))
  return (
    <FieldShell field={field}>
      <div className="slot-line">
        <ItemSlot {...binding} size={size ?? SLOT_PX} />
        <InlineSlotInput slotId={slotId} value={value} kind="item" placeholder="minecraft:grass_block" />
      </div>
      <p className="aux">方块属性（单值 / 多值 / 范围都按 JSON 字面量写）</p>
      <KeyValueEditor
        value={Object.keys(properties).length > 0 ? properties : null}
        onChange={(next) => setKey(propsPath, next)}
      />
    </FieldShell>
  )
}

export function UnknownControl({ field }: ControlProps): JSX.Element {
  const raw = useFieldValue(field.key)
  const [open, setOpen] = useState(false)
  const preview = typeof raw === 'object' && raw !== null ? JSON.stringify(raw) : asString(raw)
  return (
    <FieldShell field={field} tone="extra">
      <div className="unknown-head">
        <span className="badge">unknown</span>
        <span className="aux" title={preview || '未填'}>
          {preview || field.description || '未能识别的参数形态'}
        </span>
        <button className="btn micro" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '编辑'}
        </button>
      </div>
      {open ? <KeyValueEditor value={raw} onChange={(next) => setKey(field.key, next)} /> : null}
      <p className="aux">键名 {field.key} · 语义名 {fieldLabel(field)}</p>
    </FieldShell>
  )
}

/** struct 子字段的空壳：只在真正写入时才在字典里成形 */
export function structChildKey(parent: string, child: string): string {
  return `${parent}.${child}`
}

