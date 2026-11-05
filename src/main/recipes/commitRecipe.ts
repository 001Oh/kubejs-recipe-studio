/**
 * P-C3：配方草稿提交（覆盖原配方 / 另存副本）。
 *
 * 安全语义：
 * - 提交前**重新读取**当前原始配方，并用 rawHash 对比草稿基线；
 * - schema / uid / dirtyFields / unsafeReason 全部在主进程独立复核，不信任渲染端；
 * - 写盘用同目录临时文件 + rename；写后重新读取并解析，失败则回滚；
 * - 只有回读校验通过才替换内存索引并返回成功；失败不报告成功。
 *
 * 落地位置：
 * - jar / 数据包 zip 里的配方 → 写 `kubejs/data/<ns>/recipes/<path>.json` 覆盖同名 ID（需要 KubeJS）；
 * - kubejs/data、openloader 等散文件 → 原地覆盖该文件（临时文件 + rename）；
 * - 另存副本 → `kubejs/data/recipe_studio/recipes/...` 新文件。
 */
import { promises as fsp } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { CommitRecipeRequest, CommitRecipeResult, OpenedRecipe } from '../../shared/ipc'
import type { ModpackInfo, RecipeRecord, WorkbenchState } from '../../shared/types'
import type { NormalizedSchema } from '../../shared/schemaModel'
import { canonicalStringify, hashRaw } from '../../shared/canonicalJson'
import { applyDraftToNormalized, hasUnsafeUnknown } from '../../shared/draftApply'
import { denormalizeRecipe, normalizeRecipe } from '../../shared/normalize'
import { getCurrentModpack, patchSummaryRecipes } from '../modpack/state'
import { logger } from '../logger'
import { extractRecipeIo } from './heuristics'
import { backupOriginalFile } from './backup'
import { readFullRecipe } from './lazy'
import { lookup, addRecipeRecord, replaceRecipeByRecipeId, stats as recipeStatsOf } from './recipeIndex'
import { selectSchema, type SchemaSelection } from './selectSchema'

export type CommitErrorCode =
  | 'NO_TYPE'
  | 'INVALID_RECIPE'
  | 'RECIPE_NOT_FOUND'
  | 'UID_MISMATCH'
  | 'RAW_UNREADABLE'
  | 'CONFLICT'
  | 'SCHEMA_CHANGED'
  | 'UNSAFE'
  | 'UNSUPPORTED_SOURCE'
  | 'INVALID_DIRTY_FIELDS'
  | 'NO_CHANGES'
  | 'TYPE_CHANGED'
  | 'NO_MODPACK'
  | 'NO_WRITABLE_TARGET'
  | 'TARGET_EXISTS'
  /** P-C6：覆盖前备份原文件失败 → 未执行写入 */
  | 'BACKUP_FAILED'
  /** P-C6：写入过程中目标被外部改动（rename 前的二次校验失败）→ 未执行覆盖 */
  | 'TARGET_CHANGED'
  /** P-C6：回读时目标已被外部删除 → 不复活、不覆盖 */
  | 'TARGET_VANISHED'
  | 'SAVE_FAILED'
  | 'SAVE_VERIFY_FAILED'
  /** P-C6：回读校验失败后回滚也失败 → 目标状态不确定 */
  | 'SAVE_ROLLBACK_FAILED'
  /** B120/E-1：解析链接后目标落在整合包之外 → 拒绝写入 */
  | 'PATH_ESCAPE'
  /** B120/E-2：请求体本身畸形（渲染层不应发出）→ 未进入任何业务分支 */
  | 'INVALID_REQUEST'

export class CommitError extends Error {
  readonly code: CommitErrorCode
  constructor(message: string, code: CommitErrorCode) {
    super(message)
    this.name = code
    this.code = code
  }
}

export interface CommitDeps {
  modpack?: ModpackInfo | null
  lookup?: (uid: string) => RecipeRecord | null
  readFull?: (record: RecipeRecord) => Promise<{ json: unknown; sourcePath: string }>
  select?: (typeId: string) => SchemaSelection
  /** 默认临时文件 + rename；`guard` 在 rename 之前调用，可在此发现目标被外部改动；测试可注入失败 */
  writeAtomic?: (target: string, text: string, guard?: () => Promise<void>) => Promise<void>
  /** 读文本；不存在返回 null */
  readText?: (path: string) => Promise<string | null>
  removeFile?: (path: string) => Promise<void>
  /** P-C6：覆盖前备份原文件（默认写 userData/recipe-backups） */
  backup?: (input: { target: string; content: string; modpackPath: string; now?: number }) => Promise<{
    file: string
    metaFile: string
    sha256: string
    bytes: number
  }>
  upsertIndex?: (mode: 'overwrite' | 'copy', oldRecipeId: string, record: RecipeRecord) => void
  /** 提交后刷新摘要里的配方统计（默认写回 modpack 摘要） */
  refreshSummary?: (recipes: import('../../shared/types').RecipeStats) => void
  now?: () => number
}

const SAFE_RECIPE_PATH = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i

function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * B120/E-1：求「最近一个存在祖先」的真实路径，再把不存在的尾部按字面拼回去。
 *
 * 直接用 `realpath(target)` 对新建目标是行不通的（`recipe_studio/recipes` 往往还不存在，
 * 会 ENOENT）；只对 `dirname` 求一次 realpath 也不够（多级目录都不存在时同样失败）。
 * 不存在的中间路径不可能本身是链接，因此「真实祖先 + 字面尾部」是等价的。
 */
async function realpathNearest(path: string): Promise<string | null> {
  let current = resolve(path)
  const tail: string[] = []
  for (let i = 0; i < 64; i += 1) {
    try {
      const real = await fsp.realpath(current)
      return tail.length === 0 ? real : join(real, ...tail.reverse())
    } catch {
      const parent = dirname(current)
      if (parent === current) return null
      tail.push(basename(current))
      current = parent
    }
  }
  return null
}

/**
 * B120/E-1：`inside()` 只做词法判断（relative + isAbsolute），**不解析链接**——
 * 包内一个指向包外的 junction 能通过词法校验，把写入带到整合包之外。
 * 这里再做一次「realpath 之后仍须在包内」的判断；原词法校验保留（双校验，不替换）。
 */
async function isInsideReal(root: string, target: string): Promise<boolean> {
  if (!inside(root, target)) return false
  const rootReal = await realpathNearest(root)
  const targetReal = await realpathNearest(target)
  if (!rootReal || !targetReal) return false
  return inside(rootReal, targetReal)
}

async function defaultWriteAtomic(target: string, text: string, guard?: () => Promise<void>): Promise<void> {
  await fsp.mkdir(dirname(target), { recursive: true })
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`)
  let handle: Awaited<ReturnType<typeof fsp.open>> | null = null
  try {
    handle = await fsp.open(tmp, 'wx')
    await handle.writeFile(text, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    // 替换前最后一次确认目标仍是「我们读到的那个版本」：缩小 TOCTOU 窗口
    if (guard) await guard()
    await fsp.rename(tmp, target)
  } catch (err) {
    if (handle) await handle.close().catch(() => undefined)
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw err
  }
}

async function defaultReadText(path: string): Promise<string | null> {
  try {
    return await fsp.readFile(path, 'utf8')
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return null
    throw err
  }
}

function recipePath(recipeId: string): { ns: string; rel: string } | null {
  if (!SAFE_RECIPE_PATH.test(recipeId)) return null
  const idx = recipeId.indexOf(':')
  const ns = recipeId.slice(0, idx).toLowerCase()
  const rel = recipeId.slice(idx + 1).replace(/\.json$/i, '')
  if (!ns || !rel || rel.split('/').some((part) => part === '' || part === '.' || part === '..')) return null
  return { ns, rel }
}

function dirtyForWrite(normalized: ReturnType<typeof normalizeRecipe>['normalized'], dirty: readonly string[]): string[] {
  return dirty.map((key) =>
    key === 'outputs' && !normalized.slots.some((s) => s.key === 'outputs') && normalized.slots.some((s) => s.key === 'result')
      ? 'result'
      : key
  )
}

/**
 * B120/E-2：`recipes:commit` 的主进程运行时校验（不信任渲染层）。
 *
 * 只做「挡住畸形输入」的最小集，不做业务校验（业务校验散在提交流程里各司其职）：
 * 网格尺寸越界、`values` 形状不对、脏字段不是非空短字符串等都属于渲染层被攻破
 * 或出 bug 时不该写盘的输入。报错给用户可读中文；错误码统一 `INVALID_REQUEST`。
 * 纯函数、无 IO——可独立测试。
 */
export function validateCommitRequest(req: CommitRecipeRequest): void {
  function fail(message: string): never {
    throw new CommitError(message, 'INVALID_REQUEST')
  }
  if (typeof req !== 'object' || req === null) fail('提交请求格式不正确')
  const r = req as unknown as Record<string, unknown>
  if (typeof r['uid'] !== 'string' || (r['uid'] as string).length === 0 || (r['uid'] as string).length > 512) {
    fail('提交请求缺少有效的配方标识（uid）')
  }
  if (r['mode'] !== 'overwrite' && r['mode'] !== 'copy' && r['mode'] !== 'create') {
    fail('提交模式不正确（只支持覆盖 / 另存副本 / 新建）')
  }
  const dirty: unknown = r['dirtyFields']
  if (!Array.isArray(dirty) || dirty.length > 256) fail('脏字段列表不正确')
  for (const item of dirty) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 128) {
      fail('脏字段列表含有不合法的字段名')
    }
  }
  const wb = r['workbench']
  if (typeof wb !== 'object' || wb === null || Array.isArray(wb)) fail('工作台状态缺失或格式不正确')
  const w = wb as Record<string, unknown>
  const values = w['values']
  if (typeof values !== 'object' || values === null || Array.isArray(values)) fail('工作台槽位数据不正确')
  if (w['typeId'] !== undefined && (typeof w['typeId'] !== 'string' || (w['typeId'] as string).length > 512)) {
    fail('工作台配方类型不正确')
  }
  // B120/E-2（任务书 v3 增补）：shaped 布局必须显式携带整数 1–9 的网格尺寸——渲染层
  // 漏发时不得静默按 3×3 兜底（9×9 草稿会被写坏成 3×3）。非 shaped 布局不用网格，缺省合法。
  const shaped = w['layoutKind'] === 'shaped'
  for (const key of ['gridRows', 'gridCols'] as const) {
    const v = w[key]
    if (v === undefined) {
      if (shaped) fail(`shaped 草稿缺少网格尺寸（${key}）`)
      continue
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 9) {
      fail('网格尺寸必须是 1–9 的整数')
    }
  }
}

/**
 * B120/E-2（任务书 v3 增补）：shaped 写回必须有显式网格尺寸，删除原 `?? 3` 静默兜底。
 * validateCommitRequest 已在入口闸过一次；这里是第二道（防 workbench.layoutKind 与
 * schema.layoutKind 不一致时从两处 denormalize 点漏过）。
 */
function shapedGridSize(rows: number | undefined, cols: number | undefined): { rows: number; cols: number } {
  if (rows === undefined || cols === undefined) {
    throw new CommitError('shaped 草稿缺少网格尺寸', 'INVALID_REQUEST')
  }
  return { rows, cols }
}


function makeRecord(opts: {
  recipeId: string
  type: string
  path: string
  modpack: ModpackInfo
  previous: RecipeRecord
  json: Record<string, unknown>
  copy: boolean
}): RecipeRecord & { effectiveSource: string } {
  const heur = extractRecipeIo(opts.type, opts.json)
  const target = slash(opts.path)
  const entry = inside(join(opts.modpack.path, 'kubejs', 'data'), opts.path)
    ? slash(relative(join(opts.modpack.path, 'kubejs', 'data'), opts.path))
    : slash(relative(opts.modpack.path, opts.path))
  const definedBy = opts.copy
    ? undefined
    : [...(opts.previous.definedBy ?? [opts.previous.sourcePath]), opts.previous.sourcePath, target].filter(
        (v, i, arr) => v && arr.indexOf(v) === i
      )
  return {
    uid: `file:${target}`,
    recipeId: opts.recipeId,
    type: opts.type,
    outputs: heur.outputs,
    inputs: heur.inputs,
    source: 'datapack',
    sourcePath: target,
    partial: heur.partial,
    jarPath: opts.path,
    entryPath: entry,
    ...(heur.unknownIds.length > 0 ? { unknownIds: heur.unknownIds } : {}),
    ...(definedBy && definedBy.length > 1 ? { definedBy } : {}),
    effectiveSource: target
  }
}

function selectionMatches(selection: SchemaSelection, req: CommitRecipeRequest): boolean {
  if (selection.schema.id !== req.expectedSchemaId) return false
  const expectedRevision = req.expectedSchemaRevision
  if (expectedRevision !== undefined && (selection.schema.revision ?? 0) !== expectedRevision) return false
  return true
}

/**
 * 提交草稿。所有失败都以 CommitError 抛出（name = code），不返回“假成功”。
 */
export async function commitRecipe(req: CommitRecipeRequest, deps: CommitDeps = {}): Promise<CommitRecipeResult> {
  // B120/E-2：主进程不信任渲染层——入口先过形状校验，且必须在分支之前（create 也走同一道闸）
  validateCommitRequest(req)
  // T-28：'create' 走独立分支——空白草稿没有索引记录，不能复用 overwrite/copy 的
  // 「先 find(uid) 再以 record.rel 派生路径」流程（那两者行为零改动）。
  if (req.mode === 'create') return commitCreateRecipe(req, deps)
  const modpack = deps.modpack === undefined ? getCurrentModpack() : deps.modpack
  if (!modpack) throw new CommitError('尚未导入整合包', 'NO_MODPACK')

  const find = deps.lookup ?? lookup
  const readFull = deps.readFull ?? readFullRecipe
  const select = deps.select ?? selectSchema
  const writeAtomic = deps.writeAtomic ?? defaultWriteAtomic
  const readText = deps.readText ?? defaultReadText
  const removeFile = deps.removeFile ?? ((path: string) => fsp.rm(path, { force: true }))
  const now = deps.now ?? (() => Date.now())

  const record = find(req.uid)
  if (!record) throw new CommitError(`配方不在索引中：${req.uid}`, 'RECIPE_NOT_FOUND')
  if (record.uid !== req.uid) throw new CommitError('草稿 uid 与索引记录不一致，拒绝提交', 'UID_MISMATCH')
  if (record.source === 'kubejs') {
    throw new CommitError('KubeJS 脚本配方由摘要重建，不能安全回写；请在脚本里修改', 'UNSUPPORTED_SOURCE')
  }
  if (req.dirtyFields.length === 0) throw new CommitError('没有需要保存的修改', 'NO_CHANGES')

  // 1) 提交前重新读取当前原始数据（不依赖打开时那次检查）
  let current: { json: unknown; sourcePath: string }
  try {
    current = await readFull(record)
  } catch (err) {
    throw new CommitError(`无法读取当前原始配方：${err instanceof Error ? err.message : String(err)}`, 'RAW_UNREADABLE')
  }
  if (!current.json || typeof current.json !== 'object' || Array.isArray(current.json)) {
    throw new CommitError('当前原始配方不是 JSON 对象，拒绝写入', 'RAW_UNREADABLE')
  }
  const currentJson = current.json as Record<string, unknown>
  const currentHash = hashRaw(currentJson)

  // 2) schema 固定并复核；草稿必须仍然对应当前试点规则
  const selection = select(record.type)
  if (!selectionMatches(selection, req)) {
    throw new CommitError(`Schema 已变化（当前 ${selection.schema.id} rev ${selection.schema.revision ?? 0}），请重新打开配方`, 'SCHEMA_CHANGED')
  }
  const schema: NormalizedSchema = selection.schema

  // 3) 基线冲突：覆盖模式必须与提交时的原始 hash 完全一致
  if (req.mode === 'overwrite') {
    if (!req.expectedRawHash || req.expectedRawHash !== currentHash) {
      throw new CommitError(
        `原始配方已变化（基线 ${req.expectedRawHash ?? '缺失'}，当前 ${currentHash}），默认拒绝覆盖`,
        'CONFLICT'
      )
    }
  }

  // 4) 用当前原始重新规范化；unsafe / dirty 字段独立校验
  const normalizedBase = normalizeRecipe({
    raw: currentJson,
    rawText: JSON.stringify(currentJson),
    schema,
    uid: record.uid,
    source: {
      source: record.source,
      sourcePath: record.sourcePath,
      ...(record.jarPath ? { jarPath: record.jarPath } : {}),
      ...(record.entryPath ? { entryPath: record.entryPath } : {})
    }
  }).normalized
  if (hasUnsafeUnknown(normalizedBase)) {
    throw new CommitError('草稿含无法安全表达的引用（unknown），拒绝覆盖', 'UNSAFE')
  }
  const dirty = [...new Set(req.dirtyFields.filter((k) => typeof k === 'string' && k.length > 0))]
  const validKeys = new Set(normalizedBase.slots.map((s) => s.key))
  for (const key of dirty) {
    if (key === 'outputs' && !validKeys.has('outputs') && validKeys.has('result')) continue
    if (!validKeys.has(key)) throw new CommitError(`脏字段不对应可用槽位：${key}`, 'INVALID_DIRTY_FIELDS')
  }

  const workbench: WorkbenchState = req.workbench
  // B121/R-1：schema 参与形态仲裁（multiple 语义），单值槽不再被误包成数组
  const normalizedApplied = applyDraftToNormalized(normalizedBase, workbench, dirty, schema)
  const writeDirty = dirtyForWrite(normalizedApplied, dirty)
  let savedJson: Record<string, unknown>
  try {
    const out = denormalizeRecipe(normalizedApplied, schema, {
      dirtyFields: writeDirty,
      ...(schema.layoutKind === 'shaped'
        ? {
            gridSize: shapedGridSize(workbench.gridRows, workbench.gridCols)
          }
        : {})
    })
    if (out.kind !== 'json') throw new Error('反解没有返回 JSON 对象')
    savedJson = out.json
  } catch (err) {
    throw new CommitError(`无法把草稿安全序列化为 JSON：${err instanceof Error ? err.message : String(err)}`, 'UNSAFE')
  }
  if (savedJson['type'] !== record.type) {
    throw new CommitError('草稿的配方类型与原始不一致，拒绝写入', 'TYPE_CHANGED')
  }
  const savedHash = hashRaw(savedJson)
  if (savedHash === currentHash) throw new CommitError('草稿与原配方内容相同，没有需要保存的修改', 'NO_CHANGES')

  // 5) 目标路径
  const parsed = recipePath(record.recipeId)
  if (!parsed) throw new CommitError(`配方 ID 无法映射为安全文件路径：${record.recipeId}`, 'NO_WRITABLE_TARGET')
  const fileBacked = record.uid.startsWith('file:')
  let target: string
  let savedRecipeId = record.recipeId
  if (req.mode === 'copy') {
    if (!modpack.hasKubejs) {
      throw new CommitError('该整合包没有 KubeJS，无法写入 recipe_studio 数据包', 'NO_WRITABLE_TARGET')
    }
    const stamp = new Date(now()).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const leaf = `${parsed.rel.replace(/[^a-z0-9/_-]/gi, '_').replace(/\//g, '_')}_${stamp}`
    const dir = join(modpack.path, 'kubejs', 'data', 'recipe_studio', 'recipes')
    let candidate = join(dir, `${leaf}.json`)
    for (let i = 1; i < 100 && (await readText(candidate)) !== null; i += 1) {
      candidate = join(dir, `${leaf}_${i}.json`)
    }
    target = candidate
    savedRecipeId = `recipe_studio:${slash(relative(join(modpack.path, 'kubejs', 'data'), target)).replace(/\.json$/i, '')}`
  } else if (fileBacked) {
    target = resolve(record.sourcePath)
    if (!inside(modpack.path, target) || !target.toLowerCase().endsWith('.json')) {
      throw new CommitError('原始配方文件不在整合包内，拒绝原地覆盖', 'NO_WRITABLE_TARGET')
    }
    // B120/E-1：词法过了不等于真实路径在包内（源文件或它的父目录可能是指向包外的链接）
    if (!(await isInsideReal(modpack.path, target))) {
      throw new CommitError('目标路径越出整合包目录', 'PATH_ESCAPE')
    }
  } else {
    if (!modpack.hasKubejs) {
      throw new CommitError('该整合包没有 KubeJS，无法写覆盖数据包；当前不会改动原始文件', 'NO_WRITABLE_TARGET')
    }
    target = join(modpack.path, 'kubejs', 'data', parsed.ns, 'recipes', `${parsed.rel}.json`)
    const existing = await readText(target)
    if (existing !== null) {
      throw new CommitError(`覆盖目标已存在且不是当前基线：${target}。请先确认该数据包文件`, 'TARGET_EXISTS')
    }
  }

  if (!inside(modpack.path, target)) {
    throw new CommitError('写盘路径越出整合包目录，拒绝写入', 'NO_WRITABLE_TARGET')
  }
  // B120/E-1：写盘前再按真实路径校验一次（copy / 覆盖数据包两条分支都在这里收敛）
  if (!(await isInsideReal(modpack.path, target))) {
    throw new CommitError('目标路径越出整合包目录', 'PATH_ESCAPE')
  }

  // 文件型覆盖：写前再次确认目标内容仍是当前基线（防止读后被外部修改）
  const previous = await readText(target)
  if (req.mode === 'copy' && previous !== null) {
    throw new CommitError('另存副本目标在写入前已被占用，请重试', 'TARGET_EXISTS')
  }
  if (req.mode === 'overwrite' && !fileBacked && previous !== null) {
    throw new CommitError(`覆盖目标在提交前出现且不在索引中：${target}`, 'TARGET_EXISTS')
  }
  if (req.mode === 'overwrite' && previous !== null) {
    let previousHash: string | null = null
    try {
      previousHash = hashRaw(JSON.parse(previous.replace(/^\uFEFF/, '')))
    } catch {
      previousHash = null
    }
    if (previousHash !== currentHash) {
      throw new CommitError('目标文件在提交前已变化，默认拒绝覆盖', 'CONFLICT')
    }
  }

  const text = `${JSON.stringify(savedJson, null, 2)}\n`
  const relTarget = slash(relative(modpack.path, target))
  const runBackup = deps.backup ?? backupOriginalFile

  // 5.5) 覆盖已有文件前先备份：备份失败即中止，绝不在没有退路的情况下覆盖
  let backupCreated = false
  let backupName: string | null = null
  if (previous !== null) {
    try {
      const saved = await runBackup({ target, content: previous, modpackPath: modpack.path, now: now() })
      backupCreated = true
      backupName = basename(saved.file)
    } catch (err) {
      throw new CommitError(
        `写入前备份原文件失败，已中止覆盖（${relTarget} 未被改动）：${
          (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err))
        }`,
        'BACKUP_FAILED'
      )
    }
  }

  // rename 前的二次确认：目标必须仍是刚才读到的那一份
  const guard = async (): Promise<void> => {
    const latest = await readText(target)
    const unchanged = previous === null ? latest === null : latest !== null && latest === previous
    if (!unchanged) {
      throw new CommitError(`目标文件在写入过程中被外部修改，已放弃覆盖：${relTarget}`, 'TARGET_CHANGED')
    }
  }

  try {
    await writeAtomic(target, text, guard)
  } catch (err) {
    if (err instanceof CommitError) throw err
    const reason = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err))
    throw new CommitError(`写入失败（${relTarget}）：${reason}`, 'SAVE_FAILED')
  }

  // 6) 保存成功后重新读取实际文件；任何不一致都回滚并报失败
  const rollback = async (): Promise<{ ok: boolean; detail?: string }> => {
    try {
      if (previous !== null) await writeAtomic(target, previous)
      else await removeFile(target)
      logger.warn('IO', `已回滚本次写入：${relTarget}`)
      return { ok: true }
    } catch (err) {
      const detail = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err))
      logger.error(
        'IO',
        `回滚失败，目标状态不确定：${relTarget}（${detail}）`,
        backupCreated ? `原文件备份：${backupName}` : '无备份'
      )
      return { ok: false, detail }
    }
  }

  /** 校验失败统一出口：能回滚就报 SAVE_VERIFY_FAILED，回滚失败必须升级为“状态不确定” */
  const failAfterVerify = async (message: string): Promise<never> => {
    const r = await rollback()
    if (r.ok) throw new CommitError(`${message}（已回滚到提交前内容）`, 'SAVE_VERIFY_FAILED')
    throw new CommitError(
      `${message}；回滚也失败（${r.detail}），目标文件状态不确定。请先检查 ${relTarget}` +
        (backupCreated ? `；原文件备份：${backupName}` : '；本次为新建文件，无备份'),
      'SAVE_ROLLBACK_FAILED'
    )
  }

  let readBack: string | null
  try {
    readBack = await readText(target)
  } catch {
    return failAfterVerify(`保存后读取 ${relTarget} 失败`)
  }
  if (readBack === null) {
    if (previous !== null) {
      // 外部删除：既不复活旧文件，也不改写外部选择
      throw new CommitError(`目标文件在提交过程中被外部删除，已停止并保持删除状态：${relTarget}`, 'TARGET_VANISHED')
    }
    return failAfterVerify(`保存后目标文件不存在：${relTarget}`)
  }
  let parsedBack: Record<string, unknown>
  try {
    const back = JSON.parse(readBack.replace(/^\uFEFF/, '')) as unknown
    if (!back || typeof back !== 'object' || Array.isArray(back)) throw new Error('不是 JSON 对象')
    parsedBack = back as Record<string, unknown>
  } catch {
    return failAfterVerify(`保存后 JSON 解析失败：${relTarget}`)
  }
  if (canonicalStringify(parsedBack) !== canonicalStringify(savedJson)) {
    return failAfterVerify(`保存后内容与草稿不一致：${relTarget}`)
  }

  const savedRecord = makeRecord({
    recipeId: savedRecipeId,
    type: record.type,
    path: target,
    modpack,
    previous: record,
    json: parsedBack,
    copy: req.mode === 'copy'
  })
  const savedNormalized = normalizeRecipe({
    raw: parsedBack,
    rawText: readBack,
    schema,
    uid: savedRecord.uid,
    source: {
      source: 'datapack',
      sourcePath: savedRecord.sourcePath,
      ...(savedRecord.jarPath ? { jarPath: savedRecord.jarPath } : {}),
      ...(savedRecord.entryPath ? { entryPath: savedRecord.entryPath } : {})
    }
  })
  const opened: OpenedRecipe = {
    record: savedRecord,
    schema,
    schemaSource: selection.source,
    status: 'ok',
    rawKind: 'file',
    raw: { json: parsedBack, rawText: readBack },
    normalized: savedNormalized.normalized,
    diagnostics: savedNormalized.diagnostics,
    notes: [`已保存到 ${slash(relative(modpack.path, target))}`]
  }

  // 7) 索引与摘要：文件已落盘，但索引更新是独立步骤，成功与否必须显式回报（不能静默）
  const refreshSummary = deps.refreshSummary ?? patchSummaryRecipes
  let indexUpdated = false
  let indexWarning: string | undefined
  try {
    if (deps.upsertIndex) deps.upsertIndex(req.mode, record.recipeId, savedRecord)
    else if (req.mode === 'copy') addRecipeRecord(savedRecord)
    else if (!replaceRecipeByRecipeId(record.recipeId, savedRecord)) addRecipeRecord(savedRecord)
    const nextStats = recipeStatsOf()
    if (nextStats) refreshSummary(nextStats)
    indexUpdated = true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    indexWarning = `文件已写入，但内存索引更新失败（${message}）；请执行「重新扫描」以恢复索引`
    logger.error('INDEX', '提交成功但索引更新失败，重启/重扫后可恢复', message)
  }

  logger.success(
    'IO',
    `已提交配方 ${record.recipeId} → ${slash(relative(modpack.path, target))}（${Buffer.byteLength(text, 'utf8')} 字节，${dirty.join('、')}）`
  )
  return {
    mode: req.mode,
    recipeId: savedRecipeId,
    savedUid: savedRecord.uid,
    savedPath: target,
    savedRelativePath: slash(relative(modpack.path, target)),
    savedRawHash: savedHash,
    opened,
    dirtyFields: dirty,
    bytes: Buffer.byteLength(text, 'utf8'),
    backupCreated,
    indexUpdated,
    ...(indexWarning ? { indexWarning } : {})
  }
}

/**
 * T-28 `create`：从零新建一条 datapack 配方。
 *
 * 与 overwrite/copy 的区别：**不查索引**（无 record 可依赖），用 `{type}` 作为最小基线
 * 规范化出空槽位，再把 workbench 全量套上去反解成 JSON。
 *
 * 硬约束：**必须复用 writer**（`writeAtomic` = tmp+fsync+rename + 根校验），
 * 写后回读校验、不一致即回滚（新建无原件 → 删文件）。
 */
async function commitCreateRecipe(req: CommitRecipeRequest, deps: CommitDeps = {}): Promise<CommitRecipeResult> {
  const modpack = deps.modpack === undefined ? getCurrentModpack() : deps.modpack
  if (!modpack) throw new CommitError('尚未导入整合包', 'NO_MODPACK')
  if (!modpack.hasKubejs) {
    throw new CommitError('该整合包没有 KubeJS，无法写入 recipe_studio 数据包', 'NO_WRITABLE_TARGET')
  }
  const select = deps.select ?? selectSchema
  const writeAtomic = deps.writeAtomic ?? defaultWriteAtomic
  const readText = deps.readText ?? defaultReadText
  const removeFile = deps.removeFile ?? ((path: string) => fsp.rm(path, { force: true }))
  const now = deps.now ?? (() => Date.now())

  const typeId = req.workbench.typeId
  if (!typeId) throw new CommitError('没有配方类型，无法新建', 'NO_TYPE')
  // P3-15：保留 selection 的 source/notes，用于构造完整的 OpenedRecipe（不再靠 as 掩盖缺字段）
  const selection = select(typeId)
  const schema = selection.schema

  // 基线必须是「结构完整的空模板」，否则 normalize 出的是空壳，
  // denormalize 无法把 grid 展开成 pattern/key（第 103 批实测：写出 {type,result} 的坏配方）。
  const emptyRaw: Record<string, unknown> = { type: typeId }
  if (schema.layoutKind === 'shaped') {
    emptyRaw['pattern'] = []
    emptyRaw['key'] = {}
  } else {
    for (const f of schema.slots) emptyRaw[f.key] = f.multiple === true ? [] : null
  }
  for (const f of schema.outputs) emptyRaw[f.key] = f.multiple === true ? [] : null
  const normalizedBase = normalizeRecipe({
    raw: emptyRaw,
    rawText: JSON.stringify(emptyRaw),
    schema,
    uid: req.uid,
    source: { source: 'datapack', sourcePath: '' }
  }).normalized
  const dirty = Object.keys(req.workbench.values).filter((k) => typeof k === 'string' && k.length > 0)
  // B121/R-1：create 分支同样传 schema 参与形态仲裁
  const normalizedApplied = applyDraftToNormalized(normalizedBase, req.workbench, dirty, schema)
  const writeDirty = dirtyForWrite(normalizedApplied, dirty)

  let savedJson: Record<string, unknown>
  try {
    const out = denormalizeRecipe(normalizedApplied, schema, {
      dirtyFields: writeDirty,
      ...(schema.layoutKind === 'shaped'
        ? { gridSize: shapedGridSize(req.workbench.gridRows, req.workbench.gridCols) }
        : {})
    })
    if (out.kind !== 'json') throw new Error('反解没有返回 JSON 对象')
    savedJson = out.json
  } catch (err) {
    throw new CommitError(
      '无法把草稿安全序列化为 JSON：' + (err instanceof Error ? err.message : String(err)),
      'UNSAFE'
    )
  }
  if (savedJson['type'] !== typeId) {
    throw new CommitError('生成结果的类型与所选类型不一致，拒绝写入', 'TYPE_CHANGED')
  }
  // 双保险：shaped 缺 pattern/key 一律拒绝（不写文件）——防止 create 再写出坏配方。
  // 只作用于 create：overwrite 的 pattern 来自原文件，未改动时不应被判违规。
  if (schema.layoutKind === 'shaped') {
    const pattern = savedJson['pattern']
    const key = savedJson['key']
    const patternEmpty = !Array.isArray(pattern) || pattern.every((r) => typeof r !== 'string' || r.trim() === '')
    const keyEmpty = !key || typeof key !== 'object' || Object.keys(key as Record<string, unknown>).length === 0
    if (patternEmpty || keyEmpty) {
      throw new CommitError('有序合成必须有 pattern 与 key（至少一个材料），已拒绝写入', 'INVALID_RECIPE')
    }
  }

  const slug = typeId.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'recipe'
  const stamp = new Date(now()).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const dir = join(modpack.path, 'kubejs', 'data', 'recipe_studio', 'recipes')
  let leaf = slug + '_' + stamp
  let target = join(dir, leaf + '.json')
  for (let i = 1; i < 100 && (await readText(target)) !== null; i += 1) {
    leaf = slug + '_' + stamp + '_' + i
    target = join(dir, leaf + '.json')
  }
  if ((await readText(target)) !== null) {
    throw new CommitError('新建目标文件名冲突过多，请稍后重试', 'TARGET_EXISTS')
  }
  // B120/E-1：新建目录/文件同样要过真实路径校验（kubejs/data 下可能已有指向包外的链接）
  if (!(await isInsideReal(modpack.path, dir)) || !(await isInsideReal(modpack.path, target))) {
    throw new CommitError('目标路径越出整合包目录', 'PATH_ESCAPE')
  }

  const recipeId = 'recipe_studio:' + leaf
  const text = JSON.stringify(savedJson, null, 2) + '\n'
  const relTarget = slash(relative(modpack.path, target))

  const guard = async (): Promise<void> => {
    if ((await readText(target)) !== null) {
      throw new CommitError('新建目标在写入过程中被占用：' + relTarget, 'TARGET_EXISTS')
    }
  }
  try {
    await writeAtomic(target, text, guard)
  } catch (err) {
    if (err instanceof CommitError) throw err
    const reason = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err))
    throw new CommitError('写入失败（' + relTarget + '）：' + reason, 'SAVE_FAILED')
  }

  const readBack = await readText(target)
  const expectedHash = hashRaw(savedJson)
  if (readBack === null) {
    throw new CommitError('写入后回读为空：' + relTarget, 'SAVE_VERIFY_FAILED')
  }
  try {
    const backHash = hashRaw(JSON.parse(readBack.replace(/^\uFEFF/, '')))
    if (backHash !== expectedHash) {
      await removeFile(target).catch(() => undefined)
      throw new CommitError('回读内容与预期不一致，已删除本次新建：' + relTarget, 'SAVE_VERIFY_FAILED')
    }
  } catch (err) {
    if (err instanceof CommitError) throw err
    await removeFile(target).catch(() => undefined)
    throw new CommitError('回读内容无法解析，已删除本次新建：' + relTarget, 'SAVE_VERIFY_FAILED')
  }

  // file: 记录的路径由 uid 推导（recipes/lazy.ts: `splitUid(uid).rest`）——
  // 必须写真实相对路径，否则再次打开会 STALE「源文件已失效」。
  const absTarget = slash(target)
  const finalUid = 'file:' + absTarget
  const normalizedFinal = normalizeRecipe({
    raw: savedJson,
    rawText: readBack,
    schema,
    uid: finalUid,
    source: { source: 'datapack', sourcePath: absTarget }
  }).normalized
  const io = extractRecipeIo(typeId, savedJson)
  const record: RecipeRecord = {
    uid: finalUid,
    recipeId,
    type: typeId,
    source: 'datapack',
    sourcePath: absTarget,
    outputs: io.outputs,
    inputs: io.inputs,
    partial: io.partial
  }
  let indexWarning: string | undefined
  let indexUpdated = true
  try {
    addRecipeRecord(record)
    const st = recipeStatsOf()
    if (st) patchSummaryRecipes(st)
  } catch (err) {
    indexUpdated = false
    indexWarning = err instanceof Error ? err.message : String(err)
  }
  logger.success('RECIPE', '已新建配方：' + relTarget + '（' + Buffer.byteLength(text) + ' 字节）')
  return {
    mode: 'create',
    recipeId,
    savedUid: finalUid,
    savedPath: target,
    savedRelativePath: relTarget,
    savedRawHash: expectedHash,
    opened: {
      record,
      schema,
      schemaSource: selection.source,
      // 刚写完且回读校验通过，原文可读
      status: 'ok',
      rawKind: 'file',
      raw: { json: savedJson, rawText: readBack },
      normalized: normalizedFinal,
      diagnostics: [],
      notes: [...selection.notes]
    },
    dirtyFields: writeDirty,
    bytes: Buffer.byteLength(text),
    indexUpdated,
    backupCreated: false,
    ...(indexWarning ? { indexWarning } : {})
  }
}
