/**
 * 写盘前的两道闸（规格 3.7 / 3.6.11 / 禁止事项 5）：
 * 1. `checkSyntax`：acorn（`ecmaVersion:'latest'`, `sourceType:'script'`）语法预检，失败给出行号；
 *    数据包通道没有 JS，改跑 JSON.parse，同样定位行号。
 * 2. `validateSemantics`：完全基于反推 schema 的语义校验，与任何附属 API 无关——
 *    必填齐全、数组/单值形态匹配、引用 ID 是否存在于索引（不存在只警告）、流体量为正整数、概率区间合法。
 */
import { parse } from 'acorn'
import { GRID_MAX_SIZE } from '../../shared/constants'
import type { Diagnostic } from '../../shared/ipc'
import type { GenerationChannel, RecipeSlotSchema, RecipeTypeSchema, WorkbenchState } from '../../shared/types'
import { trimShape } from '../../shared/shape'
import type { SemanticContext } from './context'
import { amountOf, chanceOf, countOf, declaredFields, gridCells, gridSize, isBlank, isRecord, numericOf, slotList } from './values'

export interface SyntaxResult {
  ok: boolean
  line?: number
  message?: string
}

function locate(text: string, pos: number): number {
  const end = Math.max(0, Math.min(text.length, pos))
  return text.slice(0, end).split('\n').length
}

function jsonErrorLine(text: string, message: string): number {
  const position = /position (\d+)/.exec(message)
  if (position) return locate(text, Number(position[1]))
  const line = /line (\d+)/i.exec(message)
  return line ? Number(line[1]) : 1
}

/** 语法预检：任何一条通道都必须先过这里，否则禁止写盘 */
export function checkSyntax(code: string, channel: GenerationChannel): SyntaxResult {
  if (code.trim().length === 0) return { ok: false, line: 1, message: '生成结果为空，没有可写出的内容' }
  if (channel === 'datapack-json') {
    for (const block of splitJsonBlocks(code)) {
      try {
        JSON.parse(block.text) as unknown
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, line: jsonErrorLine(block.text, message), message: `数据包 JSON 解析失败：${message}` }
      }
    }
    return { ok: true }
  }
  try {
    parse(code, { ecmaVersion: 'latest', sourceType: 'script' })
    return { ok: true }
  } catch (err) {
    const error = err as { message?: string; loc?: { line?: number; column?: number }; pos?: number }
    const loc = error.loc?.line
    const line = loc ?? (typeof error.pos === 'number' ? locate(code, error.pos) : 1)
    const message = (error.message ?? '语法错误').replace(/\s*\(\d+:\d+\)\s*$/, '')
    return { ok: false, line, message }
  }
}

function splitJsonBlocks(code: string): { text: string }[] {
  const start = code.indexOf('{')
  if (start < 0) return []
  return [{ text: code.slice(start) }]
}

function isSlotShapeRequired(field: RecipeSlotSchema): boolean {
  return field.kind === 'item' || field.kind === 'fluid' || field.kind === 'tag' || field.kind === 'registry'
}

function checkFieldShape(field: RecipeSlotSchema, value: unknown): Diagnostic[] {
  const out: Diagnostic[] = []
  if (isBlank(value)) return out
  const isArray = Array.isArray(value)
  if (isArray && field.multiple !== true) {
    out.push({ level: 'error', field: field.key, message: `${field.displayName}：该字段是单值，却给了数组（schema multiple=false）` })
  }
  // 规格 3.6.11 明确把「该是数组却给了单值」列为形态错（输入侧尤其如此）。
  // 输出单值也按同一规则拦：让用户把产物写成数组只多点一次，比放过去生成错配方便宜。
  if (!isArray && field.multiple === true && isSlotShapeRequired(field)) {
    out.push({ level: 'error', field: field.key, message: `${field.displayName}：该字段要求数组，当前只给了单个值` })
  }
  if (isSlotShapeRequired(field) && !isArray) {
    if (!isRecord(value) || typeof value['id'] !== 'string') {
      out.push({ level: 'error', field: field.key, message: `${field.displayName}：引用对象形态错，应为 {kind,id}，当前是 ${typeof value}` })
      return out
    }
  }
  if (isSlotShapeRequired(field) && isArray) {
    // 数组里混进纯字符串（例如从 JSON 手抄进来的 "minecraft:iron_ingot"）是形态错，必须拦下
    const bad = value.find((item) => !isRecord(item) || typeof (item as Record<string, unknown>)['id'] !== 'string')
    if (bad !== undefined) {
      out.push({ level: 'error', field: field.key, message: `${field.displayName}：引用对象形态错，数组元素应为 {kind,id}，当前含 ${typeof bad}` })
      return out
    }
  }
  for (const sv of slotList(value)) {
    if (sv.kind === 'fluid') {
      const amount = amountOf(sv)
      if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
        out.push({ level: 'error', field: field.key, message: `流体 ${sv.id} 的用量必须是正整数 mB，当前为 ${amount}` })
      }
    }
    const count = countOf(sv)
    if (count !== undefined && (!Number.isInteger(count) || count <= 0)) {
      out.push({ level: 'error', field: field.key, message: `${sv.id} 的数量必须是正整数，当前为 ${count}` })
    }
    const chance = chanceOf(sv)
    if (chance !== undefined) {
      const max = field.max ?? 1
      const min = field.min ?? 0
      if (chance < min || chance > max) {
        out.push({ level: 'error', field: field.key, message: `${sv.id} 的概率 ${chance} 不在合法区间 ${min}–${max}` })
      }
    }
    if (sv.nbt !== undefined && sv.nbt !== null && !isRecord(sv.nbt) && !Array.isArray(sv.nbt)) {
      out.push({ level: 'error', field: field.key, message: `${sv.id} 的 NBT 约束必须是键值对象` })
    }
  }
  return out
}

function checkRequired(schema: RecipeTypeSchema, workbench: WorkbenchState): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const field of declaredFields(schema)) {
    if (field.required !== true) continue
    if (isBlank(workbench.values[field.key])) {
      out.push({ level: 'error', field: field.key, message: `必填参数未填：${field.displayName}（${field.key}）` })
    }
  }
  for (const mod of schema.modifiers ?? []) {
    const value = workbench.modifiers?.[mod.key]
    const n = numericOf(value)
    if (value === undefined || n === null) continue
    if (mod.min !== undefined && n < mod.min) out.push({ level: 'error', field: `modifiers.${mod.key}`, message: `${mod.displayName} 不能小于 ${mod.min}` })
    if (mod.max !== undefined && n > mod.max) out.push({ level: 'error', field: `modifiers.${mod.key}`, message: `${mod.displayName} 不能大于 ${mod.max}` })
  }
  return out
}

function checkGrid(workbench: WorkbenchState): Diagnostic[] {
  if (workbench.layoutKind !== 'shaped') return []
  const { rows, cols } = gridSize(workbench)
  const cells = gridCells(workbench)
  const out: Diagnostic[] = []
  if (rows > GRID_MAX_SIZE || cols > GRID_MAX_SIZE) {
    out.push({ level: 'error', field: 'grid', message: `网格尺寸 ${rows}×${cols} 超出上限 ${GRID_MAX_SIZE}×${GRID_MAX_SIZE}` })
    return out
  }
  const shape = trimShape(cells, rows, cols)
  if (!shape.ok) out.push({ level: 'error', field: 'grid', message: shape.error })
  return out
}

function checkFirstItemConstraint(schema: RecipeTypeSchema, workbench: WorkbenchState): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const field of declaredFields(schema)) {
    if (!field.firstItemMust) continue
    const list = slotList(workbench.values[field.key])
    if (list.length > 0 && list[0]?.id !== field.firstItemMust) {
      out.push({ level: 'error', field: field.key, message: `${field.displayName}：第一项必须是 ${field.firstItemMust}（模组硬性检查）` })
    }
  }
  return out
}

function collectReferences(schema: RecipeTypeSchema, workbench: WorkbenchState): { field: string; id: string; kind: string }[] {
  const refs: { field: string; id: string; kind: string }[] = []
  const push = (field: string, value: unknown): void => {
    for (const sv of slotList(value)) {
      if (sv.kind === 'registry') continue
      refs.push({ field, id: sv.id, kind: sv.kind })
    }
  }
  if (workbench.layoutKind === 'shaped') push('grid', workbench.values['grid'])
  for (const field of declaredFields(schema)) push(field.key, workbench.values[field.key])
  return refs
}

function checkUnknownIds(schema: RecipeTypeSchema, workbench: WorkbenchState, ctx: SemanticContext): Diagnostic[] {
  if (!ctx.itemExists) return []
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  for (const ref of collectReferences(schema, workbench)) {
    if (ref.kind === 'tag') continue
    const key = `${ref.field}|${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!ctx.itemExists(ref.id)) {
      out.push({ level: 'warn', field: ref.field, message: `未知物品：${ref.id} 不在本包索引中（不阻断生成，游戏内可能是空气）` })
    }
  }
  return out
}

/** 语义校验：返回定位到字段的诊断列表（error 阻断写盘，warn 只提示） */
export function validateSemantics(
  schema: RecipeTypeSchema,
  workbench: WorkbenchState,
  ctx: SemanticContext = {}
): Diagnostic[] {
  const out: Diagnostic[] = []
  if (!workbench.typeId) out.push({ level: 'error', message: '未选择配方类型，无法生成' })
  for (const field of declaredFields(schema)) {
    out.push(...checkFieldShape(field, workbench.values[field.key]))
  }
  out.push(...checkRequired(schema, workbench))
  out.push(...checkGrid(workbench))
  out.push(...checkFirstItemConstraint(schema, workbench))
  out.push(...checkUnknownIds(schema, workbench, ctx))
  const known = new Set(declaredFields(schema).map((f) => f.key))
  for (const [key, value] of Object.entries(workbench.values)) {
    if (key === 'grid' || known.has(key)) continue
    if (typeof value === 'number' && !Number.isFinite(value)) {
      out.push({ level: 'error', field: key, message: `${key} 不是有限数字` })
    }
  }
  return out
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.level === 'error')
}
