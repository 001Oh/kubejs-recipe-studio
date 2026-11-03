/**
 * T-10 / G-12：组件级测试的本体（jsdom + @testing-library/react）。
 *
 * 为什么测 `FieldShell`：它是唯一**纯展示**、且直接吃 `fieldModel.fieldLabel()` 的组件——
 * 标签推导、必填标记、低频徽章、tone 分区全在这里落地。
 * 选它可以在不碰 store / IPC / 主进程的前提下，真正渲染一棵 React 树并断言 DOM。
 *
 * 环境说明：本文件位于 `tests/renderer/components/**`，由
 * `vitest.config.ts` 的 `environmentMatchGlobs` 单独指派为 `jsdom`；
 * 其余 `tests/renderer/*.test.ts`（13 个纯逻辑用例）仍跑 node 环境，运行环境未变。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { RecipeSlotSchema } from '@shared/types'
import { FieldShell } from '@renderer/views/bench/controls/FieldShell'

afterEach(() => {
  cleanup()
})

function field(patch: Partial<RecipeSlotSchema> = {}): RecipeSlotSchema {
  return { key: 'amount', displayName: '', kind: 'text', multiple: false, ...patch }
}

describe('T-10：FieldShell 组件行为（fieldModel.fieldLabel 的渲染落点）', () => {
  it('displayName 优先于 key 推导', () => {
    render(
      <FieldShell field={field({ key: 'require_energy', displayName: '所需能量' })}>
        <span>body</span>
      </FieldShell>
    )
    expect(screen.getByText('所需能量')).toBeInTheDocument()
    // 有 displayName 时不得回落到 key 推导出的「需要…」
    expect(screen.queryByText(/^需要/)).toBeNull()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('无 displayName 时按 key 推导出「需要…」句式', () => {
    render(
      <FieldShell field={field({ key: 'require_energy', displayName: '' })}>
        <span>body</span>
      </FieldShell>
    )
    expect(screen.getByText(/^需要/)).toBeInTheDocument()
  })

  it('required 为真时渲染必填标记，为假时不渲染', () => {
    const { container: on } = render(
      <FieldShell field={field({ required: true })}>
        <span>x</span>
      </FieldShell>
    )
    expect(on.querySelector('.field-required')).not.toBeNull()
    cleanup()

    const { container: off } = render(
      <FieldShell field={field({ required: false })}>
        <span>x</span>
      </FieldShell>
    )
    expect(off.querySelector('.field-required')).toBeNull()
  })

  it('occurrenceRate < 0.5 时出现「少见」徽章，≥ 0.5 时不出现', () => {
    render(
      <FieldShell field={field({ occurrenceRate: 0.2 })}>
        <span>x</span>
      </FieldShell>
    )
    expect(screen.getByText('少见')).toBeInTheDocument()
    cleanup()

    render(
      <FieldShell field={field({ occurrenceRate: 0.8 })}>
        <span>x</span>
      </FieldShell>
    )
    expect(screen.queryByText('少见')).toBeNull()
  })

  it('tone 决定分区类名', () => {
    const { container } = render(
      <FieldShell field={field()} tone="extra">
        <span>x</span>
      </FieldShell>
    )
    expect(container.querySelector('.field-extra')).not.toBeNull()
  })

  it('bare 模式只渲染内容，不渲染标签外壳', () => {
    const { container } = render(
      <FieldShell field={field({ displayName: '不该出现' })} bare>
        <span>only-child</span>
      </FieldShell>
    )
    expect(container.querySelector('.field-label')).toBeNull()
    expect(screen.queryByText('不该出现')).toBeNull()
    expect(screen.getByText('only-child')).toBeInTheDocument()
  })

  it('title 属性回落到 key（无 description 时）', () => {
    const { container } = render(
      <FieldShell field={field({ key: 'amount', description: undefined })}>
        <span>x</span>
      </FieldShell>
    )
    expect(container.querySelector('.field')).toHaveAttribute('title', 'amount')
  })
})
