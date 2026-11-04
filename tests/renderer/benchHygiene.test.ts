/**
 * P3-23c/d：bench 提交链卫生（node 环境，走 zustand vanilla API，不调用 React hook）。
 * c) commitOps.same() 改结构比较——键序不影响「是否有变化」判定（旧 JSON.stringify
 *    会把同内容不同键序判成变更，灌入多余撤销快照）。
 * d) setModifier 纳入 dirtyFields（modifiers.<key>）——只改修饰符的草稿不再因
 *    dirtyFields 为空被 NO_CHANGES 拒绝（当前 UI 未暴露修饰符，属潜伏面）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { SlotValue } from '@shared/types'
import { commitOps, setKey } from '@renderer/views/bench/commitOps'
import { useBenchStore as store } from '@renderer/store/benchStore'
import { useAppStore } from '@renderer/store/appStore'
import { pc2Opened } from '../schema/pc2Fixtures'

function sv(id: string): SlotValue {
  return { kind: 'item', id, count: 1 }
}

beforeEach(() => {
  store.getState().reset()
  store.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [], logs: [] })
})

describe('P3-23c same() 结构比较', () => {
  it('同内容不同键序的写入不产生快照（修复前误判变更 → 红）', () => {
    store.setState({ bench: { ...store.getState().bench, values: { outputs: sv('minecraft:x') } } })
    expect(store.getState().past).toHaveLength(0)
    // 与当前值语义完全相同，仅键序不同（DropOp.value 的合法类型 SlotValue）
    commitOps([{ op: 'valueSet', key: 'outputs', value: { count: 1, kind: 'item', id: 'minecraft:x' } }])
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().bench.values['outputs']).toEqual(sv('minecraft:x'))
  })

  it('真实变化仍被识别：快照 + 值更新（防误伤守卫）', () => {
    store.setState({ bench: { ...store.getState().bench, values: { outputs: sv('minecraft:x') } } })
    commitOps([{ op: 'valueSet', key: 'outputs', value: sv('minecraft:y') }])
    expect(store.getState().past).toHaveLength(1)
    expect((store.getState().bench.values['outputs'] as SlotValue).id).toBe('minecraft:y')
  })

  it('嵌套对象键序同样不影响判定', () => {
    store.setState({
      bench: {
        ...store.getState().bench,
        values: { extras: { block: 'minecraft:oak', properties: { facing: 'north', half: 'top' } } }
      }
    })
    setKey('extras', { properties: { half: 'top', facing: 'north' }, block: 'minecraft:oak' })
    expect(store.getState().past).toHaveLength(0)
  })

  it('两边都是 undefined 仍判相同（canonicalStringify 抛错路径守卫）', () => {
    store.setState({ bench: { ...store.getState().bench, values: {} } })
    setKey('absent', undefined)
    expect(store.getState().past).toHaveLength(0)
  })
})

describe('P3-23d setModifier 纳入 dirtyFields', () => {
  it('有草稿时 setModifier 记 modifiers.<key> 为脏（修复前 dirtyFields 不动 → 红）', () => {
    const opened = pc2Opened('mixingChance')
    expect(store.getState().loadOpenedRecipe(opened).ok).toBe(true)
    store.getState().setModifier('heated', true)
    expect(store.getState().draft?.meta.dirtyFields).toContain('modifiers.heated')
    expect(store.getState().bench.modifiers).toEqual({ heated: true })
  })

  it('无草稿时 setModifier 不产生脏字段（守卫）', () => {
    store.getState().setModifier('heated', true)
    expect(store.getState().draft).toBeNull()
  })
})
