import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NormalizedSchema } from '@shared/schemaModel'

export type SampleKey = 'shaped' | 'shapeless' | 'mixing' | 'arcFurnace' | 'infusing' | 'reaction'

export interface Sample {
  source: string
  json: Record<string, unknown>
}

/** 真实样本（来自 1112 的 1.20.1 包与 Construct 的 1.19.2 包，见文件内 source） */
export const samples: Record<SampleKey, Sample> = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'schema', 'samples-raw.json'), 'utf8')
) as Record<SampleKey, Sample>

/** 三个首批类型 + arc furnace（只建模主输入/材料/产物，其余留作 unknown） */
export const schemas: Partial<Record<SampleKey, NormalizedSchema>> = {
  shaped: {
    id: 'minecraft:crafting_shaped',
    layoutKind: 'shaped',
    slots: [],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1,
    preserveUnknown: true
  },
  shapeless: {
    id: 'minecraft:crafting_shapeless',
    layoutKind: 'shapeless',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }],
    revision: 1
  },
  mixing: {
    id: 'create:mixing',
    layoutKind: 'multi_io',
    slots: [{ key: 'ingredients', kind: 'item', multiple: true, required: true }],
    outputs: [{ key: 'results', kind: 'item', multiple: true }],
    revision: 1
  },
  arcFurnace: {
    id: 'immersiveengineering:arc_furnace',
    layoutKind: 'multi_io',
    slots: [
      { key: 'input', kind: 'item', multiple: false, required: true },
      { key: 'additives', kind: 'item', multiple: true }
    ],
    outputs: [{ key: 'results', kind: 'item', multiple: true }],
    revision: 1
  }
}

export function normalizeArgs(key: SampleKey): {
  raw: unknown
  rawText: string
  schema: NormalizedSchema
  uid: string
  source: { source: 'jar'; sourcePath: string; dynamic?: boolean }
} {
  const sample = samples[key]
  return {
    raw: sample.json,
    rawText: JSON.stringify(sample.json),
    schema: schemas[key] as NormalizedSchema,
    uid: `test:${key}`,
    source: { source: 'jar', sourcePath: sample.source }
  }
}
