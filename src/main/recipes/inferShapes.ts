/**
 * 第 116 批 B2：样本集合 → 字段形状的**纯函数**（无 IO、无 Electron、无全局状态）。
 *
 * 判定规则全部写在这里，避免"黑箱"：
 *   1. 值为对象且含 `item` / `id` / `tag` → `item`（Minecraft 的单物品槽、ingredient）
 *   2. 值为对象且含 `amount` / `fluid` / `gas` → `fluid`（流体槽；先判 item 是规格给的顺序）
 *   3. 数组且元素**全是** item 形状 → `items`（无序合成的 ingredients 之类）
 *   4. 数组长度固定 9 且同一条样本里有 `key` / `pattern` → 网格候选（有序合成），
 *      在 TypeShape.gridCandidate 上标出来，不做任何 schema 注入
 *   5. 数值 → `number`；true/false → `boolean`；其余 → `string`；
 *      其它对象 → `object`；其它数组 → `array`
 *
 * 聚合口径：
 *   - `presence` = 该 key 出现在多少比例的样本里（0..1，含 0，不含缺席样本）
 *   - `valueKind` = 出现次数最多的形状（平票按上面规则的优先级顺序）
 *   - `multiple` = 过半样本里这个 key 是数组
 *   - `elementShape` = 数组首元素按同样规则得到的形状（key 固定写 `[]`）
 *   - `samples` = 最多 3 个**真实值**（不造样例、不截断字符串）
 */
import type { ShapeSampleBatch } from './shapeSampler'

export type ValueKind = 'item' | 'items' | 'number' | 'string' | 'boolean' | 'object' | 'array' | 'fluid'

export interface FieldShape {
  key: string
  presence: number
  valueKind: ValueKind
  multiple: boolean
  elementShape?: FieldShape
  samples: unknown[]
}

export interface TypeShape {
  type: string
  sampleCount: number
  fields: FieldShape[]
  /** 样本里出现 key/pattern 且展开正好 9 格：有序合成网格候选 */
  gridCandidate: boolean
}

const MAX_SAMPLE_VALUES = 3
const KIND_ORDER: ValueKind[] = ['item', 'items', 'fluid', 'number', 'boolean', 'string', 'object', 'array']

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 规则 1：单物品槽 */
function isItemShape(v: unknown): boolean {
  return isPlainObject(v) && ('item' in v || 'id' in v || 'tag' in v)
}

/** 规则 2：流体槽 */
function isFluidShape(v: unknown): boolean {
  return isPlainObject(v) && ('amount' in v || 'fluid' in v || 'gas' in v)
}

/** 单个值的形状（规则 1/2/3/5） */
export function classifyValue(value: unknown): ValueKind {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isItemShape) ? 'items' : 'array'
  }
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  if (isItemShape(value)) return 'item'
  if (isFluidShape(value)) return 'fluid'
  return 'object'
}

/** 规则 4：有序合成网格候选（pattern 展开正好 9 格，且样本里带 key 映射） */
export function isGridCandidate(sample: unknown): boolean {
  if (!isPlainObject(sample)) return false
  if (!('key' in sample) || !Array.isArray(sample.pattern)) return false
  const cells = sample.pattern.reduce<number>((n, row) => (typeof row === 'string' ? n + row.length : n), 0)
  return cells === 9
}

function majorityKind(kinds: ValueKind[]): ValueKind {
  const counts = new Map<ValueKind, number>()
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  let best: ValueKind = 'object'
  let bestCount = -1
  for (const kind of KIND_ORDER) {
    const n = counts.get(kind) ?? 0
    if (n > bestCount) {
      best = kind
      bestCount = n
    }
  }
  return best
}

function elementShapeOf(values: unknown[]): FieldShape | undefined {
  const firstArray = values.find((v) => Array.isArray(v)) as unknown[] | undefined
  if (!firstArray || firstArray.length === 0) return undefined
  const elements = firstArray.slice(0, MAX_SAMPLE_VALUES)
  return {
    key: '[]',
    presence: 1,
    valueKind: classifyValue(elements[0]),
    multiple: false,
    samples: elements
  }
}

function inferField(key: string, samples: readonly Record<string, unknown>[]): FieldShape {
  const present = samples.filter((s) => key in s).map((s) => s[key])
  const kinds = present.map(classifyValue)
  const arrayCount = present.filter(Array.isArray).length
  return {
    key,
    presence: samples.length === 0 ? 0 : present.length / samples.length,
    valueKind: majorityKind(kinds),
    multiple: present.length > 0 && arrayCount * 2 > present.length,
    ...(arrayCount > 0 ? { elementShape: elementShapeOf(present) } : {}),
    samples: present.slice(0, MAX_SAMPLE_VALUES)
  }
}

/** 一个 type 的样本 → 形状。非对象的样本会被跳过（采样器已保证，但纯函数要能独立用） */
export function inferTypeShape(type: string, samples: readonly unknown[]): TypeShape {
  const objects = samples.filter(isPlainObject)
  const keys = new Set<string>()
  for (const obj of objects) for (const key of Object.keys(obj)) keys.add(key)
  return {
    type,
    sampleCount: objects.length,
    fields: [...keys].sort().map((key) => inferField(key, objects)),
    gridCandidate: objects.some(isGridCandidate)
  }
}

/** 多批样本按 type 归并后逐个推断（B2 主入口） */
export function inferShapes(batches: readonly ShapeSampleBatch[], maxSamplesPerType = 20): Record<string, TypeShape> {
  const byType = new Map<string, unknown[]>()
  for (const batch of batches) {
    if (!batch?.type) continue
    const list = byType.get(batch.type)
    if (!list) {
      byType.set(batch.type, batch.samples.slice(0, maxSamplesPerType))
      continue
    }
    for (const sample of batch.samples) {
      if (list.length >= maxSamplesPerType) break
      list.push(sample)
    }
  }
  const out: Record<string, TypeShape> = {}
  for (const [type, samples] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
    out[type] = inferTypeShape(type, samples)
  }
  return out
}

export interface InferredShapesFile {
  builtAtMs: number
  appVersion: string
  /** 采样 + 聚合花了多久（ms），用于"扫描耗时不增加"的核对 */
  buildMs: number
  typeCount: number
  /** B120/D-05：缓存签名（包路径|记录数|类型数|SCHEMA_LIB_VERSION），读取侧比对防旧缓存永生 */
  signature: string
  types: Record<string, TypeShape>
}
