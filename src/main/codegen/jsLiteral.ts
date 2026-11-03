/**
 * 生成 JS 字面量（模式 A 用）。规则固定：
 * - 字符串单引号，键名合法标识符时不加引号；
 * - 数字与布尔不加引号（规格 3.7「数字字段不加引号」）；
 * - 只有最外层容器按需展开多行，嵌套结构保持单行（与 §一 示例逐字符一致）。
 */
import type { Plain } from './values'

const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function jsString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `'${escaped}'`
}

export function jsKey(key: string): string {
  return BARE_KEY.test(key) ? key : jsString(key)
}

/** 单行字面量：`'a'` / `1` / `true` / `{ item: 'a', count: 2 }` / `['a', 'b']` */
export function jsLiteral(value: Plain): string {
  if (typeof value === 'string') return jsString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(jsLiteral).join(', ')}]`
  const entries = Object.entries(value).map(([k, v]) => `${jsKey(k)}: ${jsLiteral(v)}`)
  return `{ ${entries.join(', ')} }`
}

/** 顶层多行对象：返回不含前导缩进的若干行，`}` 由调用方补齐 */
export function jsObjectLines(value: Record<string, Plain>, indent: number): string[] {
  const pad = ' '.repeat(indent)
  const entries = Object.entries(value)
  if (entries.length === 0) return []
  return entries.map(([k, v]) => `${pad}${jsKey(k)}: ${jsLiteral(v)}`)
}

export function isPlainObject(value: Plain): value is Record<string, Plain> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
