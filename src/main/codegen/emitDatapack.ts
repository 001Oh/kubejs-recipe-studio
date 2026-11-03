/**
 * 模式 B：数据包 JSON（规格 3.6.6 / 3.6.11）。零耦合通道——不经过任何附属模组的翻译层。
 * 原则：**原样序列化**，不做语法转换：
 * - `type` 取原始 RecipeType ID；
 * - 数字保持数字、字符串保持字符串（`chance:"0.07"` 的模组就输出字符串）；
 * - `compound` 键还原、注册表对象嵌套（`infusionInput:{amount,tag}` 而非摊平）；
 * - 未被 schema 声明但用户填了的键也一并写出，绝不丢参数。
 */
import { join } from 'node:path'
import { DATAPACK_NAMESPACE } from '../../shared/constants'
import type { Diagnostic } from '../../shared/ipc'
import type { RecipeTypeSchema, WorkbenchState } from '../../shared/types'
import { trimShape } from '../../shared/shape'
import { parseCountPrefix } from '../../shared/text'
import { listEntries } from '../scanner/zip'
import { listJarNames } from '../modpack/modList'
import { logger } from '../logger'
import type { Plain } from './values'
import {
  declaredFields,
  fieldKeys,
  gridCells,
  gridSize,
  modifierEntries,
  plainOf,
  slotList
} from './values'
import { fieldJson } from './jsonValue'

const PATH_SAFE = /[^a-z0-9_.-]+/gi

/** `create:mixing` → `mixing`；`minecraft:crafting_shaped` → `crafting_shaped` */
export function typePathOf(typeId: string): string {
  const colon = typeId.indexOf(':')
  return colon >= 0 ? typeId.slice(colon + 1) : typeId
}

/** 取 ID 的 path 末段（`a/b/c` → `c`），文件名只保留可读部分 */
export function idPathOf(id: string): string {
  const path = typePathOf(id)
  const segments = path.split('/').filter(Boolean)
  return segments.length > 0 ? ((segments[segments.length - 1] as string) ?? 'recipe') : path
}

function sanitize(value: string): string {
  const cleaned = value.replace(PATH_SAFE, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'recipe'
}

function firstOutputIds(schema: RecipeTypeSchema, workbench: WorkbenchState): string[] {
  const keys = [...schema.outputs.map((f) => f.key), 'outputs', 'result', 'results', 'output']
  for (const key of keys) {
    const ids = slotList(workbench.values[key]).map((sv) => sv.id)
    if (ids.length > 0) return ids
  }
  return []
}

/** 文件名 `<type路径>_<产物id>_<序号>.json`（规格 3.6.6 命名规则） */
export function datapackFileName(schema: RecipeTypeSchema, workbench: WorkbenchState, index: number): string {
  const outputs = firstOutputIds(schema, workbench)
  const slug = outputs.length > 0 ? idPathOf(outputs[0] as string) : 'recipe'
  return `${sanitize(`${idPathOf(schema.id)}_${idPathOf(slug)}`)}_${index}.json`
}

function shapedJson(workbench: WorkbenchState, warnings: Diagnostic[]): { pattern: Plain; key: Plain } | null {
  const cells = gridCells(workbench)
  const { rows, cols } = gridSize(workbench)
  const shape = trimShape(cells, rows, cols)
  if (!shape.ok) {
    warnings.push({ level: 'error', field: 'grid', message: shape.error })
    return null
  }
  const key: Record<string, Plain> = {}
  for (const [letter, raw] of Object.entries(shape.key)) {
    const parsed = parseCountPrefix(raw)
    const ref = parsed ? parsed.id : raw
    const isTag = ref.startsWith('#')
    key[letter] = isTag ? { tag: ref.slice(1) } : { item: ref }
    if (parsed && parsed.count > 1) {
      warnings.push({
        level: 'warn',
        field: `key.${letter}`,
        message: `数据包有序合成的 key 不支持数量（${raw}）：原版规范单格只有一个物品，已按 1 计`
      })
    }
  }
  if (cells.some((cell) => cell?.kind === 'fluid')) {
    warnings.push({ level: 'warn', field: 'grid', message: '有序合成格子按物品引用写出：流体材料请改用模组自己的流体字段' })
  }
  return { pattern: shape.pattern, key }
}

/** schema + 工作台 → 数据包 JSON 对象（也是 `event.custom` 的数据源：两条通道共用一份序列化） */
export function buildRecipeJson(
  schema: RecipeTypeSchema,
  workbench: WorkbenchState
): { json: Record<string, Plain>; warnings: Diagnostic[] } {
  const warnings: Diagnostic[] = []
  const json: Record<string, Plain> = { type: schema.id }
  const declared = fieldKeys(schema)

  if (schema.layoutKind === 'shaped') {
    const shaped = shapedJson(workbench, warnings)
    if (shaped) {
      json['pattern'] = shaped.pattern
      json['key'] = shaped.key
    }
  }

  for (const field of declaredFields(schema)) {
    if (field.key === 'grid') continue
    const value = workbench.values[field.key]
    if (value === undefined) continue
    const built = fieldJson(field, value)
    if (!built) continue
    json[field.key] = built.value
    for (const sib of built.siblings) json[sib.key] = sib.value
  }

  for (const mod of modifierEntries(schema, workbench)) json[mod.schema.key] = mod.value

  // 兜底：schema 未声明但用户填了的键，原样写出（绝不丢参数）
  for (const [key, value] of Object.entries(workbench.values)) {
    if (declared.has(key) || key === 'grid' || json[key] !== undefined) continue
    const raw = plainOf(value)
    if (raw !== undefined) json[key] = raw
  }
  if (schema.customTemplate) {
    for (const [key, value] of Object.entries(schema.customTemplate)) {
      if (json[key] !== undefined) continue
      const raw = plainOf(value)
      if (raw !== undefined) json[key] = raw
    }
  }
  return { json, warnings }
}

function serialize(json: Record<string, Plain>): string {
  return `${JSON.stringify(json, null, 2)}\n`
}

export interface DatapackFile {
  fileName: string
  /** 相对整合包根目录的落盘路径 */
  relativePath: string
  json: string
  /** 该文件写出的配方 ID（`<ns>:<name>`），用于 ID 占用检查 */
  recipeId: string
}

export interface DatapackOutput {
  namespace: string
  files: DatapackFile[]
  warnings: Diagnostic[]
}

export function emitDatapack(
  schema: RecipeTypeSchema,
  workbench: WorkbenchState,
  namespace: string,
  takenNames: ReadonlySet<string> = new Set<string>()
): DatapackOutput {
  const built = buildRecipeJson(schema, workbench)
  let index = 1
  let fileName = datapackFileName(schema, workbench, index)
  while (takenNames.has(fileName) && index < 100) {
    index += 1
    fileName = datapackFileName(schema, workbench, index)
  }
  const recipeId = `${namespace}:${fileName.replace(/\.json$/i, '')}`
  return {
    namespace,
    files: [
      {
        fileName,
        relativePath: `kubejs/data/${namespace}/recipes/${fileName}`,
        json: serialize(built.json),
        recipeId
      }
    ],
    warnings: built.warnings
  }
}

export function datapackDir(modpackRoot: string, namespace: string): string {
  return join(modpackRoot, 'kubejs', 'data', namespace, 'recipes')
}

/** namespace 占用探测：由调用方注入（jar 扫描 / 测试替身） */
export type NamespaceProbe = (namespace: string) => Promise<boolean>

const probeCache = new Map<string, boolean>()

/**
 * 检查 `mods/*.jar` 内是否已有 `data/<ns>/`（规格 3.6.6：冲突自动加后缀）。
 * 只读 zip 条目清单（不解压内容），命中即停；结果按 `目录|namespace` 缓存，一次会话只扫一遍。
 */
export function jarNamespaceProbe(modsDir: string): NamespaceProbe {
  return async (namespace: string) => {
    const cacheKey = `${modsDir}|${namespace}`
    const cached = probeCache.get(cacheKey)
    if (cached !== undefined) return cached
    let used = false
    try {
      const target = `data/${namespace}/`
      for (const name of await listJarNames(modsDir)) {
        const listed = await listEntries(join(modsDir, name))
        if (listed.entries.some((entry) => entry.fileName.startsWith(target))) {
          used = true
          break
        }
      }
    } catch (err) {
      logger.warn('IO', '数据包 namespace 探测失败，按未占用处理', err instanceof Error ? err.message : String(err))
    }
    probeCache.set(cacheKey, used)
    return used
  }
}

/** `recipe_studio` 被占用则依次试 `recipe_studio2…9`（规格要求，不是随机名） */
export async function resolveNamespace(probe: NamespaceProbe, base = DATAPACK_NAMESPACE): Promise<string> {
  if (!(await probe(base))) return base
  for (let n = 2; n <= 9; n += 1) {
    const candidate = `${base}${n}`
    if (!(await probe(candidate))) return candidate
  }
  return `${base}9`
}

export function clearNamespaceProbeCache(): void {
  probeCache.clear()
}
