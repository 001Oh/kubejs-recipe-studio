/** 整合包相关 IPC。扫描通道（modpack:scan / scanCancel）由扫描模块注册，这里不碰。 */
import type { ImportCandidates, ImportResult } from '../../shared/ipc'
import { importModpack } from '../modpack'
import { getCurrentModpack, getCurrentSummary, readFavorites, setCurrentModpack, setCurrentSummary } from '../modpack/state'
import { registerHandler } from '../ipcRegistry'
import { cancelScan, isScanning } from '../scanOrchestrator'
import { setItemIndex } from '../scanner/itemIndex'
import { buildIndex } from '../recipes/recipeIndex'
import { resetPluginLoader } from '../plugins/loader'
import { clearSchemas, invalidateSnapshot } from '../schema/registry'
import { ensureSchemas } from '../schema/service'
import { clearSession } from '../codegen/dedupe'
import { getUiState, patchUiState, saveUiState } from '../uiStateStore'
import { logger } from '../logger'

export function registerModpackHandlers(): void {
  registerHandler('modpack:import', async (req): Promise<ImportResult | ImportCandidates> => {
    const path = typeof req?.path === 'string' ? req.path.trim() : ''
    if (!path) {
      const error = '未选择目录，请先选择整合包根目录'
      logger.error('MODPACK', error)
      throw new Error(error)
    }
    const result = await importModpack(path)
    // P3-4：会话去重记录按包计（dedupe 签名不含包身份），导入成功即作废上一包的记录，
    // 否则换包后 findDuplicate 会对新包误报「与已生成的配方重复」。多候选选择不在此列。
    if ('info' in result) clearSession()
    return result
  })

  registerHandler('modpack:current', () => ({
    info: getCurrentModpack(),
    summary: getCurrentSummary(),
    favorites: readFavorites()
  }))

  /**
   * U-17：卸载当前整合包（只清状态/索引/恢复键，**不删包目录、不删缓存与备份**）。
   * 每步独立 try：任何一步失败都只记录，不让「卸载」半途而废。
   */
  registerHandler('modpack:clear', async () => {
    const steps: string[] = []
    const cleared = { scan: false, modpack: false, items: false, recipes: false, plugins: false, restoreKey: false }
    if (isScanning()) {
      try {
        await cancelScan()
        cleared.scan = true
        steps.push('取消扫描')
      } catch (err) {
        logger.warn('MODPACK', '卸载：取消扫描失败', String(err))
      }
    }
    try {
      setCurrentModpack(null)
      setCurrentSummary(null)
      // P3-4：卸载后本会话的「已生成配方」记录全部作废（包都没了，留着必然误报）
      clearSession()
      cleared.modpack = true
      steps.push('清包状态与会话去重')
    } catch (err) {
      logger.warn('MODPACK', '卸载：清包状态失败', String(err))
    }
    try {
      setItemIndex([])
      cleared.items = true
      steps.push('清物品索引')
    } catch (err) {
      logger.warn('MODPACK', '卸载：清物品索引失败', String(err))
    }
    try {
      buildIndex([])
      cleared.recipes = true
      steps.push('清配方索引')
    } catch (err) {
      logger.warn('MODPACK', '卸载：清配方索引失败', String(err))
    }
    try {
      // U-17-PLUGIN-RESIDUE：只 resetPluginLoader 不够——registry 的插件层快照还在，
      // 且 ensureSchemas 会被快照戳短路（factsKey 未变就直接 return）。
      // 故：清 loader → 作废快照戳 → 清所有层 → 强制重建（内置 3 + 空插件层 + pinned）。
      resetPluginLoader()
      invalidateSnapshot()
      clearSchemas()
      await ensureSchemas()
      cleared.plugins = true
      steps.push('重置插件层与注册表')
    } catch (err) {
      logger.warn('MODPACK', '卸载：重置插件层失败', String(err))
    }
    try {
      const ui = getUiState()
      patchUiState({ ...ui, lastModpackPath: null, lastModpackName: null } as never)
      saveUiState()
      cleared.restoreKey = true
      steps.push('清恢复键')
    } catch (err) {
      logger.warn('MODPACK', '卸载：清恢复键失败', String(err))
    }
    logger.info('MODPACK', `已卸载整合包（${steps.join('、')}）；包目录/缓存/备份均保留`)
    return { ok: true, cleared }
  })
}