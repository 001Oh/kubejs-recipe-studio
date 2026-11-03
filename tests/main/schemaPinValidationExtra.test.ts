/**
 * T-10 / T-06 补充：`schema:pin` 语义校验的**边界补测**。
 *
 * 既有 `schemaPinValidation.test.ts` 已覆盖：layoutKind 越界、key 为空、kind 越界、
 * 同层重复 key、outputs 同样校验、合法回归。本文件只补它没覆盖的三类：
 * ① `slots` / `outputs` 不是数组（结构层缺失，不是值域问题）
 * ② 整个 `schema` 缺失
 * ③ **跨层同 key 必须允许** —— `slots` 与 `outputs` 各有 `result` 是合法布局，
 *    若去重用的 Set 跨层共享就会被误杀（假阳性），这条是防回归的关键。
 *
 * 本文件为**新增**，不修改任何既有测试文件。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/t06-pin-extra-${process.pid}`,
  handler: null as null | ((event: unknown, name: unknown, req: unknown) => Promise<unknown>)
}))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: {
    handle: (_c: string, fn: (event: unknown, name: unknown, req: unknown) => Promise<unknown>) => {
      H.handler = fn
    }
  },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const PIN_DIR = mkdtempSync(join(tmpdir(), 't06-pin-extra-'))
const TARGET_ID = 'minecraft:crafting_shapeless'

const slot = (key: string, zone: 'input' | 'output' = 'input'): RecipeSlotSchema => ({
  key,
  displayName: key,
  kind: 'item',
  multiple: false,
  zone
})

function base(): RecipeTypeSchema {
  return {
    id: TARGET_ID,
    displayName: 'T-06 边界',
    modId: 'minecraft',
    modDisplayName: 'Minecraft',
    source: 'builtin',
    layoutKind: 'shapeless',
    emitTarget: null,
    slots: [slot('ingredients')],
    outputs: [slot('result', 'output')],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

interface PinResult {
  ok: boolean
  error?: string
  code?: string
}

type Invoke = <T>(name: string, req?: unknown) => Promise<T>

async function boot(): Promise<Invoke> {
  vi.resetModules()
  const pinFile = join(mkdtempSync(join(PIN_DIR, 'run-')), 'customRecipeTypes.json')
  const registry = await import('@main/schema/registry')
  const service = await import('@main/schema/service')
  const { registerSchemaHandlers } = await import('@main/handlers/schemaHandlers')
  const { installIpc } = await import('@main/ipcRegistry')
  registry.setPinnedSchemaPath(() => pinFile)
  registry.clearSchemas()
  service.invalidateSchemaSnapshot()
  registerSchemaHandlers()
  installIpc()
  return async <T>(name: string, req?: unknown): Promise<T> =>
    (await H.handler!(null, name, req)) as T
}

describe('T-06：schema:pin 结构层边界（补充）', () => {
  beforeEach(() => {
    H.handler = null
  })

  it('slots 不是数组 → 拒绝，且点名 slots / outputs', async () => {
    const invoke = await boot()
    const bad = { ...base(), slots: 'not-an-array' } as unknown as RecipeTypeSchema
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toMatch(/slots \/ outputs 必须是数组/)
  })

  it('outputs 不是数组 → 拒绝', async () => {
    const invoke = await boot()
    const bad = { ...base(), outputs: null } as unknown as RecipeTypeSchema
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })
    expect(res.ok).toBe(false)
  })

  it('schema 完全缺失 → 拒绝并说明需要完整 schema 对象', async () => {
    const invoke = await boot()
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID })
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toMatch(/需要完整的 schema 对象/)
  })

  it('跨层同 key（slots 与 outputs 都有 result）必须被允许——去重不得跨层共享', async () => {
    const invoke = await boot()
    const okSchema = { ...base(), slots: [slot('result')], outputs: [slot('result', 'output')] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: okSchema })
    expect(res.ok).toBe(true)
  })

  it('同层重复 key 仍被拒（回归既有行为，确认补充用例没有放松校验）', async () => {
    const invoke = await boot()
    const bad = { ...base(), slots: [slot('dup'), slot('dup')] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toMatch(/重复 key/)
  })
})
