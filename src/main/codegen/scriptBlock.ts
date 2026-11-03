/**
 * 脚本文件骨架：头部注释块、事件块包装（按 MC 版本切换）、追加写入时的安全插入。
 * 与发射器分开，是为了让 writer 只依赖「文本骨架」而不依赖整条生成链。
 */
import { scriptEventHeader } from '../../shared/version'
import type { ModpackInfo } from '../../shared/types'

/** 语法糖调用内的相对缩进；外层 2 空格由 wrapScript 统一补齐 */
const INNER = '  '

const LOADER_LABEL: Record<string, string> = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  quilt: 'Quilt'
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `yyyyMMdd_HHmmss`：脚本默认文件名与 `.backup` 后缀共用同一时间戳格式 */
export function fileStamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function clockStamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 规格 3.7 的头部注释块（列宽与 §3.7 示例逐字符一致：标签 padEnd(8) + ':'） */
export function buildHeader(modpack: ModpackInfo | null, createdAtMs: number): string {
  const mc = modpack?.mcVersion ?? '未检测到'
  const loader = modpack?.loader ? (LOADER_LABEL[modpack.loader] ?? modpack.loader) : '未检测到加载器'
  const kubejs = modpack?.kubejsVersion ? `KubeJS ${modpack.kubejsVersion}` : '未检测到 KubeJS'
  const line = (label: string, value: string): string => `// ${label.padEnd(8)}: ${value}`
  return [
    `// ${'─'.repeat(2)} KubeJS Recipe Studio ${'─'.repeat(29)}`,
    line('Modpack', modpack?.name || '未导入整合包'),
    line('MC', `${mc}  |  ${loader}  |  ${kubejs}`),
    line('Created', clockStamp(createdAtMs)),
    `// ${'─'.repeat(53)}`
  ].join('\n')
}

/** `onEvent('recipes', …)`（≤1.18）/ `ServerEvents.recipes(…)`（1.19+） */
export function eventBlockOpen(mcVersion: string | null): string {
  return scriptEventHeader(mcVersion) === 'ServerEvents.recipes'
    ? 'ServerEvents.recipes(event => {'
    : "onEvent('recipes', event => {"
}

export function indentStatements(statements: string[]): string {
  return statements
    .map((s) => s.split('\n').map((l) => (l.trim() ? `${INNER}${l}` : l)).join('\n'))
    .join('\n')
}

export function wrapScript(header: string, mcVersion: string | null, statements: string[]): string {
  return `${header}\n${eventBlockOpen(mcVersion)}\n${indentStatements(statements)}\n})\n`
}

/**
 * 在已有脚本里找最后一个配方事件块的闭合 `}` 下标；找不到返回 -1。
 * 字符串字面量与行注释里的花括号不参与计数（块注释按文本扫描，KubeJS 脚本极少在事件块内使用块注释）。
 */
export function findRecipesBlockEnd(text: string): number {
  const open = Math.max(text.lastIndexOf('ServerEvents.recipes'), text.lastIndexOf("onEvent('recipes'"))
  if (open < 0) return -1
  const brace = text.indexOf('{', open)
  if (brace < 0) return -1
  let depth = 0
  let quote = ''
  for (let i = brace; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i)
      i = nl < 0 ? text.length : nl
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 追加模式：语句插进已有配方事件块内（插不进去由调用方另建文件） */
export function insertIntoExisting(text: string, statements: string[]): { text: string; inserted: boolean } {
  const end = findRecipesBlockEnd(text)
  if (end < 0 || statements.length === 0) return { text, inserted: false }
  const body = indentStatements(statements)
  const head = text.slice(0, end).replace(/\s*$/, '')
  return { text: `${head}\n${body}\n${text.slice(end)}`, inserted: true }
}
