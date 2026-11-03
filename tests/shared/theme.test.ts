import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEME_IDS, THEME_LIST, THEMES, nextTheme, normalizeTheme, themeMeta } from '../../src/shared/theme'

describe('主题注册表', () => {
  it('包含四套主题，默认项排在第一位', () => {
    expect(THEME_IDS).toHaveLength(4)
    expect(THEME_IDS[0]).toBe(DEFAULT_THEME)
    expect(THEME_LIST.map((t) => t.id)).toEqual([...THEME_IDS])
  })

  it('每套主题的元数据完整且自洽', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id]
      expect(t.id).toBe(id)
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.hint.length).toBeGreaterThan(0)
      expect(['light', 'dark']).toContain(t.mode)
      // 窗口底色必须是合法十六进制，否则 BrowserWindow 会静默忽略
      expect(t.windowBackground).toMatch(/^#[0-9a-f]{6}$/i)
      for (const value of [t.swatch.base, t.swatch.surface, t.swatch.accent]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i)
      }
      // OLED 主题要求主背景接近纯黑
      if (id === 'oled') expect(t.windowBackground.toLowerCase()).toBe('#000000')
      // 浅色主题必须是亮色模式，其余为暗色
      expect(t.mode).toBe(id === 'light' ? 'light' : 'dark')
    }
  })

  it('themeMeta 返回注册表里的同一对象', () => {
    expect(themeMeta('midnight')).toBe(THEMES.midnight)
  })
})

describe('normalizeTheme：旧值与非法值', () => {
  it('接受四套合法 id', () => {
    for (const id of THEME_IDS) expect(normalizeTheme(id)).toBe(id)
  })

  it('把历史值 dark 迁移为 graphite', () => {
    expect(normalizeTheme('dark')).toBe('graphite')
    expect(normalizeTheme('DARK')).toBe('graphite')
    expect(normalizeTheme('  dark  ')).toBe('graphite')
  })

  it('未知 / 空 / 非字符串一律回落到默认主题', () => {
    for (const bad of ['', 'neon', 'graphitee', 'midnight-dark', undefined, null, 0, 42, true, {}, []]) {
      expect(normalizeTheme(bad)).toBe(DEFAULT_THEME)
    }
  })

  it('容忍首尾空白（不做静默改写以外的推断）', () => {
    expect(normalizeTheme(' oled ')).toBe('oled')
    expect(normalizeTheme('\tlight\n')).toBe('light')
  })
})

describe('nextTheme：循环切换', () => {
  it('按注册表顺序循环', () => {
    expect(nextTheme('graphite')).toBe('light')
    expect(nextTheme('light')).toBe('midnight')
    expect(nextTheme('midnight')).toBe('oled')
    expect(nextTheme('oled')).toBe('graphite')
  })

  it('支持反向与跨圈步进，且不会越界', () => {
    expect(nextTheme('graphite', -1)).toBe('oled')
    expect(nextTheme('graphite', 6)).toBe('midnight')
    // 3 + 9 = 12，绕一圈后回到起点
    expect(nextTheme('oled', 9)).toBe('graphite')
    expect(nextTheme('oled', 10)).toBe('light')
  })
})
