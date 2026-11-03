/**
 * P1-C2：单实例锁与窗口恢复的单测（不启动 Electron）。
 */
import { describe, expect, it, vi } from 'vitest'
import { acquireSingleInstanceLock, restoreExistingWindow } from '@main/singleInstance'

function fakeApp(got: boolean): { requestSingleInstanceLock: () => boolean; quit: ReturnType<typeof vi.fn> } {
  return { requestSingleInstanceLock: () => got, quit: vi.fn() }
}

function fakeWindow(state: { minimized?: boolean; visible?: boolean; destroyed?: boolean }): {
  isMinimized: () => boolean
  isVisible: () => boolean
  isDestroyed: () => boolean
  restore: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
} {
  return {
    isMinimized: () => state.minimized === true,
    isVisible: () => state.visible !== false,
    isDestroyed: () => state.destroyed === true,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn()
  }
}

describe('P1-C2 单实例锁', () => {
  it('首次启动取得锁，不退出', () => {
    const app = fakeApp(true)
    expect(acquireSingleInstanceLock(app)).toBe(true)
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('第二实例取不到锁 → 返回 false 并退出', () => {
    const app = fakeApp(false)
    expect(acquireSingleInstanceLock(app)).toBe(false)
    expect(app.quit).toHaveBeenCalledTimes(1)
  })

  it('第二次启动把最小化的已有窗口恢复并聚焦', () => {
    const win = fakeWindow({ minimized: true, visible: false })
    expect(restoreExistingWindow(win as never)).toBe(true)
    expect(win.restore).toHaveBeenCalledTimes(1)
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('窗口已显示时只聚焦，不重复 show / restore', () => {
    const win = fakeWindow({ minimized: false, visible: true })
    expect(restoreExistingWindow(win as never)).toBe(true)
    expect(win.restore).not.toHaveBeenCalled()
    expect(win.show).not.toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('窗口已销毁时返回 false（调用方据此决定是否重建）', () => {
    const win = fakeWindow({ destroyed: true })
    expect(restoreExistingWindow(win as never)).toBe(false)
    expect(win.focus).not.toHaveBeenCalled()
  })

  it('没有窗口时返回 false 且不抛错', () => {
    expect(restoreExistingWindow(null)).toBe(false)
  })
})
