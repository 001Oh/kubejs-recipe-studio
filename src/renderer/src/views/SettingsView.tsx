/**
 * 设置与诊断：外观、生成偏好、覆盖率自检、附属模组、插件、脚本执行顺序、运行环境。
 * 这里的开关（含试点白名单）直接写 uiState，属于既有 UI 契约，语义未改动。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { CoverageReport, PluginManifest } from '@shared/types'
import type { PluginLoadState, ScriptEntry } from '@shared/ipc'
import { call, callOrThrow } from '../api'
import { useAppStore } from '../store/appStore'
import { Icon } from '../components/Icon'
import { CachePanel } from '../components/CachePanel'
import { THEMES, THEME_LIST } from '@shared/theme'
import './views.css'

export function SettingsView(): JSX.Element {
  const ui = useAppStore((s) => s.ui)
  const patchUi = useAppStore((s) => s.patchUi)
  const modpack = useAppStore((s) => s.modpack)
  const runtime = useAppStore((s) => s.runtime)
  const pushLog = useAppStore((s) => s.pushLog)
  const toast = useAppStore((s) => s.toast)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const [coverage, setCoverage] = useState<CoverageReport | null>(null)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [pluginError, setPluginError] = useState<string | null>(null)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [plugins, setPlugins] = useState<PluginManifest[]>([])
  const [pluginStatus, setPluginStatus] = useState<PluginLoadState | null>(null)
  const [scripts, setScripts] = useState<ScriptEntry[]>([])
  // 第 6 条：上次整合包恢复失败 → 横幅（此前只有日志，界面上看不到）
  const [restoreIssue, setRestoreIssue] = useState<string | null>(null)

  useEffect(() => {
    void callOrThrow('app:runtime')
      .then((rt) => setRestoreIssue((rt as { modpackRestoreIssue?: string | null }).modpackRestoreIssue ?? null))
      .catch(() => setRestoreIssue(null))
  }, [])

  const refresh = (): void => {
    // P0：调用失败必须显式呈现，不能与「确实是空数据」混为一谈
    void callOrThrow('schema:coverage')
      .then((res) => {
        setCoverage(res)
        setCoverageError(null)
      })
      .catch((err: unknown) => {
        setCoverage(null)
        setCoverageError(err instanceof Error ? err.message : String(err))
      })
    void callOrThrow('plugins:list')
      .then((res) => {
        setPlugins(res)
        setPluginError(null)
        // T-07：`plugins:list` 有加载副作用，状态必须在它之后取；用 `call`（软失败）是为了
        // 不让"状态通道出问题"把已经成功的列表也变成错误态
        return call('plugins:loadStatus')
      })
      .then((st) => {
        if (st) setPluginStatus(st)
      })
      .catch((err: unknown) => {
        setPluginError(err instanceof Error ? err.message : String(err))
      })
    void callOrThrow('scripts:list')
      .then((res) => {
        setScripts(res)
        setScriptError(null)
      })
      .catch((err: unknown) => {
        setScriptError(err instanceof Error ? err.message : String(err))
      })
  }

  useEffect(refresh, [])

  /**
   * T-05：插件启停。主进程负责持久化（`userData/plugin-disabled.json`），
   * 这里只把返回的最新列表写回本地状态，避免"点了开关但列表还是旧状态"。
   */
  const togglePlugin = (p: PluginManifest): void => {
    const next = p.status === 'disabled'
    void callOrThrow('plugins:setEnabled', { id: p.id, on: next })
      .then((list) => {
        setPlugins(list)
        toast(`插件 ${p.name} 已${next ? '启用' : '关闭'}（重启后保持）`, 'success')
      })
      .catch((err: unknown) => {
        toast(`切换插件失败：${err instanceof Error ? err.message : String(err)}`, 'error')
      })
  }

  if (!ui) return <div className="settings" />

  return (
    <div className="settings">
      {restoreIssue ? (
        <div className="settings-banner" role="alert">
          {/* 第 6 条：T-25 恢复失败的可读提示（原本只有 logger.warn） */}
          <span className="note-error">{restoreIssue}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setRestoreIssue(null)}>
            知道了
          </button>
        </div>
      ) : null}
      <header className="work-head">
        <div className="work-head-title">
          <div className="work-title">设置与诊断</div>
          <div className="work-sub">
            外观、生成偏好与整合包诊断 · 修改即时生效并写入 userData/uiState.json
          </div>
        </div>
        <span className="topbar-spacer" />
        <button className="btn btn-sm" onClick={refresh}>
          <Icon name="refresh" size={14} />
          刷新诊断
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(false)}>
          返回
        </button>
      </header>

      <div className="settings-scroll">
        <section className="set-card">
          <header className="set-head">
            <Icon name="sparkle" size={14} />
            <h3>界面主题</h3>
            <span className="topbar-spacer" />
            <span className="subtle">共 {THEME_LIST.length} 套 · 即时生效并记住选择</span>
          </header>
          <div className="theme-grid" role="radiogroup" aria-label="界面主题">
            {THEME_LIST.map((t) => {
              const active = ui.theme === t.id
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={active}
                  className={`theme-card${active ? ' active' : ''}`}
                  title={t.hint}
                  onClick={() => patchUi({ theme: t.id })}
                >
                  <span className="theme-preview" aria-hidden="true" style={{ background: t.swatch.base }}>
                    <span className="theme-preview-panel" style={{ background: t.swatch.surface }} />
                    <span className="theme-preview-bar" style={{ background: t.swatch.accent }} />
                  </span>
                  <span className="theme-meta">
                    <strong>{t.label}</strong>
                    <span className="subtle">
                      {t.id} · {t.mode === 'light' ? '亮色' : '暗色'}
                    </span>
                  </span>
                  <span className="theme-check" aria-hidden="true">
                    {active ? <Icon name="check" size={14} /> : null}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="settings-hint">{THEMES[ui.theme]?.hint ?? ''} 颜色以外的内容（深浅、对比度）由同一套设计令牌驱动，换主题不会改变布局与信息层级。</p>
        </section>

        <section className="set-card">
          <header className="set-head">
            <Icon name="panel-left" size={14} />
            <h3>面板与内容</h3>
          </header>
          <div className="settings-row">
            <button className="chip" onClick={() => patchUi({ browseMode: ui.browseMode === 'list' ? 'detail' : 'list' })}>
              配方浏览：{ui.browseMode === 'list' ? '列表（每页 6）' : '详情（每页 1）'}
            </button>
            <button className="chip" onClick={() => patchUi({ showVirtualItems: !ui.showVirtualItems })}>
              虚拟物品：{ui.showVirtualItems ? '显示' : '隐藏'}
            </button>
            <button className="chip" onClick={() => patchUi({ codeCollapsed: !ui.codeCollapsed })}>
              详情面板：{ui.codeCollapsed ? '已折叠' : '展开'}
            </button>
            <button className="chip" onClick={() => patchUi({ sidebarCollapsed: !ui.sidebarCollapsed })}>
              左侧栏：{ui.sidebarCollapsed ? '已折叠' : '展开'}
            </button>
          </div>
          <p className="settings-hint">窄窗口（&lt;1024px）会自动收起左侧栏，可用顶栏按钮或 Ctrl+B 唤出。</p>
        </section>

        <section className="set-card">
          <header className="set-head">
            <Icon name="bench" size={14} />
            <h3>工作台试点</h3>
          </header>
          <div className="settings-row">
            {(
              [
                ['minecraft:crafting_shaped', '有序合成'],
                ['minecraft:crafting_shapeless', '无序合成'],
                ['create:mixing', 'Create 混合']
              ] as const
            ).map(([typeId, label]) => {
              const on = (ui.benchV2 ?? []).includes(typeId)
              return (
                <button
                  key={typeId}
                  className={`chip${on ? ' on' : ''}`}
                  title="关闭后该类型完全回到旧工作台链路（试点开关）"
                  onClick={() => {
                    const current = ui.benchV2 ?? []
                    patchUi({ benchV2: on ? current.filter((t) => t !== typeId) : [...current, typeId] })
                  }}
                >
                  试点工作台：{label} {on ? '开' : '关'}
                </button>
              )
            })}
          </div>
          <p className="settings-hint">
            开启后这些类型走「原始为权威」的结构化编辑：可追踪脏字段、保留未建模字段、提交前校验源文件哈希并在冲突时要求显式选择。
          </p>
        </section>

        <section className="set-card">
          <header className="set-head">
            <Icon name="code" size={14} />
            <h3>生成偏好</h3>
          </header>
          <div className="settings-row">
            {(
              [
                ['auto', '自动（推荐）'],
                ['always-sugar', '始终语法糖'],
                ['always-datapack', '始终数据包 JSON']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`chip${ui.generationPreference === value ? ' on' : ''}`}
                onClick={() => patchUi({ generationPreference: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="settings-hint">
            自动模式按整合包实际情况选通道：附属模组装了走语法糖，没装写数据包 JSON，拿不准一律降级数据包。「始终语法糖」在附属缺失时会明确报错而不是静默降级。
          </p>
        </section>

        <section className="set-card">
          <header className="set-head">
            <Icon name="check" size={14} />
            <h3>覆盖率自检</h3>
            <span className="topbar-spacer" />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void call('app:pickDirectory', { title: '选择含 probe/ 或 dumps/ 的目录' }).then((picked) => {
                  if (!picked?.path) return
                  void call('probe:import', { paths: [picked.path] }).then((res) => {
                    if (res) toast(`注册表导入：新增 ${res.addedIds} 个 ID，验证 ${res.verifiedIds} 个`, 'success')
                    refresh()
                  })
                })
              }}
            >
              <Icon name="folder" size={14} />
              导入 ProbeJS / CT 注册表
            </button>
          </header>
          {coverageError ? (
            <p className="settings-hint note-error">覆盖度统计加载失败：{coverageError}（这不是空数据）</p>
          ) : coverage ? (
            <pre className="coverage">{renderCoverage(coverage)}</pre>
          ) : (
            <p className="settings-hint">扫描完成后这里会显示配方类型覆盖情况与通道分布。</p>
          )}
        </section>

        <section className="set-card">
          <header className="set-head">
            <Icon name="package" size={14} />
            <h3>插件</h3>
            <span className="count">{plugins.length}</span>
          </header>
          {pluginError ? (
            <p className="settings-hint note-error">插件列表加载失败：{pluginError}（这不是「没有插件」）</p>
          ) : null}
          {pluginStatus?.state === 'failed' ? (
            <p className="settings-hint note-error">
              插件读取失败：{pluginStatus.error ?? '未知原因'}
              {pluginStatus.cachedPath && pluginStatus.path !== pluginStatus.cachedPath
                ? `（下面显示的是 ${pluginStatus.cachedPath} 的上一次成功数据，不是当前整合包）`
                : '（下面显示的仍是上一次成功读取的数据，修复后重新进入本页即可恢复）'}
            </p>
          ) : null}
          {plugins.length === 0 ? (
            <p className="settings-hint">
              未发现插件。可放在整合包 .recipe-studio/plugins/ 或用户目录 {runtime?.userData ?? ''}/plugins/，前者优先。
            </p>
          ) : (
            plugins.map((p) => (
              <div key={p.id} className="settings-row settings-row-item">
                <span className={`badge${p.status === 'loaded' ? ' badge-ok' : ' badge-warn'}`}>{p.status}</span>
                <strong>{p.name}</strong>
                <span className="subtle mono">
                  v{p.version} · 覆盖 {p.coveredTypes.length} 个类型 · {p.origin === 'modpack' ? '整合包' : '用户目录'}
                </span>
                {p.error ? <span className="note-error">{p.error}</span> : null}
                <span className="topbar-spacer" />
                <button
                  className={`chip${p.status !== 'disabled' ? ' on' : ''}`}
                  onClick={() => togglePlugin(p)}
                  /* 无障碍/可测性：开关语义显式化（人工使用不受影响；自动化与读屏器依赖这两个属性） */
                  role="switch"
                  aria-checked={p.status !== 'disabled'}
                  aria-label={`插件 ${p.name} 启用状态`}
                  title={
                    p.status === 'disabled'
                      ? '点击启用（状态写入 userData，重启后保持）'
                      : '点击停用（状态写入 userData，重启后保持）'
                  }
                >
                  {p.status === 'disabled' ? '关' : '开'}
                </button>
              </div>
            ))
          )}
        </section>

        <section className="set-card">
          <header className="set-head">
            <Icon name="file" size={14} />
            <h3>脚本执行顺序</h3>
            <span className="count">{scripts.length}</span>
          </header>
          {scriptError ? (
            <p className="settings-hint note-error">脚本列表加载失败：{scriptError}（这不是「没有脚本」）</p>
          ) : null}
          {scripts.length === 0 ? (
            <p className="settings-hint">{modpack ? 'kubejs/server_scripts 下暂无脚本。' : '尚未导入整合包。'}</p>
          ) : (
            scripts.map((s) => (
              <div key={s.path} className="settings-row settings-row-item">
                <span className="badge mono">{s.order}</span>
                <span className="mono settings-script-name truncate" title={s.path}>
                  {s.name}
                </span>
                <span className="subtle nowrap">{(s.bytes / 1024).toFixed(1)} KB</span>
                <span className="topbar-spacer" />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const prefix = s.name.match(/^(\d{2})_/) ? '' : `${String(99).padStart(2, '0')}_`
                    void call('scripts:rename', { name: s.name, to: `${prefix}${s.name}` }).then(() => refresh())
                    pushLog('INFO', 'IO', `脚本重命名为 ${prefix}${s.name}，加载顺序已调整`)
                  }}
                >
                  排到最后
                </button>
              </div>
            ))
          )}
        </section>

        <CachePanel />

        <section className="set-card">
          <header className="set-head">
            <Icon name="info" size={14} />
            <h3>运行环境</h3>
          </header>
          <div className="settings-kv">
            <span>程序版本</span>
            <strong className="mono">v{runtime?.appVersion ?? '—'}</strong>
            <span>平台</span>
            <strong className="mono">{runtime?.platform ?? '—'}</strong>
            <span>用户数据目录</span>
            <strong className="mono settings-kv-path" title={runtime?.userData}>
              {runtime?.userData ?? '—'}
            </strong>
            <span>整合包路径</span>
            <strong className="mono settings-kv-path" title={modpack?.path}>
              {modpack?.path ?? '未导入'}
            </strong>
          </div>
        </section>
      </div>
    </div>
  )
}

function renderCoverage(c: CoverageReport): string {
  const pct = (n: number): string => (c.totalTypes === 0 ? '0.0' : ((n / c.totalTypes) * 100).toFixed(1))
  const addons = c.addons
    .map((a) => `  ${a.installed ? '✓' : '✗'} ${a.modId}${a.installed || !a.suggests ? '' : `（建议安装 ${a.suggests}）`}`)
    .join('\n')
  const unsupported = c.unsupportedTypes
    .map((u) => `  ${u.type} · ${u.reason} → ${u.suggestion}`)
    .join('\n')
  return [
    '本整合包配方类型覆盖情况',
    '─────────────────────────────────────────',
    `  扫描到的配方类型          ${c.totalTypes} 种`,
    `  ├─ 可结构化编辑           ${c.structurable} 种 (${pct(c.structurable)}%)`,
    `  ├─ 仅通用模式可编辑        ${c.genericOnly} 种 (${pct(c.genericOnly)}%)`,
    `  └─ 完全无法添加             ${c.unsupported} 种`,
    '',
    // P0-R3：覆盖度语义易误解。分母是「扫描到的配方类型种数」，不是配方条数；
    // 「仅通用模式可编辑」不等于「不能编辑」。两句话把口径钉在界面上，避免用户误读。
    '  口径说明：以上百分比的分母是「扫描到的配方类型**种数**」，不是配方条数。',
    '           「仅通用模式可编辑」表示没有字段级 schema，仍可用原始 JSON 编辑，不是不能改。',
    '',
    '生成通道分布',
    `  ├─ KubeJS 语法糖          ${c.channelCounts['kubejs-sugar']} 种`,
    `  ├─ 数据包 JSON            ${c.channelCounts['datapack-json']} 种`,
    `  └─ event.custom             ${c.channelCounts['event-custom']} 种`,
    '─────────────────────────────────────────',
    '附属模组检测',
    addons || '  （未检测到 KubeJS 附属模组）',
    unsupported ? `\n无法添加的类型（生态限制，非程序缺陷）\n${unsupported}` : ''
  ].join('\n')
}
