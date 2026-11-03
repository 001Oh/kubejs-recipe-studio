/** 外壳状态：整合包、索引摘要、日志缓冲、视图切换、toast 与横幅、UI 尺寸持久化。 */
import { create } from 'zustand'
import type {
  IndexSummary,
  ItemEntry,
  LogEntry,
  LogSource,
  LogLevel,
  ModpackInfo,
  RecipeRecord,
  ScanProgress,
  UiState
} from '@shared/types'
import type { ImportCandidates, ImportResult } from '@shared/ipc'
import { LOG_BUFFER_MAX } from '@shared/constants'
import { DEFAULT_THEME, normalizeTheme } from '@shared/theme'
import { call, callRaw } from '../api'

export type CenterView = 'browse' | 'bench'
export type BrowseTab = 'craft' | 'use'

export interface Toast {
  id: number
  level: 'info' | 'warn' | 'error' | 'success'
  text: string
  actionLabel?: string
  action?: () => void
}

export interface Banner {
  id: number
  kind: 'warn' | 'error'
  text: string
}

interface RuntimeInfo {
  appVersion: string
  userData: string
  platform: string
}

const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SUCCESS']
const LOG_SOURCES: LogSource[] = ['MODPACK', 'SCAN', 'INDEX', 'RECIPE', 'IO', 'UI', 'SCHEMA', 'PLUGIN']

/** 右侧详情面板的页签（纯展示层状态，不参与业务判定，不落盘） */
export type DetailTab = 'detail' | 'code'

export interface AppStore {
  ready: boolean
  runtime: RuntimeInfo | null
  ui: UiState | null
  modpack: ModpackInfo | null
  summary: IndexSummary | null
  favorites: string[]
  candidates: string[] | null
  scanning: boolean
  progress: ScanProgress | null
  logs: LogEntry[]
  levelFilter: Record<LogLevel, boolean>
  sourceFilter: Record<LogSource, boolean>
  logText: string
  view: CenterView
  settingsOpen: boolean
  selectedItemId: string | null
  /** 配方浏览里被点选（≠已载入）的卡片：只喂右侧详情，不改变任何工作台状态 */
  selectedRecipe: RecipeRecord | null
  detailTab: DetailTab
  browseTab: BrowseTab
  toasts: Toast[]
  banners: Banner[]
  /** 吸取（吸色笔）状态：中键吸取后左键落点决定材料/产物 */
  eyedropper: ItemEntry | null
  eyedropperKeep: boolean

  init: () => Promise<void>
  addLog: (entry: LogEntry) => void
  pushLog: (level: LogLevel, source: LogSource, message: string, detail?: string) => void
  clearLogs: () => void
  setLevelFilter: (level: LogLevel, on: boolean) => void
  setSourceFilter: (source: LogSource, on: boolean) => void
  setLogText: (text: string) => void
  exportLogs: () => Promise<void>

  patchUi: (patch: Partial<UiState>) => void
  setView: (view: CenterView) => void
  setSettingsOpen: (open: boolean) => void
  selectItem: (id: string | null, tab?: BrowseTab) => void
  selectRecipe: (record: RecipeRecord | null) => void
  setDetailTab: (tab: DetailTab) => void
  setBrowseTab: (tab: BrowseTab) => void

  pickAndImport: () => Promise<void>
  importPath: (path: string) => Promise<void>
  chooseCandidate: (index: number) => Promise<void>
  closeCandidates: () => void
  startScan: (rebuild: boolean) => Promise<void>
  cancelScan: () => Promise<void>
  setScanning: (on: boolean) => void
  setProgress: (progress: ScanProgress | null) => void
  setSummary: (summary: IndexSummary | null) => void
  setModpack: (info: ModpackInfo | null) => void
  toggleFavorite: (id: string) => Promise<void>

  toast: (text: string, level?: Toast['level'], action?: () => void, actionLabel?: string) => void
  dismissToast: (id: number) => void
  banner: (text: string, kind?: Banner['kind']) => void
  dismissBanner: (id: number) => void
  pickEyedropper: (item: ItemEntry) => void
  clearEyedropper: () => void
  setEyedropperKeep: (on: boolean) => void
}

let seq = 1

const allLevels = (): Record<LogLevel, boolean> =>
  Object.fromEntries(LOG_LEVELS.map((l) => [l, l !== 'DEBUG'])) as Record<LogLevel, boolean>

const allSources = (): Record<LogSource, boolean> =>
  Object.fromEntries(LOG_SOURCES.map((s) => [s, true])) as Record<LogSource, boolean>

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  runtime: null,
  ui: null,
  modpack: null,
  summary: null,
  favorites: [],
  candidates: null,
  scanning: false,
  progress: null,
  logs: [],
  levelFilter: allLevels(),
  sourceFilter: allSources(),
  logText: '',
  view: 'browse',
  settingsOpen: false,
  selectedItemId: null,
  selectedRecipe: null,
  detailTab: 'detail',
  browseTab: 'craft',
  toasts: [],
  banners: [],
  eyedropper: null,
  eyedropperKeep: false,

  async init() {
    const [runtime, ui, current] = await Promise.all([
      call('app:runtime'),
      call('ui:get'),
      call('modpack:current')
    ])
    if (runtime) set({ runtime })
    if (ui) {
      // 主题：旧数据里的 'dark'/非法值在这里归一，保证 data-theme 一定是注册表里的 id
      const theme = normalizeTheme(ui.theme)
      set({ ui: { ...ui, theme } })
      document.documentElement.dataset.theme = theme
    }
    if (current) {
      set({ modpack: current.info, summary: current.summary, favorites: current.favorites ?? [] })
      if (current.info) get().pushLog('INFO', 'MODPACK', `恢复上次导入：${current.info.name}`)
    }
    set({ ready: true })
  },

  addLog(entry) {
    const merged = [...get().logs, entry]
    if (merged.length <= LOG_BUFFER_MAX) {
      set({ logs: merged })
      return
    }
    const idx = merged.findIndex((e) => e.level === 'DEBUG')
    if (idx === -1) set({ logs: merged.slice(merged.length - LOG_BUFFER_MAX) })
    else {
      merged.splice(idx, 1)
      set({ logs: merged })
    }
  },

  pushLog(level, source, message, detail) {
    get().addLog({ ts: Date.now(), level, source, message, ...(detail ? { detail } : {}) })
  },

  clearLogs() {
    set({ logs: [] })
  },

  setLevelFilter(level, on) {
    set({ levelFilter: { ...get().levelFilter, [level]: on } })
  },

  setSourceFilter(source, on) {
    set({ sourceFilter: { ...get().sourceFilter, [source]: on } })
  },

  setLogText(text) {
    set({ logText: text })
  },

  async exportLogs() {
    const entries = get().logs
    const res = await call('logs:export', { entries })
    if (res) get().toast(`日志已导出：${res.path}`, 'success')
  },

  patchUi(patch) {
    const ui = get().ui
    if (!ui) return
    const next = { ...ui, ...patch }
    if (patch.theme !== undefined) next.theme = normalizeTheme(patch.theme)
    set({ ui: next })
    if (patch.theme !== undefined) document.documentElement.dataset.theme = next.theme ?? DEFAULT_THEME
    void call('ui:patch', patch)
  },

  setView(view) {
    // 导航到主视图时离开设置页：左侧导航是"目的地"而不是"模式开关"
    set({ view, settingsOpen: false })
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open })
  },

  selectItem(id, tab) {
    if (id) set({ selectedItemId: id, view: 'browse', settingsOpen: false, browseTab: tab ?? get().browseTab })
    else set({ selectedItemId: null, selectedRecipe: null })
  },

  selectRecipe(record) {
    set({ selectedRecipe: record })
  },

  setDetailTab(tab) {
    set({ detailTab: tab })
  },

  setBrowseTab(tab) {
    set({ browseTab: tab })
  },

  async pickAndImport() {
    const picked = await call('app:pickDirectory', { title: '选择整合包根目录（含 mods / config / kubejs）' })
    if (!picked?.path) {
      get().pushLog('DEBUG', 'MODPACK', '用户取消了目录选择')
      return
    }
    await get().importPath(picked.path)
  },

  async importPath(path) {
    get().pushLog('INFO', 'MODPACK', `开始导入：${path}`)
    const res = await callRaw('modpack:import', { path })
    if (!res.ok) {
      get().banner(res.error || '导入失败', 'error')
      return
    }
    const data = res.data as ImportResult | ImportCandidates
    if ('candidates' in data) {
      set({ candidates: data.candidates })
      get().pushLog('WARN', 'MODPACK', `发现 ${data.candidates.length} 个含 mods 的子目录，需要选择`)
      return
    }
    const info = data.info
    const meta = [
      info.name,
      info.mcVersion ? `MC ${info.mcVersion}` : 'MC 版本未知',
      info.loader ?? '加载器未知',
      info.kubejsVersion ? `KubeJS ${info.kubejsVersion}` : '未检测到 KubeJS',
      `${info.modCount} mods`
    ].join(' · ')
    get().pushLog('INFO', 'MODPACK', `检测到：${meta}`, `mods 目录：${info.modsDir}`)
    if (data.corrected) get().pushLog('INFO', 'MODPACK', `路径已自动纠正：${data.note}`)
    if (!info.hasKubejs) get().banner('该整合包未安装 KubeJS，生成的脚本将不会生效', 'warn')
    set({ modpack: info, summary: null, selectedItemId: null })
    await get().startScan(false)
  },

  async chooseCandidate(index) {
    const list = get().candidates
    if (!list || !list[index]) return
    set({ candidates: null })
    await get().importPath(list[index])
  },

  closeCandidates() {
    set({ candidates: null })
  },

  async startScan(rebuild) {
    if (!get().modpack) {
      get().toast('请先导入整合包', 'warn')
      return
    }
    set({ scanning: true, progress: null })
    const res = await callRaw('modpack:scan', { rebuild })
    if (!res.ok) {
      set({ scanning: false })
      get().toast(`扫描未能启动：${res.error}`, 'error')
    }
  },

  async cancelScan() {
    await call('modpack:scanCancel')
    set({ scanning: false, progress: null })
  },

  setScanning(on) {
    set({ scanning: on, ...(on ? {} : { progress: null }) })
  },

  setProgress(progress) {
    set({ progress })
  },

  setSummary(summary) {
    set({ summary })
  },

  setModpack(info) {
    set({ modpack: info })
  },

  async toggleFavorite(id) {
    const on = !get().favorites.includes(id)
    const res = await call('favorites:set', { id, on })
    if (res) set({ favorites: res })
  },

  toast(text, level = 'info', action, actionLabel) {
    const item: Toast = { id: seq++, level, text, ...(action ? { action, actionLabel } : {}) }
    set({ toasts: [...get().toasts, item] })
    setTimeout(() => get().dismissToast(item.id), level === 'error' ? 9000 : 5000)
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  banner(text, kind = 'warn') {
    if (get().banners.some((b) => b.text === text)) return
    set({ banners: [...get().banners, { id: seq++, kind, text }] })
  },

  dismissBanner(id) {
    set({ banners: get().banners.filter((b) => b.id !== id) })
  },

  pickEyedropper(item) {
    const current = get().eyedropper
    if (current?.id === item.id) {
      // 再次中键同一物品 = 取消吸取
      set({ eyedropper: null })
      return
    }
    set({ eyedropper: item })
    get().pushLog('DEBUG', 'UI', `吸取 ${item.id}`)
  },

  clearEyedropper() {
    set({ eyedropper: null })
  },

  setEyedropperKeep(on) {
    set({ eyedropperKeep: on })
  }
}))

/** 订阅主进程事件流；在 main.tsx 挂载时调用一次。 */
export function subscribeStudioEvents(): () => void {
  return window.studio.onEvent((event) => {
    const s = useAppStore.getState()
    switch (event.kind) {
      case 'log':
        s.addLog(event.entry)
        break
      case 'progress':
        s.setProgress(event.progress)
        break
      case 'index-ready':
        s.setSummary(event.summary)
        s.setScanning(false)
        // 扫描可能不是由本窗口的「导入」按钮发起的（例如命令行/其它入口触发的 IPC），
        // 索引就绪时把当前整合包再拉一次，保证侧栏能立刻显示物品而不是停在空状态。
        void call('modpack:current').then((cur) => {
          if (cur?.info) useAppStore.setState({ modpack: cur.info, summary: cur.summary ?? event.summary })
        })
        break
      case 'scan-canceled':
        s.setScanning(false)
        break
      case 'scan-failed':
        s.setScanning(false)
        s.banner(`扫描失败（${event.phase}）：${event.error}`, 'error')
        break
    }
  })
}
