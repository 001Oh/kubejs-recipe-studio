/**
 * 原版物品静态源 + 引用兜底（B120/D-07，T-07）。
 *
 * 事实前提（取证见 `E:/kjs-audit/B120-D07-PREP.md`）：
 * 物品索引只扫整合包的 mods 目录（`scanService.listJars`），**原版 client jar 从不进扫描集合**，
 * 于是 `items.json` 里 `minecraft` 命名空间只剩 28~32 条模型/贴图派生的假条目，
 * `minecraft:emerald` 在全部历史缓存中 16/16 缺失 —— 不是解析规则漏了，是输入源少了 1,400+ 条。
 *
 * 落地方案（委托方 2026-11-05 16:4x 拍板 b）：**编排层阶段 3 内存合并**。
 * - `items.json` 缓存内容与语义完全不变（仍只含 mod 派生条目），因此历史缓存零失效，
 *   **不需要 bump `PARSER_VERSION`**——`parseItemsCacheJson` 只强校验 `id`/`nameZh`，
 *   `source` 是可选字段，旧缓存照常通过。
 * - 合并结果只活在主进程内存索引里，每次扫描（含缓存命中）在 `setItemIndex` 前重建一次，
 *   1,435 条合并是毫秒级操作。
 *
 * 两层数据：
 * 1. `vanilla`：内置 1.19.2 原版清单（`src/data/vanillaItems/1.19.2.json`，按扫描器同规则抽取）；
 * 2. `referenced`：配方里被引用、但既不在 mod 扫描结果也不在内置清单里的 id，补占位条目，
 *    让槽位可点、可搜、可生成（`source:'referenced'`，名字走路径可读化，无图标）。
 */
import type { ItemEntry, RecipeRecord } from '../shared/types'
import { pinyinIndex } from '../shared/pinyin'
import { hasCjk } from '../shared/itemName'
import { isVirtualByNamingRules } from '../shared/search'
import { readableFromPath } from '../shared/text'
import vanillaList from '../data/vanillaItems/1.19.2.json'

/** 内置清单的 MC 版本。清单内容随版本差异很大，日志/文档要能说出「这是哪一版的原版全集」 */
export const VANILLA_LIST_VERSION: string = vanillaList.mcVersion

/** 引用兜底的条数上限：劣质包可能有几万条错误引用，超限整批放弃（半量收录会变成随机行为） */
export const REFERENCED_LIMIT = 2000

export interface EnrichReport {
  /** 内置清单总数 */
  vanillaTotal: number
  /** 内置清单里新增进索引的条数（被 mod 扫描结果覆盖的不计） */
  vanillaAdded: number
  /** 内置清单条目里被某条配方产出（用于 hasRecipe 回填）的条数 */
  vanillaWithRecipe: number
  /** 引用兜底新增条数（overflow 时为 0） */
  referencedAdded: number
  /** 配方里缺定义的物品 id 总数（含 overflow 时观察到的数量） */
  referencedConsidered: number
  /** 引用量超限，整批未收录 */
  overflow: boolean
}

type RawRow = readonly [string, string, string]

let cache: ItemEntry[] | null = null

/**
 * 内置原版条目（懒构建一次，进程内复用）。
 *
 * 中文名严格按 116 批 A-3 口径：**只认含 CJK 的值**，`minecraft:tnt` 的官方中文名就是 `TNT`
 * （无 CJK），按契约落 `nameEn`、`nameZh` 留空由显示层兜底 —— 不是漏抽取。
 * 拼音只对含 CJK 的名字计算，避免 1,435 次无意义调用。
 */
export function vanillaEntries(): ItemEntry[] {
  if (cache) return cache
  const rows = vanillaList.items as unknown as RawRow[]
  const out: ItemEntry[] = new Array(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as RawRow
    const id = row[0]
    const nameZh = row[1]
    const nameEn = row[2]
    const py = hasCjk(nameZh) ? pinyinIndex(nameZh) : { pyFull: [], pyInitials: [] }
    out[i] = {
      id,
      nameZh,
      nameEn,
      modId: id.slice(0, id.indexOf(':')),
      confidence: 'lang',
      // 内置清单没有「用户在注册表里核对过」这一层，一律 false，与 jar 扫描口径一致
      verified: false,
      // 原版贴图不在任何 jar 里，没有图标缓存条目；显示层用占位块
      hasIcon: false,
      iconKey: null,
      pyFull: py.pyFull,
      pyInitials: py.pyInitials,
      virtual: isVirtualByNamingRules({ id, nameZh, nameEn }),
      // 由 enrichIndex 按配方库回填
      hasRecipe: false,
      source: 'vanilla'
    }
  }
  cache = out
  return out
}

/**
 * 把内置清单与引用兜底并进扫描结果，产出**内存索引**（不落盘）。
 *
 * 优先级：扫描结果 > 内置清单 > 引用占位。
 * 扫描结果优先的理由是它有真实图标与 verified 标记；但它的名字可能是空串（无汉化），
 * 这时用内置清单的官方名补上比留空更准。引用占位只补前两层都没有的 id。
 *
 * 单次遍历配方记录同时完成两件事：回填 `hasRecipe`（被产出的原版物品）与收集缺定义引用，
 * 32k 条记录实测在毫秒级。
 */
export function enrichIndex(
  scanned: readonly ItemEntry[],
  records: readonly RecipeRecord[]
): { items: ItemEntry[]; report: EnrichReport } {
  // ① 配方产出/引用索引：一个 Set 记「被产出过」，一个 Set 记「所有被引用的物品 id」
  const produced = new Set<string>()
  const referenced = new Set<string>()
  let overflow = false
  for (const record of records) {
    for (const io of record.outputs) {
      if (io.kind !== 'item') continue
      produced.add(io.id)
      referenced.add(io.id)
    }
    for (const io of record.inputs) {
      if (io.kind !== 'item') continue
      referenced.add(io.id)
    }
  }

  // ② 合并：扫描结果打底，内置清单补缺（并回填 hasRecipe）
  const merged = new Map<string, ItemEntry>()
  for (const item of scanned) merged.set(item.id, item)
  const vanilla = vanillaEntries()
  let vanillaAdded = 0
  let vanillaWithRecipe = 0
  for (const entry of vanilla) {
    const existing = merged.get(entry.id)
    if (existing) {
      if (!existing.nameZh && entry.nameZh) merged.set(entry.id, { ...existing, nameZh: entry.nameZh })
      if (!existing.nameEn && entry.nameEn) merged.set(entry.id, { ...(merged.get(entry.id) as ItemEntry), nameEn: entry.nameEn })
      continue
    }
    const hasRecipe = produced.has(entry.id)
    if (hasRecipe) vanillaWithRecipe += 1
    merged.set(entry.id, hasRecipe ? { ...entry, hasRecipe: true } : entry)
    vanillaAdded += 1
  }

  // ③ 引用兜底：前两层都没有、但配方真的引用了的 id → 占位条目
  const missing = new Set<string>()
  for (const id of referenced) {
    if (merged.has(id)) continue
    if (!id.includes(':')) continue
    missing.add(id)
    if (missing.size > REFERENCED_LIMIT) {
      overflow = true
      break
    }
  }
  let referencedAdded = 0
  if (!overflow) {
    for (const id of missing) {
      const colon = id.indexOf(':')
      const name = readableFromPath(id)
      merged.set(id, {
        id,
        nameZh: '',
        nameEn: name,
        modId: id.slice(0, colon),
        // 置信度取最低档：它只有「配方提过这个名字」这一个证据
        confidence: 'texture',
        verified: false,
        hasIcon: false,
        iconKey: null,
        pyFull: [],
        pyInitials: [],
        virtual: isVirtualByNamingRules({ id, nameZh: '', nameEn: name }),
        hasRecipe: produced.has(id),
        source: 'referenced'
      })
      referencedAdded += 1
    }
  }

  return {
    items: [...merged.values()],
    report: {
      vanillaTotal: vanilla.length,
      vanillaAdded,
      vanillaWithRecipe,
      referencedAdded,
      referencedConsidered: missing.size,
      overflow
    }
  }
}

/** 只返回 mod 派生条目（任何写 `items.json` 的路径都必须过一遍：合成条目不能落盘） */
export function scannedOnly(items: readonly ItemEntry[]): ItemEntry[] {
  return items.filter((item) => item.source !== 'vanilla' && item.source !== 'referenced')
}

/** 仅测试用：清空内置条目缓存（生产路径不需要） */
export function resetVanillaCache(): void {
  cache = null
}
