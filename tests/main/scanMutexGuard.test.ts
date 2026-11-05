/**
 * B121/D-5 + N-2：扫描互斥入口与生成上下文接线。
 * 红-绿取证：revert scanOrchestrator.ts(assertScanIdle / setGenerationContext) → 本文件变红。
 */
import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/scan-mutex-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

import { assertScanIdle, startScan } from '@main/scanOrchestrator'
import { setCurrentModpack } from '@main/modpack/state'
import { setItemIndex, clearItemIndex } from '@main/scanner/itemIndex'
import { semanticContext } from '@main/codegen/context'

const MODPACK = {
  path: 'E:/no-such-pack-mutex',
  name: 'mutex-pc',
  mcVersion: '1.20.1',
  loader: 'forge' as const,
  loaderVersion: null,
  kubejsVersion: '2001.6.5',
  modCount: 0,
  detectedFrom: ['test'],
  modsDir: 'E:/no-such-pack-mutex/mods',
  hasKubejs: true,
  kubejsAddons: [],
  installedModIds: []
}

const SCAN_RESULT = {
  items: [],
  cacheHit: false,
  elapsedMs: 0,
  stats: { jars: 0, usedWorkers: false, failed: [], missingZh: 0, withIcon: 0, iconMissingNoAssets: 0 },
  cacheReason: '测试',
  extras: 'mutex-extras',
  signature: { mtimeMs: 0, jarCount: 0, totalBytes: 0 }
}
const STATS = { total: 0, vanilla: 0, modded: 0, kubejs: 0, partial: 0, types: 0, elapsedMs: 0 }

describe('D-5 assertScanIdle：扫描窗口内拒绝导入类操作', () => {
  it('空闲时放行', () => {
    expect(() => assertScanIdle('导入整合包')).not.toThrow()
  })

  it('扫描进行中抛 SCAN_IN_PROGRESS；扫描结束后放行', async () => {
    setCurrentModpack(MODPACK)
    let finishScan!: () => void
    const gate = new Promise<void>((resolve) => {
      finishScan = resolve
    })
    const running = startScan(false, {
      scan: async () => {
        await gate
        return SCAN_RESULT
      },
      loadRecipeCache: async () => false,
      scanRecipes: async () => STATS,
      recipeStats: () => STATS,
      buildInferred: async () => true
    })
    // 扫描挂在 gate 上：此时导入类操作必须被拒（错误码 SCAN_IN_PROGRESS 供 UI 识别）
    await Promise.resolve()
    try {
      expect(() => assertScanIdle('导入整合包')).toThrowError(expect.objectContaining({ code: 'SCAN_IN_PROGRESS' }))
      expect(() => assertScanIdle('导入注册表导出')).toThrowError(expect.objectContaining({ code: 'SCAN_IN_PROGRESS' }))
    } finally {
      finishScan()
      await running
    }
    expect(() => assertScanIdle('导入整合包')).not.toThrow()
    setCurrentModpack(null)
  })

  it('重复 startScan 被拒（既有互斥不回归）', async () => {
    setCurrentModpack(MODPACK)
    let finishScan!: () => void
    const gate = new Promise<void>((resolve) => {
      finishScan = resolve
    })
    const running = startScan(false, {
      scan: async () => {
        await gate
        return SCAN_RESULT
      },
      loadRecipeCache: async () => false,
      scanRecipes: async () => STATS,
      recipeStats: () => STATS,
      buildInferred: async () => true
    })
    await Promise.resolve()
    try {
      const second = await startScan(false, {})
      expect(second.started).toBe(false)
      expect(second.reason).toContain('已有扫描')
    } finally {
      finishScan()
      await running
    }
    setCurrentModpack(null)
  })
})

describe('N-2 semanticContext 生产接线（scanOrchestrator 组合根）', () => {
  it('索引非空：itemExists 按内存索引判定', () => {
    setItemIndex([
      {
        id: 'minecraft:stone',
        nameZh: '石头',
        nameEn: 'Stone',
        modId: 'minecraft',
        confidence: 'lang',
        verified: true,
        hasIcon: false,
        iconKey: null,
        pyFull: [],
        pyInitials: [],
        virtual: false,
        hasRecipe: true
      }
    ])
    const ctx = semanticContext()
    expect(typeof ctx.itemExists).toBe('function')
    expect(ctx.itemExists?.('minecraft:stone')).toBe(true)
    expect(ctx.itemExists?.('minecraft:not_a_real_item_xyz')).toBe(false)
    clearItemIndex()
  })

  it('索引为空：按「事实不可知」降级为 true（不产生全量未知误报）', () => {
    clearItemIndex()
    const ctx = semanticContext()
    expect(ctx.itemExists?.('minecraft:anything')).toBe(true)
  })
})
