import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommitRecipeResult } from '@shared/ipc'
import type { SlotValue } from '@shared/types'

vi.mock('@renderer/api', () => ({ call: vi.fn(), callRaw: vi.fn() }))

import { call, callRaw } from '@renderer/api'
import { useBenchStore } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'
import { submitDraft } from '@renderer/store/commitBridge'
import { normalizedToDraft } from '@renderer/store/draftBridge'
import { pc2Opened } from '../schema/pc2Fixtures'

function store() {
  return useBenchStore.getState()
}

function loadedDraft() {
  const opened = pc2Opened('mixingChance')
  const loaded = normalizedToDraft(opened)
  if (!loaded) throw new Error('draft load failed')
  useBenchStore.getState().loadOpenedRecipe(opened)
  return { opened, loaded }
}

function editResultCount(): void {
  const list = [...(store().bench.values['results'] as SlotValue[])]
  list[0] = { ...list[0]!, count: 7 }
  store().setValue('results', list)
}

function commitResult(opened = pc2Opened('mixingChance')): CommitRecipeResult {
  return {
    mode: 'overwrite',
    recipeId: 'test:mixingChance',
    savedUid: 'file:E:/tmp/kubejs/data/test/recipes/mixing.json',
    savedPath: 'E:/tmp/kubejs/data/test/recipes/mixing.json',
    savedRelativePath: 'kubejs/data/test/recipes/mixing.json',
    savedRawHash: opened.normalized?.rawHash ?? 'x',
    opened,
    dirtyFields: ['results'],
    bytes: 100,
    backupCreated: true,
    indexUpdated: true
  }
}

beforeEach(() => {
  useBenchStore.getState().reset()
  useBenchStore.setState({
    past: [],
    future: [],
    draft: null,
    draftConflict: null,
    committing: false,
    lastCommit: null,
    loadedFrom: null
  })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [], logs: [] })
  vi.mocked(call).mockReset()
  vi.mocked(callRaw).mockReset()
})

describe('P-C3 渲染端提交编排', () => {
  it('成功后用保存结果重建干净草稿，清 dirty，记录 lastCommit', async () => {
    const { opened } = loadedDraft()
    editResultCount()
    expect(store().draft?.meta.dirtyFields).toEqual(['results'])
    vi.mocked(callRaw).mockResolvedValue({ ok: true, data: commitResult(opened) })

    const res = await submitDraft()
    expect(res.ok).toBe(true)
    expect(store().draft?.meta.dirtyFields).toEqual([])
    expect(store().lastCommit?.path).toContain('mixing.json')
    expect(store().committing).toBe(false)
    expect(store().draftConflict).toBeNull()
    expect(vi.mocked(callRaw).mock.calls[0]?.[0]).toBe('recipes:commit')
    const req = vi.mocked(callRaw).mock.calls[0]?.[1] as { mode: string; dirtyFields: string[]; expectedRawHash: string }
    expect(req.mode).toBe('overwrite')
    expect(req.dirtyFields).toEqual(['results'])
    expect(req.expectedRawHash).toBeTruthy()
  })

  it('写盘失败：错误返回，dirty 与 lastCommit 保持，可重试', async () => {
    loadedDraft()
    editResultCount()
    vi.mocked(callRaw).mockResolvedValue({ ok: false, code: 'SAVE_FAILED', error: 'EACCES' })
    const res = await submitDraft()
    expect(res.ok).toBe(false)
    expect(res.code).toBe('SAVE_FAILED')
    expect(store().draft?.meta.dirtyFields).toEqual(['results'])
    expect(store().lastCommit).toBeNull()
    expect(store().committing).toBe(false)
    expect((store().bench.values['results'] as SlotValue[])[0]?.count).toBe(7)
  })

  it('后端检测冲突：挂起 draftConflict，不替换草稿、不清 dirty、不恢复预览', async () => {
    const { opened } = loadedDraft()
    editResultCount()
    vi.mocked(callRaw).mockResolvedValue({ ok: false, code: 'CONFLICT', error: '原始配方已变化' })
    vi.mocked(call).mockResolvedValue(opened)
    const res = await submitDraft()
    expect(res.ok).toBe(false)
    expect(res.conflict).toBe(true)
    expect(store().draftConflict).not.toBeNull()
    expect(store().draft?.meta.dirtyFields).toEqual(['results'])
    expect((store().bench.values['results'] as SlotValue[])[0]?.count).toBe(7)
    expect(store().getDraftPreview()).toBeNull()
    expect(store().lastCommit).toBeNull()
  })

  it('unsafeReason / 未解决冲突 / 无修改 / 重复提交在 IPC 前就被拒绝', async () => {
    loadedDraft()
    const current = store().draft!
    useBenchStore.setState({ draft: { ...current, unsafeReason: '含 unknown' } })
    expect((await submitDraft()).code).toBe('UNSAFE')
    expect(vi.mocked(callRaw)).not.toHaveBeenCalled()

    useBenchStore.setState({ draft: { ...current, unsafeReason: undefined, meta: { ...current.meta, dirtyFields: ['results'] } }, draftConflict: pc2Opened('mixingChance') })
    expect((await submitDraft()).code).toBe('CONFLICT_PENDING')

    useBenchStore.setState({ draftConflict: null, draft: { ...current, meta: { ...current.meta, dirtyFields: [] } } })
    expect((await submitDraft()).code).toBe('NO_CHANGES')

    useBenchStore.setState({ draft: { ...current, meta: { ...current.meta, dirtyFields: ['results'] } }, committing: true })
    expect((await submitDraft()).code).toBe('BUSY')
    expect(vi.mocked(callRaw)).not.toHaveBeenCalled()
  })

  it('索引更新失败：成功返回但仍显式告警，草稿重建且 dirty 清空', async () => {
    const { opened } = loadedDraft()
    editResultCount()
    vi.mocked(callRaw).mockResolvedValue({
      ok: true,
      data: { ...commitResult(opened), indexUpdated: false, indexWarning: '文件已写入，但内存索引更新失败；请执行「重新扫描」' }
    })
    const res = await submitDraft()
    expect(res.ok).toBe(true)
    expect(store().draft?.banners.some((b) => b.level === 'warn' && b.text.includes('重新扫描'))).toBe(true)
    expect(store().draft?.meta.dirtyFields).toEqual([])
  })

  it('P-C6 新增失败码：保留 dirty，并给出「下一步该做什么」的提示', async () => {
    loadedDraft()
    editResultCount()
    for (const [code, hint] of [
      ['BACKUP_FAILED', '原文件未被改动'],
      ['SAVE_ROLLBACK_FAILED', '状态不确定'],
      ['TARGET_VANISHED', '被外部删除'],
      ['TARGET_CHANGED', '被外部修改']
    ] as const) {
      vi.mocked(callRaw).mockResolvedValue({ ok: false, code, error: `后端消息（${code}）` })
      const res = await submitDraft()
      expect(res.ok).toBe(false)
      expect(res.code).toBe(code)
      expect(res.error).toContain(hint)
      expect(store().draft?.meta.dirtyFields).toEqual(['results'])
      expect(store().lastCommit).toBeNull()
    }
  })

  it('另存副本（base=null）以 copy 模式提交，成功后建立新基线', async () => {
    const { opened } = loadedDraft()
    editResultCount()
    store().resolveConflictSaveCopy()
    expect(store().draft?.meta.base).toBeNull()
    vi.mocked(callRaw).mockResolvedValue({ ok: true, data: commitResult(opened) })
    const res = await submitDraft()
    expect(res.ok).toBe(true)
    const req = vi.mocked(callRaw).mock.calls[0]?.[1] as { mode: string; expectedRawHash: string | null }
    expect(req.mode).toBe('copy')
    expect(req.expectedRawHash).toBeNull()
    expect(store().draft?.meta.dirtyFields).toEqual([])
  })
})
