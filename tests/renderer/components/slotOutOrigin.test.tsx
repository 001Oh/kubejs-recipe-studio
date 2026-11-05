// @vitest-environment jsdom
/**
 * 拖回侧边栏的「移出槽位」事件，只有在**来源是工作台槽位**时才有意义。
 *
 * 回归背景（2026-11-05 用户报告）：侧边栏的物品拖出去再拖回来（一次取消拖拽）会打开配方浏览。
 * 原因是两处都缺来源判定：
 *   ① `DndLayer.onDragEnd` 落点 `sidebar` 时无条件派发 `SLOT_OUT_EVENT`（不看 origin）；
 *   ② `useBenchInteractions.onOut` 无条件 `selectItem + setView('browse')`，
 *      即使 `decodeSlot` 解不出地址（`item:minecraft:stone` 不是槽位地址）也照跳。
 * 本用例钉住：非槽位来源不得清空任何槽位、不得切换视图；
 * 真正的槽位拖回侧边栏（既有设计：清空该槽 + 打开其配方）不受影响。
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JSX } from 'react'
import { SLOT_OUT_EVENT } from '@renderer/components/DndLayer'
import { useBenchInteractions } from '@renderer/views/bench/useBenchInteractions'
import { useAppStore } from '@renderer/store/appStore'
import { useBenchStore } from '@renderer/store/benchStore'

function Harness(): JSX.Element | null {
  useBenchInteractions()
  return null
}

/** 以 DndLayer 的真实 payload 形状派发「拖回侧边栏」事件 */
function dropOnSidebar(slotId: string, id: string): void {
  window.dispatchEvent(
    new CustomEvent(SLOT_OUT_EVENT, { detail: { slotId, value: { kind: 'item', id, count: 1 } } })
  )
}

const STONE = { kind: 'item' as const, id: 'minecraft:stone', count: 1 }

function benchWithStone(): void {
  const bench = useBenchStore.getState().bench
  const cells: (typeof STONE | null)[] = new Array(bench.gridRows! * bench.gridCols!).fill(null)
  cells[0] = STONE
  useBenchStore.setState({ bench: { ...bench, values: { grid: cells } } })
}

function gridFirstCell(): unknown {
  const cells = useBenchStore.getState().bench.values['grid']
  return Array.isArray(cells) ? cells[0] : undefined
}

describe('拖回侧边栏的来源判定', () => {
  beforeEach(() => {
    useAppStore.setState({ view: 'bench', selectedItemId: null })
    useBenchStore.setState({ past: [], future: [] })
  })
  afterEach(cleanup)

  it('侧边栏物品拖出去再拖回来（非槽位地址）不切换视图、不清空槽位', () => {
    benchWithStone()
    render(<Harness />)

    dropOnSidebar('item:minecraft:stone', 'minecraft:stone')

    expect(useAppStore.getState().view).toBe('bench')
    expect(gridFirstCell()).toEqual(STONE)
  })

  it('槽位物品拖回侧边栏仍然清空该槽并打开其配方（既有设计不回归）', () => {
    benchWithStone()
    render(<Harness />)

    dropOnSidebar('grid:0', 'minecraft:stone')

    expect(gridFirstCell()).toBeNull()
    expect(useAppStore.getState().view).toBe('browse')
    expect(useAppStore.getState().selectedItemId).toBe('minecraft:stone')
  })
})
