/**
 * 单个 jar → 物品草稿（纯函数，不做 IO、不写盘，便于单测）。
 *
 * ID 提取按规格 3.2 分四层并做并集：lang 的 `item.` > lang 的 `block.` > `models/item` > `textures/item`。
 * 虚拟物品判定走 `isVirtualByNamingRules()`（**只按内置路径/命名规则**）。
 * 之所以不用查询期的 `isVirtualItem()`：那个版本还叠加了插件通配，若在扫描期使用，
 * 写进 `items.json` 的 `virtual` 会随「当前装了哪些插件」漂移，同一份缓存时真时假。
 * 插件通配只在查询期（语料构建时）生效，扫描器不再自造规则。
 */
import type { Confidence } from '../../shared/types'
import { isVirtualByNamingRules } from '../../shared/search'
import { hasCjk } from '../../shared/itemName'
import { readableFromPath } from '../../shared/text'
import type { ZipEntryInfo } from './zip'
import { parseAssetEntry, resolveIcon } from './iconResolve'

const LANG_PRIORITY = ['zh_cn', 'en_us']
/** 只有这三种语系的名字才可能是"中文名"，且还要再过一遍 CJK 检测 */
const ZH_LOCALES = ['zh_cn', 'zh_tw', 'zh_hk']
const RANK: Record<Confidence, number> = { lang: 4, block: 3, model: 2, texture: 1 }

/** 明显的非物品资源（子路径逐段匹配；`_spawn_egg` 必须保留） */
const EXCLUDED_SEGMENT = /(^|[_/])(debug|overlay|layer|template|gui|slot|background|particle)([_/]|$)/i

export interface JarItemDraft {
  id: string
  nameZh: string
  nameEn: string
  modId: string
  confidence: Confidence
  virtual: boolean
  /** jar 内实际贴图条目；null = 没找到，落盘后由占位块兜底并计入比例 */
  iconEntry: string | null
}

export interface JarItemScanResult {
  items: JarItemDraft[]
  entryCount: number
  missingZh: number
  withIcon: number
}

interface Draft {
  id: string
  nameZh: string
  nameEn: string
  confidence: Confidence
  iconEntry: string | null
}

function isExcludedPath(path: string): boolean {
  return EXCLUDED_SEGMENT.test(path)
}

function idOf(ns: string, path: string): string {
  return `${ns}:${path}`
}

function readJson(buf: Buffer | undefined): Record<string, unknown> | null {
  if (!buf) return null
  try {
    const raw = JSON.parse(buf.toString('utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

interface LangTables {
  byLocale: Map<string, Map<string, string>>
  /** 命中 `item.` 前缀的 id（最高置信） */
  itemKeys: Set<string>
  /** 只命中 `block.` 前缀的 id（方块物品，次高置信） */
  blockKeys: Set<string>
}

/** 收集 lang 文本：locale → (id → 显示名)，并记录 id 来自 item. 还是 block. */
function collectLang(
  entries: readonly ZipEntryInfo[],
  readEntry: (name: string) => Buffer | undefined
): LangTables {
  const byLocale = new Map<string, Map<string, string>>()
  const itemKeys = new Set<string>()
  const blockKeys = new Set<string>()
  for (const entry of entries) {
    const parsed = parseAssetEntry(entry.fileName)
    if (!parsed || parsed.kind !== 'lang') continue
    const locale = parsed.path.toLowerCase()
    const json = readJson(readEntry(entry.fileName))
    if (!json) continue
    const names = byLocale.get(locale) ?? new Map<string, string>()
    for (const [key, value] of Object.entries(json)) {
      if (typeof value !== 'string' || value.trim() === '') continue
      const dot = key.indexOf('.')
      if (dot < 0) continue
      const prefix = key.slice(0, dot)
      if (prefix !== 'item' && prefix !== 'block') continue
      const rest = key.slice(dot + 1)
      const sep = rest.indexOf('.')
      if (sep <= 0) continue
      const ns = rest.slice(0, sep)
      const path = rest.slice(sep + 1)
      // itemGroup.* / item.mod.* / item.kubejs.* 之类元数据键不是物品
      if (ns === 'mod' || ns === 'kubejs' || ns === 'itemGroup') continue
      // `item.mymod.fuel_loader.tooltip` / `.desc` / `.shift` 这类是描述子键，不是独立物品。
      // 物品 ID 里几乎不会出现第二个点，用「path 含点即子键」这一条比维护后缀白名单更稳。
      if (path.includes('.')) continue
      if (isExcludedPath(path)) continue
      const id = idOf(ns, path)
      names.set(id, value.trim())
      if (prefix === 'item') itemKeys.add(id)
      else blockKeys.add(id)
    }
    byLocale.set(locale, names)
  }
  return { byLocale, itemKeys, blockKeys }
}

/**
 * 取物品的中文名 / 英文名（第 116 批 A-3 收紧口径）。
 *
 * - `zh`：**只**来自 zh_cn / zh_tw / zh_hk，且必须真的含 CJK。没汉化就是空串——
 *   不能再用俄/日/法名冒充中文名（那会让 33.6% 的物品显示成外文且拼音搜索全失效）。
 * - `en`：en_us → 其它 en*；都没有时才拿"某个非中文语系的名字"兜底（俄/日/法名比路径好看），
 *   最后才退化为路径可读形式。
 * - 显示层用 `displayName()`（nameZh || nameEn || id），未汉化时打小标记。
 */
export function nameFrom(
  id: string,
  byLocale: Map<string, Map<string, string>>
): { zh: string; en: string; hasZh: boolean } {
  let zh = ''
  for (const locale of ZH_LOCALES) {
    const hit = byLocale.get(locale)?.get(id)
    if (hit && hasCjk(hit)) {
      zh = hit
      break
    }
  }

  let en = ''
  for (const locale of LANG_PRIORITY) {
    if (!locale.startsWith('en')) continue
    const hit = byLocale.get(locale)?.get(id)
    if (hit) {
      en = hit
      break
    }
  }
  if (!en) {
    // 非中英语言的本地化名：只是"比路径好看"的兜底，不算汉化
    for (const [locale, names] of byLocale) {
      if (locale.startsWith('zh') || locale.startsWith('en')) continue
      const hit = names.get(id)
      if (hit) {
        en = hit
        break
      }
    }
  }

  const path = id.slice(id.indexOf(':') + 1)
  const readable = readableFromPath(path)
  return { zh, en: en || readable, hasZh: zh !== '' }
}

/**
 * 扫描一个 jar 的条目列表。`readEntry` 由调用方按需读取（worker 里是预取好的 Map）。
 */
export function scanJarEntries(
  entries: readonly ZipEntryInfo[],
  readEntry: (name: string) => Buffer | undefined
): JarItemScanResult {
  const { byLocale, itemKeys, blockKeys } = collectLang(entries, readEntry)
  const drafts = new Map<string, Draft>()

  const upsert = (id: string, confidence: Confidence, iconEntry: string | null): void => {
    const prev = drafts.get(id)
    if (!prev) {
      drafts.set(id, { id, nameZh: '', nameEn: '', confidence, iconEntry })
      return
    }
    if (RANK[confidence] > RANK[prev.confidence]) prev.confidence = confidence
    if (!prev.iconEntry && iconEntry) prev.iconEntry = iconEntry
  }

  // 第一层 / 第二层：lang 的 item.（最高）与 block.（次高，多数方块有对应方块物品）
  for (const id of itemKeys) upsert(id, 'lang', null)
  for (const id of blockKeys) upsert(id, 'block', null)

  const entrySet = new Set(entries.map((e) => e.fileName))
  for (const entry of entries) {
    const parsed = parseAssetEntry(entry.fileName)
    if (!parsed) continue
    if (parsed.kind !== 'model' && parsed.kind !== 'itemTexture') continue
    if (isExcludedPath(parsed.path)) continue
    upsert(idOf(parsed.ns, parsed.path), parsed.kind === 'model' ? 'model' : 'texture', null)
  }

  let missingZh = 0
  let withIcon = 0
  const items: JarItemDraft[] = []
  for (const draft of drafts.values()) {
    const { zh, en, hasZh } = nameFrom(draft.id, byLocale)
    const icon = draft.iconEntry ?? resolveIcon(draft.id, entrySet, readEntry).entry
    // missingZh 统计的是「没有中文名、回退成英文/路径」的物品（warn 用），不是名字为空的物品
    if (!hasZh) missingZh += 1
    if (icon) withIcon += 1
    items.push({
      id: draft.id,
      nameZh: zh,
      nameEn: en,
      modId: draft.id.slice(0, draft.id.indexOf(':')),
      confidence: draft.confidence,
      // 扫描期只按内置路径/命名规则判定；插件通配留给查询期（见 search.isVirtualItem），
      // 否则写进 items.json 的 virtual 会随「装了哪些插件」漂移
      virtual: isVirtualByNamingRules({ id: draft.id, nameZh: zh, nameEn: en }),
      iconEntry: icon
    })
  }
  return { items, entryCount: entries.length, missingZh, withIcon }
}
