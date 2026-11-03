/**
 * P0-R2：`schema:pin` 的**语义**校验（FIX-09）。
 *
 * 背景：旧 `assertPinnable` 只校验「是数组 / 是字符串」这类结构，因此
 *   - `layoutKind` 写成任意字符串、
 *   - 槽位 `key` 为空、
 *   - 槽位 `kind` 拼错（不在 FieldKind 值域）、
 *   - 同一层出现重复 `key`
 * 都会被写入 `customRecipeTypes.json`，污染钉住层，且下次启动重建时也不报错。
 *
 * 本文件在 **handler 层**断言最终行为：非法输入必须被拒（`ok:false` + 点名原因），
 * 且**不得落盘**；合法输入必须照常成功（回归）。
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/fix09-pin-${process.pid}`,
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

const PIN_DIR = mkdtempSync(join(tmpdir(), 'fix09-pin-'))
let PIN_FILE = join(PIN_DIR, 'customRecipeTypes.json')

/** 目标类型用真实内置试点 schema，确保它在 ensureSchemas 重建后依然存在。 */
const TARGET_ID = 'minecraft:crafting_shapeless'

const slot = (key: string, kind: RecipeSlotSchema['kind'] = 'item'): RecipeSlotSchema => ({
  key,
  displayName: key,
  kind,
  multiple: false,
  zone: 'input',
  required: true
})

function validSchema(): RecipeTypeSchema {
  return {
    id: TARGET_ID,
    displayName: '合法 schema',
    modId: 'minecraft',
    modDisplayName: 'Minecraft',
    source: 'builtin',
    layoutKind: 'shapeless',
    emitTarget: null,
    slots: [slot('ingredients')],
    outputs: [{ ...slot('result'), zone: 'output' }],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

interface Ctx {
  invoke: <T>(name: string, req?: unknown) => Promise<T>
}

async function boot(): Promise<Ctx> {
  vi.resetModules()
  PIN_FILE = join(mkdtempSync(join(PIN_DIR, 'run-')), 'customRecipeTypes.json')
  const registry = await import('@main/schema/registry')
  const service = await import('@main/schema/service')
  const { registerSchemaHandlers } = await import('@main/handlers/schemaHandlers')
  const { installIpc } = await import('@main/ipcRegistry')

  registry.setPinnedSchemaPath(() => PIN_FILE)
  registry.clearSchemas()
  service.invalidateSchemaSnapshot()

  registerSchemaHandlers()
  installIpc()
  return {
    invoke: async <T>(name: string, req?: unknown): Promise<T> => (await H.handler!(null, name, req)) as T
  }
}

interface PinResult {
  ok: boolean
  data?: RecipeTypeSchema
  error?: string
}

function persisted(): RecipeTypeSchema[] {
  if (!existsSync(PIN_FILE)) return []
  return JSON.parse(readFileSync(PIN_FILE, 'utf8')) as RecipeTypeSchema[]
}

describe('P0-R2：schema:pin 的语义校验', () => {
  beforeEach(() => {
    H.handler = null
  })

  it('回归：合法 schema 仍能钉住并落盘', async () => {
    const { invoke } = await boot()
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: validSchema() })
    expect(res.ok).toBe(true)
    expect(persisted().some((s) => s.id === TARGET_ID)).toBe(true)
  })

  it('layoutKind 不在值域内 → 拒绝并点名 layoutKind，且不落盘', async () => {
    const { invoke } = await boot()
    const bad = { ...validSchema(), layoutKind: 'grid' as unknown as RecipeTypeSchema['layoutKind'] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })

    expect(res.ok).toBe(false)
    expect(String(res.error)).toContain('layoutKind 非法')
    expect(persisted().some((s) => s.id === TARGET_ID)).toBe(false)
  })

  it('槽位 key 为空 → 拒绝并点名 key，且不落盘', async () => {
    const { invoke } = await boot()
    const bad = { ...validSchema(), slots: [{ ...slot('x'), key: '   ' }] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })

    expect(res.ok).toBe(false)
    expect(String(res.error)).toContain('缺少非空 key')
    expect(persisted().some((s) => s.id === TARGET_ID)).toBe(false)
  })

  it('槽位 kind 不在 FieldKind 值域 → 拒绝并给出允许值', async () => {
    const { invoke } = await boot()
    const bad = { ...validSchema(), slots: [slot('ingredients', 'itemz' as RecipeSlotSchema['kind'])] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })

    expect(res.ok).toBe(false)
    expect(String(res.error)).toContain('.kind 非法')
    expect(String(res.error)).toContain('item')
    expect(persisted().some((s) => s.id === TARGET_ID)).toBe(false)
  })

  it('同一层出现重复 key → 拒绝并点名重复项', async () => {
    const { invoke } = await boot()
    const bad = { ...validSchema(), slots: [slot('ingredients'), slot('ingredients')] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })

    expect(res.ok).toBe(false)
    expect(String(res.error)).toContain('重复 key')
    expect(String(res.error)).toContain('ingredients')
    expect(persisted().some((s) => s.id === TARGET_ID)).toBe(false)
  })

  it('outputs 同样校验（不是只查 slots）', async () => {
    const { invoke } = await boot()
    const bad = { ...validSchema(), outputs: [slot('result', 'nope' as RecipeSlotSchema['kind'])] }
    const res = await invoke<PinResult>('schema:pin', { typeId: TARGET_ID, schema: bad })

    expect(res.ok).toBe(false)
    expect(String(res.error)).toContain('outputs[0].kind 非法')
    expect(persisted().some((s) => s.id === TARGET_ID)).toBe(false)
  })
})
