/**
 * P-C2 试点列表编辑：shapeless 与 create:mixing 共用（输入/输出都用规范化槽位键）。
 * 只读写 benchStore 的同一份 values；数量/流体 mB/概率直接写列表项，未改动条目由 draftBridge 原样保留。
 * B124/D-37：标量槽（number/boolean/choice/text）按 kind 分流到 ScalarControls 控件，
 * 不再塞进物品槽列表；位置参数回填（解法 C）见 ScalarField。
 */
import type { JSX } from 'react'
import type { FieldKind, RecipeSlotSchema, SlotValue } from '@shared/types'
import type { NormalizedSchemaSlot } from '@shared/schemaModel'
import { ItemSlot } from '../../components/ItemSlot'
import { useBenchStore } from '../../store/benchStore'
import { useSlotBinding } from './controls/useSlotBinding'
import { CountEditor } from './overlays/CountEditor'
import { ItemPicker } from './overlays/ItemPicker'
import { BooleanControl, ChoiceControl, NumberControl, TextControl } from './controls/ScalarControls'
import { encodeSlot } from './slotAddress'
import { setKey } from './commitOps'

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

/** 引用类槽位走物品槽列表；标量类走 ScalarControls；其余（struct/nbt/blockstate/unknown）按未知降级 */
function isRefKind(f: NormalizedSchemaSlot): boolean {
  return f.kind === 'item' || f.kind === 'fluid' || f.kind === 'tag' || f.kind === 'registry'
}

function isScalarKind(f: NormalizedSchemaSlot): boolean {
  return f.kind === 'number' || f.kind === 'boolean' || f.kind === 'choice' || f.kind === 'text'
}

/** NormalizedSchemaSlot → 标量控件入参（displayName 由 UI 词典补齐，constraints 转区间） */
function asControlField(f: NormalizedSchemaSlot): RecipeSlotSchema {
  return {
    key: f.key,
    displayName: fieldLabel(f.key),
    kind: f.kind,
    multiple: f.multiple,
    ...(f.required ? { required: true } : {}),
    ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
    ...(f.constraints?.min !== undefined ? { min: f.constraints.min } : {}),
    ...(f.constraints?.max !== undefined ? { max: f.constraints.max } : {}),
    ...(f.zone ? { zone: f.zone } : {})
  }
}

/** 标量位是否为空（undefined/null/空串/空数组——与 emitScript 的 isBlank 口径一致） */
function scalarBlank(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/**
 * B124/D-37 陷阱二（解法 C）：标量槽是位置参数——用户填了后面的位而前面的位为空时，
 * 用前面的 defaultValue 占位（如 experience=0），防止 200 落进 xp 位。
 * 写法对齐 commitOps：snapshot 一次 + setValue(false)，补位与用户写入同属一个撤销步。
 */
function writeScalarWithBackfill(
  field: NormalizedSchemaSlot,
  value: number | boolean | string,
  scalarFields: NormalizedSchemaSlot[]
): void {
  const order = scalarFields.filter(isScalarKind)
  const idx = order.findIndex((s) => s.key === field.key)
  if (idx < 0) {
    setKey(field.key, value)
    return
  }
  const seeds = order
    .slice(0, idx)
    .filter((s) => scalarBlank(useBenchStore.getState().bench.values[s.key]) && s.defaultValue !== undefined)
  if (seeds.length === 0) {
    setKey(field.key, value)
    return
  }
  const store = useBenchStore.getState()
  store.snapshot()
  store.setValue(field.key, value, false)
  for (const s of seeds) store.setValue(s.key, s.defaultValue as number | boolean | string, false)
}

function ScalarField({
  field,
  scalarFields
}: {
  field: NormalizedSchemaSlot
  scalarFields: NormalizedSchemaSlot[]
}): JSX.Element {
  const controlField = asControlField(field)
  const onWrite = (_f: RecipeSlotSchema, value: number | boolean | string): void =>
    writeScalarWithBackfill(field, value, scalarFields)
  switch (field.kind) {
    case 'number':
      return <NumberControl field={controlField} onWrite={onWrite} />
    case 'boolean':
      return <BooleanControl field={controlField} />
    case 'choice':
      return <ChoiceControl field={controlField} />
    default:
      return <TextControl field={controlField} />
  }
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
  // B124/D-37：按 kind 分流——引用类走物品槽列表，标量类走「附加数值」区（zone:'extra'
  // 声明经 slotOf 原样到达）；两者都不认识的 kind 显式降级提示，绝不渲染成物品槽。
  const refSlots = draft.schema.slots.filter(isRefKind)
  const refOutputs = draft.schema.outputs.filter(isRefKind)
  const scalarFields = [...draft.schema.slots.filter(isScalarKind), ...draft.schema.outputs.filter(isScalarKind)]
  const unsupported = [...draft.schema.slots, ...draft.schema.outputs].filter((f) => !isRefKind(f) && !isScalarKind(f))
  return (
    <div className="pilot-list-editor">
      {refSlots.map((field) => (
        <SlotGroup
          key={field.key}
          field={field}
          values={asList(bench.values[field.key])}
          withChance={false}
        />
      ))}
      {refOutputs.map((field) => (
        <SlotGroup
          key={field.key}
          field={field}
          values={asList(bench.values[field.key])}
          withChance={supportsChance}
        />
      ))}
      {scalarFields.length > 0 ? (
        <section className="pilot-scalar-group">
          <header className="bench-row">
            <strong>附加数值</strong>
            <span className="aux mono">位置参数按 schema 声明顺序生成</span>
          </header>
          <div className="pilot-scalar-fields">
            {scalarFields.map((field) => (
              <ScalarField key={field.key} field={field} scalarFields={scalarFields} />
            ))}
          </div>
        </section>
      ) : null}
      {unsupported.map((field) => (
        <div key={field.key} className="pilot-list-group" data-pilot-field={field.key}>
          <header className="bench-row">
            <strong>{fieldLabel(field.key)}</strong>
            <span className="aux">该字段类型暂无试点控件，值在预览与原文中原样保留</span>
          </header>
        </div>
      ))}
      <p className="aux">
        双击槽位替换 · 右键移除/设置数量 · 数值框直接改数量与概率；未建模字段在预览中原样保留
      </p>
      <ItemPicker />
      <CountEditor />
    </div>
  )
}
