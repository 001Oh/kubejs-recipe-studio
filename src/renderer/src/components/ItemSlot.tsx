/**
 * 通用物品槽：七种状态（空/填充/hover/吸取态/激活/合法拖拽目标/非法目标/禁用）视觉可区分。
 * 材料槽、产物槽、辅助槽、注册表槽共用这一套；渲染分支只看 kind，绝不看配方类型。
 */
import { useEffect, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { JSX, ReactNode } from 'react'
import type { SlotValue } from '@shared/types'
import { ItemIcon } from './ItemIcon'
import { countBadge, formatChance, registryAbbr, slotTitle } from '../store/slotUtils'
import { useBenchUiStore } from '../views/bench/benchUiStore'
import { useAppStore } from '../store/appStore'
import { useHoverPreview } from '../views/sidebar/useHoverPreview'
import { useIconKeys } from '../hooks/useIconKeys'

export interface SlotDragData {
  from: string
  value: SlotValue
  /** item = 来自侧边栏；slot = 工作台内槽位之间 */
  origin: 'item' | 'slot'
}

interface Props {
  slotKey: string
  value: SlotValue | null
  /** 默认 34px（规格控件表），内部图标按 16 的整数倍放大 */
  size?: number
  kindHint?: 'item' | 'fluid' | 'tag' | 'registry' | 'activator'
  active?: boolean
  /** 吸取态下所有可放置槽位高亮 */
  absorbable?: boolean
  readOnly?: boolean
  removable?: boolean
  nameZh?: string
  onActivate?: () => void
  onCountDelta?: (delta: number) => void
  onClear?: () => void
  onRemove?: () => void
  onOpenPicker?: () => void
  onSetCount?: () => void
  onBrowseRecipes?: (id: string) => void
  /** 第 116 批：中键粘贴（仅物品，数量 1）。流体/注册表槽与只读槽为 undefined */
  onPasteItem?: (item: { id: string }) => void
  badge?: ReactNode
}

export function ItemSlot(props: Props): JSX.Element {
  const {
    slotKey,
    value,
    size = 34,
    kindHint,
    active,
    absorbable,
    readOnly,
    removable,
    nameZh,
    onActivate,
    onCountDelta,
    onClear,
    onRemove,
    onOpenPicker,
    onSetCount,
    onBrowseRecipes,
    onPasteItem,
    badge
  } = props

  const icons = useIconKeys(value ? [value.id] : [])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const over = useDroppable({ id: `slot:${slotKey}`, disabled: !!readOnly })
  const drag = useDraggable({
    id: `drag:${slotKey}`,
    data: { from: slotKey, value, origin: 'slot' } as SlotDragData,
    disabled: !value || !!readOnly
  })

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  // T-26 / UI-U3：悬停槽位预览物品（纯附加行为）
  const hover = useHoverPreview(value?.id ?? null)
  const cls = ['slot']
  if (kindHint === 'fluid') cls.push('fluid')
  if (kindHint === 'registry' || value?.kind === 'registry') cls.push('registry')
  if (kindHint === 'activator') cls.push('activator')
  if (active) cls.push('activated')
  if (absorbable && !readOnly) cls.push('absorb-target')
  if (readOnly) cls.push('disabled')
  if (over.isOver && over.active) cls.push(readOnly ? 'drag-over-invalid' : 'drag-over-valid')
  if (drag.isDragging) cls.push('drag-source')

  const iconSize = size >= 48 ? 48 : size >= 32 ? 32 : 16
  const chance = formatChance(value?.chance)
  const badgeText = countBadge(value)
  const iconKey = value ? (icons[value.id] ?? null) : null

  return (
    <>
      <div
        ref={(node) => {
          over.setNodeRef(node)
          drag.setNodeRef(node)
        }}
        className={cls.join(' ')}
        style={{ width: size, height: size, cursor: readOnly ? 'not-allowed' : value ? 'grab' : 'default' }}
        title={value ? slotTitle(value, nameZh) : '空槽位\n双击选择物品 · 中键粘贴（先在侧栏物品上中键复制）· 右键清空 · 滚轮改数量'}
        data-slot={slotKey}
        {...hover}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault()
        }}
        onAuxClick={(e) => {
          // Windows 中键会触发自动滚动与 auxclick，必须吃掉默认行为（规格 3.4）
          if (e.button === 1) {
            e.preventDefault()
            e.stopPropagation()
            // 第 116 批：中键粘贴——把侧栏中键复制的物品放进槽位（仅物品，数量 1）
            if (readOnly) return
            const clip = useBenchUiStore.getState().slotClipboard
            if (!clip) {
              useAppStore.getState().toast('剪贴板为空：先在侧栏物品上按中键复制', 'info')
              return
            }
            if (kindHint === 'fluid' || kindHint === 'registry' || kindHint === 'activator') {
              useAppStore.getState().toast('该槽位不接受物品粘贴', 'warn')
              return
            }
            onPasteItem?.({ id: clip.id })
          }
        }}
        onClick={() => {
          if (!readOnly) onActivate?.()
        }}
        onDoubleClick={() => {
          if (!readOnly) onOpenPicker?.()
        }}
        onContextMenu={(e) => {
          if (readOnly) return
          e.preventDefault()
          // 第 116 批：吸取态下右键 = 取消吸取（全局监听接管），不清空槽位
          if (useAppStore.getState().eyedropper) return
          // 右键取消：清空槽位（残留物品的快捷出路）；Shift+右键保留完整菜单
          if (!e.shiftKey && onClear) {
            onClear()
            return
          }
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        onWheel={(e) => {
          if (readOnly || !value) return
          e.preventDefault()
          onCountDelta?.((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 8 : 1))
        }}
      >
        {value ? (
          <>
            <ItemIcon
              item={{
                id: value.id,
                name: nameZh ?? value.id,
                iconKey,
                hasIcon: iconKey !== null
              }}
              size={iconSize}
            />
            {badgeText ? <span className="slot-badge">{badgeText}</span> : null}
            {chance ? <span className="slot-chance">{chance}</span> : null}
            {value.kind === 'tag' ? <span className="slot-tag">#</span> : null}
            {value.kind === 'registry' ? (
              <span className="slot-tag" style={{ color: 'var(--registry)' }}>
                {registryAbbr(value.registryType)}
              </span>
            ) : null}
            {value.nbt !== undefined ? <span className="slot-tag" title="带 NBT 约束">NBT</span> : null}
            {badge}
          </>
        ) : (
          <span className="slot-empty-mark" />
        )}
      </div>
      {menu ? (
        <div className="slot-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {value ? (
            <button onClick={() => { setMenu(null); onSetCount?.() }}>设置数量…</button>
          ) : null}
          {value ? (
            <button
              onClick={() => {
                setMenu(null)
                void navigator.clipboard?.writeText(value.kind === 'tag' ? `#${value.id}` : value.id)
              }}
            >
              复制物品 ID
            </button>
          ) : null}
          {value ? (
            <button onClick={() => { setMenu(null); onBrowseRecipes?.(value.id) }}>查看配方</button>
          ) : null}
          {!readOnly ? <button onClick={() => { setMenu(null); onOpenPicker?.() }}>替换为…</button> : null}
          {!readOnly ? <button onClick={() => { setMenu(null); onClear?.() }}>清空</button> : null}
          {removable && !readOnly ? <button onClick={() => { setMenu(null); onRemove?.() }}>移除该槽位</button> : null}
        </div>
      ) : null}
    </>
  )
}
