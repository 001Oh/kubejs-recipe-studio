// @vitest-environment jsdom
/**
 * 第 115 批 D3：失败态统一出路。
 *
 * 守四条硬契约：
 *   1. `role="alert"`
 *   2. 首个可用动作自动获得焦点，动作都是可 Tab 到的 <button>
 *   3. `Esc` 只关面板，不动草稿
 *   4. WriteDialog 的写入失败也用同一套面板（重试 / 换通道 / 另存）
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()
const callOrThrowMock = vi.fn()
const callRawMock = vi.fn()

vi.mock('../../../src/renderer/src/api', () => ({
  call: (...a: unknown[]) => callMock(...(a as [])),
  callOrThrow: (...a: unknown[]) => callOrThrowMock(...(a as [])),
  callRaw: (...a: unknown[]) => callRawMock(...(a as []))
}))

import { FailurePanel } from '../../../src/renderer/src/components/FailurePanel'
import { WriteDialog } from '../../../src/renderer/src/views/bench/panels/WriteDialog'
import { PilotDraftPanel } from '../../../src/renderer/src/views/bench/PilotDraftPanel'
import { useAppStore } from '../../../src/renderer/src/store/appStore'
import { useBenchStore } from '../../../src/renderer/src/store/benchStore'
import { useBenchUiStore } from '../../../src/renderer/src/views/bench/benchUiStore'
import { createBlankDraft } from '../../../src/renderer/src/store/draftBridge'

afterEach(cleanup)

describe('FailurePanel 基本契约', () => {
  it('role=alert、标题与失败码可见、首个可用动作自动获得焦点', () => {
    render(
      <FailurePanel
        title="读不到原始配方文件，提交已停止"
        message="无法读取当前原始配方：Unexpected token"
        code="RAW_UNREADABLE"
        actions={[
          { label: '重试提交', onClick: vi.fn(), variant: 'primary' },
          { label: '取消草稿', onClick: vi.fn() }
        ]}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('RAW_UNREADABLE')).toBeTruthy()
    const first = screen.getByRole('button', { name: '重试提交' })
    expect(document.activeElement).toBe(first)
    // 每个动作都是原生 button（Tab 顺序可达），没有被 tabIndex=-1 挖掉
    for (const button of screen.getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('tabindex')).not.toBe('-1')
    }
  })

  it('Esc 关闭面板，但不清任何编辑状态', () => {
    const onDismiss = vi.fn()
    render(
      <FailurePanel
        title="写盘没有完成"
        message="写入失败（SAVE_FAILED）：denied"
        actions={[{ label: '重试', onClick: vi.fn() }]}
        onDismiss={onDismiss}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('没有 onDismiss 时不渲染关闭按钮（例如必须先处理才能继续）', () => {
    render(<FailurePanel title="必须处理" message="x" actions={[{ label: '处理', onClick: vi.fn() }]} />)
    expect(screen.queryByRole('button', { name: '关闭' })).toBeNull()
  })
})

/** 造一份带（或不带）源文件的草稿；带源文件时 uid 用真实的 `file:` 约定 */
function seedDraft(withSource: boolean): void {
  const schema = {
    id: 'minecraft:crafting_shaped',
    revision: 1,
    layoutKind: 'shaped',
    slots: [],
    outputs: [],
    capability: 'sugar',
    source: 'builtin'
  } as never
  const blank = createBlankDraft('minecraft:crafting_shaped', schema)
  const tool = 'E:/pack/kubejs/data/ad_astra/recipes/crafting/module.json'
  const uid = withSource ? `file:${tool}` : blank.uid
  useBenchStore.setState({
    bench: blank.workbench,
    draft: {
      uid,
      meta: blank.meta,
      passThrough: [],
      normalized: withSource
        ? { ...blank.normalized, source: { ...blank.normalized.source, uid, sourcePath: tool } }
        : blank.normalized,
      schema: blank.schema,
      diagnostics: [],
      banners: []
    },
    draftConflict: null,
    conflictLoadFailed: false,
    commitFailure: { code: 'RAW_UNREADABLE', message: '无法读取当前原始配方：Unexpected end of JSON input', at: Date.now() },
    committing: false,
    lastCommit: null
  })
}

describe('PilotDraftPanel：RAW_UNREADABLE 有持久出路', () => {
  beforeEach(() => {
    useAppStore.setState({ toast: vi.fn(), pushLog: () => {}, toasts: [], logs: [] })
    seedDraft(false)
  })

  it('面板出现并给出四个出路（重试读取 / 打开目录 / 复制路径 / 取消草稿）', () => {
    render(<PilotDraftPanel />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeTruthy()
    expect(screen.getByText('读不到原始配方文件，提交已停止')).toBeTruthy()
    // 面板内的动作（会话条头部也有一个「取消草稿」，必须限定在 alert 里断言）
    expect(within(alert).getByRole('button', { name: '重试读取' })).toBeTruthy()
    expect(within(alert).getByRole('button', { name: '打开所在目录' })).toBeDisabled() // 空白草稿没有源文件
    expect(within(alert).getByRole('button', { name: '复制路径' })).toBeDisabled()
    expect(within(alert).getByRole('button', { name: '取消草稿' })).toBeTruthy()
  })

  it('Esc 收起面板后草稿仍在（不丢修改）', () => {
    render(<PilotDraftPanel />)
    expect(useBenchStore.getState().draft).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useBenchStore.getState().commitFailure).toBeNull()
    expect(useBenchStore.getState().draft).not.toBeNull()
  })
})

describe('第 115 批续：打开所在目录（source:reveal）', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    callRawMock.mockReset()
    useAppStore.setState({ toast: vi.fn(), pushLog: () => {}, toasts: [], logs: [] })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    writeText.mockClear()
    seedDraft(true)
  })

  it('有源文件时可用；点击只把 uid 交给主进程（渲染层不传路径）', async () => {
    callRawMock.mockResolvedValue({ ok: true, data: { revealed: true, path: 'E:\\pack\\...json', relativePath: 'kubejs/data/ad_astra/recipes/crafting/module.json' } })
    render(<PilotDraftPanel />)
    const alert = screen.getByRole('alert')
    const btn = within(alert).getByRole('button', { name: '打开所在目录' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    await waitFor(() => expect(callRawMock).toHaveBeenCalledTimes(1))
    expect(callRawMock.mock.calls[0][0]).toBe('source:reveal')
    const req = callRawMock.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(req)).toEqual(['uid'])
    expect(req.uid).toBe('file:E:/pack/kubejs/data/ad_astra/recipes/crafting/module.json')
    // 成功时不该再复制路径
    expect(writeText).toHaveBeenCalledTimes(0)
  })

  it('主进程拒绝（OUTSIDE_ROOT）→ 降级为复制路径 + toast 说明，不弹新面板', async () => {
    callRawMock.mockResolvedValue({ ok: false, code: 'OUTSIDE_ROOT', error: '源文件不在当前整合包目录内，已拒绝' })
    render(<PilotDraftPanel />)
    const alert = screen.getByRole('alert')
    fireEvent.click(within(alert).getByRole('button', { name: '打开所在目录' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('E:/pack/kubejs/data/ad_astra/recipes/crafting/module.json'))
    const toast = useAppStore.getState().toast as ReturnType<typeof vi.fn>
    expect(toast.mock.calls.some((c) => String(c[0]).includes('无法打开所在目录') && String(c[0]).includes('OUTSIDE_ROOT'))).toBe(true)
    // 动作本身降级成复制路径，且仍然只有一个 alert 面板
    expect(await within(alert).findByRole('button', { name: '复制路径（打开目录不可用）' })).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(within(alert).queryByRole('button', { name: '打开所在目录' })).toBeNull()
  })

  it('降级后再次点击就是纯复制（不再打 IPC）', async () => {
    callRawMock.mockResolvedValue({ ok: false, code: 'SOURCE_NOT_FOUND', error: '源文件已不存在' })
    render(<PilotDraftPanel />)
    const alert = screen.getByRole('alert')
    fireEvent.click(within(alert).getByRole('button', { name: '打开所在目录' }))
    const degraded = await within(alert).findByRole('button', { name: '复制路径（打开目录不可用）' })
    writeText.mockClear()
    callRawMock.mockClear()
    fireEvent.click(degraded)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(callRawMock).toHaveBeenCalledTimes(0)
  })
})

describe('WriteDialog：写入失败走同一套面板', () => {
  const CHECK_OK = { fileExists: false, recipeIdConflicts: [], datapackNamespaceUsed: false }

  beforeEach(() => {
    callMock.mockReset()
    callOrThrowMock.mockReset()
    callRawMock.mockReset()
    callOrThrowMock.mockResolvedValue([])
    callMock.mockImplementation((name: string) => {
      if (name === 'codegen:preview') return Promise.resolve({ channel: 'datapack-json' })
      if (name === 'codegen:checkTarget') return Promise.resolve(CHECK_OK)
      return Promise.resolve(null)
    })
    useBenchStore.setState({
      bench: { typeId: 'minecraft:crafting_shaped', layoutKind: 'shaped', values: {}, activeSlotKey: null, modifiers: {} } as never
    })
    useBenchUiStore.setState({ writeOpen: true, picker: null, registryPanel: null, countEditor: null })
    useAppStore.setState({ toast: vi.fn(), pushLog: () => {}, toasts: [], logs: [] })
  })

  afterEach(() => {
    useBenchUiStore.setState({ writeOpen: false })
  })

  it('通道不可用：标题人话化，提供「重试 / 换通道」，且没有「另存」', async () => {
    callRawMock.mockResolvedValue({ ok: false, code: 'CHANNEL_UNAVAILABLE', error: '通道 kubejs-sugar 在当前整合包条件下不可用：附属未安装' })
    render(<WriteDialog />)
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('这个通道在当前整合包下用不了')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '换通道' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '另存到其它目录' })).toBeNull()
  })

  it('EACCES：多一个「另存到其它目录」出口（既有能力不回退）', async () => {
    callRawMock.mockResolvedValue({ ok: false, code: 'EACCES', error: 'denied' })
    render(<WriteDialog />)
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('目标目录不可写')).toBeTruthy()
    expect(screen.getByRole('button', { name: '另存到其它目录' })).toBeTruthy()
  })

  it('校验类失败（语法预检）：推荐出路是「改配方类型」，不再给无意义的重试', async () => {
    callRawMock.mockResolvedValue({
      ok: false,
      code: 'SYNTAX_CHECK_FAILED',
      error: '语法预检未通过（第 1 行）：通用模式需要填写具体配方类型'
    })
    const focusType = vi.fn()
    window.addEventListener('studio:focus-type-select', focusType)
    render(<WriteDialog />)
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('生成的脚本没通过语法预检')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '改配方类型' }))
    expect(focusType).toHaveBeenCalled()
    window.removeEventListener('studio:focus-type-select', focusType)
  })

  it('Esc 只收起失败面板，对话框本身不关', async () => {
    callRawMock.mockResolvedValue({ ok: false, code: 'SAVE_FAILED', error: 'denied' })
    const { container } = render(<WriteDialog />)
    fireEvent.click(screen.getByRole('button', { name: '写入文件' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(container.querySelector('.write-modal')).not.toBeNull()
  })
})
