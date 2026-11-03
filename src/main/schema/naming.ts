/**
 * 语义命名层（规格 3.6.13）：字段名 / 枚举值名 → 对人可读的中文。
 * 三层词典：① 内置常见字段映射 ② 命名规律推断（`*_id` / `require_*` / `*Mod` / `*_item` / `*_tag`）
 * ③ 原样回退（**绝不允许返回空串**——空白比原始字段名更糟）。
 * 枚举值优先取模组 lang，取不到用内置词典，再取不到原样显示。
 *
 * 本模块只做「显示名」，不参与能力判定，也不声明任何「模组 → 配方类型」事实。
 */
import type { FieldKind } from '../../shared/types'

export interface NamingContext {
  /** 插件 / L0 提供的字段名覆盖（最高优先） */
  fieldNames?: Record<string, string>
  /** 插件 / L0 提供的枚举值名覆盖（最高优先） */
  valueNames?: Record<string, string>
  /** 模组 lang 合并表：键为 lang 键或值 ID，值为本地化文本 */
  modLang?: Record<string, string>
}

/** §3.6.4 步骤 8 列出的常见字段 + §3.6.13 反面教材字段，全部为通用英文词根，不含模组专属猜测。 */
export const BUILTIN_FIELD_NAMES: Record<string, string> = {
  ingredient: '原料',
  ingredients: '原料列表',
  input: '输入',
  inputs: '输入列表',
  itemInput: '物品输入',
  fluidInput: '流体输入',
  gasInput: '气体输入',
  slurryInput: '浆液输入',
  chemicalInput: '化学品输入',
  chemicalType: '化学品类型',
  leftInput: '左侧输入',
  rightInput: '右侧输入',
  mainInput: '主输入',
  extraInput: '附加输入',
  activation_item: '激活物',
  activationItem: '激活物',
  result: '产物',
  results: '产物列表',
  output: '输出',
  outputs: '输出列表',
  itemOutput: '物品输出',
  fluidOutput: '流体输出',
  gasOutput: '气体输出',
  leftGasOutput: '左侧气体输出',
  rightGasOutput: '右侧气体输出',
  mainOutput: '主产物',
  secondaryOutput: '副产物',
  secondaryChance: '副产物概率',
  byproducts: '副产物列表',
  secondaries: '概率副产物',
  slag: '矿渣',
  energy: '耗能',
  energyRequired: '所需耗能',
  energyMultiplier: '耗能倍率',
  time: '耗时',
  duration: '持续时长',
  processingTime: '加工时长',
  cookingTime: '烧炼时长',
  cookTime: '烧炼时长',
  experience: '经验',
  xp: '经验',
  chance: '概率',
  probability: '概率',
  weight: '权重',
  temperature: '温度',
  pressure: '压力',
  fluid: '流体',
  count: '数量',
  amount: '用量',
  size: '数量',
  catalyst: '催化剂',
  charge: '电荷',
  pattern: '排列',
  key: '图例',
  keys: '图例',
  tool: '工具',
  base: '基底',
  addition: '添加物',
  additives: '添加物列表',
  additives_secondary: '次要添加物列表',
  container: '容器',
  tank: '储液罐',
  mana: '魔力',
  source_cost: '源质消耗',
  pentacle_id: '法阵等级',
  ritual: '仪式（JEI 占位物）',
  require_sacrifice: '需要活体献祭',
  require_item_use: '需要物品使用',
  infusionInput: '灌注物',
  infusion_type: '灌注类型',
  recipe_mod: '配方倍率',
  recipeMod: '配方倍率',
  speed: '速度',
  speed_multiplier: '速度倍率',
  heat: '热量',
  heatRequirement: '加热需求',
  mode: '模式',
  circumstance: '触发环境',
  top: '上部',
  bottom: '底部',
  middle: '中部',
  center: '中心',
  block: '方块',
  nbt: 'NBT 约束',
  type: '配方类型',
  sequential: '顺序合成',
  transitionalItem: '过渡物品',
  loops: '循环次数',
  grid: '网格',
  category: '分类',
  group: '分组'
}

/** 枚举值词典（仅用于显示，取值仍以样本 / lang 为准）。 */
export const BUILTIN_VALUE_NAMES: Record<string, string> = {
  'occultism:craft_foliot': '狐狸精法阵（Tier 1）',
  'occultism:craft_djinni': '巨灵法阵（Tier 2）',
  'occultism:craft_afrit': '阿夫利特法阵（Tier 3）',
  'occultism:craft_wild_djinni': '狂野巨灵法阵（Tier 2）',
  'occultism:summon_deamon_chario': '召唤夏里奥',
  'mekanism:redstone': '红石（INF）',
  'mekanism:carbon': '碳（INF）',
  'mekanism:gold': '金（INF）',
  'mekanism:lapis': '青金石（INF）',
  'mekanism:obsidian': '黑曜石（INF）',
  'mekanism:diamond': '钻石（INF）',
  'mekanism:refined_obsidian': 'refined 黑曜石（INF）',
  'mekanism:oxygen': '氧气（GAS）',
  'mekanism:hydrogen': '氢气（GAS）',
  'mekanism:chlorine': '氯气（GAS）',
  'mekanism:sodium': '钠（GAS）',
  'mekanism:lithium': '锂（GAS）',
  'mekanism:ethene': '乙烯（GAS）',
  'ae2:inscribe': '压印（不消耗模板）',
  'ae2:press': '压制（消耗模板）',
  inscribe: '压印（不消耗模板）',
  press: '压制（消耗模板）',
  fluid: '投入流体',
  explosion: '被爆炸波及',
  heat: '吸热',
  cool: '放热',
  none: '无',
  heated: '需加热',
  superheated: '需过热',
  melting: '熔化',
  smoking: 'Smoking',
  sandpaper: '砂纸打磨'
}

/** 词根 → 中文（用于拆分未知字段名，属通用英文，不是模组字段表）。 */
const ROOT_NAMES: Record<string, string> = {
  item: '物品',
  items: '物品',
  fluid: '流体',
  gas: '气体',
  tag: '标签',
  block: '方块',
  state: '状态',
  input: '输入',
  output: '输出',
  result: '产物',
  ingredient: '原料',
  count: '数量',
  amount: '用量',
  chance: '概率',
  energy: '耗能',
  time: '时长',
  temp: '温度',
  pressure: '压力',
  catalyst: '催化剂',
  mod: '倍率',
  id: '类型',
  require: '需要',
  pentacle: '法阵',
  ritual: '仪式',
  infusion: '灌注',
  slurry: '浆液',
  pigment: '色素',
  crystal: '晶簇',
  secondary: '副',
  primary: '主',
  activate: '激活'
}

const SUFFIX_RULES: { re: RegExp; build: (head: string) => string }[] = [
  { re: /^require_(.+)$/u, build: (h) => `需要${describeSnake(h)}` },
  { re: /^(.+)_id$/u, build: (h) => `${describeSnake(h)}类型` },
  { re: /^(.+)_item$/u, build: (h) => `${describeSnake(h)}物品` },
  { re: /^(.+)_items$/u, build: (h) => `${describeSnake(h)}物品列表` },
  { re: /^(.+)_tag$/u, build: (h) => `${describeSnake(h)}标签` },
  { re: /^(.+)_fluid$/u, build: (h) => `${describeSnake(h)}流体` },
  { re: /^(.+)_amount$/u, build: (h) => `${describeSnake(h)}用量` },
  { re: /^(.+)_count$/u, build: (h) => `${describeSnake(h)}数量` },
  { re: /^(.+)_chance$/u, build: (h) => `${describeSnake(h)}概率` },
  { re: /^(.+)_mod$/u, build: (h) => `${describeSnake(h)}倍率` },
  { re: /^(.+)_multiplier$/u, build: (h) => `${describeSnake(h)}倍率` }
]

function splitWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length > 0)
}

function describeSnake(head: string): string {
  const parts = splitWords(head)
  if (parts.length === 0) return head
  return parts.map((w) => ROOT_NAMES[w] ?? w).join('')
}

/** 字段 → 显示名：内置词典 → 模式推断 → 原样可读回退（永不空白）。 */
export function displayNameForField(key: string, ctx?: NamingContext): string {
  const override = ctx?.fieldNames?.[key]
  if (override && override.trim().length > 0) return override.trim()
  const exact = BUILTIN_FIELD_NAMES[key]
  if (exact) return exact
  for (const rule of SUFFIX_RULES) {
    const m = rule.re.exec(key)
    if (m?.[1]) return rule.build(m[1])
  }
  const camel = BUILTIN_FIELD_NAMES[key.replace(/_([a-z])/gu, (_, c: string) => c.toUpperCase())]
  if (camel) return camel
  const words = splitWords(key)
  if (words.length > 0) {
    const zh = words.map((w) => ROOT_NAMES[w] ?? w).join(' ')
    if (zh.trim().length > 0) return zh
  }
  return key
}

/** 值 ID → lang 键候选（`ns:path` → `ns.path` / 去掉 ns 的 `path`）。 */
function langKeysOf(value: string): string[] {
  const flat = value.replace(/:/gu, '.').replace(/[/-]/gu, '.')
  const noNs = value.includes(':') ? value.split(':')[1] ?? value : value
  return [flat, noNs.replace(/[/-]/gu, '.'), value]
}

/** 枚举值 → 显示名：valueNames 覆盖 → 模组 lang → 内置词典 → 原样（永不空白）。 */
export function displayNameForValue(value: string, ctx?: NamingContext): string {
  const override = ctx?.valueNames?.[value]
  if (override && override.trim().length > 0) return override.trim()
  if (ctx?.modLang) {
    for (const k of langKeysOf(value)) {
      const hit = ctx.modLang[k]
      if (hit && hit.trim().length > 0) return hit.trim()
    }
  }
  const exact = BUILTIN_VALUE_NAMES[value]
  if (exact) return exact
  const lower = value.toLowerCase()
  const byLower = BUILTIN_VALUE_NAMES[lower]
  if (byLower) return byLower
  return value
}

/** §3.4 视觉分区：产物右 / 材料左 / 其余下。纯英文词根判定，不按模组分支。 */
export function zoneForField(key: string): 'input' | 'output' | 'extra' {
  const words = splitWords(key)
  if (words.some((w) => w === 'output' || w === 'outputs' || w === 'result' || w === 'results' || w === 'product' || w === 'slag' || w === 'byproduct')) return 'output'
  if (words.some((w) => w === 'input' || w === 'ingredient' || w === 'catalyst' || w === 'additive' || w === 'template' || w === 'tool' || w === 'base' || w === 'mold')) return 'input'
  return 'extra'
}

/** 语义角色：`role:'requirement'` 进前置条件摘要条（§3.6.13）。 */
export function roleForField(key: string, kind: FieldKind): 'requirement' | 'input' | 'output' | 'extra' {
  const words = splitWords(key)
  if (words.includes('require') || key === 'pentacle_id' || key === 'activation_item' || key === 'activationItem') return 'requirement'
  const zone = zoneForField(key)
  if (zone === 'output') return 'output'
  if (kind === 'number' || kind === 'boolean' || kind === 'text' || kind === 'choice') return 'extra'
  return zone
}

/** 把字符串数组变成 choice 选项（含 lang / 词典取名）。 */
export function choicesFromValues(values: readonly string[], ctx?: NamingContext): { value: string; label: string }[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en')).map((value) => ({ value, label: displayNameForValue(value, ctx) }))
}

/** 模组显示名：优先已扫描到的 lang `namespaced` 文本，回退命名空间本身。 */
export function modDisplayName(modId: string, ctx?: NamingContext): string {
  const hit = ctx?.modLang?.[`pack.${modId}`] ?? ctx?.modLang?.[modId]
  if (hit && hit.trim().length > 0) return hit.trim()
  return splitWords(modId).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || modId
}
