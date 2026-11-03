import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { OpenedRecipe } from '@shared/ipc'
import type { RecipeRecord, SlotValue } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'
import { PILOT_SCHEMAS } from '@shared/pilotSchemas'
import { extractRecipeIo } from '../../src/main/recipes/heuristics'
import { useAppStore } from '@renderer/store/appStore'
import { useBenchStore } from '@renderer/store/benchStore'
import { writeAt } from '@renderer/views/bench/commitOps'

/**
 * 验收点 A：同一份真实有序配方，分别经旧路径（摘要拍平）与新路径（原始 → 规范化 → 草稿）载入，
 * 再用同一处修改比较解释结果。旧路径本身有损，只作差异证据，不作完整性基线。
 */
const samples = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'schema', 'pc1-parity-raw.json'), 'utf8')
) as Record<'ladder' | 'stairs' | 'door', { source: string; json: Record<string, unknown> }>

type Key = 'ladder' | 'stairs' | 'door'

const SCHEMA = PILOT_SCHEMAS['minecraft:crafting_shaped']

function recordFor(key: Key): RecipeRecord {
  const heur = extractRecipeIo('minecraft:crafting_shaped', samples[key].json)
  return {
    uid: `jar:ad_astra-forge-1.20.1-1.15.20.jar#data/ad_astra/recipes/aeronos_${key}.json`,
    recipeId: `ad_astra:aeronos_${key}`,
    type: 'minecraft:crafting_shaped',
    outputs: heur.outputs,
    inputs: heur.inputs,
    source: 'jar',
    sourcePath: samples[key].source,
    partial: false
  }
}

/** 与 recipes:open 等价的结果（同一 schema、同一 normalizeRecipe），供渲染端测试使用 */
function openedFor(key: Key): OpenedRecipe {
  const rec = recordFor(key)
  const rawText = JSON.stringify(samples[key].json, null, 2)
  const { normalized, diagnostics } = normalizeRecipe({
    raw: samples[key].json,
    rawText,
    schema: SCHEMA,
    uid: rec.uid,
    source: { source: 'jar', sourcePath: rec.sourcePath }
  })
  return {
    record: rec,
    schema: SCHEMA,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: samples[key].json, rawText },
    normalized,
    diagnostics,
    notes: []
  }
}

/** 真实格子位置：按 MC 有序合成的 3 列网格换算（行号×3 + 列号），空格不计 */
function realPositions(key: Key): number[] {
  const pattern = samples[key].json['pattern'] as string[]
  const out: number[] = []
  pattern.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) if (row[c] !== ' ') out.push(r * 3 + c)
  })
  return out
}

function cells(): (SlotValue | null)[] {
  return useBenchStore.getState().bench.values['grid'] as (SlotValue | null)[]
}

beforeEach(() => {
  useBenchStore.getState().reset()
  useBenchStore.setState({ past: [], future: [], draft: null, draftConflict: null, loadedFrom: null, lastCommit: null })
  useAppStore.setState({ toast: () => {}, pushLog: () => {}, toasts: [], logs: [] })
})

describe('验收点 A：新旧路径对同一真实配方', () => {
  it('旧路径把摘要连续拍平，真实 pattern 的空格/行宽丢失，且不产生草稿与预览', () => {
    for (const key of ['ladder', 'door'] as const) {
      useBenchStore.getState().loadFromRecipe(recordFor(key), 'shaped', 'minecraft:crafting_shaped')
      const filled = cells().map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
      expect(filled).toEqual(Array.from({ length: filled.length }, (_, i) => i))
      expect(filled).not.toEqual(realPositions(key))
      expect(useBenchStore.getState().draft).toBeNull()
      expect(useBenchStore.getState().getDraftPreview()).toBeNull()
    }
  })

  it('新路径按 pattern 逐行还原：ladder 的空格保持为空', () => {
    const opened = openedFor('ladder')
    expect(useBenchStore.getState().loadOpenedRecipe(opened).ok).toBe(true)
    expect(cells().map((c) => c?.id ?? null)).toEqual([
      'ad_astra:aeronos_planks',
      null,
      'ad_astra:aeronos_planks',
      'ad_astra:aeronos_planks',
      'ad_astra:aeronos_planks',
      'ad_astra:aeronos_planks',
      'ad_astra:aeronos_planks',
      null,
      'ad_astra:aeronos_planks'
    ])
    expect(useBenchStore.getState().getDraftPreview()?.text).toBe(JSON.stringify(samples.ladder.json, null, 2))
  })

  it('新路径保留 3 行 × 2 列（door），不被扩成 9 格满格', () => {
    useBenchStore.getState().loadOpenedRecipe(openedFor('door'))
    const filled = cells().map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
    expect(filled).toEqual([0, 1, 3, 4, 6, 7])
    expect(cells()[2]).toBeNull()
    expect(cells()[5]).toBeNull()
    expect(cells()[8]).toBeNull()
  })

  it('同一处修改：只剩被改格子不同，pattern 行宽/key/result/未建模字段逐值保留', () => {
    useBenchStore.getState().loadOpenedRecipe(openedFor('ladder'))
    writeAt('grid:0', { kind: 'item', id: 'minecraft:emerald', count: 1 })
    const json = useBenchStore.getState().getDraftPreview()?.json as {
      pattern: string[]
      key: Record<string, unknown>
      result: unknown
      category: unknown
      show_notification: unknown
    }
    expect(json.pattern.map((row) => row.length)).toEqual([3, 3, 3])
    expect(json.pattern.slice(1)).toEqual(['###', '# #'])
    expect(json.pattern[0][1]).toBe(' ')
    expect(json.pattern[0][2]).toBe('#')
    expect(json.key[json.pattern[0][0]]).toEqual({ item: 'minecraft:emerald', count: 1 })
    expect(json.key['#']).toEqual({ item: 'ad_astra:aeronos_planks' })
    expect(json.result).toEqual(samples.ladder.json['result'])
    expect(json.category).toBe('misc')
    expect(json.show_notification).toBe(true)
  })

  it('行宽不齐（stairs）：编辑后仍 3 行，空格未被压实', () => {
    useBenchStore.getState().loadOpenedRecipe(openedFor('stairs'))
    writeAt('grid:2', { kind: 'item', id: 'minecraft:stick', count: 1 })
    const json = useBenchStore.getState().getDraftPreview()?.json as { pattern: string[]; key: Record<string, unknown> }
    expect(json.pattern).toHaveLength(3)
    expect(json.pattern[0]).toHaveLength(3)
    expect(json.pattern[1]).toBe('## ')
    expect(json.pattern[2]).toBe('###')
    expect(Object.keys(json.key)).toHaveLength(2)
  })

  it('取消后原始对象不变，重新打开仍是原文', () => {
    const opened = openedFor('ladder')
    const before = JSON.stringify(opened.raw?.json)
    useBenchStore.getState().loadOpenedRecipe(opened)
    writeAt('grid:0', { kind: 'item', id: 'minecraft:emerald', count: 1 })
    useBenchStore.getState().cancelDraft()
    expect(useBenchStore.getState().draft).toBeNull()
    expect(useBenchStore.getState().getDraftPreview()).toBeNull()
    expect(JSON.stringify(opened.raw?.json)).toBe(before)
    useBenchStore.getState().loadOpenedRecipe(openedFor('ladder'))
    expect(useBenchStore.getState().getDraftPreview()?.text).toBe(JSON.stringify(samples.ladder.json, null, 2))
  })
})
