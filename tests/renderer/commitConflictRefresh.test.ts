/**
 * P3-22a：CONFLICT 后 refreshConflict 里 recipes:open 失败——不能只 toast。
 * 修复：置 conflictLoadFailed 冲突态 + 提供「重试读取」出路；提交按钮不得永久
 * disabled（committing 由 finally 复位，冲突态本身不锁按钮）。
 * 异常注入：mock call/callRaw 让 open 失败/恢复，验证 UI 状态迁移。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SlotValue } from '@shared/types'

vi.mock('@renderer/api', () => ({ call: vi.fn(), callRaw: vi.fn() }))

import { call, callRaw } from '@renderer/api'
import { useAppStore } from '@renderer/store/appStore'
import { useBenchStore } from '@renderer/store/benchStore'
import { retryConflictRefresh, submitDraft } from '@renderer/store/commitBridge'
import { normalizedToDraft } from '@renderer/store/draftBridge'
import { pc2Opened } from '../schema/pc2Fixtures'

function store() {
  return useBenchStore.getState()
}

function editResultCount(): void {
  const list = [...(store().bench.values['results'] as SlotValue[])]
  list[0] = { ...list[0]!, count: 7 }
  store().setValue('results', list)
}

beforeEach(() => {
  const opened = pc2Opened('mixingChance')
  useBenchStore.getState().reset()
  useBenchStore.setState({
    past: [],
    future: [],
    draft: null,
    draftConflict: null,
    conflictLoadFailed: false,
    committing: false,
    lastCommit: null,
    loadedFrom: null
  })
  const loaded = normalizedToDraft(opened)
  if (!loaded) throw new Error('draft load failed')
  store().loadOpenedRecipe(opened)
  editResultCount()
  useAppStore.setState({ toast: vi.fn(), pushLog: () => {}, toasts: [], logs: [] })
  vi.mocked(call).mockReset()
  vi.mocked(callRaw).mockReset()
})

describe('P3-22a CONFLICT 后读取失败的可操作出路', () => {
  it('CONFLICT + open 失败：置 conflictLoadFailed，提交按钮不禁用（修复前只 toast → 红）', async () => {
    vi.mocked(callRaw).mockResolvedValue({ ok: false, code: 'CONFLICT', error: '原始配方已变化' })
    vi.mocked(call).mockResolvedValue(null) // recipes:open 失败（异常注入）

    const res = await submitDraft()
    expect(res.conflict).toBe(true)
    expect(store().conflictLoadFailed).toBe(true)
    // 按钮不禁用：committing 复位、无 draftConflict 锁
    expect(store().committing).toBe(false)
    expect(store().draftConflict).toBeNull()
    // 给出了可操作文案
    const toast = useAppStore.getState().toast as ReturnType<typeof vi.fn>
    expect(toast.mock.calls.some((c) => String(c[0]).includes('重试') || String(c[0]).includes('重新打开'))).toBe(true)
  })

  it('重试成功：置 draftConflict 冲突态并清失败标志（异常恢复注入）', async () => {
    vi.mocked(callRaw).mockResolvedValue({ ok: false, code: 'CONFLICT', error: '原始配方已变化' })
    vi.mocked(call).mockResolvedValue(null)
    await submitDraft()
    expect(store().conflictLoadFailed).toBe(true)

    vi.mocked(call).mockResolvedValueOnce(pc2Opened('mixingChance')) // 重试成功
    await retryConflictRefresh()
    expect(store().draftConflict).not.toBeNull()
    expect(store().conflictLoadFailed).toBe(false)
  })

  it('重试仍失败：保持标志并可继续重试', async () => {
    vi.mocked(call).mockResolvedValue(null)
    await retryConflictRefresh()
    expect(store().conflictLoadFailed).toBe(true)

    vi.mocked(call).mockResolvedValueOnce(null)
    await retryConflictRefresh()
    expect(store().conflictLoadFailed).toBe(true)
    expect(store().draftConflict).toBeNull()
  })
})
