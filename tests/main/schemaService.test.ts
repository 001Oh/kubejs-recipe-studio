/**
 * P0：`schema:*` 服务层测试。
 * 只验证「数据来源真实、可重复、不触发磁盘扫描」这三件事，不重新定义 Schema 语义。
 */
import { describe, expect, it, vi } from 'vitest'
import { mkdirSync } from 'node:fs'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/p0-schema-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

mkdirSync(H.userData, { recursive: true })

describe('P0 schema 服务', () => {
  it('schema:list 来源是内置试点 schema，按 id 稳定排序', async () => {
    const service = await import('@main/schema/service')
    service.invalidateSchemaSnapshot()
    const list = await service.schemaSummaries()
    const ids = list.map((s) => s.id)
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b, 'en')))
    expect(ids).toEqual(['create:mixing', 'minecraft:crafting_shaped', 'minecraft:crafting_shapeless'])
    expect(list.every((s) => s.source === 'builtin')).toBe(true)
    expect(list.every((s) => typeof s.capability === 'string' && typeof s.channel === 'string')).toBe(true)
  })

  it('schema:get 返回完整 schema；未知类型返回 null（不是空对象）', async () => {
    const service = await import('@main/schema/service')
    const schema = await service.schemaById('minecraft:crafting_shaped')
    expect(schema?.id).toBe('minecraft:crafting_shaped')
    expect(schema?.layoutKind).toBe('shaped')
    expect(schema?.outputs.map((o) => o.key)).toContain('result')
    expect(await service.schemaById('nope:missing')).toBeNull()
  })

  it('coverage 的分母/分子自洽，且通道分布之和等于总数', async () => {
    const service = await import('@main/schema/service')
    const report = await service.coverage()
    expect(report.totalTypes).toBe(3)
    expect(report.structurable + report.genericOnly + report.unsupported).toBe(report.totalTypes)
    const sum = report.channelCounts['kubejs-sugar'] + report.channelCounts['datapack-json'] + report.channelCounts['event-custom']
    expect(sum).toBe(report.totalTypes)
    expect(report.mcVersion).toBeNull() // 未导入整合包时不编造版本号
  })

  it('覆盖度是纯内存计算：没有整合包也能返回稳定结果', async () => {
    const service = await import('@main/schema/service')
    const a = await service.coverage()
    const b = await service.coverage()
    expect(b).toEqual(a)
  })

  it('未知 / 不支持的类型会被归类进 unsupportedTypes', async () => {
    const { buildCoverageReport } = await import('@main/schema/capability')
    const unknown = {
      id: 'ghost:ritual',
      displayName: 'Ritual',
      modId: 'ghost',
      modDisplayName: 'ghost',
      source: 'builtin' as const,
      layoutKind: 'single_io' as const,
      emitTarget: null,
      slots: [],
      outputs: [],
      channel: 'datapack-json' as const,
      capability: 'unsupported' as const
    }
    const report = buildCoverageReport([unknown], { installedModIds: [], sampleCounts: new Map() }, '1.20.1')
    expect(report.totalTypes).toBe(1)
    expect(report.unsupported).toBe(1)
    expect(report.unsupportedTypes[0]?.type).toBe('ghost:ritual')
    expect(report.unsupportedTypes[0]?.reason).toContain('未安装')
    expect(report.unsupportedTypes[0]?.suggestion.length).toBeGreaterThan(0)
  })

  it('无任何类型时返回明确的空状态（全 0，而不是伪造数据）', async () => {
    const { buildCoverageReport } = await import('@main/schema/capability')
    const report = buildCoverageReport([], {}, null)
    expect(report).toMatchObject({ totalTypes: 0, structurable: 0, genericOnly: 0, unsupported: 0 })
    expect(report.addons).toEqual([])
    expect(report.unsupportedTypes).toEqual([])
  })
})
