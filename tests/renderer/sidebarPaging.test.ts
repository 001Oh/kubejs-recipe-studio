import { describe, expect, it } from 'vitest'
import type { ItemHit } from '@shared/types'
import { appendUnique, nextPageOffset, shouldPrefetch } from '@renderer/views/sidebar/paging'

function hit(id: string, score = 100): ItemHit {
  return {
    item: {
      id,
      nameZh: id,
      nameEn: id,
      modId: id.split(':')[0] ?? 'minecraft',
      confidence: 'lang',
      verified: false,
      hasIcon: false,
      iconKey: null,
      pyFull: [],
      pyInitials: [],
      virtual: false,
      hasRecipe: false
    },
    score,
    highlights: []
  }
}

describe('侧栏分页窗口', () => {
  it('还有未载入的命中时给出下一页 offset', () => {
    expect(nextPageOffset({ loaded: 400, matched: 1200, pageSize: 400 })).toBe(400)
    expect(nextPageOffset({ loaded: 800, matched: 1200, pageSize: 400 })).toBe(800)
  })

  it('取完 / 非法页长返回 null', () => {
    expect(nextPageOffset({ loaded: 1200, matched: 1200, pageSize: 400 })).toBeNull()
    expect(nextPageOffset({ loaded: 100, matched: 1200, pageSize: 0 })).toBeNull()
  })

  it('滚到距末尾 20 行内才预取', () => {
    const w = { loaded: 400, matched: 1200, pageSize: 400 }
    expect(shouldPrefetch(379, w)).toBe(true)
    expect(shouldPrefetch(380, w)).toBe(true)
    expect(shouldPrefetch(300, w)).toBe(false)
    expect(shouldPrefetch(-1, w)).toBe(false)
    // 已取完就不再预取
    expect(shouldPrefetch(1199, { loaded: 1200, matched: 1200, pageSize: 400 })).toBe(false)
  })

  it('追加去重按物品 id 保留先到的一条', () => {
    const prev = [hit('a:one'), hit('a:two')]
    const next = [hit('a:two', 50), hit('a:three')]
    const merged = appendUnique(prev, next)
    expect(merged.map((h) => h.item.id)).toEqual(['a:one', 'a:two', 'a:three'])
    expect(merged[1]?.score).toBe(100)
  })
})
