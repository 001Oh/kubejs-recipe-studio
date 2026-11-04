// @vitest-environment jsdom
/**
 * P3-22b：WriteDialog 的 submit / saveElsewhere 桥异常兜底。
 * 修复前：callRaw 抛错（桥断开等）→ busy 永远卡在「写入中…」+ unhandled rejection；
 * 修复后：busy 复位、错误展示、可重试；saveElsewhere 的目录选择失败同样不冒泡。
 * 异常注入：mock call/callRaw 让桥抛错。
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()
const callOrThrowMock = vi.fn()
const callRawMock = vi.fn()

vi.mock('../../../src/renderer/src/api', () => ({
  call: (...a: unknown[]) => callMock(...(a as [])),
  callOrThrow: (...a: unknown[]) => callOrThrowMock(...(a as [])),
  callRaw: (...a: unknown[]) => callRawMock(...(a as []))
}))

import { WriteDialog } from '../../../src/renderer/src/views/bench/panels/WriteDialog'
import { useAppStore } from '../../../src/renderer/src/store/appStore'
import { useBenchUiStore } from '../../../src/renderer/src/views/bench/benchUiStore'
import { useBenchStore } from '../../../src/renderer/src/store/benchStore'

const CHECK_OK = { fileExists: false, recipeIdConflicts: [], datapackNamespaceUsed: false }

beforeEach(() => {
  callMock.mockReset()
  callOrThrowMock.mockReset()
  callRawMock.mockReset()
  callOrThrowMock.mockResolvedValue([]) // scripts:list
  callMock.mockImplementation((name: string) => {
    if (name === 'codegen:preview') return Promise.reject(new Error('preview down'))
    if (name === 'codegen:checkTarget') return Promise.resolve(CHECK_OK)
    if (name === 'app:pickDirectory') return Promise.resolve({ path: 'X:/desktop' })
    return Promise.resolve(null)
  })
  useBenchStore.setState({ bench: { typeId: 'minecraft:crafting_shaped', layoutKind: 'shaped', values: {}, activeSlotKey: null, modifiers: {} } as never })
  useBenchUiStore.setState({ writeOpen: true, picker: null, registryPanel: null, countEditor: null })
  useAppStore.setState({ toast: vi.fn(), pushLog: () => {}, toasts: [], logs: [] })
})

afterEach(() => {
  cleanup()
  useBenchUiStore.setState({ writeOpen: false })
})

describe('P3-22b WriteDialog 桥异常兜底', () => {
  it('submit 桥抛错：busy 复位（按钮回到「写入文件」）+ 错误展示（修复前卡「写入中…」→ 红）', async () => {
    callRawMock.mockRejectedValueOnce(new Error('bridge boom'))
    render(<WriteDialog />)
    const btn = screen.getByRole('button', { name: '写入文件' })
    fireEvent.click(btn)
    // 修复前：busy 永远 true，按钮名停在「写入中…」，找不到「写入文件」
    await waitFor(() => expect(screen.getByRole('button', { name: '写入文件' })).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/写入请求失败/)).toBeTruthy())
    const toast = useAppStore.getState().toast as ReturnType<typeof vi.fn>
    expect(toast.mock.calls.some((c) => String(c[0]).includes('写入请求失败'))).toBe(true)
    // 复位后可重试（结果带 backupPath：无备份路径时对话框会自动关闭——既有语义）
    callRawMock.mockResolvedValueOnce({ ok: true, data: { message: '已写入', writtenPaths: ['x.js'], backupPath: 'x.bak' } })
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByText('已写入')).toBeTruthy())
  })

  it('EACCES 后另存：目录选择抛错不冒泡，busy 不卡', async () => {
    callRawMock.mockResolvedValue({ ok: false, code: 'EACCES', error: 'denied' })
    render(<WriteDialog />)
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByText(/写入失败/)).toBeTruthy())
    const saveBtn = screen.getByRole('button', { name: '另存到其它目录' })
    callMock.mockImplementation((name: string) => {
      if (name === 'app:pickDirectory') return Promise.reject(new Error('picker boom'))
      if (name === 'codegen:checkTarget') return Promise.resolve(CHECK_OK)
      return Promise.resolve(null)
    })
    fireEvent.click(saveBtn)
    // 修复前：saveElsewhere 的 await call 抛错 → unhandled rejection；修复后静默兜底 + toast
    await waitFor(() => {
      const toast = useAppStore.getState().toast as ReturnType<typeof vi.fn>
      expect(toast.mock.calls.some((c) => String(c[0]).includes('目录选择失败') || String(c[0]).includes('另存'))).toBe(true)
    })
    expect(screen.getByRole('button', { name: '写入文件' })).toBeTruthy()
  })

  it('另存成功路径不受影响（回归守卫）', async () => {
    callRawMock.mockResolvedValueOnce({ ok: false, code: 'EACCES', error: 'denied' })
    render(<WriteDialog />)
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByText(/写入失败/)).toBeTruthy())
    callRawMock.mockResolvedValueOnce({ ok: true, data: { message: '已另存写入', writtenPaths: ['X:/desktop/x.js'], backupPath: 'x.bak' } })
    fireEvent.click(screen.getByRole('button', { name: '另存到其它目录' }))
    await waitFor(() => expect(screen.getByText('已另存写入')).toBeTruthy())
    expect(callRawMock).toHaveBeenCalledTimes(2)
    void act
  })
})
