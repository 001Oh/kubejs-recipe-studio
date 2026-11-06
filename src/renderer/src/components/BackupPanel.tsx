/**
 * B129/D-57：配方备份恢复面板（设置页内嵌）。
 *
 * 三步：列出 → 预览（dryRun 并排）→ 确认恢复。
 * 恢复会覆盖当前文件，原内容自动备份为撤销点——按钮旁有明示。
 */
import { useState, useCallback } from 'react'
import type { JSX } from 'react'

interface Entry {
  file: string
  target: string
  atMs: number
  bytes: number
  sha256: string
  exists: boolean
}

interface RestoreResult {
  target: string
  before: string
  after: string | null
  undoBackup: string | null
  dryRun: boolean
  restored: boolean
}

export function BackupPanel(): JSX.Element {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RestoreResult | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    setRestoreResult(null)
    const res = await window.studio.invoke('backup:list', undefined)
    setLoading(false)
    if (res.ok) setEntries(res.data.entries)
    else setError(res.error)
  }, [])

  const doPreview = useCallback(async (file: string) => {
    setError(null)
    const res = await window.studio.invoke('backup:restore', { backupFile: file, dryRun: true })
    if (res.ok) setPreview(res.data as RestoreResult)
    else setError(res.error)
  }, [])

  const doRestore = useCallback(async (file: string) => {
    setError(null)
    const res = await window.studio.invoke('backup:restore', { backupFile: file })
    if (res.ok) {
      setRestoreResult(res.data as RestoreResult)
      setPreview(null)
    } else {
      setError(res.error)
    }
  }, [])

  const fmtTime = (atMs: number): string => {
    const d = new Date(atMs)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const fmtBytes = (b: number): string => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`)

  return (
    <section className="set-card" data-testid="backup-panel">
      <header className="set-head">
        <h3>配方备份</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? '读取中…' : '刷新备份列表'}
        </button>
      </header>
      {error ? <p className="settings-hint note-error">{error}</p> : null}
      {entries === null && !loading ? (
        <p className="settings-hint">点击「刷新备份列表」查看当前整合包的配方备份。</p>
      ) : null}
      {entries !== null && entries.length === 0 ? (
        <p className="settings-hint">当前整合包暂无配方备份（提交配方覆盖原文件时会自动创建）。</p>
      ) : null}
      {entries !== null && entries.length > 0 ? (
        <div className="backup-list">
          {entries.map((entry, i) => (
            <div key={entry.file + String(i)} className="backup-entry" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="mono" style={{ fontSize: 12 }}>
                {entry.target.split(/[\\/]/).pop()} · {fmtTime(entry.atMs)} · {fmtBytes(entry.bytes)}
                {!entry.exists ? ' · 原文件已删除' : ''}
              </span>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void doPreview(entry.file)}
                  title="预览恢复前后的差异（只读，不写盘）"
                >
                  预览
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void doRestore(entry.file)}
                  title="恢复会覆盖当前文件，原内容会自动备份为撤销点"
                >
                  恢复
                </button>
              </div>
              {preview && preview.target === entry.target ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <p className="aux" style={{ margin: '4px 0' }}>恢复后（备份内容）</p>
                    <pre className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: 'var(--bg-surface)', padding: 8, borderRadius: 4 }}>
                      {preview.before}
                    </pre>
                  </div>
                  <div>
                    <p className="aux" style={{ margin: '4px 0' }}>当前内容</p>
                    <pre className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: 'var(--bg-surface)', padding: 8, borderRadius: 4 }}>
                      {preview.after || '（文件不存在）'}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {restoreResult ? (
        <p className="settings-hint" style={{ marginTop: 8, color: 'var(--accent)' }}>
          已恢复到 {restoreResult.target}
          {restoreResult.undoBackup ? `（撤销点：${restoreResult.undoBackup.split(/[\\/]/).pop()}）` : ''}
        </p>
      ) : null}
      <p className="aux" style={{ marginTop: 8 }}>
        恢复会覆盖当前文件，原内容会自动备份为撤销点。
      </p>
    </section>
  )
}
