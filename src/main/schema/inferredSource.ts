/**
 * B120/D-05：L1 推断引擎接线（`schema/infer.ts` 299 行此前的唯一生产调用点）。
 *
 * 职责（规格 3.6.4）：
 * 1. **后台串行构建**：扫描收敛点（`scanOrchestrator.startScan` 收尾）触发，逐类型反推，
 *    进度以现有 `phase:'schema'` 上报；**不 await**——首屏 `schema:list` 走
 *    builtin/l0/plugin/pinned 快路径（≤300ms 指标），推断层就绪后即时并入选择器。
 * 2. **并入注册表**：产物 `putMany('inferred', …)` + `applyMerge`（`inferred` 层在
 *    registry 五层合并里是最低优先骨架，builtin/l0/plugin 自动做骨架校验与字段增补）。
 * 3. **缓存**：`inferred-schemas.json`（与 inferred-shapes 同目录），签名
 *    `包路径|记录数|类型数|SCHEMA_LIB_VERSION`——命中 ≤1s；签名不匹配即失效重推
 *    （同修 116 批遗留.2 的缓存永生问题）。
 * 4. **性能**：样本读取按容器分批（`readMany` 一次开一个 jar/zip 读该类型全部样本），
 *    避免「逐条读 = 逐条开容器」把首建拖过 60s；散文件源走 `readFullRecipe` 原路径。
 *
 * 与 `service.ts` 的关系：`restoreInferredLayer()` 供 `ensureSchemas` 在重建注册表后
 * **同步回填**内存中的上次构建（避免一次 clearSchemas 让推断层消失到下次扫描）；
 * 本模块不 import service（facts 就地重建），避免循环依赖。
 */
import type { RecipeRecord, RecipeTypeSchema } from '../../shared/types'
import { INFER_SAMPLE_LIMIT } from '../../shared/constants'
import { recipeTypeNameZh } from '../../shared/recipeTypeNames'
import { readJson, writeJson } from '../cache'
import { cacheFile } from '../paths'
import { logger } from '../logger'
import { getCurrentModpack } from '../modpack/state'
import { allRecords, recordsByType, typeUniverse } from '../recipes/recipeIndex'
import { readFullRecipe } from '../recipes/lazy'
import { inferredSignature } from '../recipes/shapePersist'
import { readMany } from '../scanner/zip'
import { inferSchemaForType, pickSamples, type RecipeSampleSource } from './infer'
import { applyMerge, replaceLayer } from './registry'
import type { CapabilityFacts } from './capability'
import type { NamingContext } from './naming'

export interface InferredSchemasFile {
  signature: string
  builtAtMs: number
  buildMs: number
  schemas: RecipeTypeSchema[]
}

export function inferredSchemasCachePath(modpackPath: string): string {
  return cacheFile(modpackPath, 'inferred-schemas')
}

/** 与 service.schemaFacts 同构（就地重建，避免 service ↔ inferredSource 循环依赖） */
function facts(): CapabilityFacts {
  const counts = new Map<string, number>()
  for (const rec of allRecords()) counts.set(rec.type, (counts.get(rec.type) ?? 0) + 1)
  for (const type of typeUniverse()) if (!counts.has(type)) counts.set(type, 0)
  const info = getCurrentModpack()
  return {
    sampleCounts: counts,
    addons: info?.kubejsAddons ?? [],
    installedModIds: info?.installedModIds ?? []
  }
}

/** 类型显示名走全量中文映射（0.1.18 的 416/431 种全中文名表） */
function withZhName(schema: RecipeTypeSchema): RecipeTypeSchema {
  return { ...schema, displayName: recipeTypeNameZh(schema.id, schema.displayName) }
}

/** 上一次成功构建（内存回填用；记住构建时的包路径，换包后拒绝回填） */
let lastGood: { modpackPath: string; signature: string; schemas: RecipeTypeSchema[] } | null = null

/**
 * 同步回填推断层（`ensureSchemas` 的 clearSchemas 重建后调用）。
 * 仅当「当前整合包 == 构建时的包」且「签名仍匹配当前索引」时 `putMany('inferred', …)`；
 * 调用方随后自行 applyMerge。
 */
export function restoreInferredLayer(): boolean {
  const current = getCurrentModpack()?.path
  if (!lastGood || !current || lastGood.modpackPath !== current) return false
  if (lastGood.signature !== inferredSignature(current)) return false
  replaceLayer('inferred', lastGood.schemas)
  return true
}

export async function readInferredSchemasCache(modpackPath: string): Promise<InferredSchemasFile | null> {
  const data = await readJson<InferredSchemasFile>(inferredSchemasCachePath(modpackPath))
  if (!data || !Array.isArray(data.schemas)) return null
  if (data.signature !== inferredSignature(modpackPath)) return null
  return data
}

/**
 * 样本源：`prepareAll(typeIds)` 按**容器主序**把全部类型的样本一次性分批读进内存
 * （每个 jar/zip 全构建只开一次——同容器被几十个类型共享时，逐类型打开的开销是首建
 * 超时的主因）；`readFull` 命中预取；散文件/未预取的照旧走 `readFullRecipe`。
 * `prepare(typeId)` 是单类型回退路径（注入的自定义源没有 prepareAll 时用）。
 */
export interface BatchedSampleSource extends RecipeSampleSource {
  prepare(typeId: string): Promise<void>
  prepareAll?(typeIds: readonly string[]): Promise<void>
}

export function makeBatchedSampleSource(): BatchedSampleSource {
  const prefetch = new Map<string, unknown>()
  const parse = (text: string): unknown => JSON.parse(text.replace(/^\uFEFF/, ''))
  /** 把 picked 记录按 容器 → 条目 → 记录 分组（jar / datapack zip 才有容器） */
  const groupByContainer = (picked: readonly RecipeRecord[]): Map<string, Map<string, RecipeRecord[]>> => {
    const byContainer = new Map<string, Map<string, RecipeRecord[]>>()
    for (const r of picked) {
      if (!r.jarPath || !r.entryPath) continue
      const perEntry = byContainer.get(r.jarPath)
      if (perEntry) perEntry.set(r.entryPath, [...(perEntry.get(r.entryPath) ?? []), r])
      else byContainer.set(r.jarPath, new Map([[r.entryPath, [r]]]))
    }
    return byContainer
  }
  const fillFromBuffers = (
    perEntry: Map<string, RecipeRecord[]>,
    buffers: Map<string, Buffer>
  ): void => {
    for (const [entry, buf] of buffers) {
      let json: unknown
      try {
        json = parse(buf.toString('utf8'))
      } catch {
        continue /* 单条坏样本留给 readFull 兜底报中文失效 */
      }
      for (const r of perEntry.get(entry) ?? []) prefetch.set(r.sourcePath, json)
    }
  }
  return {
    typeUniverse: () => typeUniverse(),
    recordsByType: (type: string, limit: number): RecipeRecord[] => recordsByType(type, limit),
    readFull: async (record: RecipeRecord) => {
      const hit = prefetch.get(record.sourcePath)
      if (hit !== undefined) return { json: hit, sourcePath: record.sourcePath }
      return readFullRecipe(record)
    },
    prepare: async (typeId: string) => {
      prefetch.clear()
      const picked = pickSamples(recordsByType(typeId, INFER_SAMPLE_LIMIT * 4), INFER_SAMPLE_LIMIT)
      await Promise.all(
        [...groupByContainer(picked)].map(async ([container, perEntry]) => {
          try {
            fillFromBuffers(perEntry, await readMany(container, new Set(perEntry.keys())))
          } catch {
            /* 容器读失败 → 该容器样本逐条走 readFull 兜底 */
          }
        })
      )
    },
    prepareAll: async (typeIds: readonly string[]) => {
      prefetch.clear()
      const picked: RecipeRecord[] = []
      for (const t of typeIds) picked.push(...pickSamples(recordsByType(t, INFER_SAMPLE_LIMIT * 4), INFER_SAMPLE_LIMIT))
      const byContainer = groupByContainer(picked)
      // 串行逐容器读取：控制 IO 峰值与内存（样本解析后常驻到本轮构建结束）
      for (const [container, perEntry] of byContainer) {
        try {
          fillFromBuffers(perEntry, await readMany(container, new Set(perEntry.keys())))
        } catch {
          /* 容器读失败 → 该容器样本逐条走 readFull 兜底 */
        }
      }
    }
  }
}

/** 构建期可注入项（单测替换 IO 边界；生产走默认） */
export interface InferBuildDeps {
  /** 覆盖「当前整合包」来源（单测无导入包时指定签名的包路径） */
  modpackPath?: string
  source?: BatchedSampleSource
}

/** 后台构建的完成回调签名：与 scanOrchestrator 的 progress(label, current, total) 对齐 */
export type InferBuildProgress = (label: string, current: number, total: number) => void

let inflight: Promise<boolean> | null = null

/** 已有构建在跑 → 返回同一个 Promise，绝不并发双跑 */
export function buildInferredSchemas(emit?: InferBuildProgress, deps: InferBuildDeps = {}): Promise<boolean> {
  if (inflight) return inflight
  const task = buildOnce(emit, deps).finally(() => {
    inflight = null
  })
  inflight = task
  return task
}

async function buildOnce(emit?: InferBuildProgress, deps: InferBuildDeps = {}): Promise<boolean> {
  const modpackPath = deps.modpackPath ?? getCurrentModpack()?.path
  if (!modpackPath || allRecords().length === 0 || typeUniverse().length === 0) return false
  const signature = inferredSignature(modpackPath)

  // ① 缓存命中（≤1s 指标）
  const cached = await readInferredSchemasCache(modpackPath)
  if (cached && cached.schemas.length > 0) {
    lastGood = { modpackPath, signature, schemas: cached.schemas }
    replaceLayer('inferred', cached.schemas)
    applyMerge(facts())
    logger.info('SCHEMA', `推断层命中缓存：${cached.schemas.length} 种类型（${inferredSchemasCachePath(modpackPath)}）`)
    emit?.(`推断层命中缓存（${cached.schemas.length} 种类型）`, 1, 1)
    return true
  }

  // ② 后台串行构建：先按容器主序一次性预取全部样本（每容器只开一次），再逐类型纯 CPU 归纳
  const source = deps.source ?? makeBatchedSampleSource()
  const naming: NamingContext = {}
  const counts = facts().sampleCounts ?? new Map<string, number>()
  const types = typeUniverse().filter((t) => (counts.get(t) ?? 0) > 0).sort((a, b) => a.localeCompare(b, 'en'))
  const started = Date.now()
  const schemas: RecipeTypeSchema[] = []
  let failed = 0
  if (source.prepareAll) {
    await source.prepareAll(types)
    emit?.(`样本预取完成（${types.length} 种类型）`, 0, 1)
  }
  for (let i = 0; i < types.length; i += 1) {
    const typeId = types[i] ?? ''
    try {
      if (!source.prepareAll) await source.prepare(typeId)
      const result = await inferSchemaForType(typeId, source, { naming })
      if (result.schema) schemas.push(withZhName(result.schema))
      else failed += 1
    } catch (err) {
      failed += 1
      logger.warn('SCHEMA', `类型 ${typeId} 推断失败（已跳过）`, err instanceof Error ? err.message : String(err))
    }
    emit?.(`L1 推断配方表单：${typeId}`, i + 1, types.length)
  }
  const buildMs = Date.now() - started
  if (schemas.length === 0) {
    logger.warn('SCHEMA', 'L1 推断没有产出任何 schema（样本全部无法归纳）', `耗时 ${buildMs}ms`)
    return false
  }
  // 构建期间索引变了（重新扫描/换包）→ 本轮结果签名已过期，丢弃，等下一次收敛点重建
  if (inferredSignature(modpackPath) !== signature) {
    logger.warn('SCHEMA', '索引在推断构建期间发生变化，丢弃本轮结果（等待下一次重建）')
    return false
  }
  lastGood = { modpackPath, signature, schemas }
  try {
    await writeJson(inferredSchemasCachePath(modpackPath), {
      signature,
      builtAtMs: Date.now(),
      buildMs,
      schemas
    } satisfies InferredSchemasFile)
  } catch (err) {
    logger.warn('SCHEMA', '推断 schema 缓存写盘失败（不影响本次会话）', err instanceof Error ? err.message : String(err))
  }
  replaceLayer('inferred', schemas)
  applyMerge(facts())
  logger.success(
    'SCHEMA',
    `L1 推断完成：${schemas.length} 种类型出表单（${failed} 种无法归纳）/ 耗时 ${(buildMs / 1000).toFixed(1)}s → 已并入类型选择器`
  )
  emit?.(`推断层就绪（${schemas.length} 种类型）`, 1, 1)
  return true
}
