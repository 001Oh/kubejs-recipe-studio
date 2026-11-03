/**
 * 代码栏：严格只读，只做高亮与复制（规格 3.9.2）。生成逻辑在主进程，渲染端不拼代码。
 * 现在挂在右侧详情面板的「代码」页签里，标题由页签承担，这里只保留状态徽章与动作。
 */
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { HighlighterCore } from 'shiki/types'
import type { CodePreview } from '@shared/ipc'
import { CODE_DEBOUNCE_MS } from '@shared/constants'
import { callOrThrow } from '../api'
import { normalizeTheme, themeMeta } from '@shared/theme'
import { useAppStore } from '../store/appStore'
import { useBenchStore } from '../store/benchStore'
import { draftPreview } from '../store/draftBridge'
import { Icon } from '../components/Icon'
import './views.css'

/**
 * 用 shiki 的纯 JS 引擎（不加载 wasm），配合 CSP `default-src 'self'`，
 * 语法高亮在渲染进程离线可用。主题变化时重建 highlighter。
 */
let highlighterPromise: Promise<HighlighterCore> | null = null
let highlighterTheme = ''

async function buildHighlighter(mode: 'dark' | 'light'): Promise<HighlighterCore> {
  if (mode !== highlighterTheme) {
    highlighterTheme = mode
    highlighterPromise = null
  }
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      mode === 'light' ? import('@shikijs/themes/github-light') : import('@shikijs/themes/github-dark'),
      import('@shikijs/langs/javascript')
    ])
      .then(([core, engine, themeMod, jsMod]) =>
        core.createHighlighterCore({
          themes: [themeMod.default],
          langs: [jsMod.default],
          engine: engine.createJavaScriptRegexEngine()
        })
      )
      .catch((err: unknown) => {
        highlighterPromise = null
        throw err
      })
  }
  return highlighterPromise
}

export function CodePane(): JSX.Element {
  const bench = useBenchStore((s) => s.bench)
  // U-21（A）：试点草稿有自己的预览口径，右侧不再走 codegen:preview（通用生成器读不懂 grid）
  const pilotDraft = useBenchStore((s) => s.draft)
  const draftView = pilotDraft ? draftPreview(pilotDraft as never) : null
  const themeId = normalizeTheme(useAppStore((s) => s.ui?.theme))
  const mode = themeMeta(themeId).mode
  const toast = useAppStore((s) => s.toast)
  const [preview, setPreview] = useState<CodePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [html, setHtml] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    if (pilotDraft) {
      setPreview(null)
      setLoadError(null)
      return
    }
    const t = setTimeout(() => {
      const my = ++seq.current
      void callOrThrow('codegen:preview', { workbench: bench })
        .then((data: CodePreview) => {
          if (my !== seq.current) return
          setPreview(data)
          setLoadError(null)
        })
        .catch((err: unknown) => {
          if (my !== seq.current) return
          setPreview(null)
          setLoadError(err instanceof Error ? err.message : String(err))
        })
    }, CODE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [bench, pilotDraft])

  useEffect(() => {
    if (!preview?.code) {
      setHtml('')
      return
    }
    void buildHighlighter(mode)
      .then((h) => h.codeToHtml(preview.code, { lang: 'javascript', theme: mode === 'light' ? 'github-light' : 'github-dark' }))
      .then(setHtml)
      .catch(() => setHtml(`<pre>${escapeHtml(preview.code)}</pre>`))
  }, [preview, mode])

  return (
    <section className="codepane" aria-label="生成的 KubeJS 代码">
      <header className="code-head">
        {pilotDraft ? (
          <span className="badge badge-accent">结构化编辑</span>
        ) : preview ? (
          <span className="badge badge-accent">{channelLabel(preview.channel)}</span>
        ) : (
          <span className="subtle">暂无输出</span>
        )}
        <span className="subtle">只读预览</span>
        <span className="topbar-spacer" />
        <button
          className="btn btn-ghost btn-icon"
          disabled={!preview?.code}
          title="复制生成的代码"
          aria-label="复制代码"
          onClick={() => {
            if (!preview?.code) return
            void navigator.clipboard.writeText(preview.code).then(() => toast('代码已复制', 'success'))
          }}
        >
          <Icon name="copy" size={14} />
        </button>
      </header>
      {preview && (preview.sugarUnsupportedFields.length > 0 || preview.duplicateOf || (!!preview.code && !preview.syntaxOk) || preview.sugarUnverified || !!preview.missingAddon) ? (
        <div className="code-notes">
          {preview.sugarUnsupportedFields.length > 0 ? (
            <span className="note-warn">
              已从语法糖切换为 event.custom —— {preview.sugarUnsupportedFields.join('、')} 无法通过语法糖表达
            </span>
          ) : null}
          {preview.sugarUnverified ? <span className="note-warn">语法糖签名未在本包验证</span> : null}
          {preview.missingAddon ? <span className="note-warn">未安装 {preview.missingAddon}</span> : null}
          {preview.duplicateOf ? <span className="note-warn">与已生成配方 {preview.duplicateOf} 重复</span> : null}
          {!!preview.code && !preview.syntaxOk ? (
            <span className="note-error">
              语法错误：第 {preview.syntaxError?.line ?? '?'} 行 —— {preview.syntaxError?.message ?? 'acorn 解析失败'}
            </span>
          ) : null}
        </div>
      ) : null}
      {loadError ? (
        <div className="code-notes">
          <span className="note-error">代码预览加载失败：{loadError}</span>
        </div>
      ) : null}
      <div className="code-body">
        {pilotDraft ? (
          <div className="code-draft">
            <p className="subtle">
              结构化编辑：提交时按试点链路写入 datapack JSON（不经过下方"语法糖"生成器）。以下是草稿将写入的内容。
            </p>
            {draftView && draftView.kind !== 'unavailable' ? (
              <pre className="code-draft-pre">{draftView.text ?? JSON.stringify(draftView.json, null, 2)}</pre>
            ) : (
              <p className="subtle">草稿预览暂不可用（草稿 JSON 生成本身失败，请看下方附着预览的诊断）。</p>
            )}
          </div>
        ) : preview?.code ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : loadError ? (
          <p className="subtle">预览不可用：生成服务调用失败（不是「没有内容」）。重试或查看日志。</p>
        ) : (
          <p className="subtle">工作台还没有可生成的内容。选择配方类型并填入材料后，这里会实时显示代码。</p>
        )}
      </div>
      {preview && preview.diagnostics.length > 0 ? (
        <div className="code-notes">
          {preview.diagnostics.map((d, i) => (
            <span key={i} className={d.level === 'error' ? 'note-error' : d.level === 'warn' ? 'note-warn' : ''}>
              {d.field ? `${d.field}：` : ''}
              {d.message}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function channelLabel(channel: CodePreview['channel']): string {
  if (channel === 'kubejs-sugar') return 'KubeJS 语法糖'
  if (channel === 'datapack-json') return '数据包 JSON'
  return 'event.custom'
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c)
}
