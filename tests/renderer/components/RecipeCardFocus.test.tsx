/**
 * UI-U2（T-08b）：键盘焦点**不得**切换详情。
 *
 * 缺陷（V9 行 221）：`RecipeCard` 同时挂 `onClick` 与 `onFocus` 到同一个 `onSelect`，
 * 于是 Tab / Shift+Tab 在卡片间移动焦点时，右侧详情面板会跟着变——用户只是移动焦点，
 * 并未选择任何一条，却看到详情被改。
 *
 * 本文件只断言"焦点移动不改变选择"，并同时守住**不得回归**的另外两条路径：
 * 点击仍然选中、卡片上按 Enter 仍然选中（键盘可达性不能被这次修复弄坏）。
 *
 * 环境：`tests/renderer/components/**` 由 `vitest.config.ts` 的 `environmentMatchGlobs` 指派 jsdom。
 * 本文件为**新增**，不修改任何既有测试文件。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { RecipeRecord } from '@shared/types'
import { RecipeCard } from '@renderer/views/BrowseView'

// `useIconKeys` 会调 `items:icons`；jsdom 里没有 preload 桥，`call()` 会在桥缺失时安全返回 null。
// 这里显式清掉桥，避免依赖运行环境里是否恰好存在 window.studio。
const globalWithWindow = globalThis as { window?: { studio?: unknown } }
if (globalWithWindow.window) Reflect.deleteProperty(globalWithWindow.window, 'studio')

afterEach(() => {
  cleanup()
})

function record(patch: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    uid: 'file:E:/pack/kubejs/data/demo/recipes/a.json#recipe#0',
    recipeId: 'demo:a',
    type: 'minecraft:crafting_shaped',
    inputs: [{ id: 'minecraft:stone', count: 1, kind: 'item' }],
    outputs: [{ id: 'minecraft:stone_button', count: 1, kind: 'item' }],
    source: 'datapack',
    sourcePath: 'kubejs/data/demo/recipes/a.json',
    partial: false,
    ...patch
  }
}

describe('UI-U2：键盘焦点不切换详情', () => {
  it('焦点落到卡片上不触发 onSelect', () => {
    const onSelect = vi.fn()
    render(<RecipeCard record={record()} badge="B" selected={false} onSelect={onSelect} />)

    const card = screen.getByRole('button', { name: /minecraft:crafting_shaped/ })
    fireEvent.focus(card)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('焦点在两卡片之间移动：只有被点击的那张会选中', () => {
    const onA = vi.fn()
    const onB = vi.fn()
    render(
      <>
        <RecipeCard record={record({ recipeId: 'demo:a' })} badge="A" selected={false} onSelect={onA} />
        <RecipeCard record={record({ recipeId: 'demo:b' })} badge="B" selected={false} onSelect={onB} />
      </>
    )

    const cards = screen.getAllByRole('button').filter((el) => el.classList.contains('recipe-card'))
    expect(cards).toHaveLength(2)

    // Tab 过去：A 失焦、B 得焦 —— 两者都不应改详情
    fireEvent.blur(cards[0])
    fireEvent.focus(cards[1])
    expect(onA).not.toHaveBeenCalled()
    expect(onB).not.toHaveBeenCalled()

    // 真正的显式选择仍然生效
    fireEvent.click(cards[1])
    expect(onB).toHaveBeenCalledTimes(1)
    expect(onA).not.toHaveBeenCalled()
  })

  it('点击仍然选中（回归）', () => {
    const onSelect = vi.fn()
    render(<RecipeCard record={record()} badge="B" selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /minecraft:crafting_shaped/ }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('卡片上按 Enter 仍然选中（键盘可达性不回归）', () => {
    const onSelect = vi.fn()
    render(<RecipeCard record={record()} badge="B" selected={false} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: /minecraft:crafting_shaped/ }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('焦点移动后按 Enter 才生效——顺序不能反（先焦点后确认）', () => {
    const onSelect = vi.fn()
    render(<RecipeCard record={record()} badge="B" selected={false} onSelect={onSelect} />)
    const card = screen.getByRole('button', { name: /minecraft:crafting_shaped/ })

    fireEvent.focus(card)
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
