/**
 * 写盘（规格 3.7「写盘」+ 第六章「kubejs 目录只读」）。
 *
 * 硬性行为：
 * - 目录不存在自动创建 `kubejs/server_scripts/`（首次创建时留下提示文件）；
 * - 默认文件名 `recipe_studio_<yyyyMMdd_HHmmss>.js`，同会话内多文件时间戳递加 `_01/_02`；
 * - 追加模式插进已有文件的 `ServerEvents.recipes` / `onEvent('recipes'` 块内，插不进去就另建文件并在结果里说明；
 * - 覆盖前必须 `overwriteConfirmed`，并自动备份到 `<目录>/.backup/<原名>.<时间戳>`；
 * - 写盘前**自己再跑一次语法校验**：调用方忘了也不能把坏代码写出去（禁止事项 5）；
 * - `EACCES`/`EPERM` 抛出带 code 的错误（`name` 即错误码，ipcRegistry 原样透传），UI 据此提供「另存到桌面」。
 */
import { existsSync } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { SCRIPT_FILE_PREFIX } from '../../shared/constants'
import type { GenerationChannel, ModpackInfo } from '../../shared/types'
import type { WriteRequest, WriteResult } from '../../shared/ipc'
import { logger } from '../logger'
import type { DatapackFile } from './emitDatapack'
import { fileStamp, insertIntoExisting } from './scriptBlock'
import type { SyntaxResult } from './validate'
import { checkSyntax } from './validate'

const BACKUP_DIR = '.backup'
/** 默认生成名（时间戳 + 可选 `_01` 递增后缀）——命中它才允许自动改名，用户手命名的必须走确认覆盖 */
const DEFAULT_NAME_RE = new RegExp(`^${SCRIPT_FILE_PREFIX}\\d{8}_\\d{6}(_\\d{2})?\\.js$`)

export class GenerationError extends Error {
  readonly code: string
  constructor(message: string, code = 'GENERATE_FAILED') {
    super(message)
    this.name = code
    this.code = code
  }
}

export interface WritePayload {
  channel: GenerationChannel
  mcVersion: string | null
  header: string
  /** 事件块内的语句（未缩进），追加写入用 */
  statements: string[]
  /** 模式 A 的完整脚本文本 */
  code: string
  /** 模式 B 的文件集合 */
  datapackFiles: DatapackFile[]
  namespace: string
}

export interface WriteOptions {
  modpack: ModpackInfo | null
  /** 无写权限时的替代出口：非空则只写这个目录 */
  alternateDir: string | null
  now?: number
}

export function scriptsDir(modpack: ModpackInfo): string {
  return join(modpack.path, 'kubejs', 'server_scripts')
}

/** 目录不存在则创建（连 `kubejs/` 一起建），首次创建留下提示文件 */
export async function ensureScriptsDir(modpack: ModpackInfo): Promise<string> {
  const dir = scriptsDir(modpack)
  if (existsSync(dir)) return dir
  try {
    await mkdir(dir, { recursive: true })
    const hint = join(dir, 'README-recipe-studio.txt')
    if (!existsSync(hint)) {
      await writeFile(
        hint,
        '本目录由 KubeJS Recipe Studio 自动创建。\n' +
          '生成的脚本写在这里，游戏内执行 /reload 生效。\n' +
          '覆盖旧文件前会自动备份到 .backup/ 子目录，可随时恢复。\n',
        'utf8'
      )
    }
  } catch (err) {
    throw describeWriteFailure(err, dir)
  }
  logger.info('IO', `已创建脚本目录：${relative(modpack.path, dir).replace(/\\/g, '/')}`, dir)
  return dir
}

/** `recipe_studio_<yyyyMMdd_HHmmss>.js`（规格 3.7 默认文件名） */
export function defaultScriptFileName(atMs: number): string {
  return `${SCRIPT_FILE_PREFIX}${fileStamp(atMs)}.js`
}

/** 同会话多文件：时间戳递加 `_01`、`_02`（规格 3.6.5 ③，保证加载顺序可预期） */
export function uniqueSessionName(fileName: string, used: ReadonlySet<string>): string {
  if (!used.has(fileName)) return fileName
  const stem = fileName.replace(/\.js$/i, '')
  for (let n = 1; n <= 99; n += 1) {
    const candidate = `${stem}_${String(n).padStart(2, '0')}.js`
    if (!used.has(candidate)) return candidate
  }
  return `${stem}_${Date.now()}.js`
}

/** 只取文件名部分并补 `.js`：杜绝路径穿越与非法字符 */
export function sanitizeScriptName(fileName: string): string {
  const clean = basename(fileName.replace(/\\/g, '/')).trim()
  if (!clean) throw new GenerationError('文件名为空，无法写入', 'EMPTY_NAME')
  if (/[<>:"|?*]/.test(clean) || /\0/.test(clean)) throw new GenerationError(`文件名含非法字符：${clean}`, 'BAD_NAME')
  return /\.(js|ts)$/i.test(clean) ? clean : `${clean}.js`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** fs 错误 → 用户可读错误（规格第六章：kubejs 目录只读时给出可执行出口） */
export function describeWriteFailure(err: unknown, pathOrDir: string): GenerationError {
  const code = (err as { code?: string }).code ?? 'IO_ERROR'
  if (code === 'EACCES' || code === 'EPERM') {
    return new GenerationError(
      `无写入权限（${code}）：${pathOrDir}。请以管理员身份运行，或用「另存到桌面」导出后手动放入 kubejs/server_scripts/`,
      code
    )
  }
  return new GenerationError(`写入失败（${code}）：${pathOrDir}`, code)
}

/** 语法门：writer 自己再查一遍，调用方漏了也拦得住 */
function assertSyntax(code: string, channel: GenerationChannel): void {
  const result: SyntaxResult = checkSyntax(code, channel)
  if (result.ok) {
    logger.info('IO', channel === 'datapack-json' ? '数据包 JSON 语法预检通过' : 'acorn 语法预检通过')
    return
  }
  const where = result.line ? `第 ${result.line} 行：` : ''
  throw new GenerationError(`语法预检未通过，已阻止写盘。${where}${result.message ?? ''}`, 'SYNTAX_CHECK_FAILED')
}

async function writeOne(path: string, content: string, root: string): Promise<number> {
  // T-08：对齐 recipes:commit 的写盘保护——原子写（tmp + fsync + rename）+ 写后回读。
  // 原来直接 writeFile：半写会留下截断文件，且无法发现「写进去了但内容不对」。
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`)
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    await mkdir(dirname(path), { recursive: true })
    handle = await open(tmp, 'wx')
    await handle.writeFile(content, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await rename(tmp, path)
  } catch (err) {
    if (handle) {
      try {
        await handle.close()
      } catch {
        /* 关闭失败不掩盖原始错误 */
      }
    }
    try {
      await unlink(tmp)
    } catch {
      /* tmp 可能根本没创建 */
    }
    throw describeWriteFailure(err, path)
  }
  // 写后回读：与内存内容逐字节比对，不一致视为写坏（原子性保证的是「全有或全无」，不是「内容正确」）
  try {
    const back = await readFile(path, 'utf8')
    if (back !== content) {
      throw new GenerationError(`写入后回读不一致：${basename(path)}（可能被外部程序同时修改）`, 'WRITE_VERIFY_FAILED')
    }
  } catch (err) {
    if (err instanceof GenerationError) throw err
    throw describeWriteFailure(err, path)
  }
  const bytes = Buffer.byteLength(content, 'utf8')
  logger.info('IO', `已写入 ${relative(root, path).replace(/\\/g, '/')}（${formatBytes(bytes)}）`, path)
  return bytes
}

/** 覆盖前自动备份到同级 `.backup/<原名>.<时间戳>` */
/** T-08：与 recipes:commit 同义的根目录校验——目标必须落在 root 之内 */
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

async function backupExisting(file: string, root: string): Promise<string> {
  const target = join(dirname(file), BACKUP_DIR, `${basename(file)}.${fileStamp(Date.now())}`)
  try {
    await mkdir(dirname(target), { recursive: true })
    await rename(file, target)
  } catch (err) {
    throw describeWriteFailure(err, target)
  }
  logger.warn('IO', `已存在同名文件，备份至 ${relative(root, target).replace(/\\/g, '/')}`, target)
  return target
}

function datapackPathFor(alternateDir: string | null, modpack: ModpackInfo | null, file: DatapackFile): string {
  if (alternateDir) return join(alternateDir, 'data', file.relativePath.slice(file.relativePath.indexOf('data/') + 'data/'.length) || file.fileName)
  if (!modpack) throw new GenerationError('尚未导入整合包，且未指定导出目录', 'NO_TARGET')
  return join(modpack.path, file.relativePath)
}

async function writeDatapack(req: WriteRequest, payload: WritePayload, opts: WriteOptions): Promise<WriteResult> {
  const written: string[] = []
  let bytes = 0
  let backups = 0
  const root = opts.alternateDir ?? (opts.modpack?.path ?? '')
  for (const file of payload.datapackFiles) {
    assertSyntax(file.json, 'datapack-json')
    let path = datapackPathFor(opts.alternateDir ?? null, opts.modpack, file)
    // T-08：数据包路径同样必须落在 root 内（alternateDir 直通时尤其重要）
    if (root && !inside(root, path)) {
      throw new GenerationError(`目标路径超出整合包范围：${path}`, 'OUTSIDE_ROOT')
    }
    if (existsSync(path)) {
      if (!req.overwriteConfirmed) {
        const stem = basename(path).replace(/\.json$/i, '')
        let n = 1
        while (existsSync(join(dirname(path), `${stem}_${n}.json`)) && n < 99) n += 1
        path = join(dirname(path), `${stem}_${n}.json`)
      } else {
        await backupExisting(path, root)
        backups += 1
      }
    }
    bytes += await writeOne(path, file.json, root)
    written.push(path)
  }
  return {
    writtenPaths: written,
    bytes,
    backupPath: null,
    appendedTo: null,
    message:
      `已写出数据包 JSON：${written.map((p) => basename(p)).join('、')}（namespace ${payload.namespace}）。` +
      (backups > 0 ? `覆盖前已备份 ${backups} 个文件到 ${BACKUP_DIR}/。` : '') +
      '该通道不依赖任何 KubeJS 附属模组，游戏内执行 /reload 生效。'
  }
}

async function appendToExisting(
  dir: string,
  appendTo: string,
  payload: WritePayload,
  root: string
): Promise<{ path: string; appended: boolean; bytes: number; backupPath: string | null }> {
  const path = join(dir, sanitizeScriptName(appendTo))
  if (!existsSync(path)) throw new GenerationError(`要追加的文件不存在：${basename(path)}`, 'ENOENT')
  let original = ''
  try {
    original = await readFile(path, 'utf8')
  } catch (err) {
    throw describeWriteFailure(err, path)
  }
  const merged = insertIntoExisting(original, payload.statements)
  if (!merged.inserted) return { path, appended: false, bytes: 0, backupPath: null }
  const backupPath = join(dir, BACKUP_DIR, `${basename(path)}.${fileStamp(Date.now())}`)
  try {
    await mkdir(dirname(backupPath), { recursive: true })
    await writeFile(backupPath, original, 'utf8')
  } catch (err) {
    throw describeWriteFailure(err, backupPath)
  }
  logger.info('IO', `追加写入前已备份原文件：${relative(root, backupPath).replace(/\\/g, '/')}`, backupPath)
  const bytes = await writeOne(path, merged.text, root)
  return { path, appended: true, bytes, backupPath }
}

export async function writeGenerated(req: WriteRequest, payload: WritePayload, opts: WriteOptions): Promise<WriteResult> {
  const now = opts.now ?? Date.now()
  if (payload.channel === 'datapack-json' || payload.datapackFiles.length > 0) return writeDatapack(req, payload, opts)
  assertSyntax(payload.code, payload.channel)

  const root = opts.alternateDir ?? (opts.modpack ? opts.modpack.path : '')
  if (!root) throw new GenerationError('尚未导入整合包，且未指定导出目录', 'NO_TARGET')
  const dir = opts.alternateDir ?? (opts.modpack ? await ensureScriptsDir(opts.modpack) : '')
  const requested = sanitizeScriptName(req.fileName || defaultScriptFileName(now))

  if (req.mode === 'append' && req.appendTo && !opts.alternateDir) {
    const result = await appendToExisting(dir, req.appendTo, payload, root)
    if (result.appended) {
      return {
        writtenPaths: [result.path],
        bytes: result.bytes,
        backupPath: result.backupPath,
        appendedTo: result.path,
        message: `已追加到 ${relative(root, result.path).replace(/\\/g, '/')} 的配方事件块内（${formatBytes(result.bytes)}）；原文件已备份到 ${BACKUP_DIR}/。游戏内执行 /reload 生效。`
      }
    }
    // 追加失败后的新文件按会话序号命名（base 本身视为「已占用」，因此得到 _01），
    // 同时避开目录里真实存在的同名脚本，保证加载顺序可预期（规格 3.6.5 ③）。
    const base = defaultScriptFileName(now)
    let existing: string[] = []
    try {
      existing = await readdir(dir)
    } catch {
      /* 目录为空或刚创建 */
    }
    const fallback = uniqueSessionName(base, new Set([base, requested, ...existing]))
    const path = join(dir, fallback)
    const bytes = await writeOne(path, payload.code, root)
    return {
      writtenPaths: [path],
      bytes,
      backupPath: null,
      appendedTo: null,
      message: `无法安全插入 ${req.appendTo}（未找到可匹配的 ServerEvents.recipes / onEvent('recipes') 块，或块内结构有歧义），已另建 ${fallback}；KubeJS 按文件名典序加载，另建文件不影响生效。`
    }
  }

  let name = requested
  let path = join(dir, name)
  // T-08：脚本路径同样做根校验（alternateDir 直通时防止越界写）
  if (root && !inside(root, path)) {
    throw new GenerationError(`目标路径超出整合包范围：${path}`, 'OUTSIDE_ROOT')
  }
  let backupPath: string | null = null
  if (existsSync(path)) {
    if (!req.overwriteConfirmed) {
      if (!DEFAULT_NAME_RE.test(name)) {
        throw new GenerationError(`目标文件已存在：${name}。请确认覆盖（将自动备份到 ${BACKUP_DIR}/），或换一个文件名`, 'EEXIST')
      }
      name = uniqueSessionName(name, new Set([requested]))
      path = join(dir, name)
    } else {
      backupPath = await backupExisting(path, root)
    }
  }
  const bytes = await writeOne(path, payload.code, root).catch(async (err: unknown) => {
    // T-08 回滚：备份已把原件 rename 走，写入又失败 → 原路径会空着。必须把备份放回去。
    if (backupPath) {
      try {
        await rename(backupPath, path)
        logger.warn('IO', `写入失败，已把备份恢复到原位：${basename(path)}`, path)
      } catch (restoreErr) {
        logger.error('IO', `写入失败且备份恢复失败，原件留在备份目录：${backupPath}`, String(restoreErr))
      }
    }
    throw err
  })
  const message = `已写入 ${relative(root, path).replace(/\\/g, '/')}（${formatBytes(bytes)}）· 在游戏中执行 /reload 生效`
  return { writtenPaths: [path], bytes, backupPath, appendedTo: null, message }
}
