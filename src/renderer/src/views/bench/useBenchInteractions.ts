/**
 * 工作台交互接线：DndLayer 的自定义落点事件、吸取态放置、键盘（撤销/重做/清空/设为产物/写入）。
 * 落点语义全部交给 slotAddress 的纯函数决定；本文件只做事件收发，不出现配方类型分支。
 */
import { useEffect, useMemo } from 'react'
import type { RecipeTypeSchema, SlotValue } from '@shared/types'
import { OUTPUTS_KEY } from '../../store/benchStore'
import { SLOT_DROP_EVENT, SLOT_OUT_EVENT } from '../../components/DndLayer'
import type { SlotDropDetail } from '../../components/DndLayer'
import { useAppStore } from '../../store/appStore'
import { useBenchStore } from '../../store/benchStore'
import { commitOps } from './commitOps'
import { useBenchUiStore } from './benchUiStore'
import { clearOps, decodeSlot, firstEmptyMaterial, makeZoneResolver, planDrop, writeToSlot } from './slotAddress'
import type { SlotAddress } from './slotAddress'

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

function eyedropperValue(id: string, name: string): SlotValue {
  return { kind: 'item', id, count: 1, name }
}

/** 产物区第一个可写地址：schema.outputs 优先，通用模式退回 outputs 列表 */
function firstOutputTarget(schema: RecipeTypeSchema | null): SlotAddress {
  const field = schema?.outputs[0]
  if (!field) return { kind: 'append', key: OUTPUTS_KEY }
  return field.multiple ? { kind: 'append', key: field.key } : { kind: 'value', key: field.key }
}

export function useBenchInteractions(): void {
  const schema = useBenchUiStore((s) => s.schema)
  const resolveZone = useMemo(() => makeZoneResolver(schema), [schema])

  useEffect(() => {
    const onDrop = (event: Event): void => {
      const detail = (event as CustomEvent<SlotDropDetail>).detail
      if (!detail?.slotId) return
      const target = decodeSlot(detail.slotId)
      if (!target) return
      const bench = useBenchStore.getState().bench
      const source = detail.origin === 'slot' && detail.sourceSlotId ? decodeSlot(detail.sourceSlotId) : null
      commitOps(
        planDrop(target, detail.value, { bench, resolveZone }, { insert: detail.insert, source })
      )
    }
    window.addEventListener(SLOT_DROP_EVENT, onDrop)
    return () => window.removeEventListener(SLOT_DROP_EVENT, onDrop)
  }, [resolveZone])

  useEffect(() => {
    // 拖到侧边栏 = 清空该槽并打开该材料的配方（递归查看它怎么来的）
    const onOut = (event: Event): void => {
      const detail = (event as CustomEvent<{ slotId: string; value: SlotValue }>).detail
      if (!detail?.slotId || !detail.value) return
      const addr = decodeSlot(detail.slotId)
      if (addr) commitOps(clearOps(addr))
      const app = useAppStore.getState()
      app.selectItem(detail.value.id, 'craft')
      app.setView('browse')
      app.pushLog('DEBUG', 'UI', `槽位移出 ${detail.value.id}，已打开其配方`)
    }
    window.addEventListener(SLOT_OUT_EVENT, onOut)
    return () => window.removeEventListener(SLOT_OUT_EVENT, onOut)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const store = useBenchStore.getState()
      const app = useAppStore.getState()
      const ui = useBenchUiStore.getState()

      if (e.key === 'Escape' && (ui.picker || ui.registryPanel || ui.countEditor)) {
        e.stopPropagation()
        ui.closeOverlays()
        return
      }
      if (isTypingTarget(e.target)) return

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (!store.redo()) app.toast('没有可重做的操作', 'info')
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (!store.undo()) app.toast('没有可撤销的操作', 'info')
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        ui.setWriteOpen(true)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.bench.activeSlotKey) {
        const addr = decodeSlot(store.bench.activeSlotKey)
        if (!addr) return
        e.preventDefault()
        commitOps(clearOps(addr))
        store.setActiveSlot(null)
        return
      }
      // Ctrl+Enter = Ctrl+中键等价键：吸取中的物品直接进产物区
      if (e.ctrlKey && e.key === 'Enter') {
        if (!app.eyedropper) return
        e.preventDefault()
        const value = eyedropperValue(app.eyedropper.id, app.eyedropper.nameZh)
        commitOps(
          planDrop(firstOutputTarget(schema), value, { bench: store.bench, resolveZone }, { insert: false, source: null })
        )
        app.pushLog('DEBUG', 'UI', `Ctrl+Enter 设为产物 ${value.id}`)
        if (!app.eyedropperKeep) app.clearEyedropper()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [schema, resolveZone])
}

/** 吸取态下左键落点：点材料槽成材料、点产物槽成产物，位置完全由落点决定 */
export function placeEyedropper(slotId: string, keep: boolean): boolean {
  const app = useAppStore.getState()
  if (!app.eyedropper) return false
  const addr = decodeSlot(slotId)
  if (!addr) return false
  commitOps(
    planDrop(
      addr,
      eyedropperValue(app.eyedropper.id, app.eyedropper.nameZh),
      { bench: useBenchStore.getState().bench, resolveZone: makeZoneResolver(useBenchUiStore.getState().schema) },
      { insert: false, source: null }
    )
  )
  useBenchStore.getState().setActiveSlot(slotId)
  if (!keep && !app.eyedropperKeep) app.clearEyedropper()
  return true
}

/** 点在工作台空白区：吸取态下填入第一个空材料槽（规格 3.4 交互表） */
export function placeOnSurface(): void {
  const app = useAppStore.getState()
  if (!app.eyedropper) return
  const bench = useBenchStore.getState().bench
  const resolveZone = makeZoneResolver(useBenchUiStore.getState().schema)
  commitOps(
    writeToSlot(
      firstEmptyMaterial(bench, resolveZone),
      eyedropperValue(app.eyedropper.id, app.eyedropper.nameZh),
      bench
    )
  )
  if (!app.eyedropperKeep) app.clearEyedropper()
}
