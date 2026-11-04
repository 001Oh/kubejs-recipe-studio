/**
 * P-C2 试点列表编辑：shapeless 与 create:mixing 共用（输入/输出都用规范化槽位键）。
 * 只读写 benchStore 的同一份 values；数量/流体 mB/概率直接写列表项，未改动条目由 draftBridge 原样保留。
 */
import type { JSX } from 'react'
import type { FieldKind, SlotValue } from '@shared/types'
import type { NormalizedSchemaSlot } from '@shared/schemaModel'
import { ItemSlot } from '../../components/ItemSlot'
import { useBenchStore } from '../../store/benchStore'
import { useSlotBinding } from './controls/useSlotBinding'
import { CountEditor } from './overlays/CountEditor'
import { ItemPicker } from './overlays/ItemPicker'
import { encodeSlot } from './slotAddress'

const CELL = 40

function asList(value: unknown): SlotValue[] {
  return Array.isArray(value) ? (value as SlotValue[]) : []
}

function fieldLabel(key: string): string {
  if (key === 'ingredients') return '材料'
  if (key === 'results' || key === 'result') return '产物'
  return key
}

function quantityOf(slot: SlotValue): number | undefined {
  return slot.kind === 'fluid' || slot.kind === 'registry' ? slot.amount ?? slot.count : slot.count
}

function updateSlot(fieldKey: string, index: number, patch: (slot: SlotValue) => SlotValue): void {
  const store = useBenchStore.getState()
  const list = [...asList(store.bench.values[fieldKey])]
  const current = list[index]
  if (!current) return
  list[index] = patch(current)
  store.setValue(fieldKey, list)
}

function removeSlot(fieldKey: string, index: number): void {
  const store = useBenchStore.getState()
  const list = asList(store.bench.values[fieldKey]).filter((_, i) => i !== index)
  store.setValue(fieldKey, list)
}

function ListRow({
  fieldKey,
  index,
  slot,
  kind,
  removable,
  withChance
}: {
  fieldKey: string
  index: number
  slot: SlotValue | null
  kind: FieldKind
  removable: boolean
  withChance: boolean
}): JSX.Element {
  const binding = useSlotBinding({
    slotId: encodeSlot({ kind: 'list', key: fieldKey, index }),
    value: slot,
    kind: slot?.kind ?? kind,
    removable,
    onRemove: () => removeSlot(fieldKey, index)
  })
  const quantity = slot ? quantityOf(slot) : undefined
  const isFluid = slot?.kind === 'fluid' || slot?.kind === 'registry'
  return (
    <div className="pilot-list-row" data-pilot-field={fieldKey} data-pilot-index={index}>
      <ItemSlot {...binding} size={CELL} />
      <label className="aux" title={isFluid ? '流体数量（mB）' : '数量'}>
        {isFluid ? 'mB' : '×'}
        <input
          className="input pilot-qty"
          type="number"
          min={slot ? 1 : 0}
          disabled={!slot}
          value={quantity ?? ''}
          data-pilot-quantity=""
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n) || n < 1) return
            updateSlot(fieldKey, index, (current) =>
              current.kind === 'fluid' || current.kind === 'registry'
                ? { ...current, amount: n }
                : { ...current, count: n }
            )
          }}
        />
      </label>
      {withChance ? (
        <label className="aux" title="概率（%），留空 = 无概率字段">
          %
          <input
            className="input pilot-qty"
            type="number"
            min={0}
            max={100}
            step={1}
            disabled={!slot || slot.kind === 'fluid' || slot.kind === 'registry'}
            value={slot?.chance !== undefined ? Math.round(slot.chance * 100) : ''}
            data-pilot-chance=""
            onChange={(e) => {
              const text = e.target.value.trim()
              updateSlot(fieldKey, index, (current) => {
                if (text === '') {
                  const next = { ...current }
                  delete next.chance
                  return next
                }
                const n = Math.max(0, Math.min(100, Number(text)))
                return { ...current, chance: n / 100 }
              })
            }}
          />
        </label>
      ) : null}
    </div>
  )
}

function AppendSlot({ fieldKey, kind }: { fieldKey: string; kind: FieldKind }): JSX.Element {
  const binding = useSlotBinding({
    slotId: encodeSlot({ kind: 'append', key: fieldKey }),
    value: null,
    kind
  })
  return (
    <div className="pilot-list-add" title="双击添加（打开物品选择器）">
      <ItemSlot {...binding} size={CELL} />
      <span className="aux">添加</span>
    </div>
  )
}

function SlotGroup({
  field,
  values,
  withChance
}: {
  field: NormalizedSchemaSlot
  values: SlotValue[]
  withChance: boolean
}): JSX.Element {
  // T-117 E：空列表必须有显式入口。此前只有 multiple 字段带一个「添加」拖放槽，
  // 单值字段（smithing 的 template/base/addition、熔炼家族的 ingredient）在空白草稿里
  // 一行都不渲染，用户面对的是"这块区域什么都没有"，只能靠双击找不到目标。
  const appendEmpty = (): void => {
    const store = useBenchStore.getState()
    const current = asList(store.bench.values[field.key])
    store.setValue(field.key, [...current, { kind: 'item', id: '', count: 1 }])
  }
  return (
    <section className="pilot-list-group">
      <header className="bench-row">
        <strong>
          {fieldLabel(field.key)}（{values.length}）
        </strong>
        <span className="aux mono">{field.key}</span>
        {field.multiple ? <span className="badge">可多值</span> : <span className="badge">单值</span>}
        {field.required ? <span className="badge badge-warn">必填</span> : null}
      </header>
      <div className="pilot-list-rows">
        {values.map((slot, index) => (
          <ListRow
            key={`${field.key}-${index}`}
            fieldKey={field.key}
            index={index}
            slot={slot}
            kind={field.kind}
            removable={field.multiple}
            withChance={withChance}
          />
        ))}
        {field.multiple ? <AppendSlot fieldKey={field.key} kind={field.kind} /> : null}
        {values.length === 0 ? (
          <button className="btn btn-ghost btn-sm pilot-list-add-btn" onClick={appendEmpty} title={`在「${fieldLabel(field.key)}」里加一项`}>
            + 添加一项
          </button>
        ) : null}
      </div>
    </section>
  )
}

export function PilotListEditor(): JSX.Element | null {
  const bench = useBenchStore((s) => s.bench)
  const draft = useBenchStore((s) => s.draft)
  if (!draft || draft.schema.layoutKind === 'shaped') return null
  if (draft.unsafeReason) {
    return (
      <div className="pilot-list-editor">
        <div className="banner-bar banner-warn">{draft.unsafeReason}</div>
        <p className="aux">可在上方预览原文；本试点不提供列表编辑，取消草稿不会改动原始配方。</p>
      </div>
    )
  }
  const supportsChance = draft.schema.supportsChance === true
  return (
    <div className="pilot-list-editor">
      {draft.schema.slots.map((field) => (
        <SlotGroup
          key={field.key}
          field={field}
          values={asList(bench.values[field.key])}
          withChance={false}
        />
      ))}
      {draft.schema.outputs.map((field) => (
        <SlotGroup
          key={field.key}
          field={field}
          values={asList(bench.values[field.key])}
          withChance={supportsChance}
        />
      ))}
      <p className="aux">
        双击槽位替换 · 右键移除/设置数量 · 数值框直接改数量与概率；未建模字段在预览中原样保留
      </p>
      <ItemPicker />
      <CountEditor />
    </div>
  )
}
