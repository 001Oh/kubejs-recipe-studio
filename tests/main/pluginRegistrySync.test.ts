/**
 * BUG-HUNT-02：插件覆盖层与 schema 注册表的同步行为（BH-004 / BH-005）。
 *
 * 背景（BUG-HUNT-01）：
 *   - BH-004：`ensureSchemas()` 会 `clearSchemas()` 清空**全部层**，却只重装 builtin + pinned；
 *             插件层一旦被清空就再也回不来（`loadPlugins` 命中缓存时不会重推）。
 *             表现：扫描完成 / 换整合包之后，插件声明的配方类型从 `schema:list` 里消失。
 *   - BH-005：`plugins:setEnabled` 只改内存开关并返回新快照，**从不通知注册表**；
 *             表里没有「按层撤销」的能力，于是关闭的插件其类型仍然生效。
 *
 * 本文件断言的是**注册表对外可见结果**（schema:list / schema:get），不是内部调用。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/bh02-plugin-${process.pid}` }))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const MODPACK_PATH = join(mkdtempSync(join(tmpdir(), 'bh02-sync-')), 'modpack')
const USER_PLUGINS = join(MODPACK_PATH, '..', 'userplugins')
const PLUGIN_ID = 'bh02-plugin'
const TYPE_ID = 'bh02:crafted'

function writePlugin(): void {
  mkdirSync(USER_PLUGINS, { recursive: true })
  writeFileSync(
    join(USER_PLUGINS, `${PLUGIN_ID}.json`),
    JSON.stringify({
      id: PLUGIN_ID,
      name: '同步测试插件',
      version: '1.0.0',
      recipeTypes: [
        {
          id: TYPE_ID,
          displayName: '同步测试类型',
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
    name: 'sync-test',
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

interface Ctx {
  loader: typeof import('@main/plugins/loader')
  service: typeof import('@main/schema/service')
  listIds: () => Promise<string[]>
}

async function boot(): Promise<Ctx> {
  vi.resetModules()
  writePlugin()
  const loader = await import('@main/plugins/loader')
  const service = await import('@main/schema/service')

  loader.resetPluginLoader()
  loader.loadPlugins(MODPACK_PATH, {
    userDir: USER_PLUGINS,
    appVersion: '0.1.0-test',
    modpack: modpackInfo() as never
  })
  service.invalidateSchemaSnapshot()

  return {
    loader,
    service,
    listIds: async () => (await service.schemaSummaries()).map((s) => s.id)
  }
}

describe('插件覆盖层与注册表同步', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('插件声明的类型能在 schema:list 里看到', async () => {
    const { listIds } = await boot()
    expect(await listIds()).toContain(TYPE_ID)
  })

  it('BH-004：注册表重建（等价于扫描完成 / 换包）后插件类型不得消失', async () => {
    const { service, listIds } = await boot()
    expect(await listIds()).toContain(TYPE_ID)

    // 触发一次完整重建：这正是 factsKey 变化时 ensureSchemas 走的路径
    service.invalidateSchemaSnapshot()

    expect(await listIds()).toContain(TYPE_ID)
  })

  it('BH-004：连续两次重建后仍然在（不是「第一次侥幸留下」）', async () => {
    const { service, listIds } = await boot()
    service.invalidateSchemaSnapshot()
    await listIds()
    service.invalidateSchemaSnapshot()

    expect(await listIds()).toContain(TYPE_ID)
  })

  it('BH-005：关闭插件后其覆盖类型必须立刻不再生效', async () => {
    const { loader, listIds } = await boot()
    expect(await listIds()).toContain(TYPE_ID)

    loader.setEnabled(PLUGIN_ID, false)

    expect(await listIds()).not.toContain(TYPE_ID)
  })

  it('BH-005：重新启用后覆盖类型恢复', async () => {
    const { loader, listIds } = await boot()
    loader.setEnabled(PLUGIN_ID, false)
    expect(await listIds()).not.toContain(TYPE_ID)

    loader.setEnabled(PLUGIN_ID, true)

    expect(await listIds()).toContain(TYPE_ID)
  })

  it('关闭插件不影响内置试点类型', async () => {
    const { loader, listIds } = await boot()
    loader.setEnabled(PLUGIN_ID, false)

    expect(await listIds()).toContain('minecraft:crafting_shapeless')
  })
})
