/**
 * 流体槽 + mB 用量、标签槽（自动补 # 前缀）。
 * 同时导出行内 ID 输入框：产物槽接受 `2x minecraft:xxx` 前缀语法（规格 3.4 交互表最后一行）。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SlotKind, SlotValue } from '@shared/types'
import { formatCountPrefix } from '@shared/text'
import { ItemSlot } from '../../../components/ItemSlot'
import { parseSlotInput } from '../../../store/slotUtils'
import { encodeSlot } from '../slotAddress'
import { writeAt } from '../commitOps'
import { asNumber, asSlot, useFieldValue } from '../valueAccess'
import { FieldShell } from './FieldShell'
import { SLOT_PX, scoped, type ControlProps } from './controlProps'
import { useSlotBinding } from './useSlotBinding'

function displayOf(slot: SlotValue | null): string {
  if (!slot || !slot.id) return ''
  if (slot.kind === 'tag') return `#${slot.id}`
  if (slot.kind === 'fluid' || slot.kind === 'registry') return slot.id
  return formatCountPrefix(slot.id, slot.count ?? 1)
}

export function InlineSlotInput({
  slotId,
  value,
  kind,
  placeholder
}: {
  slotId: string
  value: SlotValue | null
  kind: SlotKind
  placeholder?: string
}): JSX.Element {
  const [text, setText] = useState(displayOf(value))
  useEffect(() => {
    setText(displayOf(value))
  }, [value?.id, value?.count, value?.amount])

  const commit = (): void => {
    const parsed = parseSlotInput(text, kind)
    if (!parsed) {
      setText('')
      writeAt(slotId, null)
      return
    }
    const merged: SlotValue = { ...parsed, kind }
    writeAt(slotId, merged)
    setText(displayOf(merged))
  }

  return (
    <input
      className="input mono slot-id-input"
      value={text}
      placeholder={placeholder ?? 'minecraft:dust 或 2x minecraft:dust 或 #forge:dusts'}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Escape') setText(displayOf(value))
      }}
    />
  )
}

export function FluidControl({ field, scope, size }: ControlProps): JSX.Element {
  const value = asSlot(useFieldValue(field.key))
  const slotId = scoped(scope, encodeSlot({ kind: 'value', key: field.key }))
  const binding = useSlotBinding({ slotId, value, kind: 'fluid', nameZh: field.displayName })
  const amount = value?.amount ?? 0
  return (
    <FieldShell field={field}>
      <div className="slot-line">
        <ItemSlot {...binding} size={size ?? SLOT_PX} />
        <InlineSlotInput slotId={slotId} value={value} kind="fluid" placeholder="minecraft:lava" />
        <input
          className="input amount-input"
          type="number"
          min={field.min ?? 0}
          max={field.max}
          step={10}
          value={amount}
          title="流体用量 mB（与物品数量是两个独立概念）"
          onChange={(e) => writeAt(slotId, { kind: 'fluid', id: value?.id ?? '', amount: asNumber(e.target.value) })}
        />
        <span className="aux">mB</span>
      </div>
    </FieldShell>
  )
}

export function TagControl({ field, scope, size }: ControlProps): JSX.Element {
  const value = asSlot(useFieldValue(field.key))
  const slotId = scoped(scope, encodeSlot({ kind: 'value', key: field.key }))
  const binding = useSlotBinding({ slotId, value, kind: 'tag', nameZh: field.displayName })
  return (
    <FieldShell field={field}>
      <div className="slot-line">
        <ItemSlot {...binding} size={size ?? SLOT_PX} />
        <InlineSlotInput
          slotId={slotId}
          value={value}
          kind="tag"
          placeholder={field.firstItemMust ? `#${field.firstItemMust}` : '#forge:ingots/iron'}
        />
      </div>
      {field.firstItemMust ? <p className="aux">首项须为 #{field.firstItemMust}</p> : null}
    </FieldShell>
  )
}
