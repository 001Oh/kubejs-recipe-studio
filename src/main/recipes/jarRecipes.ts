/**
 * 单个 jar 的配方提取（worker 与主线程共用）。
 * 只做 IO + 解析，不 import logger / paths / electron，产物是可结构化克隆的 CollectedRecipe[]。
 * 抛错语义：zip 列表或条目读取失败 → 抛 Error（由并发池按 jar 隔离为「该 jar 失败」）。
 */
import { basename } from 'node:path'
import { listAndRead } from '../scanner/zip'
import { RANK_JAR, RECIPE_ENTRY_RE, buildRecord, recipeIdFromEntry, type CollectedRecipe } from './record'

export async function scanJarRecipes(jarPath: string): Promise<CollectedRecipe[]> {
  const jarName = basename(jarPath)
  // P-OPT4-S2：合并「列目录 + 读取」，单 jar 只遍历一次中央目录
  const wanted: string[] = []
  const { buffers } = await listAndRead(jarPath, {
    matcher: (name) => {
      if (!RECIPE_ENTRY_RE.test(name)) return false
      wanted.push(name)
      return true
    }
  })
  if (wanted.length === 0) return []
  const out: CollectedRecipe[] = []
  for (const entry of wanted) {
    const recipeId = recipeIdFromEntry(entry)
    if (!recipeId) continue
    const buf = buffers.get(entry)
    out.push({
      record: buildRecord({
        uid: `jar:${jarName}#${entry}`,
        recipeId,
        type: '',
        source: 'jar',
        sourcePath: `${jarName}#${entry}`,
        jarPath,
        entryPath: entry,
        text: buf ? buf.toString('utf8') : null
      }),
      loadRank: RANK_JAR,
      orderKey: `0/${jarName}/${entry}`
    })
  }
  return out
}
