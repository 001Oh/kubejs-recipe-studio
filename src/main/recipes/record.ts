/**
 * 配方记录的公共构造件：uid / recipeId / 来源 / 定义链用的顺序键。
 * 被 jsonSource（数据包/散文件）与 jarRecipes（jar 条目，可在 worker 里跑）共用。
 * 这里**不 import logger/paths/electron**，保证 worker 可以安全加载。
 */
import type { RecipeRecord, RecipeSource } from '../../shared/types'
import { extractRecipeIo } from './heuristics'
import { noteShapeSample } from './shapeSampler'

/** 游戏加载顺序权重：模组 jar → 数据包（datapacks/、openloader）→ kubejs/data → 脚本（规格 3.6.5 ②） */
export const RANK_JAR = 0
export const RANK_DATAPACK = 1
export const RANK_KUBEJS_DATA = 2
export const RANK_KUBEJS_SCRIPT = 3

export const RECIPE_ENTRY_RE = /^data\/[^/]+\/(?:recipes|recipe)\/(.+)\.json$/
export const JSON_EXT_RE = /\.json$/i

export interface CollectedRecipe {
  record: RecipeRecord
  loadRank: number
  orderKey: string
}

/** 定义链合并后的记录：definedBy 末位 = 生效项，effectiveSource 冗余存一份方便 UI 直读 */
export interface IndexedRecipeRecord extends RecipeRecord {
  effectiveSource: string
}

export function recipeIdFromEntry(entry: string): string | null {
  const m = RECIPE_ENTRY_RE.exec(entry)
  if (!m) return null
  const ns = /^data\/([^/]+)\//.exec(entry)?.[1]
  return ns ? `${ns}:${m[1]}` : null
}

export interface RecordInput {
  uid: string
  recipeId: string
  type: string
  source: RecipeSource
  sourcePath: string
  jarPath?: string
  entryPath?: string
  text: string | null
}

export function buildRecord(opts: RecordInput): RecipeRecord {
  const base: RecipeRecord = {
    uid: opts.uid,
    recipeId: opts.recipeId,
    type: opts.type,
    outputs: [],
    inputs: [],
    source: opts.source,
    sourcePath: opts.sourcePath,
    partial: true
  }
  if (opts.jarPath) base.jarPath = opts.jarPath
  if (opts.entryPath) base.entryPath = opts.entryPath
  if (opts.text === null) return base
  try {
    const json = JSON.parse(opts.text.replace(/^\uFEFF/, '')) as unknown
    // 必须先取 JSON 自带的 type 再解析：把空 type 传给启发式会让所有配方都判成 partial（实测过一次）
    const jsonType = typeOf(json)
    const type = opts.type || (jsonType === 'unknown' ? '' : jsonType)
    // 第 116 批 B1：只把**已解析对象**的引用交给采样器（O(1)，不拷贝、不二次读 jar）。
    // 形状在扫描结束后统一聚合；这里不碰解析结果、不碰索引结构。
    noteShapeSample(type, json)
    const parsed = extractRecipeIo(type, json)
    return {
      ...base,
      type: type || 'unknown',
      outputs: parsed.outputs,
      inputs: parsed.inputs,
      partial: parsed.partial,
      ...(parsed.unknownIds.length > 0 ? { unknownIds: parsed.unknownIds } : {})
    }
  } catch {
    return base
  }
}

function typeOf(json: unknown): string {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const type = (json as Record<string, unknown>)['type']
    if (typeof type === 'string') return type
  }
  return 'unknown'
}
