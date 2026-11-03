/**
 * 物品扫描服务：只负责「拿到一份完整物品索引」这一件事。
 * - 缓存命中：直接读 `items.json`（校验签名/版本/解析器/extras/阶段，见 cache.ts）
 * - 缓存失效：并发扫描全部 mod jar → 合并 → 原子写 `items.json`
 * meta 不在这里写：只有上层编排在语料建成后才提交「完整有效」（避免半成品被当成完整缓存）。
 */
import { existsSync, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { ItemEntry, ModpackInfo } from '../../shared/types'
import { computeExtrasSignature, computeModsSignature, isCacheValid, PARSER_VERSION, writeJson, type CacheMeta } from '../cache'
import { cacheFile, ensureModpackCacheDir, iconCacheDir, modpackCacheDir } from '../paths'
import { logger } from '../logger'
import { runJarPool } from './pool'
import { resolveMissingIcons, type IconMiss } from './iconPass'

export interface ItemScanStats {
  jars: number
  usedWorkers: boolean
  failed: { name: string; error: string }[]
  missingZh: number
  withIcon: number
  /** 缺图标中「资源本就不在包里」的数量（不是提取器缺陷） */
  iconMissingNoAssets: number
}

export interface ItemScanResult {
  items: ItemEntry[]
  cacheHit: boolean
  elapsedMs: number
  stats: ItemScanStats
  /** 命中/未命中缓存的原因，写进日志与摘要 */
  cacheReason: string
  extras: string
  signature: Awaited<ReturnType<typeof computeModsSignature>>
}

export interface ItemScanOptions {
  modpack: ModpackInfo
  rebuild: boolean
  signal: AbortSignal
  onProgress: (label: string, current: number, total: number) => void
}

const CONFIDENCE_RANK = { lang: 4, block: 3, model: 2, texture: 1 } as const

/** 同一 ID 出现在多个 jar 时合并：名字取第一个非空，图标/置信度取更强的一方 */
export function mergeItems(fragments: readonly ItemEntry[]): ItemEntry[] {
  const out = new Map<string, ItemEntry>()
  for (const item of fragments) {
    const prev = out.get(item.id)
    if (!prev) {
      out.set(item.id, item)
      continue
    }
    out.set(item.id, {
        ...prev,
        nameZh: prev.nameZh || item.nameZh,
        nameEn: prev.nameEn || item.nameEn,
        confidence:
          CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[prev.confidence] ? item.confidence : prev.confidence,
        verified: prev.verified || item.verified,
        hasIcon: prev.hasIcon || item.hasIcon,
        iconKey: prev.iconKey ?? item.iconKey,
        virtual: prev.virtual || item.virtual,
        hasRecipe: prev.hasRecipe || item.hasRecipe,
        pyFull: prev.pyFull.length > 0 ? prev.pyFull : item.pyFull,
        pyInitials: prev.pyInitials.length > 0 ? prev.pyInitials : item.pyInitials
    })
  }
  return [...out.values()]
}

export async function scanItems(options: ItemScanOptions): Promise<ItemScanResult> {
  const { modpack, rebuild, signal, onProgress } = options
  const started = Date.now()
  ensureModpackCacheDir(modpack.path)
  await fsp.mkdir(iconCacheDir(), { recursive: true })
  const signature = await computeModsSignature(modpack.modsDir)
  const extras = await computeExtrasSignature(modpack.path)
  const itemsPath = cacheFile(modpack.path, 'items')
  logger.debug(
    'INDEX',
    `缓存目录：${modpackCacheDir(modpack.path)}（meta 存在：${existsSync(cacheFile(modpack.path, 'meta'))}，items 存在：${existsSync(itemsPath)}）`
  )

  if (!rebuild) {
    const cache = await isCacheValid(modpack.path, signature, modpack.mcVersion, modpack.kubejsVersion, {
      requiredPhases: ['items'],
      extras
    })
    if (cache.valid) {
      const cached = await readItemsCache(itemsPath)
      if (cached) {
        const elapsedMs = Date.now() - started
        logger.info('INDEX', `命中物品缓存：${modpack.name}（${cached.length} 个物品，读取耗时 ${elapsedMs}ms）`)
        onProgress('从缓存恢复物品索引', 1, 1)
        return {
          items: cached,
          cacheHit: true,
          elapsedMs,
          stats: summarize(cached, 0, false, []),
          cacheReason: cache.reason,
          extras,
          signature
        }
      }
    }
    // 每次扫描都记录缓存判定结果：排查「为什么又重扫了」时这是唯一线索
    logger.info('INDEX', `物品缓存${cache.valid ? '命中' : '未命中'}：${cache.reason}`)
  } else {
    logger.info('INDEX', '用户触发重建：忽略物品缓存')
  }

  const jars = await listJars(modpack.modsDir)
  logger.info('SCAN', `开始扫描 mod jar…（${jars.length} 个）`)
  let seenItems = 0
  let iconPassResult: Awaited<ReturnType<typeof resolveMissingIcons>> | null = null
  const misses: IconMiss[] = []
  const { items: fragments, failed, usedWorkers, entriesByJar } = await runJarPool({
    jars,
    iconDir: iconCacheDir(),
    signal,
    onJar: (done, total, outcome) => {
      seenItems += outcome.items.length
      for (const item of outcome.items) {
        if (!item.hasIcon) misses.push({ id: item.id, jarPath: join(modpack.modsDir, outcome.jarName) })
      }
      if (done % 50 === 0 || done === total) {
        logger.debug('SCAN', `已解析 ${done}/${total}：${outcome.jarName}（累计 ${seenItems} 个物品）`)
      }
      onProgress(`正在解析 ${done}/${total}：${outcome.jarName}`, done, total)
    },
    onJarFailed: (name, error) => {
      logger.error('SCAN', `${name} 解析失败：${error}（已跳过）`)
    }
  })
  if (signal.aborted) throw new Error('已取消：物品扫描')

  // 首轮漏掉的贴图：跨 jar 按模型引用再解析一遍（嵌套目录、方块模型、依赖模组贴图）
  if (misses.length > 0) {
    logger.info('SCAN', `${misses.length} 个物品首轮未命中贴图，开始跨 jar 二次解析…`)
    onProgress('跨 jar 补齐图标…', 1, 2)
    const pass = await resolveMissingIcons(misses, iconCacheDir(), entriesByJar, signal)
    iconPassResult = pass
    for (const item of fragments) {
      const key = pass.resolved.get(item.id)
      if (key) {
        item.hasIcon = true
        item.iconKey = key
      }
    }
    logger.info('INDEX', `图标二次解析：补上 ${pass.resolved.size} 个，仍缺 ${pass.unresolved} 个`)
  }

  const merged = mergeItems(fragments)
  const elapsedMs = Date.now() - started
  const stats = summarize(merged, jars.length, usedWorkers, failed)
  if (iconPassResult) {
    // 只统计「合并后仍然缺图标」的 id：同一物品可能从别的 jar 拿到了图标
    const stillMissing = new Set(merged.filter((i) => !i.hasIcon).map((i) => i.id))
    stats.iconMissingNoAssets = [...iconPassResult.unresolvedIds].filter((id) => stillMissing.has(id)).length
  }
  if (failed.length > 0) logger.warn('SCAN', `${failed.length} 个 mod 解析失败（已跳过，其余照常索引）`)
  logger.info(
    'INDEX',
    `索引完成：${merged.length.toLocaleString('zh-CN')} 个物品 / ${new Set(merged.map((i) => i.modId)).size.toLocaleString('zh-CN')} 个模组命名空间 / 耗时 ${(elapsedMs / 1000).toFixed(1)}s`
  )
  if (stats.missingZh > 0) logger.warn('INDEX', `${stats.missingZh} 个物品缺少中文名，已回退英文名`)

  // 只有全部合并成功后才写 items.json；写盘是 tmp+rename 原子替换，中断不会留下半截文件
  await writeJson(itemsPath, merged)
  return { items: merged, cacheHit: false, elapsedMs, stats, cacheReason: rebuild ? '强制重建' : '缓存失效', extras, signature }
}

export function buildCacheMeta(
  modpack: ModpackInfo,
  signature: ItemScanResult['signature'],
  extras: string,
  elapsed: { itemMs: number; recipeMs: number },
  phases: string[],
  appVersion: string
): CacheMeta {
  return {
    modpackPath: modpack.path,
    signature,
    mcVersion: modpack.mcVersion,
    kubejsVersion: modpack.kubejsVersion,
    builtAtMs: Date.now(),
    itemElapsedMs: elapsed.itemMs,
    recipeElapsedMs: elapsed.recipeMs,
    appVersion,
    schemaVersion: 2,
    parserVersion: PARSER_VERSION,
    extras,
    phases
  }
}

function summarize(
  items: readonly ItemEntry[],
  jars: number,
  usedWorkers: boolean,
  failed: { name: string; error: string }[]
): ItemScanStats {
  let missingZh = 0
  let withIcon = 0
  for (const item of items) {
    if (!item.nameZh) missingZh += 1
    if (item.hasIcon) withIcon += 1
  }
  return { jars, usedWorkers, failed, missingZh, withIcon, iconMissingNoAssets: 0 }
}

async function listJars(modsDir: string): Promise<string[]> {
  const names = await fsp.readdir(modsDir)
  return names
    .filter((name) => name.toLowerCase().endsWith('.jar'))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => join(modsDir, name))
}

async function readItemsCache(path: string): Promise<ItemEntry[] | null> {
  try {
    const raw = await fsp.readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item): item is ItemEntry => {
      if (!item || typeof item !== 'object') return false
      const rec = item as Record<string, unknown>
      return typeof rec['id'] === 'string' && typeof rec['nameZh'] === 'string'
    })
  } catch (err) {
    logger.warn('INDEX', `items.json 读取失败，将重新扫描`, err instanceof Error ? err.message : String(err))
    return null
  }
}
