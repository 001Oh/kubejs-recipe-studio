/**
 * 草稿基线与脏字段（P-B 纯函数）。
 *
 * 目的：
 * - `dirtyFields` 只记录用户真实改过的字段；规范化/加载本身绝不写它；
 * - 草稿记住「基于哪一份原始数据（rawHash）」。原始数据变化时由调用方先比对，
 *   冲突不得静默覆盖用户编辑（返回 'conflict'，由上层提示「重载 / 保留我的修改」）。
 */
import { DRAFT_FORMAT_VERSION } from './schemaModel'

export interface DraftBase {
  uid: string
  rawHash: string
}

export interface RecipeDraftMeta {
  draftVersion: number
  base: DraftBase | null
  dirtyFields: string[]
}

export type BaseConflict = 'no-base' | 'clean' | 'conflict'

export function createDraftMeta(base: DraftBase | null, draftVersion = DRAFT_FORMAT_VERSION): RecipeDraftMeta {
  return { draftVersion, base, dirtyFields: [] }
}

export function markFieldDirty(meta: RecipeDraftMeta, field: string): RecipeDraftMeta {
  if (meta.dirtyFields.includes(field)) return meta
  return { ...meta, dirtyFields: [...meta.dirtyFields, field] }
}

export function clearDirtyField(meta: RecipeDraftMeta, field: string): RecipeDraftMeta {
  return { ...meta, dirtyFields: meta.dirtyFields.filter((f) => f !== field) }
}

/** 原始数据变化检测：草稿基于旧 rawHash 时返回 conflict，调用方必须先询问用户 */
export function checkDraftConflict(meta: RecipeDraftMeta, currentRawHash: string): BaseConflict {
  if (!meta.base) return 'no-base'
  return meta.base.rawHash === currentRawHash ? 'clean' : 'conflict'
}

/** 用户在冲突后选择「以新原始数据为准」时才允许换基线（显式调用） */
export function rebaseDraft(meta: RecipeDraftMeta, base: DraftBase): RecipeDraftMeta {
  return { ...meta, base, dirtyFields: [] }
}
