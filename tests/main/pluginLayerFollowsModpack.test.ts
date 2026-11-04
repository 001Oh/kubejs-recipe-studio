/**
 * FIX-01：换整合包后，插件层必须跟随当前包。
 *
 * 根因（本轮已核实）：`plugins/loader.ts` 的 `currentRecords()` 只在**没有缓存**时才用
 * `lastModpackPath` 加载一次；之后无论当前整合包变成谁，都直接返回旧缓存。
 * 而 `lastModpackPath` 只在 `loadPlugins()` 内更新，生产侧唯一会传入「当前包路径」的入口
 * 是 `plugins:list`（即进入设置页）。于是：
 *
 *   A 包 → 切到 B 包 → 预览 / 配方选择 / 搜索
 *     → schema 的 plugin 层来自 provider
 *     → provider → getPluginSchemaOverrides → usableRecords → currentRecords
 *     → 仍然返回 A 包的插件记录
 *
 * 本文件断言的是**对外可见结果**（`schema:list` / `preview.loadSchema` / `virtualItemPatterns`），
 * 不是源码里有没有某段字符串。测试全程**不进入设置页、不调用 `plugins:list`**。
 *
 * 注意：这里**不传 `modpack` 覆盖**给 `loadPlugins`，以与生产一致（生产 `lastOptions` 恒为 `{}`，
 * 整合包事实由 `getCurrentModpack()` 现取）。传覆盖会让 modpack 事实被冻结在首次加载时。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { trashTmp } from '../helpers/cleanup'
import type { ModpackInfo } from '@shared/types'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/fix01-plugin-${process.pid}` }))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const ROOT = mkdtempSync(join(tmpdir(), 'fix01-'))
const PACK_A = join(ROOT, 'packA')
const PACK_B = join(ROOT, 'packB')
/** 与 `shared/constants.MODPACK_PLUGIN_DIR` 一致：包作用域的插件目录 */
const PLUGIN_DIR_REL = join('.recipe-studio', 'plugins')
const TYPE_ID = 'rt:only'
const PLUGIN_ID = 'fix01-plugin'
/** 内置类型（T-117 起为原版家族 8 项；无 create 系） */
const PILOT_IDS = [
  'minecraft:crafting_shaped',
  'minecraft:crafting_shapeless',
  'minecraft:stonecutting',
  'minecraft:smithing_transform',
  'minecraft:smelting',
  'minecraft:blasting',
  'minecraft:smoking',
  'minecraft:campfire_cooking'
]

function writePluginInto(packPath: string): void {
  const dir = join(packPath, PLUGIN_DIR_REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${PLUGIN_ID}.json`),
    JSON.stringify(
      {
        id: PLUGIN_ID,
        name: '换包跟随测试插件',
        version: '1.0.0',
        recipeTypes: [
          {
            id: TYPE_ID,
            displayName: '仅 A 包存在',
            layoutKind: 'multi_io',
            slots: [{ key: 'ingredients', displayName: '材料', kind: 'item', multiple: true }]
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  )
}

function modpack(path: string): ModpackInfo {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: ['test'],
    modsDir: join(path, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: ['minecraft']
  }
}

interface Ctx {
  state: typeof import('@main/modpack/state')
  loader: typeof import('@main/plugins/loader')
  service: typeof import('@main/schema/service')
  preview: typeof import('@main/codegen/preview')
  logger: typeof import('@main/logger')
  ids: () => Promise<string[]>
}

/** 从某一包「冷启动」：装好当前包状态、加载它自己的插件、让注册表就绪。 */
async function boot(startAt: 'A' | 'B'): Promise<Ctx> {
  vi.resetModules()
  trashTmp(H.userData)
  const state = await import('@main/modpack/state')
  const index = await import('@main/recipes/recipeIndex')
  const loader = await import('@main/plugins/loader')
  const service = await import('@main/schema/service')
  const preview = await import('@main/codegen/preview')
  const logger = await import('@main/logger')

  index.buildIndex([])
  const first = startAt === 'A' ? PACK_A : PACK_B
  state.setCurrentModpack(modpack(first))
  loader.resetPluginLoader()
  // 生产侧的等价动作：启动 / 导入后有一次 loadPlugins(当前包)
  loader.loadPlugins(first)
  service.invalidateSchemaSnapshot()
  // 模拟「应用已在该包下正常用过」：注册表已就绪，换包后若不重建就会读到旧值
  await service.schemaSummaries()

  return {
    state,
    loader,
    service,
    preview,
    logger,
    ids: async () => (await service.schemaSummaries()).map((s) => s.id)
  }
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  trashTmp(H.userData)
})

// 目录构造：A 包带插件，B 包不带（其余完全对称，差异只来自插件文件）
mkdirSync(PACK_B, { recursive: true })
writePluginInto(PACK_A)

describe('FIX-01：插件层跟随当前整合包', () => {
  it('前置：A 包冷启动时能在 schema:list 看到插件专属类型', async () => {
    const { ids } = await boot('A')
    expect(await ids()).toContain(TYPE_ID)
  })

  it('前置：B 包冷启动时看不到该类型（证明差异来自包，而不是测试构造错误）', async () => {
    const { ids } = await boot('B')
    expect(await ids()).not.toContain(TYPE_ID)
  })

  it('T1：A → B（不进设置页、不调 plugins:list），A 专属插件类型不得再被使用', async () => {
    const { state, preview, ids } = await boot('A')
    expect(await ids()).toContain(TYPE_ID)

    // 换包：只迁移当前整合包状态（等价于 modpack:import 成功后的效果），不触发任何 schema/plugin IPC
    state.setCurrentModpack(modpack(PACK_B))

    // 走正式读取链路：预览取 schema（与 REM-01 同一入口 schemaById → ensureSchemas）
    const schema = await preview.loadSchema(TYPE_ID)
    expect(schema).toBeNull()

    // 内置试点类型必须仍在（不能因为换包把 builtin 也弄丢）
    const after = await ids()
    for (const id of PILOT_IDS) expect(after).toContain(id)
  })

  it('T2：B → A（不进设置页），A 的插件 Schema 必须恢复且来源为 plugin', async () => {
    const { state, preview, service } = await boot('B')
    expect(await preview.loadSchema(TYPE_ID)).toBeNull()

    state.setCurrentModpack(modpack(PACK_A))

    const schema = await preview.loadSchema(TYPE_ID)
    expect(schema).not.toBeNull()
    expect(schema?.id).toBe(TYPE_ID)
    expect(schema?.source).toBe('plugin')

    const summary = (await service.schemaSummaries()).find((s) => s.id === TYPE_ID)
    expect(summary?.source).toBe('plugin')
  })

  it('T3：换包后内置类型（原版家族）不丢失', async () => {
    const { state, ids } = await boot('A')
    state.setCurrentModpack(modpack(PACK_B))
    const after = await ids()
    for (const id of PILOT_IDS) expect(after).toContain(id)
  })

  // T4 本次不修（属既有的 Q-02 ③：插件目录读取失败会被当成「没有插件」并清空层）。
  // 按要求不以 todo/skip 掩盖，也不把它写成通过——保留为显式待办，等 Q-02 裁决后单独一批处理。
  it.todo('T4：插件目录读取失败时不得清空仍然有效的插件层（本批不修，见 Q-02）')

  it('T5：连续快速切换后，最终集合与最后选定的整合包一致', async () => {
    const { state, preview } = await boot('A')

    // 不 await 中间状态，连续切换（模拟快速换包 / 旧请求与新状态交错）
    state.setCurrentModpack(modpack(PACK_B))
    void preview.loadSchema(TYPE_ID)
    state.setCurrentModpack(modpack(PACK_A))
    void preview.loadSchema(TYPE_ID)
    state.setCurrentModpack(modpack(PACK_B))

    // 最终落在 B：类型必须不存在
    expect(await preview.loadSchema(TYPE_ID)).toBeNull()

    // 再切回 A：必须恢复（说明没有把旧结果粘住）
    state.setCurrentModpack(modpack(PACK_A))
    expect((await preview.loadSchema(TYPE_ID))?.source).toBe('plugin')
  })

  it('T6：缓存有效时不重复读取插件目录，也不重复重建注册表', async () => {
    const { loader, service, logger } = await boot('A')
    const countOf = (needle: string): number => logger.recentLogs(2000).filter((e) => e.message.includes(needle)).length

    const loadBefore = countOf('插件加载完成')
    const mergeBefore = countOf('五层合并完成')

    // 稳态：同一个包内反复查询（schema:list 与虚拟物品规则各 3 次）
    await service.schemaSummaries()
    await service.schemaSummaries()
    await service.schemaSummaries()
    loader.virtualItemPatterns()
    loader.virtualItemPatterns()
    loader.virtualItemPatterns()

    expect(countOf('插件加载完成')).toBe(loadBefore)
    expect(countOf('五层合并完成')).toBe(mergeBefore)
  })
})
