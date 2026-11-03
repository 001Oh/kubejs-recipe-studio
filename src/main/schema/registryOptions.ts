/**
 * 注册表候选槽的取值来源（规格 §3.4「取值来源三级」）：
 *   ① ProbeJS 注册表声明（最全，能覆盖「模组注册了但本包没用到」的值）
 *   ② 本包配方样本归纳（扫描所有 `infusionInput` / `gas` / `slurry` 等字段的实际值去重，最贴合当前整合包）
 *   ③ 内置常见列表（前两者都不可用时兜底）
 * 三者按 id 去重合并，优先级 ① > ② > ③。缩写角标只按注册表名给 INF/GAS/SLR/PGM，
 * 其余统一 REG（架构决策 2：不为每个模组枚举缩写）。
 */
import type { RegistryOption, RecipeSlotSchema, RecipeTypeSchema } from '../../shared/types'
import { getCurrentModpack } from '../modpack/state'
import { cacheFile } from '../paths'
import { readJson } from '../cache'
import { displayNameForValue } from './naming'
import { isIdLike } from './primitives'
import { namespaceOf } from './capability'

export type RegistryAbbr = RegistryOption['abbr']

/** 注册表主色：仅用于色块角标（全程序唯一允许不用真实贴图的地方）。 */
const ABBR_COLOR: Record<RegistryAbbr, string> = {
  INF: 'rgba(160,120,230,.85)',
  GAS: 'rgba(110,190,220,.85)',
  SLR: 'rgba(225,160,90,.85)',
  PGM: 'rgba(225,120,175,.85)',
  REG: 'rgba(150,140,190,.85)'
}

export function abbrForRegistry(registry: string): RegistryAbbr {
  const lower = registry.toLowerCase()
  if (lower.includes('infus')) return 'INF'
  if (lower.includes('gas')) return 'GAS'
  if (lower.includes('slurry')) return 'SLR'
  if (lower.includes('pigment')) return 'PGM'
  return 'REG'
}

/** 内置兜底候选：仅「常见注册表值」，用于 ①② 都拿不到时给出可用的默认项。 */
export const BUILTIN_REGISTRY_VALUES: Record<string, { id: string; defaultAmount: number }[]> = {
  'mekanism:infuse_type': [
    { id: 'mekanism:redstone', defaultAmount: 10 },
    { id: 'mekanism:carbon', defaultAmount: 10 },
    { id: 'mekanism:gold', defaultAmount: 10 },
    { id: 'mekanism:lapis', defaultAmount: 10 },
    { id: 'mekanism:diamond', defaultAmount: 10 },
    { id: 'mekanism:obsidian', defaultAmount: 10 },
    { id: 'mekanism:refined_obsidian', defaultAmount: 10 }
  ],
  'mekanism:gas': [
    { id: 'mekanism:oxygen', defaultAmount: 100 },
    { id: 'mekanism:hydrogen', defaultAmount: 100 },
    { id: 'mekanism:chlorine', defaultAmount: 100 },
    { id: 'mekanism:ethene', defaultAmount: 100 },
    { id: 'mekanism:sodium', defaultAmount: 100 }
  ],
  'mekanism:slurry': [
    { id: 'mekanism:iron', defaultAmount: 100 },
    { id: 'mekanism:gold', defaultAmount: 100 },
    { id: 'mekanism:obsidian', defaultAmount: 100 }
  ]
}

/** 字段 → 注册表标识：优先 schema 声明，其次 `<type 命名空间>:<字段名>`（本包实测作用域）。 */
export function registryKeyFor(schema: RecipeTypeSchema, slot: RecipeSlotSchema): string {
  if (slot.registry) return slot.registry
  return `${namespaceOf(schema.id)}:${slot.key.toLowerCase()}`
}

function collectFromSlots(schema: RecipeTypeSchema, slots: readonly RecipeSlotSchema[], into: Map<string, Set<string>>): void {
  for (const slot of slots) {
    if (slot.kind === 'registry' || slot.kind === 'tag' || slot.kind === 'choice' || slot.kind === 'text') {
      const key = registryKeyFor(schema, slot)
      const bucket = into.get(key) ?? new Set<string>()
      for (const choice of slot.choices ?? []) {
        if (isIdLike(choice.value)) bucket.add(choice.value)
      }
      if (bucket.size > 0) into.set(key, bucket)
    }
    if (slot.fields?.length) collectFromSlots(schema, slot.fields, into)
  }
}

/** ② 从本包配方样本归纳（L1 把实测值写进了 choices，这里按注册表聚合去重）。 */
export function sampleRegistryValues(schemas: readonly RecipeTypeSchema[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const schema of schemas) collectFromSlots(schema, [...schema.slots, ...schema.outputs, ...(schema.extraFields ?? [])], map)
  for (const [key, values] of Object.entries(BUILTIN_REGISTRY_VALUES)) {
    const bucket = map.get(key) ?? new Set<string>()
    for (const v of values) bucket.add(v.id)
    if (bucket.size > 0) map.set(key, bucket)
  }
  return map
}

interface ProbeRegistryShape {
  registries?: Record<string, unknown>
  [key: string]: unknown
}

/** ① ProbeJS 声明（缓存文件形状由 P2 决定，这里做容错读取：任意 `registry → string[]`）。 */
export function probeRegistryValues(raw: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!raw || typeof raw !== 'object') return out
  const source = (raw as ProbeRegistryShape).registries ?? (raw as Record<string, unknown>)
  if (!source || typeof source !== 'object') return out
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const ids = value.filter((v): v is string => typeof v === 'string' && isIdLike(v))
      if (ids.length > 0) out.set(key.toLowerCase(), ids)
      continue
    }
    if (value && typeof value === 'object') {
      const ids = Object.keys(value as Record<string, unknown>).filter((k) => isIdLike(k))
      if (ids.length > 0) out.set(key.toLowerCase(), ids)
    }
  }
  return out
}

function option(registry: string, id: string, origin: RegistryOption['origin'], defaultAmount: number, lang?: Record<string, string>): RegistryOption {
  const abbr = abbrForRegistry(registry)
  return {
    id,
    registry,
    nameZh: displayNameForValue(id, lang ? { modLang: lang } : undefined),
    nameEn: id,
    color: ABBR_COLOR[abbr],
    abbr,
    origin,
    defaultAmount
  }
}

/** 三级来源合并（probe > sample > builtin）；probe 数据缺失时只合并 ②③。 */
export function mergeRegistrySources(
  registry: string,
  probe: readonly string[],
  sample: readonly string[],
  builtin: readonly { id: string; defaultAmount: number }[],
  lang?: Record<string, string>
): RegistryOption[] {
  const byId = new Map<string, RegistryOption>()
  for (const item of builtin) if (!byId.has(item.id)) byId.set(item.id, option(registry, item.id, 'builtin', item.defaultAmount, lang))
  for (const id of sample) {
    const existing = byId.get(id)
    if (existing) byId.set(id, { ...existing, origin: 'sample' })
    else byId.set(id, option(registry, id, 'sample', defaultAmountFor(registry), lang))
  }
  for (const id of probe) byId.set(id, option(registry, id, 'probejs', byId.get(id)?.defaultAmount ?? defaultAmountFor(registry), lang))
  return [...byId.values()].sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh') || a.id.localeCompare(b.id))
}

export function defaultAmountFor(registry: string): number {
  return abbrForRegistry(registry) === 'GAS' ? 100 : 10
}

/** 当前整合包的注册表候选（IPC `schema:registryOptions` 的实现）。 */
export async function registryOptions(registry: string, schemas: readonly RecipeTypeSchema[], lang?: Record<string, string>): Promise<RegistryOption[]> {
  const modpack = getCurrentModpack()
  const probe = modpack ? probeRegistryValues(await readJson<unknown>(cacheFile(modpack.path, 'probe'))) : new Map<string, string[]>()
  const sample = sampleRegistryValues(schemas)
  const wanted = registry.toLowerCase()
  const sampleIds = [...(sample.get(wanted) ?? []), ...(sample.get(`${wanted}s`) ?? [])]
  return mergeRegistrySources(wanted, probe.get(wanted) ?? [], sampleIds, BUILTIN_REGISTRY_VALUES[wanted] ?? [], lang)
}
