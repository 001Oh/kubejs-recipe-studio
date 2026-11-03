/**
 * 代码生成 IPC：`codegen:preview` / `codegen:checkTarget` / `codegen:write` /
 * `scripts:list` / `scripts:rename`。
 *
 * 约定：异常一律抛给 `ipcRegistry` 统一转 `{ ok:false, error, code }`；
 * `GenerationError` 的 `name` 就是 fs 错误码（EACCES / EPERM / EEXIST…），UI 据此提供「另存到桌面」。
 * 接线由 `handlers/index.ts` 负责（本文件不调用自己）。
 */
import { readdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GenerationChannel, GenerationPreference } from '../../shared/types'
import type { ScriptEntry } from '../../shared/ipc'
import { registerHandler } from '../ipcRegistry'
import { logger } from '../logger'
import { getUiState } from '../uiStateStore'
import { getCurrentModpack } from '../modpack/state'
import { checkTarget, rememberGeneration } from '../codegen/dedupe'
import { jarNamespaceProbe } from '../codegen/emitDatapack'
import { generate } from '../codegen/preview'
import { defaultScriptFileName, GenerationError, sanitizeScriptName, scriptsDir, writeGenerated } from '../codegen/writer'

/** 通道 → 生成偏好映射（「写入文件」对话框里的通道切换走同一条决策链） */
function preferenceForChannel(channel: GenerationChannel | undefined, fallback: GenerationPreference): GenerationPreference {
  if (channel === 'datapack-json') return 'always-datapack'
  if (channel === 'kubejs-sugar') return 'always-sugar'
  return fallback
}

function blockReason(preview: Awaited<ReturnType<typeof generate>>['preview']): string {
  const syntax = preview.syntaxError
  if (syntax) return `语法预检未通过（第 ${syntax.line} 行）：${syntax.message}`
  const errors = preview.diagnostics.filter((d) => d.level === 'error')
  if (errors.length > 0) return errors.map((d) => (d.field ? `${d.field}：${d.message}` : d.message)).join('；')
  if (!preview.canWrite) return '当前生成结果不可写盘'
  return '当前生成结果不可写盘'
}

async function listScripts(dir: string): Promise<ScriptEntry[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  // KubeJS 按文件名字典序加载 server_scripts（规格 3.6.5 ③），这里用同一套序给面板编号
  const scripts = names.filter((n) => /\.js$/i.test(n)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const entries: ScriptEntry[] = []
  for (const [index, name] of scripts.entries()) {
    let bytes = 0
    try {
      bytes = (await stat(join(dir, name))).size
    } catch {
      bytes = 0
    }
    entries.push({ name, order: index + 1, path: join(dir, name), bytes })
  }
  return entries
}

function requireScriptsDir(): string | null {
  const modpack = getCurrentModpack()
  return modpack ? scriptsDir(modpack) : null
}

export function registerCodegenHandlers(): void {
  registerHandler('codegen:preview', async (req) => {
    const { preview } = await generate({
      workbench: req.workbench,
      preference: req.preference ?? getUiState().generationPreference
    })
    return preview
  })

  registerHandler('codegen:checkTarget', async (req) => {
    const modpack = getCurrentModpack()
    const fileName = sanitizeScriptName(req.fileName || defaultScriptFileName(Date.now()))
    const { preview, payload } = await generate({
      workbench: req.workbench,
      fileName,
      preference: preferenceForChannel(req.channel, getUiState().generationPreference)
    })
    return checkTarget(
      preview.recipeId ?? '',
      fileName,
      payload.namespace,
      { modpack: () => modpack, semantic: {} },
      modpack ? jarNamespaceProbe(modpack.modsDir) : undefined
    )
  })

  registerHandler('codegen:write', async (req) => {
    if (!req.workbench?.typeId) throw new GenerationError('未选择配方类型，无法写入文件', 'NO_TYPE')
    const preference = preferenceForChannel(req.channel, getUiState().generationPreference)
    const { preview, payload } = await generate({
      workbench: req.workbench,
      fileName: req.fileName || undefined,
      preference
    })
    if (!preview.canWrite) throw new GenerationError(blockReason(preview), preview.syntaxError ? 'SYNTAX_CHECK_FAILED' : 'VALIDATION_FAILED')
    if (req.channel && req.channel !== preview.channel) {
      throw new GenerationError(`通道 ${req.channel} 在当前整合包条件下不可用：${blockReason(preview)}`, 'CHANNEL_UNAVAILABLE')
    }
    const result = await writeGenerated(req, payload, { modpack: getCurrentModpack(), alternateDir: req.alternateDir ?? null })
    rememberGeneration(req.workbench, result.writtenPaths.map((p) => p.split(/[\\/]/).pop() ?? p).join('、'))
    logger.success('IO', result.message, result.writtenPaths.join('\n'))
    return result
  })

  registerHandler('scripts:list', async () => {
    const dir = requireScriptsDir()
    if (!dir) return []
    const entries = await listScripts(dir)
    logger.debug('IO', `脚本执行顺序面板：${entries.length} 个文件`, dir)
    return entries
  })

  registerHandler('scripts:rename', async ({ name, to }) => {
    const dir = requireScriptsDir()
    if (!dir) throw new GenerationError('尚未导入整合包，无法重命名脚本', 'NO_MODPACK')
    const from = sanitizeScriptName(name)
    const target = sanitizeScriptName(to)
    if (from === target) throw new GenerationError(`新旧文件名相同：${from}`, 'SAME_NAME')
    // P2-1：fs.rename 在同目录会静默覆盖已存在目标且不留备份（同功能域里覆盖写入有
    // overwriteConfirmed + .backup 双保护，重命名不能是例外），目标已存在必须拒绝。
    let targetExists = false
    try {
      await stat(join(dir, target))
      targetExists = true
    } catch {
      /* 目标不存在 → 允许重命名 */
    }
    if (targetExists) throw new GenerationError(`目标文件已存在：${target}，请换一个文件名`, 'EEXIST')
    try {
      await rename(join(dir, from), join(dir, target))
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'ENOENT') throw new GenerationError(`文件不存在：${from}`, 'ENOENT')
      if (code === 'EACCES' || code === 'EPERM') throw new GenerationError(`无重命名权限（${code}）：${from}`, code)
      throw new GenerationError(`重命名失败：${from} → ${target}`, code ?? 'RENAME_FAILED')
    }
    logger.info('IO', `脚本已重命名：${from} → ${target}`, dir)
    return listScripts(dir)
  })
}
