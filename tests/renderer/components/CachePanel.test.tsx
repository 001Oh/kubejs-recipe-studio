/**
 * T-27：CachePanel 交互用例（jsdom + RTL）。
 *
 * 覆盖规格四类：勾选状态机 / 统计回填 / 确认流程 / 进度渲染。
 * IPC 用 vi.mock 顶替，不碰真实磁盘。
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const statMock = vi.fn()
const clearMock = vi.fn()

vi.mock('../../../src/renderer/src/api', () => {
  const dispatch = (name: string, req?: unknown) =>
    name === 'cache:clear' ? clearMock(req) : statMock(req)
  return {
    call: (name: string, req?: unknown) => dispatch(name, req),
    callOrThrow: (name: string, req?: unknown) => dispatch(name, req)
  }
})

import { CachePanel } from '../../../src/renderer/src/components/CachePanel'
import { useAppStore } from '../../../src/renderer/src/store/appStore'

const STAT = {
  rows: [
    { kind: 'index', files: 3, bytes: 44 * 1048576 },
    { kind: 'icons', files: 38761, bytes: 31 * 1048576 },
    { kind: 'browser', files: 14, bytes: 2 * 1048576 },
    { kind: 'temp', files: 0, bytes: 0 },
    { kind: 'logs', files: 2, bytes: 337 * 1024 }
  ],
  backup: { files: 2, bytes: 646 }
}

beforeEach(() => {
  statMock.mockReset()
  clearMock.mockReset()
  statMock.mockResolvedValue(STAT)
  useAppStore.setState({ scanning: false, pushLog: () => undefined } as never)
})

afterEach(() => {
  // 项目 vitest 未开 globals，RTL 不会自动 cleanup → 不清理会导致「找到多个元素」
  cleanup()
  vi.useRealTimers()
})

async function openPanel(): Promise<void> {
  render(<CachePanel />)
  fireEvent.click(screen.getByText('清理缓存…'))
  await waitFor(() => expect(screen.getByText('图标缓存')).toBeTruthy())
}

describe('T-27 CachePanel', () => {
  it('统计回填：先「统计中…」，返回后显示数字', async () => {
    let resolveStat: (v: unknown) => void = () => undefined
    statMock.mockImplementation(() => new Promise((r) => (resolveStat = r)))
    render(<CachePanel />)
    fireEvent.click(screen.getByText('清理缓存…'))
    expect(screen.getAllByText('统计中…').length).toBeGreaterThan(0)
    await act(async () => {
      resolveStat(STAT)
    })
    await waitFor(() => expect(screen.getByText(/38,761 个文件/)).toBeTruthy())
  })

  it('勾选状态机：默认四项勾选、日志不勾', async () => {
    await openPanel()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true, true, false])
    // 取消全部 → 开始清理禁用
    for (const b of boxes) if (b.checked) fireEvent.click(b)
    await waitFor(() => {
      const btn = screen.getByText('开始清理').closest('button') as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    })
  })

  it('确认流程：弹层含数量与大小；取消不调用 clear，确认才调用', async () => {
    clearMock.mockResolvedValue({ removed: 2, failed: 0, bytes: 337 * 1024 })
    await openPanel()
    fireEvent.click(screen.getByText('开始清理'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toMatch(/将删除/)
    expect(dialog.textContent).toMatch(/MB/)
    // 取消 → 不调用
    fireEvent.click(within(dialog).getByText('取消'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(clearMock).not.toHaveBeenCalled()
    // 确认 → 调用一次
    fireEvent.click(screen.getByText('开始清理'))
    await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(screen.getByText('确认清理'))
    })
    expect(clearMock).toHaveBeenCalled()
  })

  it('扫描中：开始清理禁用并给出提示', async () => {
    useAppStore.setState({ scanning: true } as never)
    await openPanel()
    const panel = document.querySelector('.cache-panel') as HTMLElement
    const btn = within(panel)
      .getAllByRole('button')
      .filter((b) => /清理|扫描/.test(b.textContent ?? ''))
      .pop() as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(screen.getByText(/扫描进行中，暂时不能清理缓存/)).toBeTruthy()
  })
})
