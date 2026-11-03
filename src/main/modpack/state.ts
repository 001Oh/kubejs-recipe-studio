/**
 * 当前整合包会话状态（内存）+ 收藏持久化。
 * 扫描编排与 handler 都从这里读写，避免各模块各存一份「当前路径」。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { IndexSummary, ModpackInfo, RecipeStats } from '../../shared/types'
import { clearItemIndex } from '../scanner/itemIndex'
import { favoritesFile } from '../paths'
import { logger } from '../logger'

let current: ModpackInfo | null = null
let summary: IndexSummary | null = null

export function setCurrentModpack(info: ModpackInfo | null): void {
  // 换包（路径变化）时摘要与内存索引必须一起清空：否则界面会显示上一个包的物品数与语料
  const changed = (current?.path ?? null) !== (info?.path ?? null)
  current = info
  if (info === null || changed) {
    summary = null
    clearItemIndex()
  }
}

export function getCurrentModpack(): ModpackInfo | null {
  return current
}

export function requireCurrentModpack(): ModpackInfo {
  if (!current) throw new Error('尚未导入整合包')
  return current
}

export function setCurrentSummary(next: IndexSummary | null): void {
  summary = next
}

export function getCurrentSummary(): IndexSummary | null {
  return summary
}

/**
 * P-C5：提交配方后只刷新摘要里的配方统计（物品数、图标率、耗时都不动）。
 * 否则顶栏与设置页会继续显示提交前的「配方 N 条 / partial M 条」，与索引实际内容不一致。
 */
export function patchSummaryRecipes(recipes: RecipeStats): void {
  if (!summary) return
  summary = { ...summary, recipes }
}

let favoritesCache: string[] | null = null

export function readFavorites(): string[] {
  if (favoritesCache) return favoritesCache
  const file = favoritesFile()
  if (!existsSync(file)) {
    favoritesCache = []
    return favoritesCache
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    favoritesCache = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch (err) {
    logger.warn('IO', 'favorites.json 解析失败，已重置', err instanceof Error ? err.message : String(err))
    favoritesCache = []
  }
  return favoritesCache
}

export function setFavorite(id: string, on: boolean): string[] {
  const list = new Set(readFavorites())
  if (on) list.add(id)
  else list.delete(id)
  const next = [...list].sort()
  favoritesCache = next
  try {
    writeFileSync(favoritesFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    logger.warn('IO', '收藏写入失败', err instanceof Error ? err.message : String(err))
  }
  return next
}
