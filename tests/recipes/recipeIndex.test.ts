/** 倒排索引单测：双向查询（制作/用途同一份索引）、分页、统计、类型全集、缓存往返。 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo, RecipeRecord } from '../../src/shared/types'
import { cleanupTmp } from '../helpers/cleanup'

vi.mock('electron', () => ({ app: { getPath: () => `${process.cwd()}/.vitest-tmp/recipeIndex` } }))

import { buildIndex, queryByOutput, queryByInput, stats, typeUniverse, recordsByType, lookup, persist, loadFromCache, addKnownTypes, clearIndex } from '../../src/main/recipes/recipeIndex'
import { setCurrentModpack } from '../../src/main/modpack/state'

function rec(partial: Partial<RecipeRecord> & { uid: string; type: string }): RecipeRecord {
  return {
    recipeId: partial.uid,
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: partial.uid,
    partial: false,
    ...partial
  }
}

const fakeModpack: ModpackInfo = {
  path: 'X:/fake/pack',
  name: 'fake',
  mcVersion: null,
  loader: null,
  loaderVersion: null,
  kubejsVersion: null,
  modCount: 0,
  detectedFrom: [],
  modsDir: 'X:/fake/pack/mods',
  hasKubejs: true,
  kubejsAddons: [],
  installedModIds: []
}

afterAll(() => {
  cleanupTmp(`${process.cwd()}/.vitest-tmp/recipeIndex`)
})

describe('倒排索引', () => {
  it('制作/用途 = 同一份索引的两次查询', () => {
    buildIndex([
      rec({
        uid: 'jar:a.jar#data/a/recipes/one.json',
        type: 'minecraft:crafting_shaped',
        outputs: [{ id: 'minecraft:diamond', count: 1, kind: 'item' }],
        inputs: [{ id: 'minecraft:coal', count: 3, kind: 'item' }]
      }),
      rec({
        uid: 'jar:b.jar#data/b/recipes/two.json',
        type: 'create:mixing',
        outputs: [{ id: 'minecraft:diamond', count: 2, kind: 'item' }],
        inputs: [{ id: 'minecraft:diamond', count: 1, kind: 'item' }]
      }),
      rec({
        uid: 'file:C:/pack/kubejs/server_scripts/x.js#recipe#0',
        type: 'minecraft:crafting_shapeless',
        source: 'kubejs',
        outputs: [{ id: 'create:glistered_metal', count: 1, kind: 'item' }],
        inputs: [{ id: 'minecraft:diamond', count: 1, kind: 'item' }],
        partial: true
      })
    ])
    const made = queryByOutput('minecraft:diamond', 0, 10)
    const used = queryByInput('minecraft:diamond', 0, 10)
    expect(made.total).toBe(2)
    expect(used.total).toBe(2)
    expect(made.items.map((r) => r.uid).sort()).toEqual(
      ['jar:a.jar#data/a/recipes/one.json', 'jar:b.jar#data/b/recipes/two.json']
    )
    expect(used.items.map((r) => r.uid).sort()).toEqual([
      'file:C:/pack/kubejs/server_scripts/x.js#recipe#0',
      'jar:b.jar#data/b/recipes/two.json'
    ])
  })

  it('分页：offset/limit 正确切片且 total 不变', () => {
    const many: RecipeRecord[] = Array.from({ length: 10 }, (_, i) =>
      rec({
        uid: `jar:m.jar#data/m/recipes/r${i}.json`,
        type: 'minecraft:crafting_shapeless',
        outputs: [{ id: 'x:target', count: 1, kind: 'item' }]
      })
    )
    buildIndex(many)
    const page = queryByOutput('x:target', 2, 3)
    expect(page.total).toBe(10)
    expect(page.items.map((r) => r.uid)).toEqual([
      'jar:m.jar#data/m/recipes/r2.json',
      'jar:m.jar#data/m/recipes/r3.json',
      'jar:m.jar#data/m/recipes/r4.json'
    ])
    expect(queryByOutput('x:target', 9, 3).items).toHaveLength(1)
    expect(queryByOutput('x:missing', 0, 3).total).toBe(0)
  })

  it('stats：分类计数 / partial / types', () => {
    buildIndex([
      rec({ uid: 'u1', type: 'minecraft:crafting_shaped', outputs: [{ id: 'a:x', count: 1, kind: 'item' }] }),
      rec({ uid: 'u2', type: 'create:mixing', outputs: [{ id: 'b:y', count: 1, kind: 'item' }] }),
      rec({ uid: 'u3', type: 'minecraft:crafting_shapeless', source: 'kubejs', partial: true, outputs: [{ id: 'c:z', count: 1, kind: 'item' }] })
    ])
    addKnownTypes(['probe:only_type'])
    const s = stats()
    expect(s).not.toBeNull()
    expect(s!.total).toBe(3)
    expect(s!.vanilla).toBe(1)
    expect(s!.modded).toBe(1)
    expect(s!.kubejs).toBe(1)
    expect(s!.partial).toBe(1)
    expect(s!.types).toBe(4) // 三种已见 type + ProbeJS 注入
    expect(typeUniverse()).toEqual(['create:mixing', 'minecraft:crafting_shaped', 'minecraft:crafting_shapeless', 'probe:only_type'])
  })

  it('recordsByType 与 lookup', () => {
    buildIndex([
      rec({ uid: 'u1', type: 't:a', outputs: [{ id: 'q:1', count: 1, kind: 'item' }] }),
      rec({ uid: 'u2', type: 't:a', outputs: [{ id: 'q:2', count: 1, kind: 'item' }] }),
      rec({ uid: 'u3', type: 't:b', outputs: [{ id: 'q:3', count: 1, kind: 'item' }] })
    ])
    expect(recordsByType('t:a', 1)).toHaveLength(1)
    expect(recordsByType('t:a', 10).map((r) => r.uid)).toEqual(['u1', 'u2'])
    expect(lookup('u3')?.type).toBe('t:b')
    expect(lookup('nope')).toBeNull()
  })

  it('persist → loadFromCache 往返（recipes.json 只含摘要）', async () => {
    setCurrentModpack(fakeModpack)
    buildIndex([
      rec({
        uid: 'jar:a.jar#data/a/recipes/one.json',
        type: 'create:mixing',
        outputs: [{ id: 'm:out', count: 1, kind: 'item' }],
        inputs: [{ id: 'm:in', count: 1, kind: 'item' }]
      })
    ])
    expect(await persist()).toBe(true)
    clearIndex()
    expect(queryByOutput('m:out', 0, 5).total).toBe(0)
    expect(await loadFromCache()).toBe(true)
    expect(queryByOutput('m:out', 0, 5).total).toBe(1)
    expect(queryByInput('m:in', 0, 5).total).toBe(1)
    setCurrentModpack(null)
  })
})
