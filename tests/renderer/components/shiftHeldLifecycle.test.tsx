// @vitest-environment jsdom
/**
 * P3-23b：useSlotBinding 的 shiftHeld 全局监听改为引用计数生命周期——
 * 首个使用该 hook 的组件挂载时安装、最后一个卸载时移除；模块导入不再永久安装。
 * 附带行为守卫：监听装上后 shiftHeld 仍随真实 pointerdown 事件更新。
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JSX } from 'react'

const { eyedropperCalls } = vi.hoisted(() => ({
  eyedropperCalls: [] as Array<{ slotId: string; shift: boolean }>
}))

vi.mock('@renderer/views/bench/useBenchInteractions', () => ({
  placeEyedropper: (slotId: string, shift: boolean): boolean => {
    eyedropperCalls.push({ slotId, shift })
    return false
  }
}))

import { useSlotBinding, type SlotBinding } from '@renderer/views/bench/controls/useSlotBinding'
import { useAppStore } from '@renderer/store/appStore'
import { useBenchStore } from '@renderer/store/benchStore'

let binding: SlotBinding | null = null

function Harness(): JSX.Element | null {
  binding = useSlotBinding({ slotId: 'grid:0', value: null, kind: 'item' })
  return null
}

/** addEventListener 的第三参既可能是 boolean，也可能是 { capture } 对象，两种都要识别 */
function captures(calls: unknown[][], type: string, captureExpected: boolean): number {
  return calls.filter((c) => {
    if (c[0] !== type) return false
    const opt = c[2]
    const capture = typeof opt === 'boolean' ? opt : Boolean((opt as { capture?: boolean } | undefined)?.capture)
    return capture === captureExpected
  }).length
}

beforeEach(() => {
  eyedropperCalls.length = 0
  binding = null
  useBenchStore.getState().reset()
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [], logs: [] })
})

afterEach(() => {
  cleanup()
})

describe('P3-23b shiftHeld 监听生命周期', () => {
  it('两个组件共享一份监听；全部卸载后移除（修复前模块导入即永久安装 → 红）', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const a = render(<Harness />)
    const b = render(<Harness />)
    expect(captures(addSpy.mock.calls as unknown as unknown[][], 'pointerdown', true)).toBe(1)
    expect(captures(addSpy.mock.calls as unknown as unknown[][], 'keyup', false)).toBe(1)

    a.unmount()
    expect(captures(removeSpy.mock.calls as unknown as unknown[][], 'pointerdown', true)).toBe(0)
    b.unmount()
    expect(captures(removeSpy.mock.calls as unknown as unknown[][], 'pointerdown', true)).toBe(1)
    expect(captures(removeSpy.mock.calls as unknown as unknown[][], 'keyup', false)).toBe(1)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('shiftHeld 仍随真实指针事件更新（行为守卫）', () => {
    render(<Harness />)
    window.dispatchEvent(new MouseEvent('pointerdown', { shiftKey: true }))
    expect(binding).not.toBeNull()
    binding?.onActivate()
    expect(eyedropperCalls).toHaveLength(1)
    expect(eyedropperCalls[0]?.shift).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keyup', { shiftKey: false }))
    binding?.onActivate()
    expect(eyedropperCalls).toHaveLength(2)
    expect(eyedropperCalls[1]?.shift).toBe(false)
  })
})
