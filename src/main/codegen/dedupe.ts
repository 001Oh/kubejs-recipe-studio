/**
 * 会话内去重与目标检查（规格 3.7「去重提示」+ 3.6.5 ②「配方 ID 覆盖链」+ 3.6.17 坑 1）。
 *
 * 两类判据：
 * - 结构重复：同 type + 同值（材料列表按排序归一，有序网格按位置保留）→ 黄条「与已生成的配方重复」；
 * - AE2 压印器翻转：top/bottom 互换后与已生成配方一致 → 同样判重复（游戏里就是同一个配方），
 *   并额外标 `flipped`，让 UI 说清是「翻转冲突」而不是「完全相同的重复」。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RecipeRecord, WorkbenchState } from '../../shared/types'
import type { TargetCheck } from '../../shared/ipc'
import { allRecords } from '../recipes/recipeIndex'
import type { GenerationContext, NamespaceProbe } from './context'
import { idPathOf } from './emitDatapack'
import { scriptsDir } from './writer'

/** 材料顺序有语义的布局（有序网格 / 序列 / 自定义格子）不参与排序归一 */
const ORDERED_LAYOUTS = new Set(['shaped', 'sequence', 'custom'])
/** 压印器允许翻转机身：这两个槽位互换后视为同一配方 */
const FLIPPABLE_PAIRS: [string, string][] = [['top', 'bottom']]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().replace(/^#/, '')
  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`
}

function slotToken(value: unknown): string {
  if (!isRecord(value)) return JSON.stringify(value ?? null)
  if (typeof value['id'] !== 'string') {
    // 不是槽位对象（struct / 命名槽位，例如 AE2 的 {top,middle,bottom}）：
    // 必须按键名排序递归展开，否则两个内容不同的配方会得到同一个 token（实测因此漏判重复）。
    const inner = Object.keys(value)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((k) => `${k}:${slotToken(value[k])}`)
    return `{${inner.join(',')}}`
  }
  const kind = typeof value['kind'] === 'string' ? value['kind'] : 'item'
  const parts = [kind, normalizeId(value['id'])]
  for (const key of ['count', 'amount', 'chance']) {
    const n = value[key]
    if (typeof n === 'number') parts.push(`${key}=${n}`)
    else if (typeof n === 'string' && n.trim()) parts.push(`${key}=${n.trim()}`)
  }
  if (value['nbt'] !== undefined && value['nbt'] !== null) parts.push(`nbt=${JSON.stringify(value['nbt'])}`)
  if (typeof value['registryType'] === 'string') parts.push(`reg=${value['registryType']}`)
  return parts.join('|')
}

function canonicalizePairs(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj }
  for (const [low, high] of FLIPPABLE_PAIRS) {
    if (!(low in obj) || !(high in obj)) continue
    const a = slotToken(obj[low])
    const b = slotToken(obj[high])
    out[low] = `flip:${a <= b ? a : b}`
    out[high] = `flip:${a <= b ? b : a}`
  }
  return out
}

function normalizeValue(value: unknown, flipAgnostic: boolean): unknown {
  if (!flipAgnostic) return value
  if (Array.isArray(value)) return value.map((v) => (isRecord(v) ? canonicalizePairs(v) : v))
  if (isRecord(value)) return canonicalizePairs(value)
  return value
}

function valueBlock(values: Record<string, unknown>, ordered: boolean, flipAgnostic: boolean): string {
  const parts: string[] = []
  for (const key of Object.keys(values).sort((a, b) => a.localeCompare(b, 'en'))) {
    const value = normalizeValue(values[key], flipAgnostic)
    const list = Array.isArray(value) ? value : [value]
    const tokens = list.map(slotToken)
    if (!ordered) tokens.sort((a, b) => a.localeCompare(b, 'en'))
    parts.push(`${key}=${tokens.join(';')}`)
  }
  return `{${parts.join(',')}}`
}

function signatureOf(workbench: WorkbenchState, flipAgnostic: boolean): string {
  const ordered = ORDERED_LAYOUTS.has(workbench.layoutKind)
  const entries = Object.fromEntries(
    Object.entries(workbench.values).filter(([key]) => key !== 'activeSlotKey')
  )
  const mods = valueBlock({ ...(workbench.modifiers ?? {}) }, true, flipAgnostic)
  return `${workbench.typeId}#${valueBlock(entries, ordered, flipAgnostic)}#${mods}`
}

/** 结构签名（翻转归一后），会话去重的键 */
export function structuralSignature(workbench: WorkbenchState): string {
  return signatureOf(workbench, true)
}

export interface DuplicateHit {
  label: string
  /** true = 只有把 top/bottom 翻转后才相同（压印器冲突，而非同一份配方） */
  flipped: boolean
}

interface SessionEntry {
  strict: string
  flipped: string
  label: string
  at: number
}

const session: SessionEntry[] = []

/** 记住一次成功生成（写盘后调用）；label 用文件名或配方 ID */
export function rememberGeneration(workbench: WorkbenchState, label: string): void {
  const strict = signatureOf(workbench, false)
  if (session.some((entry) => entry.strict === strict && entry.label === label)) return
  session.push({ strict, flipped: signatureOf(workbench, true), label, at: Date.now() })
}

/** 与本次会话已生成的配方结构重复（含压印器翻转等价）时返回命中标识 */
export function findDuplicate(workbench: WorkbenchState): DuplicateHit | null {
  const strict = signatureOf(workbench, false)
  const flipped = signatureOf(workbench, true)
  const exact = session.find((entry) => entry.strict === strict)
  if (exact) return { label: exact.label, flipped: false }
  const mirror = session.find((entry) => entry.flipped === flipped)
  return mirror ? { label: mirror.label, flipped: true } : null
}

export function sessionGenerations(): { label: string; at: number }[] {
  return session.map((entry) => ({ label: entry.label, at: entry.at }))
}

export function clearSession(): void {
  session.length = 0
}

/** 数据包文件名派生的配方 ID 去掉序号后缀（`mixing_gravel_1` → `mixing_gravel`） */
export function recipeIdBase(recipeId: string): string {
  return recipeId.replace(/_\d+$/, '')
}

function sameRecipeFamily(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || recipeIdBase(a) === recipeIdBase(b)
}

export function generatedRecipeId(workbench: WorkbenchState, namespace: string, fileName: string, typeId: string): string {
  const explicit = workbench.values['recipeId']
  if (typeof explicit === 'string' && explicit.includes(':')) return explicit.trim()
  const bare = fileName.replace(/\.(json|js)$/i, '')
  return `${namespace}:${bare || idPathOf(typeId)}`
}

/** 加载顺序 rank：模组 jar → 数据包 → KubeJS 脚本（越大越后加载，越优先生效，规格 3.6.5 ②） */
function sourceRank(source: RecipeRecord['source']): number {
  if (source === 'kubejs') return 2
  if (source === 'datapack') return 1
  return 0
}

function chainOf(record: RecipeRecord): string[] {
  return [record.sourcePath, ...(record.definedBy ?? [])].filter((p): p is string => typeof p === 'string' && p.length > 0)
}

/** 目标配方 ID 已被占用 → 完整定义链 + 当前生效来源 */
export function recipeIdConflicts(recipeId: string, records: readonly RecipeRecord[] = allRecords()): TargetCheck['recipeIdConflicts'] {
  const matched = records.filter((r) => sameRecipeFamily(r.recipeId, recipeId))
  if (matched.length === 0 || !recipeId) return []
  const definedBy: string[] = []
  for (const record of matched) {
    for (const path of chainOf(record)) if (!definedBy.includes(path)) definedBy.push(path)
  }
  const effective = matched
    .slice()
    .sort((a, b) => sourceRank(b.source) - sourceRank(a.source) || b.uid.localeCompare(a.uid, 'en'))
    .map((r) => r.sourcePath || r.uid)[0]
  return [{ recipeId, definedBy, effective: effective ?? '' }]
}

/** 写盘前目标检查：同名文件 / 配方 ID 占用 / 数据包 namespace 占用 */
export async function checkTarget(
  recipeId: string,
  fileName: string,
  namespace: string,
  ctx: GenerationContext,
  namespaceProbe?: NamespaceProbe
): Promise<TargetCheck> {
  const modpack = ctx.modpack?.() ?? null
  const target = modpack ? join(scriptsDir(modpack), fileName) : ''
  const fromContext = ctx.usedNamespaces ? ctx.usedNamespaces().has(namespace) : false
  const namespaceUsed = namespaceProbe ? await namespaceProbe(namespace) : fromContext
  return {
    fileExists: target ? existsSync(target) : false,
    recipeIdConflicts: recipeIdConflicts(recipeId),
    datapackNamespaceUsed: namespaceUsed
  }
}
