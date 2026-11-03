/**
 * 拖拽与吸取的全局层：DndContext + DragOverlay + 跟随光标的吸取幽灵 + 底部吸色条。
 * 落点由父级监听 studio:slot-drop / studio:slot-out 事件处理，避免把工作台逻辑塞进外壳。
 */
import { useEffect, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { JSX, ReactNode } from 'react'
import type { ItemEntry, SlotValue } from '@shared/types'
import { ItemIcon } from './ItemIcon'
import { useAppStore } from '../store/appStore'

export interface SlotDropDetail {
  slotId: string
  value: SlotValue
  /** 来自侧边栏还是槽位之间 */
  origin: 'item' | 'slot'
  sourceSlotId: string | null
  insert: boolean
}

export const SLOT_DROP_EVENT = 'studio:slot-drop'
export const SLOT_OUT_EVENT = 'studio:slot-out'

export function slotIdOf(droppableId: string): string {
  return droppableId.startsWith('slot:') ? droppableId.slice('slot:'.length) : droppableId
}

export function DndLayer({ children }: { children: ReactNode }): JSX.Element {
  const eyedropper = useAppStore((s) => s.eyedropper)
  const eyedropperKeep = useAppStore((s) => s.eyedropperKeep)
  const clearEyedropper = useAppStore((s) => s.clearEyedropper)
  const setEyedropperKeep = useAppStore((s) => s.setEyedropperKeep)
  const pushLog = useAppStore((s) => s.pushLog)
  const [active, setActive] = useState<{ value: SlotValue; origin: 'item' | 'slot'; from: string } | null>(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const shiftRef = useRef(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // dnd-kit 的 DragEndEvent 不带修饰键状态，Alt/Shift 自己记（规格 3.4：Alt 插入后移、Shift 连续放置）
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      shiftRef.current = e.shiftKey || e.altKey
    }
    const up = (e: KeyboardEvent): void => {
      shiftRef.current = e.shiftKey || e.altKey
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    if (!eyedropper) return
    const move = (e: MouseEvent): void => setCursor({ x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [eyedropper])

  const onDragStart = (e: DragStartEvent): void => {
    const data = e.active.data.current as { value?: SlotValue; origin?: 'item' | 'slot'; from?: string } | undefined
    if (!data?.value) return
    setActive({ value: data.value, origin: data.origin ?? 'item', from: String(e.active.id) })
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setActive(null)
    const data = e.active.data.current as { value?: SlotValue; origin?: 'item' | 'slot'; from?: string } | undefined
    if (!data?.value || !e.over) return
    const overId = String(e.over.id)
    const insert = shiftRef.current
    if (overId === 'sidebar') {
      window.dispatchEvent(new CustomEvent(SLOT_OUT_EVENT, { detail: { slotId: slotIdOf(data.from ?? ''), value: data.value } }))
      return
    }
    if (!overId.startsWith('slot:')) return
    const detail: SlotDropDetail = {
      slotId: slotIdOf(overId),
      value: data.value,
      origin: data.origin ?? 'item',
      sourceSlotId: data.origin === 'slot' ? String(e.active.id).replace(/^drag:/, '') : null,
      insert
    }
    window.dispatchEvent(new CustomEvent(SLOT_DROP_EVENT, { detail }))
    pushLog('DEBUG', 'UI', `拖拽落点 ${overId}`)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      {children}
      <DragOverlay dropAnimation={{ duration: 120, easing: 'cubic-bezier(0.2,0,0,1)' }}>
        {active ? (
          <div className="drag-overlay-item">
            <ItemIcon item={{ id: active.value.id, name: active.value.id, iconKey: null, hasIcon: false }} size={32} />
            <span>{active.value.id}</span>
          </div>
        ) : null}
      </DragOverlay>
      {eyedropper ? <AbsorbLayer item={eyedropper} cursor={cursor} /> : null}
      {eyedropper ? (
        <div className="absorb-bar">
          <ItemIcon item={toIconSource(eyedropper)} size={32} />
          <span>{eyedropper.nameZh}</span>
          <span className="aux">点击放置 · Shift 连续 · Esc 取消</span>
          <button className={`chip${eyedropperKeep ? ' on' : ''}`} onClick={() => setEyedropperKeep(!eyedropperKeep)}>
            连续放置 {eyedropperKeep ? '开' : '关'}
          </button>
          <button className="btn" onClick={clearEyedropper}>
            ✕ 取消吸取
          </button>
        </div>
      ) : null}
    </DndContext>
  )
}

function toIconSource(item: ItemEntry): { id: string; name: string; iconKey: string | null; hasIcon: boolean } {
  return { id: item.id, name: item.nameZh, iconKey: item.iconKey, hasIcon: item.hasIcon }
}

function AbsorbLayer({ item, cursor }: { item: ItemEntry; cursor: { x: number; y: number } }): JSX.Element {
  return (
    <div className="absorb-ghost" style={{ left: cursor.x, top: cursor.y }}>
      <ItemIcon item={toIconSource(item)} size={48} />
    </div>
  )
}
