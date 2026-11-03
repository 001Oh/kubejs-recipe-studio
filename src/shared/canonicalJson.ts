/**
 * 规范化 JSON 文本 + 稳定哈希。
 * 用于 rawHash（冲突检测）与 unknowns 体积计算；不依赖 Electron / 文件系统，
 * 同时被主进程与渲染端（工作台预览）引用，因此只用 Web 标准能力（TextEncoder），
 * 不引入 node:crypto / Buffer。
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 稳定序列化：对象键排序、数组保持顺序、数字与字符串严格区分（`0.07` ≠ `"0.07"`）。
 * undefined / 函数 / symbol 不属于 JSON，直接抛错而不是悄悄丢弃。
 */
export function canonicalStringify(value: unknown): string {
  const encode = (node: unknown): string => {
    if (node === null) return 'null'
    if (typeof node === 'string') return JSON.stringify(node)
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) throw new Error(`非法数字：${String(node)}`)
      return JSON.stringify(node)
    }
    if (typeof node === 'boolean') return node ? 'true' : 'false'
    if (Array.isArray(node)) return `[${node.map(encode).join(',')}]`
    if (isPlainObject(node)) {
      const keys = Object.keys(node).sort()
      return `{${keys.map((k) => `${JSON.stringify(k)}:${encode(node[k])}`).join(',')}}`
    }
    throw new Error(`无法序列化的值：${typeof node}`)
  }
  return encode(value)
}

const encoder = new TextEncoder()

/** SHA-1（纯 JS，UTF-8）：与 node:crypto 的 sha1 结果一致，便于主/渲染共用 */
function sha1Hex(text: string): string {
  const bytes = encoder.encode(text)
  const bitLength = bytes.length * 8
  const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6))
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(padded.length - 4, bitLength >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 80; i += 1) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!
      w[i] = (x << 1) | (x >>> 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i += 1) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, '0')).join('')
}

/** rawHash：原始 JSON 的稳定指纹 */
export function hashRaw(raw: unknown): string {
  return sha1Hex(canonicalStringify(raw))
}

/** UTF-8 字节数（unknowns 的 8KB 上限按这个口径算） */
export function jsonByteLength(value: unknown): number {
  try {
    return encoder.encode(JSON.stringify(value) ?? '').length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export { isPlainObject }
