/** 主窗口生命周期与几何状态。 */
import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { installNavigationGuards } from './navigation'
import { WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from '../shared/constants'
import { themeMeta } from '../shared/theme'
import { logger } from './logger'
import { flushUiState, getUiState, patchUiState } from './uiStateStore'

let main: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return main
}

export function createWindow(devUrl: string | undefined): BrowserWindow {
  const state = getUiState()
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x ?? undefined,
    y: state.y ?? undefined,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    // 用主题的窗口底色，避免启动瞬间闪一个不协调的底
    backgroundColor: themeMeta(state.theme).windowBackground,
    title: 'KubeJS Recipe Studio',
    webPreferences: {
      preload: `${__dirname}/../preload/index.js`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })
  main = win

  win.once('ready-to-show', () => {
    win.show()
    if (getUiState().maximized) win.maximize()
  })

  const remember = (immediate = false): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    if (win.isMaximized() && !immediate) return
    const b = win.getBounds()
    patchUiState({ x: b.x, y: b.y, width: b.width, height: b.height })
  }
  win.on('resize', () => remember())
  win.on('move', () => remember())
  win.on('maximize', () => patchUiState({ maximized: true }))
  win.on('unmaximize', () => patchUiState({ maximized: false }))
  win.on('close', () => {
    remember(true)
    flushUiState()
  })
  win.on('closed', () => {
    if (main === win) main = null
  })

  // P1-C9：主窗口只允许停留在应用自身页面（开发同源 / 生产 file:// 渲染目录内），
  // 其余导航一律拦截并记 WARN；外部 https 链接仍走下面的 setWindowOpenHandler 交给系统浏览器。
  const disposeNavGuard = installNavigationGuards(
    win,
    { devUrl, rendererDir: join(__dirname, '../renderer') },
    (url) => logger.warn('UI', `已拦截页面导航：${url}`)
  )
  // 用 'close'（窗口尚未销毁）而不是 'closed'：后者触发时 webContents 已销毁，解绑会抛异常
  win.once('close', disposeNavGuard)

  // 外部链接交给系统浏览器，程序内不开第二个窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    logger.error('UI', `页面加载失败 ${code} ${desc}`)
  })

  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(`${__dirname}/../renderer/index.html`)
  return win
}
