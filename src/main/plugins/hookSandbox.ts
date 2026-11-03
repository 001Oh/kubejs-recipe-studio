/**
 * JS 钩子沙箱（规格 3.6.14：JSON 为主、JS 钩子为辅）。
 *
 * 只有 manifest 里显式写了 `hooks: { "<类型ID>": "xxx.js" }` 才会走到这里；
 * 纯 JSON 插件路径严禁任何代码执行——loader 从不调用本模块去 eval。
 *
 * 沙箱边界：
 * - Node `vm` 独立 context，且关掉字符串代码生成（eval / new Function 直接编译失败）；
 * - 静态黑名单先拒（require / import / process / fs / net / constructor / __proto__ 等逃逸常用件）；
 * - 只注入纯数据与几个构造函数助手，数据经 JSON 往返生成在沙箱内，不递送任何宿主对象；
 * - 1 秒超时强杀（钩子与包装脚本在同一次 runInContext 里执行，超时覆盖用户循环）。
 */
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { createContext, Script } from 'node:vm'
import { tokenizer, tokTypes } from 'acorn'
import { logger } from '../logger'

export const HOOK_TIMEOUT_MS = 1000
export const HOOK_SOURCE_MAX_BYTES = 64 * 1024

const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /\brequire\b/, label: 'require' },
  { pattern: /\bimport\b/, label: 'import' },
  { pattern: /\bprocess\b/, label: 'process' },
  { pattern: /\bglobalThis\b/, label: 'globalThis' },
  { pattern: /__proto__/, label: '__proto__' },
  { pattern: /\bprototype\b/, label: 'prototype' },
  { pattern: /\bconstructor\b/, label: 'constructor' },
  { pattern: /\beval\b/, label: 'eval' },
  { pattern: /\bFunction\b/, label: 'Function' },
  { pattern: /\bfs\b/, label: 'fs' },
  { pattern: /\bchild_process\b/, label: 'child_process' },
  { pattern: /\b(?:net|dns|http|https|tls)\b/, label: '网络模块' },
  { pattern: /\bfetch\b/, label: 'fetch' },
  { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
  { pattern: /WebSocket/, label: 'WebSocket' },
  { pattern: /\bBuffer\b/, label: 'Buffer' },
  { pattern: /\bWebAssembly\b/, label: 'WebAssembly' },
  { pattern: /\bSharedArrayBuffer\b/, label: 'SharedArrayBuffer' },
  { pattern: /\bAtomics\b/, label: 'Atomics' },
  { pattern: /\bSymbol\b/, label: 'Symbol' },
  { pattern: /\bset(?:Timeout|Interval|Immediate)\b/, label: '定时器' }
]

export interface HookInput {
  /** 目标配方类型 ID */
  typeId: string
  /** 工作台当前值（通用字典，不按类型分支） */
  values: Record<string, unknown>
  modifiers?: Record<string, unknown>
  /** 插件自带词典，钩子里 fieldName / valueName 用它取名 */
  fieldNames?: Record<string, string>
  valueNames?: Record<string, string>
  /** 仅供钩子里打印调试用 */
  pluginId?: string
}

export interface HookLocation {
  pluginId: string
  /** 插件目录（单文件插件是其所在目录，目录插件是其自身） */
  dir: string
  /** manifest.hooks 里写的相对文件名 */
  file: string
}

export interface HookOutcome {
  ok: boolean
  /** 钩子返回的 KubeJS 代码文本 */
  code?: string
  error?: string
  ms: number
}

/**
 * 去掉注释、字符串与模板字面量，只留下「会被执行的那部分」文本。
 *
 * BUG-HUNT-02 修复 BH-008：黑名单原先直接匹配源文件原文，于是注释里的英文单词 `import`、
 * 字符串里的 `'require'`、字段名 `fieldName('fs')` 都会被判成「使用了被禁用的能力」。
 * 钩子的真实边界是 `vm` + `codeGeneration:false` + 只注入纯数据，黑名单只是第二道防线，
 * 它的价值在于**拦住代码里真实的调用**，而不是匹配散文。
 *
 * 模板字面量里的 `${...}` 会被保留（那是代码，不是文本），避免用反引号绕过检测。
 */
function stripWithScanner(source: string): string {
  const out: string[] = []
  const n = source.length
  let i = 0
  while (i < n) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1
      out.push(' ')
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      out.push(' ')
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      i += 1
      while (i < n) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      out.push(' ')
      continue
    }
    if (ch === '`') {
      i += 1
      while (i < n) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === '`') {
          i += 1
          break
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          const start = i + 2
          let depth = 1
          i += 2
          while (i < n && depth > 0) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') depth -= 1
            if (depth > 0) i += 1
          }
          out.push(` ${source.slice(start, i)} `)
          i += 1
          continue
        }
        i += 1
      }
      out.push(' ')
      continue
    }
    out.push(ch)
    i += 1
  }
  return out.join('')
}

/**
 * 用 acorn 的**词法器**（不是字符扫描）取「可执行部分」的 token 文本。
 *
 * RV1-005 / RV1-006：字符扫描无法区分「正则字面量」与「除号」，也无法正确处理嵌套模板。
 * 例如 `var re = /[/*]/` 会被误判成块注释开始，把后面真实的 `require('fs')` 一起吞掉；
 * `` `a${`b${c}`}` `` 内层的 `}` 会被当成插值结束。词法器天然知道上下文，这两个问题一起消失。
 *
 * 只保留非字面量 token：字符串 / 正则 / 模板文本片段被丢弃，模板里的 `${...}` 表达式
 * 仍会产生普通 token，因此插值中的调用照样被检查。
 */
function stripWithTokenizer(source: string): string {
  const parts: string[] = []
  const lexer = tokenizer(source, {
    ecmaVersion: 'latest',
    allowHashBang: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true
  })
  for (;;) {
    const token = lexer.getToken()
    if (token.type === tokTypes.eof) break
    if (token.type === tokTypes.string) continue
    if (token.type === tokTypes.regexp) continue
    if (token.type === tokTypes.template) continue
    // acorn 的 `Token` 类型未声明 value（运行时对 name/literal token 才有），这里显式取值并判类型
    const value = (token as unknown as { value?: unknown }).value
    parts.push(typeof value === 'string' ? value : token.type.label, ' ')
  }
  return parts.join('')
}

/**
 * 去掉注释、字符串、正则与模板文本，只留下「会被执行的那部分」。
 *
 * 优先用 acorn 词法器；**钩子源码本身有语法错误时**（此时也编译不过、根本不会执行）
 * 退回字符扫描，保证函数不会因为输入非法而抛错。
 */
export function stripLiteralsAndComments(source: string): string {
  try {
    return stripWithTokenizer(source)
  } catch {
    return stripWithScanner(source)
  }
}

/** 静态体检：返回被禁用的关键字列表（空数组代表通过）。只看可执行部分，不匹配注释与字符串。 */
export function inspectHookSource(source: string): string[] {
  const scannable = stripLiteralsAndComments(source)
  const hits: string[] = []
  for (const entry of FORBIDDEN) {
    if (entry.pattern.test(scannable) && !hits.includes(entry.label)) hits.push(entry.label)
  }
  return hits
}

/** 钩子文件必须留在插件目录内，且只允许 .js / .cjs */
export function resolveHookPath(loc: HookLocation): { ok: true; full: string } | { ok: false; error: string } {
  const root = resolve(loc.dir)
  const full = resolve(root, loc.file)
  if (full === root || !full.toLowerCase().startsWith(root.toLowerCase() + sep)) {
    return { ok: false, error: `钩子文件必须位于插件目录内，拒绝 ${loc.file}` }
  }
  if (!/\.(?:js|cjs)$/i.test(full)) return { ok: false, error: `钩子只能是 .js / .cjs 文件，收到 ${loc.file}` }
  return { ok: true, full }
}

const PRELUDE_HEAD = `'use strict';
var __d = JSON.parse(`
const PRELUDE_TAIL = `);
var recipe = __d.recipe;
var fieldNames = __d.fieldNames;
var valueNames = __d.valueNames;
function fieldName(key) { var v = fieldNames[String(key)]; return typeof v === 'string' ? v : String(key) }
function valueName(id) { var v = valueNames[String(id)]; return typeof v === 'string' ? v : String(id) }
function item(id, count) { var o = { id: String(id) }; if (count !== undefined && count !== null) o.count = Number(count); return o }
function tag(id, count) { var o = { tag: String(id) }; if (count !== undefined && count !== null) o.count = Number(count); return o }
function fluid(id, amount) { var o = { fluid: String(id) }; if (amount !== undefined && amount !== null) o.amount = Number(amount); return o }
function quote(text) { return JSON.stringify(String(text)) }
function list(parts, sepText) { return parts.filter(Boolean).map(String).join(sepText === undefined ? ', ' : String(sepText)) }
var exports = {};
var module = { exports: exports };
`

const PRELUDE_TAIL_FN = `
var __fn = typeof module.exports === 'function' ? module.exports : (typeof exports.emit === 'function' ? exports.emit : null);
if (!__fn) throw new Error('钩子必须导出函数：module.exports = function (recipe) { return "..." } 或 exports.emit = ...');
var __result = __fn(recipe);
`

function buildWrapper(source: string, input: HookInput): string {
  const payload = JSON.stringify({
    recipe: {
      typeId: input.typeId,
      values: input.values ?? {},
      modifiers: input.modifiers ?? {},
      pluginId: input.pluginId ?? ''
    },
    fieldNames: input.fieldNames ?? {},
    valueNames: input.valueNames ?? {}
  })
  return PRELUDE_HEAD + JSON.stringify(payload) + PRELUDE_TAIL + source + PRELUDE_TAIL_FN
}

/** 在沙箱里跑一段钩子源码；一切异常都转成 HookOutcome，不向外抛 */
export function runHookSource(loc: HookLocation, source: string, input: HookInput): HookOutcome {
  const started = Date.now()
  const forbidden = inspectHookSource(source)
  if (forbidden.length > 0) {
    const error = `钩子 ${loc.file} 使用了被禁用的能力：${forbidden.join(' / ')}（沙箱只允许纯数据变换）`
    logger.warn('PLUGIN', error, `插件 ${loc.pluginId}`)
    return { ok: false, error, ms: Date.now() - started }
  }
  const contextPayload: Record<string, unknown> = {}
  const context = createContext(contextPayload, { codeGeneration: { strings: false, wasm: false } })
  try {
    const script = new Script(buildWrapper(source, { ...input, pluginId: loc.pluginId }), { filename: `${loc.pluginId}/${loc.file}` })
    script.runInContext(context, { timeout: HOOK_TIMEOUT_MS, displayErrors: true })
    const raw = contextPayload['__result']
    if (typeof raw !== 'string') {
      return { ok: false, error: `钩子必须返回字符串代码，收到 ${raw === undefined ? 'undefined（忘了 return？）' : typeof raw}`, ms: Date.now() - started }
    }
    if (raw.length > HOOK_SOURCE_MAX_BYTES * 4) {
      return { ok: false, error: '钩子输出过大，已拒绝', ms: Date.now() - started }
    }
    return { ok: true, code: raw, ms: Date.now() - started }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const timedOut = /timed out/i.test(message)
    const error = timedOut ? `钩子 ${loc.file} 执行超过 ${HOOK_TIMEOUT_MS}ms，已被强制终止` : `钩子 ${loc.file} 执行失败：${message}`
    logger.warn('PLUGIN', error, `插件 ${loc.pluginId}`)
    return { ok: false, error, ms: Date.now() - started }
  }
}

/** 读文件 + 静态体检 + 沙箱执行；路径不合法或读失败都只回错，不抛异常 */
export function runEmitHook(loc: HookLocation, input: HookInput): HookOutcome {
  const started = Date.now()
  const path = resolveHookPath(loc)
  if (!path.ok) {
    logger.warn('PLUGIN', `插件钩子路径被拒绝：${path.error}`, loc.pluginId)
    return { ok: false, error: path.error, ms: Date.now() - started }
  }
  let source: string
  try {
    const buffer = readFileSync(path.full)
    if (buffer.byteLength > HOOK_SOURCE_MAX_BYTES) {
      return { ok: false, error: `钩子文件超过 ${HOOK_SOURCE_MAX_BYTES} 字节上限，已拒绝`, ms: Date.now() - started }
    }
    source = buffer.toString('utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('PLUGIN', `插件钩子文件读取失败：${path.full}`, message)
    return { ok: false, error: `钩子文件读取失败：${message}`, ms: Date.now() - started }
  }
  return runHookSource(loc, source, input)
}
