/**
 * 第 116 批 A-3：中文名污染修复。
 *
 * 旧行为：zh_cn 缺失时，任意语言（ru_ru / ja_jp / fr_fr…）的名字会被塞进 nameZh，
 * 于是 33.6% 的物品显示成外文，而且拼音索引对这些名字算不出候选 → 拼音搜索全失效。
 */
import { describe, expect, it } from 'vitest'
import { nameFrom } from '../../src/main/scanner/itemRules'
import { displayName, hasCjk, isLocalizedName } from '../../src/shared/itemName'

function locales(entries: Record<string, Record<string, string>>): Map<string, Map<string, string>> {
  return new Map(Object.entries(entries).map(([locale, names]) => [locale, new Map(Object.entries(names))]))
}

describe('nameFrom：nameZh 只接受中文', () => {
  it('zh_cn 含 CJK → 中文名', () => {
    const r = nameFrom('mod:a', locales({ zh_cn: { 'mod:a': '钻石块' }, en_us: { 'mod:a': 'Diamond Block' } }))
    expect(r).toEqual({ zh: '钻石块', en: 'Diamond Block', hasZh: true })
  })

  it('zh_tw / zh_hk 含 CJK 也算中文名', () => {
    const tw = nameFrom('mod:a', locales({ zh_tw: { 'mod:a': '鑽石磚' } }))
    const hk = nameFrom('mod:a', locales({ zh_hk: { 'mod:a': '鑽石磚' } }))
    expect(tw.zh).toBe('鑽石磚')
    expect(hk.zh).toBe('鑽石磚')
  })

  it('zh_cn 里塞英文/俄文（没有 CJK）→ 不冒名顶替，nameZh 为空', () => {
    const r = nameFrom('mod:a', locales({ zh_cn: { 'mod:a': 'Diamond Block' }, en_us: { 'mod:a': 'Diamond Block' } }))
    expect(r.zh).toBe('')
    expect(r.hasZh).toBe(false)
    expect(r.en).toBe('Diamond Block')
  })

  it('俄/日/法文只落 nameEn：有 en_us 时优先英文，没有时用外文兜底', () => {
    const withEn = nameFrom('mod:a', locales({ ru_ru: { 'mod:a': 'Алмазный блок' }, en_us: { 'mod:a': 'Diamond Block' } }))
    expect(withEn.zh).toBe('')
    expect(withEn.en).toBe('Diamond Block')

    const noEn = nameFrom('mod:a', locales({ ja_jp: { 'mod:a': 'ダイヤモンドブロック' }, fr_fr: { 'mod:a': 'Bloc de diamant' } }))
    expect(noEn.zh).toBe('')
    expect(hasCjk(noEn.en)).toBe(false)
    expect(noEn.en.length).toBeGreaterThan(0)
  })

  it('什么都没有时退化为路径可读形式，且仍不算汉化', () => {
    const r = nameFrom('mod:some_odd_item', locales({}))
    expect(r.zh).toBe('')
    expect(r.en.length).toBeGreaterThan(0)
    expect(r.hasZh).toBe(false)
  })
})

describe('显示层口径', () => {
  it('displayName = nameZh || nameEn || id', () => {
    expect(displayName({ id: 'mod:a', nameZh: '钻石', nameEn: 'Diamond' })).toBe('钻石')
    expect(displayName({ id: 'mod:a', nameZh: '', nameEn: 'Diamond' })).toBe('Diamond')
    expect(displayName({ id: 'mod:a', nameZh: '', nameEn: '' })).toBe('mod:a')
  })

  it('未汉化标记只在 nameZh 为空时出现', () => {
    expect(isLocalizedName({ nameZh: '钻石' })).toBe(true)
    expect(isLocalizedName({ nameZh: '' })).toBe(false)
    expect(hasCjk('Алмаз')).toBe(false)
    expect(hasCjk('ダイヤ')).toBe(false)
    expect(hasCjk('钻石')).toBe(true)
  })
})
