import { describe, expect, it } from 'vitest'
import { pinyinIndex } from '@shared/pinyin'
import { PINYIN_MAX_COMBINATIONS } from '@shared/constants'

describe('pinyinIndex 多音字与全拼/首字母', () => {
  it('钻石 → 全拼 zuanshi、首字母 zs', () => {
    const py = pinyinIndex('钻石')
    expect(py.pyFull).toContain('zuanshi')
    expect(py.pyInitials).toContain('zs')
    for (const value of py.pyFull) expect(value).toBe(value.toLowerCase())
  })

  it('金刚石 → 首字母 jgs 必须命中（逐字取多读音，不依赖整串上下文）', () => {
    const py = pinyinIndex('金刚石')
    expect(py.pyFull).toContain('jingangshi')
    expect(py.pyInitials).toContain('jgs')
  })

  it('银行 取到 háng 的读音，行长 覆盖 hang/xing 与 chang/zhang 的组合', () => {
    expect(pinyinIndex('银行').pyFull).toContain('yinhang')
    const zhang = pinyinIndex('行长')
    expect(zhang.pyFull).toContain('xingchang')
    expect(zhang.pyFull).toContain('hangzhang')
    expect(zhang.pyInitials).toEqual(expect.arrayContaining(['xc', 'hz']))
  })

  it('多音字组合数受 PINYIN_MAX_COMBINATIONS 约束且截断顺序确定', () => {
    const first = pinyinIndex('行行长')
    const second = pinyinIndex('行行长')
    expect(first.pyFull).toHaveLength(PINYIN_MAX_COMBINATIONS)
    expect(first.pyInitials.length).toBeLessThanOrEqual(PINYIN_MAX_COMBINATIONS)
    // 靠前的字变化最慢：首个组合取每字第一个读音，被丢弃的只是尾部组合
    expect(first.pyFull[0]).toBe('xingxingchang')
    expect(first).toEqual(second)
    expect(pinyinIndex('行行长长长长长').pyFull.length).toBeLessThanOrEqual(PINYIN_MAX_COMBINATIONS)
  })

  it('非中文字符安全：数字、英文、间隔号、括号原样保留，空白不入拼音串', () => {
    expect(pinyinIndex('3号高炉').pyFull[0]).toContain('3')
    expect(pinyinIndex('Diamond').pyFull).toEqual(['diamond'])
    expect(() => pinyinIndex('奈特·杰瑞（测试）')).not.toThrow()
    expect(pinyinIndex('奈特·杰瑞（测试）').pyFull[0]).toContain('·')
    expect(pinyinIndex('钻 石').pyFull).toContain('zuanshi')
  })

  it('空串与纯空白返回空数组', () => {
    expect(pinyinIndex('')).toEqual({ pyFull: [], pyInitials: [] })
    expect(pinyinIndex('   ')).toEqual({ pyFull: [], pyInitials: [] })
  })
})
