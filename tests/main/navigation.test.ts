/**
 * P1-C9：导航白名单测试（纯函数 + 守卫挂载，不启动 Electron）。
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { installNavigationGuards, isAllowedNavigation } from '@main/navigation'

const RENDERER = join(process.cwd(), 'out', 'renderer')
const APP_PAGE = pathToFileURL(join(RENDERER, 'index.html')).href

describe('P1-C9 导航白名单', () => {
  describe('生产环境（file://）', () => {
    const policy = { rendererDir: RENDERER }

    it('允许加载应用自身页面', () => {
      expect(isAllowedNavigation(APP_PAGE, policy)).toBe(true)
    })

    it('允许渲染目录内的内部路由（hash / query）', () => {
      expect(isAllowedNavigation(`${APP_PAGE}#/browse`, policy)).toBe(true)
      expect(isAllowedNavigation(`${APP_PAGE}?x=1`, policy)).toBe(true)
    })

    it('拒绝渲染目录之外的 file://（含路径穿越）', () => {
      const outside = pathToFileURL(join(process.cwd(), 'README.md')).href
      expect(isAllowedNavigation(outside, policy)).toBe(false)
      expect(isAllowedNavigation(`${APP_PAGE}/../../../README.md`, policy)).toBe(false)
    })

    it('拒绝 http(s) 与不可信协议', () => {
      expect(isAllowedNavigation('https://example.com', policy)).toBe(false)
      expect(isAllowedNavigation('http://localhost:5173/', policy)).toBe(false)
      expect(isAllowedNavigation('javascript:alert(1)', policy)).toBe(false)
      expect(isAllowedNavigation('data:text/html,<h1>x</h1>', policy)).toBe(false)
      expect(isAllowedNavigation('app-icon://abc', policy)).toBe(false)
    })

    it('拒绝畸形 URL', () => {
      expect(isAllowedNavigation('not a url', policy)).toBe(false)
      expect(isAllowedNavigation('', policy)).toBe(false)
    })
  })

  describe('开发环境（dev server 同源）', () => {
    const policy = { devUrl: 'http://localhost:5173/', rendererDir: RENDERER }

    it('允许同源页面与内部路由', () => {
      expect(isAllowedNavigation('http://localhost:5173/', policy)).toBe(true)
      expect(isAllowedNavigation('http://localhost:5173/#/bench', policy)).toBe(true)
      expect(isAllowedNavigation('http://localhost:5173/src/renderer/index.html', policy)).toBe(true)
    })

    it('拒绝不同端口 / 不同主机的地址', () => {
      expect(isAllowedNavigation('http://localhost:5174/', policy)).toBe(false)
      expect(isAllowedNavigation('http://127.0.0.1:5173/', policy)).toBe(false)
      expect(isAllowedNavigation('https://evil.example/', policy)).toBe(false)
    })

    it('开发环境仍允许 file:// 渲染目录（生产形态联调）', () => {
      expect(isAllowedNavigation(APP_PAGE, policy)).toBe(true)
    })
  })

  it('守卫对非法导航调用 preventDefault 并上报，合法导航放行', () => {
    const listeners: ((event: { preventDefault: () => void }, url: string) => void)[] = []
    const webContents = {
      on: (_event: string, fn: (event: { preventDefault: () => void }, url: string) => void) => {
        listeners.push(fn)
      },
      removeListener: vi.fn(),
      isDestroyed: () => false
    }
    const win = { webContents } as never
    const blocked = vi.fn()
    const dispose = installNavigationGuards(win, { rendererDir: RENDERER }, blocked)
    expect(listeners).toHaveLength(1)

    const blockedEvent = { preventDefault: vi.fn() }
    listeners[0]!(blockedEvent, 'https://evil.example/x')
    expect(blockedEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(blocked).toHaveBeenCalledWith('https://evil.example/x')

    const allowedEvent = { preventDefault: vi.fn() }
    listeners[0]!(allowedEvent, APP_PAGE)
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled()

    dispose()
    expect(webContents.removeListener).toHaveBeenCalledWith('will-navigate', listeners[0])
  })
})
