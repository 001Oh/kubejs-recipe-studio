/**
 * 槽位绑定：把「地址 + 当前值」换算成 ItemSlot 需要的回调集合。
 * 11 个控件共用这一份接线，吸取/激活/滚轮/双击/右键行为因此天然一致（规格 3.9.4 七态）。
 */
import type { FieldKind, SlotValue } from '@shared/types'
import { useAppStore } from '../../../store/appStore'
import { useBenchStore } from '../../../store/benchStore'
import { useBenchUiStore } from '../benchUiStore'
import { bumpCountAt, clearAt } from '../commitOps'
import { placeEyedropper } from '../useBenchInteractions'

/** ItemSlot 的 onClick 不带事件对象，用捕获阶段记下发车瞬间的修饰键 */
let shiftHeld = false
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      shiftHeld = e.shiftKey
    },
    true
  )
  window.addEventListener('keyup', (e: KeyboardEvent) => {
    shiftHeld = e.shiftKey
  })
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
}

export function useSlotBinding(opts: SlotBindingOptions): SlotBinding {
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
    }
  }
}
