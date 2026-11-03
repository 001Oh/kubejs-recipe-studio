/**
 * FIX-03：插件加载失败时不得写入「装配成功」的 Schema 快照戳。
 *
 * 故障链（FIX-02 报告 R-2 指出，本轮已在当前代码复核）：
 *   ① 插件目录读取失败 → `listPluginFiles` 返回 `ok:false`
 *   ② `loadPlugins` 记 `loadFailure` 并**保留**插件层（FIX-02）
 *   ③ 但 `ensureSchemas` 仍无条件 `writeSnapshotStamp(key)`（`schema/service.ts:141`）
 *   ④ 下一次读取 `if (key === readSnapshotStamp()) return`（`:126`）直接短路
 *   ⑤ 目录恢复后也不会再走 provider → FIX-02 的 `failedErrorFor(path)` 重试条件永远不被触发
 *
 * 快照戳的含义只是「生效表对应当前 facts（包路径/索引规模/附属数/模组数）」，**不包含插件加载状态**，
 * 因此一次插件读取失败会被它伪装成「完整成功」。
 *
 * 本文件断言的是对外可见行为：失败期间**每次读取都应重新装配**（= 没有留下成功戳），
 * 目录恢复后**一次正常读取**即可自动恢复（不需要打开设置页 / 切包）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { trashTmp } from '../helpers/cleanup'
import type { ModpackInfo } from '@shared/types'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/fix03-snapshot-${process.pid}` }))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const ROOT = mkdtempSync(join(tmpdir(), 'fix03-'))
const PLUGIN_DIR_REL = join('.recipe-studio', 'plugins')
const TYPE_ID = 'rt:only'
const PILOT_IDS = ['minecraft:crafting_shaped', 'minecraft:crafting_shapeless', 'create:mixing']

function makePack(tag: string): string {
  return mkdtempSync(join(ROOT, `${tag}-`))
}

function pluginDirOf(pack: string): string {
  return join(pack, PLUGIN_DIR_REL)
}

function writePluginAtDir(dir: string, pluginId = 'rt-plugin'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${pluginId}.json`),
    JSON.stringify(
      {
        id: pluginId,
        name: 'FIX-03 测试插件',
        version: '1.0.0',
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

function writePlugin(pack: string, pluginId = 'rt-plugin'): void {
  writePluginAtDir(pluginDirOf(pack), pluginId)
}

/** 目录 → 同名文件：existsSync 为真，readdirSync 抛 ENOTDIR（确定性模拟"存在但读不出"） */
function breakPluginDir(pack: string): void {
  const dir = pluginDirOf(pack)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(pack, '.recipe-studio'), { recursive: true })
  writeFileSync(dir, 'not a directory', 'utf8')
}

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
  /** `五层合并完成` 的累计条数（= 发生了几次完整装配） */
  merges: () => number
  /** `插件加载完成` 的累计条数（= 真正读盘解析了几次） */
  loads: () => number
}

async function boot(pack: string): Promise<Ctx> {
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
  loader.loadPlugins(pack)
  service.invalidateSchemaSnapshot()
  await service.schemaSummaries()

  const count = (needle: string): number => logger.recentLogs(4000).filter((e) => e.message.includes(needle)).length
  return {
    state,
    loader,
    service,
    preview,
    logger,
    ids: async () => (await service.schemaSummaries()).map((s) => s.id),
    merges: () => count('五层合并完成'),
    loads: () => count('插件加载完成')
  }
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  trashTmp(H.userData)
})

beforeEach(() => {
  vi.resetModules()
})

describe('FIX-03：插件加载失败不得留下成功的 Schema 快照', () => {
  // ── T1 正常成功路径 ────────────────────────────────────────────────
  it('T1：插件加载成功时快照照常写入，稳态读取命中缓存', async () => {
    const pack = makePack('t1')
    writePlugin(pack)
    const { ids, merges, loads, loader } = await boot(pack)

    expect(await ids()).toContain(TYPE_ID)
    const m0 = merges()
    const l0 = loads()

    // 稳态：连续 3 次读取不得再次装配或再次读盘
    await ids()
    await ids()
    await ids()
    expect(merges()).toBe(m0)
    expect(loads()).toBe(l0)
    expect(loader.getPluginLoadStatus().state).toBe('ok')
  })

  // ── T2 插件加载失败 ───────────────────────────────────────────────
  it('T2：读取失败期间不得写入成功快照，每次读取都会重新装配', async () => {
    const pack = makePack('t2')
    writePlugin(pack)
    const { ids, merges, loader, preview } = await boot(pack)
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    // 制造失败：等价于一次「重新加载插件 / 打开插件页」撞上不可读目录
    breakPluginDir(pack)
    loader.loadPlugins(pack)
    expect(loader.getPluginLoadStatus().state).toBe('failed')

    // 第一次读取：应重新装配，并保留有效插件层
    const m1 = merges()
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
    expect(merges()).toBeGreaterThan(m1)

    // 核心断言：失败期间**不留下成功戳** → 第二次读取仍会重新装配
    const m2 = merges()
    await ids()
    expect(merges()).toBeGreaterThan(m2)

    // 层仍在，内置也仍在
    const after = await ids()
    expect(after).toContain(TYPE_ID)
    for (const id of PILOT_IDS) expect(after).toContain(id)
  })

  // ── T3 失败后恢复 ────────────────────────────────────────────────
  it('T3：插件目录恢复后，一次正常读取即可自动重新加载（无需打开设置页/切包）', async () => {
    const pack = makePack('t3')
    writePlugin(pack, 'before')
    const { ids, loader, preview } = await boot(pack)
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    breakPluginDir(pack)
    loader.loadPlugins(pack)
    await preview.loadSchema(TYPE_ID)
    expect(loader.getPluginLoadStatus().state).toBe('failed')

    // 恢复目录并换成不同 id 的插件
    restorePluginDir(pack)
    writePlugin(pack, 'after')

    // 关键：不再调用 loadPlugins / resetPluginLoader，只做一次正常读取
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
    expect(loader.getPluginLoadStatus().state).toBe('ok')
    expect(loader.loadPlugins(pack).map((p) => p.id)).toContain('after')

    // 恢复后快照重新可用：再读两次不应继续装配
    const m = (await import('@main/logger')).recentLogs(4000).filter((e) => e.message.includes('五层合并完成')).length
    await ids()
    await ids()
    const m2 = (await import('@main/logger')).recentLogs(4000).filter((e) => e.message.includes('五层合并完成')).length
    expect(m2).toBe(m)
  })

  // ── T4 稳态性能回归 ───────────────────────────────────────────────
  it('T4：成功路径不因新增失败检查而重复加载插件', async () => {
    const pack = makePack('t4')
    writePlugin(pack)
    const { ids, loads, merges, loader } = await boot(pack)

    const l0 = loads()
    const m0 = merges()
    for (let i = 0; i < 5; i++) await ids()
    loader.virtualItemPatterns()
    loader.pluginFieldNames()

    expect(loads()).toBe(l0)
    expect(merges()).toBe(m0)
    // 同时确认内容正确（不只看调用次数）
    expect(await ids()).toContain(TYPE_ID)
    expect(loader.virtualItemPatterns()).toEqual([])
  })

  // ── T5 整合包切换回归 ─────────────────────────────────────────────
  it('T5：A→B（B 读取失败）不误标成功；B 恢复后用 B 的插件；B→A 回到 A 的插件', async () => {
    const packA = makePack('t5a')
    writePlugin(packA, 'a-plugin')
    const packB = makePack('t5b')
    breakPluginDir(packB)

    const { state, ids, loader, preview } = await boot(packA)
    expect(await ids()).toContain(TYPE_ID)

    state.setCurrentModpack(modpack(packB))
    await preview.loadSchema(TYPE_ID)

    // 失败不得被标成 B 的成功结果
    const failed = loader.getPluginLoadStatus()
    expect(failed.state).toBe('failed')
    expect(failed.path).toBe(packB)
    expect(failed.cachedPath).toBe(packA)

    // B 恢复：一次正常读取应自动换成 B 的插件（不是继续用 A 的）
    restorePluginDir(packB)
    writePlugin(packB, 'b-plugin')
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)
    expect(loader.getPluginLoadStatus().state).toBe('ok')
    expect(loader.loadPlugins(packB).map((p) => p.id)).toContain('b-plugin')

    // B → A
    state.setCurrentModpack(modpack(packA))
    expect((await preview.loadSchema(TYPE_ID))?.source).toBe('plugin')
    expect(loader.loadPlugins(packA).map((p) => p.id)).toContain('a-plugin')
  })

  // ── T6 失败发生在不同阶段 ─────────────────────────────────────────
  it('T6a：失败发生在装配**过程中**（provider 调用期间）也不得留下成功戳', async () => {
    const pack = makePack('t6a')
    writePlugin(pack)
    const { service, ids, merges, loader, preview } = await boot(pack)
    expect((await preview.loadSchema(TYPE_ID))?.id).toBe(TYPE_ID)

    breakPluginDir(pack)
    // 只让快照失效，不主动 loadPlugins：失败只在装配内部的 provider 调用中发生
    service.invalidateSchemaSnapshot()

    await ids()
    expect(loader.getPluginLoadStatus().state).toBe('failed')

    const m1 = merges()
    await ids()
    expect(merges()).toBeGreaterThan(m1)
  })

  it('T6b：失败发生在装配**之前**（独立加载调用）时与 T2 一致', async () => {
    const pack = makePack('t6b')
    writePlugin(pack)
    const { ids, merges, loader } = await boot(pack)

    breakPluginDir(pack)
    loader.loadPlugins(pack) // 装配之前的独立失败
    expect(loader.getPluginLoadStatus().state).toBe('failed')

    const m1 = merges()
    await ids()
    await ids()
    // 每次读取都重新装配
    expect(merges()).toBeGreaterThan(m1 + 1)
  })

  // 无法可靠构造：插件加载成功、装配成功、**装配之后**才失败的窗口（需要并发注入点在 writeSnapshotStamp 之后）。
  // 该阶段目前只能通过 FIX-02 的"打开设置页"路径间接覆盖，不在本文件伪称验证。
  it.todo('T6c：装配完成之后才发生插件读取失败的时序——需并发注入点，本轮无法稳定构造')
})
