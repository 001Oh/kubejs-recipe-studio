/**
 * 搜索语料与查询（规格 3.3 查询形式 / 排序权重表 / 命中高亮，§五 搜索性能）。
 * 纯计算模块：无 IO、无 Electron 依赖，可被主进程在扫描期构建一次并复用。
 * 语料字段在构建期已折叠为小写半角，查询期不做全表 toLowerCase()。
 */
import type { ItemEntry, ItemHit, HighlightRange } from './types'
import type { ItemsQuery, ItemsQueryResult } from './ipc'
import { foldSearchText, normalizeForSearch } from './text'
import { pinyinIndex } from './pinyin'
import { hasCjk } from './itemName'

/**
 * 查询规格 = IPC 的 ItemsQuery + 收藏集合（收藏由主进程持久化，不进 IPC 请求体）。
 * 虚拟物品是否出现只由 `includeVirtual` 决定，见 `SearchCorpus.search`。
 */
export interface SearchQuerySpec extends ItemsQuery {
  favorites: Set<string>
}

/**
 * 规格 3.3 的 14 档权重 + 空查询用的 0 档。
 * ID 的 path 段（`diamond`）复用 ID 的三档：规格查询表要求 path 命中，权重表未单列。
 * 拼音全拼没有独立「完全相等」档：相等必然满足前缀，落 350。
 */
export const SCORE_TIERS: readonly number[] = [1000, 900, 850, 800, 700, 650, 500, 400, 350, 300, 250, 200, 150, 100, 0]

const T = {
  zhEq: 1000, enEq: 900, idEq: 850,
  zhPre: 800, enPre: 700, idPre: 650,
  zhInc: 500, enInc: 400,
  pyFullPre: 350, pyIniEq: 300, pyFullInc: 250, pyIniPre: 200,
  idInc: 150, pyIniInc: 100
}

/** 虚拟物品 path 特征（规格 3.6.13）：只用于 JEI 图标显示的假物品 */
const VIRTUAL_PATH = /(dummy|display|(^|\/)jei_)/

function isVirtual(id: string, nameZh: string, nameEn: string): boolean {
  const path = id.slice(id.indexOf(':') + 1)
  return VIRTUAL_PATH.test(path) || (!nameZh.trim() && !nameEn.trim())
}

function combos(values: readonly string[]): string[] {
  const out: string[] = []
  for (const v of values) {
    const s = foldSearchText(v).replace(/\s+/g, '')
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

function firstContaining(list: readonly string[], term: string): string | null {
  for (const s of list) if (s.includes(term)) return s
  return null
}

function addOccurrences(out: HighlightRange[], seen: Set<string>, text: string, term: string, field: HighlightRange['field']): void {
  if (!term) return
  let i = text.indexOf(term)
  while (i >= 0) {
    const key = `${field}:${i}:${i + term.length}`
    if (!seen.has(key)) out.push({ start: i, end: i + term.length, field })
    seen.add(key)
    i = text.indexOf(term, i + term.length)
  }
}

/** 预计算的检索语料：并行的折叠字段数组 + 1/2-gram 倒排 + 按 ID 字典序的记录序 */
export class SearchCorpus {
  private constructor(
    readonly items: readonly ItemEntry[],
    private readonly zh: string[],
    private readonly en: string[],
    private readonly id: string[],
    private readonly path: string[],
    private readonly pyFull: string[][],
    private readonly pyInitials: string[][],
    private readonly pyBlob: string[],
    private readonly modIds: string[],
    private readonly reg: Uint8Array,
    private readonly hasRec: Uint8Array,
    private readonly grams: Map<string, number[]>,
    private readonly idOrder: number[],
    /** 1 = 虚拟物品；语料包含全部物品，显示与否在查询期决定（规格 3.6.13） */
    private readonly virtualMask: Uint8Array
  ) {}

  get size(): number {
    return this.items.length
  }

  search(q: SearchQuerySpec): ItemsQueryResult {
    const started = performance.now()
    const terms = normalizeForSearch(q.text).split(' ').filter((t) => t.length > 0)
    const offset = Math.max(0, Math.trunc(q.offset) || 0)
    const limit = Math.max(0, Math.trunc(q.limit) || 0)
    const facet = q.modId ? foldSearchText(q.modId.trim()) : ''
    const buckets = new Map<number, number[]>()
    let matched = 0

    // 空查询 = 0 档全量；否则先用 gram 倒排取候选超集，再逐条判定 AND 命中
    const seed = terms.length === 0 ? this.idOrder : this.candidates(terms)
    for (const idx of seed) {
      if (!this.accepts(idx, facet, q)) continue
      const score = this.scoreItem(idx, terms)
      if (score < 0) continue
      matched++
      const bucket = buckets.get(score)
      if (bucket) bucket.push(idx)
      else buckets.set(score, [idx])
    }

    const mark = new Uint8Array(this.items.length)
    const picked: number[] = []
    let seen = 0 // offset 是「全部命中项」里的全局名次，不能用 picked.length 判断，否则跨档分页会重复跳过
    if (limit > 0) {
      for (const tier of SCORE_TIERS) {
        const bucket = buckets.get(tier)
        if (!bucket) continue
        if (picked.length >= limit) break
        for (const idx of bucket) mark[idx] = 1
        for (const idx of this.idOrder) {
          if (!mark[idx]) continue
          mark[idx] = 0
          if (seen++ < offset) continue
          if (picked.length >= limit) break
          picked.push(idx)
        }
        for (const idx of bucket) mark[idx] = 0
      }
    }
    return this.result(matched, picked, terms, started)
  }

  private result(matched: number, picked: number[], terms: string[], started: number): ItemsQueryResult {
    const hits: ItemHit[] = picked.map((idx) => ({
      item: this.items[idx] as ItemEntry,
      score: this.scoreItem(idx, terms),
      highlights: this.rangesFor(idx, terms)
    }))
    return { total: this.items.length, matched, hits, elapsedMs: Math.round((performance.now() - started) * 100) / 100 }
  }

  private accepts(idx: number, facet: string, q: SearchQuerySpec): boolean {
    // 虚拟物品：默认隐藏，只有查询显式要求时出现。放在与其他 facet 同一处过滤，
    // 保证 total/matched/hits/分页四者口径一致。
    if (q.includeVirtual !== true && this.virtualMask[idx] === 1) return false
    if (facet && this.modIds[idx] !== facet) return false
    if (q.onlyRegistered && this.reg[idx] === 0) return false
    if (q.onlyWithRecipes && this.hasRec[idx] === 0) return false
    if (q.onlyFavorites && !q.favorites.has(this.items[idx]?.id ?? '')) return false
    return true
  }

  /** 取最短的 gram 倒排链作为候选种子；任一词没有倒排链即全库无命中 */
  private candidates(terms: string[]): number[] {
    let seed: number[] | undefined
    for (const term of terms) {
      const list = this.grams.get(term.length >= 2 ? term.slice(0, 2) : term)
      if (!list || list.length === 0) return []
      if (!seed || list.length < seed.length) seed = list
    }
    return seed ?? []
  }

  /** 多词空格分词是 AND 语义：任一词不命中即整条不匹配（返回 -1），命中则取各词最低档 */
  private scoreItem(idx: number, terms: string[]): number {
    let best = Number.POSITIVE_INFINITY
    for (const term of terms) {
      const score = this.scoreTerm(idx, term)
      if (score === 0) return -1
      if (score < best) best = score
    }
    return best === Number.POSITIVE_INFINITY ? 0 : best
  }

  private scoreTerm(idx: number, term: string): number {
    const zh = this.zh[idx] ?? ''
    const en = this.en[idx] ?? ''
    const id = this.id[idx] ?? ''
    const path = this.path[idx] ?? ''
    if (zh === term) return T.zhEq
    if (en === term) return T.enEq
    if (id === term || path === term) return T.idEq
    if (zh.startsWith(term)) return T.zhPre
    if (en.startsWith(term)) return T.enPre
    if (id.startsWith(term) || path.startsWith(term)) return T.idPre
    const inPy = (this.pyBlob[idx] ?? '').includes(term)
    if (zh.includes(term)) return T.zhInc
    if (en.includes(term)) return T.enInc
    const py = inPy ? this.scorePy(idx, term) : 0
    if (py > T.idInc) return py
    if (id.includes(term)) return T.idInc
    return py
  }

  /** 拼音四档按权重先后判定：全拼前缀 350 > 首字母相等 300 > 全拼包含 250 > 首字母前缀 200 > 首字母包含 100 */
  private scorePy(idx: number, term: string): number {
    const full = this.pyFull[idx] ?? []
    const initials = this.pyInitials[idx] ?? []
    for (const c of full) if (c.startsWith(term)) return T.pyFullPre
    for (const c of initials) if (c === term) return T.pyIniEq
    for (const c of full) if (c.includes(term)) return T.pyFullInc
    for (const c of initials) if (c.startsWith(term)) return T.pyIniPre
    for (const c of initials) if (c.includes(term)) return T.pyIniInc
    return 0
  }

  private rangesFor(idx: number, terms: string[]): HighlightRange[] {
    const out: HighlightRange[] = []
    const seen = new Set<string>()
    for (const term of terms) {
      addOccurrences(out, seen, this.zh[idx] ?? '', term, 'nameZh')
      addOccurrences(out, seen, this.en[idx] ?? '', term, 'nameEn')
      addOccurrences(out, seen, this.id[idx] ?? '', term, 'id')
      const full = firstContaining(this.pyFull[idx] ?? [], term)
      if (full) addOccurrences(out, seen, full, term, 'pyFull')
      const initials = firstContaining(this.pyInitials[idx] ?? [], term)
      if (initials) addOccurrences(out, seen, initials, term, 'pyInitials')
    }
    return out
  }

  /**
   * 构建检索语料：折叠字段、补齐拼音、建 1/2-gram 倒排、按 ID 字典序定序。
   * **不按虚拟物品过滤**：语料保存全部已扫描物品，只在查询期按 `includeVirtual` 决定是否命中，
   * 于是切换显示设置不必重扫、不必重建语料、也不作废物品索引缓存。
   * 仅供同文件的 buildSearchCorpus 调用；构造函数是私有的，没有第二条建库路径。
   */
  static build(items: readonly ItemEntry[]): SearchCorpus {
    const kept: ItemEntry[] = []
    const virtualFlags: number[] = []
    const zh: string[] = [], en: string[] = [], id: string[] = [], path: string[] = []
    const pyFull: string[][] = [], pyInitials: string[][] = [], pyBlob: string[] = [], modIds: string[] = []
    const flags: number[] = []
    const grams = new Map<string, number[]>()

    for (const item of items) {
      // 语料收全量，虚拟属性只记录不过滤（查询期用 virtualMask 判定）
      virtualFlags.push(isVirtualItem(item) ? 1 : 0)
      // 扫描期已预计算拼音的直接用；缺失时（如缓存里的老记录、单测构造的数据）就地补算。
      // 只对含 CJK 的名字补算：外文名（俄/日/法）算拼音没有意义（第 116 批 A-3）
      const derived =
        item.pyFull.length > 0 || item.pyInitials.length > 0 || !hasCjk(item.nameZh) ? null : pinyinIndex(item.nameZh)
      const full = combos(derived ? derived.pyFull : item.pyFull)
      const initials = combos(derived ? derived.pyInitials : item.pyInitials)
      const colon = item.id.indexOf(':')
      const i = kept.length
      kept.push(item)
      zh.push(foldSearchText(item.nameZh))
      en.push(foldSearchText(item.nameEn))
      id.push(foldSearchText(item.id))
      path.push(foldSearchText(colon >= 0 ? item.id.slice(colon + 1) : item.id))
      pyFull.push(full)
      pyInitials.push(initials)
      pyBlob.push(`${full.join(' ')} ${initials.join(' ')}`)
      modIds.push(foldSearchText(item.modId))
      flags.push(item.verified ? 1 : 0, item.hasRecipe ? 1 : 0)

      // 1/2-gram 倒排：查询词取前两个字符即可拿到候选超集，path 是 id 的后缀所以不单独建索引
      const uni = new Set<string>()
      const bi = new Set<string>()
      for (const field of [zh[i] as string, en[i] as string, id[i] as string, ...full, ...initials]) {
        for (let c = 0; c < field.length; c++) {
          uni.add(field.slice(c, c + 1))
          if (c + 1 < field.length) bi.add(field.slice(c, c + 2))
        }
      }
      for (const key of uni) link(grams, key, i)
      for (const key of bi) link(grams, key, i)
    }

    // 记录序按 ID 字典序，同分排序与稳定分页都直接复用这个顺序
    const idOrder = kept.map((_, i) => i).sort((a, b) => (id[a] as string).localeCompare(id[b] as string))
    const reg = new Uint8Array(kept.length)
    const hasRec = new Uint8Array(kept.length)
    const virtualMask = new Uint8Array(kept.length)
    for (let i = 0; i < kept.length; i++) {
      reg[i] = flags[i * 2] as number
      hasRec[i] = flags[i * 2 + 1] as number
      virtualMask[i] = virtualFlags[i] ?? 0
    }
    return new SearchCorpus(kept, zh, en, id, path, pyFull, pyInitials, pyBlob, modIds, reg, hasRec, grams, idOrder, virtualMask)
  }
}

/**
 * 虚拟物品判定（唯一实现，扫描器与查询期共用）。
 * 规则是确定的两步：显式 `virtual === true` 直接生效；否则按规格 3.6.13 的路径/命名规则补判
 * （老缓存没有该字段、或扫描器标了 false 但路径明显是 ritual_dummy，都走这一步）。
 * 不做第三种猜测，同一份数据每次得到同一结果。
 */
/**
 * 只按内置命名规则判定虚拟物品（规格 3.6.13），**不含插件通配**。
 *
 * 扫描器写盘时必须用这个版本：`items.json` 里的 `virtual` 布尔是持久化数据，
 * 让它随「当前装了哪些插件」漂移会造成同一份缓存时真时假。插件通配在**查询期**生效即可。
 */
export function isVirtualByNamingRules(item: Pick<ItemEntry, 'id' | 'nameZh' | 'nameEn'>): boolean {
  return isVirtual(item.id, item.nameZh, item.nameEn)
}

/**
 * 插件声明的虚拟物品通配（`virtualItemPatterns`）在查询期的匹配器。
 *
 * BUG-HUNT-02 修复 BH-003：插件文档 §7 与规格 3.6.13 都承诺了这个能力，但代码里
 * `matchesVirtualItem()` 从无调用方，实际判定完全不看插件规则，于是声明了也毫无效果。
 * 由 `plugins/loader` 在加载/开关时注册，`shared` 层不反向依赖主进程。
 */
let pluginVirtualMatchers: readonly ((itemId: string) => boolean)[] = []

/**
 * 插件通配的版本号（REM-02）。
 *
 * `SearchCorpus` 的 `virtualMask` 是**构建期快照**，插件开关后如果不重建语料，
 * 查询期仍按旧掩码过滤。语料持有者（`scanner/itemIndex`）用这个版本号判断是否需要重建，
 * 从而做到「插件状态一变，下一次查询就用新规则」，而无需每次查询都重建。
 */
let virtualPatternsVersion = 0

export function getVirtualPatternsVersion(): number {
  return virtualPatternsVersion
}

/** 通配集合变化时递增；返回新版本号。 */
export function bumpVirtualPatternsVersion(): number {
  virtualPatternsVersion += 1
  return virtualPatternsVersion
}

export function setPluginVirtualMatchers(matchers: readonly ((itemId: string) => boolean)[]): void {
  pluginVirtualMatchers = matchers
  bumpVirtualPatternsVersion()
}

/**
 * 虚拟物品判定（查询期唯一实现）。
 * 规则顺序：显式 `virtual === true` → 内置路径/命名规则 → 插件通配。
 */
export function isVirtualItem(item: Pick<ItemEntry, 'id' | 'nameZh' | 'nameEn' | 'virtual'>): boolean {
  if (item.virtual === true) return true
  if (isVirtual(item.id, item.nameZh, item.nameEn)) return true
  return pluginVirtualMatchers.some((match) => match(item.id))
}

/** 构建入口：语料建一次供主进程反复查询，含全部物品（虚拟物品只在查询期过滤） */
export function buildSearchCorpus(items: readonly ItemEntry[]): SearchCorpus {
  return SearchCorpus.build(items)
}

function link(grams: Map<string, number[]>, key: string, idx: number): void {
  const list = grams.get(key)
  if (list) list.push(idx)
  else grams.set(key, [idx])
}

/** 便捷入口：未预建语料时使用（每次都要重建索引，仅供测试与一次性查询） */
export function searchCorpus(corpus: SearchCorpus, query: SearchQuerySpec): ItemsQueryResult {
  return corpus.search(query)
}

export function searchItems(items: readonly ItemEntry[], query: SearchQuerySpec): ItemsQueryResult {
  return buildSearchCorpus(items).search(query)
}
