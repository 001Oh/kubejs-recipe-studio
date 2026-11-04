// @vitest-environment jsdom
/** 第 116 批 A-4：新建前选类型 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewDraftTypePicker } from '../../../src/renderer/src/views/bench/NewDraftTypePicker'
import type { SchemaSummary } from '../../../src/shared/ipc'

afterEach(cleanup)

const rows = [
  {
    id: 'minecraft:crafting_shaped',
    displayName: '有序合成',
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
    displayName: '粉碎',
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
  const onOpenSettings = vi.fn()
  render(
    <NewDraftTypePicker
      summaries={rows}
      pilotTypes={['minecraft:crafting_shaped']}
      currentTypeId="minecraft:crafting_shaped"
      onPick={onPick}
      onCancel={onCancel}
      onOpenSettings={onOpenSettings}
      {...overrides}
    />
  )
  return { onPick, onCancel, onOpenSettings }
}

describe('A-4 新建前选类型', () => {
  it('常驻「当前类型」标签，选项来自 schema:list', () => {
    setup()
    expect(screen.getByText(/当前类型：有序合成/)).toBeTruthy()
    expect(screen.getAllByTitle('minecraft:crafting_shaped').length).toBeGreaterThan(0)
    expect(screen.getByText('mekanism:crushing')).toBeTruthy()
  })

  it('试点白名单内的类型可点；点击回传该 summary', () => {
    const { onPick } = setup()
    fireEvent.click(screen.getByRole('button', { name: '用这个类型' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].id).toBe('minecraft:crafting_shaped')
  })

  it('不在白名单的类型：置灰但可见，并给「去设置开启」', () => {
    const { onOpenSettings } = setup()
    const row = document.querySelector('[data-type-id="mekanism:crushing"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(row.className).toContain('is-disabled')
    expect(row.textContent).toContain('当前不在试点白名单')
    expect(screen.getAllByRole('button', { name: '用这个类型' })).toHaveLength(1) // 只有试点那一行有
    fireEvent.click(screen.getByRole('button', { name: '去设置开启' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
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
