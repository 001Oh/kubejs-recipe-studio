/**
 * 配方库扫描编排（源 C 三处合并）。进度以 phase:'recipes' 上报，
 * 汇总日志文案对齐规格 §3.8；同 recipeId 按游戏加载顺序 jar → 数据包 → kubejs/data → 脚本合并。
 */
import type { ModpackInfo, RecipeRecord, RecipeStats, ScanProgress } from '../../shared/types'
import { logger } from '../logger'
import { getCurrentModpack } from '../modpack/state'
import { isAborted } from '../scanControl'
import { mergeChains, scanJsonRecipes, type CollectedRecipe } from './jsonSource'
import { scanScriptRecipes } from './scriptSource'
import { allRecords, buildIndex, persist, setIndexElapsed, stats, typeUniverse } from './recipeIndex'

export type EmitProgress = (p: ScanProgress) => void

/** 单模组（jar/datapack）配方量提示阈值：规格 §六「某 mod 配方量超过 5 万条」 */
export const PER_SOURCE_RECIPE_WARN_LIMIT = 50_000
/** 扫描流水线在 scanControl 登记的任务 id（供整体取消；也可用 options.isAborted 自带信号） */
export const RECIPE_SCAN_TASK_ID = 'recipes-scan'

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

export interface ScanRecipesOptions {
  /** 跳过缓存写入（真实包只读验证时用） */
  skipPersist?: boolean
  /** 外部取消信号；缺省查询 scanControl 中登记的 recipes-scan 任务 */
  isAborted?: () => boolean
  /** 协作式取消信号，传给 jar 并发池 */
  signal?: AbortSignal
  /** 单个来源（jar/datapack）失败时回调，供测试与编排观察 */
  onFailed?: (name: string, error: string) => void
}

function sourceLabel(rec: RecipeRecord): string {
  if (rec.source === 'jar') return rec.sourcePath.split('#')[0]
  if (rec.source === 'datapack') return rec.sourcePath.split('#')[0]
  return rec.sourcePath.split('#recipe#')[0]
}

/** 单 mod/数据包超 5 万条：正常处理，日志提示（规格 §六） */
function warnOversizedSources(): void {
  const per = new Map<string, number>()
  for (const rec of allRecords()) {
    const label = sourceLabel(rec)
    per.set(label, (per.get(label) ?? 0) + 1)
  }
  for (const [label, count] of per) {
    if (count > PER_SOURCE_RECIPE_WARN_LIMIT) {
      logger.warn('INDEX', `${label} 的配方数量异常（${fmt(count)} 条 > ${fmt(PER_SOURCE_RECIPE_WARN_LIMIT)}），建议确认`)
    }
  }
}

/**
 * 三源结果合并。不能用 `target.push(...batch)`：V8 的实参个数上限约 12.5 万，
 * 本机 node 22.14 实测 130,000 条即抛 RangeError: Maximum call stack size exceeded，
 * 而规格 §3.2 自举的包就有 128,432 条、§3.6.16 的 GTNH 是 15 万+。
 */
export function appendBatches(batches: readonly (readonly CollectedRecipe[])[]): CollectedRecipe[] {
  const total = batches.reduce((n, b) => n + b.length, 0)
  const out: CollectedRecipe[] = new Array(total)
  let at = 0
  for (const batch of batches) {
    for (const item of batch) out[at++] = item
  }
  return out
}

export async function scanRecipes(emit: EmitProgress, options: ScanRecipesOptions = {}): Promise<RecipeStats> {
  const modpack: ModpackInfo | null = getCurrentModpack()
  if (!modpack) throw new Error('尚未导入整合包')
  const started = Date.now()
  const aborted = options.isAborted ?? ((): boolean => isAborted(RECIPE_SCAN_TASK_ID))
  const failed: { name: string; error: string }[] = []
  const hooks = {
    onProgress: (label: string, current: number, total: number): void => {
      emit({ phase: 'recipes', current, total, label, elapsedMs: Date.now() - started })
    },
    isAborted: aborted,
    signal: options.signal,
    onFailed: (name: string, error: string): void => {
      failed.push({ name, error })
      options.onFailed?.(name, error)
    }
  }

  logger.info('SCAN', '开始构建配方库（模组 jar / 数据包 / KubeJS 脚本三源）')
  const entries = appendBatches([await scanJsonRecipes(modpack, hooks), await scanScriptRecipes(modpack, hooks)])

  hooks.onProgress('合并定义链并建立倒排索引', 1, 1)
  const merged = mergeChains(entries)
  buildIndex(merged)
  const elapsedMs = Date.now() - started
  setIndexElapsed(elapsedMs)

  const s = stats()
  if (!s) throw new Error('配方索引构建失败')
  logger.info(
    'INDEX',
    `配方库构建完成：${fmt(s.total)} 条（原版 ${fmt(s.vanilla)} / 模组 ${fmt(s.modded)} / KubeJS ${fmt(s.kubejs)}）/ 耗时 ${(elapsedMs / 1000).toFixed(1)}s`
  )
  if (s.partial > 0) logger.warn('INDEX', `${fmt(s.partial)} 条配方解析不完整，已标记 partial`)
  logger.debug('INDEX', `可用配方类型全集：${typeUniverse().length} 种（§3.6.10 覆盖率与 L1 反推的样本源）`)
  warnOversizedSources()
  if (failed.length > 0) {
    logger.warn(
      'INDEX',
      `${fmt(failed.length)} 个 mod 的配方读取失败（已跳过，不影响其余来源）`,
      failed.slice(0, 20).map((f) => `${f.name}：${f.error}`).join('\n')
    )
  }

  const overwritten = merged.filter((r) => r.definedBy && r.definedBy.length > 1)
  if (overwritten.length > 0) {
    logger.info(
      'INDEX',
      `${fmt(overwritten.length)} 条配方存在多源覆盖链`,
      overwritten
        .slice(0, 5)
        .map((r) => `${r.recipeId} → 生效：${r.effectiveSource}（链：${r.definedBy!.join(' | ')}）`)
        .join('\n')
    )
  }
  if (!options.skipPersist) {
    const ok = await persist()
    if (ok) logger.debug('INDEX', '配方摘要已写入缓存 recipes.json')
  }
  return s
}
