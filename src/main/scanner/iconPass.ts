/**
 * 图标二次解析（跨 jar）：首轮按「同 jar 同路径」找不到贴图的物品，在这里按
 * 「模型 (item/block) → textures 引用 → 全包贴图索引」重新找一遍。
 *
 * 解决三类真实缺口（实测自 295 jar 的包）：贴图放在嵌套目录、方块物品只有 models/block、
 * 父模型/贴图引用落在别的 jar。
 *
 * 性能要点：**不做逐条随机读**。先把所有待查模型按 jar 分组批量读出（每个 jar 只开一次），
 * 再在内存里走 parent 链；最后把选中的贴图按 jar 再批量读一次。
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { readMany } from './zip'
import { writeIcon } from './iconWriter'
import { logger } from '../logger'

export interface IconMiss {
  id: string
  jarPath: string
}

export interface IconPassResult {
  resolved: Map<string, string>
  unresolved: number
  /** 缺图标的物品 ID（去重后统计；与合并后的物品数口径一致） */
  unresolvedIds: ReadonlySet<string>
  scannedJars: number
}

const MAX_MODEL_DEPTH = 4
/** 每批提交的写任务数（并发由共享队列统一限流，这里只控制批大小） */
const WRITE_BATCH = 64
const DERIVED_SUFFIX =
  /_(slab|stairs|wall|fence_gate|fence|door|trapdoor|button|pressure_plate|carpet|sign|wall_sign|hanging_sign|bars|pane|pillar|campfire|torch|block)$/

interface ModelJson {
  parent?: unknown
  textures?: Record<string, unknown>
}

function splitId(id: string): { ns: string; path: string } {
  const colon = id.indexOf(':')
  return colon < 0 ? { ns: 'minecraft', path: id } : { ns: id.slice(0, colon), path: id.slice(colon + 1) }
}

function stemOf(path: string): string[] {
  const out = [path]
  let cur = path
  for (let i = 0; i < 3; i += 1) {
    const next = cur.replace(DERIVED_SUFFIX, '')
    if (next === cur || next === '') break
    out.push(next)
    cur = next
  }
  return out
}

function modelCandidates(ns: string, path: string): string[] {
  const out: string[] = []
  for (const stem of stemOf(path)) {
    out.push(`assets/${ns}/models/item/${stem}.json`, `assets/${ns}/models/block/${stem}.json`)
  }
  return out
}

function parentEntryOf(parent: string, fallbackNs: string): string {
  if (parent.includes(':')) {
    const { ns, path } = splitId(parent)
    return `assets/${ns}/models/${path}.json`
  }
  if (parent.includes('/')) return `assets/${fallbackNs}/models/${parent}.json`
  return `assets/${fallbackNs}/models/item/${parent}.json`
}

function textureCandidates(ref: string, fallbackNs: string): string[] {
  const trimmed = ref.trim()
  if (!trimmed) return []
  const withNs = (ns: string, rel: string): string[] => [
    `assets/${ns}/textures/${rel}.png`,
    `assets/${ns}/textures/item/${rel}.png`,
    `assets/${ns}/textures/block/${rel}.png`
  ]
  if (trimmed.includes(':')) {
    const { ns, path } = splitId(trimmed)
    return withNs(ns, path)
  }
  if (trimmed.includes('/')) return withNs(fallbackNs, trimmed)
  return [`assets/${fallbackNs}/textures/item/${trimmed}.png`, `assets/${fallbackNs}/textures/block/${trimmed}.png`]
}

function parseModel(buf: Buffer | undefined): ModelJson | null {
  if (!buf) return null
  try {
    const raw = JSON.parse(buf.toString('utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ModelJson) : null
  } catch {
    return null
  }
}

function textureRefsOf(model: ModelJson): string[] {
  const out: string[] = []
  const textures = model.textures ?? {}
  for (const key of ['layer0', 'all', 'texture', 'particle']) {
    const value = textures[key]
    if (typeof value === 'string' && value.trim()) out.push(value)
  }
  for (const value of Object.values(textures)) {
    if (typeof value === 'string' && value.trim() && !out.includes(value)) out.push(value)
  }
  return out
}

/**
 * 按 jar 批量读条目。`readMany` 每次都会把整个归档顺序扫一遍，所以这里必须并发跑，
 * 否则 295 个 jar 串行读会把二次解析拖到几十秒（实测过 152s 的版本）。
 */
async function readEntriesByJar(pending: Map<string, Set<string>>): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  const jobs = [...pending.entries()].filter(([, names]) => names.size > 0)
  let cursor = 0
  const lane = async (): Promise<void> => {
    for (;;) {
      const job = jobs[cursor++]
      if (!job) return
      const [jarPath, names] = job
      try {
        const buffers = await readMany(jarPath, names)
        for (const [name, buf] of buffers) out.set(name, buf)
      } catch {
        /* 单个 jar 读失败不影响其它 jar 的解析 */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, () => lane()))
  return out
}

/**
 * @param misses 首轮没拿到图标的物品（带它出处的 jar）
 * @param iconDir userData/icon-cache
 * @param entryLists 首轮扫描留下的「jar → 资源条目名」，无需再列目录
 */
export async function resolveMissingIcons(
  misses: readonly IconMiss[],
  iconDir: string,
  entryLists: ReadonlyMap<string, readonly string[]>,
  signal?: AbortSignal
): Promise<IconPassResult> {
  const resolved = new Map<string, string>()
  if (misses.length === 0) return { resolved, unresolved: 0, unresolvedIds: new Set(), scannedJars: 0 }

  // 全包索引：贴图与模型各一张（名字 → jar）
  const textureIndex = new Map<string, string>()
  const modelIndex = new Map<string, string>()
  for (const [jarPath, names] of entryLists) {
    for (const name of names) {
      if (name.endsWith('.png') && name.includes('/textures/')) textureIndex.set(name, jarPath)
      else if (name.endsWith('.json') && name.includes('/models/')) modelIndex.set(name, jarPath)
    }
  }

  // 阶段一：把命中的模型按 jar 批量读出来（BFS 收集 parent，最多 4 轮）
  const models = new Map<string, ModelJson | null>()
  let pending = new Map<string, Set<string>>()
  const enqueue = (entry: string, into: Map<string, Set<string>>): void => {
    const jar = modelIndex.get(entry)
    if (!jar || models.has(entry)) return
    const set = into.get(jar) ?? new Set<string>()
    set.add(entry)
    into.set(jar, set)
  }
  for (const miss of misses) {
    const { ns, path } = splitId(miss.id)
    for (const cand of modelCandidates(ns, path)) enqueue(cand, pending)
  }
  for (let depth = 0; depth < MAX_MODEL_DEPTH && pending.size > 0; depth += 1) {
    const buffers = await readEntriesByJar(pending)
    const next = new Map<string, Set<string>>()
    for (const [entry, buf] of buffers) {
      const model = parseModel(buf)
      models.set(entry, model)
      if (!model || typeof model.parent !== 'string') continue
      const parent = model.parent.trim()
      // 原版父模型不在包里，链到此为止（它的贴图路径我们已在直接候选里试过）
      if (parent.startsWith('minecraft:') || /^(item|block)\//.test(parent) || parent === 'builtin/entity') continue
      const { ns } = splitId(entry.includes(':') ? entry : 'minecraft:' + entry)
      const ownerNs = /^assets\/([^/]+)\/models\//.exec(entry)?.[1] ?? ns
      enqueue(parentEntryOf(parent, ownerNs), next)
    }
    pending = next
  }

  // 阶段二：内存里走链选中贴图，按 jar 批量取字节
  const chosen = new Map<string, string>() // itemId → texture entry
  const textureWanted = new Map<string, Set<string>>()
  const unresolvedIds = new Set<string>()
  for (const miss of misses) {
    const { ns, path } = splitId(miss.id)
    let hit: string | null = null
    for (const cand of modelCandidates(ns, path)) {
      const model = models.get(cand)
      if (!model) continue
      for (const ref of textureRefsOf(model)) {
        const entry = textureCandidates(ref, ns).find((c) => textureIndex.has(c))
        if (entry) {
          hit = entry
          break
        }
      }
      if (hit) break
    }
    if (!hit) {
      for (const stem of stemOf(path)) {
        const entry = [`assets/${ns}/textures/item/${stem}.png`, `assets/${ns}/textures/block/${stem}.png`].find((c) =>
          textureIndex.has(c)
        )
        if (entry) {
          hit = entry
          break
        }
      }
    }
    if (!hit) {
      unresolvedIds.add(miss.id)
      continue
    }
    chosen.set(miss.id, hit)
    const jar = textureIndex.get(hit)
    if (!jar) {
      unresolvedIds.add(miss.id)
      continue
    }
    const set = textureWanted.get(jar) ?? new Set<string>()
    set.add(hit)
    textureWanted.set(jar, set)
  }
  const textures = await readEntriesByJar(textureWanted)

  // 阶段三：写图标（跳过已存在），并发上限 32
  const jobs: { id: string; png: Buffer }[] = []
  for (const [id, entry] of chosen) {
    const png = textures.get(entry)
    if (png) jobs.push({ id, png })
    else unresolvedIds.add(id)
  }
  // 与主扫描共用同一个受控写入队列（去重 + 全局限流）；写失败会 reject，向上冒泡
  let batch: Promise<void>[] = []
  for (const job of jobs) {
    const key = createHash('sha1').update(job.id).digest('hex')
    const target = join(iconDir, `${key}.png`)
    resolved.set(job.id, key)
    batch.push(writeIcon(target, job.png, signal).then(() => undefined))
    if (batch.length >= WRITE_BATCH) {
      const current = batch
      batch = []
      await Promise.all(current)
    }
  }
  if (batch.length > 0) await Promise.all(batch)
  if (resolved.size > 0) {
    logger.debug('INDEX', `图标二次解析：选中 ${chosen.size} 个贴图，写入/命中 ${resolved.size} 个`)
  }

  return { resolved, unresolved: unresolvedIds.size, unresolvedIds, scannedJars: entryLists.size }
}
