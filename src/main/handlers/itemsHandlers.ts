/**
 * 物品查询通道：只读内存索引 + 搜索语料，不做任何扫描/重建。
 * `includeVirtual` 是唯一的显示开关，直接透传给 searchCorpus（切换它不会触发重扫或重建）。
 */
import { registerHandler } from '../ipcRegistry'
import { getCurrentModpack, getCurrentSummary, readFavorites, setFavorite, setCurrentSummary } from '../modpack/state'
import { getCorpus, getItemById, getItems, modCounts, setItemIndex } from '../scanner/itemIndex'
import { runProbeImport } from '../scanner/probeImport'
import { scannedOnly } from '../vanillaItems'
import { writeJson } from '../cache'
import { cacheFile } from '../paths'
import { assertScanIdle } from '../scanOrchestrator'
import { logger } from '../logger'
import type { ItemsQueryResult } from '../../shared/ipc'

const EMPTY: ItemsQueryResult = { total: 0, matched: 0, hits: [], elapsedMs: 0 }

export function registerItemsHandlers(): void {
  registerHandler('items:query', (query) => {
    const corpus = getCorpus()
    if (!corpus) return EMPTY
    return corpus.search({ ...query, favorites: new Set(readFavorites()) })
  })

  registerHandler('items:get', ({ id }) => getItemById(id))

  registerHandler('items:mods', () => modCounts())

  registerHandler('favorites:set', ({ id, on }) => setFavorite(id, on))

  registerHandler('probe:import', async ({ paths }) => {
    // B121/D-5：扫描中导入会与扫描收尾互相覆盖内存索引与 items.json（verified 标记静默丢失）
    assertScanIdle('导入注册表导出')
    const modpack = getCurrentModpack()
    if (!modpack) throw new Error('尚未导入整合包')
    const before = getItems()
    const { items, result } = await runProbeImport(paths, before)
    // 注册表只更新「已注册」标记与新 id，不重扫 jar；语料随索引重建一次（41k 条约 0.4s）
    setItemIndex(items)
    // items.json 同步写回，避免下次重启丢失 verified 标记（meta 不动，缓存签名不受影响）。
    // B120/D-07：必须先滤掉内存合成的原版/引用条目——缓存文件只能存 mod 派生口径，
    // 否则原版清单会被固化进缓存，随应用版本更新失去可维护性。
    await writeJson(cacheFile(modpack.path, 'items'), scannedOnly(items))
    const summary = getCurrentSummary()
    if (summary) {
      setCurrentSummary({
        ...summary,
        items: items.length,
        namespaces: new Set(items.map((item) => item.modId)).size
      })
    }
    logger.info('INDEX', `注册表导入后索引更新：${before.length} → ${items.length} 个物品`)
    return result
  })
}
