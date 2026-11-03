/** 命中片段高亮（黄色下划线，规格 3.3）。范围由主进程按字段计算，前端只做切片渲染。 */
import type { JSX } from 'react'
import type { HighlightRange } from '@shared/types'

interface Props {
  text: string
  ranges: HighlightRange[]
  field: HighlightRange['field']
}

export function Highlight({ text, ranges, field }: Props): JSX.Element {
  const hits = ranges.filter((r) => r.field === field && r.end > r.start).sort((a, b) => a.start - b.start)
  if (hits.length === 0) return <>{text}</>
  const parts: JSX.Element[] = []
  let cursor = 0
  hits.forEach((r, i) => {
    const start = Math.max(cursor, Math.min(r.start, text.length))
    const end = Math.max(start, Math.min(r.end, text.length))
    if (start > cursor) parts.push(<span key={`p${i}a`}>{text.slice(cursor, start)}</span>)
    parts.push(
      <span key={`p${i}b`} className="hl">
        {text.slice(start, end)}
      </span>
    )
    cursor = end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <>{parts}</>
}
