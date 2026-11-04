/**
 * 逐类型能力判定与通道选择（规格 3.6.10 伪码）+ 覆盖率自检报告。
 *
 *   hasSample  = 配方库中存在该 type 的样本
 *   hasSyntax  = 对应附属模组已安装且该类型有语法糖目标
 *   hasProbeJS = ProbeJS / jar 字节码里声明过该 type
 *   channel = hasSyntax ? kubejs-sugar : hasSample ? datapack-json : event-custom
 *
 * **能力粒度是 recipe type，绝不输出「该模组不支持」**：同一个模组里不同 recipe type 的支持度
 * 并不一致（Mekanism 实测 27 个 type 全部有语法糖，而 Boiler / SPS 根本没有 RecipeType）。
 * 附属未装 + 有样本 → 默认数据包 JSON（官方 FAQ：still would work with datapack recipes）。
 */
import type { CoverageReport, GenerationChannel, RecipeTypeSchema } from '../../shared/types'
import { logger } from '../logger'

export interface CapabilityFacts {
  /** mods 目录扫描得到的附属 modId（形如 kubejs_mekanism） */
  addons?: readonly string[]
  /** 已安装 modId 全集 */
  installedModIds?: readonly string[]
  /** ProbeJS / jar 字节码声明过的 type id（L2 结果） */
  declaredTypes?: readonly string[]
  /** typeId → 配方库中的样本条数（L1 分组的 groupSize） */
  sampleCounts?: ReadonlyMap<string, number>
  /** 内置库里已知的附属 modId（仅用于「建议安装」文案，绝不用于拒绝；见规格 3.6.1 提示表） */
  knownAddonNamespaces?: readonly string[]
}

/** type 命名空间（`mekanism:crushing` → `mekanism`）。 */
export function namespaceOf(typeId: string): string {
  const i = typeId.indexOf(':')
  return i < 0 ? typeId : typeId.slice(0, i)
}

export function pathOf(typeId: string): string {
  const i = typeId.indexOf(':')
  return i < 0 ? typeId : typeId.slice(i + 1)
}

/**
 * 附属匹配只用命名规律与扫描结果：`kubejs_<ns>` / `kubejs-<ns>` / 以 `_<ns>` 结尾。
 * 不维护「哪个附属对应哪个主模组」的硬编码判定表（规格 3.6.11）。
 */
export function addonForNamespace(ns: string, addons: readonly string[]): string | null {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/gu, '_')
  const want = `kubejs_${norm(ns)}`
  const normalized = addons.map((a) => ({ raw: a, key: norm(a) }))
  return normalized.find((a) => a.key === want)?.raw ?? normalized.find((a) => a.key.endsWith(`_${norm(ns)}`))?.raw ?? null
}

function hasSamples(typeId: string, schema: RecipeTypeSchema, facts: CapabilityFacts): boolean {
  const count = facts.sampleCounts?.get(typeId) ?? schema.sampleCount ?? 0
  return count > 0
}

/** 语法糖无法表达的字段（`sugarSupported:false`）；真正的降级发生在 codegen（依用户实际填了哪些）。 */
export function sugarUnsupportedFields(schema: RecipeTypeSchema): string[] {
  const walk = (list: RecipeTypeSchema['slots']): string[] =>
    list.flatMap((s) => (s.sugarSupported === false ? [s.key] : []) .concat(s.fields ? walk(s.fields) : []))
  return [...new Set(walk([...schema.slots, ...schema.outputs, ...(schema.extraFields ?? [])]))]
}

/** 逐类型判定：写回 capability / channel / capabilityNote（不猜测，只陈述依据）。 */
export function decideForSchema(schema: RecipeTypeSchema, facts: CapabilityFacts = {}): RecipeTypeSchema {
  const ns = namespaceOf(schema.id)
  const declared = facts.declaredTypes?.includes(schema.id) === true || schema.source === 'probejs'
  const hasSample = hasSamples(schema.id, schema, facts)
  const addon = addonForNamespace(ns, facts.addons ?? [])
  const hasSyntax = schema.emitTarget !== null && addon !== null
  const mainInstalled = (facts.installedModIds ?? []).some((m) => m.toLowerCase() === ns) || ns === 'minecraft' || hasSample
  const blocked = sugarUnsupportedFields(schema)
  const samples = facts.sampleCounts?.get(schema.id) ?? schema.sampleCount ?? 0

  let capability: RecipeTypeSchema['capability']
  let channel: GenerationChannel
  let note: string
  if (hasSyntax) {
    capability = 'sugar'
    channel = 'kubejs-sugar'
    note = `已检测到附属 ${addon}，${schema.emitTarget ?? ''} 可用${schema.source === 'builtin' ? '（签名取自内置库，未在本包 ProbeJS 验证）' : ''}`
    if (blocked.length > 0) note += `；${blocked.join('、')} 无法用语法糖表达，一旦填写将自动降级 event.custom`
  } else if (hasSample) {
    capability = 'compatible'
    channel = 'datapack-json'
    note = addon === null
      ? `未检测到附属 kubejs_${ns}；本包有 ${samples} 个样本 → 默认数据包 JSON（零耦合，任何数据驱动模组都能读）`
      : `附属 ${addon} 未声明 ${pathOf(schema.id)} 的语法糖；本包有 ${samples} 个样本 → 默认数据包 JSON`
  } else if (declared) {
    capability = 'compatible'
    channel = 'event-custom'
    note = '本包暂无该类型样本，但 jar 字节码 / ProbeJS 已声明其 RecipeType → 可用 event.custom 或数据包 JSON'
  } else if (!mainInstalled) {
    capability = 'unsupported'
    channel = 'datapack-json'
    note = `主模组 ${ns} 未安装且配方库无 ${schema.id} 样本：无法确认它注册了 RecipeType`
  } else {
    capability = 'compatible'
    channel = 'datapack-json'
    note = `配方库无 ${schema.id} 样本，表单取自内置精校库 / 声明信息 → 数据包 JSON 写入后建议在游戏内验证`
  }
  return { ...schema, capability, channel, capabilityNote: note }
}

function structurable(schema: RecipeTypeSchema): boolean {
  return schema.capability !== 'unsupported' && [...schema.slots, ...schema.outputs].length > 0
}

function addonRows(schemas: readonly RecipeTypeSchema[], facts: CapabilityFacts): CoverageReport['addons'] {
  const addons = facts.addons ?? []
  const rows = new Map<string, CoverageReport['addons'][number]>()
  for (const addon of addons) rows.set(addon, { modId: addon, installed: true, suggests: '已安装：该模组提供的语法糖可用' })
  for (const schema of schemas) {
    if (schema.emitTarget === null) continue
    const ns = namespaceOf(schema.id)
    const matched = addonForNamespace(ns, addons)
    if (matched) continue
    const suggestion = `kubejs_${ns}`
    if (facts.knownAddonNamespaces && !facts.knownAddonNamespaces.includes(ns)) continue
    const existing = rows.get(suggestion)
    // 同一附属建议只写一次：先到的那条已经带上了最贴近的样本说明
    if (existing) continue
    const sample = facts.sampleCounts?.get(schema.id) ?? schema.sampleCount ?? 0
    rows.set(suggestion, {
      modId: suggestion,
      installed: false,
      suggests: `你安装了 ${ns}，但未安装 KubeJS ${ns}。${schema.id} 配方将以数据包 JSON 生成${sample > 0 ? `（本包 ${sample} 个样本）` : ''}。如需语法糖写法，请加装 ${suggestion}。`
    })
  }
  return [...rows.values()].sort((a, b) => Number(b.installed) - Number(a.installed) || a.modId.localeCompare(b.modId))
}

function unsupportedReason(schema: RecipeTypeSchema, facts: CapabilityFacts): { reason: string; suggestion: string } {
  const ns = namespaceOf(schema.id)
  const sample = facts.sampleCounts?.get(schema.id) ?? schema.sampleCount ?? 0
  const reason = sample > 0
    ? `${schema.id} 有 ${sample} 个样本但结构无法归纳`
    : `${schema.id}：配方库无样本、ProbeJS / jar 字节码未声明、主模组 ${ns} 未安装`
  const suggestion = sample > 0
    ? '用「⚙ 通用 / 任意模组配方」手填字段，仍可生成数据包 JSON；或手动载入一条该类型配方供 L1 归纳'
    : `确认 ${ns} 是否已安装（mods 目录内）；已安装则重新扫描。若该类型在 Java 里硬编码注册、根本没有 RecipeType（如 Mekanism 的 Boiler / SPS），则任何方式都无法添加——这是生态限制，不是本程序缺陷`
  return { reason, suggestion }
}

/** 覆盖率自检面板数据（规格 3.6.10）：可结构化 / 仅通用模式 / 完全无法添加 + 通道分布。
 *
 * B120/D-04：主百分比改为**配方条数维度** `coveredRecipes / totalRecipes`——旧实现拿
 * 「已装配 schema 集合」当全集（27/27=100%），掩盖真实覆盖（宇宙 400+ 种类型仅 27 种有表单）。
 * `universeTotal / materialized / missingTypes` 钉住「宇宙 vs 已装配」的差距；
 * 未扫描（无配方事实）时宇宙字段归零、missingTypes 为空，类型维度旧口径照旧回退。 */
export function buildCoverageReport(schemas: readonly RecipeTypeSchema[], facts: CapabilityFacts = {}, mcVersion: string | null = null): CoverageReport {
  const channelCounts: Record<GenerationChannel, number> = { 'kubejs-sugar': 0, 'event-custom': 0, 'datapack-json': 0 }
  let genericOnly = 0
  let unsupported = 0
  for (const schema of schemas) {
    channelCounts[schema.channel] += 1
    if (schema.capability === 'unsupported') unsupported += 1
    else if (!structurable(schema)) genericOnly += 1
  }
  const materialized = new Set(schemas.map((s) => s.id))
  const universe: string[] = []
  let totalRecipes = 0
  let coveredRecipes = 0
  for (const [type, count] of facts.sampleCounts ?? []) {
    universe.push(type)
    totalRecipes += count
    if (materialized.has(type)) coveredRecipes += count
  }
  const report: CoverageReport = {
    mcVersion,
    totalTypes: schemas.length,
    structurable: schemas.filter(structurable).length,
    genericOnly,
    unsupported,
    channelCounts,
    addons: addonRows(schemas, facts),
    unsupportedTypes: schemas
      .filter((s) => s.capability === 'unsupported' || (s.capability !== 'sugar' && s.slots.length + s.outputs.length === 0))
      .map((s) => {
        const { reason, suggestion } = unsupportedReason(s, facts)
        return { type: s.id, reason, suggestion }
      }),
    universeTotal: universe.length,
    materialized: schemas.length,
    missingTypes: universe.filter((t) => !materialized.has(t)).sort(),
    totalRecipes,
    coveredRecipes
  }
  // 主百分比：有配方事实时用条数维度（真实口径）；未扫描时回退旧的类型维度
  const pct =
    report.totalRecipes > 0
      ? ((report.coveredRecipes / report.totalRecipes) * 100).toFixed(1)
      : report.totalTypes > 0
        ? ((report.structurable / report.totalTypes) * 100).toFixed(1)
        : '0.0'
  logger.info(
    'SCHEMA',
    `覆盖率自检：配方宇宙 ${report.universeTotal} 种类型 / ${report.totalRecipes} 条配方；` +
      `已支持 ${report.materialized} 种，覆盖 ${report.coveredRecipes} 条（${pct}%），暂不能新建 ${report.totalRecipes - report.coveredRecipes} 条`,
    `已装配集合内部：可结构化编辑 ${report.structurable} / 仅通用模式 ${report.genericOnly} / 完全无法添加 ${report.unsupported}` +
      `；通道分布：语法糖 ${report.channelCounts['kubejs-sugar']} · 数据包 JSON ${report.channelCounts['datapack-json']} · event.custom ${report.channelCounts['event-custom']}`
  )
  if (report.unsupported > 0) {
    logger.warn(
      'SCHEMA',
      `${report.unsupported} 个配方类型无法添加（逐个给出依据与替代方案）`,
      report.unsupportedTypes.map((u) => `${u.type}：${u.reason} → ${u.suggestion}`).join('\n')
    )
  }
  return report
}
