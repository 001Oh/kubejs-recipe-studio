/**
 * 未知参数折叠区（规格 3.4 三级降级的二级形态）：
 * 已知字段照常渲染，unknown 与临时附加键统一进这里的键值编辑器。
 */
import type { JSX } from 'react'
import { bucketFields } from '../fieldModel'
import { useBenchUiStore } from '../benchUiStore'
import { useBenchStore } from '../../../store/benchStore'
import { FieldControl } from '../controls/FieldControl'
import { KeyValueEditor } from './KeyValueEditor'
import { JsonEditor } from './JsonEditor'

export function AdvancedPanel(): JSX.Element {
  const schema = useBenchUiStore((s) => s.schema)
  const open = useBenchUiStore((s) => s.advancedOpen)
  const setOpen = useBenchUiStore((s) => s.setAdvancedOpen)
  const values = useBenchStore((s) => s.bench.values)
  const setValue = useBenchStore((s) => s.setValue)
  const unknowns = bucketFields(schema).advanced
  const extras = (values['extras'] ?? {}) as Record<string, unknown>

  return (
    <section className={`bench-advanced${open ? ' open' : ''}`}>
      <button
        className="advanced-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="schema 未能识别的参数与手工附加字段"
      >
        <span className="caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        高级参数
        <span className="aux">（unknown {unknowns.length} 项 · 附加字段 {Object.keys(extras).length} 项）</span>
      </button>
      {open ? (
        <div className="advanced-body">
          {unknowns.length > 0 ? (
            <div className="advanced-unknowns">
              {unknowns.map((field) => (
                <FieldControl key={field.key} field={field} />
              ))}
            </div>
          ) : (
            <p className="aux">schema 未声明任何 unknown 字段。</p>
          )}
          <h5 className="advanced-sub">附加 JSON 字段</h5>
          <KeyValueEditor
            value={extras}
            onChange={(next) => setValue('extras', next as Record<string, unknown>)}
            suggestions={schema ? Object.keys(values).filter((k) => k !== 'extras') : undefined}
          />
          <h5 className="advanced-sub">原始 JSON（三级降级通道，永远可用）</h5>
          <JsonEditor />
        </div>
      ) : null}
    </section>
  )
}
