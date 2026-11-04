/**
 * P3-21：benchUiStore 两处健壮性。
 * a) ensureSchema 迟到返回：用户已切到新类型时，旧 IPC 响应不得覆盖当前选择
 *    （schema/schemaTypeId/schemaLoading 属于最新请求；缓存仍可更新——旧类型的
 *    schema 对旧类型依然有效）。用可控延迟的 IPC stub 证明，不靠目视。
 * b) loadSummaries 失败必须与「确实没有类型」可区分（summariesError），不能折叠成空数组。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeTypeSchema } from '@shared/types'

vi.mock('@renderer/api', () => ({ call: vi.fn(), callOrThrow: vi.fn() }))

import { callOrThrow } from '@renderer/api'
import { useAppStore } from '@renderer/store/appStore'
import { useBenchUiStore } from '@renderer/views/bench/benchUiStore'

interface Pending {
  typeId: string
  resolve: (v: RecipeTypeSchema) => void
}

let pending: Pending[] = []

function schemaOf(id: string): RecipeTypeSchema {
  return {
    id,
    displayName: `T:${id}`,
    modId: 'test',
    modDisplayName: 'Test',
    source: 'builtin',
    layoutKind: 'shapeless',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

beforeEach(() => {
  pending = []
  useBenchUiStore.setState({
    summaries: [],
    summariesLoaded: false,
    summariesError: null,
    schema: null,
    schemaTypeId: '',
    schemaLoading: false,
    schemaCache: {},
    registryCache: {}
  })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [], logs: [] })
  vi.mocked(callOrThrow).mockReset()
  vi.mocked(callOrThrow).mockImplementation((_name, req) => {
    const typeId = (req as { typeId?: string })?.typeId ?? ''
    return new Promise<RecipeTypeSchema>((resolve) => {
      pending.push({ typeId, resolve })
    })
  })
})

describe('P3-21a ensureSchema 迟到返回不得覆盖新选择', () => {
  it('B 先返回、A 后返回：当前选择保持 B，A 只进缓存', async () => {
    const store = useBenchUiStore.getState()
    const pA = store.ensureSchema('typeA')
    const pB = store.ensureSchema('typeB')
    expect(useBenchUiStore.getState().schemaTypeId).toBe('typeB')

    pending.find((p) => p.typeId === 'typeB')?.resolve(schemaOf('typeB-schema'))
    await pB
    expect(useBenchUiStore.getState().schemaTypeId).toBe('typeB')
    expect(useBenchUiStore.getState().schema?.id).toBe('typeB-schema')
    expect(useBenchUiStore.getState().schemaLoading).toBe(false)

    // A 迟到返回
    pending.find((p) => p.typeId === 'typeA')?.resolve(schemaOf('typeA-schema'))
    await pA
    // 修复前（红）：A 的迟到响应把 schema/schemaTypeId 覆盖回 A
    expect(useBenchUiStore.getState().schemaTypeId).toBe('typeB')
    expect(useBenchUiStore.getState().schema?.id).toBe('typeB-schema')
    expect(useBenchUiStore.getState().schemaLoading).toBe(false)
    // A 的结果对 A 依然有效：进缓存，不丢
    expect(useBenchUiStore.getState().schemaCache['typeA']?.id).toBe('typeA-schema')
  })

  it('失败响应同样不得覆盖新选择', async () => {
    const store = useBenchUiStore.getState()
    const pA = store.ensureSchema('typeA')
    const pB = store.ensureSchema('typeB')
    pending.find((p) => p.typeId === 'typeB')?.resolve(schemaOf('typeB-schema'))
    await pB
    // A 失败迟到（callOrThrow reject）
    const aPending = pending.find((p) => p.typeId === 'typeA')
    vi.mocked(callOrThrow).mockImplementation(() => Promise.reject(new Error('late failure')))
    aPending?.resolve(schemaOf('typeA-schema'))
    await pA.catch(() => undefined)
    expect(useBenchUiStore.getState().schemaTypeId).toBe('typeB')
    expect(useBenchUiStore.getState().schema?.id).toBe('typeB-schema')
  })
})

describe('P3-21b loadSummaries 失败可区分', () => {
  it('IPC 失败：summariesError 有值，不与「确实没有」混淆（修复前折叠空数组 → 红）', async () => {
    vi.mocked(callOrThrow).mockRejectedValueOnce(new Error('schema:list IPC down'))
    await useBenchUiStore.getState().loadSummaries()
    expect(useBenchUiStore.getState().summariesLoaded).toBe(true)
    expect(useBenchUiStore.getState().summaries).toEqual([])
    expect(useBenchUiStore.getState().summariesError).toContain('schema:list IPC down')
  })

  it('成功后 summariesError 复位为 null', async () => {
    vi.mocked(callOrThrow).mockResolvedValueOnce([{ id: 'a:x' }] as never)
    await useBenchUiStore.getState().loadSummaries()
    expect(useBenchUiStore.getState().summariesError).toBeNull()
    expect(useBenchUiStore.getState().summaries).toHaveLength(1)
  })
})
