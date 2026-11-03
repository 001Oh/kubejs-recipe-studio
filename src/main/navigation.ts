/**
 * P1-C9 / P2-C：窗口导航限制。
 *
 * 现状：只有 `setWindowOpenHandler`（新窗口一律拒绝、https 交给系统浏览器），
 * 但主窗口本身可被 `will-navigate` 带到任意外部地址。
 *
 * 策略（不引入额外权限、不放宽 webSecurity）：
 * - 开发环境：只允许与 dev server **同源**的 http(s) 导航（HMR 与内部路由都在同源内）；
 * - 生产环境：只允许 `file://` 下渲染目录**内部**的页面；
 * - 其余一律 `preventDefault` 并记 WARN，不跳浏览器（避免被诱导打开外部页面）。
 *
 * P2 起不再用字符串前缀判断是否位于渲染目录内：
 * `fileURLToPath` 解码 → 各自 `resolve` → `path.relative` 判定包含关系，
 * 因此百分号编码穿越（`%2e%2e` / `%5c`）、相似前缀目录（`renderer-evil`）、
 * 盘符大小写与反斜杠都能被正确判定；UNC 主机与带 host 的 file URL 直接拒绝。
 */
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow } from 'electron'

export interface NavigationPolicy {
  /** 开发服务器地址（electron-vite 注入）；生产环境为 undefined */
  devUrl?: string | undefined
  /** 渲染产物目录（生产环境 `file://` 白名单根） */
  rendererDir: string
}

function comparable(p: string): string {
  const abs = resolve(p)
  return process.platform === 'win32' ? abs.toLowerCase() : abs
}

/**
 * 判断 targetPath 是否位于 baseDir 内（含 baseDir 本身）。
 * 用 `path.relative` 而不是字符串前缀：`renderer-evil` 不会被当作 `renderer` 的子目录。
 */
export function isPathInsideDir(baseDir: string, targetPath: string): boolean {
  if (!lexicallyInside(baseDir, targetPath)) return false
  // P2-SYMLINK：词法判定看不出软链 / junction —— base 内的一个链接完全可以指向外部。
  // 目标**存在**时再用 realpath 比一次；解析失败（不存在 / 无权）时保留词法结论：
  // 不存在的路径无法通过软链逃逸，且渲染层资源在打包前可能尚未生成。
  try {
    return lexicallyInside(realpathSync(baseDir), realpathSync(targetPath))
  } catch {
    return true
  }
}

/** 纯词法判定（不含 realpath）：拆出来便于在 realpath 之后再复用一次同一套规则。 */
function lexicallyInside(baseDir: string, targetPath: string): boolean {
  if (targetPath.includes('\0')) return false
  const rel = relative(comparable(baseDir), comparable(targetPath))
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('../')
}

/**
 * 判断一次导航是否属于应用自身页面。
 * 纯函数，便于覆盖开发/生产、内部路由、外部地址、编码穿越、UNC 等用例。
 */
export function isAllowedNavigation(target: string, policy: NavigationPolicy): boolean {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    // 解析不了的目标（畸形 URL、javascript: 之类）一律拒绝
    return false
  }

  if (policy.devUrl) {
    try {
      const dev = new URL(policy.devUrl)
      if (url.origin === dev.origin && (url.protocol === 'http:' || url.protocol === 'https:')) return true
    } catch {
      /* devUrl 异常时退化为只允许 file:// */
    }
  }

  if (url.protocol !== 'file:') return false
  // 只接受本地文件：`file://server/share/...`（UNC）与带 host 的形式一律拒绝
  if (url.host !== '') return false
  let filePath: string
  try {
    filePath = fileURLToPath(url)
  } catch {
    return false
  }
  return isPathInsideDir(policy.rendererDir, filePath)
}

/** 挂载导航守卫；返回解绑函数（窗口销毁时调用）。 */
export function installNavigationGuards(
  win: BrowserWindow,
  policy: NavigationPolicy,
  onBlocked?: (url: string) => void
): () => void {
  const handler = (event: { preventDefault: () => void }, url: string): void => {
    if (isAllowedNavigation(url, policy)) return
    event.preventDefault()
    onBlocked?.(url)
  }
  // 缓存 webContents 引用：窗口销毁后再访问 win.webContents 会抛 "Object has been destroyed"
  const contents = win.webContents
  contents.on('will-navigate', handler)
  return () => {
    try {
      if (!contents.isDestroyed()) contents.removeListener('will-navigate', handler)
    } catch {
      /* 窗口/contents 已销毁：监听器随对象一起回收，无需再解绑 */
    }
  }
}
