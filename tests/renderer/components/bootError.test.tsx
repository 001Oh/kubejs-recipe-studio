// @vitest-environment jsdom
/**
 * P3-22c：启动失败兜底界面。
 * 修复前：main.tsx 的 void init() 无 catch——init 拒绝 = unhandled rejection + 白屏。
 * 修复后：init().catch 渲染 bootError 界面（含日志目录路径）。
 * 两层用例：① renderBootError 纯函数（DOM 断言）；② main.tsx 接线（init 注入拒绝，
 * mock react-dom/client 与 App，断言错误界面真的画进 #root）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const initMock = vi.hoisted(() => vi.fn())
const createRootMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/renderer/src/store/appStore', () => ({
  useAppStore: {
    getState: () => ({ init: initMock, pushLog: () => undefined, toast: () => undefined })
  },
  subscribeStudioEvents: () => () => undefined
}))
vi.mock('react-dom/client', () => ({
  createRoot: (...a: unknown[]) => createRootMock(...(a as []))
}))
vi.mock('../../../src/renderer/src/App', () => ({ App: () => null }))

import { renderBootError } from '../../../src/renderer/src/bootError'

beforeEach(() => {
  initMock.mockReset()
  createRootMock.mockReset()
  // 正常路径 main.tsx 仍会同步 createRoot(container).render(<App/>)——给默认实现
  createRootMock.mockImplementation(() => ({ render: vi.fn() }))
  document.body.innerHTML = '<div id="root"></div>'
})

describe('P3-22c renderBootError 兜底界面', () => {
  it('纯函数：渲染标题、错误消息与日志目录路径', () => {
    const root = document.getElementById('root')!
    renderBootError(root, new Error('init boom'), 'C:/userdata/logs')
    expect(root.textContent).toContain('启动失败')
    expect(root.textContent).toContain('init boom')
    expect(root.textContent).toContain('C:/userdata/logs')
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('拿不到日志目录时给出通用指引（不空泛白屏）', () => {
    const root = document.getElementById('root')!
    renderBootError(root, 'string error', null)
    expect(root.textContent).toContain('string error')
    expect(root.textContent).toContain('logs')
  })

  it('接线：init() 注入拒绝 → 错误界面画进 #root（修复前 unhandled + 白屏 → 红）', async () => {
    vi.resetModules()
    initMock.mockRejectedValue(new Error('init boom'))
    await import('../../../src/renderer/src/main')
    // init().catch → 动态 import bootError → 渲染；等待微任务链落地
    await new Promise((r) => setTimeout(r, 30))
    const root = document.getElementById('root')!
    expect(root.textContent).toContain('启动失败')
    expect(root.textContent).toContain('init boom')
  })

  it('接线：init() 正常 → 仍走正常 React 渲染（守卫）', async () => {
    vi.resetModules()
    initMock.mockResolvedValue(undefined)
    await import('../../../src/renderer/src/main')
    await new Promise((r) => setTimeout(r, 30))
    expect(createRootMock).toHaveBeenCalled()
    expect(document.getElementById('root')!.textContent).not.toContain('启动失败')
  })
})
