/**
 * item(单) 与 item(多)：规格控件表前两行。
 * multiple 只决定「单槽」还是「可增删列表」；列表每一行仍由同一 kind 控件渲染（带 index）。
 */
import { useDroppable } from '@dnd-kit/core'
import type { JSX, ReactNode } from 'react'
import { ItemSlot } from '../../../components/ItemSlot'
import { clearAt, writeAt } from '../commitOps'
import { isActivatorField, prefersGrid } from '../fieldModel'
import { emptySlot, useSlotAt, useSlotsOf } from '../valueAccess'
import { FieldShell } from './FieldShell'
import { SLOT_PX, appendIdFor, slotIdFor, type ControlProps } from './controlProps'
import { useSlotBinding } from './useSlotBinding'

export function SingleItemControl({ field, scope, size, index }: ControlProps): JSX.Element {
  const value = useSlotAt(field.key, index)
  const slotId = slotIdFor(field, scope, index)
  const binding = useSlotBinding({
    slotId,
    value,
    kind: field.kind,
    registry: field.registry,
    nameZh: field.displayName,
    activator: index === undefined && isActivatorField(field),
    removable: index !== undefined,
    onRemove: index !== undefined ? () => clearAt(slotId) : undefined
  })
  return (
    <FieldShell field={field} bare={index !== undefined}>
      <ItemSlot {...binding} size={size ?? SLOT_PX} />
    </FieldShell>
  )
}

interface ListProps extends ControlProps {
  /** 由 FieldControl 提供的行渲染：每行还是那个 kind 控件，只是多带一个 index */
  renderRow: (index: number) => ReactNode
}

/** 可增删行的引用槽列表；容量 ≥8 时自动改网格排布（仪式 12 材料因此不需要专门代码） */
export function MultiSlotControl({ field, scope, renderRow }: ListProps): JSX.Element {
  const list = useSlotsOf(field.key)
  const appendId = appendIdFor(field, scope)
  const drop = useDroppable({ id: `slot:${appendId}` })
  const grid = prefersGrid(field, list.length)
  const capacity = field.max ?? 0
  // P3-23a：行 key 用「值身份 + 出现序」，删除靠前行不使后续行复用别人的组件实例；
  // 空值行没有身份，按 index 兜底（如 item id + 位置，冲突时回退 index）。
  const seen = new Map<string, number>()
  const rowKeys = list.map((slot, index) => {
    if (!slot.id) return `index:${index}`
    const ordinal = seen.get(slot.id) ?? 0
    seen.set(slot.id, ordinal + 1)
    return `${slot.id}#${ordinal}`
  })

  return (
    <FieldShell field={field}>
      <div className={`slot-group${grid ? ' as-grid' : ''}`} data-orientation={field.orientation ?? 'horizontal'}>
        {list.map((slot, index) => (
          <div className="slot-cell" key={rowKeys[index]} data-empty={!slot.id}>
            {renderRow(index)}
            <button className="btn micro" title="移除该条目" onClick={() => clearAt(slotIdFor(field, scope, index))}>
              ✕
            </button>
          </div>
        ))}
        <div
          ref={drop.setNodeRef}
          className={`slot-append${drop.isOver ? ' over' : ''}`}
          title="拖到此处追加一个条目"
          onClick={() => writeAt(appendId, emptySlot(field.kind, field.registry))}
        >
          <span className="slot-empty-mark" />
        </div>
      </div>
      <div className="field-tools aux">
        <span>
          {list.length}
          {capacity > 0 ? ` / ${capacity}` : ''} 项
        </span>
        {field.min !== undefined && list.length < field.min ? (
          <span className="inline-warn">至少 {field.min} 项</span>
        ) : null}
        <button className="btn micro" onClick={() => writeAt(appendId, emptySlot(field.kind, field.registry))}>
          + 添加
        </button>
      </div>
    </FieldShell>
  )
}
