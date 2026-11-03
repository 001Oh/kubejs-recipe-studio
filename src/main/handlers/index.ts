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

export function registerHandlers(): void {
  registerAppHandlers()
  registerIconHandlers()
  registerModpackHandlers()
  registerRecipeHandlers()
  registerScanHandlers()
  registerCacheHandlers()
  registerItemsHandlers()
  // P0：此前遗漏的三组（codegen / plugins / schema）。注册表按名字唯一，重复接线会直接抛错。
  registerSchemaHandlers()
  registerCodegenHandlers()
  registerPluginHandlers()
}
