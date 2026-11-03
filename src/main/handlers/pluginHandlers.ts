/**
 * 插件 IPC：`plugins:list` / `plugins:setEnabled`（规格 3.6.14 插件管理页）。
 * 接线由 handlers/index.ts 的 registerHandlers() 负责，本文件不自行动那张表。
 */
import type { PluginManifest } from '../../shared/types'
import { registerHandler } from '../ipcRegistry'
import { logger } from '../logger'
import { getCurrentModpack } from '../modpack/state'
import { getPluginLoadStatus, loadPlugins, persistPluginState, setEnabled } from '../plugins/loader'

/** 重复注册保护：IPC 注册表按名字唯一，热重载或多处接线时不炸主进程 */
let registered = false

export function registerPluginHandlers(): void {
  if (registered) return
  registered = true

  registerHandler('plugins:list', (): PluginManifest[] => {
    const modpack = getCurrentModpack()
    return loadPlugins(modpack?.path ?? null)
  })

  registerHandler('plugins:setEnabled', (req): PluginManifest[] => {
    const id = typeof req?.id === 'string' ? req.id.trim() : ''
    if (!id) throw new Error('plugins:setEnabled 需要非空插件 id')
    if (typeof req?.on !== 'boolean') throw new Error('plugins:setEnabled 的 on 必须是布尔值')
    const list = setEnabled(id, req.on)
    // T-05：只有经 IPC 的「用户操作」才落盘（loader 内部切换不写盘，见 persistPluginState 注释）
    persistPluginState()
    logger.info('PLUGIN', `插件 ${id} 已${req.on ? '启用' : '关闭'}（列表内共 ${list.length} 项）`)
    return list
  })

  /**
   * T-07：把「上一次读取是否失败」暴露给 UI。
   * 只读、不触发加载 —— 失败态应当由 `plugins:list` 的副作用产生，本通道只负责如实报告。
   */
  registerHandler('plugins:loadStatus', () => getPluginLoadStatus())
}
