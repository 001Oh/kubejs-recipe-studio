/** 应用级 IPC：运行时信息、目录选择、UI 状态、日志导出。 */
import { app, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { LogEntry } from '../../shared/types'
import { getMainWindow } from '../window'
import { registerHandler } from '../ipcRegistry'
import { logger } from '../logger'
import { logsDir } from '../paths'
import { getUiState, patchUiState } from '../uiStateStore'
import { normalizeTheme, themeMeta } from '../../shared/theme'
import { getRestoreIssue } from '../modpack/restoreIssue'

export function registerAppHandlers(): void {
  registerHandler('app:runtime', () => ({
    appVersion: app.getVersion(),
    userData: app.getPath('userData'),
    platform: process.platform,
    // 第 6 条：上次整合包恢复失败的可读原因（null = 正常）
    modpackRestoreIssue: getRestoreIssue()
  }))

  registerHandler('app:pickDirectory', (req) => {
    const options = {
      properties: ['openDirectory'] as ['openDirectory'],
      title: req?.title ?? '选择整合包根目录',
      ...(req?.defaultPath ? { defaultPath: req.defaultPath } : {})
    }
    const result = dialog.showOpenDialogSync(options)
    return { path: result?.[0] ?? null }
  })

  registerHandler('ui:get', () => getUiState())

  registerHandler('ui:patch', (patch) => {
    const next = patchUiState(patch)
    if (patch.theme) applyThemeToWindow(patch.theme)
    return next
  })

  registerHandler('logs:export', ({ entries }) => {
    const path = join(logsDir(), `studio-export-${formatStamp(Date.now())}-${shortHash(entries)}.log`)
    const body = entries.map(renderExportLine).join('')
    writeFileSync(path, body, 'utf8')
    logger.success('IO', `日志已导出：${path}`, `共 ${entries.length} 条`)
    return { path }
  })
}

function applyThemeToWindow(theme: unknown): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  // 未知主题不抛错：窗口底色回落到默认主题，渲染端同步会做同样的归一
  win.setBackgroundColor(themeMeta(normalizeTheme(theme)).windowBackground)
}

function formatStamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(
    d.getSeconds()
  )}`
}

function shortHash(entries: LogEntry[]): string {
  return createHash('sha1').update(String(entries?.length ?? 0)).digest('hex').slice(0, 6)
}

const pad = (level: string): string => level.padEnd(7)

function renderExportLine(entry: LogEntry): string {
  const time = new Date(entry.ts).toISOString().replace('T', ' ').slice(0, 23)
  const detail = entry.detail ? `\n${entry.detail.split('\n').map((l) => `        ${l}`).join('\n')}` : ''
  return `${time}  ${pad(entry.level)} ${entry.source.padEnd(7)} ${entry.message}${detail}\n`
}
