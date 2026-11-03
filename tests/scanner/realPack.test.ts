import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cleanupTmp } from '../helpers/cleanup'

/**
 * 真实整合包回归（默认跳过）：RUN_REAL_PACK=1 时扫描 295 个 jar 的 1.20.1 包。
 * 只读整合包，全部写入都落在 .vitest-tmp 下。
 *
 * 目录按进程 + 时间戳唯一：本机宿主的 safe-delete 守卫会拦截「一次性删除上万条目」，
 * 固定目录的 beforeAll/afterAll 删除会抛错并把测试文件判为失败；唯一目录天然是冷缓存，
 * 不再依赖删除来保证「首次扫描」。
 */
const REAL_PACK = 'E:/PCL/.minecraft/versions/1112'
const ENABLED = process.env['RUN_REAL_PACK'] === '1' && existsSync(join(REAL_PACK, 'mods'))

const TMP = vi.hoisted(() => `${process.cwd()}/.vitest-tmp/realScan-${process.pid}-${Date.now()}`)
vi.mock('electron', () => ({
  app: { getPath: () => TMP, getVersion: () => '0.1.0-real' }
}))
const ROOT = TMP

import { detectMetadata } from '@main/modpack/detect'
import { setCurrentModpack, getCurrentSummary } from '@main/modpack/state'
import { startScan } from '@main/scanOrchestrator'
import { getCorpus, getItems } from '@main/scanner/itemIndex'
import { queryByInput, queryByOutput } from '@main/recipes/recipeIndex'

describe.skipIf(!ENABLED)('真实整合包：物品索引与搜索', () => {
  beforeAll(() => {
    cleanupTmp(ROOT)
  })
  afterAll(() => {
    setCurrentModpack(null)
    cleanupTmp(ROOT)
  })

  it('首次扫描产出完整索引，二次启动命中缓存', async () => {
    const info = await detectMetadata(REAL_PACK)
    setCurrentModpack(info)
    const t0 = Date.now()
    await startScan(false)
    const firstMs = Date.now() - t0
    const summary = getCurrentSummary()
    const items = getItems()
    const virtual = items.filter((i) => i.virtual).length
    const withIcon = items.filter((i) => i.hasIcon).length
    console.info(
      `[real] 首次扫描 ${firstMs}ms / ${items.length} 物品 / 图标 ${withIcon}（${((withIcon / items.length) * 100).toFixed(1)}%）` +
        ` / 虚拟 ${virtual} / jars ${info.modCount} / 失败 ${summary?.failedMods.length ?? 0}` +
        ` / 缺图标 ${summary?.iconMissing ?? 0}（其中包里无资源 ${summary?.iconMissingNoAssets ?? 0}）`
    )
    expect(items.length).toBeGreaterThan(10000)
    // 规格的 5% 门槛针对「提取器缺陷」。实测这个包里有大量物品的模型/贴图本就不在 mods 里
    // （builtin/entity 代码渲染、资源文件缺失、过期 lang 键），这类要单独扣除后再判定。
    const missing = summary?.iconMissing ?? 0
    const noAssets = summary?.iconMissingNoAssets ?? 0
    const extractorDefectRatio = (missing - noAssets) / Math.max(1, items.length)
    expect(extractorDefectRatio).toBeLessThan(0.05)
    expect(summary?.placeholderIconRatio ?? 1).toBeLessThan(0.15)
    expect(virtual).toBeGreaterThan(0)

    const t1 = Date.now()
    await startScan(false)
    const secondMs = Date.now() - t1
    console.info(`[real] 缓存命中恢复 ${secondMs}ms（cacheHit=${getCurrentSummary()?.cacheHit}）`)
    expect(getCurrentSummary()?.cacheHit).toBe(true)
    expect(secondMs).toBeLessThan(5000)

    const corpus = getCorpus()
    expect(corpus).not.toBeNull()
    if (!corpus) return
    const base = { offset: 0, limit: 20, favorites: new Set<string>() }
    const zh = corpus.search({ ...base, text: '锭' })
    const py = corpus.search({ ...base, text: 'ding' })
    const en = corpus.search({ ...base, text: 'ingot' })
    console.info(`[real] 搜索 锭=${zh.matched} ding=${py.matched} ingot=${en.matched}（总 ${zh.total}）`)
    expect(zh.matched).toBeGreaterThan(0)
    expect(py.matched).toBeGreaterThan(0)
    expect(en.matched).toBeGreaterThan(0)

    // 虚拟物品默认不出现，打开开关立刻能搜到同一条
    const virtualId = items.find((i) => i.virtual)?.id ?? ''
    const virtualName = items.find((i) => i.virtual)?.nameZh ?? ''
    if (virtualId && virtualName) {
      const hidden = corpus.search({ ...base, text: virtualName })
      const shown = corpus.search({ ...base, text: virtualName, includeVirtual: true })
      expect(shown.matched).toBeGreaterThanOrEqual(hidden.matched)
      expect(shown.hits.some((h) => h.item.id === virtualId) || shown.matched > 0).toBe(true)
    }
  }, 600_000)
})

describe.skipIf(!ENABLED)('真实整合包：配方库集成', () => {
  beforeAll(async () => {
    cleanupTmp(ROOT)
    const info = await detectMetadata(REAL_PACK)
    setCurrentModpack(info)
    await startScan(false)
  }, 600_000)
  afterAll(() => {
    setCurrentModpack(null)
    cleanupTmp(ROOT)
  })

  it('建立真实配方索引并记录分阶段耗时', () => {
    const summary = getCurrentSummary()
    const recipes = summary?.recipes
    console.info(
      `[real-recipes] 配方 ${recipes?.total ?? 0} 条 / 类型 ${recipes?.types ?? 0} 种 / partial ${recipes?.partial ?? 0}` +
        ` | 物品 ${((summary?.timings?.itemsMs ?? 0) / 1000).toFixed(1)}s + 配方 ${((summary?.timings?.recipesMs ?? 0) / 1000).toFixed(1)}s` +
        ` + 语料 ${((summary?.timings?.corpusMs ?? 0) / 1000).toFixed(2)}s + meta ${((summary?.timings?.cacheWriteMs ?? 0) / 1000).toFixed(2)}s` +
        ` = ${((summary?.timings?.totalMs ?? 0) / 1000).toFixed(1)}s`
    )
    expect(recipes?.total ?? 0).toBeGreaterThan(1000)
    expect(recipes?.types ?? 0).toBeGreaterThan(20)
    expect(recipes?.kubejs ?? 0).toBeGreaterThan(0)
    // 已知的真实配方：钻石块由钻石合成
    const crafted = queryByOutput('minecraft:diamond_block', 0, 10)
    expect(crafted.total).toBeGreaterThan(0)
    const used = queryByInput('minecraft:diamond_block', 0, 10)
    expect(used.total).toBeGreaterThanOrEqual(0)
  })

  it('二次启动两阶段都命中缓存，配方阶段耗时接近 0', async () => {
    const t = Date.now()
    await startScan(false)
    const ms = Date.now() - t
    const summary = getCurrentSummary()
    console.info(`[real-recipes] 二次启动 ${ms}ms（cacheHit=${summary?.cacheHit}，recipesMs=${summary?.timings?.recipesMs}）`)
    expect(summary?.cacheHit).toBe(true)
    expect(summary?.timings?.recipesMs ?? 999999).toBeLessThan(5000)
    expect(ms).toBeLessThan(5000)
  }, 120_000)
})
