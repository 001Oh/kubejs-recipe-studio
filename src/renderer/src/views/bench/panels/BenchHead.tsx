/**
 * 工作台抬头：配方类型选择器 + schema 元信息 + 降级提示（规格 3.4 三级降级、3.6.8 通用通道）。
 */
import type { JSX } from 'react'
import { useBenchStore } from '../../../store/benchStore'
import { GENERIC_TYPE_ID, useBenchUiStore } from '../benchUiStore'
import { degradeOf } from '../fieldModel'
import { TypeSelect } from './TypeSelect'

const CHANNEL_LABEL: Record<string, string> = {
  'kubejs-sugar': 'KubeJS 语法糖',
  'event-custom': 'event.custom',
  'datapack-json': '数据包 JSON'
}

const DEGRADE_TEXT: Record<string, string> = {
  full: '一级 · schema 完整，标准表单',
  partial: '二级 · 部分字段未识别，已折叠进高级参数',
  json: '三级 · 无法解析参数形态，已启用原始 JSON 编辑'
}

export function BenchHead(): JSX.Element {
  const schema = useBenchUiStore((s) => s.schema)
  const loading = useBenchUiStore((s) => s.schemaLoading)
  const typeId = useBenchStore((s) => s.bench.typeId)
  const pinCurrent = useBenchUiStore((s) => s.pinCurrent)
  const unpinCurrent = useBenchUiStore((s) => s.unpinCurrent)
  const level = degradeOf(schema)
  const isGeneric = typeId === GENERIC_TYPE_ID

  return (
    <header className="bench-head">
      <TypeSelect />
      <span className="topbar-spacer" />
      <span className={`badge degrade-${level}`}>{DEGRADE_TEXT[level]}</span>
      {schema ? (
        <span className="badge">{CHANNEL_LABEL[schema.channel] ?? schema.channel}</span>
      ) : isGeneric ? (
        <span className="badge">event.custom / 数据包</span>
      ) : null}
      {schema ? (
        <>
          <span className="aux mono" title={schema.emitTarget ?? undefined}>
            {schema.id}
          </span>
          {schema.source === 'inferred' && schema.sampleCount ? (
            <span className="badge">基于 {schema.sampleCount} 个真实配方归纳</span>
          ) : null}
          {schema.lowConfidence ? <span className="badge cap-warn">低可信度</span> : null}
          {schema.pinned ? (
            <button className="btn micro" onClick={() => void unpinCurrent()}>
              取消钉住
            </button>
          ) : (
            <button className="btn micro" onClick={() => void pinCurrent()} title="把当前 schema 固化，避免反推漂移">
              钉住此类型
            </button>
          )}
          {schema.docUrl ? (
            <a className="aux link" href={schema.docUrl} title={schema.docUrl}>
              文档
            </a>
          ) : null}
        </>
      ) : null}
      {loading ? <span className="aux">读取 schema…</span> : null}
    </header>
  )
}
