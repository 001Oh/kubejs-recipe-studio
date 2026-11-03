/**
 * 插件 ↔ KubeJS 附属模组检测联动（规格 3.6.14 末段 + 3.6.1）。
 *
 * 判定权全交给 3.6.1 的扫描结果，插件只提供意图：
 * - 声明 `kubejsAddon: "kubejs_create"` 且附属已装 → 语法糖通道
 * - 声明了但附属缺失 → 自动降级数据包 JSON，并把人话提示写进插件列表
 * - 声明 `mods` 里有未安装的模组 → 整包禁用（由 loader 落到 status）
 */
import type { GenerationChannel, ModpackInfo, RecipeTypeSchema } from '../../shared/types'

export interface AddonState {
  /** 插件声明的附属 modId，如 kubejs_create */
  addon: string
  installed: boolean
}

/** kubejs_create → KubeJS Create；kubejs-immersive-engineering → KubeJS Immersive Engineering */
export function prettyAddonName(addon: string): string {
  const rest = addon.replace(/^kubejs[_-]?/i, '')
  const words = rest
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  return words.length > 0 ? `KubeJS ${words.join(' ')}` : 'KubeJS'
}

/** occultism → Occultism；immersiveengineering 只能原样首字母大写 */
export function prettyModName(modId: string): string {
  if (!modId) return ''
  return modId
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * 附属是否就位。整合包信息缺失（未导入 / 扫描未产出 modId 清单）时返回 null，
 * 表示「无法判定」——宁可按语法糖可用处理，也不把插件误降级。
 */
export function addonState(addon: string | null | undefined, modpack: ModpackInfo | null): AddonState | null {
  if (!addon) return null
  const addons = modpack?.kubejsAddons ?? []
  const installed = modpack?.installedModIds ?? []
  if (!modpack || (addons.length === 0 && installed.length === 0)) return null
  const hit = addons.includes(addon) || installed.includes(addon)
  return { addon, installed: hit }
}

/**
 * 声明的依赖模组中未安装的部分。
 * 返回空数组表示「全部就位或无从核实」；只有真的查到缺哪些才会整包禁用。
 */
export function missingDependencyMods(mods: readonly string[] | undefined, modpack: ModpackInfo | null): string[] {
  if (!mods || mods.length === 0) return []
  const installed = modpack?.installedModIds ?? []
  if (installed.length === 0) return []
  const lowered = new Set(installed.map((m) => m.toLowerCase()))
  return mods.filter((m) => !lowered.has(m.toLowerCase()))
}

/** 插件管理页与徽章上同一句话，避免两处措辞漂移 */
export function addonDegradationNotice(addon: string): string {
  return `因未安装 ${prettyAddonName(addon)}，已切换为数据包模式`
}

/** 依 emitTarget / customTemplate 推出自然通道（附属缺失的强制降级另有 toDatapack） */
export function naturalChannel(schema: Pick<RecipeTypeSchema, 'emitTarget' | 'customTemplate'>): GenerationChannel {
  if (schema.emitTarget) return 'kubejs-sugar'
  if (schema.customTemplate) return 'event-custom'
  return 'datapack-json'
}

/** 把通道与能力徽章写到 schema 上（渲染端只认这两个字段，不按配方类型分支） */
export function withChannel(schema: RecipeTypeSchema): RecipeTypeSchema {
  const channel = naturalChannel(schema)
  return {
    ...schema,
    channel,
    capability: channel === 'kubejs-sugar' ? 'sugar' : 'compatible',
    ...(channel === 'kubejs-sugar'
      ? {}
      : { capabilityNote: schema.emitTarget ? `语法糖目标 ${schema.emitTarget} 未启用，改走 ${channel}` : '该类型无语法糖，走 JSON 通道生成' })
  }
}

/**
 * 附属缺失 → 强制数据包 JSON。
 * emitTarget 保留下来当参考（用户若加装附属即可回到语法糖），但生效通道已经改掉，
 * 生成侧只认 channel，绝不会再去调不存在的 event.recipes.xxx。
 */
export function toDatapack(schema: RecipeTypeSchema, addon: string): RecipeTypeSchema {
  const notice = addonDegradationNotice(addon)
  return {
    ...schema,
    channel: 'datapack-json',
    capability: 'compatible',
    capabilityNote: notice,
    notes: [...(schema.notes ?? []), notice]
  }
}

/**
 * 附属缺失时的降级决策：需要降级就返回降级后的 schema，否则原样返回。
 * loader 与 codegen 都走这里，保证「插件页提示」与「实际生成通道」同源。
 */
export function applyAddonCapability(schema: RecipeTypeSchema, state: AddonState | null): RecipeTypeSchema {
  const based = withChannel(schema)
  if (!state || state.installed || based.channel === 'datapack-json') return based
  return toDatapack(based, state.addon)
}
