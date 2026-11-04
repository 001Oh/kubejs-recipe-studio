/** 窗口尺寸 / 分隔条位置 / 主题等 UI 状态持久化到 userData/uiState.json（规格 3.9.7）。 */
import { existsSync, readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import {
  CODEPANE_DEFAULT_WIDTH,
  CODEPANE_MAX_WIDTH,
  CODEPANE_MIN_WIDTH,
  LOGDRAWER_DEFAULT_HEIGHT,
  SIDEBAR_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH
} from '../shared/constants'
import type { UiState } from '../shared/types'
import { DEFAULT_THEME, normalizeTheme } from '../shared/theme'
import { logger } from './logger'
import { uiStateFile } from './paths'

export const DEFAULT_UI_STATE: UiState = {
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  codeWidth: CODEPANE_DEFAULT_WIDTH,
  logHeight: LOGDRAWER_DEFAULT_HEIGHT,
  sidebarCollapsed: false,
  codeCollapsed: false,
  logCollapsed: false,
  theme: DEFAULT_THEME,
  generationPreference: 'auto',
  showVirtualItems: false,
  browseMode: 'list',
  maximized: false,
  x: null,
  y: null,
  width: WINDOW_DEFAULT_WIDTH,
  height: WINDOW_DEFAULT_HEIGHT
}

let state: UiState = { ...DEFAULT_UI_STATE }
let loaded = false

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export function loadUiState(): UiState {
  loaded = true
  const file = uiStateFile()
  if (!existsSync(file)) return state
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    state = {
      sidebarWidth: clamp(raw.sidebarWidth, 240, 520, DEFAULT_UI_STATE.sidebarWidth),
      codeWidth: clamp(raw.codeWidth, CODEPANE_MIN_WIDTH, CODEPANE_MAX_WIDTH, DEFAULT_UI_STATE.codeWidth),
      logHeight: clamp(raw.logHeight, 120, 500, DEFAULT_UI_STATE.logHeight),
      sidebarCollapsed: bool(raw.sidebarCollapsed, false),
      codeCollapsed: bool(raw.codeCollapsed, false),
      logCollapsed: bool(raw.logCollapsed, false),
      // 旧版本只有 dark/light：'dark' → 'graphite'，非法值一律回落默认主题
      theme: normalizeTheme(raw.theme),
      generationPreference:
        raw.generationPreference === 'always-sugar' || raw.generationPreference === 'always-datapack'
          ? raw.generationPreference
          : 'auto',
      showVirtualItems: bool(raw.showVirtualItems, false),
      browseMode: raw.browseMode === 'detail' ? 'detail' : 'list',
      // T-25：恢复用的包标识。非字符串/空串一律当「没有」，避免把脏值当成可恢复路径。
      ...(typeof raw.lastModpackPath === 'string' && raw.lastModpackPath.trim()
        ? { lastModpackPath: raw.lastModpackPath.trim() }
        : {}),
      ...(typeof raw.lastModpackName === 'string' && raw.lastModpackName.trim()
        ? { lastModpackName: raw.lastModpackName.trim() }
        : {}),
      maximized: bool(raw.maximized, false),
      x: typeof raw.x === 'number' ? raw.x : null,
      y: typeof raw.y === 'number' ? raw.y : null,
      width: clamp(raw.width, WINDOW_MIN_WIDTH, 8000, WINDOW_DEFAULT_WIDTH),
      height: clamp(raw.height, WINDOW_MIN_HEIGHT, 5000, WINDOW_DEFAULT_HEIGHT)
    }
  } catch (err) {
    logger.warn('UI', 'uiState.json 解析失败，使用默认值', err instanceof Error ? err.message : String(err))
    state = { ...DEFAULT_UI_STATE }
  }
  return state
}

export function getUiState(): UiState {
  if (!loaded) return loadUiState()
  return state
}

export function patchUiState(patch: Partial<UiState>): UiState {
  const next = { ...state, ...patch }
  state = {
    ...next,
    theme: normalizeTheme(next.theme),
    sidebarWidth: clamp(next.sidebarWidth, 240, 520, DEFAULT_UI_STATE.sidebarWidth),
    codeWidth: clamp(next.codeWidth, CODEPANE_MIN_WIDTH, CODEPANE_MAX_WIDTH, DEFAULT_UI_STATE.codeWidth),
    logHeight: clamp(next.logHeight, 120, 500, DEFAULT_UI_STATE.logHeight),
    width: clamp(next.width, WINDOW_MIN_WIDTH, 8000, WINDOW_DEFAULT_WIDTH),
    height: clamp(next.height, WINDOW_MIN_HEIGHT, 5000, WINDOW_DEFAULT_HEIGHT)
  }
  saveUiState()
  return state
}

let saveTimer: NodeJS.Timeout | null = null

/** 拖拽期间合并写入，避免每帧一次磁盘 IO。 */
export function saveUiState(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      writeFileSync(uiStateFile(), JSON.stringify(state, null, 2), 'utf8')
    } catch (err) {
      logger.warn('UI', 'uiState 保存失败', err instanceof Error ? err.message : String(err))
    }
  }, 300)
}

export function flushUiState(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    writeFileSync(uiStateFile(), JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    logger.warn('UI', 'uiState 落盘失败', err instanceof Error ? err.message : String(err))
  }
}
