/**
 * P3-17：两处类型/输入边界的运行时复现。
 *
 * A) modpackHandlers 的 `as never` 把 `null` 写进声明为 `lastModpackPath?: string`
 *    的恢复键 —— 运行时 getUiState() 得到 null 而非 undefined，违反 UiState 契约。
 * B) emitScript 把插件提供的 emitTarget 原样拼进生成的 JS 表达式；恶意值可注入语句。
 *    约束：合法 emitTarget 的产出必须逐字符不变（用 §一 mixing 示例锁死）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emitScript } from '@main/codegen/emitScript'
import { CREATED_AT, field, modpack, schema, statementsOf, sv, workbench } from '../codegen/helpers'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/b114-p3-17-${process.pid}`,
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

const SUGAR = 'kubejs-sugar' as const

beforeEach(() => {
  H.handler = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function bootClear(): Promise<() => Promise<{ ok: boolean; data?: unknown }>> {
  vi.resetModules()
  const { registerModpackHandlers } = await import('@main/handlers/modpackHandlers')
  const { installIpc } = await import('@main/ipcRegistry')
  registerModpackHandlers()
  installIpc()
  return async () => (await H.handler!(null, 'modpack:clear', undefined)) as { ok: boolean; data?: unknown }
}

function mixingSchema(emitTarget: string): ReturnType<typeof schema> {
  return schema({
    id: 'create:mixing',
    modId: 'create',
    layoutKind: 'multi_io',
    emitTarget,
    outputs: [field('result', 'fluid')],
    slots: [field('ingredients', 'item', { multiple: true })],
    modifiers: [{ key: 'heated', displayName: '加热', kind: 'boolean', chain: 'heated' }],
    channel: SUGAR
  })
}

function mixingBench(): ReturnType<typeof workbench> {
  return workbench({
    typeId: 'create:mixing',
    layoutKind: 'multi_io',
    values: {
      result: sv('fluid', 'minecraft:water', { amount: 500 }),
      ingredients: [sv('item', 'minecraft:dirt'), sv('item', 'minecraft:sand')]
    },
    modifiers: { heated: true }
  })
}

describe('P3-17A modpack:clear 恢复键契约', () => {
  it('清除后 lastModpackPath/Name 为 undefined（修复前被 as never 写成 null → 红）', async () => {
    const clear = await bootClear()
    const ui = await import('@main/uiStateStore')
    ui.patchUiState({ lastModpackPath: 'C:/Fake/Pack', lastModpackName: 'Fake Pack' })
    expect(ui.getUiState().lastModpackPath).toBe('C:/Fake/Pack')

    const res = await clear()
    expect(res.ok).toBe(true)
    expect(ui.getUiState().lastModpackPath).toBeUndefined()
    expect(ui.getUiState().lastModpackName).toBeUndefined()
  })
})

describe('P3-17B emitTarget 消毒', () => {
  it('合法 emitTarget 产出逐字符不变（锁死 §一 mixing 示例）', () => {
    const emit = emitScript(mixingSchema('event.recipes.create.mixing'), mixingBench(), SUGAR, modpack(), CREATED_AT)
    expect(statementsOf(emit.code)).toBe(
      [
        '  event.recipes.create.mixing(',
        "    Fluid.of('minecraft:water', 500),",
        "    ['minecraft:dirt', 'minecraft:sand']",
        '  ).heated()'
      ].join('\n')
    )
    expect(emit.error).toBeNull()
  })

  it('内置香草 target（无 emitTarget）仍生成 event.shaped（守卫）', () => {
    const vanilla = schema({
      id: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      emitTarget: null,
      outputs: [field('result', 'item')],
      channel: SUGAR
    })
    const bench = workbench({
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      gridRows: 1,
      gridCols: 1,
      values: {
        grid: [sv('item', 'minecraft:stone')],
        result: sv('item', 'minecraft:brick')
      }
    })
    const emit = emitScript(vanilla, bench, SUGAR, modpack(), CREATED_AT)
    expect(emit.statements[0]).toContain('event.shaped(')
    expect(emit.error).toBeNull()
  })

  it.each([
    'event.recipes.create.mixing; globalThis.__pwned = 1; //',
    "event['evil']; process.exit(1); //",
    'event.recipes.foo(`x${1+1}`)',
    'event.recipes.foo\n; globalThis.__pwned = 2'
  ])('非法 emitTarget 被拒并回退 event.custom，注入片段不进入代码：%s', (evilTarget) => {
    const emit = emitScript(mixingSchema(evilTarget), mixingBench(), SUGAR, modpack(), CREATED_AT)
    expect(emit.code).not.toContain('globalThis.__pwned')
    expect(emit.code).not.toContain('process.exit')
    expect(emit.code).not.toContain('`x')
    expect(emit.statements.join('\n')).toMatch(/^event\.custom\(/)
    expect(emit.error).toBeNull()
  })

  it('event.remove 与空串仍按既有语义处理（守卫）', () => {
    const removeBench = workbench({
      typeId: 'create:mixing',
      layoutKind: 'custom',
      values: { id: 'minecraft:diamond_sword' }
    })
    const removal = emitScript(mixingSchema('event.remove'), removeBench, SUGAR, modpack(), CREATED_AT)
    expect(removal.statements[0]).toBe("event.remove({ id: 'minecraft:diamond_sword' })")
    const empty = emitScript(mixingSchema(''), mixingBench(), SUGAR, modpack(), CREATED_AT)
    expect(empty.statements.join('\n')).toMatch(/^event\.custom\(/)
  })
})
