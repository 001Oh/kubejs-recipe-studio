/**
 * Schema 文件版本与迁移（P-B 纯函数）。
 *
 * - 输入可以是 v1（裸数组，旧 `customRecipeTypes.json`）或 v2（`{formatVersion, schemas}`）；
 * - 版本高于程序支持 → 整个文件标记 incompatible，**不丢原文件**、不猜测；
 * - 单个 schema 迁移失败 → 进 `failed`，其余继续（隔离原则与插件一致）。
 */
import {
  SCHEMA_FORMAT_VERSION,
  type SchemaDiagnostic,
  type NormalizedSchema,
  type NormalizedSchemaSlot
} from './schemaModel'
import { isPlainObject } from './canonicalJson'

export interface MigrateResult {
  formatVersion: number
  schemas: NormalizedSchema[]
  failed: { index: number; id: string | null; reason: string }[]
  diagnostics: SchemaDiagnostic[]
  incompatible: boolean
}

interface LegacySlot {
  key?: unknown
  kind?: unknown
  multiple?: unknown
  required?: unknown
  registry?: unknown
  jsonKey?: unknown
  emitShape?: unknown
  compound?: unknown
}

function migrateSlot(raw: unknown): NormalizedSchemaSlot | null {
  if (!isPlainObject(raw)) return null
  const slot = raw as LegacySlot
  if (typeof slot.key !== 'string' || typeof slot.kind !== 'string') return null
  const emitShape = slot.emitShape
  const emit: NormalizedSchemaSlot['emit'] =
    emitShape === 'scalar' || emitShape === 'object' || emitShape === 'positional' ? { shape: emitShape } : undefined
  return {
    key: slot.key,
    kind: slot.kind as NormalizedSchemaSlot['kind'],
    multiple: slot.multiple === true,
    ...(typeof slot.required === 'boolean' ? { required: slot.required } : {}),
    ...(typeof slot.registry === 'string' ? { registry: slot.registry } : {}),
    ...(Array.isArray(slot.compound) ? { compound: slot.compound.filter((c): c is string => typeof c === 'string') } : {}),
    ...(emit ? { emit } : {}),
    ...(typeof slot.jsonKey === 'string' ? { jsonKey: slot.jsonKey } : {})
  }
}

/** v1 单条 schema → v2；字段缺失即失败（不猜） */
export function migrateSchemaV1ToV2(raw: unknown): NormalizedSchema {
  if (!isPlainObject(raw)) throw new Error('schema 不是对象')
  const id = raw['id']
  if (typeof id !== 'string' || id.trim() === '') throw new Error('schema 缺少 id')
  const layoutKind = raw['layoutKind']
  if (typeof layoutKind !== 'string') throw new Error(`schema ${id} 缺少 layoutKind`)
  const migrateList = (value: unknown): NormalizedSchemaSlot[] => {
    if (!Array.isArray(value)) return []
    return value.map(migrateSlot).filter((s): s is NormalizedSchemaSlot => s !== null)
  }
  return {
    id,
    layoutKind: layoutKind as NormalizedSchema['layoutKind'],
    slots: migrateList(raw['slots']),
    outputs: migrateList(raw['outputs']),
    revision: typeof raw['revision'] === 'number' ? raw['revision'] : 1,
    preserveUnknown: raw['preserveUnknown'] !== false
  }
}

export function migrateSchemaFile(raw: unknown, currentVersion = SCHEMA_FORMAT_VERSION): MigrateResult {
  const diagnostics: SchemaDiagnostic[] = []
  const failed: MigrateResult['failed'] = []

  const fromArray = Array.isArray(raw)
  const container = isPlainObject(raw) ? raw : null
  const version = fromArray ? 1 : container && typeof container['formatVersion'] === 'number' ? (container['formatVersion'] as number) : 1

  if (version > currentVersion) {
    return {
      formatVersion: version,
      schemas: [],
      failed: [],
      incompatible: true,
      diagnostics: [
        {
          level: 'error',
          code: 'SCHEMA_VERSION_UNSUPPORTED',
          message: `schema 文件版本 ${version} 高于程序支持的 ${currentVersion}，已按只读处理`,
          hint: '升级程序后再编辑；原文件不会被改写'
        }
      ]
    }
  }

  const list: unknown[] = fromArray
    ? (raw as unknown[])
    : container && Array.isArray(container['schemas'])
      ? (container['schemas'] as unknown[])
      : []

  const schemas: NormalizedSchema[] = []
  list.forEach((entry, index) => {
    try {
      if (!isPlainObject(entry)) throw new Error('schema 不是对象')
      // v1 与 v2 的 slot 形状兼容，统一走 v1 迁移（v2 已带 emit 的会被保留）
      schemas.push(migrateSchemaV1ToV2(entry))
    } catch (err) {
      const id = isPlainObject(entry) && typeof entry['id'] === 'string' ? entry['id'] : null
      const reason = err instanceof Error ? err.message : String(err)
      failed.push({ index, id, reason })
      diagnostics.push({
        level: 'warn',
        code: 'SCHEMA_MIGRATION_FAILED',
        message: `第 ${index + 1} 个 schema 迁移失败：${reason}`,
        hint: '该条已跳过，原文件保持不变'
      })
    }
  })

  return { formatVersion: currentVersion, schemas, failed, diagnostics, incompatible: false }
}
