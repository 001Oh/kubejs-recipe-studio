/** 控件外壳：统一标签、必填标记、可信度提示；所有 kind 控件共用。 */
import type { JSX, ReactNode } from 'react'
import type { RecipeSlotSchema } from '@shared/types'
import { fieldLabel } from '../fieldModel'

interface Props {
  field: RecipeSlotSchema
  children: ReactNode
  /** 次要参数行里用紧凑排布 */
  tone?: 'primary' | 'secondary' | 'extra'
  /** struct 子字段不再重复整块外框 */
  bare?: boolean
}

export function FieldShell({ field, children, tone = 'primary', bare }: Props): JSX.Element {
  const rate = field.occurrenceRate
  const label = fieldLabel(field)
  if (bare) return <div className={`field field-${tone} bare`}>{children}</div>
  return (
    <div className={`field field-${tone}`} title={field.description ?? field.key}>
      <span className="field-label">
        {label}
        {field.required ? <i className="field-required" title="必填">*</i> : null}
        {rate !== undefined && rate < 0.5 ? (
          <span className="badge field-rate" title={`该字段仅出现在 ${Math.round(rate * 100)}% 的样本里`}>
            少见
          </span>
        ) : null}
      </span>
      <div className="field-body">{children}</div>
    </div>
  )
}
