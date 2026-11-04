/**
 * 模式 A：KubeJS 脚本发射器（规格 3.7）。三条通道的表达式形态都从这里出：
 * - 语法糖：按 `emitTarget` 生成 `event.shaped(...)` / `event.recipes.<ns>.<method>(...)` + 链式修饰符；
 * - `event.custom({...})`：复用数据包序列化（原样 JSON，参数不丢）；
 * - `event.remove({...})`：移除配方。
 *
 * 生成规则（3.7 全部实现）：有序合成裁剪空白行列且 key 只留实际使用的符号、数量 1 省略 `1x `、
 * 流体 `Fluid.of('ns:fluid', mb)`、标签 `#ns:tag`、多材料数组、数字不加引号、
 * 注册表按 `emitShape` 分 scalar / object / positional、物品 `count` 与流体/灌注 `amount` 绝不互换。
 */
import { formatCountPrefix } from '../../shared/text'
import { trimShape } from '../../shared/shape'
import type {
  GenerationChannel,
  ModpackInfo,
  RecipeSlotSchema,
  RecipeTypeSchema,
  SlotValue,
  WorkbenchState
} from '../../shared/types'
import { buildHeader, wrapScript } from './scriptBlock'
import { buildRecipeJson } from './emitDatapack'
import { jsLiteral, jsObjectLines, jsString } from './jsLiteral'
import { referenceKeyOf } from './jsonValue'
import type { Plain } from './values'
import {
  amountOf,
  countOf,
  fullId,
  gridCells,
  gridSize,
  isBlank,
  modifierEntries,
  plainOf,
  slotList
} from './values'

/** 语法糖调用内的相对缩进；外层 2 空格由 wrapScript 统一补齐 */
const INNER = '  '

const VANILLA_TARGETS: Record<string, string> = {
  'minecraft:crafting_shaped': 'event.shaped',
  'minecraft:crafting_shapeless': 'event.shapeless',
  'minecraft:smelting': 'event.smelting',
  'minecraft:blasting': 'event.blasting',
  'minecraft:smoking': 'event.smoking',
  'minecraft:campfire_cooking': 'event.campfire_cooking',
  'minecraft:stonecutting': 'event.stonecutting',
  'kubejs:remove': 'event.remove'
}

export interface ScriptEmit {
  /** 完整脚本（含头部注释块与事件块）；失败时为空串 */
  code: string
  header: string
  /** 事件块内的语句（追加写入时按行插入） */
  statements: string[]
  notes: string[]
  /** 无法生成语句的原因（预览显示为 error 诊断，写盘被阻断） */
  error: string | null
}

/** 槽位 → 语法糖表达式；物品用 `count`（`Nx ` 前缀），流体/灌注用 `amount`，绝不互换 */
function slotExpression(sv: SlotValue, field?: RecipeSlotSchema): string {
  const count = countOf(sv)
  const amount = amountOf(sv)
  switch (sv.kind) {
    case 'fluid':
      return amount === undefined
        ? `Fluid.of(${jsString(fullId(sv.id))})`
        : `Fluid.of(${jsString(fullId(sv.id))}, ${amount})`
    case 'tag':
      return jsString(formatCountPrefix(`#${fullId(sv.id)}`, count ?? 1))
    case 'registry':
      return registryExpression(sv, field, amount)
    default:
      return jsString(formatCountPrefix(fullId(sv.id), count ?? 1))
  }
}

/** 注册表三形态（规格 3.7）：scalar / positional 都是「独立字符串参数（+ 独立用量参数）」，object 打包成对象 */
function registryExpression(sv: SlotValue, field: RecipeSlotSchema | undefined, amount: number | undefined): string {
  const shape = field?.emitShape ?? 'scalar'
  if (shape !== 'object') return jsString(fullId(sv.id))
  const key = referenceKeyOf(sv, field ?? { key: sv.id, displayName: sv.id, kind: 'registry', multiple: false })
  const obj: Record<string, Plain> = { [key]: fullId(sv.id) }
  if (amount !== undefined) obj['amount'] = amount
  return jsLiteral(obj)
}

function isReferenceField(field: RecipeSlotSchema): boolean {
  return field.kind === 'item' || field.kind === 'fluid' || field.kind === 'tag' || field.kind === 'registry'
}

/** 一个字段 → 0..n 个语法糖参数（scalar/positional 注册表会拆出独立的用量参数） */
function fieldArguments(field: RecipeSlotSchema, value: unknown, args: string[]): void {
  if (isBlank(value)) return
  if (isReferenceField(field)) {
    const list = slotList(value)
    if (list.length === 0) return
    const exprs = list.map((sv) => slotExpression(sv, field))
    const wantsArray = field.multiple === true || Array.isArray(value)
    const registrySplit = field.kind === 'registry' && (field.emitShape ?? 'scalar') !== 'object'
    if (exprs.length === 1 && !wantsArray) {
      args.push(exprs[0] as string)
      const amount = amountOf(list[0] as SlotValue)
      if (registrySplit && amount !== undefined) args.push(String(amount))
      return
    }
    args.push(`[${exprs.join(', ')}]`)
    if (registrySplit) {
      const amounts = list.map((sv) => amountOf(sv))
      if (amounts.some((a) => a !== undefined)) args.push(`[${amounts.map((a) => a ?? 0).join(', ')}]`)
    }
    return
  }
  const list = Array.isArray(value) ? value : [value]
  const exprs = list.map((item) => {
    if (typeof item === 'number') return Number.isFinite(item) ? String(item) : '0'
    if (typeof item === 'boolean') return String(item)
    if (typeof item === 'string') return jsString(item)
    return jsLiteral(plainOf(item) ?? 'null')
  })
  if (list.length > 1 || Array.isArray(value)) args.push(`[${exprs.join(', ')}]`)
  else args.push(exprs[0] as string)
}

function groupArguments(fields: RecipeSlotSchema[], workbench: WorkbenchState): string[] {
  const args: string[] = []
  for (const field of fields) {
    if (field.key === 'grid') continue
    fieldArguments(field, workbench.values[field.key], args)
  }
  return args
}

/** 链式修饰符按 schema 声明顺序追加在调用末尾（规格 3.4 / 3.7） */
function chainOf(schema: RecipeTypeSchema, workbench: WorkbenchState, notes: string[]): string {
  let chain = ''
  for (const entry of modifierEntries(schema, workbench)) {
    if (entry.schema.chain === null) {
      notes.push(`修饰符 ${entry.schema.key} 无语法糖链式写法，只能进 JSON 字段`)
      continue
    }
    const name = entry.schema.chain ?? entry.schema.key
    if (typeof entry.value === 'boolean') chain += `.${name}()`
    else if (typeof entry.value === 'number') chain += `.${name}(${entry.value})`
    else chain += `.${name}(${jsString(entry.value)})`
  }
  return chain
}

/** 参数 ≤2 且无链式修饰符 → 单行；否则参数逐行（与 §一 mixing 示例一致） */
function renderCall(target: string, args: string[], chain: string): string {
  if (args.length === 0) return `${target}()${chain}`
  if (args.length <= 2 && chain.length === 0) return `${target}(${args.join(', ')})${chain}`
  const body = args.map((a) => `${INNER}${a}`).join(',\n')
  return `${target}(\n${body}\n)${chain}`
}

function shapedStatement(schema: RecipeTypeSchema, workbench: WorkbenchState, notes: string[]): string | null {
  const target = resolveSugarTarget(schema) ?? 'event.shaped'
  const { rows, cols } = gridSize(workbench)
  const shape = trimShape(gridCells(workbench), rows, cols)
  if (!shape.ok) return null
  const result = resultArgument(schema, workbench, notes)
  if (result === null) return null
  const pattern = shape.pattern.map((row) => `${INNER}${jsString(row)}`).join(',\n')
  const keyEntries = Object.entries(shape.key)
    .map(([letter, value]) => `${letter}: ${jsString(value)}`)
    .join(', ')
  return `${target}(${result}, [\n${pattern}\n], { ${keyEntries} })${chainOf(schema, workbench, notes)}`
}

/** 语法糖第一个参数是产物；单产物给标量、多产物给数组（KubeJS 通用约定） */
function resultArgument(schema: RecipeTypeSchema, workbench: WorkbenchState, notes: string[]): string | null {
  const fields = schema.outputs.length > 0 ? schema.outputs : []
  for (const field of fields) {
    const list = slotList(workbench.values[field.key])
    if (list.length === 1) return slotExpression(list[0] as SlotValue, field)
    if (list.length > 1) return `[${list.map((sv) => slotExpression(sv, field)).join(', ')}]`
  }
  const args = groupArguments(schema.outputs, workbench)
  if (args.length > 0) return args[0] as string
  notes.push('缺少产物：语法糖调用的第一个参数必须是产物，请在产物槽放入物品或流体')
  return null
}

/** `event.remove({ id: '…' })`：移除过滤器只接受字面量对象，按用户填了的键原样给出 */
function removeStatement(workbench: WorkbenchState): string | null {
  const preferred = ['id', 'type', 'mod', 'input', 'output']
  const pairs = new Map<string, string>()
  const push = (key: string, value: unknown): void => {
    if (typeof value === 'string' && value.trim()) pairs.set(key, jsString(value.trim()))
    else if (typeof value === 'number' || typeof value === 'boolean') pairs.set(key, String(value))
  }
  for (const key of preferred) push(key, workbench.values[key])
  for (const [key, value] of Object.entries(workbench.values)) {
    if (key === 'grid' || pairs.has(key)) continue
    push(key, value)
  }
  if (pairs.size === 0) return null
  return `event.remove({ ${[...pairs.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')} })`
}

/**
 * P3-17：emitTarget 会被原样拼进生成的 JS 表达式，只接受 `event.<ident>(.<ident>)*` 形态。
 * 插件提供的非法/注入值一律视同「无语法糖」，回退 event.custom；合法值逐字保留，产出不变。
 */
const SAFE_EMIT_TARGET = /^event(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/

export function resolveSugarTarget(schema: RecipeTypeSchema): string | null {
  const declared = schema.emitTarget ?? VANILLA_TARGETS[schema.id] ?? null
  if (declared === null) return null
  return SAFE_EMIT_TARGET.test(declared) ? declared : null
}

function finished(header: string, mcVersion: string | null, statements: string[], notes: string[], error: string | null): ScriptEmit {
  return { code: error === null ? wrapScript(header, mcVersion, statements) : '', header, statements: error === null ? statements : [], notes, error }
}

export function emitScript(
  schema: RecipeTypeSchema,
  workbench: WorkbenchState,
  channel: GenerationChannel,
  modpack: ModpackInfo | null,
  createdAtMs = Date.now()
): ScriptEmit {
  const header = buildHeader(modpack, createdAtMs)
  const mcVersion = modpack?.mcVersion ?? null
  const notes: string[] = []
  const target = resolveSugarTarget(schema)
  const isRemove = target === 'event.remove'

  if (channel === 'datapack-json') {
    return finished(header, mcVersion, [], ['数据包 JSON 通道不生成脚本，按文件写出'], null)
  }
  if (channel === 'event-custom' || (!target && !isRemove)) {
    const built = buildRecipeJson(schema, workbench)
    if (schema.emitTarget) notes.push('为保留用户填写的全部参数，已改用 event.custom')
    const statement = `event.custom({\n${jsObjectLines(built.json, 2).join(',\n')}\n})`
    return finished(header, mcVersion, [statement], notes, null)
  }
  if (isRemove) {
    const statement = removeStatement(workbench)
    if (statement === null) return finished(header, mcVersion, [], notes, '移除配方至少需要填写 id / type / mod 之一')
    notes.push('event.remove 在配方注册后统一执行，不受文件名顺序影响；多个脚本 remove 同一 ID 时后执行者生效')
    return finished(header, mcVersion, [statement], notes, null)
  }

  if (schema.layoutKind === 'shaped') {
    const statement = shapedStatement(schema, workbench, notes)
    if (statement === null) return finished(header, mcVersion, [], notes, '有序合成网格为空或产物未填，无法生成 pattern')
    return finished(header, mcVersion, [statement], notes, null)
  }

  const outputArgs = groupArguments(schema.outputs, workbench)
  const restArgs = [...groupArguments(schema.slots, workbench), ...groupArguments(schema.extraFields ?? [], workbench)]
  const args = [...outputArgs, ...restArgs]
  if (schema.outputs.length > 0 && outputArgs.length === 0 && args.length > 0) {
    notes.push('产物未填：语法糖调用缺少产物参数，游戏中会报错')
  }
  if (args.length === 0) {
    const single = resultArgument(schema, workbench, notes)
    if (single === null) return finished(header, mcVersion, [], notes, `工作台为空，无法生成 ${target ?? 'event.recipes'} 调用`)
    return finished(header, mcVersion, [`${target}(${single})${chainOf(schema, workbench, notes)}`], notes, null)
  }
  const statement = renderCall(target ?? 'event.custom', args, chainOf(schema, workbench, notes))
  return finished(header, mcVersion, [statement], notes, null)
}
