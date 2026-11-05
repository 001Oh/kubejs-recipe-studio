/**
 * 配方浏览 IPC：recipes:byOutput / byInput / full / stats。
 * 「制作/用途」都走 recipeIndex 的同一份倒排表；接线由 handlers/index.ts 负责（不在本文件调用时机上做假设）。
 */
import { registerHandler } from '../ipcRegistry'
import { ensureSchemas } from '../schema/service'
import { isScanning } from '../scanOrchestrator'
import { logger } from '../logger'
import { lookup, queryByInput, queryByOutput, stats } from '../recipes/recipeIndex'
import { readFullRecipe } from '../recipes/lazy'
import { openRecipe } from '../recipes/openRecipe'
import { commitRecipe } from '../recipes/commitRecipe'

export function registerRecipeHandlers(): void {
  registerHandler('recipes:byOutput', (req) => {
    const page = queryByOutput(req.id, req.offset, req.limit)
    logger.debug('RECIPE', `查询制作配方：${req.id}（命中 ${page.total}）`)
    return page
  })

  registerHandler('recipes:byInput', (req) => {
    const page = queryByInput(req.id, req.offset, req.limit)
    logger.debug('RECIPE', `查询用途配方：${req.id}（命中 ${page.total}）`)
    return page
  })

  registerHandler('recipes:full', async (req) => {
    const record = lookup(req.uid)
    if (!record) throw new Error(`配方不在索引中：${req.uid}`)
    const full = await readFullRecipe(record)
    logger.info('RECIPE', `从配方 ${record.uid} 载入完整 JSON（${record.inputs.length} 个材料 / ${record.outputs.length} 个产物）`)
    return full
  })

  registerHandler('recipes:open', async (req) => {
    // REM-01：`selectSchema` 是同步直读注册表，换包后必须先确保注册表跟上当前包
    await ensureSchemas()
    const opened = await openRecipe(req.uid)
    logger.info(
      'RECIPE',
      `打开配方 ${req.uid}（schema=${opened.schemaSource}，状态=${opened.status}，未建模字段 ${
        opened.normalized?.unknowns.length ?? 0
      } 个）`
    )
    return opened
  })

  registerHandler('recipes:commit', async (req) => {
    // REM-01：同上，提交也要按当前包的 schema 归一化
    await ensureSchemas()
    const result = await commitRecipe(req)
    // B121/D-5：提交本身不阻塞（文件写盘+回读校验独立安全），但扫描收尾的 buildIndex 会
    // 覆盖本次的内存索引更新——把这一事实显式带回 UI，而不是让「提交成功」静默失效。
    if (isScanning() && !result.indexWarning) {
      result.indexWarning = '扫描进行中：扫描收尾可能覆盖本次提交的索引更新，扫描完成后请重新扫描以刷新索引'
      logger.warn('RECIPE', '提交成功，但当前有扫描在运行——索引更新可能被扫描结果覆盖')
    }
    logger.success(
      'RECIPE',
      `提交配方 ${req.uid} → ${result.savedRelativePath}（${result.mode === 'copy' ? '另存副本' : '覆盖'}，字段 ${result.dirtyFields.join('、')}）`
    )
    return result
  })

  registerHandler('recipes:stats', () => stats())
}
