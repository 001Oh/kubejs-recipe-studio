/**
 * BUG-HUNT-02-RV1 修复 RV1-002 / RV1-003。
 *
 * RV1-002：`syncPluginLayer()` 只改 registry 的 `plugin` 层、不重建 `effective`，
 *   而 `codegen/preview.loadSchema()` 与 `recipes/selectSchema` 都是**直接 `getSchema()`** 的
 *   同步路径（不调 `ensureSchemas()`）→ 关闭插件后、下次 `schema:*` 之前仍会拿到旧 schema。
 *   本文件刻意**不调用** `schemaSummaries()` 来验证，因为那条路会顺手触发重建、掩盖问题。
 *
 * RV1-003：provider 抛错时不得把「读取失败」当成「没有插件」而清空正常层。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh02-fresh-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const MODPACK_PATH = join(mkdtempSync(join(tmpdir(), 'bh02-fresh-')), 'modpack')
const USER_PLUGINS = join(MODPACK_PATH, '..', 'userplugins')
const PLUGIN_ID = 'bh02-fresh-plugin'
const TYPE_ID = 'bh02fresh:crafted'

function writePlugin(): void {
  mkdirSync(USER_PLUGINS, { recursive: true })
  writeFileSync(
    join(USER_PLUGINS, `${PLUGIN_ID}.json`),
    JSON.stringify({
      id: PLUGIN_ID,
      name: '新鲜度测试插件',
      version: '1.0.0',
      recipeTypes: [
        {
          id: TYPE_ID,
          displayName: '新鲜度类型',
          layoutKind: 'multi_io',
          emitTarget: null,
          customTemplate: { type: TYPE_ID },
          slots: [{ key: 'ingredients', displayName: '材料', kind: 'item', multiple: true }]
        }
      ]
    }),
    'utf8'
  )
}

function modpackInfo(): Record<string, unknown> {
  return {
    path: MODPACK_PATH,
    name: 'fresh-test',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: ['test'],
    modsDir: join(MODPACK_PATH, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: ['minecraft']
  }
}

async function boot() {
  vi.resetModules()
  writePlugin()
  const registry = await import('@main/schema/registry')
  const loader = await import('@main/plugins/loader')
  const service = await import('@main/schema/service')
  const preview = await import('@main/codegen/preview')

  loader.resetPluginLoader()
  loader.loadPlugins(MODPACK_PATH, {
    userDir: USER_PLUGINS,
    appVersion: '0.1.0-test',
    modpack: modpackInfo() as never
  })
  service.invalidateSchemaSnapshot()
  await service.schemaSummaries() // 建立基线（此时插件类型必须在）
  return { registry, loader, service, preview }
}

describe('RV1-002：关闭插件后同步路径必须立刻看不到其 schema', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('基线：启用时 getSchema 与 loadSchema 都能拿到插件类型', async () => {
    const { registry, preview } = await boot()
    expect(registry.getSchema(TYPE_ID)?.source).toBe('plugin')
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
  })

  it('关闭插件后，不经过任何 schema:* 调用，getSchema 立刻返回 null', async () => {
    const { registry, loader } = await boot()

    loader.setEnabled(PLUGIN_ID, false)

    // 关键：这里没有 schemaSummaries()/schemaById()，模拟 preview / selectSchema 的直接读取
    expect(registry.getSchema(TYPE_ID)).toBeNull()
  })

  it('关闭插件后，codegen 预览用的 loadSchema 立刻返回 null', async () => {
    const { loader, preview } = await boot()

    loader.setEnabled(PLUGIN_ID, false)

    expect(await preview.loadSchema(TYPE_ID)).toBeNull()
  })

  it('关闭插件后，配方选择路径（selectSchema）不再选中插件 schema', async () => {
    const { loader } = await boot()
    const { selectSchema } = await import('@main/recipes/selectSchema')

    // 注意：generic 兜底也会把 typeId 填进 schema.id，所以只能看 source，不能看 id
    expect(selectSchema(TYPE_ID).source).toBe('plugin')

    loader.setEnabled(PLUGIN_ID, false)

    expect(selectSchema(TYPE_ID).source).toBe('generic')
  })

  it('重新启用后，同步路径立刻恢复', async () => {
    const { registry, loader } = await boot()
    loader.setEnabled(PLUGIN_ID, false)
    expect(registry.getSchema(TYPE_ID)).toBeNull()

    loader.setEnabled(PLUGIN_ID, true)

    expect(registry.getSchema(TYPE_ID)?.id).toBe(TYPE_ID)
  })

  it('关闭插件同时不影响内置试点类型', async () => {
    const { registry, loader } = await boot()
    loader.setEnabled(PLUGIN_ID, false)

    expect(registry.getSchema('minecraft:crafting_shapeless')?.id).toBe('minecraft:crafting_shapeless')
  })
})

describe('RV1-003：provider 读取失败不得清空正常插件层', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('provider 抛错时，重建后插件类型仍在（保留上一次的层）', async () => {
    const { registry, loader, service } = await boot()
    expect(registry.getSchema(TYPE_ID)?.source).toBe('plugin')

    // 让 provider 抛错，然后强制一次完整重建
    registry.setLayerProvider('plugin', () => {
      throw new Error('模拟读取插件失败')
    })
    service.invalidateSchemaSnapshot()
    await service.schemaSummaries()

    // 若把异常当成「空」，这里会变成 null
    expect(registry.getSchema(TYPE_ID)?.source).toBe('plugin')

    // 复原 provider，避免影响同进程内其他用例
    registry.setLayerProvider('plugin', loader.currentPluginOverrides)
  })

  it('provider 正常返回空数组时，按设计清空插件层（区分「确实没有」与「读取失败」）', async () => {
    const { registry, loader, service } = await boot()

    registry.setLayerProvider('plugin', () => [])
    service.invalidateSchemaSnapshot()
    await service.schemaSummaries()

    expect(registry.getSchema(TYPE_ID)).toBeNull()

    registry.setLayerProvider('plugin', loader.currentPluginOverrides)
  })

  it('syncPluginLayer 在 provider 抛错时保留旧层而不是抛错', async () => {
    const { registry, loader } = await boot()

    registry.setLayerProvider('plugin', () => {
      throw new Error('模拟读取插件失败')
    })

    expect(() => loader.syncPluginLayer()).not.toThrow()
    expect(registry.getSchema(TYPE_ID)?.source).toBe('plugin')

    registry.setLayerProvider('plugin', loader.currentPluginOverrides)
  })
})
