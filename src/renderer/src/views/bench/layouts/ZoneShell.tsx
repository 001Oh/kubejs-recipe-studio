/**
 * 分区外壳 + 字段列表：材料 / 产物 / 附加 / 激活物四种视觉区共用同一套渲染（规格 3.4 视觉顺序）。
 * 没有 schema 时用 inputs / outputs 伪字段走同一个列表控件，保证通用模式与三级降级同形。
 */
import type { JSX, ReactNode } from 'react'
import type { RecipeSlotSchema } from '@shared/types'
import { INPUTS_KEY, OUTPUTS_KEY } from '../../../store/benchStore'
import { FieldControl } from '../controls/FieldControl'

export type ZoneName = 'input' | 'output' | 'extra' | 'activator'

export function Zone({
  zone,
  title,
  children,
  note,
  aside
}: {
  zone: ZoneName
  title: string
  children: ReactNode
  note?: string
  aside?: ReactNode
}): JSX.Element {
  return (
    <section className={`bench-zone zone-${zone}`}>
      <header className="zone-head">
        <h4 className="zone-title">{title}</h4>
        {aside}
      </header>
      <div className="zone-body">{children}</div>
      {note ? <p className="aux zone-note">{note}</p> : null}
    </section>
  )
}

export const GENERIC_INPUT_FIELD: RecipeSlotSchema = {
  key: INPUTS_KEY,
  displayName: '材料',
  kind: 'item',
  multiple: true
}

export const GENERIC_OUTPUT_FIELD: RecipeSlotSchema = {
  key: OUTPUTS_KEY,
  displayName: '产物',
  kind: 'item',
  multiple: true
}

/** 一组字段；空列表用文字提示而不是留白 */
export function FieldList({
  fields,
  scope,
  size,
  emptyHint = '此区无字段'
}: {
  fields: RecipeSlotSchema[]
  scope?: string
  size?: number
  emptyHint?: string
}): JSX.Element {
  if (fields.length === 0) return <p className="aux">{emptyHint}</p>
  return (
    <>
      {fields.map((field) => (
        <FieldControl key={field.key} field={field} scope={scope} size={size} />
      ))}
    </>
  )
}

/** schema 有该区的字段就用 schema，否则退回通用列表（网格 / custom / sequence 共用同一个产物区） */
export function OutputsOf({ schema }: { schema: RecipeSlotSchema[] | null }): RecipeSlotSchema[] {
  return schema && schema.length > 0 ? schema : [GENERIC_OUTPUT_FIELD]
}

export function InputsOf({ schema }: { schema: RecipeSlotSchema[] | null }): RecipeSlotSchema[] {
  return schema && schema.length > 0 ? schema : [GENERIC_INPUT_FIELD]
}
