import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ItemEntry } from '@shared/types'

vi.mock('electron', () => ({ app: { getPath: () => `${process.cwd()}/.vitest-tmp/probeImport`, getVersion: () => '0.1.0' } }))

import { collectRegistryIds, mergeRegistry, runProbeImport } from '@main/scanner/probeImport'

let root = ''

function existing(id: string, verified = false): ItemEntry {
  return {
    id,
    nameZh: `旧名-${id}`,
    nameEn: id,
    modId: id.split(':')[0] ?? 'minecraft',
    confidence: 'lang',
    verified,
    hasIcon: true,
    iconKey: 'k',
    pyFull: [],
    pyInitials: [],
    virtual: false,
    hasRecipe: false
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'krs-probe-'))
  const probe = join(root, 'kubejs', 'probe')
  mkdirSync(probe, { recursive: true })
  writeFileSync(
    join(probe, 'item.d.ts'),
    [
      'declare namespace ItemRegistry {',
      '  interface Items {',
      '    "mymod:ruby": string',
      '    "mymod:amethyst": string',
      '  }',
      '}',
      'declare namespace FluidRegistry {',
      '  interface Fluids {',
      '    "mymod:molten_ruby": string',
      '  }',
      '}',
      ''
    ].join('\n')
  )
  const dumps = join(root, 'scripts')
  mkdirSync(dumps, { recursive: true })
  writeFileSync(join(dumps, 'items.txt'), ['mymod:ruby', 'othermod:gear', 'not an id', ''].join('\n'))
  mkdirSync(join(root, 'emi'), { recursive: true })
  writeFileSync(
    join(root, 'emi', 'registry.json'),
    JSON.stringify({
      items: ['dynamic:ghost_item'],
      fluids: { molten: 'dynamic:molten_thing' }
    })
  )
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('注册表导出收集', () => {
  it('d.ts / txt / json 三种形态都能提取，流体按上下文分开', async () => {
    const scan = await collectRegistryIds([root])
    expect(scan.itemIds.has('mymod:ruby')).toBe(true)
    expect(scan.itemIds.has('mymod:amethyst')).toBe(true)
    expect(scan.itemIds.has('othermod:gear')).toBe(true)
    expect(scan.itemIds.has('dynamic:ghost_item')).toBe(true)
    expect(scan.fluidIds.has('mymod:molten_ruby')).toBe(true)
    expect(scan.fluidIds.has('dynamic:molten_thing')).toBe(true)
    // 既出现在 items 又出现在 fluids 时，按物品优先（这里没有，但规则要稳）
    expect(scan.itemIds.has('dynamic:molten_thing')).toBe(false)
    expect(scan.files.length).toBeGreaterThanOrEqual(3)
  })

  it('不可读路径只记 WARN，不影响其它文件', async () => {
    const scan = await collectRegistryIds([join(root, 'does-not-exist'), root])
    expect(scan.itemIds.has('mymod:ruby')).toBe(true)
  })
})

describe('与物品索引合并', () => {
  it('同 id 提升 verified；新 id 收录且不带图标；流体不进物品表', async () => {
    const scan = await collectRegistryIds([root])
    const merged = mergeRegistry([existing('mymod:ruby'), existing('othermod:gear', true)], scan)
    const byId = new Map(merged.items.map((i) => [i.id, i]))
    expect(byId.get('mymod:ruby')?.verified).toBe(true)
    expect(byId.get('othermod:gear')?.verified).toBe(true)
    expect(merged.verifiedIds).toBe(1) // gear 已经是 verified，不重复计数
    const ghost = byId.get('dynamic:ghost_item')
    expect(ghost).toBeTruthy()
    expect(ghost?.hasIcon).toBe(false)
    expect(ghost?.iconKey).toBeNull()
    expect(ghost?.nameZh).toBe('Ghost item')
    expect(byId.has('mymod:molten_ruby')).toBe(false)
    expect(merged.addedIds).toBeGreaterThanOrEqual(2)
  })

  it('重复导入幂等：第二次不再新增也不再重复计数', async () => {
    const scan = await collectRegistryIds([root])
    const once = mergeRegistry([], scan)
    const twice = mergeRegistry(once.items, scan)
    expect(twice.addedIds).toBe(0)
    expect(twice.verifiedIds).toBe(0)
    expect(twice.items.length).toBe(once.items.length)
  })

  it('runProbeImport 返回可读摘要', async () => {
    const { result, items } = await runProbeImport([root], [])
    expect(result.files.length).toBeGreaterThanOrEqual(3)
    expect(result.note).toContain('新增')
    expect(result.fluidIds).toBe(2)
    expect(items.length).toBeGreaterThan(0)
  })
})
