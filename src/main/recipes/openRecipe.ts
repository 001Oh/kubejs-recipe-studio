/**
 * P-C1：打开一条配方 → 原始数据 + 选中 schema + 规范化 + 诊断。
 *
 * 原则：
 * - 原始是权威来源：优先 lazy 惰性读取原文；读不到时明确返回 `raw-missing`，绝不拿摘要冒充完整配方；
 * - kubejs 脚本记录只能拿到“按摘要重建”的对象，标记 `reconstructed` 并在 notes 里说明；
 * - 本模块只读，不写缓存、不触发扫描。
 */
import type { OpenedRecipe } from '../../shared/ipc'
import type { RecipeRecord } from '../../shared/types'
import type { SchemaDiagnostic } from '../../shared/schemaModel'
import { lookup as defaultLookup } from './recipeIndex'
import { readFullRecipe as defaultReadFull } from './lazy'
import { normalizeRecipe } from '../../shared/normalize'
import { selectSchema as defaultSelectSchema, type SchemaSelection } from './selectSchema'

export interface OpenRecipeDeps {
  lookup?: (uid: string) => RecipeRecord | null
  readFull?: (record: RecipeRecord) => Promise<{ json: unknown; sourcePath: string }>
  select?: (typeId: string) => SchemaSelection
}

export async function openRecipe(uid: string, deps: OpenRecipeDeps = {}): Promise<OpenedRecipe> {
  const lookup = deps.lookup ?? defaultLookup
  const readFull = deps.readFull ?? defaultReadFull
  const select = deps.select ?? defaultSelectSchema

  const record = lookup(uid)
  if (!record) throw new Error(`配方不存在：${uid}`)

  const selection = select(record.type)
  const diagnostics: SchemaDiagnostic[] = []
  const notes: string[] = [...selection.notes]
  if (selection.source === 'generic') {
    diagnostics.push({
      level: 'warn',
      code: 'SCHEMA_GENERIC',
      message: `未找到 ${record.type} 的结构化 schema，只能以通用模式查看/保留原文`,
      hint: '可在 ProbeJS 导入或插件中补充该类型'
    })
  }

  let raw: OpenedRecipe['raw'] = null
  let rawKind: OpenedRecipe['rawKind'] = null
  let status: OpenedRecipe['status'] = 'ok'
  try {
    const loaded = await readFull(record)
    if (record.source === 'kubejs') {
      rawKind = 'reconstructed'
      notes.push('来自现有脚本：原始 JSON 由摘要重建，动态逻辑无法还原，只保证可静态解析的部分')
    } else {
      rawKind = 'file'
    }
    const rawText = JSON.stringify(loaded.json, null, 2)
    raw = { json: loaded.json, rawText }
  } catch (err) {
    status = err instanceof Error && err.message.includes('损坏') ? 'parse-failed' : 'raw-missing'
    diagnostics.push({
      level: 'error',
      code: 'RAW_UNAVAILABLE',
      message: err instanceof Error ? err.message : String(err),
      hint: '源 jar 可能已被移动或删除；仍可在配方浏览里查看摘要，但不能载入工作台'
    })
  }

  if (!raw) {
    return { record, schema: selection.schema, schemaSource: selection.source, status, rawKind, raw: null, normalized: null, diagnostics, notes }
  }

  const normalizedResult = normalizeRecipe({
    raw: raw.json,
    rawText: raw.rawText,
    schema: selection.schema,
    uid,
    source: {
      source: record.source === 'kubejs' ? 'kubejs' : record.source === 'datapack' ? 'datapack' : 'jar',
      sourcePath: record.sourcePath,
      ...(record.jarPath ? { jarPath: record.jarPath } : {}),
      ...(record.entryPath ? { entryPath: record.entryPath } : {}),
      dynamic: record.source === 'kubejs'
    }
  })
  diagnostics.push(...normalizedResult.diagnostics)
  if (normalizedResult.normalized.partial.isPartial) {
    diagnostics.push({
      level: 'warn',
      code: 'PARTIAL_RECIPE',
      message: `配方解析不完整：${normalizedResult.normalized.partial.reasons.join(' / ')}`,
      hint: '未建模字段会原样保留；编辑时只改已建模部分'
    })
  }

  return {
    record,
    schema: selection.schema,
    schemaSource: selection.source,
    status,
    rawKind,
    raw,
    normalized: normalizedResult.normalized,
    diagnostics,
    notes
  }
}
