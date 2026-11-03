/** 主进程入口：应用生命周期、协议注册、IPC 安装、扫描中断。 */
import { app, BrowserWindow } from 'electron'
import { logger, pruneOldLogs, recentLogs, setMainLogSink } from './logger'
import { ensureBaseDirs } from './paths'
import { installIconProtocol, registerIconSchemePrivileges } from './iconProtocol'
import { emitEvent, installIpc, registeredChannels } from './ipcRegistry'
import { registerHandlers } from './handlers'
import { cancelAll } from './scanControl'
import { applyUserDataDir } from './envPaths'
import { acquireSingleInstanceLock, restoreExistingWindow } from './singleInstance'
import { createWindow, getMainWindow } from './window'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { detectMetadata } from './modpack/detect'
import { setCurrentModpack } from './modpack/state'
import { getUiState, patchUiState, saveUiState } from './uiStateStore'
import { startScan } from './scanOrchestrator'
import { loadPlugins, syncPluginLayer } from './plugins/loader'
import { ensureSchemas } from './schema/service'
import { setRestoreIssue } from './modpack/restoreIssue'

// 自定义协议必须在 app ready 之前声明特权
registerIconSchemePrivileges()

// electron-vite 注入 ELECTRON_RENDERER_URL；兼容直接跑 vite 时的 VITE_DEV_SERVER_URL
function rendererDevUrl(): string | undefined {
  return process.env['ELECTRON_RENDERER_URL'] ?? process.env['VITE_DEV_SERVER_URL']
}

/** handler 注册失败（例如两个模块抢同一 channel）不能连累窗口启动，必须留下可查的 ERROR。 */function safeRegisterHandlers(): void {
  try {
    registerHandlers()
  } catch (err) {
    logger.error(
      'IO',
      `IPC handler 注册中断：${err instanceof Error ? err.message : String(err)}`,
      '检查 handlers/index.ts 是否有重复注册的 channel'
    )
  }
}

// P2：数据目录隔离必须最先执行（dev 用 `<默认>-dev`；测试可用 STUDIO_USER_DATA 或 --user-data-dir）。
// 顺序不能变：单实例锁文件就在 userData 下，任何 getPath('userData') 之前都要先定好路径。
const userDataInfo = applyUserDataDir(app)

// P1-C2：单实例锁必须在 whenReady 之前取得；第二个实例直接退出，不初始化 IPC / 协议 / 窗口，
// 否则两个进程会共享同一 userData 与同一整合包缓存（P-C7 记录的多实例风险）。
/**
 * T-25：冷启动恢复上次整合包（校验方案 A：目录存在 + mods/ 存在 + 检测名一致）。
 * 恢复后调 startScan(false)——该函数自带缓存命中（物品/配方/meta 校验），
 * 命中即跳过重扫；无缓存时它本来就会重扫，等价于降级，不另写一套缓存载入。
 * 任何一步失败都只清空记录并提示，绝不静默留空列表。
 */
async function restoreLastModpack(): Promise<void> {
  const st = getUiState()
  const path = st.lastModpackPath
  const wantName = st.lastModpackName
  if (!path) return
  const forget = (): void => {
    patchUiState({ lastModpackPath: '', lastModpackName: '' })
    saveUiState()
  }
  if (!existsSync(path) || !existsSync(join(path, 'mods'))) {
    logger.warn('MODPACK', '上次使用的整合包不可用，请重新导入', `路径：${path}（目录或 mods/ 不存在）`)
    // 第 6 条：同时写可读状态，让设置页能显示横幅（此前只有日志，界面上完全看不到）
    setRestoreIssue('上次使用的整合包不可用（目录或 mods/ 不存在），请重新导入。')
    forget()
    return
  }
  try {
    const info = await detectMetadata(path)
    if (wantName && info.name !== wantName) {
      logger.warn('MODPACK', '上次使用的整合包不可用，请重新导入', `名称不符：记录「${wantName}」，当前「${info.name}」`)
      setRestoreIssue(`上次使用的整合包名称已变化（记录「${wantName}」，当前「${info.name}」），请确认后再导入。`)
      forget()
      return
    }
    setCurrentModpack(info)
    logger.info('MODPACK', `已恢复上次的整合包：${info.name}`, `路径：${info.path}`)
    // 期望插件层随包恢复。注意顺序：必须先 loadPlugins 把记录装进内存，
    // 再 syncPluginLayer/ensureSchemas 才能把插件类型并入注册表。
    // 不走懒加载是因为恢复是后台异步：UI 的首次 plugins:list 可能先到，
    // 一旦它带着旧的/空的状态跑了 ensureLoaded，之后就再没人触发加载（RT-01 回归的成因）。
    try {
      const loaded = loadPlugins(info.path, { modpack: info })
      logger.info('PLUGIN', `恢复插件层：${loaded.length} 个插件`)
      syncPluginLayer()
      await ensureSchemas()
    } catch (err) {
      logger.warn('PLUGIN', '恢复插件层失败（包上下文仍可用）', err instanceof Error ? err.message : String(err))
    }
    const r = await startScan(false)
    logger.info('INDEX', r.started ? '开始按缓存恢复索引（命中则跳过重扫）' : `自动恢复未启动：${r.reason ?? '未知原因'}`)
  } catch (err) {
    logger.warn('MODPACK', '恢复上次整合包失败，请重新导入', err instanceof Error ? err.message : String(err))
    forget()
  }
}

const isPrimaryInstance = acquireSingleInstanceLock(app)

if (isPrimaryInstance) {
  // 用户再次双击时：把已有窗口拉到前台；窗口已销毁才重建（不重复创建）
  app.on('second-instance', () => {
    const win = getMainWindow()
    const restored = restoreExistingWindow(win)
    if (!restored) createWindow(rendererDevUrl())
    logger.info('IO', restored ? '检测到第二次启动，已聚焦现有窗口' : '检测到第二次启动，主窗口已销毁，已重建')
  })

void app.whenReady().then(() => {
  ensureBaseDirs()
  pruneOldLogs()
  installIpc()
  installIconProtocol()
  safeRegisterHandlers()
  logger.info(
    'IO',
    `IPC handler 已注册 ${registeredChannels().length} 个 channel`,
    registeredChannels().join(', ')
  )
  logger.info('IO', `数据目录（${userDataInfo.source}）：${userDataInfo.dir}`)
  // P2-MKDIR：隔离目录创建失败时已回退到默认目录，这里必须显式记 ERROR，
  // 否则"隔离没生效"会被静默吞掉（用户以为数据在隔离目录，实际写到了默认位置）。
  if (userDataInfo.fallbackError) {
    logger.error('IO', `隔离数据目录不可创建，已回退到默认目录：${userDataInfo.fallbackFrom ?? ''}`, userDataInfo.fallbackError)
  }

  const win = createWindow(rendererDevUrl())
  setMainLogSink((entry) => emitEvent(getMainWindow(), { kind: 'log', entry }))
  // T-25：窗口先出，恢复在后台跑（不阻塞首屏）
  void restoreLastModpack()

  // 渲染进程订阅事件晚于启动日志，加载完成后补发一次缓冲
  win.webContents.once('did-finish-load', () => {
    for (const entry of recentLogs(300)) emitEvent(getMainWindow(), { kind: 'log', entry })
    logger.info('UI', '界面已加载')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(rendererDevUrl())
    }
  })
}).catch((err: unknown) => {
  // 启动期任何未预期异常都要落盘，否则表现为「双击没反应」且无日志
  logger.error('IO', `启动失败：${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined)
})
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 扫描中途关闭窗口：中断 worker、清理临时文件（规格第六章）
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  void cancelAll('程序退出')
    .then((n) => {
      if (n > 0) logger.info('SCAN', `退出前已中断 ${n} 个扫描任务`)
    })
    .catch((err: unknown) => {
      logger.warn('SCAN', '中断扫描失败', err instanceof Error ? err.message : String(err))
    })
    .finally(() => {
      setMainLogSink(null)
      app.quit()
    })
})
