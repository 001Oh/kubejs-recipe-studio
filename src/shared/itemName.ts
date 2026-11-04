/**
 * 物品名的显示口径（第 116 批 A-3）。
 *
 * 背景：`nameZh` 原先在扫描期会退化成"任意语言的名字"，于是 33.6% 的物品
 * （俄/日/法…）被当成中文名塞进 `nameZh`，症状有两种：
 *   1. 列表里出现俄文/日文却没有任何"未汉化"提示；
 *   2. 拼音索引对这些名字构建出的候选全为空 → 拼音搜索完全失效。
 *
 * 现在契约收紧：
 *   - `nameZh` **只**来自 zh_cn / zh_tw / zh_hk 且内容真的含 CJK，否则为空串；
 *   - 其余语言的名字落 `nameEn`（或退化为路径可读形式），显示层用 `displayName()` 兜底；
 *   - `isLocalizedName()` 为 false 时由 UI 打「未汉化」小标记。
 *
 * 这个模块只有纯函数，shared / main / renderer 三处共用同一口径。
 */

/** CJK 统一表意文字（含扩展 A 与兼容区）：名字里至少要有一个，才算"中文名" */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function hasCjk(text: string): boolean {
  return CJK.test(text)
}

export interface NamedItem {
  id: string
  nameZh?: string
  nameEn?: string
}

/** 显示用名字：中文名 → 英文/其它语言名 → 物品 ID */
export function displayName(item: NamedItem): string {
  const zh = (item.nameZh ?? '').trim()
  if (zh) return zh
  const en = (item.nameEn ?? '').trim()
  return en || item.id
}

/** 是否有中文名（false 时 UI 打「未汉化」标记） */
export function isLocalizedName(item: Pick<NamedItem, 'nameZh'>): boolean {
  return ((item.nameZh ?? '').trim()) !== ''
}
