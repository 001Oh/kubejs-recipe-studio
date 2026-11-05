/**
 * P-C1：规范化模型 ↔ 现有 WorkbenchState 的适配（渲染端纯函数，无 IO）。
 *
 * 约束：
 * - WorkbenchState 只是 UI 适配目标，不承载未知字段；未知字段走 `passThrough`；
 * - 未修改时 `draftPreview` 直接回原始结构（优先原文），不做无意义的 JSON 重建；
 * - 编辑后只重写脏字段，其余字段（含未知字段、原始 JSON 类型）逐值保留。
 */
import type { OpenedRecipe } from '@shared/ipc'
import type {
  NormalizedRecipe,
  NormalizedSchema,
  NormalizedValue,
  SchemaDiagnostic,
  UnknownField
} from '@shared/schemaModel'
import type { BenchValues, SlotValue, WorkbenchState } from '@shared/types'
import { BENCH_GRID_KEY, BENCH_OUTPUTS_KEY, GRID_DEFAULT_SIZE } from '@shared/constants'
import { denormalizeRecipe } from '@shared/normalize'
import { createDraftMeta, type RecipeDraftMeta } from '@shared/draftState'
import { applyDraftToNormalized, containsUnknownValue } from '@shared/draftApply'
import type { NormalizedSlot } from '@shared/schemaModel'

export { applyDraftToNormalized } from '@shared/draftApply'

export interface LoadedDraft {
  workbench: WorkbenchState
  meta: RecipeDraftMeta
  passThrough: UnknownField[]
  normalized: NormalizedRecipe
  schema: NormalizedSchema
  /** 打开时的校验/保留诊断（引用内未建模键、截断等），面板只读展示 */
  diagnostics: SchemaDiagnostic[]
  /** 存在无法安全回写的引用时，列表只读（仅展示原文，避免编辑别的条目把未知值丢掉） */
  unsafeReason?: string
  banners: { level: 'info' | 'warn'; text: string }[]
}

function quantity(raw: number | string | undefined): SlotValue['count'] {
  if (raw === undefined) return undefined
  return typeof raw === 'string' ? Number(raw) : raw
}

function toSlot(value: NormalizedValue | null | undefined): SlotValue | null {
  if (!value) return null
  switch (value.kind) {
    case 'item':
      return {
        kind: 'item',
        id: value.id,
        ...(value.count ? { count: quantity(value.count.raw) } : {}),
        ...(value.chance ? { chance: quantity(value.chance.raw) } : {}),
        ...(value.nbt !== undefined ? { nbt: value.nbt } : {})
      }
    case 'tag':
      return {
        kind: 'tag',
        id: value.id,
        ...(value.count ? { count: quantity(value.count.raw) } : {}),
        ...(value.chance ? { chance: quantity(value.chance.raw) } : {}),
        ...(value.nbt !== undefined ? { nbt: value.nbt } : {})
      }
    case 'fluid':
      return {
        kind: 'fluid',
        id: value.id,
        ...(value.amount ? { amount: quantity(value.amount.raw) } : {}),
        ...(value.chance ? { chance: quantity(value.chance.raw) } : {}),
        ...(value.nbt !== undefined ? { nbt: value.nbt } : {})
      }
    case 'registry':
      return {
        kind: 'registry',
        id: value.id,
        ...(value.registry ? { registryType: value.registry } : {}),
        ...(value.amount ? { amount: quantity(value.amount.raw) } : {}),
        ...(value.nbt !== undefined ? { nbt: value.nbt } : {})
      }
    default:
      return null
  }
}

/** pattern 的行列（列取最长一行），用于把规范化网格还原成固定尺寸的 UI 网格 */
function gridSizeOf(raw: unknown): { rows: number; cols: number } {
  if (raw && typeof raw === 'object' && Array.isArray((raw as { pattern?: unknown }).pattern)) {
    const pattern = (raw as { pattern: unknown[] }).pattern
    const cols = pattern.reduce<number>((n, row) => (typeof row === 'string' ? Math.max(n, row.length) : n), 0)
    if (pattern.length > 0 && cols > 0) return { rows: pattern.length, cols }
  }
  return { rows: GRID_DEFAULT_SIZE, cols: GRID_DEFAULT_SIZE }
}

export function normalizedToDraft(opened: OpenedRecipe): LoadedDraft | null {
  const normalized = opened.normalized
  if (!normalized) return null
  const schema = opened.schema
  const values: BenchValues = {}
  let gridRows: number | undefined
  let gridCols: number | undefined

  if (schema.layoutKind === 'shaped') {
    const { rows, cols } = gridSizeOf(normalized.source.raw)
    const rowsOut = Math.max(rows, GRID_DEFAULT_SIZE)
    const colsOut = Math.max(cols, GRID_DEFAULT_SIZE)
    const cells: (SlotValue | null)[] = new Array(rowsOut * colsOut).fill(null)
    const grid = normalized.slots.find((s) => s.key === BENCH_GRID_KEY)?.value
    if (grid?.kind === 'list') {
      // 按原 pattern 的逐行长度还原位置：pattern 行宽不齐时，扁平下标会错位
      const rawPattern = (normalized.source.raw as { pattern?: unknown } | undefined)?.pattern
      if (Array.isArray(rawPattern)) {
        let flat = 0
        rawPattern.forEach((row, r) => {
          if (typeof row !== 'string') return
          for (let c = 0; c < row.length; c++) {
            if (r < rowsOut && c < colsOut) cells[r * colsOut + c] = toSlot(grid.of[flat] ?? null)
            flat += 1
          }
        })
      } else {
        grid.of.forEach((cell, i) => {
          const row = Math.floor(i / cols)
          const col = i % cols
          if (row < rowsOut && col < colsOut) cells[row * colsOut + col] = toSlot(cell)
        })
      }
    }
    values[BENCH_GRID_KEY] = cells
    gridRows = rowsOut
    gridCols = colsOut
    const result = normalized.slots.find((s) => s.key === 'result')?.value
    const resultSlot = toSlot(result ?? null)
    values[BENCH_OUTPUTS_KEY] = resultSlot ? [resultSlot] : []
  } else {
    // 非 shaped 试点：槽位键与规范化一致（ingredients / result / results），不再借 lite 的 inputs/outputs
    const listToSlots = (v: NormalizedValue | null | undefined): SlotValue[] =>
      v?.kind === 'list' ? (v.of.map(toSlot).filter((s): s is SlotValue => s !== null)) : []
    for (const slot of normalized.slots) {
      if (slot.value?.kind === 'list') {
        values[slot.key] = listToSlots(slot.value)
        continue
      }
      const single = toSlot(slot.value ?? null)
      values[slot.key] = single ? [single] : []
    }
  }

  const banners: LoadedDraft['banners'] = []
  if (normalized.partial.isPartial) {
    banners.push({
      level: 'warn',
      text: `解析不完整（${normalized.partial.reasons.join(' / ')}）：未建模字段会原样保留，编辑只影响已建模部分`
    })
  }
  if (normalized.unknowns.length > 0) {
    banners.push({ level: 'info', text: `${normalized.unknowns.length} 个未建模字段已保留（可在下方查看路径）` })
  }
  if (opened.rawKind === 'reconstructed') {
    banners.push({ level: 'warn', text: '来自现有脚本：原始 JSON 由摘要重建，动态逻辑无法还原' })
  }
  const unsafeReason =
    schema.layoutKind !== 'shaped' && normalized.slots.some((slot) => containsUnknownValue(slot.value))
      ? '材料/产物含无法安全表达的引用（unknown），本试点不提供编辑，避免改写时丢失原值'
      : undefined
  if (unsafeReason) banners.push({ level: 'warn', text: unsafeReason })

  return {
    workbench: {
      typeId: opened.record.type,
      layoutKind: schema.layoutKind,
      values,
      ...(gridRows !== undefined ? { gridRows, gridCols } : {}),
      activeSlotKey: null,
      modifiers: {}
    },
    meta: createDraftMeta({ uid: normalized.source.uid, rawHash: normalized.rawHash }),
    passThrough: normalized.unknowns,
    normalized,
    schema,
    diagnostics: opened.diagnostics,
    ...(unsafeReason ? { unsafeReason } : {}),
    banners
  }
}

export interface DraftPreview {
  kind: 'text' | 'json' | 'unavailable'
  text?: string
  json?: Record<string, unknown>
  unknownCount: number
  dirtyFields: string[]
}

export function draftPreview(draft: LoadedDraft): DraftPreview {
  if (draft.meta.dirtyFields.length === 0 && draft.normalized.source.rawText) {
    return {
      kind: 'text',
      text: draft.normalized.source.rawText,
      unknownCount: draft.passThrough.length,
      dirtyFields: []
    }
  }
  // B121/R-1：schema 参与形态仲裁（multiple 语义），预览与提交共用同一套单值/数组规则
  const normalized = applyDraftToNormalized(draft.normalized, draft.workbench, draft.meta.dirtyFields, draft.schema)
  // 反解按「规范化槽位名」执行：UI 的 outputs 在单产物草稿里对应 result
  const dirtyForWrite = draft.meta.dirtyFields.map((key) =>
    key === BENCH_OUTPUTS_KEY && !normalized.slots.some((s) => s.key === BENCH_OUTPUTS_KEY) && normalized.slots.some((s) => s.key === 'result')
      ? 'result'
      : key
  )
  const out = denormalizeRecipe(normalized, draft.schema, {
    dirtyFields: dirtyForWrite,
    // 网格按工作台实际宽度解释，避免把 UI 补齐的空格写进 recipe
    ...(draft.workbench.layoutKind === 'shaped'
      ? {
          gridSize: {
            rows: draft.workbench.gridRows ?? GRID_DEFAULT_SIZE,
            cols: draft.workbench.gridCols ?? GRID_DEFAULT_SIZE
          }
        }
      : {})
  })
  if (out.kind === 'text') {
    return { kind: 'text', text: out.text, unknownCount: draft.passThrough.length, dirtyFields: [...draft.meta.dirtyFields] }
  }
  return {
    kind: 'json',
    json: out.json,
    unknownCount: draft.passThrough.length,
    dirtyFields: [...draft.meta.dirtyFields]
  }
}

/** 空白结构化配方：uid 用固定前缀标记「这条还没落盘」，提交时走 copy（新建）分支 */
export const NEW_DRAFT_UID_PREFIX = '__new__:'

export function isBlankDraft(draft: { normalized: { source: { uid: string } } } | null): boolean {
  return !!draft && draft.normalized.source.uid.startsWith(NEW_DRAFT_UID_PREFIX)
}

/**
 * 从零新建结构化配方（B 方案）。
 *
 * 关键：`meta.base = null` —— submitDraft 见到 null 就走 `mode: "copy"`（新建），
 * 而不是「就地改写原始 JSON」。因此不需要 rawHash、也不会与任何原文件冲突。
 * 槽位全空，用户填完后所有被编辑字段由 benchStore 记为 dirtyFields。
 */
export function createBlankDraft(typeId: string, schema: NormalizedSchema): LoadedDraft & { uid: string } {
  const uid = `${NEW_DRAFT_UID_PREFIX}${typeId}`
  const values: BenchValues = {}
  const slots: NormalizedSlot[] = []
  if (schema.layoutKind === 'shaped') {
    values[BENCH_GRID_KEY] = new Array(GRID_DEFAULT_SIZE * GRID_DEFAULT_SIZE).fill(null)
    slots.push({ key: BENCH_GRID_KEY, value: { kind: 'list', of: [] } })
  } else {
    for (const f of schema.slots) {
      values[f.key] = f.multiple === true ? [] : null
      slots.push({ key: f.key, value: f.multiple === true ? { kind: 'list', of: [] } : null })
    }
  }
  values[BENCH_OUTPUTS_KEY] = []
  for (const f of schema.outputs) {
    values[f.key] = f.multiple === true ? [] : null
    slots.push({ key: f.key, value: f.multiple === true ? { kind: 'list', of: [] } : null })
  }
  const normalized: NormalizedRecipe = {
    typeId,
    schemaRef: { id: schema.id, revision: schema.revision ?? 0 },
    slots,
    unknowns: [],
    partial: { isPartial: false, reasons: [] },
    rawHash: '',
    source: { uid, source: 'datapack', sourcePath: '', raw: { type: typeId }, dynamic: false }
  }
  return {
    uid,
    workbench: {
      typeId,
      layoutKind: schema.layoutKind,
      values,
      ...(schema.layoutKind === 'shaped' ? { gridRows: GRID_DEFAULT_SIZE, gridCols: GRID_DEFAULT_SIZE } : {}),
      activeSlotKey: null,
      modifiers: {}
    },
    meta: createDraftMeta(null),
    passThrough: [],
    normalized,
    schema,
    diagnostics: [],
    banners: [{ level: 'info', text: '空白结构化配方：填写材料与产物后提交将新建文件，不改写任何已有配方' }]
  }
}

