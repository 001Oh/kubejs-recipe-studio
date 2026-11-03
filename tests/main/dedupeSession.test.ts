/**
 * P3-4：dedupe 会话跨包/卸载不清（clearSession 生产零调用、签名不含包身份）。
 * 修复：换包（导入成功）与卸载（modpack:clear）时清空会话；rememberGeneration 加上界。
 * 修复前：卸载/换包后 findDuplicate 仍命中 → 「与已生成的配方重复」误报。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchState } from '@shared/types'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/b113-dedupe-${process.pid}`,
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

function workbench(typeId = 'minecraft:crafting_shaped'): WorkbenchState {
  return {
    typeId,
    layoutKind: 'shaped',
    gridRows: 1,
    gridCols: 1,
    values: { grid: [{ kind: 'item', id: 'minecraft:stone', count: 1 }], outputs: [{ kind: 'item', id: 'minecraft:brick', count: 1 }] },
    activeSlotKey: null,
    modifiers: {}
  }
}

function makePackDir(no: number): string {
  const pack = join(H.userData, `packs`, `case-${no}`)
  mkdirSync(join(pack, 'mods'), { recursive: true })
  mkdirSync(join(pack, 'kubejs', 'server_scripts'), { recursive: true })
  writeFileSync(join(pack, 'kubejs', 'server_scripts', 'stub.js'), '// stub\n')
  return pack
}

beforeEach(() => {
  H.handler = null
})

async function boot(): Promise<(name: string, req?: unknown) => Promise<{ ok: boolean; data?: unknown; error?: string }>> {
  vi.resetModules()
  const { registerModpackHandlers } = await import('@main/handlers/modpackHandlers')
  const { installIpc } = await import('@main/ipcRegistry')
  registerModpackHandlers()
  installIpc()
  return async (name, req) => (await H.handler!(null, name, req)) as { ok: boolean; data?: unknown; error?: string }
}

describe('P3-4 dedupe 会话随包生命周期清理', () => {
  it('卸载（modpack:clear）后 findDuplicate 不再命中（修复前仍命中 → 红）', async () => {
    const invoke = await boot()
    const dedupe = await import('@main/codegen/dedupe')
    const wb = workbench()
    dedupe.rememberGeneration(wb, 'pack_a_recipe.js')
    expect(dedupe.findDuplicate(wb)).not.toBeNull()

    const res = await invoke('modpack:clear')
    expect(res.ok).toBe(true)
    expect(dedupe.findDuplicate(wb)).toBeNull()
  })

  it('换包（导入成功）后 findDuplicate 不再命中（修复前仍命中 → 红）', async () => {
    const invoke = await boot()
    const dedupe = await import('@main/codegen/dedupe')
    const wb = workbench()
    dedupe.rememberGeneration(wb, 'pack_a_recipe.js')

    const res = await invoke('modpack:import', { path: makePackDir(1) })
    expect(res.ok).toBe(true)
    expect((res.data as { info?: unknown } | undefined)?.info).toBeTruthy()

    expect(dedupe.findDuplicate(wb)).toBeNull()
  })

  it('会话有上界：大量生成不无界增长（修复前无界 → 红）', async () => {
    const dedupe = await import('@main/codegen/dedupe')
    for (let i = 0; i < 260; i += 1) {
      dedupe.rememberGeneration(workbench(`test:type_${i}`), `f_${i}.js`)
    }
    const n = dedupe.sessionGenerations().length
    expect(n).toBeLessThanOrEqual(200)
    expect(n).toBeGreaterThan(0)
  })
})
