import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalStringify, hashRaw, jsonByteLength } from '@shared/canonicalJson'
import { samples } from '../schema/fixtures'

function nodeSha1(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex')
}

describe('canonicalStringify', () => {
  it('键排序、数组保序、数字与字符串严格区分', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalStringify({ chance: 0.07 })).not.toBe(canonicalStringify({ chance: '0.07' }))
    expect(canonicalStringify([1, '1', null, true])).toBe('[1,"1",null,true]')
  })
})

describe('hashRaw（纯 JS SHA-1，与 node:crypto 一致）', () => {
  it('短文本 / 多 64 字节块 / 非 ASCII 与 node:crypto 完全一致', () => {
    expect(hashRaw('')).toBe(nodeSha1('""'))
    expect(hashRaw('abc')).toBe(nodeSha1('"abc"'))
    expect(hashRaw('a'.repeat(1000))).toBe(nodeSha1(canonicalStringify('a'.repeat(1000))))
    expect(hashRaw('中文 UTF-8 与 emoji 🧪')).toBe(nodeSha1(canonicalStringify('中文 UTF-8 与 emoji 🧪')))
  })

  it('真实配方样本与 node:crypto 完全一致（长文本跨多个 64 字节块）', () => {
    for (const sample of Object.values(samples)) {
      expect(hashRaw(sample.json)).toBe(nodeSha1(canonicalStringify(sample.json)))
    }
  })

  it('键顺序不影响指纹，数组顺序与类型影响指纹', () => {
    expect(hashRaw({ a: 1, b: [2, 3] })).toBe(hashRaw({ b: [2, 3], a: 1 }))
    expect(hashRaw({ a: [1, 2] })).not.toBe(hashRaw({ a: [2, 1] }))
  })
})

describe('jsonByteLength', () => {
  it('按 UTF-8 计价，与 Buffer.byteLength 一致', () => {
    const value = { text: '中文', emoji: '🧪', n: 1 }
    expect(jsonByteLength(value)).toBe(Buffer.byteLength(JSON.stringify(value), 'utf8'))
  })

  it('不可序列化时返回 Infinity（按超限处理而不是低估）', () => {
    expect(jsonByteLength({ bad: 1n })).toBe(Number.POSITIVE_INFINITY)
  })
})
