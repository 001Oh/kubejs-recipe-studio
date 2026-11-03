import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModpackInfo } from '@shared/types'
import { RANK_DATAPACK, RANK_KUBEJS_DATA, scanJsonRecipes } from '@main/recipes/jsonSource'
import { appendBatches } from '@main/recipes/scanRecipes'

/**
 * 回归：kubejs/data 是数据包根，walkDir 出来的相对路径少一层前导 data/，
 * 早期实现因此把整源静默丢弃（`recipeIdFromEntry` 返回 null → continue）。
 */
let root = ''
let modpack: ModpackInfo

function writeFile(abs: string, body: unknown): void {
  mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
  writeFileSync(abs, JSON.stringify(body), 'utf8')
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kjs-src-'))
  mkdirSync(join(root, 'mods'), { recursive: true })
  writeFile(`${root}/kubejs/data/mypack/recipes/from_kubejs_data.json`, {
    type: 'minecraft:crafting_shapeless',
    ingredients: [{ item: 'minecraft:oak_log' }],
    result: { item: 'minecraft:oak_planks', count: 4 }
  })
  writeFile(`${root}/config/openloader/data/pack/data/mypack/recipes/from_openloader.json`, {
    type: 'minecraft:crafting_shaped',
    pattern: ['AA'],
    key: { A: { item: 'minecraft:iron_ingot' } },
    result: { item: 'minecraft:iron_block' }
  })
  modpack = {
    path: root,
    name: 'fixture',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: null,
    kubejsVersion: null,
    modCount: 0,
    detectedFrom: [],
    modsDir: join(root, 'mods'),
    hasKubejs: false,
    kubejsAddons: [],
    installedModIds: []
  }
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('散文件配方源', () => {
  it('kubejs/data 下的配方被收进来源 2', async () => {
    const out = await scanJsonRecipes(modpack, {})
    const fromKubejs = out.filter((e) => e.loadRank === RANK_KUBEJS_DATA)
    expect(fromKubejs).toHaveLength(1)
    expect(fromKubejs[0].record.source).toBe('datapack')
    expect(fromKubejs[0].record.recipeId).toContain('from_kubejs_data')
    expect(fromKubejs[0].record.outputs.map((o) => o.id)).toContain('minecraft:oak_planks')
  })

  it('openloader 数据包仍按来源 1 收，且不被前缀改动影响', async () => {
    const out = await scanJsonRecipes(modpack, {})
    const fromOl = out.filter((e) => e.loadRank === RANK_DATAPACK)
    expect(fromOl).toHaveLength(1)
    expect(fromOl[0].record.recipeId).toContain('from_openloader')
    expect(fromOl[0].record.inputs.map((i) => i.id)).toContain('minecraft:iron_ingot')
  })

  it('两源同 ID 时 kubejs/data 覆盖 openloader（加载顺序 jar→数据包→kubejs/data）', async () => {
    writeFile(`${root}/kubejs/data/mypack/recipes/from_openloader.json`, {
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ item: 'minecraft:dirt' }],
      result: { item: 'minecraft:mud' }
    })
    const out = await scanJsonRecipes(modpack, {})
    const dup = out.filter((e) => e.record.recipeId.includes('from_openloader'))
    expect(dup.length).toBeGreaterThanOrEqual(2)
    // 定义链在 mergeChains 里排；这里只验证两源都被抓到且 rank 不同
    expect(new Set(dup.map((e) => e.loadRank))).toEqual(new Set([RANK_DATAPACK, RANK_KUBEJS_DATA]))
  })
})

describe('三源合并的规模上限', () => {
  it('20 万条合并不抛（push(...arr) 在 13 万即 RangeError）', () => {
    const big = new Array(200_000).fill(null).map((_, i) => ({
      record: {
        uid: `u${i}`,
        recipeId: `r${i}`,
        type: 'minecraft:crafting_shapeless',
        outputs: [],
        inputs: [],
        source: 'jar' as const,
        sourcePath: 'p',
        partial: false
      },
      loadRank: 0,
      orderKey: `0/${i}`
    }))
    const merged = appendBatches([big, big.slice(0, 50_000)])
    expect(merged).toHaveLength(250_000)
    expect(merged[0].record.uid).toBe('u0')
    expect(merged[200_000].record.uid).toBe('u0')
  })
})
