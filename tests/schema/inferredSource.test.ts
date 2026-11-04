/**
 * B120/D-05：L1 推断引擎接线。
 *
 * `schema/infer.ts` 299 行此前全仓零调用；本单新建 `inferredSource.ts`：
 * 构建产物 `putMany('inferred', …)` + `applyMerge` 并入五层合并；结果带签名落盘
 * `inferred-schemas.json`（命中 ≤1s）；后台串行构建（进度 phase:'schema'）。
 * 一并解决 116 批遗留.2：`readInferredShapes` 无失效判定 → 签名不匹配返回 null。
 *
 * 单元用例：合成索引（散文件源）→ 构建 → 注册表出现 inferred schema → 缓存命中不再读样本
 * → restoreInferredLayer 在 clearSchemas 后回填。真实包用例（RUN_REAL_PACK=1）：
 * 首建 ≤60s、命中 ≤1s、选择器 ≥350 行逐行中文名、5 个高频类型有表单。
 */
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RecipeRecord } from '@shared/types'
import { buildIndex, clearIndex } from '@main/recipes/recipeIndex'
import { applyMerge, clearSchemas, getSchema, setPinnedSchemaPath } from '@main/schema/registry'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/infer-userdata-${process.pid}`,
  modpack: null as { path: string } | null
}))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))
vi.mock('@main/modpack/state', () => ({ getCurrentModpack: () => H.modpack }))

let dir = ''
let pinnedDir = ''

const SHAPED_JSON = {
  type: 'test:shaped',
  pattern: ['XX', 'XX'],
  key: { X: { item: 'minecraft:iron_ingot' } },
  result: { item: 'minecraft:iron_bucket' }
}
const MACHINE_JSON = {
  type: 'test:machine',
  input: { item: 'minecraft:cobblestone' },
  count: 4,
  result: { item: 'minecraft:stone' }
}

async function writeSample(type: 'shaped' | 'machine', index: number): Promise<string> {
  const file = join(dir, `${type}-${index}.json`)
  await fsp.writeFile(file, JSON.stringify(type === 'shaped' ? SHAPED_JSON : MACHINE_JSON), 'utf8')
  return file
}

function recordOf(abs: string, type: string, index: number): RecipeRecord {
  return {
    uid: `file:${abs.replace(/\\/g, '/')}`,
    recipeId: `test:${type}-${index}`,
    type,
    outputs: [],
    inputs: [],
    source: 'datapack',
    sourcePath: abs.replace(/\\/g, '/'),
    partial: false
  }
}

beforeAll(async () => {
  dir = await fsp.mkdtemp(join(tmpdir(), 'kjs-infer-'))
  pinnedDir = await fsp.mkdtemp(join(tmpdir(), 'kjs-infer-pinned-'))
  setPinnedSchemaPath(() => join(pinnedDir, 'customRecipeTypes.json'))
  H.modpack = { path: 'E:/no-such-pack-d05' }
})

afterAll(async () => {
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  await fsp.rm(pinnedDir, { recursive: true, force: true }).catch(() => undefined)
})

async function seedIndex(): Promise<void> {
  clearIndex()
  clearSchemas()
  const records: RecipeRecord[] = []
  for (let i = 0; i < 12; i += 1) {
    const abs = await writeSample('shaped', i)
    records.push(recordOf(abs, 'test:shaped', i))
  }
  for (let i = 0; i < 5; i += 1) {
    const abs = await writeSample('machine', i)
    records.push(recordOf(abs, 'test:machine', i))
  }
  buildIndex(records)
}

describe('D-05 推断层构建与并入', () => {
  it('构建 → inferred schema 进注册表（source=inferred、layout=shaped、槽位齐全），缓存落盘', async () => {
    await seedIndex()
    const { buildInferredSchemas, inferredSchemasCachePath } = await import('@main/schema/inferredSource')
    const { getCurrentModpack } = await import('@main/modpack/state')
    // 构建不依赖当前整合包（签名取包路径，未导入包时用 'test' 占位也能落缓存）
    const ok = await buildInferredSchemas(undefined, {
      modpackPath: 'E:/no-such-pack-d05'
    })
    expect(ok).toBe(true)
    const shaped = getSchema('test:shaped')
    expect(shaped).not.toBeNull()
    expect(shaped?.source).toBe('inferred')
    expect(shaped?.layoutKind).toBe('shaped')
    expect(shaped?.slots.length).toBeGreaterThan(0)
    expect(shaped?.outputs.map((o) => o.key)).toContain('result')
    expect(getSchema('test:machine')).not.toBeNull()
    // 缓存已写：签名命中后二次构建不再读样本
    const cached = await fsp.readFile(inferredSchemasCachePath('E:/no-such-pack-d05'), 'utf8')
    expect(JSON.parse(cached)['schemas'].length).toBeGreaterThanOrEqual(2)
    void getCurrentModpack
  })

  it('缓存命中：样本文件已删除也照样出 schema（证明走的是缓存而非重推）', async () => {
    const { buildInferredSchemas } = await import('@main/schema/inferredSource')
    // 第二次构建（第 1 例已写过缓存）→ 命中
    expect(await buildInferredSchemas(undefined, { modpackPath: 'E:/no-such-pack-d05' })).toBe(true)
    // 删光样本文件 + 重建索引：若走重推会因读不到样本而失败，走缓存则照常成功
    clearIndex()
    clearSchemas()
    const records: RecipeRecord[] = []
    for (let i = 0; i < 12; i += 1) records.push(recordOf(join(dir, `shaped-${i}.json`), 'test:shaped', i))
    for (let i = 0; i < 5; i += 1) records.push(recordOf(join(dir, `machine-${i}.json`), 'test:machine', i))
    buildIndex(records)
    for (const f of await fsp.readdir(dir)) await fsp.rm(join(dir, f), { force: true })
    expect(await buildInferredSchemas(undefined, { modpackPath: 'E:/no-such-pack-d05' })).toBe(true)
    expect(getSchema('test:shaped')?.source).toBe('inferred')
  })

  it('clearSchemas 后 restoreInferredLayer + applyMerge 回填推断层', async () => {
    const { restoreInferredLayer } = await import('@main/schema/inferredSource')
    clearSchemas()
    expect(getSchema('test:shaped')).toBeNull()
    expect(restoreInferredLayer()).toBe(true)
    applyMerge({})
    expect(getSchema('test:shaped')?.source).toBe('inferred')
  })
})

const RUN_REAL = process.env['RUN_REAL_PACK'] === '1'
const REAL_PACK = process.env['REAL_PACK'] ?? 'E:/mc kjs/.cache/pc7-pack-1112'
const HIGH_FREQ = ['mekanism:sawing', 'tconstruct:casting_table', 'tconstruct:melting', 'create:cutting', 'thermal:press']

describe.skipIf(!RUN_REAL)('D-05 真实包硬指标（pc7-pack-1112，只读）', () => {
  it('首建 ≤60s；二跑（缓存命中）≤1s；选择器 ≥350 行逐行中文名；5 个高频类型有表单', async () => {
    const { existsSync } = await import('node:fs')
    expect(existsSync(REAL_PACK), `整合包不存在：${REAL_PACK}`).toBe(true)
    // 真实索引：走真实扫描（同 realPack.test 口径，只读）
    const modpack = {
      path: REAL_PACK,
      name: 'pc7',
      mcVersion: null,
      loader: null,
      loaderVersion: null,
      kubejsVersion: null,
      modCount: 0,
      detectedFrom: ['d05-probe'],
      modsDir: join(REAL_PACK, 'mods'),
      hasKubejs: true,
      kubejsAddons: [],
      installedModIds: []
    } as Parameters<typeof import('../../src/main/recipes/jsonSource').scanJsonRecipes>[0]
    const { scanJsonRecipes, mergeChains } = await import('../../src/main/recipes/jsonSource')
    const { scanScriptRecipes } = await import('../../src/main/recipes/scriptSource')
    const { buildIndex } = await import('../../src/main/recipes/recipeIndex')
    const json = await scanJsonRecipes(modpack, {})
    const scripts = await scanScriptRecipes(modpack, {})
    buildIndex(mergeChains([...json, ...scripts]))

    const { buildInferredSchemas, inferredSchemasCachePath } = await import('../../src/main/schema/inferredSource')
    const { listSchemas, clearSchemas } = await import('../../src/main/schema/registry')

    // 首建（缓存可能已存在——为量出「首建」，先清缓存文件与注册表，甩掉单测合成类型污染）
    await fsp.rm(inferredSchemasCachePath(REAL_PACK), { force: true }).catch(() => undefined)
    clearSchemas()
    const t0 = Date.now()
    const ok = await buildInferredSchemas()
    const buildMs = Date.now() - t0
    // eslint-disable-next-line no-console
    console.info(`[d05] first build=${(buildMs / 1000).toFixed(1)}s ok=${ok}`)
    expect(ok).toBe(true)
    expect(buildMs).toBeLessThanOrEqual(60_000)

    const rows = listSchemas()
    const zh = rows.filter((r) => /\p{Script=Han}/u.test(r.displayName))
    // eslint-disable-next-line no-console
    console.info(`[d05] selector rows=${rows.length} zh=${zh.length}`)
    // eslint-disable-next-line no-console
    console.info(`[d05] non-zh all: ${rows.filter((r) => !/\p{Script=Han}/u.test(r.displayName)).map((r) => r.id).join(',')}`)
    expect(rows.length).toBeGreaterThanOrEqual(350)
    expect(zh.length).toBeGreaterThanOrEqual(350)
    for (const typeId of HIGH_FREQ) {
      const schema = getSchema(typeId)
      expect(schema, `${typeId} 应有 schema`).not.toBeNull()
      expect(schema?.slots.length ?? 0).toBeGreaterThan(0)
    }

    // 命中缓存 ≤1s
    clearSchemas()
    const t1 = Date.now()
    const ok2 = await buildInferredSchemas()
    const hitMs = Date.now() - t1
    // eslint-disable-next-line no-console
    console.info(`[d05] cache hit=${hitMs}ms ok=${ok2}`)
    expect(ok2).toBe(true)
    expect(hitMs).toBeLessThanOrEqual(1_000)
  }, 300_000)
})
