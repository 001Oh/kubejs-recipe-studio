/** kind 控件的统一入参：字段 schema + 作用域前缀（序列步骤用 `step:<n>:`）。 */
import type { RecipeSlotSchema } from '@shared/types'
import { encodeSlot, type SlotAddress } from '../slotAddress'

export interface ControlProps {
  field: RecipeSlotSchema
  /** 地址作用域前缀；顶层为空串 */
  scope?: string
  /** 槽位边长（网格内由容器计算，其余用规格默认 34） */
  size?: number
  /** 列表控件的第 index 行；undefined 表示单值字段 */
  index?: number
}

export const SLOT_PX = 34

/** 作用域前缀 + 编码地址 = 落点 id，保证步骤内的槽位与顶层槽位不重名 */
export function scoped(scope: string | undefined, encoded: string): string {
  return `${scope ?? ''}${encoded}`
}

export function slotIdFor(field: RecipeSlotSchema, scope?: string, index?: number): string {
  const addr: SlotAddress =
    index === undefined ? { kind: 'value', key: field.key } : { kind: 'list', key: field.key, index }
  return scoped(scope, encodeSlot(addr))
}

export function appendIdFor(field: RecipeSlotSchema, scope?: string): string {
  return scoped(scope, encodeSlot({ kind: 'append', key: field.key }))
}
