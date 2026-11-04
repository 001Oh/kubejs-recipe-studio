// @vitest-environment jsdom
/**
 * T-117 D：类型选择器（此前是死代码——BenchHead 从未被挂载、样式也从未写过，
 * 工作台实际用的是 <input list=datalist>，datalist 按输入框当前值做前缀过滤，
 * 已选中具体类型时打开只剩它自己一行）。
 *
 * 本文件锁三件事：
 *   1. 打开后是**全量**列表（行数 = 清单数 + 通用行），不做前缀过滤
 *   2. 每行都给中文名；插件新增类型用同一份映射兜底
 *   3. 「无置灰」：任何能力的行都可点（含 unsupported / compatible）
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SchemaSummary } from '@shared/ipc'

const calls = vi.hoisted(() => ({ applied: [] as string[] }))

vi.mock('../../../src/renderer/src/api', () => ({
  call: vi.fn(async () => null),
  callOrThrow: vi.fn(async () => [])
}))
vi.mock('../../../src/renderer/src/views/bench/benchUiStore', async () => {
  const actual = await vi.importActual<typeof import('../../../src/renderer/src/views/bench/benchUiStore')>(
    '../../../src/renderer/src/views/bench/benchUiStore'
  )
  return { ...actual, useBenchUiStore: actual.useBenchUiStore }
})

import { TypeSelect } from '../../../src/renderer/src/views/bench/panels/TypeSelect'
import { useBenchUiStore } from '../../../src/renderer/src/views/bench/benchUiStore'
import { useBenchStore } from '../../../src/renderer/src/store/benchStore'

function summary(over: Partial<SchemaSummary> & { id: string }): SchemaSummary {
  return {
    id: over.id,
    displayName: over.displayName ?? over.id,
    modId: over.id.split(':')[0] ?? '',
    modDisplayName: over.modDisplayName ?? '',
    layoutKind: over.layoutKind ?? 'multi_io',
    source: over.source ?? 'builtin',
    sampleCount: over.sampleCount ?? 0,
    lowConfidence: false,
    pinned: false,
    capability: over.capability ?? 'compatible',
    channel: over.channel ?? 'datapack-json',
    group: over.group ?? 'builtin'
  } as SchemaSummary
}

const SUMMARIES: SchemaSummary[] = [
  summary({ id: 'minecraft:crafting_shaped', displayName: '有序合成（3×3）', capability: 'sugar', channel: 'kubejs-sugar' }),
  summary({ id: 'minecraft:crafting_shapeless', displayName: '无序合成', capability: 'sugar', channel: 'kubejs-sugar' }),
  summary({ id: 'minecraft:smelting', displayName: '熔炼', layoutKind: 'single_io' }),
  // 插件/推断新增、没有中文 displayName 的类型 → 必须靠映射兜底出中文
  summary({ id: 'thermal:pulverizer', displayName: 'thermal:pulverizer', capability: 'unsupported', source: 'plugin' })
]

beforeEach(() => {
  calls.applied.length = 0
  useBenchStore.setState({ bench: { typeId: 'minecraft:crafting_shaped', layoutKind: 'shaped', values: {}, activeSlotKey: null, modifiers: {} } } as never)
  useBenchUiStore.setState({
    summaries: SUMMARIES,
    summariesLoaded: true,
    summariesError: null,
    schema: null,
    applyType: async (id: string) => {
      calls.applied.push(id)
    }
  } as never)
})

afterEach(cleanup)

const openList = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /有序合成/ }))
}

describe('D 类型选择器（全量下拉）', () => {
  it('触发器显示当前类型的中文名，不是裸 id', () => {
    render(<TypeSelect />)
    expect(screen.getByRole('button', { name: /有序合成（3×3）/ })).toBeTruthy()
  })

  it('打开后列出全部类型 + 通用行，不做前缀过滤（旧 datalist 只显示 1 行）', () => {
    render(<TypeSelect />)
    openList()
    const rows = document.querySelectorAll('.type-popover .type-row')
    expect(rows).toHaveLength(SUMMARIES.length + 1) // +1 = 「⚙ 通用 / 任意模组配方」
    expect(document.body.textContent).toContain('⚙ 通用 / 任意模组配方')
  })

  it('每行都渲染中文名；无中文 displayName 的类型走映射兜底', () => {
    render(<TypeSelect />)
    openList()
    const texts = [...document.querySelectorAll('.type-popover .type-row .item-zh')].map((n) => (n.textContent || '').trim())
    for (const t of texts) expect(t.length).toBeGreaterThan(0)
    // 第 118 批：thermal:pulverizer 等已入组合表，四类插件/裸 id 类型全部出中文；
    // 加上底部「⚙ 通用 / 任意模组配方」行（也含中文），故总数 = SUMMARIES.length + 1。
    expect(texts.filter((t) => /[\u4e00-\u9fa5]/.test(t)).length).toBe(SUMMARIES.length + 1)
  })

  it('无置灰：capability=unsupported 的行同样可点（兼容/不支持只是标注，不是禁选）', () => {
    render(<TypeSelect />)
    openList()
    const row = document.querySelector('[title*="thermal:pulverizer"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(row.hasAttribute('disabled')).toBe(false)
    expect(row.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(row)
    expect(calls.applied).toContain('thermal:pulverizer')
  })

  it('搜索框按中文名过滤；清空后恢复全量', () => {
    render(<TypeSelect />)
    openList()
    const input = screen.getByPlaceholderText(/搜索配方类型/)
    fireEvent.change(input, { target: { value: '熔炼' } })
    expect(document.querySelectorAll('.type-popover .type-row')).toHaveLength(2) // 熔炼 + 通用行
    fireEvent.change(input, { target: { value: '' } })
    expect(document.querySelectorAll('.type-popover .type-row')).toHaveLength(SUMMARIES.length + 1)
  })

  it('选中一行后回传该类型 id 并收起下拉', () => {
    render(<TypeSelect />)
    openList()
    const row = document.querySelector('[title*="minecraft:smelting"]') as HTMLElement
    fireEvent.click(row)
    expect(calls.applied).toEqual(['minecraft:smelting'])
    expect(document.querySelector('.type-popover')).toBeNull()
  })

  it('草稿打开时触发器禁用（切类型会和草稿槽位结构对不上）', () => {
    render(<TypeSelect disabled disabledReason="草稿打开时不能切换类型" />)
    const trigger = screen.getByRole('button', { name: /有序合成/ })
    expect(trigger).toBeDisabled()
    expect(trigger.getAttribute('title')).toBe('草稿打开时不能切换类型')
  })
})
