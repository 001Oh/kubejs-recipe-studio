/**
 * BUG-HUNT-02：`schema:pin` 的持久化契约 + `ensureSchemas` 的并发初始化行为。
 *
 * 背景（BUG-HUNT-01）：
 *   - BH-001：`schema:pin` 入参带完整 schema，handler 校验后只用 `typeId`，落盘的是注册表当前版本，
 *             **不是**调用方提交的那一份 → 钉住内容可能不等于用户所见，且回报成功。
 *   - BH-002：`ensureSchemas()` 在 `await loadPinned()` **之前**写快照戳，并发调用的第二个会立刻返回，
 *             此时生效表还是空的 → `schema:list` 返回 []，`schema:get` 返回 null。
 *
 * 本文件在 **handler 层**验证最终行为（落盘内容、并发返回值），不断言内部实现细节。
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeTypeSchema } from '@shared/types'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/p0-schema-pin-${process.pid}`,
  handler: null as null | ((event: unknown, name: unknown, req: unknown) => Promise<unknown>)
}))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: {
    handle: (_channel: string, fn: (event: unknown, name: unknown, req: unknown) => Promise<unknown>) => {
      H.handler = fn
    }
  },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const PIN_DIR = mkdtempSync(join(tmpdir(), 'bh02-pin-'))
let PIN_FILE = join(PIN_DIR, 'customRecipeTypes.json')

/** 目标类型用真实内置试点 schema，确保它在 ensureSchemas 重建后依然存在。 */
const TARGET_ID = 'minecraft:crafting_shapeless'

function submittedSchema(displayName: string): RecipeTypeSchema {
  return {
    id: TARGET_ID,
    displayName,
    modId: 'minecraft',
    modDisplayName: 'Minecraft',
    source: 'builtin',
    layoutKind: 'shapeless',
    emitTarget: null,
    slots: [{ key: 'ingredients', displayName: 'ingredients', kind: 'item', multiple: true, zone: 'input', required: true }],
    outputs: [{ key: 'result', displayName: 'result', kind: 'item', multiple: false, zone: 'output', required: true }],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

async function boot(): Promise<{ invoke: <T>(name: string, req?: unknown) => Promise<T> }> {
  vi.resetModules()
  PIN_FILE = join(mkdtempSync(join(PIN_DIR, 'run-')), 'customRecipeTypes.json')
  const registry = await import('@main/schema/registry')
  const service = await import('@main/schema/service')
  const { registerSchemaHandlers } = await import('@main/handlers/schemaHandlers')
  const { installIpc } = await import('@main/ipcRegistry')

  registry.setPinnedSchemaPath(() => PIN_FILE)
  registry.clearSchemas()
  // 不预先 putLayer：内置试点 schema 由 ensureSchemas 自己装配，避免被下一次 clearSchemas 清掉
  service.invalidateSchemaSnapshot()

  registerSchemaHandlers()
  installIpc()
  return {
    invoke: async <T>(name: string, req?: unknown): Promise<T> => (await H.handler!(null, name, req)) as T
  }
}

describe('schema:pin 的持久化契约（BH-001）', () => {
  beforeEach(() => {
    H.handler = null
  })

  it('落盘内容必须是调用方提交的那一份 schema，而不是注册表里的旧版本', async () => {
    const { invoke } = await boot()
    const submitted = submittedSchema('用户改过的名字')

    const res = await invoke<{ ok: boolean; data?: RecipeTypeSchema; error?: string }>('schema:pin', {
      typeId: submitted.id,
      schema: submitted
    })

    expect(res.ok).toBe(true)
    const persisted = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as RecipeTypeSchema[]
    const mine = persisted.find((s) => s.id === submitted.id)
    expect(mine?.displayName).toBe('用户改过的名字')
  })

  it('返回值也必须是提交的那一份（UI 据此覆盖本地状态）', async () => {
    const { invoke } = await boot()
    const submitted = submittedSchema('另一个名字')

    const res = await invoke<{ ok: boolean; data?: RecipeTypeSchema }>('schema:pin', {
      typeId: submitted.id,
      schema: submitted
    })

    expect(res.data?.displayName).toBe('另一个名字')
  })

  it('id 与 typeId 不一致时必须拒绝（不得把别人的 schema 钉到该类型上）', async () => {
    const { invoke } = await boot()
    const res = await invoke<{ ok: boolean; error?: string }>('schema:pin', {
      typeId: 'demo:other',
      schema: submittedSchema('不该被写入')
    })
    expect(res.ok).toBe(false)
  })
})

describe('ensureSchemas 并发初始化（BH-002）', () => {
  beforeEach(() => {
    H.handler = null
  })

  it('两个并发的 schema:list 都必须拿到非空结果', async () => {
    const { invoke } = await boot()

    const [a, b] = await Promise.all([
      invoke<{ ok: boolean; data?: unknown[] }>('schema:list'),
      invoke<{ ok: boolean; data?: unknown[] }>('schema:list')
    ])

    expect(Array.isArray(a.data)).toBe(true)
    expect(Array.isArray(b.data)).toBe(true)
    expect((a.data ?? []).length).toBeGreaterThan(0)
    expect((b.data ?? []).length).toBeGreaterThan(0)
    expect((b.data ?? []).length).toBe((a.data ?? []).length)
  })

  it('并发 schema:get 不得返回 null（类型确实存在）', async () => {
    const { invoke } = await boot()

    const [a, b] = await Promise.all([
      invoke<{ ok: boolean; data?: RecipeTypeSchema | null }>('schema:get', { typeId: TARGET_ID }),
      invoke<{ ok: boolean; data?: RecipeTypeSchema | null }>('schema:get', { typeId: TARGET_ID })
    ])

    expect(a.data?.id).toBe(TARGET_ID)
    expect(b.data?.id).toBe(TARGET_ID)
  })

  it('并发 schema:list 与 schema:coverage 都要看到同一个类型数', async () => {
    const { invoke } = await boot()

    const [list, cov] = await Promise.all([
      invoke<{ ok: boolean; data?: unknown[] }>('schema:list'),
      invoke<{ ok: boolean; data?: { totalTypes: number } }>('schema:coverage')
    ])

    expect(cov.data?.totalTypes).toBe((list.data ?? []).length)
  })
})
