/**
 * FIX-02：插件目录**读取失败**不得被当成「没有插件」，从而清空仍然有效的插件层。
 *
 * 修复前的链路（已核实）：
 *   `listPluginFiles()` 对「目录不存在」(:108) 与「readdir 抛异常」(:112-115) 都返回 `[]`
 *     → `loadPlugins()` 无法区分「失败」与「成功但为空」
 *     → 照常写入 cache 并调用 `syncPluginLayer()` (:253,:258)
 *     → `replaceLayer('plugin', [])` (:295) 把整层清空
 *   `fetchLayer()` 的失败保护只在 **provider 抛异常** 时生效，这里 provider 正常返回 `[]`，
 *   所以保护不触发（`registry.ts:117-123`）。
 *
 * 本文件断言的是**对外可见结果**（`schema:list` / `preview.loadSchema` / `virtualItemPatterns`）
 * 与新增的加载状态，不是源码里的字符串。三种状态必须可区分：
 *   A 目录不存在  → 合法空（视为没有插件）
 *   B 读取失败    → **失败**，保留上一次有效插件层，可重试
 *   C 读取成功但为空 → 合法空（并清掉应当删除的旧插件）
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { trashTmp } from '../helpers/cleanup'
import type { ModpackInfo } from '@shared/types'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/fix02-plugin-${process.pid}` }))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const ROOT = mkdtempSync(join(tmpdir(), 'fix02-'))
const PLUGIN_DIR_REL = join('.recipe-studio', 'plugins')
const TYPE_ID = 'rt:only'
const PATTERN = 'foo:bar/*'
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

/** 新建一个整合包目录（默认**不带**插件目录） */
function makePack(tag: string): string {
  const dir = mkdtempSync(join(ROOT, `${tag}-`))
  return dir
}

function pluginDirOf(pack: string): string {
  return join(pack, PLUGIN_DIR_REL)
}

/** 往指定目录写入一个合法插件（声明 TYPE_ID + 一条虚拟物品通配） */
function writePluginAtDir(dir: string, pluginId = 'rt-plugin'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${pluginId}.json`),
    JSON.stringify(
      {
        id: pluginId,
        name: 'FIX-02 测试插件',
        version: '1.0.0',
        virtualItemPatterns: [PATTERN],
        recipeTypes: [
          {
            id: TYPE_ID,
            displayName: '插件专属类型',
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

/** 写入包内嵌插件 */
function writePlugin(pack: string, pluginId = 'rt-plugin'): void {
  writePluginAtDir(pluginDirOf(pack), pluginId)
}

/** 让插件目录**存在但不可读**：把目录替换成同名文件 → readdirSync 必抛 ENOTDIR */
function breakPluginDir(pack: string): void {
  const dir = pluginDirOf(pack)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(pack, '.recipe-studio'), { recursive: true })
  writeFileSync(dir, 'not a directory', 'utf8')
}

/** 恢复成可读目录（可再写入真实插件） */
function restorePluginDir(pack: string): void {
  const dir = pluginDirOf(pack)
  rmSync(dir, { force: true })
  mkdirSync(dir, { recursive: true })
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

/** 冷启动到某个包：装好会话状态、加载它自己的插件、让注册表就绪 */
async function boot(pack: string, options: { userDir?: string | null } = {}): Promise<Ctx> {
  vi.resetModules()
  trashTmp(H.userData)
  const state = await import('@main/modpack/state')
  const index = await import('@main/recipes/recipeIndex')
  const loader = await import('@main/plugins/loader')
  const service = await import('@main/schema/service')
  const preview = await import('@main/codegen/preview')
  const logger = await import('@main/logger')

  index.buildIndex([])
  state.setCurrentModpack(modpack(pack))
  loader.resetPluginLoader()
  loader.loadPlugins(pack, options)
  service.invalidateSchemaSnapshot()
  await service.schemaSummaries()

  return { state, loader, service, preview, logger, ids: async () => (await service.schemaSummaries()).map((s) => s.id) }
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  trashTmp(H.userData)
})

beforeEach(() => {
  vi.resetModules()
})

describe('FIX-02：插件目录读取失败不得清空插件层', () => {
  // ── 状态 A：目录不存在 ──────────────────────────────────────────────
  it('T1：目录不存在 = 合法空（不是失败），且不抛异常', async () => {
    const pack = makePack('t1')
    const { loader, ids } = await boot(pack)

    const list = await ids()
    expect(list).toEqual(expect.arrayContaining(PILOT_IDS))
    expect(list).toHaveLength(PILOT_IDS.length)
    // 合法空 ≠ 失败
    expect(loader.getPluginLoadStatus().state).toBe('ok')
  })

  // ── 状态 C：目录存在、读取成功、但没有插件 ─────────────────────────
  it('T2：空目录 = 合法空，并清掉应当删除的旧插件（与失败明确区分）', async () => {
    const withPlugin = makePack('t2a')
    writePlugin(withPlugin)
    const { state, ids } = await boot(withPlugin)
    expect(await ids()).toContain(TYPE_ID)

    const emptyPack = makePack('t2b')
    mkdirSync(pluginDirOf(emptyPack), { recursive: true })

    state.setCurrentModpack(modpack(emptyPack))
    const after = await ids()
    expect(after).not.toContain(TYPE_ID)
    expect(after).toEqual(expect.arrayContaining(PILOT_IDS))
  })

  // ── 状态 B：目录存在但读取失败 ─────────────────────────────────────
  it('T3：读取失败时必须保留有效插件层，并明确记录失败', async () => {
    const pack = makePack('t3')
    writePlugin(pack)
    const { loader, preview } = await boot(pack)
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    // 目录 → 同名文件：existsSync 仍为真，readdirSync 抛 ENOTDIR
    breakPluginDir(pack)
    // 等价于「任何一次触发加载的动作」（打开设置页 / 换包后的首次取数）
    loader.loadPlugins(pack)

    // 核心断言 1：失败不得清空插件层
    const afterBreak = await preview.loadSchema(TYPE_ID)
    expect(afterBreak?.id).toBe(TYPE_ID)

    // 核心断言 2：失败不能被当成「成功的空列表」
    const status = loader.getPluginLoadStatus()
    expect(status.state).toBe('failed')
    expect(status.error).not.toBeNull()
    expect(String(status.error)).toContain('ENOTDIR')
  })

  // ── 失败后恢复 ────────────────────────────────────────────────────
  it('T4：失败后恢复读取，必须能重新尝试并让新插件生效', async () => {
    const pack = makePack('t4')
    writePlugin(pack, 'before')
    const { loader, preview } = await boot(pack)
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    // 先制造失败（等价于一次「重新加载插件」撞上不可读目录）
    breakPluginDir(pack)
    loader.loadPlugins(pack)
    expect(loader.getPluginLoadStatus().state).toBe('failed')

    // 恢复目录，并换成一个**不同 id** 的插件，确保能分辨「新列表真的生效了」
    restorePluginDir(pack)
    writePlugin(pack, 'after')

    // 不调用 resetPluginLoader：只靠正常读取链路自动重试
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
    expect(loader.getPluginLoadStatus().state).toBe('ok')

    const listed = loader.loadPlugins(pack).map((p) => p.id)
    expect(listed).toContain('after')
    expect(listed).not.toContain('before')
  })

  // ── 跨整合包失败 ─────────────────────────────────────────────────
  it('T5：A → B 且 B 读取失败：不得把 B 标记为成功，也不得清空 A 的有效数据', async () => {
    const packA = makePack('t5a')
    writePlugin(packA)
    const packB = makePack('t5b')
    breakPluginDir(packB)

    const { state, loader, preview } = await boot(packA)
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    state.setCurrentModpack(modpack(packB))

    // 核心断言：B 读取失败时，旧实现会把插件层清空（类型消失）
    const duringFailure = await preview.loadSchema(TYPE_ID)
    expect(duringFailure?.id).toBe(TYPE_ID)

    const status = loader.getPluginLoadStatus()
    console.log("[DBG-T5]", JSON.stringify(status), "currentPath=", state.getCurrentModpack()?.path)
    // 失败状态必须明确，且指向 B
    expect(status.state).toBe('failed')
    expect(status.path).toBe(packB)
    // 缓存里的数据仍属于 A —— 这是「保留上一次有效数据」，不是「B 的成功结果」
    expect(status.cachedPath).toBe(packA)

    // B 恢复后必须能加载 B 自己的插件。
    // 注意（本轮已核实的局限）：这次失败发生在 ensureSchemas 装配**内部**，
    // 装配结束时仍会 writeSnapshotStamp，因此被动读取不会自动重试；
    // 恢复需要一次加载触发（打开插件页 / 重新加载 / 换包），这里用后者等价动作。
    restorePluginDir(packB)
    writePlugin(packB, 'b-plugin')
    loader.loadPlugins(packB)

    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
    expect(loader.getPluginLoadStatus().state).toBe('ok')
    expect(loader.getPluginLoadStatus().path).toBe(packB)
    expect(loader.loadPlugins(packB).map((p) => p.id)).toContain('b-plugin')
  })

  // ── FIX-01 回归 ───────────────────────────────────────────────────
  it('T6：FIX-01 行为不回归（A↔B 切换、内置保留、虚拟通配跟随、稳态不重复加载）', async () => {
    const packA = makePack('t6a')
    writePlugin(packA)
    const packB = makePack('t6b') // 没有插件目录 → 合法空

    const { state, loader, logger, ids, preview } = await boot(packA)
    expect(await ids()).toContain(TYPE_ID)
    expect(loader.virtualItemPatterns()).toEqual([PATTERN])

    state.setCurrentModpack(modpack(packB))
    expect(await ids()).not.toContain(TYPE_ID)
    expect(loader.virtualItemPatterns()).toEqual([])
    for (const id of PILOT_IDS) expect(await ids()).toContain(id)

    state.setCurrentModpack(modpack(packA))
    expect((await preview.loadSchema(TYPE_ID))?.source).toBe('plugin')
    expect(loader.virtualItemPatterns()).toEqual([PATTERN])

    // 稳态：连续读取不得重复加载插件
    const countLoads = (): number => logger.recentLogs(2000).filter((e) => e.message.includes('插件加载完成')).length
    const before = countLoads()
    await ids()
    await ids()
    loader.virtualItemPatterns()
    expect(countLoads()).toBe(before)
  })

  // ── 异常边界 ─────────────────────────────────────────────────────
  it('T7a：用户插件目录不可读时同样按失败处理（不静默变成空列表，也不清空层）', async () => {
    const pack = makePack('t7a') // 包内无插件：唯一来源是 userDir
    const userDir = mkdtempSync(join(ROOT, 't7a-user-'))
    writePluginAtDir(userDir, 'u-plugin')

    const { loader, preview } = await boot(pack, { userDir })
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    // userDir → 同名文件：existsSync 为真、readdirSync 抛 ENOTDIR
    rmSync(userDir, { recursive: true, force: true })
    writeFileSync(userDir, 'not a directory', 'utf8')
    loader.loadPlugins(pack, { userDir })

    // 核心断言：层不得被清空
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
    const status = loader.getPluginLoadStatus()
    expect(status.state).toBe('failed')
    expect(String(status.error)).toContain('ENOTDIR')
  })

  it('T7b：单个插件文件解析失败只影响它自己，不清空其它可用插件', async () => {
    const pack = makePack('t7b')
    writePlugin(pack, 'good')
    const dir = pluginDirOf(pack)
    writeFileSync(join(dir, 'broken.json'), '{ "id": "broken", "name": ', 'utf8')

    const { loader, ids } = await boot(pack)
    // 坏文件不阻断加载（既有语义），好插件仍然生效
    expect(await ids()).toContain(TYPE_ID)
    const listed = loader.loadPlugins(pack)
    expect(listed.map((p) => p.status).sort()).toEqual(['failed', 'loaded'])
    expect(loader.getPluginLoadStatus().state).toBe('ok')
  })

  // T7c：statSync（文件元数据）失败无法在纯 Node 测试里稳定构造——
  // 需要「文件存在但 stat 失败」的平台级条件（句柄锁定 / ACL），本轮不做也不伪称通过。
  it.todo('T7c：文件元数据（statSync）异常时的行为——需平台级条件，本轮无法稳定构造')
})
