/**
 * 顶栏：当前上下文 + 全局动作（扫描 / 导入 / 面板开关）。
 * 整合包身份信息在左侧导航栏，这里只保留"我现在在哪、能对全局做什么"。
 */
import type { JSX } from 'react'
import { useAppStore } from '../store/appStore'
import { useBenchStore } from '../store/benchStore'
import { Icon } from './Icon'

function nf(n: number | undefined | null): string {
  return typeof n === 'number' ? n.toLocaleString('zh-CN') : '—'
}

export function TopBar(): JSX.Element {
  const modpack = useAppStore((s) => s.modpack)
  const summary = useAppStore((s) => s.summary)
  const progress = useAppStore((s) => s.progress)
  const scanning = useAppStore((s) => s.scanning)
  const view = useAppStore((s) => s.view)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const selectedItemId = useAppStore((s) => s.selectedItemId)
  const ui = useAppStore((s) => s.ui)
  const patchUi = useAppStore((s) => s.patchUi)
  const pickAndImport = useAppStore((s) => s.pickAndImport)
  const startScan = useAppStore((s) => s.startScan)
  const cancelScan = useAppStore((s) => s.cancelScan)
  const benchType = useBenchStore((s) => s.bench.typeId)
  const draft = useBenchStore((s) => s.draft)

  const pct = progress ? Math.round((progress.current / Math.max(1, progress.total)) * 100) : 0
  const railCollapsed = ui?.sidebarCollapsed ?? false
  const logCollapsed = ui?.logCollapsed ?? false
  const detailCollapsed = ui?.codeCollapsed ?? false

  const context = settingsOpen
    ? '设置与诊断'
    : view === 'browse'
      ? selectedItemId ?? '未选择物品'
      : draft
        ? `编辑 ${draft.normalized.typeId}`
        : benchType

  return (
    <header className="topbar">
      {railCollapsed ? (
        <button
          className="btn btn-ghost btn-icon"
          title="展开侧栏（Ctrl+B）"
          aria-label="展开侧栏"
          onClick={() => patchUi({ sidebarCollapsed: false })}
        >
          <Icon name="panel-left" size={16} />
        </button>
      ) : null}

      <div className="topbar-crumb">
        <Icon name={settingsOpen ? 'settings' : view === 'browse' ? 'recipe' : 'bench'} size={16} />
        <strong>{settingsOpen ? '设置' : view === 'browse' ? '配方浏览' : '工作台'}</strong>
        <span className="crumb-sep" aria-hidden="true">
          /
        </span>
        <span className="crumb-context mono truncate" title={context}>
          {context}
        </span>
      </div>

      <span className="topbar-spacer" />

      {summary ? (
        <span className="topbar-stats" title="索引统计">
          <span>
            <strong>{nf(summary.items)}</strong> 物品
          </span>
          <span className="sep" />
          <span>
            <strong>{nf(summary.recipes?.total)}</strong> 配方
          </span>
          <span className="sep" />
          <span title="原版 / 模组 / KubeJS">
            {nf(summary.recipes?.vanilla)} / {nf(summary.recipes?.modded)} / {nf(summary.recipes?.kubejs)}
          </span>
        </span>
      ) : null}

      {scanning ? (
        <span className="scan-pill" aria-live="polite">
          <Icon name="refresh" size={14} className="spin" />
          <span className="truncate" title={progress?.label}>
            {progress ? `${progress.label} ${pct}%` : '正在扫描…'}
          </span>
          <button className="btn btn-ghost tiny" onClick={() => void cancelScan()}>
            取消
          </button>
        </span>
      ) : null}

      <button
        className="btn"
        onClick={() => void startScan(true)}
        disabled={scanning || !modpack}
        title="重新扫描当前整合包（丢弃索引缓存）"
      >
        <Icon name="refresh" size={14} />
        重新扫描
      </button>
      <button className="btn btn-primary" onClick={() => void pickAndImport()} title="选择整合包根目录">
        <Icon name="folder" size={14} />
        导入整合包
      </button>

      <span className="topbar-divider" />

      <button
        className={`btn btn-ghost btn-icon${detailCollapsed ? '' : ' is-on'}`}
        title={detailCollapsed ? '展开详情面板' : '收起详情面板'}
        aria-pressed={!detailCollapsed}
        aria-label="详情面板开关"
        onClick={() => patchUi({ codeCollapsed: !detailCollapsed })}
      >
        <Icon name="panel-right" size={16} />
      </button>
      <button
        className={`btn btn-ghost btn-icon${logCollapsed ? '' : ' is-on'}`}
        title={logCollapsed ? '展开日志控制台（Ctrl+L）' : '收起日志控制台（Ctrl+L）'}
        aria-pressed={!logCollapsed}
        aria-label="日志控制台开关"
        onClick={() => patchUi({ logCollapsed: !logCollapsed })}
      >
        <Icon name="terminal" size={16} />
      </button>

      {scanning ? (
        <div className="progress-track" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </header>
  )
}
