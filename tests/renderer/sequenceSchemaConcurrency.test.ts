/**
 * BUG-HUNT-03 证据补齐 BH-002（第一段：renderer 侧）。
 *
 * 原始触发点在 renderer：`SequenceEditor.tsx:153` 的 `for (...) void ensureSchema(typeId)`
 * 会一次发出 N 个并发请求。此前只有 handler 级并发测试。
 *
 * **为什么这里不是组件级测试**：项目 `vitest` 环境是 `node`，未安装 `@testing-library/react`
 * 与 `jsdom`，且本轮不允许安装依赖；同时 `tsconfig.web` 没有 `@main` 别名
 * （`tsconfig.node` 又把 `tests/renderer/**` 排除在外），渲染层测试无法直接 import 主进程模块。
 *
 * **因此分两段覆盖同一条链路**：
 *   ① 本文件：真实 `benchUiStore.ensureSchema` → 真实 `api.callOrThrow` → stub 的 preload 桥，
 *      断言「并发不丢结果、失败不污染缓存、成功后可复用、每类型只请求一次」；
 *   ② `tests/main/schemaPin.test.ts`：真实 `ipcMain` handler → `service.schemaById` → `ensureSchemas`，
 *      断言「并发初始化共享同一次组装、都拿到非空结果」。
 *
 * 两段合起来覆盖 `SequenceEditor → store → api → IPC → service → registry` 的完整路径，
 * 唯一未覆盖的是 React 渲染本身（已在 TEST-REPORT 中如实标注）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeTypeSchema } from '@shared/types'

type BridgeResult = { ok: true; data: unknown } | { ok: false; error: string; code?: string }

const H = vi.hoisted(() => ({ calls: [] as string[], result: null as unknown }))

function pilotSchema(id: string): RecipeTypeSchema {
  return {
    id,
    displayName: id,
    modId: id.split(':')[0] ?? 'minecraft',
    modDisplayName: id.split(':')[0] ?? 'minecraft',
    source: 'builtin',
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

/** SequenceEditor 会一次拉取的子步骤类型（用内置试点类型模拟多步） */
const TYPES = ['minecraft:crafting_shaped', 'minecraft:crafting_shapeless', 'create:mixing'] as const

function installBridge(handler: (name: string, req: unknown) => BridgeResult): void {
  vi.stubGlobal('window', {
    studio: {
      invoke: async (name: string, req: unknown) => {
        H.calls.push(name)
        return handler(name, req)
      },
      onEvent: () => () => undefined,
      iconUrl: () => ''
    }
  })
}

async function boot(handler?: (name: string, req: unknown) => BridgeResult) {
  vi.resetModules()
  H.calls = []
  installBridge(
    handler ??
      ((name, req) => {
        const typeId = (req as { typeId?: string } | undefined)?.typeId ?? ''
        return { ok: true, data: name === 'schema:get' ? pilotSchema(typeId) : null }
      })
  )
  const { useBenchUiStore } = await import('@renderer/views/bench/benchUiStore')
  return useBenchUiStore
}

describe('BH-002（renderer 段）：并发 ensureSchema 的行为', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('并发拉取 3 个类型：全部拿到 schema，不会出现 null', async () => {
    const store = await boot()

    const results = await Promise.all(TYPES.map((t) => store.getState().ensureSchema(t)))

    expect(results.map((s) => s?.id)).toEqual([...TYPES])
  })

  it('每个类型只发起一次请求（并发不会重复请求）', async () => {
    const store = await boot()

    await Promise.all(TYPES.map((t) => store.getState().ensureSchema(t)))

    const gets = H.calls.filter((c) => c === 'schema:get')
    expect(gets).toHaveLength(TYPES.length)
  })

  it('并发结果进入缓存：第二轮不再请求', async () => {
    const store = await boot()
    await Promise.all(TYPES.map((t) => store.getState().ensureSchema(t)))
    const before = H.calls.length

    await Promise.all(TYPES.map((t) => store.getState().ensureSchema(t)))

    expect(H.calls.length).toBe(before)
    for (const t of TYPES) expect(store.getState().schemaCache[t]).toMatchObject({ id: t })
  })

  it('初始化失败不会被永久缓存：下一次可以重试成功', async () => {
    let failOnce = true
    const store = await boot(() => {
      if (failOnce) {
        failOnce = false
        return { ok: false, error: '模拟初始化失败', code: 'IO' }
      }
      return { ok: true, data: pilotSchema(TYPES[0]) }
    })

    const first = await store.getState().ensureSchema(TYPES[0])
    expect(first).toBeNull()
    expect(store.getState().schemaCache[TYPES[0]]).toBeUndefined()

    const second = await store.getState().ensureSchema(TYPES[0])
    expect(second?.id).toBe(TYPES[0])
  })

  it('同一类型被并发请求 5 次：结果一致，无 null', async () => {
    const store = await boot()
    const target = TYPES[0]

    const results = await Promise.all(Array.from({ length: 5 }, () => store.getState().ensureSchema(target)))

    expect(results.every((r) => r?.id === target)).toBe(true)
  })
})
