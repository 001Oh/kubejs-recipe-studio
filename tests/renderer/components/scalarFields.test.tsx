/**
 * B124/D-37 §4.2：熔炼家族标量字段的界面取证。
 *
 * 真实输入事件：经 fireEvent.change 派发 change 事件（jsdom 内等价于用户输入的
 * 事件路径），禁用「直接改 input.value」式程序化赋值。
 *
 * 钉住三件事：
 * 1. smelting 草稿出现 2 个数字输入框（不是物品槽），默认值 0 / 200 可见；
 * 2. 只填时长 200 → 经验自动回填 0（解法 C 位置占位，陷阱二）；
 * 3. 同一草稿切到 shaped schema 不出现这两个框（不污染其他类型），切回后已填值保留
 *    （值由 bench.values 承载，组件重挂载不丢）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { PILOT_SCHEMAS } from '@shared/pilotSchemas'
import { createDraftMeta } from '@shared/draftState'
import type { WorkbenchState } from '@shared/types'
import { PilotListEditor } from '@renderer/views/bench/PilotListEditor'
import { useBenchStore, type BenchStore } from '@renderer/store/benchStore'

const BENCH: WorkbenchState = {
  typeId: 'minecraft:smelting',
  layoutKind: 'single_io',
  values: {},
  activeSlotKey: null,
  modifiers: {},
  gridRows: 3,
  gridCols: 3
}

/** 装上最小试点草稿（PilotListEditor 只消费 draft.schema / draft.unsafeReason） */
function mountDraft(schemaId: 'minecraft:smelting' | 'minecraft:crafting_shaped', keepValues = false): void {
  const prev = useBenchStore.getState().bench
  const bench: WorkbenchState = { ...BENCH, typeId: schemaId, values: keepValues ? prev.values : {} }
  const schema = PILOT_SCHEMAS[schemaId]
  useBenchStore.setState({
    bench,
    draft: {
      schema,
      unsafeReason: undefined,
      meta: createDraftMeta(null)
    } as unknown as BenchStore['draft'],
    commitFailure: null
  })
}

/** 同一草稿只切 schema（模拟 0.1.18「空白草稿跟随类型选择器」的 schema 换装，bench.values 不动） */
function swapSchema(schemaId: 'minecraft:smelting' | 'minecraft:crafting_shaped'): void {
  const draft = useBenchStore.getState().draft
  useBenchStore.setState({
    draft: { ...draft, schema: PILOT_SCHEMAS[schemaId] } as unknown as BenchStore['draft']
  })
}

function numberInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('.number-input'))
}

/** 逐键模拟真实输入：对每个前缀派发 change（默认值显示态下直接 set 同值不会触发 React onChange） */
function typeNumber(input: HTMLInputElement, text: string): void {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.change(input, { target: { value: text.slice(0, i) } })
  }
}

describe('B124/D-37 熔炼标量字段界面', () => {
  beforeEach(() => {
    mountDraft('minecraft:smelting')
  })

  it('出现「经验 / 时长」两个数字输入框（不是物品槽），默认值 0 / 200 可见', () => {
    render(<PilotListEditor />)
    const inputs = numberInputs()
    expect(inputs).toHaveLength(2)
    expect(inputs[0]?.value).toBe('0')
    expect(inputs[1]?.value).toBe('200')
    expect(document.body.textContent).toContain('附加数值')
    // 物品槽列表仍归物品槽：空材料/产物不产生数量输入框
    expect(document.querySelectorAll('.pilot-qty').length).toBe(0)
  })

  it('陷阱二：只填时长 200 → 经验自动回填 0（位置占位）', () => {
    render(<PilotListEditor />)
    const inputs = numberInputs()
    typeNumber(inputs[1] as HTMLInputElement, '200')
    const values = useBenchStore.getState().bench.values
    expect(values.cookingtime).toBe(200)
    expect(values.experience).toBe(0)
  })

  it('两栏都填 0.35 / 200 → 用户值不被回填覆盖', () => {
    render(<PilotListEditor />)
    const inputs = numberInputs()
    typeNumber(inputs[0] as HTMLInputElement, '0.35')
    typeNumber(inputs[1] as HTMLInputElement, '200')
    const values = useBenchStore.getState().bench.values
    expect(values.experience).toBe(0.35)
    expect(values.cookingtime).toBe(200)
  })

  it('不填不产生垃圾参数：标量位保持空白', () => {
    render(<PilotListEditor />)
    const values = useBenchStore.getState().bench.values
    expect(values.experience).toBeUndefined()
    expect(values.cookingtime).toBeUndefined()
  })

  it('同一草稿切到 shaped schema 不出现数字框，切回后已填值保留', () => {
    const view = render(<PilotListEditor />)
    let inputs = numberInputs()
    typeNumber(inputs[0] as HTMLInputElement, '0.35')
    typeNumber(inputs[1] as HTMLInputElement, '200')

    swapSchema('minecraft:crafting_shaped')
    view.rerender(<PilotListEditor />)
    expect(document.querySelectorAll('.number-input').length).toBe(0)

    swapSchema('minecraft:smelting')
    view.rerender(<PilotListEditor />)
    inputs = numberInputs()
    expect(inputs[0]?.value).toBe('0.35')
    expect(inputs[1]?.value).toBe('200')
  })
})
