/**
 * 前置条件摘要条（规格 3.6.13）：仪式 / 祭坛 / 多结构类配方把「配方数据之外的摆放要求」先说清楚。
 * 内容全部来自 schema（requirements 声明 + role='requirement' 字段的当前值），不按配方类型写死。
 */
import type { JSX } from 'react'
import { useBenchStore } from '../../../store/benchStore'
import { requirementItems } from '../fieldModel'
import { useBenchUiStore } from '../benchUiStore'

export function RequirementsBar(): JSX.Element | null {
  const schema = useBenchUiStore((s) => s.schema)
  const values = useBenchStore((s) => s.bench.values)
  const items = requirementItems(schema, values)
  const notes = schema?.notes ?? []
  if (items.length === 0 && notes.length === 0) return null

  return (
    <div className="req-bar" role="note" aria-label="前置条件">
      <span className="req-icon" aria-hidden="true">
        ⚠
      </span>
      <span className="req-lead">{schema?.displayName ?? '该配方'}需要：</span>
      {items.map((item, index) => (
        <span key={`${item.kind}-${index}`} className={`req-chip kind-${item.kind}`}>
          {item.text}
        </span>
      ))}
      {notes.map((note, index) => (
        <span key={`note-${index}`} className="req-chip kind-note">
          {note}
        </span>
      ))}
    </div>
  )
}
