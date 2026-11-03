/**
 * 源 C ①②：扫描数据驱动配方（jar 内 data/** / 数据包 / openloader / kubejs-data）。
 * 只产出摘要 RecipeRecord；完整 JSON 绝不常驻内存，惰性读取交给 lazy.ts（禁止事项 10）。
 *
 * jar 分支走 `jarPoolCore` 并发（worker 优先，无产物时同线程并发），单个 jar 失败只影响它自己；
 * 数据包 / 散文件数量少且要遍历本地目录，保持主线程串行。
 */
import { existsSync, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { ModpackInfo } from '../../shared/types'
import { listAndRead } from '../scanner/zip'
import { logger } from '../logger'
import { defaultPoolConcurrency, runJarPoolCore } from '../scanner/jarPoolCore'
import { scanJarRecipes } from './jarRecipes'
import {
  buildRecord,
  JSON_EXT_RE,
  RANK_DATAPACK,
  RANK_JAR,
  RANK_KUBEJS_DATA,
  RANK_KUBEJS_SCRIPT,
  RECIPE_ENTRY_RE,
  recipeIdFromEntry,
  type CollectedRecipe,
  type IndexedRecipeRecord
} from './record'

export {
  RANK_DATAPACK,
  RANK_JAR,
  RANK_KUBEJS_DATA,
  RANK_KUBEJS_SCRIPT,
  type CollectedRecipe,
  type IndexedRecipeRecord
}

export interface ScanHooks {
  onProgress?: (label: string, current: number, total: number) => void
  isAborted?: () => boolean
  /** 协作式取消信号（优先于 isAborted 轮询） */
  signal?: AbortSignal
  /** 单个 mod jar 失败时上报，供编排层汇总「N 个 mod 解析失败」 */
  onFailed?: (name: string, error: string) => void
}

function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

/** 把 isAborted（旧接口）适配成 AbortSignal；两者都给时以 signal 为准 */
function signalFromHooks(hooks: ScanHooks): { signal: AbortSignal; dispose: () => void } {
  if (hooks.signal) return { signal: hooks.signal, dispose: () => undefined }
  const ctrl = new AbortController()
  if (!hooks.isAborted) return { signal: ctrl.signal, dispose: () => undefined }
  const timer = setInterval(() => {
    if (hooks.isAborted?.()) ctrl.abort()
  }, 100)
  return { signal: ctrl.signal, dispose: () => clearInterval(timer) }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await fsp.readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** 递归找 recipe JSON 文件；rel 用 `/` 分隔，与 jar 条目路径同构 */
async function walkDir(dir: string, relBase: string, out: { abs: string; rel: string }[]): Promise<void> {
  let names: string[]
  try {
    names = await fsp.readdir(dir)
  } catch {
    return
  }
  for (const name of names.sort()) {
    const abs = join(dir, name)
    const rel = relBase ? `${relBase}/${name}` : name
    let st
    try {
      st = await fsp.stat(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) await walkDir(abs, rel, out)
    else if (JSON_EXT_RE.test(name)) out.push({ abs, rel })
  }
}

/** jar 分支：并发池，每个 jar 只派发一次；失败按 jar 隔离 */
async function scanJars(modpack: ModpackInfo, hooks: ScanHooks, out: CollectedRecipe[]): Promise<void> {
  let jars: string[]
  try {
    jars = (await fsp.readdir(modpack.modsDir))
      .filter((n) => n.toLowerCase().endsWith('.jar'))
      .sort()
      .map((name) => join(modpack.modsDir, name))
  } catch (err) {
    logger.warn('INDEX', `mods 目录不可读，跳过 jar 配方源：${modpack.modsDir}`, err instanceof Error ? err.message : String(err))
    return
  }
  if (jars.length === 0) return
  const { signal, dispose } = signalFromHooks(hooks)
  // 构建产物与主进程同目录（electron.vite 的额外入口产出 out/main/recipe.worker.js）
  const workerScript = join(__dirname, 'recipe.worker.js')
  let done = 0
  try {
    await runJarPoolCore<CollectedRecipe[]>({
      jars,
      signal,
      workerScript,
      workerAvailable: existsSync(workerScript),
      concurrency: defaultPoolConcurrency(),
      inline: (jarPath) => scanJarRecipes(jarPath),
      onResult: (jarPath, recipes) => {
        for (const rec of recipes) out.push(rec)
        done += 1
        hooks.onProgress?.(`解析 jar 配方 ${done}/${jars.length}：${jarPath.split(/[\\/]/).pop()}`, done, jars.length)
      },
      onFailed: (jarPath, error) => {
        const name = jarPath.split(/[\\/]/).pop() ?? jarPath
        logger.error('INDEX', `${name} 解析失败：${error}（已跳过）`)
        hooks.onFailed?.(name, error)
        done += 1
        hooks.onProgress?.(`解析 jar 配方 ${done}/${jars.length}：${name}（失败跳过）`, done, jars.length)
      }
    })
  } finally {
    dispose()
  }
}

async function scanZipPacks(modpack: ModpackInfo, hooks: ScanHooks, out: CollectedRecipe[]): Promise<void> {
  const dpDir = join(modpack.path, 'datapacks')
  let zips: string[] = []
  try {
    zips = (await fsp.readdir(dpDir)).filter((n) => n.toLowerCase().endsWith('.zip')).sort()
  } catch {
    return
  }
  for (let i = 0; i < zips.length; i++) {
    if (hooks.signal?.aborted || hooks.isAborted?.()) throw new Error('已取消：配方扫描')
    const abs = join(dpDir, zips[i])
    hooks.onProgress?.(`解析数据包 ${i + 1}/${zips.length}：${zips[i]}`, i + 1, zips.length)
    // P-OPT4-S2：合并「列目录 + 读取」，同一 .zip 只遍历一次中央目录。
    // 不传 signal：保持原有「只在数据包之间检查取消」的语义，避免把取消误报成读取失败。
    const wanted: string[] = []
    let buffers: Map<string, Buffer>
    try {
      const result = await listAndRead(abs, {
        matcher: (name) => {
          if (!RECIPE_ENTRY_RE.test(name)) return false
          wanted.push(name)
          return true
        }
      })
      buffers = result.buffers
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 打开/枚举失败与「条目读取失败」原先是两种日志与上报路径，这里按错误来源保持区分
      if (/^(打开|遍历) jar 失败/.test(message)) {
        logger.error('INDEX', `${zips[i]} 解析失败：${message}（已跳过）`)
        continue
      }
      logger.error('INDEX', `${zips[i]} 的配方条目读取失败：${message}（已跳过）`)
      hooks.onFailed?.(zips[i], message)
      continue
    }
    if (wanted.length === 0) continue
    for (const entry of wanted) {
      const recipeId = recipeIdFromEntry(entry)
      if (!recipeId) continue
      const buf = buffers.get(entry)
      out.push({
        record: buildRecord({
          uid: `datapack:${slash(abs)}#${entry}`,
          recipeId,
          type: '',
          source: 'datapack',
          sourcePath: `${slash(abs)}#${entry}`,
          jarPath: abs,
          entryPath: entry,
          text: buf ? buf.toString('utf8') : null
        }),
        loadRank: RANK_DATAPACK,
        orderKey: `0datapacks/${slash(abs)}/${entry}`
      })
    }
  }
}

async function scanLooseDirs(modpack: ModpackInfo, hooks: ScanHooks, out: CollectedRecipe[]): Promise<void> {
  // kubejs/data 本身就是数据包根，walkDir 出来的 rel 少一层前导 data/，必须补上才匹配 ENTRY_RE；
  // openloader 的每个子目录是一个完整数据包，里面自带 data/，前缀留空。
  const roots: { dir: string; rank: number; orderPrefix: string; relPrefix: string }[] = [
    { dir: join(modpack.path, 'kubejs', 'data'), rank: RANK_KUBEJS_DATA, orderPrefix: '2', relPrefix: 'data' }
  ]
  const olBase = join(modpack.path, 'config', 'openloader', 'data')
  try {
    for (const sub of (await fsp.readdir(olBase)).sort()) {
      roots.push({ dir: join(olBase, sub), rank: RANK_DATAPACK, orderPrefix: `1${sub}`, relPrefix: '' })
    }
  } catch {
    /* 无 openloader */
  }
  let done = 0
  for (const root of roots) {
    const files: { abs: string; rel: string }[] = []
    await walkDir(root.dir, root.relPrefix, files)
    for (const f of files) {
      if (hooks.signal?.aborted || hooks.isAborted?.()) throw new Error('已取消：配方扫描')
      const recipeId = recipeIdFromEntry(f.rel)
      if (!recipeId) continue
      const text = await readIfExists(f.abs)
      out.push({
        record: buildRecord({
          uid: `file:${slash(f.abs)}`,
          recipeId,
          type: '',
          source: 'datapack',
          sourcePath: slash(f.abs),
          jarPath: f.abs,
          entryPath: f.rel,
          text
        }),
        loadRank: root.rank,
        orderKey: `${root.orderPrefix}/${slash(f.abs)}`
      })
      done += 1
    }
    hooks.onProgress?.(`解析散文件配方（kubejs/data、openloader）：已处理 ${done}`, done, Math.max(done, 1))
  }
}

export async function scanJsonRecipes(modpack: ModpackInfo, hooks: ScanHooks): Promise<CollectedRecipe[]> {
  const out: CollectedRecipe[] = []
  await scanJars(modpack, hooks, out)
  await scanZipPacks(modpack, hooks, out)
  await scanLooseDirs(modpack, hooks, out)
  return out
}

/**
 * 同 recipeId 合并成完整定义链：definedBy 按加载顺序（jar → 数据包 → kubejs/data → 脚本）
 * 排列，当前生效项放末位（规格 3.6.5 ②），并冗余写 effectiveSource 字段。
 */
export function mergeChains(entries: CollectedRecipe[]): IndexedRecipeRecord[] {
  const groups = new Map<string, CollectedRecipe[]>()
  for (const e of entries) {
    const g = groups.get(e.record.recipeId)
    if (g) g.push(e)
    else groups.set(e.record.recipeId, [e])
  }
  const merged: IndexedRecipeRecord[] = []
  for (const [, group] of groups) {
    group.sort((a, b) => a.loadRank - b.loadRank || a.orderKey.localeCompare(b.orderKey))
    const effective = group[group.length - 1]
    const rec: IndexedRecipeRecord = { ...effective.record, effectiveSource: effective.record.sourcePath }
    if (group.length > 1) {
      rec.definedBy = group.map((g) => g.record.sourcePath)
    }
    merged.push(rec)
  }
  merged.sort((a, b) => a.uid.localeCompare(b.uid))
  return merged
}
