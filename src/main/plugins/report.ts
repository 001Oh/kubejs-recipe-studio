/**
 * 插件管理页数据（规格 3.6.14 最后那块面板）。
 *
 * 这个页面要一眼回答两件事：
 *   ① 我的包里哪些类型被插件精确支持了（含来源、冲突、降级原因）；
 *   ② 还有哪些类型没被覆盖，将由 L1 反推自动生成表单——插件是加速项，不是必需项。
 */
import { MODPACK_PLUGIN_DIR, PLUGIN_DIR_NAME } from '../../shared/constants'
import type { PluginManifest } from '../../shared/types'
import { typeUniverse } from '../recipes/recipeIndex'
import { planTypeConflicts, type TypeConflict } from './merge'
import { getPluginSchemaOverrides, loadPlugins, virtualItemPatterns } from './loader'

export type PluginStatus = PluginManifest['status']

export interface PluginReportEntry {
  id: string
  name: string
  version: string
  author: string | null
  originLabel: string
  status: PluginStatus
  /** 面板上那一行的图标 + 文案 */
  statusLabel: string
  coveredCount: number
  coveredTypes: string[]
  /** 降级 / 不兼容 / 禁用原因，无则 null */
  note: string | null
  /** 因同 type 被更高优先级插件压掉而产生的冲突说明 */
  conflicts: string[]
  degraded: boolean
  /** 只提供词典、不接管任何配方类型（部分覆盖插件） */
  dictionaryOnly: boolean
  path: string
}

export interface PluginReport {
  entries: PluginReportEntry[]
  loadedCount: number
  degradedCount: number
  incompatibleCount: number
  disabledCount: number
  failedCount: number
  totalTypeCount: number
  coveredTypeCount: number
  uncoveredTypeCount: number
  uncoveredHint: string
  conflicts: TypeConflict[]
  /** 覆盖类型总数（与 schema 注册表拿到的份数一致，便于对账） */
  overrideCount: number
  virtualPatternCount: number
  sourceHint: string
}

export interface PluginReportOptions {
  modpackPath?: string | null
  /** 本包出现过的配方类型全集；缺省取倒排索引的 typeUniverse() */
  allTypeIds?: readonly string[] | null
  /** 已加载列表；缺省现读磁盘（走 loader 缓存） */
  plugins?: readonly PluginManifest[]
}

const STATUS_LABEL: Record<PluginStatus, string> = {
  loaded: '✓ 已加载',
  incompatible: '✗ 不兼容',
  disabled: '— 已禁用',
  failed: '✗ 解析失败'
}

const ORIGIN_LABEL: Record<PluginManifest['origin'], string> = {
  modpack: '整合包',
  user: '用户目录'
}

function knownTypes(options: PluginReportOptions): string[] {
  if (options.allTypeIds) return [...options.allTypeIds]
  try {
    return typeUniverse()
  } catch {
    return []
  }
}

function declaredTypeCount(plugin: PluginManifest): number {
  return Array.isArray(plugin.recipeTypes) ? plugin.recipeTypes.length : 0
}

function entryOf(plugin: PluginManifest, conflicts: readonly TypeConflict[]): PluginReportEntry {
  const degraded = plugin.status === 'loaded' && Boolean(plugin.error)
  const losing = conflicts.filter((c) => c.losers.includes(plugin.id)).map((c) => `${c.type} 已由 ${c.winner}（${ORIGIN_LABEL[c.winnerOrigin]}）提供`)
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    author: plugin.author ?? null,
    originLabel: ORIGIN_LABEL[plugin.origin],
    status: plugin.status,
    statusLabel: degraded ? '⚠ 已降级' : STATUS_LABEL[plugin.status],
    coveredCount: plugin.coveredTypes.length,
    coveredTypes: [...plugin.coveredTypes],
    note: plugin.error ?? null,
    conflicts: losing,
    degraded,
    dictionaryOnly: plugin.status === 'loaded' && declaredTypeCount(plugin) === 0,
    path: plugin.path
  }
}

export function buildPluginReport(options: PluginReportOptions = {}): PluginReport {
  const plugins = options.plugins ? [...options.plugins] : loadPlugins(options.modpackPath ?? null)
  const conflicts = planTypeConflicts(plugins)
  const entries = plugins.map((plugin) => entryOf(plugin, conflicts))
  const covered = new Set<string>()
  for (const plugin of plugins) if (plugin.status === 'loaded') for (const type of plugin.coveredTypes) covered.add(type)
  const all = knownTypes(options)
  const totalTypeCount = all.length
  const uncovered = all.filter((type) => !covered.has(type)).length
  const counts = (status: PluginStatus): number => entries.filter((e) => e.status === status).length
  return {
    entries,
    loadedCount: counts('loaded'),
    degradedCount: entries.filter((e) => e.degraded).length,
    incompatibleCount: counts('incompatible'),
    disabledCount: counts('disabled'),
    failedCount: counts('failed'),
    totalTypeCount,
    coveredTypeCount: covered.size,
    uncoveredTypeCount: totalTypeCount === 0 ? 0 : uncovered,
    uncoveredHint:
      totalTypeCount === 0
        ? '尚未扫描配方，无法统计未覆盖类型'
        : `未覆盖类型 ${uncovered} 个，将由 L1 反推自动生成表单`,
    conflicts,
    overrideCount: getPluginSchemaOverrides().length,
    virtualPatternCount: virtualItemPatterns().length,
    sourceHint: `整合包内插件目录 <整合包>/${MODPACK_PLUGIN_DIR} 优先于 userData/${PLUGIN_DIR_NAME}`
  }
}
