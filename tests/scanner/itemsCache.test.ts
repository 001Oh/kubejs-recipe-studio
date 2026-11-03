/**
 * P3-9：items.json 内容校验。旧实现把非法元素静默 filter 掉——`[1,2,3]` 会被当成
 * 「合法的空缓存」（cacheHit=true、索引 0 物品且不重扫）。修复：数组内任一元素
 * 不满足 ItemEntry 形态即整体判 null（触发重扫）；空数组仍是合法缓存（空包真实态）。
 */
import { describe, expect, it } from 'vitest'
import { parseItemsCacheJson } from '../../src/main/scanner/scanService'

const VALID = [
  { id: 'testmod:gear', nameZh: '齿轮', nameEn: 'Gear', modId: 'testmod', confidence: 'model', verified: false, hasIcon: true, pyFull: [], pyInitials: [], virtual: false, hasRecipe: false }
]

describe('P3-9 parseItemsCacheJson 逐元素校验', () => {
  it('非法元素数组（[1,2,3]）必须整体判 null 触发重扫（修复前返回 [] → 红）', () => {
    expect(parseItemsCacheJson('[1,2,3]')).toBeNull()
  })

  it('混入单个非法元素也判 null（旧 filter 会静默吞掉）', () => {
    expect(parseItemsCacheJson(JSON.stringify([...VALID, { id: 42 }]))).toBeNull()
    expect(parseItemsCacheJson(JSON.stringify([null, ...VALID]))).toBeNull()
    expect(parseItemsCacheJson(JSON.stringify([{ id: 'a:b' }]))).toBeNull() // 缺 nameZh
  })

  it('空数组是合法缓存（空包真实态）；合法条目原样通过', () => {
    expect(parseItemsCacheJson('[]')).toEqual([])
    expect(parseItemsCacheJson(JSON.stringify(VALID))).toEqual(VALID)
  })

  it('非数组与损坏 JSON 判 null', () => {
    expect(parseItemsCacheJson('{"id":"x"}')).toBeNull()
    expect(parseItemsCacheJson('{oops')).toBeNull()
  })
})
