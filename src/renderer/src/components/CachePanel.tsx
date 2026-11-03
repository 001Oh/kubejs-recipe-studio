/**
 * T-27：设置页「存储与缓存」区块。
 *
 * 设计取舍：
 * - 统计走 `cache:stat`（主进程遍历，异步）→ 先「统计中…」再回填，不阻塞渲染；
 * - 进度不新增事件通道：清理开始时记下起始文件数，**轮询 `cache:stat`** 显示"已减少 N 个"，
 *   这是真实递减量而不是假进度条；
 * - 主进程已有并发单例，UI 侧再做一层 `running` 防抖。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { call, callOrThrow } from '../api'
import { useAppStore } from '../store/appStore'

type Kind = 'index' | 'icons' | 'browser' | 'temp' | 'logs'

interface StatRow {
  kind: Kind
  files: number
  bytes: number
}

const ROWS: { kind: Kind; label: string; hint?: string; defaultOn: boolean }[] = [
  { kind: 'index', label: '索引缓存', defaultOn: true },
  { kind: 'icons', label: '图标缓存', defaultOn: true },
  { kind: 'browser', label: '浏览器缓存', defaultOn: true },
  { kind: 'temp', label: '临时文件', defaultOn: true },
  { kind: 'logs', label: '日志文件', hint: '当前正在写的日志会跳过', defaultOn: false }
]

function fmtBytes(n: number): string {
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

export function CachePanel(): JSX.Element {
  const toast = useAppStore((s) => s.pushLog)
  // 扫描中禁止清理：扫描会持续写/读这些目录，边扫边清既慢又可能让本次扫描读到缺文件
  const scanning = useAppStore((s) => s.scanning)
  const [expanded, setExpanded] = useState(false)
  const [stats, setStats] = useState<StatRow[] | null>(null)
  const [backup, setBackup] = useState<{ files: number; bytes: number } | null>(null)
  const [checking, setChecking] = useState<boolean>(false)
  const [checked, setChecked] = useState<Set<Kind>>(new Set(['index', 'icons', 'browser', 'temp']))
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [removedSoFar, setRemovedSoFar] = useState(0)
  const [result, setResult] = useState<{ removed: number; failed: number; bytes: number } | null>(null)
  const baseTotal = useRef(0)

  const loadStats = useCallback(async () => {
    setChecking(true)
    try {
      const res = await callOrThrow('cache:stat')
      setStats(res.rows as StatRow[])
      setBackup(res.backup)
    } catch {
      setStats([])
      setBackup(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (expanded && !stats) void loadStats()
  }, [expanded, stats, loadStats])

  const totalFiles = (stats ?? []).filter((r) => checked.has(r.kind)).reduce((s, r) => s + r.files, 0)
  const totalBytes = (stats ?? []).filter((r) => checked.has(r.kind)).reduce((s, r) => s + r.bytes, 0)

  const startClear = async (): Promise<void> => {
    if (running) return
    setConfirming(false)
    setRunning(true)
    setResult(null)
    setRemovedSoFar(0)
    baseTotal.current = totalFiles
    // 轮询统计：用剩余文件数反推已删数量（真实递减，不是假进度）
    const timer = window.setInterval(() => {
      void call('cache:stat').then((res) => {
        if (!res) return
        const left = (res.rows as StatRow[]).filter((r) => checked.has(r.kind)).reduce((s, r) => s + r.files, 0)
        setRemovedSoFar(Math.max(0, baseTotal.current - left))
      })
    }, 800)
    try {
      const res = await callOrThrow('cache:clear', { kinds: [...checked] })
      setResult(res)
      toast('INFO', 'IO', `已清理 ${res.removed} 个文件（${fmtBytes(res.bytes)}）`)
    } catch (err) {
      toast('ERROR', 'IO', `清理失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      window.clearInterval(timer)
      setRunning(false)
      setStats(null)
      void loadStats()
    }
  }

  const impact: string[] = []
  if (result) {
    if (checked.has('index')) impact.push('下次浏览/工作台会重新扫描（约 40–60 秒）')
    if (checked.has('icons')) impact.push('图标将在下次扫描时重新生成')
    if (result.failed > 0) impact.push(`${result.failed} 个文件被占用，未能删除（重启后可再试）`)
  }

  return (
    <section className="set-card">
      <header className="set-head">
        <Icon name="info" size={14} />
        <h3>存储与缓存</h3>
      </header>
      <p className="settings-hint">清理可重新生成的缓存文件；您的配方备份与设置不会被删除。</p>

      {!expanded ? (
        <div className="settings-row">
          <button className="btn btn-sm" onClick={() => setExpanded(true)}>
            清理缓存…
          </button>
        </div>
      ) : (
        <div className="cache-panel">
          {ROWS.map((row) => {
            const st = stats?.find((r) => r.kind === row.kind)
            return (
              <label key={row.kind} className="cache-row">
                <input
                  type="checkbox"
                  checked={checked.has(row.kind)}
                  disabled={running}
                  onChange={(e) => {
                    const next = new Set(checked)
                    if (e.target.checked) next.add(row.kind)
                    else next.delete(row.kind)
                    setChecked(next)
                  }}
                />
                <span className="cache-row-label">{row.label}</span>
                <span className="cache-row-stat mono">
                  {checking || !st ? '统计中…' : `${fmtBytes(st.bytes)} · ${st.files.toLocaleString('zh-CN')} 个文件`}
                </span>
                {row.hint ? <span className="cache-row-hint">{row.hint}</span> : null}
              </label>
            )
          })}

          <div className="cache-row cache-row-locked" aria-disabled="true">
            <Icon name="save" size={12} />
            <span className="cache-row-label">配方备份（不参与清理）</span>
            <span className="cache-row-stat mono">
              {!backup ? '统计中…' : `共 ${backup.files} 份 · ${fmtBytes(backup.bytes)}`}
            </span>
          </div>

          {running ? (
            <div className="cache-progress">
              <div className="cache-progress-text mono">
                正在清理：已删 {removedSoFar.toLocaleString('zh-CN')} / {baseTotal.current.toLocaleString('zh-CN')}
              </div>
              <div className="cache-progress-bar">
                <div
                  className="cache-progress-fill"
                  style={{ width: `${baseTotal.current === 0 ? 100 : Math.min(100, (removedSoFar / baseTotal.current) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="cache-result">
              <span className="note-ok">
                已清理 {result.removed} 个文件（{fmtBytes(result.bytes)}）
              </span>
              {impact.length > 0 ? (
                <ul className="cache-impact">
                  {impact.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {scanning ? <p className="settings-hint note-error">扫描进行中，暂时不能清理缓存。请等扫描结束后再试。</p> : null}

          <div className="cache-actions">
            <button className="btn btn-ghost btn-sm" disabled={running} onClick={() => setExpanded(false)}>
              取消
            </button>
            <button
              className="btn btn-sm"
              disabled={running || checking || scanning || totalFiles === 0}
              title={scanning ? '扫描进行中，请稍后' : undefined}
              onClick={() => setConfirming(true)}
            >
              {running ? '清理中…' : scanning ? '扫描进行中…' : '开始清理'}
            </button>
          </div>

          {confirming ? (
            <div className="cache-confirm" role="dialog" aria-label="确认清理缓存">
              <p>
                将删除 {totalFiles.toLocaleString('zh-CN')} 个文件（约 {fmtBytes(totalBytes)}）。
                下次扫描会自动重建缓存。配方备份与您的设置不受影响。
              </p>
              <div className="cache-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                  取消
                </button>
                <button className="btn btn-sm" onClick={() => void startClear()}>
                  确认清理
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
