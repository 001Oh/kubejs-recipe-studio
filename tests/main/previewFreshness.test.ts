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

// T-117：create:mixing 已从内置移除（Create 系等 KJS 加载机制批次），
// 「能力随包内容变化」的样本改用 L0 层的 thermal:pulverizer——
// 包里装了 thermal → L0 激活 → compatible；没装 → 该类型不在注册表 → loadSchema 返回 null。
const L0_TYPE = 'thermal:pulverizer'

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

  it('基线：packA 装了 thermal → L0 的 thermal:pulverizer 判为可结构化（compatible）', async () => {
    const { preview } = await boot()
    const schema = await preview.loadSchema(L0_TYPE)
    expect(schema?.capability).toBe('compatible')
  })

  it('切到未装 thermal 的 packB：不手动刷新，loadSchema 立刻拿不到该类型（L0 按包内容激活）', async () => {
    const { state, preview } = await boot()
    expect((await preview.loadSchema(L0_TYPE))?.capability).toBe('compatible')

    // 换包：只切 modpack（模拟 modpack:import 成功后的状态迁移），不调任何 schema IPC
    state.setCurrentModpack(modpack('C:/packs/packB', [], ['minecraft', 'kubejs']))

    expect(await preview.loadSchema(L0_TYPE)).toBeNull()
  })

  it('换包后 preview.generate 也按当前包的通道产出（不只是 loadSchema）', async () => {
    const { state, preview } = await boot()
    const workbench = {
      typeId: L0_TYPE,
      layoutKind: 'multi_io' as const,
      values: {
        inputs: [{ item: 'minecraft:stone', count: 1 }],
        outputs: [{ item: 'minecraft:cobblestone', count: 1 }]
      },
      activeSlotKey: null,
      modifiers: {}
    }
    const packed = modpack('C:/packs/packA', ['kubejs_thermal'], ['minecraft', 'kubejs', 'thermal'])

    const before = await preview.generate({ workbench, modpack: packed, hasSamples: true, createdAtMs: 1 })
    expect(before.preview.channel).toBe('datapack-json')
    expect(before.preview.typeId).toBe(L0_TYPE)

    state.setCurrentModpack(modpack('C:/packs/packB', [], ['minecraft', 'kubejs']))
    const switched = modpack('C:/packs/packB', [], ['minecraft', 'kubejs'])
    const after = await preview.generate({ workbench, modpack: switched, hasSamples: true, createdAtMs: 1 })

    // generate 内部用的 schema 必须与刚换的包一致：L0 未激活 → 无 schema → 通用通道兜底
    expect(await preview.loadSchema(L0_TYPE)).toBeNull()
    expect(after.preview.channel).toBe('event-custom')
    // 兜底路径的 preview 不带 typeId，但生成的代码里必须仍是这个类型
    expect(after.preview.code).toContain(L0_TYPE)
  })

  it('同路径但附属集合变化（重新检测）也要重建，而不是沿用旧判定', async () => {
    const { state, preview } = await boot()
    expect((await preview.loadSchema(L0_TYPE))?.capability).toBe('compatible')

    // 路径不变，只改模组清单（模拟重新检测到不同模组集合）
    state.setCurrentModpack(modpack('C:/packs/packA', [], ['minecraft', 'kubejs']))

    expect(await preview.loadSchema(L0_TYPE)).toBeNull()
  })

  it('换包失败（modpack 置空）不破坏可用性：内置原版家族 schema 仍可取到，不抛错', async () => {
    const { state, preview } = await boot()
    await preview.loadSchema(L0_TYPE)

    state.setCurrentModpack(null)

    // L0 是包内容驱动，包没了就没了；但内置原版家族不受影响
    expect(await preview.loadSchema(L0_TYPE)).toBeNull()
    const after = await preview.loadSchema('minecraft:smelting')
    expect(after?.id).toBe('minecraft:smelting')
    expect(after?.capability).toBe('compatible')
  })

  it('连续两次换包后，最终结果由最后一次的包决定', async () => {
    const { state, preview } = await boot()
    state.setCurrentModpack(modpack('C:/packs/packB', [], ['minecraft', 'kubejs']))
    expect(await preview.loadSchema(L0_TYPE)).toBeNull()

    state.setCurrentModpack(modpack('C:/packs/packC', ['kubejs_create'], ['minecraft', 'kubejs', 'create', 'thermal']))
    expect((await preview.loadSchema(L0_TYPE))?.capability).toBe('compatible')
  })
})
