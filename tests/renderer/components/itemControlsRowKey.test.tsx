// @vitest-environment jsdom
/**
 * P3-23a：MultiSlotControl 行 key 由 index 改为稳定键（值身份 + 出现序）。
 *
 * 旧 key={index} 的真实后果不是「重挂载」，而是删除靠前行后 React 复用原下标的
 * 组件实例，把 B 的数据塞进原 A 的实例——行内状态 / dnd 节点身份与数据项错配。
 * Probe 在挂载时锁住 id（born），每次渲染读当前 id（now）：删除首行后
 * born !== now 即证明实例错配。修复后 B/C 的实例应各自保持 born === now。
 *
 * 注：真实 useSlotsOf 的 selector 每次返回新数组，在 React 18 下会无限重渲染，
 * 因此此处部分 mock 为「按 store 原始值 memo 化」的稳定实现，仅隔离该无关问题。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JSX, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { RecipeSlotSchema, SlotValue } from '@shared/types'

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false })
}))

vi.mock('@renderer/views/bench/controls/FieldShell', () => ({
  FieldShell: ({ children }: { children?: ReactNode }): JSX.Element => <div>{children}</div>
}))

vi.mock('@renderer/views/bench/valueAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/views/bench/valueAccess')>()
  const react = await import('react')
  const { useBenchStore } = await import('@renderer/store/benchStore')
  return {
    ...actual,
    useSlotsOf: (key: string): SlotValue[] => {
      const raw = useBenchStore((s) => s.bench.values[key])
      return react.useMemo(() => actual.asSlotList(raw), [raw])
    },
    useSlotAt: (key: string, index?: number): SlotValue | null => {
      const raw = useBenchStore((s) => s.bench.values[key])
      return react.useMemo(
        () => (index === undefined ? actual.asSlot(raw) : (actual.asSlotArray(raw)[index] ?? null)),
        [raw, index]
      )
    }
  }
})

import { MultiSlotControl } from '@renderer/views/bench/controls/ItemControls'
import { useBenchStore } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'

const FIELD: RecipeSlotSchema = { key: 'testlist', displayName: '材料', kind: 'item', multiple: true }
const bornLog: string[] = []

function sv(id: string): SlotValue {
  return { kind: 'item', id }
}

function Probe({ id }: { id: string }): JSX.Element {
  const [born] = useState(() => id)
  useEffect(() => {
    bornLog.push(born)
  }, [])
  return <div data-testid="probe" data-born={born} data-now={id} />
}

function renderRow(index: number): JSX.Element {
  const raw = useBenchStore.getState().bench.values['testlist'] as SlotValue[] | undefined
  return <Probe id={(raw ?? [])[index]?.id ?? ''} />
}

beforeEach(() => {
  bornLog.length = 0
  useBenchStore.getState().reset()
  useBenchStore.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [], logs: [] })
})

afterEach(() => {
  cleanup()
})

describe('P3-23a MultiSlotControl 行稳定 key', () => {
  it('删除首行后剩余行的实例身份仍与数据一致（修复前 index 复用导致错配 → 红）', () => {
    useBenchStore.setState({
      bench: {
        ...useBenchStore.getState().bench,
        values: { testlist: [sv('minecraft:a'), sv('minecraft:b'), sv('minecraft:c')] }
      }
    })
    render(<MultiSlotControl field={FIELD} renderRow={renderRow} />)
    expect(screen.getAllByTestId('probe')).toHaveLength(3)

    const removeButtons = screen.getAllByTitle('移除该条目')
    fireEvent.click(removeButtons[0] as HTMLElement)

    const rows = screen.getAllByTestId('probe')
    expect(rows).toHaveLength(2)
    expect(useBenchStore.getState().bench.values['testlist']).toEqual([sv('minecraft:b'), sv('minecraft:c')])
    for (const row of rows) {
      expect(row.getAttribute('data-now')).toBe(row.getAttribute('data-born'))
    }
  })

  it('追加新行只有新行挂载（守卫）', () => {
    useBenchStore.setState({
      bench: { ...useBenchStore.getState().bench, values: { testlist: [sv('minecraft:a')] } }
    })
    render(<MultiSlotControl field={FIELD} renderRow={renderRow} />)
    expect(bornLog).toHaveLength(1)
    fireEvent.click(screen.getByText('+ 添加'))
    expect(useBenchStore.getState().bench.values['testlist']).toHaveLength(2)
    expect(bornLog).toHaveLength(2)
  })
})
