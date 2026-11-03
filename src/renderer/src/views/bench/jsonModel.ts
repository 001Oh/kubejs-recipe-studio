/**
 * 原始 JSON 通道的支撑逻辑（规格 3.4 三级降级 / 3.6.12 兜底）。纯函数，可单测。
 * 编辑器永远可用：校验给出行列定位，高亮用词法着色（不依赖 shiki，离线安全）。
 */

export type JsonCheck = { ok: true; value: unknown } | { ok: false; message: string; line: number; column: number }

export type TokenClass = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'plain'

export interface JsonToken {
  text: string
  cls: TokenClass
}

const WS = new Set([' ', '\t', '\r', '\n'])

function positionOf(text: string, index: number): { line: number; column: number } {
  const upto = text.slice(0, Math.max(0, Math.min(index, text.length)))
  const lines = upto.split('\n')
  return { line: lines.length, column: (lines[lines.length - 1] ?? '').length + 1 }
}

/** 从 V8 的 SyntaxError 文案里抓位置，抓不到就退回第 1 行 */
function extractPosition(message: string, text: string): { line: number; column: number } {
  const lineCol = /line (\d+) column (\d+)/i.exec(message)
  if (lineCol) return { line: Number(lineCol[1]), column: Number(lineCol[2]) }
  const pos = /position (\d+)/i.exec(message)
  if (pos) return positionOf(text, Number(pos[1]))
  return { line: 1, column: 1 }
}

export function checkJson(text: string): JsonCheck {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, message: '内容为空', line: 1, column: 1 }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const at = extractPosition(message, text)
    return { ok: false, message: message.replace(/in JSON at position.*/i, '').trim() || 'JSON 语法错误', ...at }
  }
}

/** 逐词法扫描，按行分组供 <pre> 渲染；只做着色，不做校验 */
export function tokenizeJson(text: string): JsonToken[][] {
  const lines: JsonToken[][] = [[]]
  let i = 0
  let buffer = ''
  const pushBuffer = (): void => {
    if (!buffer) return
    const current = lines[lines.length - 1]
    current?.push({ text: buffer, cls: 'plain' })
    buffer = ''
  }
  const emit = (token: string, cls: TokenClass): void => {
    const target = lines[lines.length - 1]
    if (buffer) {
      target?.push({ text: buffer, cls: 'plain' })
      buffer = ''
    }
    target?.push({ text: token, cls })
  }

  while (i < text.length) {
    const ch = text[i] as string
    if (ch === '\n') {
      pushBuffer()
      lines.push([])
      i += 1
      continue
    }
    if (WS.has(ch)) {
      buffer += ch
      i += 1
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let raw = '"'
      while (j < text.length) {
        const c = text[j] as string
        raw += c
        j += 1
        if (c === '\\') {
          raw += text[j] ?? ''
          j += 1
          continue
        }
        if (c === '"') break
      }
      i = j
      let k = i
      while (k < text.length && WS.has(text[k] as string)) k += 1
      emit(raw, text[k] === ':' ? 'key' : 'string')
      continue
    }
    if (ch === ':' || ch === ',' || ch === '{' || ch === '}' || ch === '[' || ch === ']') {
      emit(ch, 'punct')
      i += 1
      continue
    }
    if (/[-\d]/.test(ch)) {
      let raw = ''
      while (i < text.length && /[-+\d.eE]/.test(text[i] as string)) {
        raw += text[i]
        i += 1
      }
      emit(raw, 'number')
      continue
    }
    let raw = ''
    while (i < text.length && /[A-Za-z_]/.test(text[i] as string)) {
      raw += text[i]
      i += 1
    }
    if (raw) emit(raw, raw === 'true' || raw === 'false' || raw === 'null' ? 'literal' : 'plain')
    else {
      buffer += ch
      i += 1
    }
  }
  pushBuffer()
  return lines
}

/** 值 → 编辑器文本（unknown 键值对编辑器共用） */
export function toEditorText(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/**
 * 编辑器文本 → 值：优先按 JSON 字面量解析，失败时保留原始字符串，
 * 这样用户敲到一半不会被吞掉输入。
 */
export function fromEditorText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

/** 生成键名：只允许字母数字下划线，避免把带空格的输入写进字典 */
export function sanitizeKey(raw: string): string {
  return raw.trim().replace(/[^\w./-]/g, '_')
}

export interface KvRow {
  key: string
  json: string
}

/** 对象 → 键值行；非对象值退化为单行 `value`，保证编辑器永远可写 */
export function rowsFromValue(value: unknown): KvRow[] {
  if (value === null || value === undefined) return []
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, json: toEditorText(item) }))
  }
  return [{ key: 'value', json: toEditorText(value) }]
}

/** 键值行 → 对象；只有一个 `value` 键时还原为标量，避免给 KubeJS 塞多余壳 */
export function valueFromRows(rows: KvRow[]): unknown {
  const used = rows.filter((row) => row.key.trim() !== '')
  if (used.length === 0) return null
  if (used.length === 1 && used[0]?.key === 'value') return fromEditorText(used[0].json)
  const out: Record<string, unknown> = {}
  for (const row of used) out[row.key] = fromEditorText(row.json)
  return out
}
