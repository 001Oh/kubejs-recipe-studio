/**
 * 槽位绑定：把「地址 + 当前值」换算成 ItemSlot 需要的回调集合。
 * 11 个控件共用这一份接线，吸取/激活/滚轮/双击/右键行为因此天然一致（规格 3.9.4 七态）。
 */
import { useEffect } from 'react'
import type { FieldKind, SlotValue } from '@shared/types'
import { useAppStore } from '../../../store/appStore'
import { useBenchStore } from '../../../store/benchStore'
import { useBenchUiStore } from '../benchUiStore'
import { bumpCountAt, clearAt, writeAt } from '../commitOps'
import { placeEyedropper } from '../useBenchInteractions'

/** ItemSlot 的 onClick 不带事件对象，用捕获阶段记下发车瞬间的修饰键 */
let shiftHeld = false
let shiftUsers = 0
let shiftPointerHandler: ((e: PointerEvent) => void) | null = null
let shiftKeyHandler: ((e: KeyboardEvent) => void) | null = null

/** P3-23b：首个使用方挂载时安装，最后一个卸载时移除；模块导入不再永久占用全局监听 */
function acquireShiftListeners(): void {
  shiftUsers += 1
  if (shiftUsers !== 1 || typeof window === 'undefined') return
  const onPointer = (e: PointerEvent): void => {
    shiftHeld = e.shiftKey
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    shiftHeld = e.shiftKey
  }
  shiftPointerHandler = onPointer
  shiftKeyHandler = onKeyUp
  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('keyup', onKeyUp)
}

function releaseShiftListeners(): void {
  shiftUsers = Math.max(0, shiftUsers - 1)
  if (shiftUsers !== 0 || !shiftPointerHandler || !shiftKeyHandler) return
  window.removeEventListener('pointerdown', shiftPointerHandler, true)
  window.removeEventListener('keyup', shiftKeyHandler)
  shiftPointerHandler = null
  shiftKeyHandler = null
}

export interface SlotBindingOptions {
  slotId: string
  value: SlotValue | null
  /** 控件形态，决定 kindHint 与选择器可接受类型 */
  kind: FieldKind
  registry?: string
  activator?: boolean
  nameZh?: string
  readOnly?: boolean
  removable?: boolean
  onRemove?: () => void
  /** 注册表槽等自带点击行为的控件用自己的 onActivate */
  onActivate?: () => void
}

const KIND_HINT: Partial<Record<FieldKind, 'item' | 'fluid' | 'tag' | 'registry'>> = {
  item: 'item',
  fluid: 'fluid',
  tag: 'tag',
  registry: 'registry',
  blockstate: 'item',
  nbt: 'item'
}

export interface SlotBinding {
  slotKey: string
  value: SlotValue | null
  kindHint?: 'item' | 'fluid' | 'tag' | 'registry' | 'activator'
  active: boolean
  absorbable: boolean
  readOnly?: boolean
  removable?: boolean
  nameZh?: string
  onActivate: () => void
  onOpenPicker: () => void
  onCountDelta: (delta: number) => void
  onClear: () => void
  onRemove?: () => void
  onSetCount: () => void
  onBrowseRecipes: (id: string) => void
  /** 第 116 批：中键粘贴（仅物品，数量 1）。只读/流体/注册表槽为 undefined（ItemSlot 侧拒绝） */
  onPasteItem?: (item: { id: string }) => void
}

export function useSlotBinding(opts: SlotBindingOptions): SlotBinding {
  useEffect(() => {
    acquireShiftListeners()
    return releaseShiftListeners
  }, [])
  const eyedropper = useAppStore((s) => s.eyedropper)
  const activeSlotKey = useBenchStore((s) => s.bench.activeSlotKey)
  const setActiveSlot = useBenchStore((s) => s.setActiveSlot)
  const selectItem = useAppStore((s) => s.selectItem)

  const hint = opts.activator ? 'activator' : KIND_HINT[opts.kind]

  return {
    slotKey: opts.slotId,
    value: opts.value,
    kindHint: hint,
    active: activeSlotKey === opts.slotId,
    absorbable: !!eyedropper && !opts.readOnly,
    readOnly: opts.readOnly,
    removable: opts.removable,
    nameZh: opts.nameZh ?? opts.value?.name,
    onActivate: () => {
      if (opts.onActivate) {
        opts.onActivate()
        return
      }
      if (placeEyedropper(opts.slotId, shiftHeld)) return
      setActiveSlot(opts.slotId)
    },
    onOpenPicker: () => {
      if (opts.readOnly) return
      if (opts.kind === 'registry') {
        useBenchUiStore.getState().openRegistryPanel({
          slotId: opts.slotId,
          kind: 'registry',
          registry: opts.registry ?? opts.value?.registryType ?? ''
        })
        return
      }
      useBenchUiStore.getState().openPicker({ slotId: opts.slotId, kind: opts.kind, registry: opts.registry })
    },
    onCountDelta: (delta: number) => bumpCountAt(opts.slotId, delta),
    onClear: () => clearAt(opts.slotId),
    onRemove: opts.removable ? opts.onRemove : undefined,
    onSetCount: () => useBenchUiStore.getState().openCountEditor(opts.slotId),
    onBrowseRecipes: (id: string) => {
      selectItem(id, 'craft')
      useAppStore.getState().setView('browse')
    },
    onPasteItem:
      opts.readOnly || opts.kind === 'fluid' || opts.kind === 'registry'
        ? undefined
        : (item) => writeAt(opts.slotId, { kind: 'item', id: item.id, count: 1 })
  }
}
