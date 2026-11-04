// @vitest-environment jsdom
/**
 * T-117 E：multi_io / shapeless 空列表必须有显式入口。
 *
 * 旧行为：`SlotGroup` 只在 `field.multiple` 时为「追加」渲染一个拖放槽，
 * 单值字段（smithing 的 template/base/addition、熔炼家族的 ingredient）在空白草稿里
 * 一行都不渲染——用户看到的是"这块区域什么都没有"，没有可点的东西。
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedSchema } from '@shared/schemaModel'

vi.mock('../../../src/renderer/src/api', () => ({
  call: vi.fn(async () => null),
  callOrThrow: vi.fn(async () => [])
}))

import { PilotListEditor } from '../../../src/renderer/src/views/bench/PilotListEditor'
import { useBenchStore } from '../../../src/renderer/src/store/benchStore'

const schema: NormalizedSchema = {
  id: 'minecraft:smithing_transform',
  layoutKind: 'multi_io',
  revision: 1,
  preserveUnknown: true,
  slots: [
    { key: 'template', kind: 'item', multiple: false, required: true },
    { key: 'ingredients', kind: 'item', multiple: true, required: true }
  ],
  outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }]
}

function seed(values: Record<string, unknown>): void {
  useBenchStore.setState({
    bench: { typeId: schema.id, layoutKind: 'multi_io', values, activeSlotKey: null, modifiers: {} },
    draft: {
      uid: 'new:minecraft:smithing_transform',
      workbench: { typeId: schema.id, layoutKind: 'multi_io', values, activeSlotKey: null, modifiers: {} },
      meta: { base: null, draftVersion: 1, dirtyFields: [] },
      passThrough: [],
      normalized: { typeId: schema.id, schemaRef: { id: schema.id, revision: 1 }, slots: [], unknowns: [], partial: { isPartial: false, reasons: [] }, rawHash: '', source: { uid: 'x', source: 'datapack', sourcePath: '', raw: {}, dynamic: false } },
      schema,
      diagnostics: [],
      banners: []
    }
  } as never)
}

afterEach(cleanup)

describe('E 空列表的显式入口', () => {
  beforeEach(() => cleanup())

  it('单值字段为空时也渲染「+ 添加一项」（不只 multiple 字段有）', () => {
    seed({ template: null, ingredients: [], result: null })
    render(<PilotListEditor />)
    // 三个分组（template / ingredients / result）都空 → 三个入口
    expect(screen.getAllByRole('button', { name: /\+ 添加一项/ })).toHaveLength(3)
  })

  it('点「+ 添加一项」往对应字段追加一个空槽位，其它字段不动', () => {
    seed({ template: null, ingredients: [], result: null })
    render(<PilotListEditor />)
    const buttons = screen.getAllByRole('button', { name: /\+ 添加一项/ })
    fireEvent.click(buttons[0])

    const values = useBenchStore.getState().bench.values
    expect(Array.isArray(values['template'])).toBe(true)
    expect((values['template'] as unknown[]).length).toBe(1)
    expect(values['ingredients']).toEqual([]) // 别的字段没被牵连
    expect(values['result']).toBeNull()
  })

  it('已有内容时不显示该入口（不重复堆按钮）', () => {
    seed({ template: [{ kind: 'item', id: 'minecraft:netherite_upgrade_smithing_template', count: 1 }], ingredients: [], result: null })
    render(<PilotListEditor />)
    // template 有 1 项 → 只剩 ingredients 与 result 两个空入口
    expect(screen.getAllByRole('button', { name: /\+ 添加一项/ })).toHaveLength(2)
  })

  it('必填字段带「必填」标注（知道哪些不能空着提交）', () => {
    seed({ template: null, ingredients: [], result: null })
    render(<PilotListEditor />)
    expect(screen.getAllByText('必填').length).toBe(3)
  })
})
