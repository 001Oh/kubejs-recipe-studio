/**
 * 规范化数据 + Schema 的校验器（P-B 纯函数）。
 * **只依赖 NormalizedRecipe 与 NormalizedSchema**：不 import electron / 扫描器 / 界面。
 * 唯一的外部能力是可选注入的 `itemExists`（由调用方决定数据源）。
 */
import type {
  NormalizedRecipe,
  NormalizedSchema,
  NormalizedSchemaSlot,
  NormalizedValue,
  SchemaDiagnostic,
  SlotConstraints
} from './schemaModel'

const ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/

export interface ValidateContext {
  itemExists?: (id: string) => boolean
  /** 以 schema 的约束为准；缺省时也做基本形态检查 */
  constraints?: Record<string, SlotConstraints>
}

function checkAmounts(
  slot: NormalizedSchemaSlot,
  value: NormalizedValue,
  diagnostics: SchemaDiagnostic[]
): void {
  const label = slot.key
  if (value.kind === 'fluid') {
    const n = value.amount?.numeric
    if (value.amount && (n === null || n === undefined || !Number.isInteger(n) || n <= 0)) {
      diagnostics.push({
        level: 'error',
        code: 'FLUID_AMOUNT_INVALID',
        field: label,
        path: value.path,
        message: `${label} 的流体量必须是正整数 mB，当前为 ${JSON.stringify(value.amount.raw)}`
      })
    }
  }
  if (value.kind === 'item' || value.kind === 'tag' || value.kind === 'fluid') {
    const chance = value.chance?.numeric
    if (value.chance && (chance === null || chance === undefined || chance < 0 || chance > 1)) {
      diagnostics.push({
        level: 'error',
        code: 'CHANCE_OUT_OF_RANGE',
        field: label,
        path: value.path,
        message: `${label} 的概率必须在 0–1 之间，当前为 ${JSON.stringify(value.chance.raw)}`
      })
    }
  }
  if (value.kind === 'item' || value.kind === 'tag') {
    const count = value.count?.numeric
    if (value.count && (count === null || count === undefined || !Number.isInteger(count) || count <= 0)) {
      diagnostics.push({
        level: 'error',
        code: 'INTEGER_INVALID',
        field: label,
        path: value.path,
        message: `${label} 的数量必须是正整数，当前为 ${JSON.stringify(value.count.raw)}`
      })
    }
  }
}

function checkRef(
  slot: NormalizedSchemaSlot,
  value: NormalizedValue,
  ctx: ValidateContext,
  diagnostics: SchemaDiagnostic[]
): void {
  if (value.kind === 'unknown') {
    diagnostics.push({
      level: 'warn',
      code: 'TYPE_MISMATCH',
      field: slot.key,
      path: value.path,
      message: `${slot.key} 的取值无法识别成引用（保留原值）`
    })
    return
  }
  const constraints = ctx.constraints?.[slot.key]
  if (constraints?.mustBe && value.kind !== constraints.mustBe) {
    diagnostics.push({
      level: 'error',
      code: 'MUST_BE_INVALID',
      field: slot.key,
      path: value.path,
      message: `${slot.key} 要求 ${constraints.mustBe}，当前是 ${value.kind}`
    })
  }
  if ('id' in value && typeof value.id === 'string') {
    const pattern = constraints?.pattern ?? ID_PATTERN
    if (!new RegExp(pattern).test(value.id)) {
      diagnostics.push({
        level: 'error',
        code: 'PATTERN_INVALID',
        field: slot.key,
        path: value.path,
        message: `${slot.key} 的引用 ID 形态不合法：${value.id}`,
        hint: '应为 namespace:path'
      })
    }
    if (value.kind === 'item' && ctx.itemExists && !ctx.itemExists(value.id)) {
      diagnostics.push({
        level: 'warn',
        code: 'REF_UNKNOWN_ITEM',
        field: slot.key,
        path: value.path,
        message: `未知物品：${value.id} 不在本包索引中（不阻断）`
      })
    }
  }
  checkAmounts(slot, value, diagnostics)
}

function checkScalar(
  slot: NormalizedSchemaSlot,
  value: NormalizedValue,
  constraints: SlotConstraints | undefined,
  diagnostics: SchemaDiagnostic[]
): void {
  if (value.kind !== 'scalar') return
  const v = value.value
  if (constraints?.enum && (typeof v !== 'string' || !constraints.enum.includes(v))) {
    diagnostics.push({
      level: 'error',
      code: 'ENUM_INVALID',
      field: slot.key,
      path: value.path,
      message: `${slot.key} 只能是 ${constraints.enum.join(' / ')}，当前为 ${JSON.stringify(v)}`
    })
  }
  if (typeof v === 'number' && constraints) {
    if (constraints.integer && !Number.isInteger(v)) {
      diagnostics.push({ level: 'error', code: 'INTEGER_INVALID', field: slot.key, path: value.path, message: `${slot.key} 必须是整数` })
    }
    if (constraints.min !== undefined && v < constraints.min) {
      diagnostics.push({ level: 'error', code: 'RANGE_INVALID', field: slot.key, path: value.path, message: `${slot.key} 不能小于 ${constraints.min}` })
    }
    if (constraints.max !== undefined && v > constraints.max) {
      diagnostics.push({ level: 'error', code: 'RANGE_INVALID', field: slot.key, path: value.path, message: `${slot.key} 不能大于 ${constraints.max}` })
    }
  }
}

export function validateNormalized(
  recipe: NormalizedRecipe,
  schema: NormalizedSchema,
  ctx: ValidateContext = {}
): SchemaDiagnostic[] {
  const out: SchemaDiagnostic[] = []
  if (recipe.typeId !== schema.id) {
    out.push({
      level: 'error',
      code: 'MUST_BE_INVALID',
      field: 'type',
      message: `配方类型 ${recipe.typeId} 与 schema ${schema.id} 不匹配`
    })
  }
  for (const slotSchema of [...schema.slots, ...schema.outputs]) {
    const slot = recipe.slots.find((s) => s.key === slotSchema.key)
    const constraints = slotSchema.constraints ?? ctx.constraints?.[slotSchema.key]
    if (!slot || slot.value === null) {
      if (slotSchema.required) {
        out.push({
          level: 'error',
          code: 'REQUIRED_MISSING',
          field: slotSchema.key,
          message: `缺少必填字段 ${slotSchema.key}`,
          hint: '在表单里填入或从原始配方重载'
        })
      }
      continue
    }
    const value = slot.value
    if (value.kind === 'list') {
      if (!slotSchema.multiple) {
        out.push({ level: 'warn', code: 'TYPE_MISMATCH', field: slotSchema.key, message: `${slotSchema.key} 是列表，但 schema 声明为单值` })
      }
      if (constraints?.minItems !== undefined && value.of.length < constraints.minItems) {
        out.push({ level: 'error', code: 'ITEMS_COUNT_INVALID', field: slotSchema.key, path: value.path, message: `${slotSchema.key} 至少需要 ${constraints.minItems} 项` })
      }
      if (constraints?.maxItems !== undefined && value.of.length > constraints.maxItems) {
        out.push({ level: 'error', code: 'ITEMS_COUNT_INVALID', field: slotSchema.key, path: value.path, message: `${slotSchema.key} 最多 ${constraints.maxItems} 项` })
      }
      for (const item of value.of) {
        if (!item) continue
        if (item.kind === 'scalar') checkScalar(slotSchema, item, constraints, out)
        else checkRef(slotSchema, item, ctx, out)
      }
      continue
    }
    if (slotSchema.multiple) {
      out.push({ level: 'warn', code: 'TYPE_MISMATCH', field: slotSchema.key, path: value.path, message: `${slotSchema.key} 应为列表，当前是单值` })
    }
    if (value.kind === 'scalar') checkScalar(slotSchema, value, constraints, out)
    else checkRef(slotSchema, value, ctx, out)
  }
  return out
}

/** 方便测试与 UI 分拣 */
export function hasErrors(diagnostics: readonly SchemaDiagnostic[]): boolean {
  return diagnostics.some((d) => d.level === 'error')
}
