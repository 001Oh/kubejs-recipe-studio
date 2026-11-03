/**
 * 预览汇总（`codegen:preview`）。把「取 schema → 判通道 → 发射 → 语法预检 → 语义校验 → 去重」
 * 串成一次调用，产出 IPC 契约里的 `CodePreview`，同时给出写盘要用的 `WritePayload`。
 *
 * schema 取用**只在本文件的 loadSchema 一处**（`src/main/schema/registry.ts` 的 `getSchema`），
 * 领域侧接口变动时只改这里。
 */
import { DATAPACK_NAMESPACE } from '../../shared/constants'
import type { CodePreview, Diagnostic } from '../../shared/ipc'
import type { GenerationPreference, ModpackInfo, RecipeTypeSchema, WorkbenchState } from '../../shared/types'
import { schemaById } from '../schema/service'
import { getCurrentModpack } from '../modpack/state'
import { allRecords } from '../recipes/recipeIndex'
import { logger } from '../logger'
import { collectUnsupportedFields, collectUnsupportedModifiers, decideChannel, requiredAddonOf } from './channel'
import type { ChannelDecision } from './channel'
import type { NamespaceProbe } from './context'
import { defaultNamespaceProbe, getGenerationContext, semanticContext } from './context'
import type { DatapackFile } from './emitDatapack'
import { emitDatapack, jarNamespaceProbe, resolveNamespace } from './emitDatapack'
import type { SyntaxResult } from './validate'
import { checkSyntax, hasErrors, validateSemantics } from './validate'
import { findDuplicate, generatedRecipeId } from './dedupe'
import type { DuplicateHit } from './dedupe'
import { defaultScriptFileName } from './writer'
import type { WritePayload } from './writer'
import { emitScript } from './emitScript'

export interface PreviewInput {
  workbench: WorkbenchState
  preference?: GenerationPreference
  /** 显式覆盖（测试与「写入文件」对话框用）；传 null 表示「没有整合包」 */
  modpack?: ModpackInfo | null
  addons?: readonly string[]
  hasSamples?: boolean
  namespaceProbe?: NamespaceProbe
  /** 直接给定 schema（跳过注册表查询）；传 null 表示「查不到」 */
  schema?: RecipeTypeSchema | null
  createdAtMs?: number
  fileName?: string
}

export interface GeneratedBundle {
  preview: CodePreview
  payload: WritePayload
}

interface AssembleInput {
  schema: RecipeTypeSchema
  workbench: WorkbenchState
  decision: ChannelDecision
  code: string
  header: string
  syntax: SyntaxResult
  diagnostics: Diagnostic[]
  notes: string[]
  fileName: string
  recipeId: string | null
  duplicate: DuplicateHit | null
  datapackFiles: DatapackFile[]
  namespace: string
  modpack: ModpackInfo | null
}

/**
 * 取某类型的 schema 供生成使用。
 *
 * BUG-HUNT-03 修复 REM-01：改走 `service.schemaById()`，它内部先 `ensureSchemas()`。
 * 该函数在快照戳与当前事实一致时**直接返回**（只做一次字符串比较，无磁盘 IO），
 * 因此稳态零额外开销；而在**换整合包 / 索引变化**后首次调用时会重建注册表，
 * 避免 preview 继续用上一个包的 schema。
 *
 * 此前这里直接 `getSchema()`，不触发重建，只有插件开关会即时刷新，
 * 于是「换包 → 立刻预览」会读到旧包的 schema。
 */
export async function loadSchema(typeId: string): Promise<RecipeTypeSchema | null> {
  return schemaById(typeId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 含 NBT 约束的字段：语法糖签名无法可靠表达，按「糖表达不了」处理并触发降级 */
function fieldsWithNbt(values: Record<string, unknown>): string[] {
  const hits: string[] = []
  const test = (key: string, value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) test(key, item)
      return
    }
    if (isRecord(value) && value['nbt'] !== undefined && value['nbt'] !== null) hits.push(key)
  }
  for (const [key, value] of Object.entries(values)) {
    if (key === 'grid' || key === 'activeSlotKey') continue
    test(key, value)
  }
  return [...new Set(hits)]
}

function requiresScriptLayer(workbench: WorkbenchState): boolean {
  return (
    workbench.layoutKind === 'sequence' ||
    (workbench.steps?.length ?? 0) > 0 ||
    workbench.typeId === 'kubejs:remove' ||
    workbench.typeId.endsWith(':remove')
  )
}

function emptyPayload(header: string, modpack: ModpackInfo | null): WritePayload {
  return {
    channel: 'event-custom',
    mcVersion: modpack?.mcVersion ?? null,
    header,
    statements: [],
    code: '',
    datapackFiles: [],
    namespace: DATAPACK_NAMESPACE
  }
}

function failedPreview(workbench: WorkbenchState, message: string): CodePreview {
  return {
    code: '',
    channel: 'event-custom',
    datapackFiles: [],
    fileName: defaultScriptFileName(Date.now()),
    header: '',
    notes: [],
    diagnostics: [{ level: 'error', field: 'typeId', message }],
    syntaxOk: false,
    syntaxError: { line: 1, message },
    sugarUnsupportedFields: [],
    sugarUnverified: false,
    blockedFromSugar: false,
    missingAddon: null,
    duplicateOf: null,
    canWrite: false,
    recipeId: null,
    typeId: workbench.typeId
  }
}

function assemble(input: AssembleInput): CodePreview {
  const { decision, syntax, diagnostics, schema, modpack, notes } = input
  const addon = requiredAddonOf(schema)
  if (addon && decision.channel !== 'kubejs-sugar' && !(modpack?.kubejsAddons ?? []).includes(addon)) {
    notes.push(`未安装 ${addon}：语法糖不可用，已改走 ${decision.channel === 'datapack-json' ? '数据包 JSON（推荐，零耦合）' : 'event.custom'}`)
  }
  if (input.duplicate) {
    notes.push(
      input.duplicate.flipped
        ? `与已生成的 ${input.duplicate.label} 是压印器 top/bottom 翻转重复：游戏内视为同一配方，请确认是否冲突`
        : `与已生成的 ${input.duplicate.label} 结构完全相同`
    )
  }
  const blocked = hasErrors(diagnostics) || decision.error !== null || !syntax.ok
  return {
    code: input.code,
    channel: decision.channel,
    datapackFiles: input.datapackFiles.map((f) => ({ relativePath: f.relativePath, json: f.json })),
    fileName: input.fileName,
    header: input.header,
    notes,
    diagnostics,
    syntaxOk: syntax.ok,
    ...(syntax.ok ? {} : { syntaxError: { line: syntax.line ?? 1, message: syntax.message ?? '语法错误' } }),
    sugarUnsupportedFields: decision.sugarUnsupportedFields,
    sugarUnverified: decision.sugarUnverified,
    blockedFromSugar: decision.blockedFromSugar,
    missingAddon: decision.missingAddon,
    duplicateOf: input.duplicate ? input.duplicate.label : null,
    canWrite: !blocked && input.code.trim().length > 0,
    recipeId: input.recipeId,
    typeId: schema.id
  }
}

export async function generate(input: PreviewInput): Promise<GeneratedBundle> {  const ctx = getGenerationContext()
  let workbench = input.workbench
  const modpack = input.modpack !== undefined ? input.modpack : (ctx.modpack?.() ?? getCurrentModpack())
  const schema = input.schema !== undefined ? input.schema : await loadSchema(workbench.typeId)
  if (!schema) {
    // U-22：通用模式（任意模组配方）本就没有 schema——这正是它存在的理由。
    const rawType = (workbench.typeId || '').trim()
    if (rawType === '' || rawType === '__generic__') {
      const message = '通用模式需要填写具体配方类型（「通用 / 任意」只是占位，不能作为 type 写出）'
      logger.error('RECIPE', message, '工作台类型：' + String(workbench.typeId))
      return { preview: failedPreview(workbench, message), payload: emptyPayload('', modpack) }
    }
    return generateCustomFallback(workbench, rawType, modpack)
  }

  // U-11：schema 驱动的 values 归一化。
  // 「通用模式」的 SlotColumn 写的是 values.inputs / values.outputs，而 emitScript / emitDatapack
  // 都按 schema 字段 key 读取（如 ingredients / result）。这里在进 emit 之前补齐，
  // 两条通道就都不必各自做别名，也不会因为某一通道漏改而半边可用。
  // 映射不硬编码：一律取 schema.slots / schema.outputs 里声明的 key，只把 UI 侧的
  // inputs / outputs 当作**来源**；schema 已声明的值优先，绝不被覆盖。
  workbench = { ...workbench, values: normalizeUiValues(schema, workbench.values) }
  // U-11（第二轮）：layoutKind 也以 schema 为准。
  // 通用模式的 `#bench-type` onChange 传的是 bench.layoutKind（旧值），切类型后不更新，
  // 导致校验仍按 'shaped' 查 grid →「网格为空，无法生成有序合成」。
  // schema.layoutKind 是权威声明；pilot 路径本就一致，不受影响。
  if (schema.layoutKind) {
    workbench = { ...workbench, layoutKind: schema.layoutKind }
  } else {
    logger.warn('RECIPE', 'schema 未声明 layoutKind，沿用工作台当前值', `类型：${schema.id}`)
  }

  const addons = input.addons ?? modpack?.kubejsAddons ?? []
  const hasSamples =
    input.hasSamples ??
    ctx.hasSamples?.(schema.id) ??
    (allRecords().some((record) => record.type === schema.id) || (schema.sampleCount ?? 0) > 0)
  const preference: GenerationPreference = input.preference ?? 'auto'
  const decision = decideChannel({
    schema,
    addons,
    hasSamples,
    preference,
    requiresScript: requiresScriptLayer(workbench),
    filledUnsupportedFields: [
      ...collectUnsupportedFields(schema, workbench.values),
      ...collectUnsupportedModifiers(schema, workbench.modifiers ?? {}),
      ...fieldsWithNbt(workbench.values)
    ]
  })

  if (decision.error) logger.error('RECIPE', decision.error, `类型：${schema.id}`)
  else if (decision.sugarUnsupportedFields.length > 0) {
    logger.info(
      'RECIPE',
      `语法糖无法表达 ${decision.sugarUnsupportedFields.join('、')}，已自动降级为 ${decision.channel}`,
      `类型：${schema.id}`
    )
  }

  const createdAtMs = input.createdAtMs ?? Date.now()
  const diagnostics: Diagnostic[] = [...validateSemantics(schema, workbench, semanticContext())]
  // 通道决策里的报错（例如「始终语法糖」但附属缺失）必须变成一条 error 诊断：
  // 只置 canWrite=false 而不给理由，界面会呈现为「按钮灰了但不知为什么」。
  if (decision.error) diagnostics.push({ level: 'error', message: decision.error })
  const notes: string[] = [...decision.notes]

  if (decision.channel === 'datapack-json') {
    const probe = input.namespaceProbe ?? ctx.namespaceProbe ?? (modpack ? jarNamespaceProbe(modpack.modsDir) : defaultNamespaceProbe())
    const namespace = await resolveNamespace(probe)
    const built = emitDatapack(schema, workbench, namespace)
    diagnostics.push(...built.warnings)
    notes.push(`数据包通道：写出 ${built.files.map((f) => f.relativePath).join('、')}，零耦合（不经附属）`)
    const code = `${built.files.map((f) => `// ${f.relativePath}\n${f.json.trim()}`).join('\n\n')}\n`
    const syntax = checkSyntax(code, 'datapack-json')
    const first = built.files[0]
    const preview = assemble({
      schema,
      workbench,
      decision,
      code,
      header: `// 数据包 namespace：${namespace}`,
      syntax,
      diagnostics,
      notes,
      fileName: first?.fileName ?? 'recipe.json',
      recipeId: first ? first.recipeId : generatedRecipeId(workbench, namespace, 'recipe.json', schema.id),
      duplicate: findDuplicate(workbench),
      datapackFiles: built.files,
      namespace,
      modpack
    })
    const payload: WritePayload = {
      channel: 'datapack-json',
      mcVersion: modpack?.mcVersion ?? null,
      header: '',
      statements: [],
      code,
      datapackFiles: built.files,
      namespace
    }
    return { preview, payload }
  }

  const emit = emitScript(schema, workbench, decision.channel, modpack, createdAtMs)
  if (emit.error) diagnostics.push({ level: 'error', message: emit.error })
  notes.push(...emit.notes)
  const syntax = checkSyntax(emit.code, decision.channel)
  const fileName = input.fileName ?? defaultScriptFileName(createdAtMs)
  const namespace = DATAPACK_NAMESPACE
  const preview = assemble({
    schema,
    workbench,
    decision,
    code: emit.code,
    header: emit.header,
    syntax,
    diagnostics,
    notes,
    fileName,
    recipeId: generatedRecipeId(workbench, namespace, fileName, schema.id),
    duplicate: findDuplicate(workbench),
    datapackFiles: [],
    namespace,
    modpack
  })
  const payload: WritePayload = {
    channel: decision.channel,
    mcVersion: modpack?.mcVersion ?? null,
    header: emit.header,
    statements: emit.statements,
    code: emit.code,
    datapackFiles: [],
    namespace
  }
  return { preview, payload }
}

export async function buildPreview(input: PreviewInput): Promise<CodePreview> {
  return (await generate(input)).preview
}

/**
 * U-11：把「通用模式」使用的 values.inputs / values.outputs 归一化到 schema 声明的字段 key。
 * 规则（不硬编码具体 key）：schema.slots[] → 来源 inputs；schema.outputs[] → 来源 outputs。
 * - schema 已声明的 key 有值时**不覆盖**（pilot 草稿路径行为不变）；
 * - 只补缺失，不删除原键（下游兜底逻辑仍可见原值，避免二次改动的连带风险）。
 */
export function normalizeUiValues(
  schema: RecipeTypeSchema,
  values: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values }
  const fill = (key: string, source: string, multiple: boolean): void => {
    if (key === 'grid' || key === source) return
    if (out[key] !== undefined) return
    const raw = values[source]
    if (raw === undefined) return
    // schema 声明单值（multiple=false）时，UI 传的是数组 → 取首元素，
    // 否则校验会报「该字段是单值，却给了数组」。
    out[key] = multiple || !Array.isArray(raw) ? raw : raw[0]
  }
  for (const field of schema.slots) fill(field.key, 'inputs', field.multiple === true)
  for (const field of schema.outputs) fill(field.key, 'outputs', field.multiple === true)
  // T-08-JSON-DUP-KEYS：映射完成后删掉 UI 源键（仅当 schema 没有把它当自己的字段）。
  // 否则 emitDatapack 的「兜底原样写出」会把 inputs/outputs 当未声明键写进 JSON，
  // 产出 type/ingredients/result/**inputs/outputs** 这种脏结构。
  const declaredKeys = new Set([...schema.slots, ...schema.outputs].map((f) => f.key))
  for (const source of ['inputs', 'outputs']) {
    if (!declaredKeys.has(source)) delete out[source]
  }
  return out
}

/**
 * U-22：schema 查不到时回退 event.custom（通用模式 / 任意模组配方）。
 * 字段名只能按常见约定推断：values.inputs → ingredients、values.outputs → result；
 * 推断这件事写进 diagnostics，不静默。
 */
function generateCustomFallback(
  workbench: WorkbenchState,
  typeId: string,
  modpack: ModpackInfo | null
): GeneratedBundle {
  const values = (workbench.values ?? {}) as Record<string, unknown>
  const rawInputs = values['inputs']
  const rawOutputs = values['outputs']
  const inputs: unknown[] = Array.isArray(rawInputs) ? rawInputs : []
  const outputs: unknown[] = Array.isArray(rawOutputs) ? rawOutputs : []

  const toRef = (v: unknown): unknown => {
    if (typeof v === 'string') return { item: v }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const rec = v as Record<string, unknown>
      if (typeof rec['id'] === 'string' && rec['item'] === undefined) {
        const out: Record<string, unknown> = { item: rec['id'] }
        const count = rec['count']
        if (typeof count === 'number' && count !== 1) out['count'] = count
        return out
      }
      return rec
    }
    return v
  }

  const json: Record<string, unknown> = { type: typeId }
  const ingredients = inputs.filter((v) => v !== null && v !== undefined).map(toRef)
  if (ingredients.length > 0) json['ingredients'] = ingredients
  if (outputs.length === 1) json['result'] = toRef(outputs[0])
  else if (outputs.length > 1) json['results'] = outputs.map(toRef)

  const indent = String.fromCharCode(10) + Array(3).join(' ')
  const jsonText = JSON.stringify(json, null, 2).split(String.fromCharCode(10)).join(indent)
  const statement = 'event.custom(' + jsonText + ')'

  const stamp = new Date().toISOString().slice(0, 16).split('T').join(' ')
  const header = ['// ── KubeJS Recipe Studio ─────────────────────────────', '// Modpack : ' + (modpack?.name ?? '（未导入）'), '// Created : ' + stamp, '// ─────────────────────────────────────────────────────'].join(String.fromCharCode(10))

  const lines = [header, 'ServerEvents.recipes(event => {', '  // 通用模式：类型 ' + typeId + ' 未注册 schema，字段按常见约定推断', '  ' + statement, '})', '']
  const code = lines.join(String.fromCharCode(10))
  const syntax = checkSyntax(code, 'event-custom')

  const diagnostics: Diagnostic[] = [
    {
      level: 'warn',
      message:
        '类型 "' +
        typeId +
        '" 没有 schema：已按通用模式生成 event.custom（ingredients/result 为推断字段名，请按该模组文档核对）'
    }
  ]
  if (!syntax.ok) {
    diagnostics.push({ level: 'error', message: syntax.message ?? '生成的 event.custom 未通过语法预检' })
  }
  logger.info('RECIPE', '通用模式：类型 ' + typeId + ' 无 schema，已回退 event.custom')

  const payload = {
    channel: 'event-custom' as const,
    mcVersion: modpack?.mcVersion ?? null,
    header,
    statements: [statement],
    code,
    datapackFiles: [],
    namespace: DATAPACK_NAMESPACE
  }

  const preview = {
    code,
    channel: 'event-custom' as const,
    datapackFiles: [],
    fileName: defaultScriptFileName(Date.now()),
    header,
    notes: ['通用模式：未注册 schema，按 event.custom 直出'],
    diagnostics,
    syntaxOk: syntax.ok,
    ...(syntax.ok
      ? {}
      : { syntaxError: { line: syntax.line ?? 1, message: syntax.message ?? '语法预检未通过' } }),
    sugarUnsupportedFields: [],
    sugarUnverified: false,
    blockedFromSugar: false,
    missingAddon: null,
    duplicateOf: null,
    recipeId: null,
    canWrite: syntax.ok,
    payload
  } as unknown as CodePreview

  return { preview, payload }
}
