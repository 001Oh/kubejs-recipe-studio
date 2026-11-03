/**
 * 源 C ③：KubeJS 脚本静态解析（规格 3.2 源 C「尽力而为」）。
 * acorn（ecmaVersion:'latest'，sourceType:'script'）遍历 AST，识别
 * `event.<method>` 与 `event.recipes.<ns>.<method>`；只取字面量参数，
 * 遇到变量/函数调用/模板插值 → partial 并保留已解析部分；单文件失败记 WARN 跳过。
 */
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'acorn'
import type { ArrayExpression, CallExpression, Expression, Identifier, Literal, MemberExpression, Node, ObjectExpression, Property, Super, TemplateLiteral, UnaryExpression } from 'acorn'
import type { ModpackInfo } from '../../shared/types'
import { logger } from '../logger'
import { extractRecipeIo, type HeuristicResult } from './heuristics'
import { RANK_KUBEJS_SCRIPT, type CollectedRecipe, type ScanHooks } from './jsonSource'

/** KubeJS 内置事件方法 → 配方类型（这是 KubeJS API 名，不是模组分支表） */
const BUILTIN_METHODS: Record<string, string> = {
  shaped: 'minecraft:crafting_shaped',
  shapeless: 'minecraft:crafting_shapeless',
  smelting: 'minecraft:smelting',
  blasting: 'minecraft:blasting',
  smoking: 'minecraft:smoking',
  campfire_cooking: 'minecraft:campfire_cooking',
  stonecutting: 'minecraft:stonecutting',
  smithing: 'minecraft:smithing',
  custom: 'kubejs:custom'
}
const FURNACE_METHODS = new Set(['smelting', 'blasting', 'smoking', 'campfire_cooking'])

export interface ScriptRecipeHit {
  /** 相对 kubejs/ 的脚本路径推导出的 KubeJS 运行时配方 ID 尾段 */
  index: number
  type: string
  result: HeuristicResult
}

interface LitValue {
  value: unknown
  dynamic: boolean
}

const COUNT_PREFIX_RE = /^(\d+)\s*[xX]\s+([a-z0-9_.-]+:[a-z0-9_.\-/]+)$/

function lit(value: unknown): LitValue {
  return { value, dynamic: false }
}
const DYN: LitValue = { value: undefined, dynamic: true }
/** 动态参数占位符：保持位置，避免后续字面量参数错位 */
const MISSING = Symbol('missing')

function toLiteral(node: Node | null | undefined): LitValue {
  if (!node) return DYN
  switch (node.type) {
    case 'Literal': {
      const raw = (node as Literal).value
      if (typeof raw === 'string') {
        const m = COUNT_PREFIX_RE.exec(raw)
        if (m) return lit({ item: m[2], count: Number(m[1]) })
        return lit(raw)
      }
      if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) return lit(raw)
      return DYN
    }
    case 'UnaryExpression': {
      const u = node as UnaryExpression
      if ((u.operator === '-' || u.operator === '+') && u.argument.type === 'Literal' && typeof u.argument.value === 'number') {
        return lit(u.operator === '-' ? -u.argument.value : u.argument.value)
      }
      return DYN
    }
    case 'ArrayExpression': {
      let dynamic = false
      const items: unknown[] = []
      for (const el of (node as ArrayExpression).elements) {
        const r = el ? toLiteral(el) : DYN
        if (r.dynamic) dynamic = true
        else items.push(r.value)
      }
      return { value: items, dynamic }
    }
    case 'ObjectExpression': {
      let dynamic = false
      const obj: Record<string, unknown> = {}
      for (const p of (node as ObjectExpression).properties as Property[]) {
        const keyName =
          !p.computed && p.kind === 'init'
            ? p.key.type === 'Identifier'
              ? (p.key as Identifier).name
              : p.key.type === 'Literal'
                ? String((p.key as Literal).value)
                : null
            : null
        if (keyName === null) {
          dynamic = true
          continue
        }
        const r = toLiteral(p.value)
        if (r.dynamic) dynamic = true
        else obj[keyName] = r.value
      }
      return { value: obj, dynamic }
    }
    case 'TemplateLiteral': {
      const t = node as TemplateLiteral
      if (t.expressions.length === 0) return lit(t.quasis.map((q) => q.value.cooked ?? q.value.raw).join(''))
      return DYN
    }
    default:
      return DYN
  }
}

function memberChain(callee: Expression | Super): string[] | null {
  const chain: string[] = []
  let cur: Expression | Super = callee
  for (;;) {
    if (cur.type === 'MemberExpression') {
      const me = cur as MemberExpression
      if (me.computed && me.property.type !== 'Literal') return null
      const prop =
        me.computed && me.property.type === 'Literal'
          ? String((me.property as Literal).value)
          : me.property.type === 'Identifier'
            ? (me.property as Identifier).name
            : null
      if (prop === null) return null
      chain.unshift(prop)
      cur = me.object
      continue
    }
    if (cur.type === 'Identifier') {
      chain.unshift((cur as Identifier).name)
      return chain
    }
    return null
  }
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v]
}

/** 把一次语法糖调用的字面量参数折算成伪配方 JSON，再走统一的启发式提取器 */
function pseudoJson(kind: 'shaped' | 'shapeless' | 'furnace' | 'generic' | 'custom', args: unknown[]): unknown {
  const isObj = (a: unknown): boolean => typeof a === 'object' && a !== null && !Array.isArray(a)
  if (kind === 'custom') {
    const obj = args.find(isObj)
    return obj ?? { type: 'kubejs:custom' }
  }
  const result = args[0]
  if (kind === 'shaped') {
    const pattern = args.length >= 2 && Array.isArray(args[1]) && asArray(args[1]).every((r) => typeof r === 'string') ? asArray(args[1]) : []
    const key = args.find((a, i) => i > 1 && isObj(a))
    return { result, pattern, key }
  }
  if (kind === 'furnace') return { result, ingredient: args[1] }
  const rest = args.slice(1).filter((a) => a !== undefined && a !== null && typeof a !== 'number' && typeof a !== 'symbol' && typeof a !== 'boolean')
  const ingredients = rest.flatMap((a) => asArray(a))
  return kind === 'shapeless' ? { result, ingredients } : { result, ingredients }
}

function classifyBuiltin(method: string): 'shaped' | 'shapeless' | 'furnace' | 'generic' | 'custom' {
  if (method === 'shaped') return 'shaped'
  if (method === 'shapeless') return 'shapeless'
  if (FURNACE_METHODS.has(method)) return 'furnace'
  if (method === 'custom') return 'custom'
  return 'generic'
}

export function parseKubejsScript(code: string, scriptRelPath: string): ScriptRecipeHit[] {
  let program: Node
  try {
    program = parse(code, { ecmaVersion: 'latest', sourceType: 'script' })
  } catch (err) {
    logger.warn('INDEX', `${scriptRelPath} 无法静态解析，已跳过`, err instanceof Error ? err.message : String(err))
    return []
  }
  const hits: ScriptRecipeHit[] = []
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const el of n) visit(el)
      return
    }
    const node = n as Record<string, unknown>
    if (typeof node.type !== 'string') return
    if (node.type === 'CallExpression') handleCall(node as unknown as CallExpression)
    for (const [k, v] of Object.entries(node)) {
      if (k === 'type' || k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue
      visit(v)
    }
  }
  const handleCall = (call: CallExpression): void => {
    const chain = memberChain(call.callee)
    if (!chain || chain.length < 2 || chain[0] !== 'event') return
    let type = ''
    let kind: 'shaped' | 'shapeless' | 'furnace' | 'generic' | 'custom' = 'generic'
    let dynamic = false
    const args: unknown[] = []
    for (const a of call.arguments) {
      const r = toLiteral(a)
      if (r.dynamic) {
        dynamic = true
        args.push(MISSING)
      } else args.push(r.value)
    }
    if (chain.length === 2) {
      const method = chain[1]
      if (method in BUILTIN_METHODS) {
        type = BUILTIN_METHODS[method]
        kind = classifyBuiltin(method)
      } else return
    } else if (chain.length === 4 && chain[1] === 'recipes') {
      const ns = chain[2]
      const method = chain[3]
      type = `${ns}:${method}`
      kind = classifyBuiltin(method)
      if (kind === 'generic' && args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
        const obj = args[0] as Record<string, unknown>
        if (typeof obj.type === 'string') type = obj.type
        kind = 'custom'
      }
    } else return
    const json = pseudoJson(kind, args)
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      const inner = (json as Record<string, unknown>).type
      if (typeof inner === 'string' && inner.includes(':')) type = inner
    }
    const result = extractRecipeIo(type, json)
    if (dynamic) result.partial = true
    hits.push({ index: hits.length, type, result })
  }
  visit(program)
  return hits
}

async function findScripts(dir: string, base: string, out: string[]): Promise<void> {
  let names: string[]
  try {
    names = await fsp.readdir(dir)
  } catch {
    return
  }
  for (const name of names.sort()) {
    const abs = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    let st
    try {
      st = await fsp.stat(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) await findScripts(abs, rel, out)
    else if (name.toLowerCase().endsWith('.js')) out.push(abs)
  }
}

export async function scanScriptRecipes(modpack: ModpackInfo, hooks: ScanHooks): Promise<CollectedRecipe[]> {
  const root = join(modpack.path, 'kubejs', 'server_scripts')
  const files: string[] = []
  await findScripts(root, '', files)
  const out: CollectedRecipe[] = []
  for (let i = 0; i < files.length; i++) {
    if (hooks.isAborted?.()) throw new Error('已取消：配方扫描')
    const abs = files[i]
    hooks.onProgress?.(`解析 KubeJS 脚本 ${i + 1}/${files.length}`, i + 1, Math.max(files.length, 1))
    let code: string
    try {
      code = await fsp.readFile(abs, 'utf8')
    } catch (err) {
      logger.warn('INDEX', `脚本读取失败，已跳过：${abs}`, err instanceof Error ? err.message : String(err))
      continue
    }
    const rel = abs.slice(root.length + 1).replace(/\\/g, '/')
    for (const hit of parseKubejsScript(code, rel)) {
      const recipeId = `kubejs:${rel}#${hit.index}`
      const uid = `file:${abs.replace(/\\/g, '/')}#recipe#${hit.index}`
      out.push({
        record: {
          uid,
          recipeId,
          type: hit.type,
          outputs: hit.result.outputs,
          inputs: hit.result.inputs,
          source: 'kubejs',
          sourcePath: abs.replace(/\\/g, '/'),
          partial: hit.result.partial,
          ...(hit.result.unknownIds.length > 0 ? { unknownIds: hit.result.unknownIds } : {})
        },
        loadRank: RANK_KUBEJS_SCRIPT,
        orderKey: `${uid}`
      })
    }
  }
  return out
}
