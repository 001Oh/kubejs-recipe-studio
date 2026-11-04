/**
 * handler 接线点。约定：每个领域在自己的 `xxxHandlers.ts` 里导出 `registerXxxHandlers()`，
 * 由本文件集中调用；各领域模块不要直接修改本文件，避免并行开发时的写冲突。
 */
import { registerAppHandlers } from './appHandlers'
import { registerCodegenHandlers } from './codegenHandlers'
import { registerIconHandlers } from './iconHandlers'
import { registerItemsHandlers } from './itemsHandlers'
import { registerModpackHandlers } from './modpackHandlers'
import { registerPluginHandlers } from './pluginHandlers'
import { registerRecipeHandlers } from './recipeHandlers'
import { registerScanHandlers } from './scanHandlers'
import { registerCacheHandlers } from './cacheHandlers'
import { registerSchemaHandlers } from './schemaHandlers'
import { registerSourceHandlers } from './sourceHandlers'

export function registerHandlers(): void {
  registerAppHandlers()
  registerIconHandlers()
  registerModpackHandlers()
  registerRecipeHandlers()
  registerScanHandlers()
  registerCacheHandlers()
  registerItemsHandlers()
  // 第 115 批续：在资源管理器中定位源文件（只接受 uid，路径由主进程解析并做越界校验）
  registerSourceHandlers()
  // P0：此前遗漏的三组（codegen / plugins / schema）。注册表按名字唯一，重复接线会直接抛错。
  registerSchemaHandlers()
  registerCodegenHandlers()
  registerPluginHandlers()
}
