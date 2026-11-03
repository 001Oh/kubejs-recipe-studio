/**
 * P0：`schema:*` IPC 实现（此前只有类型声明、没有 main 端点）。
 *
 * 数据来源与语义见 `schema/service.ts` 顶部注释：
 * - `schema:list`      → 注册表当前生效类型的摘要（稳定按 id 排序）
 * - `schema:get`       → 单个类型的完整 schema；未知类型返回 null（不是空对象，也不是错误）
 * - `schema:registryOptions` → 复用既有 `registryOptions()`（probe 缓存 + 样本 + 内置表）
 * - `schema:pin` / `schema:unpin` → 复用注册表的钉住机制，落盘 `customRecipeTypes.json`
 * - `schema:coverage`  → 复用 `buildCoverageReport()`，样本数来自内存中的配方索引
 *
 * 异常一律抛给 `ipcRegistry` 转 `{ ok:false }`，不做静默降级。
 */
import type { RecipeSlotSchema, RecipeTypeSchema } from '../../shared/types'
import { FIELD_KINDS, LAYOUT_KINDS } from '../plugins/manifest'
import { registerHandler } from '../ipcRegistry'
import { logger } from '../logger'
import { registryOptions } from '../schema/registryOptions'
import { allSchemas } from '../schema/registry'
import { coverage, ensureSchemas, schemaById, schemaSummaries, togglePin } from '../schema/service'

/**
 * 槽位列表的**语义**校验（P0-R2）。
 *
 * 旧实现只校验「是数组」，因此 `key` 为空、`kind` 拼错、同一层出现重复 key 的 schema
 * 都能被写进 `customRecipeTypes.json`，然后在下次启动时污染钉住层（重建时同样不会报错，
 * 用户只会看到字段莫名消失）。这里把三类可在**写入前**判定的错误拦掉。
 *
 * 故意**不**校验 `required` / `zone` / `role` 的取值：这些字段在历史数据里可能缺失或使用旧名，
 * 收紧会导致本来能用的旧钉住项无法再编辑（属于兼容性风险，不在本条范围内）。
 */
function assertSlotList(list: RecipeSlotSchema[], field: 'slots' | 'outputs'): void {
  const seen = new Set<string>()
  list.forEach((slot, index) => {
    const at = `${field}[${index}]`
    if (!slot || typeof slot !== 'object') throw new Error(`schema:pin 的 ${at} 必须是对象`)
    if (typeof slot.key !== 'string' || slot.key.trim() === '') throw new Error(`schema:pin 的 ${at} 缺少非空 key`)
    if (seen.has(slot.key)) throw new Error(`schema:pin 的 ${field} 出现重复 key：${slot.key}`)
    seen.add(slot.key)
    if (!FIELD_KINDS.includes(slot.kind)) {
      throw new Error(`schema:pin 的 ${at}.kind 非法：${String(slot.kind)}（允许值：${FIELD_KINDS.join(' / ')}）`)
    }
  })
}

/** 钉住是写盘操作：先做结构 + 语义校验，避免把渲染端的坏对象写进 customRecipeTypes.json */
function assertPinnable(req: { typeId: string; schema: RecipeTypeSchema }): RecipeTypeSchema {
  const schema = req?.schema
  if (!schema || typeof schema !== 'object') throw new Error('schema:pin 需要完整的 schema 对象')
  if (typeof req.typeId !== 'string' || req.typeId.trim() === '') throw new Error('schema:pin 需要非空 typeId')
  if (schema.id !== req.typeId) throw new Error(`schema:pin 的 typeId 与 schema.id 不一致：${req.typeId} / ${String(schema.id)}`)
  if (!Array.isArray(schema.slots) || !Array.isArray(schema.outputs)) throw new Error('schema:pin 的 slots / outputs 必须是数组')
  if (typeof schema.layoutKind !== 'string') throw new Error('schema:pin 缺少 layoutKind')
  // P0-R2：值域与槽位内容的语义校验（写入前拦住，避免污染钉住层）
  if (!LAYOUT_KINDS.includes(schema.layoutKind)) {
    throw new Error(`schema:pin 的 layoutKind 非法：${schema.layoutKind}（允许值：${LAYOUT_KINDS.join(' / ')}）`)
  }
  assertSlotList(schema.slots, 'slots')
  assertSlotList(schema.outputs, 'outputs')
  return schema
}

export function registerSchemaHandlers(): void {
  registerHandler('schema:list', async () => {
    // U-16：懒装配兜底。无包启动时启动恢复分支不触发，注册表从未装配 →
    // 这里不补一手，工作台「配方类型」下拉就只剩 __generic__。
    // `ensureSchemas()` 按 factsKey 判定，已装配时开销极小。
    await ensureSchemas()
    const list = await schemaSummaries()
    logger.debug('SCHEMA', `schema:list → ${list.length} 个类型`)
    return list
  })

  registerHandler('schema:get', async (req) => {
    const typeId = typeof req?.typeId === 'string' ? req.typeId.trim() : ''
    if (!typeId) throw new Error('schema:get 需要非空 typeId')
    return schemaById(typeId)
  })

  registerHandler('schema:registryOptions', async (req) => {
    const registry = typeof req?.registry === 'string' ? req.registry.trim() : ''
    if (!registry) throw new Error('schema:registryOptions 需要非空 registry')
    await ensureSchemas()
    return registryOptions(registry, allSchemas())
  })

  registerHandler('schema:pin', async (req) => {
    const schema = assertPinnable(req)
    // BH-001：把**提交的那一份**交给 togglePin，而不是让它按 typeId 重新从注册表取
    const result = await togglePin(schema.id, true, schema)
    if (!result.schema) throw new Error(`无法钉住 ${schema.id}：该类型不在当前注册表中`)
    logger.info('SCHEMA', `钉住 ${schema.id}（来自渲染端编辑结果）`)
    return result.schema
  })

  registerHandler('schema:unpin', async (req) => {
    const typeId = typeof req?.typeId === 'string' ? req.typeId.trim() : ''
    if (!typeId) throw new Error('schema:unpin 需要非空 typeId')
    const result = await togglePin(typeId, false)
    return result.changed
  })

  registerHandler('schema:coverage', async () => {
    const report = await coverage()
    logger.debug(
      'SCHEMA',
      `schema:coverage → ${report.totalTypes} 个类型（可结构化 ${report.structurable}，仅通用 ${report.genericOnly}，不可用 ${report.unsupported}）`
    )
    return report
  })
}
