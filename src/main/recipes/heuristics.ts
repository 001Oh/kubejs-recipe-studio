/**
 * 通用启发式提取器（规格 3.2 源 C 核心）。纯函数：输入 type + 配方 JSON 对象，
 * 输出产物/材料摘要。禁止按 modId 或 type 分支——识别只依赖键名语义与值形态
 * （规格 §3.6.12 的 9 种原语在摘要层面折叠进 item/fluid/tag/registry 四种 kind）。
 */
import type { RecipeIO } from '../../shared/types'

export interface HeuristicResult {
  outputs: RecipeIO[]
  inputs: RecipeIO[]
  partial: boolean
  unknownIds: string[]
}

type Role = 'output' | 'input'
interface Quant {
  count?: number
  chance?: number
}

const ID_RE = /^[a-z0-9_.-]+:[a-z0-9_.\-/]+$/
/** 优先输出字段；都没有时再按键名语义收集（规格：键名「含」result|output|to|produce） */
const PRIORITY_OUTPUT_KEYS = ['result', 'results', 'output', 'outputs', 'output_item', 'main_output']
/** 子串即命中（英文语义词根，不是模组字段表）；slag/waste/secondaries 等为通用固废/副产物词 */
const OUTPUT_SUBSTR = ['result', 'output', 'product', 'produce', 'drop', 'slag', 'waste', 'residue', 'secondar']
const INPUT_SUBSTR = ['ingredient', 'catalyst', 'addit', 'template', 'tool']
/** 须整词命中（防 'total' 误中 'to'、'baseline' 误中 'base'） */
const OUTPUT_WORDS = new Set(['to'])
const INPUT_WORDS = new Set(['input', 'inputs', 'key', 'keys', 'base', 'bases'])
/** 递归中跳过的数值/杂项键 */
const SKIP_WORDS = new Set(['nbt', 'count', 'amount', 'size', 'chance', 'probability', 'condition', 'conditions', 'cookingtime', 'time', 'energy', 'xp', 'experience'])
/** 未知键里出现的「几乎必非物品引用」的元数据键（group/category/conditions 等值可能长得像 id） */
const META_WORDS = new Set(['group', 'category', 'namespace', 'mod', 'modid', 'mods', 'loader', 'version', 'pack_format', 'condition', 'conditions', 'type', 'values'])

interface Ctx {
  outputs: RecipeIO[]
  inputs: RecipeIO[]
  unknown: Set<string>
  partial: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}
function words(key: string): string[] {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0)
}
function singular(w: string): string {
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.endsWith('es')) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}
function keyMatches(key: string, substrs: string[], wordSet: Set<string>): boolean {
  const lower = key.toLowerCase()
  if (substrs.some((s) => lower.includes(s))) return true
  return words(key).some((w) => wordSet.has(w) || wordSet.has(singular(w)))
}
function isOutputName(key: string): boolean {
  return keyMatches(key, OUTPUT_SUBSTR, OUTPUT_WORDS)
}
function isInputName(key: string): boolean {
  return keyMatches(key, INPUT_SUBSTR, INPUT_WORDS)
}
function readNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    // 规格 IP 蒸馏塔：chance 可能是字符串 "0.07"，同样必须解析成数值
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  }
  return undefined
}

function pushRef(ctx: Ctx, role: Role, id: string, kind: RecipeIO['kind'], q: Quant): void {
  if (!isId(id)) {
    ctx.partial = true
    return
  }
  const count = q.count !== undefined && q.count > 0 ? q.count : 1
  let chance = q.chance
  if (chance !== undefined && !Number.isFinite(chance)) {
    ctx.partial = true
    chance = undefined
  }
  const io: RecipeIO = { id, count, kind, ...(chance !== undefined ? { chance } : {}) }
  if (role === 'output') ctx.outputs.push(io)
  else ctx.inputs.push(io)
}

function stateProps(obj: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'id' || k === 'keep') continue
    if (Array.isArray(v) || isRecord(v)) return true // moisture:{min,max} 之类方块属性
  }
  return false
}

function hintKind(hint: string | undefined): RecipeIO['kind'] {
  if (!hint) return 'item'
  const lower = hint.toLowerCase()
  if (lower.includes('tag')) return 'tag'
  if (lower.includes('fluid') || lower.includes('gas')) return 'fluid'
  if (lower.includes('block') || words(hint).includes('state')) return 'registry'
  return 'item'
}

/** 主递归：任意形态值 → 按角色收集物品引用；配对数量/概率沿包装键向下继承（§3.6.12） */
function addRefs(value: unknown, role: Role, ctx: Ctx, hint: string | undefined, inh: Quant | undefined): void {
  if (typeof value === 'string') {
    if (isId(value)) pushRef(ctx, role, value, hintKind(hint), { count: inh?.count, chance: inh?.chance })
    else ctx.partial = true
    return
  }
  if (Array.isArray(value)) {
    for (const el of value) addRefs(el, role, ctx, hint, inh)
    return
  }
  if (!isRecord(value)) return
  addObject(value, role, ctx, hint, inh)
}

function addObject(obj: Record<string, unknown>, role: Role, ctx: Ctx, hint: string | undefined, inh: Quant | undefined): void {
  const q: Quant = {
    count: readNumber(obj, ['count', 'amount', 'size']) ?? inh?.count,
    chance: readNumber(obj, ['chance', 'probability']) ?? inh?.chance
  }
  const consumed = new Set<string>()
  for (const key of ['item', 'tag', 'fluid', 'gas', 'block'] as const) {
    const v = obj[key]
    if (v === undefined) continue
    const kind: RecipeIO['kind'] = key === 'item' ? 'item' : key === 'tag' ? 'tag' : key === 'block' ? 'registry' : 'fluid'
    if (typeof v === 'string') pushRef(ctx, role, v, kind, q)
    else addRefs(v, role, ctx, key, q)
    consumed.add(key)
  }
  const stack = obj.fluidStack ?? obj.fluidstack
  if (isRecord(stack)) {
    const f = stack.fluid
    if (typeof f === 'string') {
      pushRef(ctx, role, f, 'fluid', { count: readNumber(stack, ['amount', 'count']) ?? q.count, chance: q.chance })
    } else if (f !== undefined) ctx.partial = true
    consumed.add('fluidStack')
    consumed.add('fluidstack')
  }
  if (Array.isArray(obj.items)) {
    for (const el of obj.items) addRefs(el, role, ctx, 'item', q)
    consumed.add('items')
  }
  if (typeof obj.id === 'string' && !consumed.has('block')) {
    pushRef(ctx, role, obj.id, hint === 'block' || stateProps(obj) ? 'registry' : 'item', q)
    consumed.add('id')
  }
  // 对象自身含 type → 嵌套配方（Create 序列组装步骤）：标 partial，其余键继续下钻，其 id 是配方 id 不是物品
  const nested = typeof obj.type === 'string' && isId(obj.type)
  if (nested) {
    ctx.partial = true
    consumed.add('type')
    consumed.add('id')
  }
  recurseRest(obj, role, ctx, q, consumed, nested)
}

function recurseRest(obj: Record<string, unknown>, role: Role, ctx: Ctx, q: Quant, consumed: Set<string>, nested: boolean): void {
  for (const [k, v] of Object.entries(obj)) {
    if (consumed.has(k) || words(k).some((w) => SKIP_WORDS.has(w))) continue
    if (nested && (k === 'id' || k === 'uid' || k === 'namespace')) continue
    addRefs(v, role, ctx, k, q)
  }
}

/** pattern×key 展开：空格占位跳过；未映射字符标 partial */
function expandPattern(pattern: unknown, key: unknown, ctx: Ctx): boolean {
  if (!Array.isArray(pattern) || !isRecord(key)) return false
  for (const row of pattern) {
    if (typeof row !== 'string') {
      ctx.partial = true
      continue
    }
    for (const ch of row) {
      if (ch === ' ') continue
      const mapped = key[ch]
      if (mapped === undefined) {
        ctx.partial = true
        continue
      }
      addRefs(mapped, 'input', ctx, 'key', undefined)
    }
  }
  return true
}

/** 未命中键名语义的字段：抽其中的引用形态进 unknownIds（不建索引、标 partial，供 UI 显示 ⚠） */
function collectIds(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (isId(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const el of value) collectIds(el, out)
    return
  }
  if (!isRecord(value)) return
  for (const key of ['item', 'tag', 'id', 'fluid', 'gas'] as const) {
    const v = value[key]
    if (typeof v === 'string' && isId(v)) {
      out.add(v)
      return
    }
  }
  for (const [k, v] of Object.entries(value)) {
    if (isMetaKey(k)) continue
    collectIds(v, out)
  }
}

function isMetaKey(key: string): boolean {
  return words(key).some((w) => META_WORDS.has(w) || META_WORDS.has(singular(w)))
}

function isRecipeWrapperKey(key: string): boolean {
  return words(key).some((w) => w === 'recipe' || w === 'recipes')
}

/** recipe/recipes 包装键（forge:conditional 等加载器通用形态，§3.6.12 nested recipe 原语）：
 *  下钻到内层配方对象按同一规则再解析一遍；仅剥离包装，不因此标 partial。 */
function unwrapNested(value: unknown, ctx: Ctx, depth: number): void {
  if (depth > 3) {
    ctx.partial = true
    return
  }
  if (Array.isArray(value)) {
    for (const el of value) unwrapNested(el, ctx, depth + 1)
    return
  }
  if (!isRecord(value)) return
  for (const [k, v] of Object.entries(value)) {
    if (isRecipeWrapperKey(k)) {
      unwrapNested(v, ctx, depth + 1)
      return
    }
  }
  if (typeof value.type === 'string' && isId(value.type)) {
    classifyRecipeObject(value, ctx, depth + 1)
    return
  }
  classifyRecipeObject(value, ctx, depth + 1)
}

/**
 * B120/D-03：解出条件包装（`forge:conditional` 等）的**内层配方对象与 type**。
 *
 * IO 提取侧的剥包装早已有（`unwrapNested`），缺的是类型归类这半边——record 长期把
 * 上千条包装配方记成假类型。这里只认**精确键名** `recipe` / `recipes`（比提取侧的
 * 词形匹配更严：归类错了比提取错更难察觉），且终点必须带合法 id 形态的 `type`，
 * 否则返回 null 维持外层类型，不强行归类。`recipes` 数组形态取首元素。
 * 深度：实包（Ad-Astra Giselle 兼容层）存在双层包装
 * `forge:conditional → recipes[] → {conditions, recipe:{type…}}`，与 unwrapNested 同限 3 层。
 */
export function unwrapRecipe(json: unknown): { type: string; recipe: Record<string, unknown> } | null {
  return unwrapRecipeType(json, 0)
}

function unwrapRecipeType(value: unknown, depth: number): { type: string; recipe: Record<string, unknown> } | null {
  if (depth > 3 || !isRecord(value)) return null
  for (const key of ['recipe', 'recipes'] as const) {
    if (!(key in value)) continue
    const raw = value[key]
    const first = Array.isArray(raw) ? raw[0] : raw
    if (!isRecord(first)) return null
    if (typeof first['type'] === 'string' && isId(first['type'])) {
      return { type: first['type'], recipe: first }
    }
    return unwrapRecipeType(first, depth + 1)
  }
  return null
}

/** 单个配方对象（含条件包装剥开后的内层）的完整分类流程 */
function classifyRecipeObject(json: Record<string, unknown>, ctx: Ctx, depth: number): void {
  const consumed = new Set<string>()
  if ('key' in json && !('pattern' in json) && isRecord(json.key)) {
    // 无 pattern 的 key 映射（部分模组的命名槽）：全部值按输入收集
    for (const v of Object.values(json.key)) addRefs(v, 'input', ctx, 'key', undefined)
    consumed.add('key')
  } else if ('pattern' in json || 'key' in json) {
    if (!expandPattern(json.pattern, json.key, ctx)) ctx.partial = true
    if ('pattern' in json) consumed.add('pattern')
    if ('key' in json) consumed.add('key')
  }
  for (const [k, v] of Object.entries(json)) {
    if (consumed.has(k) || k === 'type') continue
    if (PRIORITY_OUTPUT_KEYS.includes(k) || isOutputName(k)) {
      addRefs(v, 'output', ctx, k, undefined)
      consumed.add(k)
    } else if (isInputName(k)) {
      addRefs(v, 'input', ctx, k, undefined)
      consumed.add(k)
    }
  }
  for (const [k, v] of Object.entries(json)) {
    if (consumed.has(k) || k === 'type' || isMetaKey(k)) continue
    if (isRecipeWrapperKey(k)) {
      unwrapNested(v, ctx, depth)
      continue
    }
    // 未识别键：引用形态照常登记 unknownIds（UI ⚠ 提示），但已提取到产物时不视为解析失败
    const found = new Set<string>()
    collectIds(v, found)
    for (const id of found) ctx.unknown.add(id)
  }
}

export function extractRecipeIo(type: string, json: unknown): HeuristicResult {
  const ctx: Ctx = { outputs: [], inputs: [], unknown: new Set<string>(), partial: false }
  // 缺 type 无法归类才算解析不完整；部分数据包写裸类型名（无命名空间）属合法变体，不标 partial
  if (typeof type !== 'string' || type === '') ctx.partial = true
  if (!isRecord(json)) return { outputs: [], inputs: [], partial: true, unknownIds: [] }
  classifyRecipeObject(json, ctx, 0)
  // 「解析不了不中断」：产物为空即视为不完整，但已提取到的 ID 照常返回供建索引
  if (ctx.outputs.length === 0) ctx.partial = true
  return { outputs: ctx.outputs, inputs: ctx.inputs, partial: ctx.partial, unknownIds: [...ctx.unknown].sort() }
}
