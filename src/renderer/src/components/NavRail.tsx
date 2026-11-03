/**
 * 左侧导航栏：品牌 / 当前整合包 / 全局导航 / 物品查找入口。
 * 只负责"去哪儿"和"我在哪个包里"，不承担任何编辑动作（规格 3.9.2）。
 * 导航按钮的文字必须保持「配方浏览」「工作台」「设置与诊断」三个纯文本标签：
 * P-C7 端到端脚本按 `.view-tabs button` 的 textContent 定位导航项。
 */
import { useState, type JSX } from 'react'
import { Icon } from './Icon'
import { Sidebar } from '../views/Sidebar'
import { useAppStore } from '../store/appStore'
import { callOrThrow } from '../api'
import { nextTheme, normalizeTheme, themeMeta } from '@shared/theme'

function nf(n: number | undefined | null): string {
  return typeof n === 'number' ? n.toLocaleString('zh-CN') : '—'
}

export function NavRail(): JSX.Element {
  const modpack = useAppStore((s) => s.modpack)
  const summary = useAppStore((s) => s.summary)
  const runtime = useAppStore((s) => s.runtime)
  const scanning = useAppStore((s) => s.scanning)
  const progress = useAppStore((s) => s.progress)
  const view = useAppStore((s) => s.view)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const patchUi = useAppStore((s) => s.patchUi)
  const ui = useAppStore((s) => s.ui)
  const setView = useAppStore((s) => s.setView)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const pickAndImport = useAppStore((s) => s.pickAndImport)
  const setModpack = useAppStore((s) => s.setModpack)
  // U-17：两步内联确认（不用 window.confirm）
  const [confirmClear, setConfirmClear] = useState(false)

  const pct = progress ? Math.round((progress.current / Math.max(1, progress.total)) * 100) : 0
  const ready = !!summary

  return (
    <aside className="pane rail" aria-label="导航与整合包信息">
      <header className="rail-head">
        <span className="brand-mark" aria-hidden="true">
          <Icon name="logo" size={18} />
        </span>
        <span className="brand-copy">
          <strong>KubeJS</strong>
          <span>Recipe Studio</span>
        </span>
        {runtime?.appVersion ? <span className="badge rail-ver">v{runtime.appVersion}</span> : null}
        <button
          className="btn btn-ghost btn-icon rail-collapse"
          title="收起侧栏（Ctrl+B）"
          aria-label="收起侧栏"
          onClick={() => patchUi({ sidebarCollapsed: true })}
        >
          <Icon name="panel-left" size={16} />
        </button>
      </header>

      <section className={`modpack-card${modpack ? '' : ' is-empty'}`} aria-label="当前整合包">
        <div className="modpack-card-head">
          <span className="section-label">当前整合包</span>
          <button className="btn btn-ghost tiny" onClick={() => void pickAndImport()} title="选择整合包根目录">
            <Icon name="folder" size={14} />
            切换
          </button>
          {modpack ? (
            <button
              className="btn btn-ghost tiny"
              title="只清除当前包状态与索引；包目录、缓存与备份都会保留"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true)
                  window.setTimeout(() => setConfirmClear(false), 3000)
                  return
                }
                setConfirmClear(false)
                void (async () => {
                  try {
                    await callOrThrow('modpack:clear')
                    setModpack(null)
                    useAppStore.setState({ summary: null, scanning: false, progress: null })
                    useAppStore.getState().pushLog('INFO', 'MODPACK', '已卸载整合包（缓存与备份保留）')
                  } catch (err) {
                    useAppStore.getState().pushLog('ERROR', 'MODPACK', `卸载失败：${err instanceof Error ? err.message : String(err)}`)
                  }
                })()
              }}
            >
              {confirmClear ? '确认卸载？' : '卸载'}
            </button>
          ) : null}
        </div>
        {modpack ? (
          <>
            <div className="modpack-name" title={`${modpack.name}\n${modpack.path}`}>
              {modpack.name}
            </div>
            <div className="modpack-meta">
              <span className="badge">{modpack.mcVersion ? `MC ${modpack.mcVersion}` : 'MC 版本未知'}</span>
              <span className="badge">{modpack.loader ? modpack.loader.toUpperCase() : '加载器未知'}</span>
              <span className={`badge${modpack.kubejsVersion ? '' : ' badge-warn'}`}>
                {modpack.kubejsVersion ? `KJS ${modpack.kubejsVersion}` : '未装 KubeJS'}
              </span>
            </div>
            <div className="modpack-stats">
              <span title="模组数量">
                <strong>{nf(modpack.modCount)}</strong> mods
              </span>
              <span className="sep" />
              <span title="索引物品数">
                <strong>{nf(summary?.items)}</strong> 物品
              </span>
              <span className="sep" />
              <span title="索引配方数">
                <strong>{nf(summary?.recipes?.total)}</strong> 配方
              </span>
            </div>
            <div className="modpack-status" aria-live="polite">
              {scanning ? (
                <>
                  <Icon name="refresh" size={14} className="spin" />
                  <span className="truncate">{progress ? `${progress.label} ${pct}%` : '正在扫描…'}</span>
                </>
              ) : ready ? (
                <>
                  <span className="dot dot-ok" aria-hidden="true" />
                  <span className="truncate">
                    索引就绪 · {((summary?.itemElapsedMs ?? 0) / 1000).toFixed(1)}s
                    {summary?.recipes?.partial ? ` · ${summary.recipes.partial} 条部分解析` : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="dot dot-warn" aria-hidden="true" />
                  <span className="truncate">索引尚未建立</span>
                </>
              )}
            </div>
            {scanning ? (
              <div className="rail-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="modpack-empty">
            <p>尚未导入整合包</p>
            <button className="btn btn-primary tiny" onClick={() => void pickAndImport()}>
              <Icon name="folder" size={14} />
              选择目录
            </button>
          </div>
        )}
      </section>

      <nav className="nav view-tabs" role="tablist" aria-label="主导航">
        <button
          role="tab"
          aria-selected={view === 'browse' && !settingsOpen}
          className={`view-tab${view === 'browse' && !settingsOpen ? ' active' : ''}`}
          onClick={() => setView('browse')}
        >
          <Icon name="recipe" size={16} />
          配方浏览
        </button>
        <button
          role="tab"
          aria-selected={view === 'bench' && !settingsOpen}
          className={`view-tab${view === 'bench' && !settingsOpen ? ' active' : ''}`}
          onClick={() => setView('bench')}
        >
          <Icon name="bench" size={16} />
          工作台
        </button>
        <button
          role="tab"
          aria-selected={settingsOpen}
          className={`view-tab${settingsOpen ? ' active' : ''}`}
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" size={16} />
          设置与诊断
        </button>
      </nav>

      <Sidebar />

      <footer className="rail-foot">
        <button
          className="btn btn-ghost tiny"
          title={`当前主题：${themeMeta(normalizeTheme(ui?.theme)).label}（点击切换到下一套）`}
          aria-label="切换界面主题"
          onClick={() => patchUi({ theme: nextTheme(normalizeTheme(ui?.theme)) })}
        >
          <Icon name="sparkle" size={14} />
          {themeMeta(normalizeTheme(ui?.theme)).label}
        </button>
        <span className="topbar-spacer" />
        <button className="btn btn-ghost tiny" title="快捷键：Ctrl+F 搜索物品" onClick={() => window.dispatchEvent(new CustomEvent('studio:focus-search'))}>
          <Icon name="search" size={14} />
          <span className="kbd">Ctrl F</span>
        </button>
      </footer>
    </aside>
  )
}
