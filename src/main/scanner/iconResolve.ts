/**
 * 贴图定位（纯函数，便于单测）：从 jar 内的模型/贴图条目推出某物品实际该用哪张 PNG。
 * 顺序按规格 3.2：textures/item → textures/block → 模型 textures.layer0/all → parent 链（≤3 层）。
 * 只在本 jar 内解析；父模型指向 `minecraft:*` / `item/generated` 等原版资源时视为未命中
 * （原版贴图不随模组分发，回退到占位块由上层统计）。
 */
import type { ZipEntryInfo } from './zip'

const MAX_PARENT_DEPTH = 3

export interface IconLookup {
  /** 命中则返回 jar 内条目名，调用方据此取 Buffer 落盘 */
  entry: string | null
  /** 走到第几层（0 = 直接命中贴图，≥1 = 经模型/parent 解析而来），用于排障统计 */
  depth: number
}

function splitId(id: string): { ns: string; path: string } {
  const colon = id.indexOf(':')
  if (colon < 0) return { ns: 'minecraft', path: id }
  return { ns: id.slice(0, colon), path: id.slice(colon + 1) }
}

/** `ns:item/foo` / `item/foo` / `foo` 统一解析成 jar 内贴图路径 */
function textureEntryFor(ref: string, fallbackNs: string): string {
  const trimmed = ref.trim()
  if (trimmed === '') return ''
  if (trimmed.includes(':')) {
    const { ns, path } = splitId(trimmed)
    return `assets/${ns}/textures/${path}.png`
  }
  if (trimmed.includes('/')) return `assets/${fallbackNs}/textures/${trimmed}.png`
  return `assets/${fallbackNs}/textures/item/${trimmed}.png`
}

function modelEntryFor(ref: string, fallbackNs: string): string {
  const trimmed = ref.trim()
  if (trimmed.includes(':')) {
    const { ns, path } = splitId(trimmed)
    return `assets/${ns}/models/${path}.json`
  }
  if (trimmed.includes('/')) return `assets/${fallbackNs}/models/${trimmed}.json`
  return `assets/${fallbackNs}/models/item/${trimmed}.json`
}

interface ModelJson {
  parent?: unknown
  textures?: Record<string, unknown>
}

function parseModel(buf: Buffer | undefined): ModelJson | null {
  if (!buf) return null
  try {
    const raw = JSON.parse(buf.toString('utf8')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    return raw as ModelJson
  } catch {
    return null
  }
}

/** 从模型里按 layer0 → all → 其它第一个字符串 的顺序取贴图引用 */
function textureRefOf(model: ModelJson): string | null {
  const textures = model.textures
  if (!textures || typeof textures !== 'object') return null
  for (const key of ['layer0', 'all', 'texture', 'particle']) {
    const value = textures[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  for (const value of Object.values(textures)) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/**
 * @param itemId 物品 ID（`ns:path`）
 * @param entrySet jar 内全部条目名（Set，O(1) 判断）
 * @param readEntry 按条目名读 Buffer（读不到返回 undefined）
 */
export function resolveIcon(
  itemId: string,
  entrySet: ReadonlySet<string>,
  readEntry: (name: string) => Buffer | undefined
): IconLookup {
  const { ns, path } = splitId(itemId)
  const direct = [`assets/${ns}/textures/item/${path}.png`, `assets/${ns}/textures/block/${path}.png`]
  for (const entry of direct) {
    if (entrySet.has(entry)) return { entry, depth: 0 }
  }

  // 模型链：item 模型 → textures → 找不到再沿 parent 上溯（同一 jar 内）
  let modelEntry = `assets/${ns}/models/item/${path}.json`
  let depth = 1
  const seen = new Set<string>()
  while (depth <= MAX_PARENT_DEPTH && !seen.has(modelEntry)) {
    seen.add(modelEntry)
    const model = parseModel(readEntry(modelEntry))
    if (!model) break
    const ref = textureRefOf(model)
    if (ref) {
      const textureEntry = textureEntryFor(ref, ns)
      if (entrySet.has(textureEntry)) return { entry: textureEntry, depth }
    }
    if (typeof model.parent !== 'string') break
    const parent = model.parent.trim()
    // 原版父模型（item/generated、block/block、minecraft:*）不在 jar 内，链到此为止
    if (parent.startsWith('minecraft:') || /^(item|block)\//.test(parent)) break
    modelEntry = modelEntryFor(parent, ns)
    depth += 1
  }
  return { entry: null, depth: 0 }
}

/** 供扫描器过滤条目时复用：条目名 → (ns, path, kind) */
export function parseAssetEntry(entry: string): { ns: string; path: string; kind: 'lang' | 'model' | 'itemTexture' | 'blockTexture' } | null {
  const m = /^assets\/([^/]+)\//.exec(entry)
  if (!m) return null
  const ns = m[1] as string
  if (entry.startsWith(`assets/${ns}/lang/`) && entry.endsWith('.json')) {
    return { ns, path: entry.slice(`assets/${ns}/lang/`.length, -'.json'.length), kind: 'lang' }
  }
  if (entry.startsWith(`assets/${ns}/models/item/`) && entry.endsWith('.json')) {
    return { ns, path: entry.slice(`assets/${ns}/models/item/`.length, -'.json'.length), kind: 'model' }
  }
  if (entry.startsWith(`assets/${ns}/textures/item/`) && entry.endsWith('.png')) {
    return { ns, path: entry.slice(`assets/${ns}/textures/item/`.length, -'.png'.length), kind: 'itemTexture' }
  }
  if (entry.startsWith(`assets/${ns}/textures/block/`) && entry.endsWith('.png')) {
    return { ns, path: entry.slice(`assets/${ns}/textures/block/`.length, -'.png'.length), kind: 'blockTexture' }
  }
  return null
}

export function entrySetOf(entries: readonly ZipEntryInfo[]): Set<string> {
  return new Set(entries.map((e) => e.fileName))
}
