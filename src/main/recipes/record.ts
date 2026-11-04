/**
 * 配方记录的公共构造件：uid / recipeId / 来源 / 定义链用的顺序键。
 * 被 jsonSource（数据包/散文件）与 jarRecipes（jar 条目，可在 worker 里跑）共用。
 * 这里**不 import logger/paths/electron**，保证 worker 可以安全加载。
 */
import type { RecipeRecord, RecipeSource } from '../../shared/types'
import { extractRecipeIo, unwrapRecipe } from './heuristics'
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
    // B120/D-03：条件包装（forge:conditional 等 recipe/recipes 包装形态）按**内层配方 type** 归类——
    // 顶层 type 只是包装器，1,536 条本体样本必须记到真实类型名下。外层 conditions 原样留在 raw：
    // denormalize 从 raw 克隆打补丁，写回时 conditions 天然保留（TYPE_CHANGED 闸兜住顶层误写）。
    // 形状采样喂内层对象——包装层没有 pattern/key，喂外层等于这些类型永远采不到形状。
    const unwrapped = unwrapRecipe(json)
    const type = opts.type || (jsonType === 'unknown' ? '' : jsonType)
    const effectiveType = unwrapped?.type ?? type
    noteShapeSample(effectiveType, unwrapped?.recipe ?? json)
    const parsed = extractRecipeIo(effectiveType, json)
    return {
      ...base,
      type: effectiveType || 'unknown',
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
