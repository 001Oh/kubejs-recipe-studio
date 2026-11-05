/**
 * 草稿值 → 规范化值的纯函数（P-C3 由渲染端与主进程提交共用）。
 *
 * 不变量：
 * - 只写 dirtyFields；未改动的列表项复用 Normalized 原值（保留原始形态与数值类型）；
 * - 编辑引用时保留 UI 没有控件的 extras / NBT / refKey；
 * - shaped 的网格逐格比对，未改格子不被无谓重写。
 */
import type { NormalizedRecipe, NormalizedSchema, NormalizedValue } from './schemaModel'
import type { SlotValue, WorkbenchState } from './types'
import { BENCH_GRID_KEY, BENCH_OUTPUTS_KEY } from './constants'

/** WorkbenchState 的脏字段值 → NormalizedValue（保持对象形态，数值类型沿用 UI 数字） */
function slotToNormalized(slot: SlotValue | null): NormalizedValue | null {
  if (!slot) return null
  const count = slot.count !== undefined ? { raw: slot.count, numeric: slot.count } : undefined
  const amountRaw = slot.amount ?? slot.count
  const amount = amountRaw !== undefined ? { raw: amountRaw, numeric: amountRaw } : undefined
  const chance = slot.chance !== undefined ? { raw: slot.chance, numeric: slot.chance } : undefined
  if (slot.kind === 'tag') {
    return {
      kind: 'tag',
      id: slot.id,
      asObject: true,
      ...(count ? { count } : {}),
      ...(chance ? { chance } : {}),
      ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
    }
  }
  if (slot.kind === 'fluid') {
    return {
      kind: 'fluid',
      id: slot.id,
      asObject: true,
      ...(amount ? { amount } : {}),
      ...(chance ? { chance } : {}),
      ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
    }
  }
  if (slot.kind === 'registry') {
    return {
      kind: 'registry',
      registry: slot.registryType ?? 'unknown:registry',
      id: slot.id,
      asObject: true,
      ...(amount ? { amount } : {}),
      ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
    }
  }
  return {
    kind: 'item',
    id: slot.id,
    asObject: true,
    ...(count ? { count } : {}),
    ...(chance ? { chance } : {}),
    ...(slot.nbt !== undefined ? { nbt: slot.nbt } : {})
  }
}

/** 比较「UI 格子」与「规范化原值」是否语义相同（相同则保留原始 JSON 形态与数值类型） */
function cellMatches(orig: NormalizedValue | null, slot: SlotValue | null): boolean {
  if (!orig || !slot) return orig === null && slot === null
  if (orig.kind !== 'item' && orig.kind !== 'tag' && orig.kind !== 'fluid' && orig.kind !== 'registry') return false
  if (orig.kind !== slot.kind) return false
  if (orig.id !== slot.id) return false
  if (orig.kind === 'registry' && (orig.registry ?? '') !== (slot.registryType ?? '')) return false
  const origCount =
    orig.kind === 'item' || orig.kind === 'tag' ? orig.count?.raw : orig.kind === 'fluid' || orig.kind === 'registry' ? orig.amount?.raw : undefined
  const slotCount = orig.kind === 'fluid' || orig.kind === 'registry' ? slot.amount ?? slot.count : slot.count
  if (origCount === undefined ? slotCount !== undefined : slotCount === undefined || Number(origCount) !== slotCount) return false
  const origChance = orig.kind === 'item' || orig.kind === 'tag' ? orig.chance?.raw : undefined
  if (origChance === undefined ? slot.chance !== undefined : slot.chance === undefined || Number(origChance) !== slot.chance) return false
  const sameNbt =
    orig.nbt === undefined ? slot.nbt === undefined : slot.nbt !== undefined && JSON.stringify(orig.nbt) === JSON.stringify(slot.nbt)
  return sameNbt
}

/** 编辑引用时保留原条目里的 extras / NBT / refKey / 形态（UI 没有对应控件，不能因为改 id 就丢） */
function preserveHiddenRefFields(orig: NormalizedValue | null, next: NormalizedValue | null): NormalizedValue | null {
  if (!orig || !next || orig.kind !== next.kind) return next
  if (orig.kind !== 'item' && orig.kind !== 'tag' && orig.kind !== 'fluid' && orig.kind !== 'registry') return next
  const base = next as Record<string, unknown>
  if (orig.extras && Object.keys(orig.extras).length > 0) base['extras'] = orig.extras
  if (orig.nbt !== undefined && base['nbt'] === undefined) base['nbt'] = orig.nbt
  // 引用键形态（tag / fluidTag / gas…）是原始 JSON 的一部分，不能因为只改数量就换成默认 fluid
  if (orig.refKey !== undefined && base['refKey'] === undefined) base['refKey'] = orig.refKey
  // asObject 语义（B121 复核）：「未改动的值」由 base 复用保原形态；「编辑后的新值」按
  // UI 产出的对象形态写出（slotToNormalized asObject:true）。此处不镜像 orig.asObject=false——
  // 否则裸串引用加数量时 count 会被 toJsonValue 丢弃（裸串承载不了数量）。
  if (orig.asObject === true) base['asObject'] = true
  return next
}

const REF_SLOT_KINDS = new Set(['item', 'fluid', 'tag', 'registry'])

/** 工作台值是否是可单写的引用槽（item/fluid/tag/registry 对象）；struct 等其它对象形态不在此列 */
function isWritableRefSlot(value: unknown): value is SlotValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    REF_SLOT_KINDS.has((value as { kind?: unknown }).kind as string) &&
    typeof (value as { id?: unknown }).id === 'string'
  )
}

/**
 * 把草稿里的脏字段写回规范化副本（只动脏字段，其余保持原值）。
 *
 * B121/R-1：`schema` 为可选的形态仲裁——multiple 语义优先取 schema 声明，
 * 缺省回退「原值是 list ⇒ multiple」启发（生产两个调用点都传 schema）。
 */
export function applyDraftToNormalized(
  normalized: NormalizedRecipe,
  workbench: WorkbenchState,
  dirtyFields: readonly string[],
  schema?: NormalizedSchema
): NormalizedRecipe {
  if (dirtyFields.length === 0) return normalized
  const copy = JSON.parse(JSON.stringify(normalized)) as NormalizedRecipe
  const multipleByKey = new Map<string, boolean>()
  for (const s of [...(schema?.slots ?? []), ...(schema?.outputs ?? [])]) multipleByKey.set(s.key, s.multiple)
  for (const key of dirtyFields) {
    // UI 产物列表键是 outputs；单产物草稿的规范化槽位可能叫 result
    const slot =
      copy.slots.find((s) => s.key === key) ?? (key === BENCH_OUTPUTS_KEY ? copy.slots.find((s) => s.key === 'result') : undefined)
    if (!slot) continue
    if (slot.key === BENCH_GRID_KEY) {
      const cells = Array.isArray(workbench.values[BENCH_GRID_KEY])
        ? (workbench.values[BENCH_GRID_KEY] as (SlotValue | null)[])
        : []
      const original = slot.value?.kind === 'list' ? slot.value.of : []
      slot.value = {
        kind: 'list',
        path: slot.path,
        of: cells.map((cell, i) =>
          cellMatches(original[i] ?? null, cell)
            ? original[i] ?? null
            : preserveHiddenRefFields(original[i] ?? null, slotToNormalized(cell))
        )
      }
      continue
    }
    if (slot.key === 'result') {
      const outputs = Array.isArray(workbench.values[BENCH_OUTPUTS_KEY])
        ? (workbench.values[BENCH_OUTPUTS_KEY] as SlotValue[])
        : []
      const own = Array.isArray(workbench.values[slot.key]) ? (workbench.values[slot.key] as SlotValue[]) : []
      const candidate = outputs[0] ?? own[0] ?? null
      slot.value = preserveHiddenRefFields(slot.value, slotToNormalized(candidate))
      continue
    }
    // B121/R-1：写入约定统一。此前本分支只认数组——单对象/标量/null 的脏值被静默跳过
    //（键通过了槽位校验，值却不写入 normalized → 提交成功但改动丢失）。
    // 形态规则与 normalize.convertSlot 对齐：multiple 槽收数组（单值包成单元素列表）；
    // 单值槽收单对象/数组首元素/标量/null。
    const rawValue: unknown = workbench.values[key]
    const multiple = multipleByKey.get(key) ?? slot.value?.kind === 'list'
    if (multiple) {
      const listValue = Array.isArray(rawValue)
        ? (rawValue as unknown[])
        : rawValue === null || rawValue === undefined
          ? []
          : [rawValue]
      const original = slot.value?.kind === 'list' ? slot.value.of : []
      slot.value = {
        kind: 'list',
        path: slot.path,
        of: listValue.map((cell, i) => {
          if (cell === null || cell === undefined) return null
          if (isWritableRefSlot(cell)) {
            if (cellMatches(original[i] ?? null, cell)) return original[i] ?? null
            return preserveHiddenRefFields(original[i] ?? null, slotToNormalized(cell))
          }
          if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
            return { kind: 'scalar', value: cell, path: slot.path }
          }
          // 未支持的形态（嵌套对象等）：保原值，绝不发明数据；struct 编辑层接线时补分支
          return original[i] ?? null
        })
      }
      continue
    }
    // 单值槽：数组取首元素（与 normalize「单值槽遇到数组取第一个」同规则），
    // 未编辑过的元素复用原值（保留原始形态与数值类型）
    const single = Array.isArray(rawValue) ? ((rawValue as unknown[])[0] ?? null) : rawValue === undefined ? null : rawValue
    if (single === null) {
      // 「用户清空」与 normalize 的缺键语义一致：置 null，denormalize 保留原文件值
      slot.value = null
      continue
    }
    if (typeof single === 'number' || typeof single === 'boolean' || typeof single === 'string') {
      slot.value = { kind: 'scalar', value: single, path: slot.path }
      continue
    }
    // B121/R-1：struct 槽的草稿写是嵌套对象——按子字段逐个应用，未提及的子字段与
    // struct.unknowns（未认领子树，S-1 保真的载体）原样保留，绝不整体替换。
    const origStruct = slot.value && slot.value.kind === 'struct' ? slot.value : null
    if (origStruct && typeof single === 'object' && !Array.isArray(single)) {
      const draftObj = single as Record<string, unknown>
      const fields: Record<string, NormalizedValue> = {}
      for (const [subKey, subValue] of Object.entries(origStruct.fields)) {
        if (!(subKey in draftObj)) {
          fields[subKey] = subValue
          continue
        }
        const incoming = draftObj[subKey]
        if (incoming === null || incoming === undefined) {
          fields[subKey] = subValue
          continue
        }
        if (subValue.kind === 'list') {
          const arr = Array.isArray(incoming) ? incoming : [incoming]
          fields[subKey] = {
            kind: 'list',
            path: subValue.path,
            of: arr.map((cell, i) => {
              if (cell === null || cell === undefined) return null
              if (isWritableRefSlot(cell)) {
                const origCell = subValue.of[i] ?? null
                if (cellMatches(origCell, cell)) return origCell
                return preserveHiddenRefFields(origCell, slotToNormalized(cell))
              }
              if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
                return { kind: 'scalar', value: cell, path: subValue.path }
              }
              return subValue.of[i] ?? null
            })
          }
          continue
        }
        if (isWritableRefSlot(incoming)) {
          const origCell = subValue.kind === 'item' || subValue.kind === 'fluid' || subValue.kind === 'tag' || subValue.kind === 'registry' ? subValue : null
          if (cellMatches(origCell, incoming)) {
            fields[subKey] = origCell as NormalizedValue
          } else {
            // incoming 已收窄为 SlotValue，slotToNormalized 对合法引用必产出值（签名保守为可空）
            const next = slotToNormalized(incoming) as NormalizedValue
            fields[subKey] = preserveHiddenRefFields(origCell, next) ?? next
          }
          continue
        }
        if (typeof incoming === 'string' || typeof incoming === 'number' || typeof incoming === 'boolean') {
          fields[subKey] = { kind: 'scalar', value: incoming, path: subValue.path }
          continue
        }
        fields[subKey] = subValue
      }
      slot.value = {
        kind: 'struct',
        fields,
        ...(origStruct.unknowns ? { unknowns: origStruct.unknowns } : {}),
        path: origStruct.path
      }
      continue
    }
    if (isWritableRefSlot(single)) {
      const origSingle = slot.value && slot.value.kind !== 'list' ? slot.value : null
      if (cellMatches(origSingle, single)) {
        slot.value = origSingle
      } else {
        slot.value = preserveHiddenRefFields(origSingle, slotToNormalized(single))
      }
    }
    // 其余对象形态暂无挂载的编辑入口；待 struct 编辑层接线时补分支，
    // 绝不静默丢弃——保持原值不动比写进错误形态安全
  }
  return copy
}

/** 递归判断规范化值里是否含完全无法表达的引用（UI 没有可编辑形态） */
export function containsUnknownValue(value: NormalizedValue | null): boolean {
  if (!value) return false
  if (value.kind === 'unknown') return true
  if (value.kind === 'list') return value.of.some(containsUnknownValue)
  if (value.kind === 'struct') return Object.values(value.fields).some(containsUnknownValue)
  return false
}

/** 草稿是否存在阻止安全回写的引用（提交层必须独立再查一次） */
export function hasUnsafeUnknown(normalized: NormalizedRecipe): boolean {
  return normalized.slots.some((slot) => containsUnknownValue(slot.value))
}
