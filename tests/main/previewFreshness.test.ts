/**
 * BUG-HUNT-03 修复 REM-01：换包后 preview / 配方读取必须用**当前包**的 schema。
 *
 * 根因（本轮核实）：`preview.loadSchema` 与 `recipes/selectSchema` 都是**同步直读**
 * `registry.getSchema()`，不触发 `ensureSchemas()`；只有插件开关会即时重建 `effective`。
 * 于是「换整合包 → 立刻预览/打开配方」会继续用上一个包的 `capability` / `channel` 判定
 * （它们由 `decideForSchema` 依据附属模组与样本数算出，换包后必然变化）。
 *
 * 本文件走**正式调用链**：`loadSchema` / `generate` → `service.schemaById` → `ensureSchemas`
 * → `applyMerge` → `decideForSchema`。不断言内部缓存标志。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo } from '@shared/types'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh03-rem01-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const MIXING = 'create:mixing'

function modpack(path: string, addons: string[], installedMods: string[] = ['minecraft', 'kubejs']): ModpackInfo {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: installedMods.length,
    detectedFrom: ['test'],
    modsDir: `${path}/mods`,
    hasKubejs: true,
    kubejsAddons: addons,
    installedModIds: installedMods
  }
}

async function boot() {
  vi.resetModules()
  const state = await import('@main/modpack/state')
  const index = await import('@main/recipes/recipeIndex')
  const service = await import('@main/schema/service')
  const preview = await import('@main/codegen/preview')

  index.buildIndex([])
  state.setCurrentModpack(modpack('C:/packs/packA', ['kubejs_create', 'kubejs_thermal'], ['minecraft', 'kubejs', 'create', 'thermal']))
  service.invalidateSchemaSnapshot()
  // 模拟「应用已在 packA 下正常使用过」：工作台打开时会调 schema:list，注册表因此已就绪。
  // 这样换包后若不重建，loadSchema 会**读到 packA 的旧判定**（而不是读不到东西）。
  await service.schemaSummaries()
  return { state, index, service, preview }
}

describe('REM-01：换包后 schema 立即跟随当前包', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('基线：packA 装了 create → create:mixing 判为可结构化（compatible）', async () => {
    const { preview } = await boot()
    const schema = await preview.loadSchema(MIXING)
    expect(schema?.capability).toBe('compatible')
  })

  it('切到未装 create 的 packB：不手动刷新，loadSchema 立刻判为 unsupported', async () => {
    const { state, preview } = await boot()
    expect((await preview.loadSchema(MIXING))?.capability).toBe('compatible')

    // 换包：只切 modpack（模拟 modpack:import 成功后的状态迁移），不调任何 schema IPC
    state.setCurrentModpack(modpack('C:/packs/packB', [], ['minecraft', 'kubejs']))

    const after = await preview.loadSchema(MIXING)
    expect(after?.capability).toBe('unsupported')
    expect(after?.capabilityNote).toContain('create')
  })

  it('换包后 preview.generate 也按 packB 的通道产出（不只是 loadSchema）', async () => {
    const { state, preview } = await boot()
    const workbench = {
      typeId: MIXING,
      layoutKind: 'multi_io' as const,
      values: {
        inputs: [{ item: 'minecraft:stone', count: 1 }],
        outputs: [{ item: 'minecraft:cobblestone', count: 1 }]
      },
      activeSlotKey: null,
      modifiers: {}
    }
    const packed = modpack('C:/packs/packA', ['kubejs_create'], ['minecraft', 'kubejs', 'create'])

    const before = await preview.generate({ workbench, modpack: packed, hasSamples: true, createdAtMs: 1 })
    expect(before.preview.channel).toBe('datapack-json')
    expect(before.preview.typeId).toBe(MIXING)

    state.setCurrentModpack(modpack('C:/packs/packB', [], ['minecraft', 'kubejs']))
    const switched = modpack('C:/packs/packB', [], ['minecraft', 'kubejs'])
    const after = await preview.generate({ workbench, modpack: switched, hasSamples: true, createdAtMs: 1 })

    // generate 内部用的 schema 必须与刚换的包一致：与 loadSchema 的判定对齐
    const itsSchema = await preview.loadSchema(MIXING)
    expect(after.preview.typeId).toBe(MIXING)
    expect(itsSchema?.capability).toBe('unsupported')
    expect(after.preview.channel).toBe(itsSchema?.channel)
  })

  it('同路径但附属集合变化（重新检测）也要重建，而不是沿用旧判定', async () => {
    const { state, preview } = await boot()
    expect((await preview.loadSchema(MIXING))?.capability).toBe('compatible')

    // 路径不变，只改模组清单（模拟重新检测到不同模组集合）
    state.setCurrentModpack(modpack('C:/packs/packA', [], ['minecraft', 'kubejs']))

    expect((await preview.loadSchema(MIXING))?.capability).toBe('unsupported')
  })

  it('换包失败（modpack 置空）不破坏可用性：内置 schema 仍可取到，不抛错', async () => {
    const { state, preview } = await boot()
    await preview.loadSchema(MIXING)

    state.setCurrentModpack(null)

    const after = await preview.loadSchema(MIXING)
    expect(after?.id).toBe(MIXING)
    expect(after?.capability).toBe('unsupported')
  })

  it('连续两次换包后，最终结果由最后一次的包决定', async () => {
    const { state, preview } = await boot()
    state.setCurrentModpack(modpack('C:/packs/packB', [], ['minecraft', 'kubejs']))
    expect((await preview.loadSchema(MIXING))?.capability).toBe('unsupported')

    state.setCurrentModpack(modpack('C:/packs/packC', ['kubejs_create'], ['minecraft', 'kubejs', 'create']))
    expect((await preview.loadSchema(MIXING))?.capability).toBe('compatible')
  })
})
