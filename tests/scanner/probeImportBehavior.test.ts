/**
 * T-10 / G-21：`probeImport` 的**函数级**行为用例（node 环境，非组件）。
 *
 * 与既有 `tests/scanner/probeImport.test.ts` 的分工：
 * - 那个文件测的是 `runProbeImport` **整链**（收集 → 合并 → 摘要）；
 * - 本文件补的是**被整链掩盖的单元边界**：`collectRegistryIds` 的空输入、
 *   `mergeRegistry` 的 verified 提升 / 无图标新增 / 幂等，以及两者之间「空扫描不清表」的契约。
 *
 * 本文件为**新增**，不修改任何既有测试文件。
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { ItemEntry } from '@shared/types'
import { collectRegistryIds, mergeRegistry } from '@main/scanner/probeImport'
import { cleanupTmp } from '../helpers/cleanup'

const ROOT = mkdtempSync(join(tmpdir(), 'probeimport-unit-'))

afterAll(() => {
  cleanupTmp(ROOT)
})

function item(patch: Partial<ItemEntry> = {}): ItemEntry {
  return {
    id: 'demo:existing',
    nameZh: '既有',
    nameEn: 'existing',
    modId: 'demo',
    confidence: 'lang',
    verified: false,
    hasIcon: false,
    iconKey: null,
    pyFull: ['jiyou'],
    pyInitials: ['jy'],
    virtual: false,
    hasRecipe: false,
    ...patch
  }
}

describe('T-10：collectRegistryIds 的边界', () => {
  it('空路径列表 → 三个集合都为空，且不抛异常', async () => {
    const scan = await collectRegistryIds([])
    expect(scan.files).toEqual([])
    expect(scan.itemIds.size).toBe(0)
    expect(scan.fluidIds.size).toBe(0)
  })

  it('空目录 → files 为空、集合为空（与「不可读路径」明确区分）', async () => {
    const empty = join(ROOT, 'empty-dir')
    mkdirSync(empty, { recursive: true })
    const scan = await collectRegistryIds([empty])
    expect(scan.files).toEqual([])
    expect(scan.itemIds.size).toBe(0)
  })

  it('d.ts 里的字符串字面量被收进 itemIds', async () => {
    const dir = join(ROOT, 'dts')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'registry.d.ts'), 'declare const a: "probeunit:widget"\n', 'utf8')
    const scan = await collectRegistryIds([dir])
    expect(scan.files.length).toBe(1)
    expect([...scan.itemIds]).toContain('probeunit:widget')
  })
})

describe('T-10：mergeRegistry 的单元契约', () => {
  it('空扫描不清表：items 原样返回，计数为 0', () => {
    const before = [item()]
    const result = mergeRegistry(before, { files: [], itemIds: new Set<string>(), fluidIds: new Set<string>() })
    expect(result.items).toHaveLength(1)
    expect(result.addedIds).toBe(0)
    expect(result.verifiedIds).toBe(0)
  })

  it('新 id 被收录：verified 为真、无图标、modId 来自命名空间', () => {
    const result = mergeRegistry([], {
      files: ['x.d.ts'],
      itemIds: new Set(['probeunit:brand-new']),
      fluidIds: new Set<string>()
    })
    expect(result.addedIds).toBe(1)
    const added = result.items.find((x) => x.id === 'probeunit:brand-new')
    expect(added).toBeDefined()
    expect(added?.verified).toBe(true)
    expect(added?.hasIcon).toBe(false)
    expect(added?.iconKey).toBeNull()
    expect(added?.modId).toBe('probeunit')
  })

  it('同 id 只提升 verified，不重复计数', () => {
    const result = mergeRegistry([item()], {
      files: ['x.d.ts'],
      itemIds: new Set(['demo:existing']),
      fluidIds: new Set<string>()
    })
    expect(result.addedIds).toBe(0)
    expect(result.verifiedIds).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].verified).toBe(true)
  })

  it('已 verified 的 id 再次合并：不重复提升', () => {
    const result = mergeRegistry([item({ verified: true })], {
      files: ['x.d.ts'],
      itemIds: new Set(['demo:existing']),
      fluidIds: new Set<string>()
    })
    expect(result.verifiedIds).toBe(0)
    expect(result.addedIds).toBe(0)
  })

  it('幂等：同一扫描跑两次，第二次不新增也不提升', () => {
    const scan = {
      files: ['x.d.ts'],
      itemIds: new Set(['probeunit:twice']),
      fluidIds: new Set<string>()
    }
    const first = mergeRegistry([], scan)
    const second = mergeRegistry(first.items, scan)
    expect(first.addedIds).toBe(1)
    expect(second.addedIds).toBe(0)
    expect(second.verifiedIds).toBe(0)
    expect(second.items).toHaveLength(1)
  })
})
