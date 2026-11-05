/**
 * 配方倒排索引（规格 3.2 源 C「内存倒排索引」）。
 * 「制作/用途」= 同一份索引的两次查询（byOutput/byInput），绝不允许两套逻辑（禁止事项 11）。
 * 只存摘要记录 + 下标数组；完整 JSON 由 lazy.ts 惰性读取（禁止事项 10）。
 */
import type { RecipeRecord, RecipeStats } from '../../shared/types'
import type { RecipePage } from '../../shared/ipc'
import { cacheFile } from '../paths'
import { readJson, writeJson } from '../cache'
import { logger } from '../logger'
import { getCurrentModpack } from '../modpack/state'

/**
 * 倒排表用普通 number[] 而非 Int32Array：
 * - V8 对纯整数数组使用 CONTIGUOUS_SMI 存储（每元素 8B），30 万条 × 平均 3 键 ≈ 数十 MB，可承受；
 * - 构建期需要 O(1) push，TypedArray 需两阶段（计数→分配→填充）额外一次全量遍历与临时数组；
 * - 若日后 GTNH 级实测超限，两阶段 Int32Array 改造只影响本文件（查询侧接口不变）。
 */
const byOutput = new Map<string, number[]>()
const byInput = new Map<string, number[]>()
const uidIndex = new Map<string, number>()
const typeCounts = new Map<string, number>()
let records: RecipeRecord[] = []
let statsElapsedMs = 0

/** L1/ProbeJS 等外部来源可把额外已知 type 并入类型全集（§3.6.10 三源并集） */
export function addKnownTypes(types: Iterable<string>): void {
  for (const t of types) if (t) typeCounts.set(t, typeCounts.get(t) ?? 0)
}

export function buildIndex(newRecords: RecipeRecord[]): void {
  const t0 = Date.now()
  byOutput.clear()
  byInput.clear()
  uidIndex.clear()
  typeCounts.clear()
  records = newRecords
  newRecords.forEach((rec, idx) => {
    uidIndex.set(rec.uid, idx)
    if (rec.type) typeCounts.set(rec.type, (typeCounts.get(rec.type) ?? 0) + 1)
    for (const io of rec.outputs) {
      const list = byOutput.get(io.id)
      if (list) list.push(idx)
      else byOutput.set(io.id, [idx])
    }
    for (const io of rec.inputs) {
      const list = byInput.get(io.id)
      if (list) list.push(idx)
      else byInput.set(io.id, [idx])
    }
  })
  statsElapsedMs = Date.now() - t0
  logger.debug('INDEX', `倒排索引构建完成：${newRecords.length} 条 / 耗时 ${statsElapsedMs}ms`)
}

export function setIndexElapsed(ms: number): void {
  statsElapsedMs = ms
}

function pageOf(indexMap: Map<string, number[]>, id: string, offset: number, limit: number): RecipePage {
  const hits = indexMap.get(id)
  if (!hits) return { total: 0, items: [] }
  const items: RecipeRecord[] = []
  const end = Math.min(hits.length, offset + Math.max(limit, 0))
  for (let i = offset; i < end; i++) {
    const rec = records[hits[i]]
    if (rec) items.push(rec)
  }
  return { total: hits.length, items }
}

/** 「制作」：产出该物品的配方 */
export function queryByOutput(id: string, offset: number, limit: number): RecipePage {
  return pageOf(byOutput, id, offset, limit)
}

/** 「用途」：消耗该物品的配方——与 queryByOutput 同一份索引、同一段逻辑 */
export function queryByInput(id: string, offset: number, limit: number): RecipePage {
  return pageOf(byInput, id, offset, limit)
}

export function lookup(uid: string): RecipeRecord | null {
  const idx = uidIndex.get(uid)
  return idx === undefined ? null : (records[idx] ?? null)
}

/**
 * P-C3：提交成功后用实际保存的记录替换原定义（覆盖链的生效项）。
 * 只更新内存索引；扫描缓存不在这里改写——下次导入/重扫会按 extras 签名决定是否重建。
 */
export function replaceRecipeByRecipeId(recipeId: string, next: RecipeRecord): boolean {
  const idx = records.findIndex((rec) => rec.recipeId === recipeId)
  if (idx < 0) return false
  const knownTypes = [...typeCounts.keys()]
  const updated = records.slice()
  updated[idx] = next
  buildIndex(updated)
  addKnownTypes(knownTypes)
  return true
}

/** P-C3 另存副本：把新记录并入内存索引（不写扫描缓存） */
export function addRecipeRecord(next: RecipeRecord): void {
  const knownTypes = [...typeCounts.keys()]
  buildIndex([...records, next])
  addKnownTypes(knownTypes)
}

export function allRecords(): readonly RecipeRecord[] {
  return records
}

export function recordsByType(type: string, limit: number): RecipeRecord[] {
  const out: RecipeRecord[] = []
  for (const rec of records) {
    if (rec.type === type) {
      out.push(rec)
      if (out.length >= limit) break
    }
  }
  return out
}

/** §3.6.10 类型全集：三源并集（当前为已收集 records 的 type ∪ addKnownTypes 注入项） */
export function typeUniverse(): string[] {
  return [...typeCounts.keys()].sort()
}

function isVanilla(rec: RecipeRecord): boolean {
  return rec.source !== 'kubejs' && rec.type.startsWith('minecraft:')
}

export function stats(): RecipeStats | null {
  if (records.length === 0 && typeCounts.size === 0) return null
  let vanilla = 0
  let kubejs = 0
  let partial = 0
  for (const rec of records) {
    if (rec.source === 'kubejs') kubejs += 1
    else if (isVanilla(rec)) vanilla += 1
    if (rec.partial) partial += 1
  }
  return {
    total: records.length,
    vanilla,
    modded: records.length - vanilla - kubejs,
    kubejs,
    partial,
    types: typeCounts.size,
    elapsedMs: statsElapsedMs
  }
}

export interface PersistedRecipes {
  builtAtMs: number
  elapsedMs: number
  types: string[]
  records: RecipeRecord[]
}

/** 摘要落盘 cacheFile(path,'recipes')；绝不写完整配方 JSON。 */
export async function persist(): Promise<boolean> {
  const modpack = getCurrentModpack()
  if (!modpack) return false
  const payload: PersistedRecipes = {
    builtAtMs: Date.now(),
    elapsedMs: statsElapsedMs,
    types: [...typeCounts.keys()],
    records
  }
  await writeJson(cacheFile(modpack.path, 'recipes'), payload)
  return true
}

/**
 * B121/D-3：recipes.json 内容形状校验（对齐 scanService.parseItemsCacheJson 的口径）：
 * 数组内任一元素不满足 RecipeRecord 最小形态即整体判废（调用方重扫）。
 * 此前零校验，`records:[{}]` 会在 buildIndex 里抛 TypeError，且先清后建的倒排表半残。
 */
export function parseRecipesCacheJson(data: PersistedRecipes): RecipeRecord[] | null {
  if (!data || !Array.isArray(data.records)) return null
  const list = data.records as unknown[]
  const allValid = list.every((rec) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false
    const r = rec as Record<string, unknown>
    return (
      typeof r['uid'] === 'string' &&
      (r['uid'] as string).length > 0 &&
      typeof r['recipeId'] === 'string' &&
      typeof r['type'] === 'string' &&
      typeof r['sourcePath'] === 'string' &&
      Array.isArray(r['outputs']) &&
      Array.isArray(r['inputs'])
    )
  })
  return allValid ? (list as RecipeRecord[]) : null
}

export async function loadFromCache(): Promise<boolean> {
  const modpack = getCurrentModpack()
  if (!modpack) return false
  const data = await readJson<PersistedRecipes>(cacheFile(modpack.path, 'recipes'))
  const records = data ? parseRecipesCacheJson(data) : null
  if (!records) return false
  buildIndex(records)
  statsElapsedMs = typeof data?.elapsedMs === 'number' ? data.elapsedMs : statsElapsedMs
  addKnownTypes(data?.types ?? [])
  logger.info('INDEX', `配方缓存命中：${records.length} 条`)
  return true
}

export function clearIndex(): void {
  buildIndex([])
  typeCounts.clear()
  statsElapsedMs = 0
}
