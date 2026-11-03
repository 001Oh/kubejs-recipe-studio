/**
 * P1-C2：Electron 单实例锁。
 *
 * 为什么单独成模块：入口 `index.ts` 有大量副作用，不便单测；这里只保留
 * 「取锁 / 不放锁就退出 / 把已有窗口拉到前台」这三个可验证的行为。
 *
 * 约束：
 * - 必须在 `app.whenReady()` 之前调用（Electron 要求锁在任何窗口创建前取得）；
 * - 未取得锁的实例必须退出，不能继续初始化 IPC（否则第二个进程会重复注册 handler、共用 userData）。
 */
import type { App, BrowserWindow } from 'electron'

/**
 * 取得单实例锁。
 * @returns true = 本进程是唯一实例；false = 已有实例在运行（调用方应停止初始化并退出）。
 */
export function acquireSingleInstanceLock(app: Pick<App, 'requestSingleInstanceLock' | 'quit'>): boolean {
  if (app.requestSingleInstanceLock()) return true
  app.quit()
  return false
}

/**
 * 第二次启动时把已有窗口恢复到前台。
 * 覆盖最小化 / 隐藏 / 失焦三种状态；窗口已销毁时返回 false（由调用方决定是否重建）。
 */
export function restoreExistingWindow(win: BrowserWindow | null): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  return true
}
