/** 插件管理页数据单测：一眼看出「哪些被精确支持、哪些还靠反推」（规格 3.6.14 面板）。 */
import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '@shared/types'
import { buildPluginReport } from '../../src/main/plugins/report'

function plugin(over: Partial<PluginManifest> & { id: string }): PluginManifest {
  return {
    id: over.id,
    name: over.name ?? over.id,
    version: over.version ?? '1.0.0',
    origin: over.origin ?? 'modpack',
    path: over.path ?? `/pack/.recipe-studio/plugins/${over.id}.json`,
    status: over.status ?? 'loaded',
    coveredTypes: over.coveredTypes ?? [],
    ...(over.author ? { author: over.author } : {}),
    ...(over.fieldNames ? { fieldNames: over.fieldNames } : {}),
    ...(over.recipeTypes ? { recipeTypes: over.recipeTypes } : {}),
    ...(over.error ? { error: over.error } : {})
  }
}

const TYPES = Array.from({ length: 10 }, (_, i) => `some:mod_type_${i}`)

describe('覆盖与未覆盖统计', () => {
  it('已覆盖类型只算生效插件，剩下的计入「将由 L1 反推自动生成表单」', () => {
    const report = buildPluginReport({
      plugins: [
        plugin({ id: 'a', coveredTypes: [TYPES[0] as string, TYPES[1] as string] }),
        plugin({ id: 'b', origin: 'user', coveredTypes: [TYPES[2] as string] }),
        plugin({ id: 'c', origin: 'user', status: 'incompatible', coveredTypes: [], error: '需要 app >=9.0.0，当前 1.0.0' })
      ],
      allTypeIds: TYPES
    })
    expect(report.totalTypeCount).toBe(10)
    expect(report.coveredTypeCount).toBe(3)
    expect(report.uncoveredTypeCount).toBe(7)
    expect(report.uncoveredHint).toBe('未覆盖类型 7 个，将由 L1 反推自动生成表单')
    expect(report.loadedCount).toBe(2)
    expect(report.incompatibleCount).toBe(1)
  })

  it('还没扫描配方时不谎报未覆盖数量', () => {
    const report = buildPluginReport({ plugins: [plugin({ id: 'a' })], allTypeIds: [] })
    expect(report.uncoveredTypeCount).toBe(0)
    expect(report.uncoveredHint).toContain('尚未扫描配方')
  })

  it('两个插件覆盖同一类型时只算一次', () => {
    const report = buildPluginReport({
      plugins: [plugin({ id: 'a', coveredTypes: ['x:y'] }), plugin({ id: 'b', origin: 'user', coveredTypes: ['x:y'] })],
      allTypeIds: ['x:y', 'x:z']
    })
    expect(report.coveredTypeCount).toBe(1)
    expect(report.uncoveredTypeCount).toBe(1)
  })
})

describe('列表行的状态、来源与提示', () => {
  it('四种状态各有对应图标文案，来源写成人话', () => {
    const report = buildPluginReport({
      plugins: [
        plugin({ id: 'ok', name: 'occultism-ritual' }),
        plugin({ id: 'degraded', name: 'kubejs-thermal', status: 'loaded', error: '因未安装 KubeJS Thermal，已切换为数据包模式' }),
        plugin({ id: 'bad', name: 'foo-bar', status: 'incompatible', error: '需要 app >=2.0.0，当前 1.0.0' }),
        plugin({ id: 'off', name: '被关掉', origin: 'user', status: 'disabled', error: '已在插件管理页关闭' }),
        plugin({ id: 'oops', name: '解析失败', status: 'failed', error: 'id：缺少非空字符串 id' })
      ],
      allTypeIds: []
    })
    const byId = new Map(report.entries.map((e) => [e.id, e]))
    expect(byId.get('ok')?.statusLabel).toBe('✓ 已加载')
    expect(byId.get('degraded')?.statusLabel).toBe('⚠ 已降级')
    expect(byId.get('degraded')?.degraded).toBe(true)
    expect(byId.get('degraded')?.note).toContain('因未安装 KubeJS Thermal')
    expect(byId.get('bad')?.statusLabel).toBe('✗ 不兼容')
    expect(byId.get('off')?.statusLabel).toBe('— 已禁用')
    expect(byId.get('oops')?.statusLabel).toBe('✗ 解析失败')
    expect(byId.get('ok')?.originLabel).toBe('整合包')
    expect(byId.get('off')?.originLabel).toBe('用户目录')
    expect(report.degradedCount).toBe(1)
    expect(report.disabledCount).toBe(1)
    expect(report.failedCount).toBe(1)
  })

  it('只给词典的插件标成部分覆盖，而不是「没有类型」的失败', () => {
    const report = buildPluginReport({
      plugins: [plugin({ id: 'dict', name: '字段中文名', fieldNames: { pentacle_id: '法阵等级' }, coveredTypes: [] })],
      allTypeIds: ['x:y']
    })
    const entry = report.entries[0]
    expect(entry?.dictionaryOnly).toBe(true)
    expect(entry?.coveredCount).toBe(0)
    expect(entry?.statusLabel).toBe('✓ 已加载')
    expect(report.uncoveredTypeCount).toBe(1)
  })

  it('同 type 冲突在败方那一行写明谁赢了', () => {
    const report = buildPluginReport({
      plugins: [plugin({ id: 'a', coveredTypes: ['x:y'] }), plugin({ id: 'b', origin: 'user', coveredTypes: ['x:y'] })],
      allTypeIds: ['x:y']
    })
    expect(report.conflicts).toEqual([{ type: 'x:y', winner: 'a', winnerOrigin: 'modpack', losers: ['b'] }])
    expect(report.entries[1]?.conflicts).toEqual(['x:y 已由 a（整合包）提供'])
    expect(report.entries[0]?.conflicts).toEqual([])
  })

  it('面板说明写清两个来源的优先级', () => {
    const report = buildPluginReport({ plugins: [], allTypeIds: [] })
    expect(report.sourceHint).toContain('<整合包>/.recipe-studio/plugins')
    expect(report.sourceHint).toContain('userData/plugins')
  })
})
