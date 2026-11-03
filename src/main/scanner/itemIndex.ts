/**
 * 物品索引的内存持有者：`items`（完整，含虚拟物品）+ 由它派生的搜索语料。
 * 语料在索引被替换时重建；查询参数（includeVirtual 等）不触发重建（规格决策 2026-10-31）。
 *
 * BUG-HUNT-03 修复 REM-02：插件通配（`virtualItemPatterns`）变化会改变「哪些物品算虚拟物品」，
 * 而语料的 `virtualMask` 是构建期快照。这里用 `getVirtualPatternsVersion()` 做**惰性失效**：
 * 版本不一致时在**下一次取语料**时重建一次，既保证查询结果跟上插件状态，又不会反复重建。
 */
import type { ItemEntry } from '../../shared/types'
import { buildSearchCorpus, getVirtualPatternsVersion, type SearchCorpus } from '../../shared/search'
import { logger } from '../logger'

let items: readonly ItemEntry[] = []
let corpus: SearchCorpus | null = null
let builtAtMs = 0
/** 构建 corpus 时的插件通配版本号；与当前版本不一致说明规则变了 */
let corpusVersion = -1

export function setItemIndex(next: readonly ItemEntry[]): void {
  items = next
  corpus = buildSearchCorpus(next)
  corpusVersion = getVirtualPatternsVersion()
  builtAtMs = Date.now()
}

export function clearItemIndex(): void {
  items = []
  corpus = null
  corpusVersion = -1
  builtAtMs = 0
}

export function getItems(): readonly ItemEntry[] {
  return items
}

export function getCorpus(): SearchCorpus | null {
  if (!corpus) return null
  // REM-02：插件通配变过 → 用同一份 items 重建一次，之后的查询直接命中新语料
  if (corpusVersion !== getVirtualPatternsVersion()) {
    const from = corpusVersion
    const to = getVirtualPatternsVersion()
    corpus = buildSearchCorpus(items)
    corpusVersion = to
    // D-12：语料重建此前完全静默——换了插件通配后搜索行为变化却没有任何痕迹可查。
    // 只对"确实重建了"这一条打 debug，正常命中不产生日志（避免高频查询刷屏）。
    logger.debug('INDEX', `搜索语料已重建：虚拟通配版本 ${from} → ${to}，语料条目 ${items.length}`)
  }
  return corpus
}

export function getItemById(id: string): ItemEntry | null {
  return items.find((item) => item.id === id) ?? null
}

export function itemCount(): number {
  return items.length
}

export function namespaceCount(): number {
  const set = new Set<string>()
  for (const item of items) set.add(item.modId)
  return set.size
}

export function modCounts(): { modId: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) map.set(item.modId, (map.get(item.modId) ?? 0) + 1)
  return [...map.entries()]
    .map(([modId, count]) => ({ modId, count }))
    .sort((a, b) => b.count - a.count || a.modId.localeCompare(b.modId))
}

export function indexPathBuiltAt(): number {
  return builtAtMs
}
