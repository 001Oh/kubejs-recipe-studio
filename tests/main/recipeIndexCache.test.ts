/**
 * B121/D-3：recipes.json 缓存的形状校验与异常降级。
 * 红-绿取证：revert recipeIndex.ts(parseRecipesCacheJson) / scanOrchestrator.ts(loadRecipes try)
 * → 本文件变红（畸形记录击穿 buildIndex / 缓存异常击穿 startScan）。
 */
import { describe, expect, it, vi } from 'vitest'
import type { RecipeRecord } from '@shared/types'
import { parseRecipesCacheJson, type PersistedRecipes } from '@main/recipes/recipeIndex'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/recipe-cache-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))
// 强制物品缓存判定命中，让编排器走到 loadRecipes 分支（真实 meta 判定在本测试范围外）
vi.mock('@main/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/cache')>()
  return { ...actual, isCacheValid: async () => ({ valid: true, meta: null, reason: '测试强制命中' }) }
})

function validRecord(over: Record<string, unknown> = {}): RecipeRecord {
  return {
    uid: 'file:E:/pack/kubejs/data/ns/recipes/a.json',
    recipeId: 'ns:a',
    type: 'minecraft:smelting',
    outputs: [{ id: 'minecraft:stone', count: 1, kind: 'item' }],
    inputs: [{ id: 'minecraft:cobblestone', count: 1, kind: 'item' }],
    source: 'datapack',
    sourcePath: 'kubejs/data/ns/recipes/a.json',
    partial: false,
    ...over
  } as unknown as RecipeRecord
}

describe('D-3 parseRecipesCacheJson：任一元素畸形即整体判废', () => {
  it('合法记录放行', () => {
    const data: PersistedRecipes = { builtAtMs: 1, elapsedMs: 2, types: ['minecraft:smelting'], records: [validRecord()] }
    const records = parseRecipesCacheJson(data)
    expect(records).toHaveLength(1)
    expect(records?.[0]?.recipeId).toBe('ns:a')
  })

  it.each([
    ['records 缺失', { builtAtMs: 1, elapsedMs: 2, types: [] }],
    ['records 不是数组', { builtAtMs: 1, elapsedMs: 2, types: [], records: 'x' }],
    ['元素是空对象', { builtAtMs: 1, elapsedMs: 2, types: [], records: [{}] }],
    ['元素缺 uid', { builtAtMs: 1, elapsedMs: 2, types: [], records: [validRecord({ uid: undefined })] }],
    ['元素 outputs 不是数组', { builtAtMs: 1, elapsedMs: 2, types: [], records: [validRecord({ outputs: 'x' })] }],
    ['元素混入一个畸形（整体判废，不静默吞）', { builtAtMs: 1, elapsedMs: 2, types: [], records: [validRecord(), {}] }]
  ])('%s → null（触发重扫）', (_label, data) => {
    expect(parseRecipesCacheJson(data as unknown as PersistedRecipes)).toBeNull()
  })
})

describe('D-3 编排器：配方缓存恢复异常降级为重扫，不再击穿成 scan-failed', () => {
  it('loadRecipeCache 抛错 → 记 WARN 并继续重建配方库（startScan 正常完成）', async () => {
    const logger = await import('@main/logger')
    const warnSpy = vi.spyOn(logger.logger, 'warn').mockImplementation(() => ({ ts: 0, level: 'WARN', source: 'INDEX', message: '' }))
    const errorSpy = vi.spyOn(logger.logger, 'error').mockImplementation(() => ({ ts: 0, level: 'ERROR', source: 'SCAN', message: '' }))
    const { startScan } = await import('@main/scanOrchestrator')
    const { setCurrentModpack } = await import('@main/modpack/state')
    setCurrentModpack({
      path: 'E:/no-such-pack-d3',
      name: 'd3-pc',
      mcVersion: '1.20.1',
      loader: 'forge',
      loaderVersion: null,
      kubejsVersion: '2001.6.5',
      modCount: 0,
      detectedFrom: ['test'],
      modsDir: 'E:/no-such-pack-d3/mods',
      hasKubejs: true,
      kubejsAddons: [],
      installedModIds: []
    })
    const stats = { total: 0, vanilla: 0, modded: 0, kubejs: 0, partial: 0, types: 0, elapsedMs: 0 }
    const result = await startScan(false, {
      scan: async () => ({
        items: [],
        cacheHit: false,
        elapsedMs: 0,
        stats: { jars: 0, usedWorkers: false, failed: [], missingZh: 0, withIcon: 0, iconMissingNoAssets: 0 },
        cacheReason: '测试',
        extras: 'test-extras',
        signature: { mtimeMs: 0, jarCount: 0, totalBytes: 0 }
      }),
      loadRecipeCache: async () => {
        throw new Error('缓存读取爆炸')
      },
      scanRecipes: async () => stats,
      recipeStats: () => stats,
      buildInferred: async () => true
    })
    expect(result.started).toBe(true)
    // 修复前：异常击穿 → logger.error('扫描失败…')；修复后：WARN 降级 + 正常走完
    // （logger 参数序：source, message, detail——消息在第二个参数）
    expect(warnSpy.mock.calls.some((c) => String(c[1]).includes('配方缓存恢复异常'))).toBe(true)
    expect(errorSpy.mock.calls.some((c) => String(c[1]).includes('扫描失败'))).toBe(false)
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    setCurrentModpack(null)
  })
})
