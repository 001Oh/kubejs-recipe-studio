/**
 * 源 B：注册表导出导入（ProbeJS / CraftTweaker dump / EMI・KubeJS 导出）。
 *
 * 三种输入都是「一堆 id 文本」，没有统一 schema，所以用宽松规则提取：
 * - `*.d.ts`：扫描形如 `"ns:id"` 的字符串字面量，按附近上下文判断物品还是流体；
 * - `*.txt`：CT `/ct dump items` 一行一个 id；
 * - `*.json`：递归遍历所有字符串字段，键名含 fluid/gas/slurry 的算流体，其余算物品。
 *
 * 与源 A 合并时：同 id 提升为 `verified: true`；源 B 独有的 id 也收录（可能是动态注册物品），
 * 名称用路径可读形式兜底，图标标记为缺失（绝不伪造图标）。
 */
import { promises as fsp } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { ItemEntry } from '../../shared/types'
import type { ProbeImportResult } from '../../shared/ipc'
import { isVirtualByNamingRules } from '../../shared/search'
import { pinyinIndex } from '../../shared/pinyin'
import { readableFromPath } from '../../shared/text'
import { logger } from '../logger'

const ID_SHAPE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const MAX_FILES = 5000
const FLUID_HINT = /fluid|gas|slurry/i

export interface RegistryScan {
  files: string[]
  itemIds: Set<string>
  fluidIds: Set<string>
}

/** B121/D-4：与 ID_SHAPE 同形的带捕获组版本；exec 迭代单遍扫描，不再逐匹配 indexOf 全文回扫 */
const QUOTED_ID = /"([a-z0-9_.-]+:[a-z0-9_./-]+)"/g

function collectIdsFromText(text: string, into: { item: Set<string>; fluid: Set<string> }): void {
  // d.ts / json 里的字符串字面量——单遍 exec，O(L)；旧实现对每个匹配做一次全文 indexOf（O(M×L)）
  QUOTED_ID.lastIndex = 0
  for (let m = QUOTED_ID.exec(text); m; m = QUOTED_ID.exec(text)) {
    const at = m.index
    const context = text.slice(Math.max(0, at - 240), at)
    if (FLUID_HINT.test(context)) into.fluid.add(m[1] as string)
    else into.item.add(m[1] as string)
  }
}

function collectIdsFromJson(value: unknown, keyHint: string, into: { item: Set<string>; fluid: Set<string> }): void {
  if (typeof value === 'string') {
    if (ID_SHAPE.test(value.trim())) {
      if (FLUID_HINT.test(keyHint)) into.fluid.add(value.trim())
      else into.item.add(value.trim())
    }
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectIdsFromJson(entry, keyHint, into)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      // 把父级键名一起带下去：`fluids.molten` 这种双层结构也要能判成流体
      collectIdsFromJson(child, `${keyHint}.${key}`, into)
    }
  }
}

async function walk(dir: string, files: string[], depth = 0): Promise<void> {
  if (files.length >= MAX_FILES || depth > 8) return
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (files.length >= MAX_FILES) return
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) await walk(abs, files, depth + 1)
    else if (/\.(d\.ts|ts|txt|json)$/i.test(entry.name)) files.push(abs)
  }
}

/** 递归收集 id（纯读取，不改索引） */
export async function collectRegistryIds(paths: readonly string[]): Promise<RegistryScan> {
  const files: string[] = []
  for (const path of paths) {
    try {
      const st = await fsp.stat(path)
      if (st.isDirectory()) await walk(path, files)
      else files.push(path)
    } catch (err) {
      logger.warn('INDEX', `注册表导出路径不可读：${path}`, err instanceof Error ? err.message : String(err))
    }
  }
  const item = new Set<string>()
  const fluid = new Set<string>()
  const read: string[] = []
  for (const file of files) {
    try {
      const text = await fsp.readFile(file, 'utf8')
      const ext = extname(file).toLowerCase()
      if (ext === '.json') {
        let parsed: unknown = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }
        if (parsed === null) collectIdsFromText(text, { item, fluid })
        else collectIdsFromJson(parsed, basename(file), { item, fluid })
      } else if (ext === '.txt') {
        for (const line of text.split(/\r?\n/)) {
          const id = line.trim()
          if (!ID_SHAPE.test(id)) continue
          if (FLUID_HINT.test(id)) fluid.add(id)
          else item.add(id)
        }
      } else {
        collectIdsFromText(text, { item, fluid })
      }
      read.push(file)
    } catch (err) {
      logger.warn('INDEX', `注册表文件解析失败，已跳过：${file}`, err instanceof Error ? err.message : String(err))
    }
  }
  // 同一个 id 既被当物品又被当流体时，只有在物品集合里没有时才归流体
  for (const id of item) fluid.delete(id)
  return { files: read, itemIds: item, fluidIds: fluid }
}

/** 合并到现有物品索引：同 id 置 verified，新 id 收录（名称用路径兜底，无图标） */
export function mergeRegistry(
  items: readonly ItemEntry[],
  scan: RegistryScan
): { items: ItemEntry[]; addedIds: number; verifiedIds: number } {
  const byId = new Map(items.map((item) => [item.id, item]))
  let addedIds = 0
  let verifiedIds = 0
  for (const id of scan.itemIds) {
    const existing = byId.get(id)
    if (existing) {
      if (!existing.verified) {
        byId.set(id, { ...existing, verified: true })
        verifiedIds += 1
      }
      continue
    }
    const path = id.slice(id.indexOf(':') + 1)
    const name = readableFromPath(path)
    const py = pinyinIndex(name)
    byId.set(id, {
      id,
      nameZh: name,
      nameEn: name,
      modId: id.slice(0, id.indexOf(':')),
      confidence: 'lang',
      verified: true,
      hasIcon: false,
      iconKey: null,
      pyFull: py.pyFull,
      pyInitials: py.pyInitials,
      virtual: isVirtualByNamingRules({ id, nameZh: name, nameEn: name }),
      hasRecipe: false
    })
    addedIds += 1
  }
  return { items: [...byId.values()], addedIds, verifiedIds }
}

export async function runProbeImport(paths: readonly string[], current: readonly ItemEntry[]): Promise<{
  items: ItemEntry[]
  result: ProbeImportResult
}> {
  const scan = await collectRegistryIds(paths)
  const merged = mergeRegistry(current, scan)
  const result: ProbeImportResult = {
    files: scan.files.map((f) => basename(f)),
    addedIds: merged.addedIds,
    verifiedIds: merged.verifiedIds,
    fluidIds: scan.fluidIds.size,
    note:
      `解析 ${scan.files.length} 个文件：新增 ${merged.addedIds} 个物品、确认 ${merged.verifiedIds} 个已注册` +
      (scan.fluidIds.size > 0 ? `、识别 ${scan.fluidIds.size} 个流体（流体不进物品列表）` : '')
  }
  logger.info('INDEX', `注册表导入完成：${result.note}`, scan.files.slice(0, 10).join('\n'))
  return { items: merged.items, result }
}
