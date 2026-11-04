// @vitest-environment jsdom
/** 第 116 批 A-4 新建前选类型；T-117 白名单废除：所有类型都可选，不再有置灰行 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewDraftTypePicker } from '../../../src/renderer/src/views/bench/NewDraftTypePicker'
import type { SchemaSummary } from '../../../src/shared/ipc'

afterEach(cleanup)

const rows = [
  {
    id: 'minecraft:crafting_shaped',
    displayName: '有序合成（3×3）',
    modId: 'minecraft',
    modDisplayName: 'Minecraft',
    layoutKind: 'shaped',
    sampleCount: 1200,
    source: 'builtin',
    group: 'builtin',
    capability: 'sugar',
    channel: 'kubejs-sugar',
    lowConfidence: false,
    pinned: false
  },
  {
    id: 'mekanism:crushing',
    displayName: 'mekanism:crushing',
    modId: 'mekanism',
    modDisplayName: 'Mekanism',
    layoutKind: 'single_io',
    sampleCount: 80,
    source: 'inferred',
    group: 'inferred',
    capability: 'datapack',
    channel: 'datapack-json',
    lowConfidence: false,
    pinned: false
  }
] as unknown as SchemaSummary[]

const setup = (overrides: Partial<Parameters<typeof NewDraftTypePicker>[0]> = {}) => {
  const onPick = vi.fn()
  const onCancel = vi.fn()
  render(
    <NewDraftTypePicker
      summaries={rows}
      currentTypeId="minecraft:crafting_shaped"
      onPick={onPick}
      onCancel={onCancel}
      {...overrides}
    />
  )
  return { onPick, onCancel }
}

describe('A-4 新建前选类型（T-117 后：全部可选）', () => {
  it('常驻「当前类型」标签，选项来自 schema:list', () => {
    setup()
    expect(screen.getByText(/当前类型：有序合成/)).toBeTruthy()
    expect(screen.getAllByTitle('minecraft:crafting_shaped').length).toBeGreaterThan(0)
    expect(screen.getByText('mekanism:crushing')).toBeTruthy()
  })

  it('每一行都有「用这个类型」按钮；点击回传该 summary', () => {
    const { onPick } = setup()
    const buttons = screen.getAllByRole('button', { name: '用这个类型' })
    expect(buttons).toHaveLength(2) // 白名单废除后两行都可点
    fireEvent.click(buttons[1])
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].id).toBe('mekanism:crushing')
  })

  it('没有任何置灰行与「去设置开启」（开关已不存在）', () => {
    setup()
    expect(document.querySelectorAll('.type-pick-row.is-disabled')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '去设置开启' })).toBeNull()
    expect(screen.queryByText(/不在试点白名单/)).toBeNull()
  })

  it('过滤框按名称 / ID 过滤；无结果时给说明', () => {
    setup()
    const input = screen.getByLabelText('过滤配方类型')
    fireEvent.change(input, { target: { value: 'mekanism' } })
    expect(screen.getByText('mekanism:crushing')).toBeTruthy()
    expect(document.querySelector('[data-type-id="minecraft:crafting_shaped"]')).toBeNull()
    fireEvent.change(input, { target: { value: '不存在的类型' } })
    expect(screen.getByText(/没有匹配/)).toBeTruthy()
  })

  it('返回按钮回到三入口', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
