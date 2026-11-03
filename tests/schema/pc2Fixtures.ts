import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import type { RecipeRecord } from '@shared/types'
import { normalizeRecipe } from '@shared/normalize'

export type Pc2Key = 'shapelessBrass' | 'mixingFluix' | 'mixingTea' | 'mixingChance'

export interface Pc2Sample {
  source: string
  json: Record<string, unknown>
}

export const pc2samples = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'schema', 'pc2-samples-raw.json'), 'utf8')
) as Record<Pc2Key, Pc2Sample>

/** 与 src/main/recipes/selectSchema.ts 的试点 schema 保持一致（测试侧独立副本，防止主进程依赖） */
export const PC2_SCHEMAS: Record<'minecraft:crafting_shapeless' | 'create:mixing', NormalizedSchema> = {
  'minecraft:crafting_shapeless': {
    id: 'minecraft:crafting_shapeless',
    layoutKind: 'shapeless',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  'create:mixing': {
    id: 'create:mixing',
    layoutKind: 'multi_io',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'results', kind: 'item', multiple: true }],
    revision: 1,
    preserveUnknown: true,
    supportsChance: true
  }
}

export function pc2Opened(key: Pc2Key): OpenedRecipe {
  const sample = pc2samples[key]
  const type = key === 'shapelessBrass' ? 'minecraft:crafting_shapeless' : 'create:mixing'
  const schema = PC2_SCHEMAS[type]
  const rawText = JSON.stringify(sample.json)
  const uid = `test:${key}`
  const { normalized, diagnostics } = normalizeRecipe({
    raw: sample.json,
    rawText,
    schema,
    uid,
    source: { source: 'jar', sourcePath: sample.source }
  })
  const record: RecipeRecord = {
    uid,
    recipeId: `test:${key}`,
    type,
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: sample.source,
    partial: normalized.partial.isPartial
  }
  return {
    record,
    schema,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: sample.json, rawText },
    normalized,
    diagnostics,
    notes: []
  }
}
