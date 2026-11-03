/**
 * P2-C：导航守卫的路径边界测试（Windows 盘符/反斜杠/编码穿越/相似前缀/UNC）。
 * 与 `navigation.test.ts` 互补：这里专攻「词法路径包含判定」的边界，不改既有断言。
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { isAllowedNavigation, isPathInsideDir } from '@main/navigation'

const RENDERER = join(process.cwd(), 'out', 'renderer')
const APP_PAGE = pathToFileURL(join(RENDERER, 'index.html')).href
const policy = { rendererDir: RENDERER }
const win = process.platform === 'win32'

describe('P2-C isPathInsideDir', () => {
  it('目录自身与子文件算在内', () => {
    expect(isPathInsideDir(RENDERER, RENDERER)).toBe(true)
    expect(isPathInsideDir(RENDERER, join(RENDERER, 'index.html'))).toBe(true)
    expect(isPathInsideDir(RENDERER, join(RENDERER, 'assets', 'a.js'))).toBe(true)
  })

  it('相似前缀目录不算在内（renderer-evil）', () => {
    expect(isPathInsideDir(RENDERER, `${RENDERER}-evil/index.html`)).toBe(false)
    expect(isPathInsideDir(RENDERER, `${RENDERER}2/index.html`)).toBe(false)
  })

  it('父目录与兄弟目录不算在内', () => {
    expect(isPathInsideDir(RENDERER, join(RENDERER, '..'))).toBe(false)
    expect(isPathInsideDir(RENDERER, join(RENDERER, '..', 'main', 'index.js'))).toBe(false)
  })

  it('含 NUL 字节的路径直接拒绝', () => {
    expect(isPathInsideDir(RENDERER, `${join(RENDERER, 'index.html')}\u0000.png`)).toBe(false)
  })

  it.runIf(win)('Windows 下盘符大小写不敏感，不同盘符不算在内', () => {
    const lower = RENDERER.replace(/^([A-Z]):/, (_m, d: string) => `${d.toLowerCase()}:`)
    expect(isPathInsideDir(RENDERER, join(lower, 'index.html'))).toBe(true)
    expect(isPathInsideDir(RENDERER, 'Z:\\other\\index.html')).toBe(false)
  })
})

describe('P2-C 编码与分隔符边界', () => {
  it('百分号编码的目录穿越被拒绝', () => {
    const cases = [
      `${APP_PAGE}/%2e%2e/%2e%2e/README.md`,
      `${APP_PAGE}/..%2f..%2fREADME.md`,
      `${APP_PAGE}%2f..%2f..%2fREADME.md`,
      `file://${RENDERER.replace(/\\/g, '/')}/%2e%2e/%2e%2e/README.md`
    ]
    for (const url of cases) expect(isAllowedNavigation(url, policy), url).toBe(false)
  })

  it.runIf(win)('反斜杠编码的穿越被拒绝', () => {
    expect(isAllowedNavigation(`${APP_PAGE}/..%5C..%5CREADME.md`, policy)).toBe(false)
    expect(isAllowedNavigation(`${APP_PAGE}/..%5c..%5c..%5cWindows%5Cwin.ini`, policy)).toBe(false)
  })

  it('双写编码不会绕过（%252e%252e 解码后仍是字面量，不构成 ..）', () => {
    // %252e 解码为 "%2e" 字面量，属于文件名的一部分，因此仍在目录内 —— 关键是不能跳出目录
    const url = `${APP_PAGE}/%252e%252e/x`
    expect(isAllowedNavigation(url, policy)).toBe(true)
  })

  it('合法子路径与查询/哈希仍允许', () => {
    expect(isAllowedNavigation(`${APP_PAGE}?x=1#/browse`, policy)).toBe(true)
    expect(isAllowedNavigation(pathToFileURL(join(RENDERER, 'assets', 'index.js')).href, policy)).toBe(true)
  })

  it('UNC 与非本地 host 的 file URL 被拒绝', () => {
    // file://localhost/… 会被 WHATWG URL 归一化为无 host（等价本地路径），故不作为"外部 host"用例
    expect(isAllowedNavigation('file://server/share/index.html', policy)).toBe(false)
    expect(isAllowedNavigation('file://evil.example/E:/mc%20kjs/out/renderer/index.html', policy)).toBe(false)
  })

  it('非 file 协议与非应用来源一律拒绝', () => {
    for (const url of [
      'https://example.com/',
      'http://localhost:5173/',
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://host/x',
      'app-icon://deadbeef',
      'not a url',
      ''
    ]) {
      expect(isAllowedNavigation(url, policy), url).toBe(false)
    }
  })

  it('开发态：同源 http(s) 允许，异端口/异主机拒绝，且 file:// 白名单仍生效', () => {
    const dev = { devUrl: 'http://localhost:5173/', rendererDir: RENDERER }
    expect(isAllowedNavigation('http://localhost:5173/', dev)).toBe(true)
    expect(isAllowedNavigation('http://localhost:5173/#/bench', dev)).toBe(true)
    expect(isAllowedNavigation('http://localhost:5174/', dev)).toBe(false)
    expect(isAllowedNavigation('http://127.0.0.1:5173/', dev)).toBe(false)
    expect(isAllowedNavigation(APP_PAGE, dev)).toBe(true)
    expect(isAllowedNavigation('file://server/share/index.html', dev)).toBe(false)
  })
})

describe('P2-C 守卫解绑的销毁安全（回归：P1 的 Object has been destroyed）', () => {
  it('窗口销毁后解绑不抛异常，也不再触碰已销毁的 webContents', async () => {
    const { installNavigationGuards } = await import('@main/navigation')
    const removeListener = vi.fn(() => {
      throw new Error('Object has been destroyed')
    })
    const contents = { on: vi.fn(), removeListener, isDestroyed: () => true }
    const win = { webContents: contents } as never
    const dispose = installNavigationGuards(win, { rendererDir: RENDERER })
    expect(() => dispose()).not.toThrow()
    expect(removeListener).not.toHaveBeenCalled()
  })
})
