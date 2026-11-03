/**
 * 扫描编排（唯一入口）：
 *   物品扫描（缓存命中则跳过） → 配方库（缓存命中则只恢复） → 建立搜索语料 → 产出索引摘要 → **最后**提交 meta
 * `modpack:scan` / `modpack:scanCancel` 只经 handlers/scanHandlers.ts 注册，这里不碰 IPC 注册。
 *
 * 缓存策略按阶段分离（见 cache.ts）：
 * - 物品阶段只看 mods 签名 / 版本 / 解析器版本；
 * - 配方阶段额外看 extras（kubejs 脚本、kubejs/data、openloader、datapacks）。
 * meta 只有在**全部阶段成功**后才落盘；任何阶段抛错或被取消都不写，下次启动必然重扫。
 */
import { app } from 'electron'
import type { IndexSummary, ModpackInfo, RecipeStats, ScanProgress } from '../shared/types'
import { logger } from './logger'
import { emitEvent } from './ipcRegistry'
import { getMainWindow } from './window'
import { beginTask, cancelTask, endTask } from './scanControl'
import { getCurrentModpack, setCurrentSummary } from './modpack/state'
import { buildCacheMeta, scanItems, type ItemScanResult } from './scanner/scanService'
import { setItemIndex } from './scanner/itemIndex'
import { endScanSession, startScanSession } from './scanner/scanSession'
import { isCacheValid, saveCacheMeta } from './cache'
import { cacheFile } from './paths'
import { loadFromCache as loadRecipeCache, stats as recipeStats } from './recipes/recipeIndex'
import { createProgressThrottle } from './progressThrottle'
import { scanRecipes, type EmitProgress } from './recipes/scanRecipes'

export const SCAN_TASK_ID = 'items-scan'

let running = false

export function isScanning(): boolean {
  return running
}

function emitProgress(progress: ScanProgress): void {
  emitEvent(getMainWindow(), { kind: 'progress', progress })
}

interface Timings {
  itemsMs: number
  recipesMs: number
  corpusMs: number
  cacheWriteMs: number
  totalMs: number
}

function summaryOf(modpack: ModpackInfo, result: ItemScanResult, recipes: RecipeStats, timings: Timings): IndexSummary {
  const total = result.items.length
  const withIcon = result.stats.withIcon
  const ratio = total === 0 ? 0 : 1 - withIcon / total
  return {
    items: total,
    namespaces: new Set(result.items.map((item) => item.modId)).size,
    itemElapsedMs: result.elapsedMs,
    missingZhNames: result.stats.missingZh,
    placeholderIconRatio: Math.round(ratio * 10000) / 10000,
    iconMissing: total - withIcon,
    iconMissingNoAssets: result.stats.iconMissingNoAssets,
    recipes,
    cacheHit: result.cacheHit,
    cachePath: cacheFile(modpack.path, 'items'),
    failedMods: result.stats.failed,
    // 规格禁止事项 19：占位图比例超过 5% 视为提取器缺陷，必须显式告警而不是悄悄兜底
    iconWarning: ratio > 0.05,
    timings
  }
}

/** 可注入实现，仅供测试替换 IO 边界（生产永远走真实扫描） */
export interface ScanDeps {
  scan?: typeof scanItems
  scanRecipes?: (emit: EmitProgress, options: { isAborted?: () => boolean; skipPersist?: boolean }) => Promise<RecipeStats>
  loadRecipeCache?: () => Promise<boolean>
  recipeStats?: () => RecipeStats | null
}

/**
 * 启动一次完整扫描（物品 + 配方）。已有扫描在跑时返回 started:false。
 * 失败与取消都通过事件通知渲染端，不向 IPC 调用方抛未捕获异常。
 */
export async function startScan(rebuild: boolean, deps: ScanDeps = {}): Promise<{ started: boolean; reason?: string }> {
  if (running) return { started: false, reason: '已有扫描在进行' }
  const modpack = getCurrentModpack()
  if (!modpack) return { started: false, reason: '尚未导入整合包' }
  running = true
  // OPT4-R4：本次扫描的产物记录（取消时按它精确清理；完成/失败只丢弃）
  startScanSession()
  const startedAt = Date.now()
  const signal = beginTask(SCAN_TASK_ID)
  const scan = deps.scan ?? scanItems
  const runRecipes = deps.scanRecipes ?? scanRecipes
  const loadRecipes = deps.loadRecipeCache ?? loadRecipeCache
  const readRecipeStats = deps.recipeStats ?? recipeStats
  let phase: ScanProgress['phase'] = 'items'
  // 进度只用来刷 UI：按「前进 ≥20 个任务 且 距上次 ≥250ms」节流，阶段切换与收尾必发
  const uiProgress = createProgressThrottle(emitProgress, { minStep: 20, minIntervalMs: 250 })
  const progress = (label: string, current: number, total: number, p: ScanProgress['phase'] = phase): void => {
    uiProgress.push({ phase: p, current, total, label, elapsedMs: Date.now() - startedAt })
  }
  try {
    // ── 阶段 1：物品索引（内部自带缓存判定，命中则不重扫）
    phase = 'items'
    progress('准备扫描物品…', 0, 1)
    const tItems = Date.now()
    const items = await scan({ modpack, rebuild, signal, onProgress: progress })
    if (signal.aborted) throw new Error('已取消：物品扫描')
    const itemsMs = Date.now() - tItems

    // ── 阶段 2：配方库（物品与配方共用同一份 mods 签名；配方额外要求 extras 一致）
    phase = 'recipes'
    const tRecipes = Date.now()
    let recipeCacheHit = false
    const fullCache = await isCacheValid(modpack.path, items.signature, modpack.mcVersion, modpack.kubejsVersion, {
      requiredPhases: ['items', 'recipes'],
      extras: items.extras
    })
    if (!rebuild && fullCache.valid) {
      recipeCacheHit = await loadRecipes()
      if (recipeCacheHit) logger.info('INDEX', `命中配方缓存：${fullCache.reason}`)
      else logger.warn('INDEX', '配方缓存文件读取失败，改为重新扫描配方')
    }
    if (!recipeCacheHit) {
      progress('开始构建配方库…', 0, 1, 'recipes')
      // scanRecipes 的回调接收的是 ScanProgress 对象，这里做一次适配
      const recipeEmit: EmitProgress = (p) => {
        phase = p.phase
        emitProgress(p)
      }
      await runRecipes(recipeEmit, { isAborted: () => signal.aborted })
    }
    if (signal.aborted) throw new Error('已取消：配方扫描')
    const recipes = readRecipeStats()
    if (!recipes) throw new Error('配方索引构建失败：没有可用记录')
    const recipesMs = Date.now() - tRecipes

    // ── 阶段 3：搜索语料（只由物品索引派生，与显示偏好无关）
    phase = 'items'
    const tCorpus = Date.now()
    progress('建立搜索语料…', 1, 1, 'items')
    setItemIndex(items.items)
    const corpusMs = Date.now() - tCorpus

    const timings: Timings = { itemsMs, recipesMs, corpusMs, cacheWriteMs: 0, totalMs: Date.now() - startedAt }
    const summary = summaryOf(modpack, items, recipes, timings)
    setCurrentSummary(summary)

    // ── 阶段 4：提交 meta（只有走到这里才代表「这份缓存完整可用」）
    const tMeta = Date.now()
    await saveCacheMeta(
      buildCacheMeta(
        modpack,
        items.signature,
        items.extras,
        { itemMs: itemsMs, recipeMs: recipesMs },
        ['items', 'recipes'],
        app.getVersion()
      )
    )
    timings.cacheWriteMs = Date.now() - tMeta
    timings.totalMs = Date.now() - startedAt

    progress('索引已就绪', 1, 1, 'items')
    uiProgress.flush({ phase: 'items', current: 1, total: 1, label: '索引已就绪', elapsedMs: Date.now() - startedAt })
    const virtual = items.items.filter((item) => item.virtual).length
    logger.success(
      'INDEX',
      `索引就绪：${summary.items.toLocaleString('zh-CN')} 个物品（含虚拟 ${virtual}）/ ${summary.namespaces} 个命名空间 / ` +
        `配方 ${recipes.total.toLocaleString('zh-CN')} 条（类型 ${recipes.types} 种）`
    )
    logger.info(
      'INDEX',
      `耗时明细：物品 ${(itemsMs / 1000).toFixed(1)}s${items.cacheHit ? '（缓存命中）' : ''} + 配方 ${(recipesMs / 1000).toFixed(1)}s` +
        `${recipeCacheHit ? '（缓存命中）' : ''} + 语料 ${(corpusMs / 1000).toFixed(2)}s + 缓存提交 ${(timings.cacheWriteMs / 1000).toFixed(2)}s` +
        ` = 合计 ${(timings.totalMs / 1000).toFixed(1)}s`
    )
    if (summary.iconWarning) {
      const noAssets = summary.iconMissingNoAssets ?? 0
      const missing = summary.iconMissing ?? 0
      logger.warn(
        'INDEX',
        `占位图比例 ${(summary.placeholderIconRatio * 100).toFixed(2)}% 超过 5%：缺图标 ${missing} 个，` +
          `其中 ${noAssets} 个是包里没有对应模型/贴图（资源缺失），其余 ${Math.max(0, missing - noAssets)} 个才算提取器可能漏匹配`
      )
    }
    emitEvent(getMainWindow(), { kind: 'index-ready', summary })
    return { started: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // meta 不写：物品 items.json 可能刚写过，但没有 meta 就永远不会被当成「完整缓存」
    if (signal.aborted || message.includes('已取消')) {
      // OPT4-R4（方案 A，负责人裁定）：取消 = 停任务 + 清部分索引 + 不写 meta。
      // **不删图标/缓存文件**——它们是按内容寻址的纯缓存，留着下次扫描直接命中；
      // 且实测清 3.7 万个文件要数分钟，同步删会让「取消」变成「等几分钟」。
      setItemIndex([])
      logger.info('SCAN', `扫描已取消（阶段：${phase}）：部分索引已清空，未写入缓存 meta（图标缓存保留，下次扫描直接命中）`)
      emitEvent(getMainWindow(), { kind: 'scan-canceled' })
    } else {
      logger.error('SCAN', `扫描失败（阶段：${phase}）：${message}`, err instanceof Error ? err.stack : undefined)
      emitEvent(getMainWindow(), { kind: 'scan-failed', error: message, phase })
    }
    return { started: true }
  } finally {
    running = false
    endScanSession()
    endTask(SCAN_TASK_ID)
  }
}

export async function cancelScan(): Promise<{ canceled: boolean }> {
  if (!running) return { canceled: false }
  return { canceled: await cancelTask(SCAN_TASK_ID) }
}
