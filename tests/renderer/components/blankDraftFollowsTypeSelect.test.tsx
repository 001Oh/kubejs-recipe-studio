// @vitest-environment jsdom
/**
 * 第 119 批：空白草稿的类型**只由头顶的配方类型选择器决定**。
 *
 * 用户裁定（原话）：「让空白草稿由头上的配方类型来管而不是重新设置」。
 * 修复前：点「② 从零新建」会先弹 NewDraftTypePicker 让人再选一次类型——
 * 两套入口各自维护「当前类型」，选完还会把 bench.typeId 改成第二套选的值，
 * 与头顶下拉显示的类型不一致。第 119 批删掉第二套，本文件锁四件事：
 *   1. 点空态的「新建」直接进草稿，**不再出现任何二次选型列表**
 *   2. 草稿类型 == 头顶 TypeSelect 当前类型（bench.typeId），不多不少
 *   3. 换完头顶类型再点「新建」，草稿跟着新类型走（不是建旧类型）
 *   4. 头顶类型没有 schema：不建空壳草稿，提示回头顶「配方类型」换一个
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * vi.mock 的工厂是提升的，引用的变量必须一起提升。
 * `hasSchema` 是「本用例里唯一一个有 schema 的类型」，用例内可改。
 */
const h = vi.hoisted(() => {
  const mk = (id: string): Record<string, unknown> => ({
    id,
    displayName: id,
    modId: id.split(':')[0],
    modDisplayName: '',
    layoutKind: 'single_io',
    source: 'builtin',
    sampleCount: 10,
    lowConfidence: false,
    pinned: false,
    capability: 'datapack',
    channel: 'datapack-json',
    group: 'builtin'
  })
  return {
    schemaGet: [] as string[],
    hasSchema: 'minecraft:smelting',
    types: ['minecraft:smelting', 'mekanism:crushing'] as string[],
    mk
  }
})

vi.mock('../../../src/renderer/src/api', () => ({
  call: vi.fn(async () => null),
  callOrThrow: vi.fn(async (channel: string, req?: { typeId?: string }) => {
    if (channel === 'schema:list') return h.types.map(h.mk)
    if (channel === 'schema:get') {
      const typeId = req?.typeId ?? ''
      h.schemaGet.push(typeId)
      if (typeId !== h.hasSchema) return null
      return {
        id: typeId,
        layoutKind: 'single_io',
        slots: [{ key: 'ingredient', kind: 'item', multiple: false }],
        outputs: [{ key: 'result', kind: 'item', multiple: false }],
        revision: 1,
        preserveUnknown: true
      }
    }
    return []
  }),
  callRaw: vi.fn(async () => ({ ok: false, error: 'bridge-unavailable', code: 'BRIDGE' })),
  iconUrl: () => null
}))

import { BenchView } from '../../../src/renderer/src/views/BenchView'
import { useBenchStore } from '../../../src/renderer/src/store/benchStore'
import { useAppStore } from '../../../src/renderer/src/store/appStore'
import { useBenchUiStore } from '../../../src/renderer/src/views/bench/benchUiStore'

const toastSpy = vi.fn()

function primeStores(typeId: string): void {
  useBenchStore.getState().reset()
  useBenchStore.setState({
    bench: { typeId, layoutKind: 'single_io', values: { inputs: [], outputs: [] }, activeSlotKey: null, modifiers: {} },
    past: [],
    future: [],
    draft: null,
    loadedFrom: null
  } as never)
  useBenchUiStore.setState({ summaries: [], summariesLoaded: false, summariesError: null, schema: null, schemaTypeId: '', schemaCache: {} } as never)
  useAppStore.setState({ modpack: { path: 'E:/pack', name: 'test' } as never })
}

/** summaries 是异步拉的（loadSummaries），等它就位再点按钮 */
async function waitSummaries(count: number): Promise<void> {
  await waitFor(() => expect(useBenchUiStore.getState().summaries).toHaveLength(count))
}

beforeEach(() => {
  h.schemaGet.length = 0
  h.hasSchema = 'minecraft:smelting'
  h.types = ['minecraft:smelting', 'mekanism:crushing']
  toastSpy.mockReset()
  useAppStore.setState({ toast: toastSpy as never })
})

afterEach(cleanup)

const clickCreate = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /从零新建/ }))
}

describe('第 119 批 空白草稿跟随头顶类型', () => {
  it('点「从零新建」直接用头顶类型建草稿，不出现二次选型列表', async () => {
    primeStores('minecraft:smelting')
    render(<BenchView />)
    await waitSummaries(2)

    expect(screen.getByLabelText('开始编辑')).toBeTruthy()
    expect(screen.queryByLabelText('选择一个配方类型')).toBeNull()

    clickCreate()

    await waitFor(() => expect(useBenchStore.getState().draft).not.toBeNull())
    // 旧实现的 NewDraftTypePicker 会在这里出现；第 119 批之后它必须不存在
    expect(screen.queryByLabelText('选择一个配方类型')).toBeNull()
    expect(document.querySelector('.type-pick-list')).toBeNull()

    // 草稿类型 == 头顶类型；且只请求过这一个类型的 schema
    expect(useBenchStore.getState().draft?.normalized.typeId).toBe('minecraft:smelting')
    expect(useBenchStore.getState().bench.typeId).toBe('minecraft:smelting')
    expect(h.schemaGet).toEqual(['minecraft:smelting'])
  })

  it('换成头顶的另一个类型后再新建：草稿跟新类型走，不建旧类型', async () => {
    primeStores('minecraft:smelting')
    render(<BenchView />)
    await waitSummaries(2)

    // 模拟用户在头顶下拉里换成 mekanism:crushing（TypeSelect 选中后写 bench.typeId）
    h.hasSchema = 'mekanism:crushing'
    useBenchStore.getState().setTypeId('mekanism:crushing', 'single_io', ['inputs', 'outputs'])

    clickCreate()
    await waitFor(() => expect(useBenchStore.getState().draft).not.toBeNull())
    expect(useBenchStore.getState().draft?.normalized.typeId).toBe('mekanism:crushing')
    expect(h.schemaGet).toEqual(['mekanism:crushing'])
  })

  it('头顶类型在清单里但没有 schema：不建空壳草稿，提示回头顶换一个', async () => {
    primeStores('mekanism:crushing')
    render(<BenchView />)
    await waitSummaries(2)

    clickCreate()

    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    const [text, level] = toastSpy.mock.calls[0] as [string, string]
    expect(level).toBe('warn')
    expect(text).toContain('没有可用 schema')
    expect(text).toContain('上方「配方类型」')
    // 关键不变式：拿不到 schema 就不许留下 draft（否则后面提交会写出空配方）
    expect(useBenchStore.getState().draft).toBeNull()
  })

  it('头顶类型完全不在注册表里：入口禁用并写明「换一个带 schema 的类型」', async () => {
    primeStores('othermod:nothing')
    render(<BenchView />)
    await waitSummaries(2)

    const create = screen.getByRole('button', { name: /从零新建/ })
    expect(create).toBeDisabled()
    expect(document.body.textContent).toContain('在上方「配方类型」里换一个带 schema 的类型')
  })
})
