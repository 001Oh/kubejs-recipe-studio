/**
 * 桌面工作台外壳（UI-REDESIGN-1）：
 *   左：导航与整合包信息 + 物品查找
 *   中：当前视图（配方浏览 / 工作台 / 设置）
 *   右：详情面板（配方档案 / 生成代码）
 *   下：日志控制台
 * 布局只做容器，业务状态全部来自既有 store。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { NavRail } from './components/NavRail'
import { BrowseView } from './views/BrowseView'
import { BenchView } from './views/BenchView'
import { SettingsView } from './views/SettingsView'
import { DetailPanel } from './components/DetailPanel'
import { LogDrawer } from './components/LogDrawer'
import { TopBar } from './components/TopBar'
import { BannerBar } from './components/BannerBar'
import { Toaster } from './components/Toaster'
import { CandidateModal } from './components/CandidateModal'
import { Splitter } from './components/Splitter'
import { DndLayer } from './components/DndLayer'
import { Icon } from './components/Icon'
import { ItemPreview } from './components/ItemPreview'
import { useShortcuts } from './hooks/useShortcuts'
import { useAppStore } from './store/appStore'

export function App(): JSX.Element {
  const ui = useAppStore((s) => s.ui)
  const ready = useAppStore((s) => s.ready)
  const view = useAppStore((s) => s.view)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const logs = useAppStore((s) => s.logs)
  const patchUi = useAppStore((s) => s.patchUi)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })

  useShortcuts()

  useEffect(() => {
    const onResize = (): void => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!ui) return
    // <1024：侧栏默认收起，用顶栏按钮唤出（规格 3.9.7）
    if (viewport.w < 1024 && !ui.sidebarCollapsed) patchUi({ sidebarCollapsed: true })
  }, [viewport.w, ui, patchUi])

  if (!ready || !ui) {
    return (
      <div className="shell shell--rail-hidden">
        <div className="main">
          <div className="boot">
            <span className="boot-mark">
              <Icon name="logo" size={20} />
            </span>
            <strong>KubeJS Recipe Studio</strong>
            <p className="aux">正在读取上次的整合包与界面状态…</p>
          </div>
        </div>
      </div>
    )
  }

  const railHidden = ui.sidebarCollapsed
  // 右侧面板宽度：窗口越窄上限越低，但始终不低于可用的最小宽度
  const detailCap = viewport.w >= 1440 ? 560 : viewport.w >= 1200 ? 340 : 300
  const detailWidth = Math.min(ui.codeWidth, detailCap)
  const lastLog = logs.at(-1)
  const errorCount = logs.reduce((n, e) => (e.level === 'ERROR' ? n + 1 : n), 0)
  const warnCount = logs.reduce((n, e) => (e.level === 'WARN' ? n + 1 : n), 0)

  return (
    <div className={`shell${railHidden ? ' shell--rail-hidden' : ''}${ui.logCollapsed ? ' shell--log-collapsed' : ''}`}>
      {/* U-26：DndContext 必须包住整个 shell——拖拽源在左栏（Sidebar 的 useDraggable），
          落点在中栏（ItemSlot 的 useDroppable）。此前 DndLayer 只包住中间内容区，
          侧栏的拖拽监听拿到的是空上下文（dnd-kit 静默降级），拖拽从未启动。 */}
      <DndLayer>
      {!railHidden ? (
        <>
          <div className="pane rail-pane" style={{ width: ui.sidebarWidth }}>
            <NavRail />
          </div>
          <Splitter
            axis="x"
            size={ui.sidebarWidth}
            min={248}
            max={520}
            onCommit={(next) => patchUi({ sidebarWidth: next })}
          />
        </>
      ) : null}

      <div className="main">
        <TopBar />
        <BannerBar />
          <div className="work">
            <div className="pane pane-center">
              {settingsOpen ? <SettingsView /> : view === 'browse' ? <BrowseView /> : <BenchView />}
            </div>
            {settingsOpen ? null : ui.codeCollapsed ? (
              <button
                className="edge-tab edge-tab-right"
                title="展开详情面板"
                onClick={() => patchUi({ codeCollapsed: false })}
              >
                <Icon name="chevron-left" size={14} />
                详情
              </button>
            ) : (
              <>
                <Splitter
                  axis="x"
                  size={detailWidth}
                  min={288}
                  max={560}
                  side="right"
                  onCommit={(next) => patchUi({ codeWidth: next })}
                />
                <div className="pane detail-pane" style={{ width: detailWidth }}>
                  <DetailPanel />
                </div>
              </>
            )}
          </div>
      </div>
      </DndLayer>

      {ui.logCollapsed ? (
        <div className="logzone logzone-collapsed">
          <button className="log-strip-toggle" onClick={() => patchUi({ logCollapsed: false })}>
            <Icon name="terminal" size={14} />
            日志
            <Icon name="chevron-up" size={12} />
          </button>
          {errorCount > 0 ? (
            <span className="log-pill log-pill-error" title="错误条数">
              <Icon name="error" size={12} />
              {errorCount}
            </span>
          ) : null}
          {warnCount > 0 ? (
            <span className="log-pill log-pill-warn" title="警告条数">
              <Icon name="alert" size={12} />
              {warnCount}
            </span>
          ) : null}
          <span className={`log-strip-text aux${lastLog?.level === 'ERROR' ? ' is-error' : ''}`}>
            {lastLog ? `${lastLog.message}` : '暂无日志'}
          </span>
          <span className="topbar-spacer" />
          <span className="subtle mono">{logs.length}</span>
        </div>
      ) : (
        <div className="logzone" style={{ height: ui.logHeight + 5 }}>
          <Splitter
            axis="y"
            size={ui.logHeight}
            min={120}
            max={500}
            onCommit={(next) => patchUi({ logHeight: next })}
          />
          <div className="pane" style={{ height: ui.logHeight }}>
            <LogDrawer />
          </div>
        </div>
      )}

      <Toaster />
      {/* T-26 / UI-U3：物品预览浮窗（全局唯一实例，删除此行即完全回退） */}
      <ItemPreview />
      <CandidateModal />
    </div>
  )
}
