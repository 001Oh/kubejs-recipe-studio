/**
 * 写入文件对话框（规格 3.7）：通道 / 文件名 / 新建或追加 / 覆盖二次确认，
 * 写前调 codegen:checkTarget 展示 ID 冲突与生效链，失败按 EACCES/EPERM 提供另存出口。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { GenerationChannel } from '@shared/types'
import type { ScriptEntry } from '@shared/ipc'
import type { TargetCheck, WriteResult } from '@shared/ipc'
import { SCRIPT_FILE_PREFIX } from '@shared/constants'
import { call, callOrThrow, callRaw } from '../../../api'
import { useAppStore } from '../../../store/appStore'
import { useBenchStore } from '../../../store/benchStore'
import { useBenchUiStore } from '../benchUiStore'

function defaultFileName(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${SCRIPT_FILE_PREFIX}${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

const CHANNELS: { value: GenerationChannel; label: string }[] = [
  { value: 'kubejs-sugar', label: '脚本 · KubeJS 语法糖' },
  { value: 'event-custom', label: '脚本 · event.custom' },
  { value: 'datapack-json', label: '数据包 · 原生 JSON' }
]

export function WriteDialog(): JSX.Element | null {
  const open = useBenchUiStore((s) => s.writeOpen)
  const setOpen = useBenchUiStore((s) => s.setWriteOpen)
  const toast = useAppStore((s) => s.toast)
  const pushLog = useAppStore((s) => s.pushLog)
  const [channel, setChannel] = useState<GenerationChannel>('kubejs-sugar')
  const [fileName, setFileName] = useState(defaultFileName)
  const [mode, setMode] = useState<'new' | 'append'>('new')
  const [appendTo, setAppendTo] = useState<string | null>(null)
  const [scripts, setScripts] = useState<ScriptEntry[]>([])
  const [check, setCheck] = useState<TargetCheck | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WriteResult | null>(null)
  const [error, setError] = useState<{ message: string; code: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError(null)
    // U-23：通道初值必须跟随本次预览，否则 event.custom 的结果会被默认的
    // kubejs-sugar 通道拒掉（CHANNEL_UNAVAILABLE），用户得自己想到去切。
    void call('codegen:preview', { workbench: useBenchStore.getState().bench })
      .then((p) => {
        const ch = (p as { channel?: GenerationChannel } | null)?.channel
        if (ch) setChannel(ch)
      })
      .catch(() => undefined)
    void callOrThrow('scripts:list')
      .then((list) => {
        setScripts(list)
        setError(null)
      })
      .catch((err: unknown) => {
        setScripts([])
        setError({ message: `脚本列表加载失败：${err instanceof Error ? err.message : String(err)}`, code: 'SCRIPTS_LIST' })
      })
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      void call('codegen:checkTarget', { workbench: useBenchStore.getState().bench, fileName }).then((res) =>
        setCheck(res)
      )
    }, 200)
    return () => clearTimeout(t)
  }, [open, fileName, mode])

  if (!open) return null

  const exists = !!check?.fileExists
  const canWrite = !busy && (!exists || overwrite)

  const submit = async (alternateDir: string | null): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await callRaw('codegen:write', {
        workbench: useBenchStore.getState().bench,
        mode,
        fileName,
        appendTo: mode === 'append' ? appendTo : null,
        channel,
        overwriteConfirmed: overwrite,
        alternateDir
      })
      if (res.ok) {
        setResult(res.data)
        toast(res.data.message || '已写入', 'success')
        pushLog('SUCCESS', 'IO', res.data.message || '写入完成', res.data.writtenPaths.join('\n'))
        if (!res.data.backupPath) setOpen(false)
        return
      }
      const code = res.code ?? ''
      setError({ message: res.error || '写入失败', code })
      pushLog('ERROR', 'IO', `写入失败（${code || '未知错误'}）：${res.error}`)
    } catch (err) {
      // P3-22b：桥异常（preload 桥断开等）不能把 busy 卡死在「写入中…」，也不能 unhandled rejection
      const message = err instanceof Error ? err.message : String(err)
      setError({ message: `写入请求失败：${message}`, code: 'BRIDGE' })
      toast(`写入请求失败：${message}`, 'error')
      pushLog('ERROR', 'IO', `写入请求失败：${message}`)
    } finally {
      setBusy(false)
    }
  }

  const saveElsewhere = async (): Promise<void> => {
    let picked: { path: string } | null = null
    try {
      picked = (await call('app:pickDirectory', { title: '另存到其它目录（如桌面）' })) as { path: string } | null
    } catch (err) {
      // P3-22b：目录选择失败同样不冒泡，保持错误横幅可重试
      const message = err instanceof Error ? err.message : String(err)
      toast(`目录选择失败：${message}`, 'error')
      pushLog('ERROR', 'IO', `另存目录选择失败：${message}`)
      return
    }
    if (!picked?.path) return
    void submit(picked.path)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="写入文件" onClick={() => setOpen(false)}>
      <div className="modal write-modal" onClick={(e) => e.stopPropagation()}>
        <h3>写入文件</h3>
        <p className="aux">目标目录：当前整合包 kubejs/server_scripts/（不存在会自动创建）</p>

        <div className="bench-row">
          <label className="aux">通道</label>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as GenerationChannel)}>
            {CHANNELS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <label className="aux">文件名</label>
          <input className="input mono" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          <span className="aux">.js</span>
        </div>

        <div className="bench-row">
          <label className="radio">
            <input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} />
            新建脚本
          </label>
          <label className="radio">
            <input
              type="radio"
              name="mode"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
              disabled={scripts.length === 0}
            />
            追加到已有脚本
          </label>
          {mode === 'append' ? (
            <select className="input" value={appendTo ?? ''} onChange={(e) => setAppendTo(e.target.value || null)}>
              <option value="">选择文件…</option>
              {scripts.map((s) => (
                <option key={s.path} value={s.path}>
                  {s.name}（{s.order} 顺位 · {s.bytes}B）
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {check && check.recipeIdConflicts.length > 0 ? (
          <div className="inline-warn conflict">
            <p>检测到同 ID 配方，游戏内以最后注册者为准：</p>
            <ul>
              {check.recipeIdConflicts.map((c) => (
                <li key={c.recipeId} className="mono">
                  {c.recipeId} · 定义于 {c.definedBy.join(' → ')} · 生效 {c.effective}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {check?.datapackNamespaceUsed ? <p className="inline-warn">数据包 namespace 已存在，写入时会复用并加后缀</p> : null}

        {exists ? (
          <label className="switch overwrite-confirm">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-text">
              {fileName}.js 已存在 — 勾选确认覆盖（会自动备份到 .backup/）
            </span>
          </label>
        ) : null}

        {error ? (
          <div className="inline-error">
            <p>
              写入失败{error.code ? `（${error.code}）` : ''}：{error.message}
            </p>
            {/EACCES|EPERM/.test(error.code) ? (
              <div className="bench-row">
                <span className="aux">该目录不可写，可另存到桌面等位置（生成内容不变）。</span>
                <button className="btn" onClick={() => void saveElsewhere()}>
                  另存到其它目录
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="inline-ok">
            <p>{result.message}</p>
            <ul>
              {result.writtenPaths.map((p) => (
                <li key={p} className="mono aux">
                  {p}
                </li>
              ))}
              {result.backupPath ? <li className="mono aux">备份：{result.backupPath}</li> : null}
            </ul>
            <p className="aux">在游戏中执行 /reload 生效。</p>
          </div>
        ) : null}

        <footer className="modal-actions">
          <button className="btn" onClick={() => setOpen(false)}>
            关闭
          </button>
          <span className="topbar-spacer" />
          <button className="btn btn-primary" disabled={!canWrite} onClick={() => void submit(null)}>
            {busy ? '写入中…' : '写入文件'}
          </button>
        </footer>
      </div>
    </div>
  )
}
