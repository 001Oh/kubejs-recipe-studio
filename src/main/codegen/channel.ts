/**
 * 通道决策（规格 3.6.6 / 3.6.10 / 3.6.11）。纯判定、无 IO：
 * 输入 schema + 附属清单 + 已填字段，输出将要使用的 GenerationChannel 与降级原因。
 *
 * 三条硬规则（不可违反）：
 * 1. 附属未装绝不生成 `event.recipes.*`（禁止事项 14）；
 * 2. 用户填了任何 `sugarSupported:false` 的字段 → 自动降级，**绝不为了语法糖丢参数**；
 * 3. 偏好「始终语法糖」且条件不满足时明确报错，不静默降级（规格 3.6.11 生成偏好表）。
 */
import type {
  BenchValues,
  GenerationChannel,
  GenerationPreference,
  RecipeSlotSchema,
  RecipeTypeSchema
} from '../../shared/types'

/** 需要附属才存在的语法糖前缀；`event.shaped` / `event.remove` 属于 KubeJS 本体，无附属依赖 */
const SUGAR_NEEDS_ADDON = 'event.recipes.'

export interface ChannelInput {
  schema: RecipeTypeSchema
  /** ModpackInfo.kubejsAddons（modId 形如 kubejs_create） */
  addons: readonly string[]
  /** 配方库中存在该 type 的样本（决定数据包通道可用性） */
  hasSamples: boolean
  preference: GenerationPreference
  /** 需要写在脚本里统一管理（序列组装 / event.remove / 条件逻辑） */
  requiresScript: boolean
  /** 用户实际填了值、且 schema 标记语法糖无法表达的字段 key */
  filledUnsupportedFields: string[]
}

export interface ChannelDecision {
  channel: GenerationChannel
  sugarUnsupportedFields: string[]
  /** true = 语法糖被阻挡（附属缺失或字段无法表达） */
  blockedFromSugar: boolean
  missingAddon: string | null
  /** 语法糖签名未在本包 ProbeJS / 字节码验证（禁止事项 16） */
  sugarUnverified: boolean
  /** 非空即「明确报错」：偏好无法兑现，调用方必须阻断写盘 */
  error: string | null
  notes: string[]
}

function normalizeAddon(id: string): string {
  return id.toLowerCase().replace(/-/g, '_')
}

/** `kubejs_create` / `kubejs-create` / `create_kubejs` → 'create' */
function addonBase(id: string): string {
  const n = normalizeAddon(id)
  if (n.startsWith('kubejs_')) return n.slice('kubejs_'.length)
  const idx = n.indexOf('_kubejs')
  return idx > 0 ? n.slice(0, idx) : n
}

/** 语法糖命名空间：`event.recipes.create.mixing` → 'create'；取不到时回落 schema.modId。 */
export function sugarNamespace(schema: RecipeTypeSchema): string {
  const target = schema.emitTarget ?? ''
  if (target.startsWith(SUGAR_NEEDS_ADDON)) {
    const rest = target.slice(SUGAR_NEEDS_ADDON.length)
    const dot = rest.indexOf('.')
    const token = dot >= 0 ? rest.slice(0, dot) : rest
    // `event.recipes.immersiveengineeringArcFurnace` 这种驼峰单段写法：取前导全小写段。
    // 不能写 `/^[a-z]+(?![A-Z])/`——贪婪匹配回溯后会把最后一个字母吃掉（实测得到 immersiveengineerin）。
    const lower = /^[a-z]+/.exec(token)
    return (lower?.[0] ?? token).toLowerCase()
  }
  return schema.modId.toLowerCase()
}

export function requiredAddonOf(schema: RecipeTypeSchema): string | null {
  const target = schema.emitTarget
  if (!target || !target.startsWith(SUGAR_NEEDS_ADDON)) return null
  return `kubejs_${sugarNamespace(schema)}`
}

export function isAddonInstalled(schema: RecipeTypeSchema, addons: readonly string[]): boolean {
  const required = requiredAddonOf(schema)
  if (!required) return true
  const wanted = addonBase(required)
  return addons.some((a) => addonBase(a) === wanted)
}

/** 「本包验证过」的唯一凭据是 ProbeJS（或 class 字节码实测），内置库的记忆不算（禁止事项 16）。 */
export function isSugarVerified(schema: RecipeTypeSchema): boolean {
  return schema.source === 'probejs'
}

function isFieldFilled(schema: RecipeSlotSchema, value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.some((v) => isFieldFilled(schema, v))
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if ('id' in rec) return typeof rec['id'] === 'string' && rec['id'].trim().length > 0
    if ('fields' in schema && Array.isArray(schema.fields)) {
      return schema.fields.some((sub) => isFieldFilled(sub, rec[sub.key]))
    }
    return Object.keys(rec).length > 0
  }
  return true
}

/**
 * 收集「用户填了但语法糖表达不了」的字段（含 struct 子字段与修饰符）。
 * 顺序按 schema 声明顺序，供 UI 黄条逐字列出（规格 3.6.6 要求点名 energy/time/secondaries）。
 */
export function collectUnsupportedFields(schema: RecipeTypeSchema, values: BenchValues): string[] {
  const out: string[] = []
  const scan = (list: RecipeSlotSchema[] | undefined, holder: BenchValues): void => {
    for (const field of list ?? []) {
      const value = holder[field.key]
      if (field.sugarSupported === false && isFieldFilled(field, value)) out.push(field.key)
      if (field.kind === 'struct' && Array.isArray(field.fields) && value && typeof value === 'object' && !Array.isArray(value)) {
        scan(field.fields, value as BenchValues)
      }
    }
  }
  scan(schema.slots, values)
  scan(schema.outputs, values)
  scan(schema.extraFields, values)
  return [...new Set(out)]
}

/** 修饰符同理：`chain === null` 表示只能进 JSON 字段，填了就挡住语法糖。 */
export function collectUnsupportedModifiers(schema: RecipeTypeSchema, modifiers: BenchValues): string[] {
  const out: string[] = []
  for (const mod of schema.modifiers ?? []) {
    const value = modifiers[mod.key]
    if (value === undefined || value === false || value === null || value === '') continue
    if (mod.chain === null) out.push(mod.key)
  }
  return out
}

function sugarBlockedReason(schema: RecipeTypeSchema, addon: string | null, unsupported: string[]): string | null {
  const reasons: string[] = []
  if (!schema.emitTarget) reasons.push(`配方类型 ${schema.id} 无语法糖实现（schema.emitTarget 为空）`)
  else if (addon) reasons.push(`未安装 KubeJS 附属 ${addon}，语法糖 ${schema.emitTarget} 在游戏中将是 undefined`)
  if (unsupported.length > 0) reasons.push(`${unsupported.join('、')} 无法通过语法糖表达，不允许为此丢弃用户已填的参数`)
  return reasons.length > 0 ? reasons.join('；') : null
}

export function decideChannel(input: ChannelInput): ChannelDecision {
  const { schema, preference, addons } = input
  // P3-8：空串 emitTarget 视同 null（无语法糖）。原先 `!== null` 判定让 '' 绕过
  // 「附属缺失/无语法糖实现」检查直发语法糖（目标为空）。当前生产者只产非空串或
  // null，属插件通道的潜伏面；此处把口径钉死。
  const emitTarget = schema.emitTarget === '' ? null : schema.emitTarget
  const addon = requiredAddonOf(schema)
  const installed = isAddonInstalled(schema, addons)
  const unsupportedFields = input.filledUnsupportedFields.filter((k) => k.length > 0)
  const notes: string[] = []
  const unverified = emitTarget !== null && !isSugarVerified(schema)
  const removalOnly = emitTarget === 'event.remove' || schema.id === 'kubejs:remove'
  const sugarPossible = emitTarget !== null && installed && unsupportedFields.length === 0

  if (unsupportedFields.length > 0) {
    notes.push(`已从语法糖切换为 event.custom —— ${unsupportedFields.join('、')} 无法通过语法糖表达`)
  }

  if (preference === 'always-datapack') {
    if (removalOnly) {
      notes.push('event.remove 是脚本层能力，数据包无法表达')
      return {
        channel: 'kubejs-sugar',
        sugarUnsupportedFields: unsupportedFields,
        blockedFromSugar: false,
        missingAddon: null,
        sugarUnverified: false,
        error: '「始终数据包 JSON」与「移除配方」互斥：移除只能在脚本里执行，请把生成偏好改为「自动」。',
        notes
      }
    }
    return {
      channel: 'datapack-json',
      sugarUnsupportedFields: [],
      blockedFromSugar: false,
      missingAddon: null,
      sugarUnverified: false,
      error: null,
      notes: ['按偏好强制使用数据包 JSON，绕开 KubeJS 脚本层']
    }
  }

  if (preference === 'always-sugar') {
    if (sugarPossible) {
      return finish('kubejs-sugar', unsupportedFields, null, unverified, notes, null)
    }
    const reason = sugarBlockedReason(schema, addon, unsupportedFields) ?? '语法糖条件不满足'
    notes.push(reason)
    return finish(
      input.hasSamples ? 'datapack-json' : 'event-custom',
      unsupportedFields,
      installed ? null : addon,
      unverified,
      notes,
      `已选择「始终语法糖」，但无法生成：${reason}。请安装附属或清空无法表达的字段，或把生成偏好改为「自动」。`
    )
  }

  // 自动档口径（P3-7，2026-11-04 复核后按设计保留，勿当 bug 改顺序）：
  // 实际顺序是「语法糖 → 附属缺失/无糖时数据包 JSON → 其余情况 event.custom」，
  // 与规格 3.6.10 字面的「糖 → 数据包 → custom」不同。**有意为之**：
  // 1) 自动档要的是最不容易出错的默认——附属已装但语法糖表达不全时走 event.custom，
  //    脚本加载期把 JSON 直接交给对应 serializer，类型注册了就一定生效；数据包 JSON
  //    依赖数据包加载阶段的解析、还可能被 forge 条件过滤，静默失效比报错更难排查。
  // 2) 选择权没有被剥夺：WriteDialog 通道下拉里本就有「数据包 · 原生 JSON」，
  //    需要声明式产物的用户手动选一次即可。自动档保守、手动档开放。
  // 3) 改这个顺序会改变同一草稿的产出通道与格式（0.1.10 与 0.1.11 写出不同文件），
  //    属发布级行为变更，必须独立版本 + release note + 用例锁死，不得夹进修 bug 的 patch。
  if (emitTarget && installed && unsupportedFields.length === 0) {
    return finish('kubejs-sugar', unsupportedFields, null, unverified, notes, null)
  }
  if (emitTarget && installed && unsupportedFields.length > 0) {
    // 附属装了但糖表达不全 → event.custom（保留全部参数，绝不静默丢参数；见上方口径说明）
    return finish('event-custom', unsupportedFields, null, unverified, notes, null)
  }
  if (input.hasSamples && !input.requiresScript && !removalOnly) {
    notes.push('未检测到语法糖（附属缺失或无该方法），已切换数据包 JSON（最稳通道）')
    return finish('datapack-json', [], addon, false, notes, null)
  }
  if (removalOnly && !emitTarget) notes.push('移除配方只能在脚本层执行')
  return finish('event-custom', [], addon, unverified, notes, null)
}

function finish(
  channel: GenerationChannel,
  sugarUnsupportedFields: string[],
  missingAddon: string | null,
  sugarUnverified: boolean,
  notes: string[],
  error: string | null
): ChannelDecision {
  const isSugar = channel === 'kubejs-sugar'
  if (isSugar && sugarUnverified) {
    notes.push('签名未在本包验证（未导入 ProbeJS / 未做字节码实测），如在游戏中报错请改用数据包 JSON 通道')
  }
  return {
    channel,
    sugarUnsupportedFields,
    blockedFromSugar: !isSugar && (missingAddon !== null || sugarUnsupportedFields.length > 0),
    missingAddon: isSugar ? null : missingAddon,
    sugarUnverified: isSugar ? sugarUnverified : false,
    error,
    notes: notes.filter((n, i) => n.length > 0 && notes.indexOf(n) === i)
  }
}
