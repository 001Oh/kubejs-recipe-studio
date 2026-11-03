/**
 * 惰性读取完整配方 JSON（规格 3.2 源 C：点卡片载入工作台时才二次打开 jar，
 * 读一条关一次，不复用句柄）。源失效统一转成中文错误供 UI toast。
 */
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { RecipeRecord } from '../../shared/types'
import { readEntryText } from '../scanner/zip'
import { getCurrentModpack } from '../modpack/state'

const STALE_MESSAGE = '源文件已失效，无法载入完整配方'

function splitUid(uid: string): { scheme: string; rest: string } {
  const m = /^([a-z]+):(.*)$/i.exec(uid)
  if (!m) return { scheme: '', rest: uid }
  return { scheme: m[1], rest: m[2] }
}

function isStaleError(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  return e?.code === 'ENOENT' || /enoent|no such file|cannot open|打开|无法/i.test(e?.message ?? '')
}

/** kubejs 脚本配方：无逐条 JSON，只能由摘要重建「可静态解析的部分」 */
function reconstructFromRecord(record: RecipeRecord): Record<string, unknown> {
  return {
    type: record.type,
    __reconstructed: true,
    __note: '来自 KubeJS 脚本，仅保留可静态解析的部分；原始动态逻辑未载入',
    outputs: record.outputs,
    inputs: record.inputs,
    partial: record.partial
  }
}

async function readLocalFile(path: string, record: RecipeRecord): Promise<{ json: unknown; sourcePath: string }> {
  let text: string
  try {
    text = await fsp.readFile(path, 'utf8')
  } catch (err) {
    if (isStaleError(err)) throw new Error(`${STALE_MESSAGE}：${path}`)
    throw err
  }
  if (path.toLowerCase().endsWith('.json')) {
    try {
      return { json: JSON.parse(text.replace(/^\uFEFF/, '')) as unknown, sourcePath: path }
    } catch {
      throw new Error(`配方 JSON 已损坏，无法载入完整配方：${path}`)
    }
  }
  return { json: reconstructFromRecord(record), sourcePath: path }
}

export async function readFullRecipe(record: RecipeRecord): Promise<{ json: unknown; sourcePath: string }> {
  const { scheme, rest } = splitUid(record.uid)
  const hashIdx = Math.max(rest.lastIndexOf('#'), 0)
  const container = scheme === 'jar' || scheme === 'datapack' ? rest.slice(0, hashIdx || rest.length) : ''
  const entry = hashIdx > 0 ? rest.slice(hashIdx + 1) : ''

  if (record.source === 'jar' || (container && record.source === 'datapack')) {
    // jarPath 优先（含目录）；缺省时按 jar 文件名回退到当前整合包 mods/
    let containerPath = record.jarPath
    if (!containerPath && scheme === 'jar') {
      const modpack = getCurrentModpack()
      if (modpack) containerPath = join(modpack.modsDir, container)
    }
    const entryPath = record.entryPath ?? entry
    if (!containerPath || !entryPath) throw new Error(`${STALE_MESSAGE}：${record.uid}`)
    let text: string | null = null
    try {
      text = await readEntryText(containerPath, entryPath)
    } catch (err) {
      throw new Error(isStaleError(err) ? `${STALE_MESSAGE}：${containerPath}` : `${STALE_MESSAGE}：${record.uid}`)
    }
    if (text === null) throw new Error(`${STALE_MESSAGE}：${containerPath}#${entryPath}`)
    try {
      return { json: JSON.parse(text.replace(/^\uFEFF/, '')) as unknown, sourcePath: record.sourcePath }
    } catch {
      throw new Error(`配方 JSON 已损坏，无法载入完整配方：${record.uid}`)
    }
  }

  if (record.source === 'kubejs') {
    return readLocalFile(record.sourcePath, record)
  }
  // datapack 内散目录 / kubejs data 的 file: 记录
  const path = scheme === 'file' ? splitUid(record.uid).rest.split('#')[0] : record.sourcePath
  return readLocalFile(path, record)
}
