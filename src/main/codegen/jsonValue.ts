/**
 * 槽位值 → **原样 JSON**（模式 B / event.custom 共用一份，规格 3.6.6「其余字段按 schema 原样序列化，
 * 不做任何语法转换」）。三件事由本文件统一负责：
 * 1. 引用形态：物品 `{item}` / 标签 `{tag}` / 流体 `{fluid, amount}` / 注册表对象；
 * 2. `compound` 键还原：合并进复合控件的数量/概率写回原始兄弟键名；
 * 3. 形态保真：数字保持数字、字符串保持字符串（IP 的 `chance:"0.07"` 必须还是字符串），
 *    不填 NBT 时绝不塞 `{}`（规格 §八）。
 */
import type { RecipeSlotSchema, SlotValue } from '../../shared/types'
import { fullId, isBlank, plainOf, slotList, amountOf, chanceOf, countOf, isRecord } from './values'
import type { Plain } from './values'

export interface FieldJson {
  /** 字段键对应的值 */
  value: Plain
  /** 需要还原到父级同层的其他键（compound） */
  siblings: { key: string; value: Plain }[]
}

/** 复合数量部分的原始键名匹配（语义词根，不是模组字段表） */
const PART_TOKENS: Record<'count' | 'amount' | 'chance', string[]> = {
  count: ['count', 'size'],
  amount: ['amount', 'mb', 'volume'],
  chance: ['chance', 'probability', 'prob']
}

function siblingName(field: RecipeSlotSchema, part: 'count' | 'amount' | 'chance'): string | null {
  const compound = field.compound ?? []
  for (const name of compound) {
    const lower = name.toLowerCase()
    if (PART_TOKENS[part].some((token) => lower.includes(token))) return name
  }
  return null
}

const QUANTITY_TOKENS = ['count', 'size', 'amount', 'mb', 'volume', 'chance', 'probability', 'prob']

/** 引用类值在 JSON 里的键名（物品 `item` / 标签 `tag` / 流体 `fluid` / 注册表按 schema 声明） */
export function referenceKeyOf(sv: SlotValue, field: RecipeSlotSchema): string {
  if (sv.kind === 'tag') return 'tag'
  if (sv.kind === 'fluid') return 'fluid'
  if (sv.kind === 'item') return 'item'
  // 注册表：优先 schema.compound 里声明的原始引用键名（Mekanism 灌注在 JSON 里是 `tag`），
  // 其次由 registry 名派生（`mekanism:gas` → gas、`mekanism:infuse_type` → infuse），绝不猜模组专属拼写。
  const fromCompound = (field.compound ?? []).find((k) => !QUANTITY_TOKENS.some((t) => k.toLowerCase().includes(t)))
  if (fromCompound) return fromCompound
  const registry = (field.registry ?? sv.registryType ?? '').split(':').pop() ?? ''
  const token = registry.replace(/_?types?$/i, '')
  return token || 'id'
}

/** 单个槽位 → 对象形态（`{item}` / `{fluid, amount}` / `{tag, amount}` / 注册表对象） */
export function slotValueToJson(sv: SlotValue, field?: RecipeSlotSchema): Plain {
  const schema = field ?? { key: sv.id, displayName: sv.id, kind: sv.kind, multiple: false }
  const refKey = referenceKeyOf(sv, schema)
  const id = fullId(sv.id)
  const amount = amountOf(sv)
  const chance = chanceOf(sv)
  // 注册表标量形态只在「没有复合键、也没有用量」时成立：
  // 一旦 compound 里含 amount/tag，JSON 里必须是 { tag, amount } 这样的对象，不能塌成裸字符串。
  if (
    sv.kind === 'registry' &&
    schema.emitShape === 'scalar' &&
    amount === undefined &&
    chance === undefined &&
    (schema.compound ?? []).length === 0
  ) {
    return id
  }
  const out: Record<string, Plain> = { [refKey]: id }
  if (sv.kind === 'fluid' || sv.kind === 'registry') {
    const qty = amount ?? countOf(sv)
    if (qty !== undefined) out['amount'] = qty
  } else {
    const count = countOf(sv)
    if (count !== undefined) out['count'] = count
  }
  if (chance !== undefined) {
    // 形态保真：样本里概率是字符串（IP 的 "0.07"）就原样写回字符串，绝不悄悄转成数字
    const rawChance = (sv as { chance?: unknown }).chance
    out['chance'] = typeof rawChance === 'string' ? rawChance : chance
  }
  // NBT 只在用户显式给了约束时写出（规格：不填 NBT 不自动写 {}）
  if (sv.nbt !== undefined && sv.nbt !== null) {
    const nbt = plainOf(sv.nbt)
    if (nbt !== undefined) out['nbt'] = nbt
  }
  return out
}

/**
 * 引用类字段的 compound 还原：`{base_ingredient:{...}, count:4}` 这类「原键名在父级」的写法。
 * 命中 compound 的数量部分从对象里挪到兄弟键，未命中则保持嵌套（原版规范）。
 */
function hoistCompound(field: RecipeSlotSchema, nested: Plain, siblings: { key: string; value: Plain }[]): Plain {
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return nested
  const obj = nested as Record<string, Plain>
  // compound 同时列出了引用键本身（如 Mekanism 的 ['amount','tag']）时，说明这些键都属于
  // 这个对象内部（`infusionInput: { tag, amount }`），不是父级的兄弟键，绝不外提。
  const compound = field.compound ?? []
  const refKeys = ['item', 'tag', 'fluid', 'id']
  if (compound.some((k) => refKeys.includes(k.toLowerCase()))) return nested
  const moves: [string, 'count' | 'amount' | 'chance'][] = [
    ['count', 'count'],
    ['amount', 'amount'],
    ['chance', 'chance']
  ]
  const result: Record<string, Plain> = { ...obj }
  for (const [innerKey, part] of moves) {
    const name = siblingName(field, part)
    if (!name || !(innerKey in result)) continue
    siblings.push({ key: name, value: result[innerKey] as Plain })
    delete result[innerKey]
  }
  return result
}

export function fieldJson(field: RecipeSlotSchema, value: unknown): FieldJson | null {
  if (isBlank(value)) return null
  const siblings: { key: string; value: Plain }[] = []
  const refLike = field.kind === 'item' || field.kind === 'fluid' || field.kind === 'tag' || field.kind === 'registry'
  if (refLike) {
    const list = slotList(value)
    if (list.length > 0) {
      if (list.length === 1 && !field.multiple && !Array.isArray(value)) {
        return { value: hoistCompound(field, slotValueToJson(list[0] as SlotValue, field), siblings), siblings }
      }
      return { value: list.map((sv) => slotValueToJson(sv, field)), siblings }
    }
  }
  if (field.kind === 'struct' && isRecord(value) && Array.isArray(field.fields) && field.fields.length > 0) {
    const obj: Record<string, Plain> = {}
    for (const sub of field.fields) {
      const child = fieldJson(sub, value[sub.key])
      if (!child) continue
      obj[sub.key] = child.value
      for (const sib of child.siblings) siblings.push(sib)
    }
    return Object.keys(obj).length > 0 ? { value: obj, siblings } : null
  }
  if (Array.isArray(value)) {
    const items: Plain[] = []
    for (const item of value) {
      const child = fieldJson({ ...field, multiple: false }, item)
      if (child) items.push(child.value)
    }
    return items.length > 0 ? { value: items, siblings } : null
  }
  const raw = plainOf(value)
  if (raw === undefined) return null
  return { value: raw, siblings }
}
