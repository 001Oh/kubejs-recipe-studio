/**
 * 次要参数一行 + 修饰符链（规格 3.4 主/次参数分层、3.6.12 ⑦修饰符）。
 * number / boolean / choice / text 一律小控件聚一行，flex-wrap 自动折行。
 */
import type { JSX } from 'react'
import type { ModifierSchema, RecipeTypeSchema } from '@shared/types'
import { bucketFields, fieldLabel } from '../fieldModel'
import { asBoolean, asNumber } from '../valueAccess'
import { useBenchStore } from '../../../store/benchStore'
import { FieldControl } from '../controls/FieldControl'

function ModifierChip({ modifier }: { modifier: ModifierSchema }): JSX.Element {
  // 修饰符只走 bench.modifiers：快照会连它一起复制，撤销/重做才是一步
  const modifiers = useBenchStore((s) => s.bench.modifiers)
  const setter = useBenchStore((s) => s.setModifier)
  const value = modifiers?.[modifier.key]

  if (modifier.kind === 'boolean') {
    const on = value === undefined ? asBoolean(modifier.defaultValue ?? false) : asBoolean(value)
    return (
      <label className="switch modifier" title={modifier.chain ? `生成时追加 .${modifier.chain}()` : '写入 JSON 字段'}>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setter(modifier.key, e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
        <span className="switch-text">{fieldLabel({ ...modifier, kind: 'text', multiple: false })}</span>
      </label>
    )
  }

  const num = value === undefined ? asNumber(modifier.defaultValue, 0) : asNumber(value, 0)
  return (
    <span className="modifier-number">
      <span className="aux">{fieldLabel({ ...modifier, kind: 'text', multiple: false })}</span>
      <input
        className="input number-input"
        type="number"
        min={modifier.min}
        max={modifier.max}
        value={num}
        onChange={(e) => setter(modifier.key, Number(e.target.value) || 0)}
      />
    </span>
  )
}

export function SecondaryPanel({ schema }: { schema: RecipeTypeSchema | null }): JSX.Element | null {
  if (!schema) return null
  const buckets = bucketFields(schema)
  const modifiers = schema.modifiers ?? []
  if (buckets.secondaries.length === 0 && modifiers.length === 0) return null

  return (
    <section className="bench-secondary">
      <h4 className="panel-title">
        次要参数
        <span className="aux">数值 / 开关 / 枚举 / 文本，与槽位同属一份字典</span>
      </h4>
      <div className="secondary-row">
        {buckets.secondaries.map((field) => (
          <FieldControl key={field.key} field={field} />
        ))}
      </div>
      {modifiers.length > 0 ? (
        <div className="modifier-row">
          <span className="aux">附加选项（修饰符链）</span>
          {modifiers.map((modifier) => (
            <ModifierChip key={modifier.key} modifier={modifier} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
