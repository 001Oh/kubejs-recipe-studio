/**
 * 日志控制台：分级着色 + 级别/来源过滤 + 关键字搜索 + 虚拟滚动 + 自动跟随 + 复制/导出（规格 3.8）。
 * 排错入口：错误计数常驻标题栏，点一下直接跳到第一条错误。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { JSX } from 'react'
import type { LogEntry, LogSource, LogLevel } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { Icon } from './Icon'
import './logdrawer.css'

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SUCCESS']
const SOURCES: LogSource[] = ['MODPACK', 'SCAN', 'INDEX', 'RECIPE', 'IO', 'UI', 'SCHEMA', 'PLUGIN']

function stamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

export function LogDrawer(): JSX.Element {
  const logs = useAppStore((s) => s.logs)
  const levelFilter = useAppStore((s) => s.levelFilter)
  const sourceFilter = useAppStore((s) => s.sourceFilter)
  const logText = useAppStore((s) => s.logText)
  const setLogText = useAppStore((s) => s.setLogText)
  const setLevelFilter = useAppStore((s) => s.setLevelFilter)
  const setSourceFilter = useAppStore((s) => s.setSourceFilter)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const exportLogs = useAppStore((s) => s.exportLogs)
  const toast = useAppStore((s) => s.toast)
  const patchUi = useAppStore((s) => s.patchUi)

  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const [following, setFollowing] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastLenRef = useRef(logs.length)

  const counts = useMemo(() => {
    const map: Record<string, number> = { ERROR: 0, WARN: 0 }
    for (const e of logs) {
      if (e.level === 'ERROR') map.ERROR += 1
      else if (e.level === 'WARN') map.WARN += 1
    }
    return map
  }, [logs])

  const filtered = useMemo(() => {
    const text = logText.trim().toLowerCase()
    return logs.filter(
      (e) =>
        levelFilter[e.level] &&
        sourceFilter[e.source] &&
        (text === '' || e.message.toLowerCase().includes(text) || e.source.toLowerCase().includes(text))
    )
  }, [logs, levelFilter, sourceFilter, logText])

  const virt = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 24
  })

  useEffect(() => {
    const delta = logs.length - lastLenRef.current
    lastLenRef.current = logs.length
    if (delta <= 0) return
    if (following) {
      virt.scrollToIndex(filtered.length - 1, { align: 'end' })
      setPendingCount(0)
    } else {
      setPendingCount((n) => n + delta)
    }
  }, [logs.length, following, filtered.length, virt])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom !== following) {
      setFollowing(atBottom)
      if (atBottom) setPendingCount(0)
    }
  }

  const copyAll = async (): Promise<void> => {
    const body = filtered.map(renderLine).join('\n')
    try {
      await navigator.clipboard.writeText(body)
      toast(`已复制 ${filtered.length} 条日志`, 'success')
    } catch {
      toast('剪贴板写入失败，请改用导出', 'warn')
    }
  }

  /** 跳到第一条错误：临时不做过滤，只滚动并展开它的详情，避免打乱用户已设的筛选 */
  const jumpToError = (): void => {
    const index = filtered.findIndex((e) => e.level === 'ERROR')
    if (index === -1) {
      toast('当前筛选下没有错误日志', 'info')
      return
    }
    setFollowing(false)
    virt.scrollToIndex(index, { align: 'center' })
    const entry = filtered[index]
    if (entry) setSelected(entry)
  }

  const activeSources = SOURCES.filter((s) => sourceFilter[s]).length

  return (
    <section className="logdrawer" aria-label="运行日志">
      <header className="log-head">
        <span className="log-title">
          <Icon name="terminal" size={14} />
          日志
        </span>
        {counts.ERROR > 0 ? (
          <button className="log-counter log-counter-error" onClick={jumpToError} title="跳到第一条错误">
            <Icon name="error" size={12} />
            {counts.ERROR}
          </button>
        ) : null}
        {counts.WARN > 0 ? (
          <span className="log-counter log-counter-warn" title="警告条数">
            <Icon name="alert" size={12} />
            {counts.WARN}
          </span>
        ) : null}

        <div className="log-levels" role="group" aria-label="日志级别过滤">
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              className={`chip chip-level level-${lvl.toLowerCase()}${levelFilter[lvl] ? ' on' : ''}`}
              aria-pressed={levelFilter[lvl]}
              onClick={() => setLevelFilter(lvl, !levelFilter[lvl])}
              title={`${levelFilter[lvl] ? '隐藏' : '显示'} ${lvl} 日志`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="field log-search-field">
          <span className="field-icon">
            <Icon name="search" size={14} />
          </span>
          <input
            className={`input has-affix${logText ? ' is-pending' : ''}`}
            placeholder="搜索日志关键字 / 来源"
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            aria-label="日志关键字搜索"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && logText) {
                e.stopPropagation()
                setLogText('')
              }
            }}
          />
          {logText ? (
            <span className="field-affix">
              <button className="input-clear" aria-label="清除日志搜索" onClick={() => setLogText('')}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ) : null}
        </div>

        <button className={`btn btn-sm${sourcesOpen ? ' is-open' : ''}`} onClick={() => setSourcesOpen((v) => !v)} aria-expanded={sourcesOpen}>
          <Icon name="filter" size={14} />
          来源 {activeSources < SOURCES.length ? `${activeSources}/${SOURCES.length}` : ''}
          <Icon name={sourcesOpen ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>

        <span className="topbar-spacer" />

        <button className="btn btn-ghost btn-icon" onClick={() => void copyAll()} title="复制当前筛选结果" aria-label="复制全部">
          <Icon name="copy" size={14} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={() => void exportLogs()} title="导出到文件" aria-label="导出到文件">
          <Icon name="export" size={14} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={clearLogs} title="清空日志缓冲区" aria-label="清空">
          <Icon name="trash" size={14} />
        </button>
        <button className="btn btn-ghost btn-icon" title="收起日志控制台（Ctrl+L）" aria-label="收起日志" onClick={() => patchUi({ logCollapsed: true })}>
          <Icon name="chevron-down" size={14} />
        </button>
      </header>

      {sourcesOpen && (
        <div className="log-sources">
          <span className="section-label">来源</span>
          {SOURCES.map((src) => (
            <button
              key={src}
              className={`chip${sourceFilter[src] ? ' on' : ''}`}
              aria-pressed={sourceFilter[src]}
              onClick={() => setSourceFilter(src, !sourceFilter[src])}
            >
              {src}
            </button>
          ))}
        </div>
      )}

      <div className="log-body" ref={scrollRef} onScroll={onScroll} role="log" aria-label="日志内容">
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((row) => {
            const entry = filtered[row.index]
            if (!entry) return null
            const isOpen = selected !== null && selected.ts === entry.ts && selected.message === entry.message
            return (
              <div
                key={`${entry.ts}-${row.index}`}
                className={`log-row level-row-${entry.level.toLowerCase()}${isOpen ? ' selected' : ''}`}
                style={{ position: 'absolute', top: row.start, height: row.size, left: 0, right: 0 }}
                onClick={() => setSelected(isOpen ? null : entry)}
                title={entry.detail ? '点击展开详情' : entry.message}
              >
                <span className="log-ts mono">{stamp(entry.ts)}</span>
                <span className={`log-level level-${entry.level.toLowerCase()}`}>{entry.level}</span>
                <span className="log-source">{entry.source}</span>
                <span className="log-msg">{entry.message}</span>
                {entry.detail ? (
                  <span className="log-plus" aria-hidden="true">
                    <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {selected?.detail ? (
        <div className="log-detail-wrap">
          <div className="log-detail-head">
            <span className="section-label">详情</span>
            <span className="subtle mono">{stamp(selected.ts)}</span>
            <span className="topbar-spacer" />
            <button className="btn btn-ghost btn-icon" aria-label="关闭详情" title="关闭详情" onClick={() => setSelected(null)}>
              <Icon name="close" size={12} />
            </button>
          </div>
          <pre className="log-detail mono">{selected.detail}</pre>
        </div>
      ) : null}

      {!following && pendingCount > 0 ? (
        <button
          className="log-jump"
          onClick={() => {
            setFollowing(true)
            setPendingCount(0)
            virt.scrollToIndex(filtered.length - 1, { align: 'end' })
          }}
        >
          ↓ {pendingCount} 条新日志
        </button>
      ) : null}

      <footer className="statusbar">
        <span>
          {filtered.length.toLocaleString('zh-CN')} / {logs.length.toLocaleString('zh-CN')} 条
        </span>
        <span className="sep" />
        <span>{following ? '自动跟随最新' : '已暂停跟随'}</span>
        <span className="topbar-spacer" />
        <span className="subtle">上限 5000（超出丢最旧 DEBUG）</span>
      </footer>
    </section>
  )
}

function renderLine(e: LogEntry): string {
  return `${stamp(e.ts)}  ${e.level.padEnd(7)} ${e.source.padEnd(7)} ${e.message}${e.detail ? `\n${e.detail}` : ''}`
}
