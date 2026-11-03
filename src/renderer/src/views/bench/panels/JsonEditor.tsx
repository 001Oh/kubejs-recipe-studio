/**
 * 原始 JSON 编辑器：三级降级的主体，且永远可用（规格 3.4「三级永远是可用的，这是底线」）。
 * 带词法着色 + 语法校验与错误定位；合法时才回填字典，避免把半成品写进生成链。
 */
import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { BenchValues } from '@shared/types'
import { useBenchStore } from '../../../store/benchStore'
import { checkJson, tokenizeJson } from '../jsonModel'
import { setKey } from '../commitOps'

const TOKEN_CLASS: Record<string, string> = {
  key: 'tk-key',
  string: 'tk-str',
  number: 'tk-num',
  literal: 'tk-lit',
  punct: 'tk-punct',
  plain: 'tk-plain'
}

/** 从当前字典种子出一份 JSON，用户不必白手起家 */
export function seedJson(values: BenchValues, typeId: string): string {
  const body: Record<string, unknown> = { type: typeId }
  for (const [key, value] of Object.entries(values)) {
    if (key === 'rawJson' || value === null || value === undefined) continue
    body[key] = value
  }
  return JSON.stringify(body, null, 2)
}

export function JsonEditor(): JSX.Element {
  const values = useBenchStore((s) => s.bench.values)
  const typeId = useBenchStore((s) => s.bench.typeId)
  const [text, setText] = useState<string>(() => seedJson(values, typeId))
  const check = useMemo(() => checkJson(text), [text])
  const lines = useMemo(() => tokenizeJson(text), [text])

  const apply = (next: string): void => {
    setText(next)
    const parsed = checkJson(next)
    // 只在合法时回填，非法时保留上一次的结构并显示错误位置
    if (parsed.ok) setKey('rawJson', parsed.value)
  }

  return (
    <div className="json-editor">
      <div className="json-editor-body">
        <pre className="json-hl" aria-hidden="true">
          {lines.map((tokens, index) => (
            <div key={index} className={check.ok || check.line !== index + 1 ? 'json-line' : 'json-line err'}>
              <span className="json-ln">{index + 1}</span>
              {tokens.map((token, i) => (
                <span key={i} className={TOKEN_CLASS[token.cls] ?? 'tk-plain'}>
                  {token.text}
                </span>
              ))}
              {tokens.length === 0 ? ' ' : null}
            </div>
          ))}
        </pre>
        <textarea
          className="json-input mono"
          value={text}
          spellCheck={false}
          onChange={(e) => apply(e.target.value)}
          aria-label="配方原始 JSON"
        />
      </div>
      <div className="json-status">
        {check.ok ? (
          <span className="ok-text">✓ JSON 合法，已同步进生成链（{Object.keys(values).length} 个字典键）</span>
        ) : (
          <span className="bad-text">
            ✗ 第 {check.line} 行第 {check.column} 列：{check.message}
          </span>
        )}
        <span className="topbar-spacer" />
        <button className="btn micro" onClick={() => apply(seedJson(values, typeId))}>
          用当前表单重建
        </button>
      </div>
    </div>
  )
}
