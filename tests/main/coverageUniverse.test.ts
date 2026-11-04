/**
 * B120/D-04：覆盖率口径修正——旧实现拿「已装配 schema 集合」当全集（27/27=100%），
 * 掩盖真实覆盖（416 种类型里仅 27 种有表单、32,794 条配方里 19,291 条暂不能新建）。
 *
 * 新口径：主百分比 = coveredRecipes / totalRecipes（配方条数维度）；
 * 新增 universeTotal / materialized / missingTypes 三个字段钉住「宇宙 vs 已装配」的差距。
 * 不变式：missingTypes 非空时 coveredRecipes < totalRecipes → 界面主百分比在数学上不可能出现 100%。
 */
import { describe, expect, it, vi } from 'vitest'
import { buildCoverageReport, type CapabilityFacts } from '@main/schema/capability'
import type { RecipeTypeSchema } from '@shared/types'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/coverage-userdata-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

function schemaOf(id: string): RecipeTypeSchema {
  return {
    id,
    displayName: id,
    modId: id.split(':')[0] ?? id,
    modDisplayName: id.split(':')[0] ?? id,
    source: 'builtin',
    layoutKind: 'custom',
    emitTarget: null,
    slots: [{ key: 'input', displayName: 'input', kind: 'item', multiple: false }],
    outputs: [{ key: 'result', displayName: 'result', kind: 'item', multiple: false }],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

function facts(counts: Record<string, number>): CapabilityFacts {
  return { installedModIds: [], sampleCounts: new Map(Object.entries(counts)) }
}

describe('D-04 覆盖率真实口径', () => {
  it('宇宙 3 种类型 / 22 条配方，已装配 1 种 → missingTypes 2 条、covered 10 / total 22', () => {
    const report = buildCoverageReport([schemaOf('mek:crushing')], facts({ 'mek:crushing': 10, 'mek:sawing': 5, 'thermal:press': 7 }))
    expect(report.universeTotal).toBe(3)
    expect(report.materialized).toBe(1)
    expect(report.missingTypes).toEqual(['mek:sawing', 'thermal:press'])
    expect(report.totalRecipes).toBe(22)
    expect(report.coveredRecipes).toBe(10)
  })

  it('不变式：有 missingTypes 时 coveredRecipes < totalRecipes（主百分比在数学上到不了 100%）', () => {
    const report = buildCoverageReport([schemaOf('mek:crushing')], facts({ 'mek:crushing': 10, 'other:x': 7 }))
    expect(report.missingTypes.length).toBeGreaterThan(0)
    expect(report.coveredRecipes).toBeLessThan(report.totalRecipes)
  })

  it('全部类型都有 schema → missingTypes 空、covered = total', () => {
    const report = buildCoverageReport([schemaOf('a:x'), schemaOf('b:y')], facts({ 'a:x': 3, 'b:y': 4 }))
    expect(report.missingTypes).toEqual([])
    expect(report.coveredRecipes).toBe(report.totalRecipes)
  })

  it('无配方事实（未扫描）→ 宇宙字段归零、missingTypes 空（旧口径回退不误报）', () => {
    const report = buildCoverageReport([schemaOf('a:x')], facts({}))
    expect(report.universeTotal).toBe(0)
    expect(report.totalRecipes).toBe(0)
    expect(report.coveredRecipes).toBe(0)
    expect(report.missingTypes).toEqual([])
  })

  it('schema 里有宇宙外的类型（无样本声明）不虚增宇宙，也不进 missingTypes', () => {
    const report = buildCoverageReport([schemaOf('a:x'), schemaOf('ghost:nope')], facts({ 'a:x': 3 }))
    expect(report.universeTotal).toBe(1)
    expect(report.missingTypes).toEqual([])
    expect(report.totalRecipes).toBe(3)
    expect(report.coveredRecipes).toBe(3)
  })
})

const RUN_REAL = process.env['RUN_REAL_PACK'] === '1'
const REAL_PACK = process.env['REAL_PACK'] ?? 'E:/mc kjs/.cache/pc7-pack-1112'

describe.skipIf(!RUN_REAL)('D-04 真实包口径（pc7-pack-1112，只读）', () => {
  it('宇宙 ≥400 种类型、≥32,000 条配方；分母不再是已装配集合', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(REAL_PACK), `整合包不存在：${REAL_PACK}`).toBe(true)
    const modpack = {
      path: REAL_PACK,
      name: 'pc7',
      mcVersion: null,
      loader: null,
      loaderVersion: null,
      kubejsVersion: null,
      modCount: 0,
      detectedFrom: ['d04-probe'],
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
    const merged = mergeChains([...json, ...scripts])
    buildIndex(merged)
    const counts = new Map<string, number>()
    for (const rec of merged) counts.set(rec.type, (counts.get(rec.type) ?? 0) + 1)
    const report = buildCoverageReport([schemaOf('mek:crushing')], { installedModIds: [], sampleCounts: counts })
    // eslint-disable-next-line no-console
    console.info(
      `[d04] universeTotal=${report.universeTotal} totalRecipes=${report.totalRecipes} ` +
        `materialized=1 covered=${report.coveredRecipes} missing=${report.missingTypes.length}`
    )
    expect(report.universeTotal).toBeGreaterThanOrEqual(400)
    expect(report.totalRecipes).toBeGreaterThanOrEqual(32000)
    expect(report.missingTypes.length).toBeGreaterThan(0)
    expect(report.coveredRecipes).toBeLessThan(report.totalRecipes)
  }, 180_000)
})
