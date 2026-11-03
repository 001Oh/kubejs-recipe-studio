/** 主进程日志：内存环形缓冲 + 磁盘按日滚动 + 推送到渲染进程。 */
import { appendFileSync, mkdirSync, readdirSync, rm, statSync } from 'node:fs'
import { join } from 'node:path'
import { LOG_BUFFER_MAX, LOG_FILE_KEEP_DAYS, LOG_DIR_NAME } from '../shared/constants'
import type { LogEntry, LogSource, LogLevel } from '../shared/types'
import { logsDir } from './paths'

const buffer: LogEntry[] = []
let sink: ((entry: LogEntry) => void) | null = null
let day = ''

function stamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

export function setMainLogSink(fn: ((entry: LogEntry) => void) | null): void {
  sink = fn
}

/** 本地日期：文件名与行内时戳必须同一时区，否则 UTC+8 下差一天。 */
function currentDay(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function logFile(ts: number): string {
  return join(logsDir(), `studio-${currentDay(ts)}.log`)
}

function writeToDisk(entry: LogEntry): void {
  try {
    mkdirSync(logsDir(), { recursive: true })
    const d = currentDay(entry.ts)
    if (d !== day) day = d
    const line =
      `${new Date(entry.ts).toISOString()}  ${entry.level.padEnd(7)} ${entry.source.padEnd(7)} ${entry.message}` +
      (entry.detail ? `\n${entry.detail.split('\n').map((l) => `        ${l}`).join('\n')}` : '') +
      '\n'
    appendFileSync(logFile(entry.ts), line, 'utf8')
  } catch {
    /* 日志写盘失败绝不能反过来打断主流程 */
  }
}

/** 超出上限时丢弃最旧的 DEBUG，其余级别保留（规格 3.8）。 */
function trim(): void {
  while (buffer.length > LOG_BUFFER_MAX) {
    const idx = buffer.findIndex((e) => e.level === 'DEBUG')
    if (idx === -1) buffer.shift()
    else if (idx === 0) buffer.shift()
    else buffer.splice(idx, 1)
  }
}

export function log(level: LogLevel, source: LogSource, message: string, detail?: string): LogEntry {
  const entry: LogEntry = { ts: Date.now(), level, source, message, ...(detail ? { detail } : {}) }
  buffer.push(entry)
  trim()
  writeToDisk(entry)
  sink?.(entry)
  return entry
}

export const logger = {
  debug: (s: LogSource, m: string, d?: string) => log('DEBUG', s, m, d),
  info: (s: LogSource, m: string, d?: string) => log('INFO', s, m, d),
  warn: (s: LogSource, m: string, d?: string) => log('WARN', s, m, d),
  error: (s: LogSource, m: string, d?: string) => log('ERROR', s, m, d),
  success: (s: LogSource, m: string, d?: string) => log('SUCCESS', s, m, d)
}

export function recentLogs(limit = LOG_BUFFER_MAX): LogEntry[] {
  return buffer.slice(Math.max(0, buffer.length - limit))
}

export function formatLogLine(entry: LogEntry): string {
  return `${stamp(entry.ts)}  ${entry.level}  ${entry.source}  ${entry.message}`
}

/** 按日期滚动，保留 7 天。启动时清理一次。 */
export function pruneOldLogs(): void {
  try {
    mkdirSync(logsDir(), { recursive: true })
    const keepAfter = Date.now() - LOG_FILE_KEEP_DAYS * 24 * 60 * 60 * 1000
    for (const name of readdirSync(logsDir())) {
      if (!name.startsWith('studio-') || !name.endsWith('.log')) continue
      const full = join(logsDir(), name)
      if (statSync(full).mtimeMs < keepAfter) rm(full, { force: true }, () => undefined)
    }
  } catch (err) {
    logger.warn('IO', '清理旧日志失败', err instanceof Error ? err.message : String(err))
  }
}

export const LOG_DIR_BASENAME = LOG_DIR_NAME
