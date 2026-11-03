/** 拼音索引（规格 3.3 多音字处理 + §五 拼音索引）。纯函数、无 IO、无 Electron 依赖。 */
import { pinyin } from 'pinyin-pro'
import { PINYIN_MAX_COMBINATIONS } from './constants'

export interface PinyinIndex {
  /** 每个组合的小写全拼，去空格，最多 PINYIN_MAX_COMBINATIONS 个 */
  pyFull: string[]
  /** 与 pyFull 对应的每字首字母组合，最多 PINYIN_MAX_COMBINATIONS 个 */
  pyInitials: string[]
}

/**
 * 中日韩统一表意文字（基本区 + 扩展 A + 兼容表意区）。
 * 只有这些字符交给 pinyin-pro 取多读音；其余字符按原样保留，理由见 charOptions。
 */
const HAN = /[㐀-䶿一-鿿豈-﫿]/

/** 单字多读音缓存：整库扫描时同名/同字极多，避免重复调用 pinyin-pro。 */
const readingCache = new Map<string, string[]>()

/**
 * 取单个字符的全部候选读音（小写、去声调、去空格）。
 * - 汉字：pinyin-pro 的 `{ type: 'array', multiple: true, toneType: 'none' }`，
 *   注意整串调用 multiple 只会返回上下文读音，因此必须**逐字**取多读音；
 * - 非汉字（数字、英文字母、`·`、全角/半角括号等）：原样保留单个候选，
 *   既不丢信息（`3号高炉` 仍能按 `3` 检索），也不会被当成拼音展开；
 * - pinyin-pro 对某些字符返回空串时回退为字符本身，保证候选数组永不为空。
 */
function charOptions(ch: string): string[] {
  if (!HAN.test(ch)) return [ch]
  const cached = readingCache.get(ch)
  if (cached) return cached
  const raw = pinyin(ch, { type: 'array', multiple: true, toneType: 'none' })
  const out: string[] = []
  for (const item of raw) {
    const value = String(item ?? '').replace(/\s+/g, '').toLowerCase()
    if (value && !out.includes(value)) out.push(value)
  }
  const result = out.length > 0 ? out : [ch]
  readingCache.set(ch, result)
  return result
}

/**
 * 逐字候选做笛卡尔积，边生成边截断到 cap，避免多音字组合爆炸。
 * 顺序确定：靠前的字变化最慢，超出上限的组合按该顺序丢弃（绝不随机）。
 * 每个前缀最多保留前 cap 个子组合，因此总步数受 cap 约束。
 */
function combine(options: string[][], cap: number): string[][] {
  let acc: string[][] = [[]]
  for (const opts of options) {
    const next: string[][] = []
    for (const prefix of acc) {
      for (const o of opts) {
        next.push([...prefix, o])
        if (next.length >= cap) break
      }
      if (next.length >= cap) break
    }
    acc = next
  }
  return acc
}

function pushUnique(list: string[], value: string, cap: number): void {
  if (list.length >= cap || !value || list.includes(value)) return
  list.push(value)
}

/**
 * 中文名的拼音索引：全拼组合 + 首字母组合。
 * 混合纯中文/非中文安全；空串或全空白返回两个空数组。
 */
export function pinyinIndex(nameZh: string): PinyinIndex {
  const options: string[][] = []
  for (const ch of nameZh ?? '') {
    // 组合串「去空格」：空白只作分隔，不参与拼音拼接
    if (/\s/.test(ch)) continue
    // 一个字对应一个候选位置，多音字的多个读音都放在同一位置里做笛卡尔积
    options.push(charOptions(ch))
  }
  const pyFull: string[] = []
  const pyInitials: string[] = []
  if (options.length === 0) return { pyFull, pyInitials }
  for (const combo of combine(options, PINYIN_MAX_COMBINATIONS)) {
    // 全拼组合统一小写；非中文字符原样保留后同样参与小写折叠，避免 `Diamond` 留下大写
    pushUnique(pyFull, combo.join('').toLowerCase(), PINYIN_MAX_COMBINATIONS)
    pushUnique(pyInitials, combo.map((o) => o.charAt(0)).join('').toLowerCase(), PINYIN_MAX_COMBINATIONS)
  }
  return { pyFull, pyInitials }
}
