import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IndexSummary, ModpackInfo, RecipeRecord, SlotValue, WorkbenchState } from '@shared/types'
import type { NormalizedSchema } from '@shared/schemaModel'
import { PILOT_SCHEMAS } from '@shared/pilotSchemas'
import { normalizeRecipe } from '@shared/normalize'
import { hashRaw } from '@shared/canonicalJson'
import { computeExtrasSignature, computeModsSignature, isCacheValid, saveCacheMeta } from '@main/cache'
import { buildCacheMeta } from '@main/scanner/scanService'
import { cacheFile } from '@main/paths'
import { writeJson } from '@main/cache'
import { getCurrentSummary, patchSummaryRecipes, setCurrentModpack, setCurrentSummary } from '@main/modpack/state'
import { allRecords, clearIndex, buildIndex, lookup, queryByOutput, stats } from '@main/recipes/recipeIndex'
import { readFullRecipe } from '@main/recipes/lazy'
import { openRecipe } from '@main/recipes/openRecipe'
import { scanRecipes } from '@main/recipes/scanRecipes'
import { commitRecipe } from '@main/recipes/commitRecipe'
import { extractRecipeIo } from '@main/recipes/heuristics'
import { normalizedToDraft } from '../../src/renderer/src/store/draftBridge'
import { cleanupTmp } from '../helpers/cleanup'
import { samples } from '../schema/fixtures'

/**
 * P-C5：提交后的索引 / 查询 / 缓存一致性。
 * 这里全部使用**真实文件系统**（临时整合包目录）与**真实 index / cache / scan 模块**，
 * 只有 readFull（原始 JSON 来源）与 select（schema 选择）按需注入，避免依赖真实 jar。
 */
const H = vi.hoisted(() => ({ root: `${process.cwd()}/.vitest-tmp/pc5-${process.pid}-${Date.now()}` }))
// paths.ts 通过 electron app.getPath('userData') 取缓存根目录；测试里把它指到临时目录
vi.mock('electron', () => ({ app: { getPath: () => `${H.root}/userData`, getVersion: () => '0.1.0-test' } }))
const TMP = H.root
const SCHEMA = PILOT_SCHEMAS['minecraft:crafting_shaped'] as NormalizedSchema

function modpackAt(path: string): ModpackInfo {
  return {
    path,
    name: 'pc5',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: null,
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: ['test'],
    modsDir: join(path, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

function record(over: Partial<RecipeRecord> = {}): RecipeRecord {
  const heur = extractRecipeIo('minecraft:crafting_shaped', samples.shaped.json)
  return {
    uid: 'jar:a.jar#data/testmod/recipes/foo/bar.json',
    recipeId: 'testmod:foo/bar',
    type: 'minecraft:crafting_shaped',
    outputs: heur.outputs,
    inputs: heur.inputs,
    source: 'jar',
    sourcePath: 'a.jar#data/testmod/recipes/foo/bar.json',
    jarPath: 'a.jar',
    entryPath: 'data/testmod/recipes/foo/bar.json',
    partial: false,
    ...over
  }
}

function shapedWorkbench(): { raw: Record<string, unknown>; workbench: WorkbenchState } {
  const raw = samples.shaped.json
  const { normalized } = normalizeRecipe({
    raw,
    rawText: JSON.stringify(raw, null, 2),
    schema: SCHEMA,
    uid: record().uid,
    source: { source: 'jar', sourcePath: record().sourcePath }
  })
  const loaded = normalizedToDraft({
    record: record(),
    schema: SCHEMA,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText: JSON.stringify(raw, null, 2) },
    normalized,
    diagnostics: [],
    notes: []
  })
  if (!loaded) throw new Error('草稿建立失败')
  const cells = [...(loaded.workbench.values['grid'] as SlotValue[])]
  cells[4] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
  return { raw, workbench: { ...loaded.workbench, values: { ...loaded.workbench.values, grid: cells } } }
}

function emptySummary(recipes: IndexSummary['recipes']): IndexSummary {
  return {
    items: 0,
    namespaces: 0,
    itemElapsedMs: 0,
    missingZhNames: 0,
    placeholderIconRatio: 0,
    iconMissing: 0,
    iconMissingNoAssets: 0,
    recipes,
    cacheHit: true,
    cachePath: 'test',
    failedMods: [],
    iconWarning: false,
    timings: { itemsMs: 0, recipesMs: 0, corpusMs: 0, cacheWriteMs: 0, totalMs: 0 }
  }
}

async function makePack(name: string): Promise<string> {
  const pack = join(TMP, name)
  await fsp.mkdir(join(pack, 'mods'), { recursive: true })
  await fsp.mkdir(join(pack, 'kubejs', 'data'), { recursive: true })
  return pack
}

beforeEach(() => {
  clearIndex()
  setCurrentModpack(null)
  setCurrentSummary(null)
})

afterEach(() => {
  clearIndex()
  setCurrentModpack(null)
  setCurrentSummary(null)
})

afterEach(() => {
  cleanupTmp(TMP)
})

describe('P-C5 A/C：提交后索引与查询立即生效（真实文件系统）', () => {
  it('覆盖提交：索引替换、按产物查询、recipes:full 与 recipes:open 都读到新内容，摘要统计同步', async () => {
    const pack = await makePack('overwrite')
    const mp = modpackAt(pack)
    setCurrentModpack(mp)
    buildIndex([record()])
    setCurrentSummary(emptySummary(stats()!))

    const { raw, workbench } = shapedWorkbench()
    const result = await commitRecipe(
      {
        uid: record().uid,
        mode: 'overwrite',
        expectedRawHash: hashRaw(raw),
        expectedSchemaId: SCHEMA.id,
        expectedSchemaRevision: SCHEMA.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      { modpack: mp, readFull: async () => ({ json: raw, sourcePath: record().sourcePath }), select: () => ({ schema: SCHEMA, source: 'builtin', notes: [] }) }
    )

    // 1) 索引已更新且状态显式回报
    expect(result.indexUpdated).toBe(true)
    expect(result.indexWarning).toBeUndefined()
    // 2) 旧 uid 不再指向任何记录（已被覆盖实现取代）
    expect(lookup(record().uid)).toBeNull()
    // 3) 新 uid 可查询、recipeId 保持
    const saved = lookup(result.savedUid)
    expect(saved).not.toBeNull()
    expect(saved?.recipeId).toBe('testmod:foo/bar')
    // 4) 按产物查询立刻返回新记录（不能继续返回旧版本）
    const page = queryByOutput('ad_astra_giselle_addon:module_acid_rain_proof_unit', 0, 10)
    expect(page.items.map((r) => r.uid)).toContain(result.savedUid)
    // 5) recipes:full 路径从磁盘读到提交后的内容
    const full = await readFullRecipe(saved!)
    const json = full.json as Record<string, unknown>
    expect(json['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    expect(json['conditions']).toEqual(samples.shaped.json['conditions'])
    // 6) recipes:open 重新打开得到的就是新版本
    const opened = await openRecipe(result.savedUid)
    expect(opened.status).toBe('ok')
    expect(JSON.stringify(opened.raw?.json)).toBe(JSON.stringify(json))
    // 7) 摘要里的配方统计被刷新为索引真实值
    expect(getCurrentSummary()?.recipes?.total).toBe(stats()?.total)
    // 8) 覆盖提交不改变配方条数
    expect(stats()?.total).toBe(1)
  })

  it('另存副本：索引新增一条，摘要条数 +1', async () => {
    const pack = await makePack('copy')
    const mp = modpackAt(pack)
    setCurrentModpack(mp)
    buildIndex([record()])
    setCurrentSummary(emptySummary(stats()!))
    const { raw, workbench } = shapedWorkbench()

    const result = await commitRecipe(
      {
        uid: record().uid,
        mode: 'copy',
        expectedRawHash: null,
        expectedSchemaId: SCHEMA.id,
        expectedSchemaRevision: SCHEMA.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      { modpack: mp, readFull: async () => ({ json: raw, sourcePath: record().sourcePath }), select: () => ({ schema: SCHEMA, source: 'builtin', notes: [] }) }
    )
    expect(result.indexUpdated).toBe(true)
    expect(stats()?.total).toBe(2)
    expect(getCurrentSummary()?.recipes?.total).toBe(2)
    expect(lookup(result.savedUid)?.recipeId).toBe(result.recipeId)
  })

  it('索引更新失败：显式回报 indexWarning，文件仍在，摘要不被改写', async () => {
    const pack = await makePack('indexfail')
    const mp = modpackAt(pack)
    setCurrentModpack(mp)
    buildIndex([record()])
    setCurrentSummary(emptySummary(stats()!))
    const before = getCurrentSummary()?.recipes?.total
    const { raw, workbench } = shapedWorkbench()

    const result = await commitRecipe(
      {
        uid: record().uid,
        mode: 'overwrite',
        expectedRawHash: hashRaw(raw),
        expectedSchemaId: SCHEMA.id,
        expectedSchemaRevision: SCHEMA.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      {
        modpack: mp,
        readFull: async () => ({ json: raw, sourcePath: record().sourcePath }),
        select: () => ({ schema: SCHEMA, source: 'builtin', notes: [] }),
        upsertIndex: () => {
          throw new Error('模拟索引损坏')
        }
      }
    )
    expect(result.indexUpdated).toBe(false)
    expect(result.indexWarning).toContain('重新扫描')
    expect(result.indexWarning).toContain('模拟索引损坏')
    // 文件确实已落盘（后续重扫可恢复）
    const onDisk = JSON.parse(await fsp.readFile(result.savedPath, 'utf8')) as Record<string, unknown>
    expect(onDisk['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    // 索引仍是旧状态，摘要不被悄悄改掉
    expect(lookup(result.savedUid)).toBeNull()
    expect(getCurrentSummary()?.recipes?.total).toBe(before)
  })

  it('摘要刷新只动配方统计，物品字段保持不变', () => {
    const mp = modpackAt(join(TMP, 'summary'))
    setCurrentModpack(mp)
    const base = { ...emptySummary({ total: 1, vanilla: 1, modded: 0, kubejs: 0, partial: 0, types: 1, elapsedMs: 5 }), items: 43474, namespaces: 40 }
    setCurrentSummary(base)
    patchSummaryRecipes({ total: 9, vanilla: 8, modded: 1, kubejs: 0, partial: 2, types: 3, elapsedMs: 7 })
    const after = getCurrentSummary()
    expect(after?.items).toBe(43474)
    expect(after?.namespaces).toBe(40)
    expect(after?.recipes?.total).toBe(9)
    expect(after?.recipes?.partial).toBe(2)
  })
})

describe('P-C5 D：重启后的缓存策略（真实 meta / 真实扫描）', () => {
  it('提交写入 kubejs/data 后：items 缓存仍命中，recipes 因 extras 变化重扫，重扫结果包含已提交内容', async () => {
    const pack = await makePack('restart')
    const mp = modpackAt(pack)

    // 提交前：kubejs/data 为空 → 记录一份「上次完整扫描」的 meta
    const extrasBefore = await computeExtrasSignature(pack)
    const signature = await computeModsSignature(join(pack, 'mods'))
    await saveCacheMeta(buildCacheMeta(mp, signature, extrasBefore, { itemMs: 1000, recipeMs: 2000 }, ['items', 'recipes'], 'test'))
    await writeJson(cacheFile(pack, 'items'), [])
    await writeJson(cacheFile(pack, 'recipes'), { builtAtMs: 0, elapsedMs: 0, types: [], records: [] })

    const before = await isCacheValid(pack, signature, mp.mcVersion, mp.kubejsVersion, {
      requiredPhases: ['items', 'recipes'],
      extras: extrasBefore
    })
    expect(before.valid).toBe(true)

    // 提交：真实写入 kubejs/data/testmod/recipes/foo/bar.json
    setCurrentModpack(mp)
    buildIndex([record()])
    const { raw, workbench } = shapedWorkbench()
    const committed = await commitRecipe(
      {
        uid: record().uid,
        mode: 'overwrite',
        expectedRawHash: hashRaw(raw),
        expectedSchemaId: SCHEMA.id,
        expectedSchemaRevision: SCHEMA.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      { modpack: mp, readFull: async () => ({ json: raw, sourcePath: record().sourcePath }), select: () => ({ schema: SCHEMA, source: 'builtin', notes: [] }) }
    )

    // extras 必须是变化的（提交文件落在 kubejs/data 下，参与签名）
    const extrasAfter = await computeExtrasSignature(pack)
    expect(extrasAfter).not.toBe(extrasBefore)

    // 重启：整份缓存判定 → 失效（recipes 需重扫）；物品阶段判定 → 仍然有效（不重扫物品）
    const full = await isCacheValid(pack, signature, mp.mcVersion, mp.kubejsVersion, {
      requiredPhases: ['items', 'recipes'],
      extras: extrasAfter
    })
    expect(full.valid).toBe(false)
    expect(full.reason).toContain('数据包')
    const itemsOnly = await isCacheValid(pack, signature, mp.mcVersion, mp.kubejsVersion, {
      requiredPhases: ['items'],
      extras: extrasAfter
    })
    expect(itemsOnly.valid).toBe(true)

    // 模拟重启的配方阶段：清空内存索引后真实重扫，必须包含已提交内容
    clearIndex()
    setCurrentModpack(mp)
    const progress: string[] = []
    const s = await scanRecipes((p) => progress.push(`${p.phase}:${p.label}`), { skipPersist: true })
    expect(s.total).toBe(1)
    const rescan = allRecords()[0]
    expect(rescan?.type).toBe('minecraft:crafting_shaped')
    const reread = await readFullRecipe(rescan!)
    const json = reread.json as Record<string, unknown>
    expect(json['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    expect(json['result']).toEqual(samples.shaped.json['result'])
    expect(json['conditions']).toEqual(samples.shaped.json['conditions'])
    // 重扫后的记录能以 file: uid 打开（重启后工作台重新打开走这条路）
    const reopened = await openRecipe(rescan!.uid)
    expect(reopened.status).toBe('ok')
    expect(JSON.stringify(reopened.raw?.json)).toBe(JSON.stringify(json))
    expect(committed.savedUid.endsWith('bar.json')).toBe(true)
  })
})
