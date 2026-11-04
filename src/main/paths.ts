/** userData 目录布局。任何写盘路径都必须经这里派生，禁止功能代码拼接绝对路径。 */
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  CACHE_DIR_NAME,
  ICON_CACHE_DIR_NAME,
  LOG_DIR_NAME,
  PLUGIN_DIR_NAME
} from '../shared/constants'

let root: string | null = null

/** app.getPath('userData') 只有在 app ready 前才稳定，这里缓存一次。 */
export function studioRoot(): string {
  if (!root) root = app.getPath('userData')
  return root
}

export function ensureBaseDirs(): void {
  for (const dir of [studioRoot(), iconCacheDir(), logsDir(), userPluginDir(), cacheRootDir()]) {
    mkdirSync(dir, { recursive: true })
  }
}

export function cacheRootDir(): string {
  return join(studioRoot(), CACHE_DIR_NAME)
}

export function iconCacheDir(): string {
  return join(studioRoot(), ICON_CACHE_DIR_NAME)
}

export function logsDir(): string {
  return join(studioRoot(), LOG_DIR_NAME)
}

export function userPluginDir(): string {
  return join(studioRoot(), PLUGIN_DIR_NAME)
}

export function favoritesFile(): string {
  return join(studioRoot(), 'favorites.json')
}

export function customTypesFile(): string {
  return join(studioRoot(), 'customRecipeTypes.json')
}

/**
 * T-05：插件启停清单（只记"被用户关掉"的 id）。
 *
 * 放在 userData 根、与 `customRecipeTypes.json` 同级，理由一致：属于用户偏好，
 * 不随整合包变化（换包后关掉的插件仍应保持关闭）。
 */
export function pluginDisabledFile(): string {
  return join(studioRoot(), 'plugin-disabled.json')
}

export function uiStateFile(): string {
  return join(studioRoot(), 'uiState.json')
}

/** 同一整合包路径恒定映射到同一缓存目录；Windows 大小写不敏感，先归一化。 */
export function modpackHash(modpackPath: string): string {
  const normalized = modpackPath.replace(/[\\/]+$/, '').toLowerCase().replace(/\\/g, '/')
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

export function modpackCacheDir(modpackPath: string): string {
  return join(cacheRootDir(), modpackHash(modpackPath))
}

export function cacheFile(
  modpackPath: string,
  name: 'items' | 'recipes' | 'meta' | 'probe' | 'schemas' | 'inferred-shapes' | 'inferred-schemas'
): string {
  return join(modpackCacheDir(modpackPath), `${name}.json`)
}

export function ensureModpackCacheDir(modpackPath: string): string {
  const dir = modpackCacheDir(modpackPath)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * P-C6：配方原文件备份目录（按整合包分目录）。
 * 刻意放在 userData 下、而**不是** `kubejs/data/**`：后者会被数据包扫描当成新配方读入，
 * 备份文件会被误认为有效配方；放在 userData 也不会污染用户的整合包目录。
 */
export function recipeBackupDir(modpackPath: string): string {
  return join(studioRoot(), 'recipe-backups', modpackHash(modpackPath))
}

export function ensureRecipeBackupDir(modpackPath: string): string {
  const dir = recipeBackupDir(modpackPath)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * C7-F1：超额旧备份的**隔离区**（与 `recipe-backups` 同级、同卷）。
 *
 * 为什么不直接删：备份是用户唯一的"还原到改动前"手段，超额清理必须是**可反悔**的移动，
 * 并保留 2 天（D-36）后才永久删除。与备份目录同级是为了 `rename` 走同卷、不产生复制。
 */
export function recipeBackupTrashDir(modpackPath: string): string {
  return join(studioRoot(), 'recipe-backups-trash', modpackHash(modpackPath))
}

export function ensureRecipeBackupTrashDir(modpackPath: string): string {
  const dir = recipeBackupTrashDir(modpackPath)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function iconFile(iconKey: string): string {
  return join(iconCacheDir(), `${iconKey}.png`)
}export function iconKeyFor(itemId: string): string {
  return createHash('sha1').update(itemId).digest('hex')
}
