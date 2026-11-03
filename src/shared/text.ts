/** 文本规范化工具（规格 3.3 检索 / 3.4 数量前缀 / 3.6.13 显示名回退）。纯函数、无 IO、无 Electron 依赖。 */

const IDEOGRAPHIC_SPACE = 0x3000
const FULLWIDTH_START = 0xff01
const FULLWIDTH_END = 0xff5e
/** 全角 ASCII 与半角 ASCII 的固定偏移 */
const WIDTH_DELTA = 0xfee0

/**
 * 长度不变的检索折叠：逐码点全角转半角 + 小写。
 * 索引侧字段一律用它预处理，保证高亮 range 的下标能直接映射回原始字符串
 * （全角转半角与 toLowerCase 对 ASCII/中日韩字符都是 1:1 长度；
 * 仅少数特殊字符如 `İ` 会因 Unicode 大小写规则改变长度，实际物品名不会命中）。
 */
export function foldSearchText(s: string): string {
  if (!s) return ''
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    if (code === IDEOGRAPHIC_SPACE) out += ' '
    else if (code >= FULLWIDTH_START && code <= FULLWIDTH_END) out += String.fromCharCode(code - WIDTH_DELTA)
    else out += ch
  }
  return out.toLowerCase()
}

/** 检索用规范化：小写 + 全角转半角 + 连续空白折叠为单个空格并去首尾空白。 */
export function normalizeForSearch(s: string): string {
  return foldSearchText(s).replace(/\s+/g, ' ').trim()
}

/**
 * 由 ID 的 path 段推导可读显示名（规格 3.6.13：无 lang 名时的名称回退）。
 * 规则：
 * - 传入完整 ID（含 `ns:`）时先丢掉 namespace，只保留 path；
 * - `/` 子路径（如 `ritual_dummy/craft_dimensional_matrix`）取**最后一段**作为本体，
 *   前缀段只是分类目录，进入名字只会干扰阅读；
 * - 下划线转空格、压缩连续空白，整串首字母大写（其余字符保持原样，不强制小写以保留 `AE2` 之类缩写）。
 */
export function readableFromPath(path: string): string {
  const trimmed = (path ?? '').trim()
  if (!trimmed) return ''
  const withoutNs = trimmed.slice(trimmed.indexOf(':') >= 0 ? trimmed.indexOf(':') + 1 : 0)
  const segments = withoutNs.split('/').filter((seg) => seg.length > 0)
  const body = segments.length > 0 ? segments[segments.length - 1] : withoutNs
  const words = body.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return ''
  const first = words.charAt(0)
  return first === first.toUpperCase() ? words : first.toUpperCase() + words.slice(1)
}

/** 数量前缀语法：`2x minecraft:oak_planks`、`4x foo`（规格 3.4）。count 为 1 时不要求前缀。 */
const COUNT_PREFIX = /^(\d{1,9})\s*[x×*]\s*(\S.*)$/i

/**
 * 解析可选的 `Nx ` 数量前缀。
 * 返回 null 的两种情况：没有前缀（数量隐含为 1），或前缀非法
 * （数字为 0、`x` 后没有剩余内容、整体不是纯数字前缀形式）。
 */
export function parseCountPrefix(input: string): { count: number; id: string } | null {
  const text = (input ?? '').trim()
  if (!text) return null
  const m = COUNT_PREFIX.exec(text)
  if (!m) return null
  const count = Number(m[1])
  const id = (m[2] ?? '').trim()
  if (!Number.isFinite(count) || count < 1 || !id) return null
  return { count, id }
}

/** `parseCountPrefix` 的逆运算：数量 > 1 时补 `Nx ` 前缀，等于 1 时保持裸 ID。 */
export function formatCountPrefix(id: string, count: number): string {
  const trimmed = (id ?? '').trim()
  if (!Number.isFinite(count) || count <= 1) return trimmed
  return `${Math.trunc(count)}x ${trimmed}`
}
