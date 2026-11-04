/**
 * 配方类型中文名（第 116 批：负责人要求「所有配方类型都有中文，插件加的也要有」）。
 *
 * 三级解析（recipeTypeNameZh）：
 *   1. RECIPE_TYPE_NAMES_ZH 精确命中（成熟类型的定制译名）
 *   2. NS_ZH + TAIL_ZH 组合（「命名空间中文 · 动作中文」——覆盖绝大多数数据驱动类型）
 *   3. fallback（schema 显式 displayName / 英文派生名 / id）——插件若自带中文 displayName
 *      应直接写入 schema.displayName（如 occultism 示例插件），优先级高于本表
 *
 * 未命中的类型一律走 fallback，不猜译名。
 */

/** 类型尾部动词 → 中文（按「命名空间 · 尾部」组合使用） */
const TAIL_ZH: Record<string, string> = {
  shaped: '有序合成',
  shapeless: '无序合成',
  smelting: '熔炼',
  blasting: '高炉熔炼',
  smoking: '烟熏',
  campfire_cooking: '营火烹饪',
  stonecutting: '切石',
  smithing: '锻造',
  // 第 117 批实机验收：smithing_transform 无映射渲染成拉丁文「smithing transform」，
  // 违反「所有配方类型都有中文」——补整 id 与尾部两级映射
  smithing_transform: '锻造（模板改造）',
  smithing_trim: '锻造（盔甲纹饰）',
  cutting: '切割',
  crushing: '粉碎',
  milling: '研磨',
  pressing: '压制',
  compacting: '压实',
  mixing: '搅拌',
  deploying: '部署',
  filling: '注液',
  draining: '排液',
  washing: '洗涤',
  haunting: '幽匿转化',
  sequenced_assembly: '序列装配',
  mechanical_crafting: '机械合成',
  item_application: '物品应用',
  sandpaper_polishing: '砂纸打磨',
  brewing: '酿造',
  melting: '熔融',
  casting_table: '铸造台',
  casting_basin: '铸造盆',
  item_melting: '物品熔炼',
  recoloring: '染色',
  market: '市场',
  crop: '作物',
  oxidizing: '氧化',
  enriching: '富集',
  purifying: '净化',
  crystallizing: '结晶',
  combining: '结合',
  injecting: '化学注入',
  chemical_infusing: '化学灌注',
  chemical_injecting: '化学注入',
  chemical_dissolution: '化学溶解',
  chemical_washing: '化学洗涤',
  chemical_crystallizing: '化学结晶',
  metallurgic_infusing: '冶金灌注',
  infusion_conversion: '流体转化',
  gas_conversion: '气体转化',
  evaporating: '蒸发浓缩',
  activation: '激活',
  enchanting: '附魔',
  reformation: '重构',
  constructing: '组装',
  workbench_constructing: '工作台组装',
  upgrading: '升级',
  combine: '合并',
  inscriber: '压印',
  crystal_assembler: '水晶装配',
  circuit_cutter: '电路切割',
  charging: '充电',
  react: '反应',
  conversion: '转化',
  freezing: '冰冻',
  freezable: '可冰冻',
  melting_fuel: '熔炼燃料'
}

/** 命名空间 → 中文模组名（常见模组；未命中时组合降级为「modid·尾部」再降级 fallback） */
const NS_ZH: Record<string, string> = {
  minecraft: '原版',
  create: '机械动力',
  mekanism: '通用机械',
  thermal: '热力',
  botania: '植物魔法',
  immersiveengineering: '沉浸工程',
  ae2: '应用能源2',
  refinedstorage: '精炼存储',
  farmersdelight: '农夫乐事',
  hephaestus: '匠魂',
  tconstruct: '匠魂',
  productivemetalworks: '生产力金属加工',
  productivetrees: '多产树',
  productivefarming: '多产农业',
  theurgy: '神术',
  agritechevolved: '进化农业',
  farmingforblockheads: '农夫市集',
  refurbished_furniture: '翻新家具',
  extendedae: '拓展AE',
  advanced_ae: '高级AE',
  ae2wtlib: 'AE2无线终端',
  appflux: '应用通量',
  quark: '夸克',
  supplementaries: '增补件',
  aether: '天境',
  aether_ii: '天境II',
  ad_astra: '星际',
  quarryplus: '采石场+',
  chisel: '凿子',
  chipped: '碎片',
  occultism: '神秘学',
  arsmagicalegacy: '阿森魔法遗产',
  allthecompressed: 'ATM压缩',
  allthetweaks: 'ATM微调'
}

/** 整 id 定制译名（覆盖「ns+尾部」组合的优先级最高）。机器名以 MC百科 (mcmod.cn) 汉化为准 */
const RECIPE_TYPE_NAMES_ZH: Record<string, string> = {
  'minecraft:crafting_shaped': '有序合成（3×3）',
  'minecraft:crafting_shapeless': '无序合成',
  'minecraft:stonecutting': '切石',
  'minecraft:smelting': '熔炼',
  'minecraft:blasting': '高炉熔炼',
  'minecraft:smoking': '烟熏',
  'minecraft:campfire_cooking': '营火烹饪',
  'minecraft:smithing': '锻造',
  'minecraft:smithing_transform': '锻造（模板改造）',
  'minecraft:smithing_trim': '锻造（盔甲纹饰）',
  'create:mixing': '机械动力 · 动力搅拌器',
  'create:mechanical_crafting': '机械动力 · 动力合成器',
  'create:crushing': '机械动力 · 粉碎轮',
  'create:milling': '机械动力 · 磨石',
  'create:cutting': '机械动力 · 动力锯',
  'create:pressing': '机械动力 · 动力压机',
  'create:compacting': '机械动力 · 工作盆',
  'create:deploying': '机械动力 · 机械手'
}

function tailOf(typeId: string): { ns: string; tail: string } {
  const i = typeId.indexOf(':')
  if (i < 0) return { ns: '', tail: typeId }
  return { ns: typeId.slice(0, i), tail: typeId.slice(i + 1) }
}

/**
 * 配方类型的中文显示名。
 * @param typeId   配方类型 id（`create:mixing` 等）
 * @param fallback 无映射时的兜底（调用方传 schema 显式 displayName 或英文派生名）
 */
export function recipeTypeNameZh(typeId: string, fallback?: string): string {
  const exact = RECIPE_TYPE_NAMES_ZH[typeId]
  if (exact) return exact
  const { ns, tail } = tailOf(typeId)
  const nsZh = NS_ZH[ns]
  const tailZh = TAIL_ZH[tail]
  if (nsZh && tailZh) return `${nsZh} · ${tailZh}`
  return fallback ?? typeId
}
