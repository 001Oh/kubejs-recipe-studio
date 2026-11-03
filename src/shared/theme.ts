/**
 * 主题注册表（唯一来源）。主进程用它校验/迁移 userData/uiState.json 里的 theme，
 * 渲染端用它渲染主题选择器与决定代码高亮用亮色还是暗色。
 *
 * 约定：
 * - id 一旦发布就不要改名（会写进用户磁盘）；
 * - 未知值一律回落到 DEFAULT_THEME（石墨翡翠），保证旧数据与非法值都能启动；
 * - 旧的 'dark' 是历史值，等价于 'graphite'。
 */

export const THEME_IDS = ['graphite', 'light', 'midnight', 'oled'] as const

export type ThemeId = (typeof THEME_IDS)[number]

/** 历史值 → 现行 id（只在读取旧 uiState 时使用） */
const LEGACY: Record<string, ThemeId> = {
  dark: 'graphite',
  graphite: 'graphite',
  light: 'light',
  midnight: 'midnight',
  oled: 'oled'
}

export const DEFAULT_THEME: ThemeId = 'graphite'

export interface ThemeMeta {
  id: ThemeId
  /** 选择器里显示的名字 */
  label: string
  /** 一句话说明（什么时候该用它） */
  hint: string
  /** 亮色 / 暗色，决定代码高亮主题与原生控件配色 */
  mode: 'light' | 'dark'
  /** 窗口底色：BrowserWindow 的 backgroundColor，避免启动瞬间白闪 */
  windowBackground: string
  /** 选择器里的三色预览（底 / 面 / 强调） */
  swatch: { base: string; surface: string; accent: string }
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  graphite: {
    id: 'graphite',
    label: '石墨翡翠',
    hint: '默认。中性石墨灰 + 翡翠绿，长时间阅读与编辑最稳。',
    mode: 'dark',
    windowBackground: '#111315',
    swatch: { base: '#111315', surface: '#242a2d', accent: '#34d399' }
  },
  light: {
    id: 'light',
    label: '浅色',
    hint: '白天或强光环境下使用，白底深字，强调色转为深翡翠。',
    mode: 'light',
    windowBackground: '#f6f7f8',
    swatch: { base: '#f6f7f8', surface: '#ffffff', accent: '#059669' }
  },
  midnight: {
    id: 'midnight',
    label: '午夜蓝',
    hint: '冷色版暗色主题，深蓝底 + 冰蓝强调，适合夜间长时间使用。',
    mode: 'dark',
    windowBackground: '#0c1018',
    swatch: { base: '#0c1018', surface: '#1a2233', accent: '#7dd3fc' }
  },
  oled: {
    id: 'oled',
    label: 'OLED 黑',
    hint: '纯黑底色省电、对比最高；面板之间用极低明度差区分。',
    mode: 'dark',
    windowBackground: '#000000',
    swatch: { base: '#000000', surface: '#131614', accent: '#34d399' }
  }
}

/** 主题列表（按 THEME_IDS 顺序，第一个是默认项） */
export const THEME_LIST: ThemeMeta[] = THEME_IDS.map((id) => THEMES[id])

/** 把任意输入（旧值 / 非法值 / null）收敛成合法主题 id */
export function normalizeTheme(value: unknown): ThemeId {
  if (typeof value !== 'string') return DEFAULT_THEME
  return LEGACY[value.trim().toLowerCase()] ?? DEFAULT_THEME
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES[id]
}

/** 选择器/快捷键用的循环切换 */
export function nextTheme(current: ThemeId, step = 1): ThemeId {
  const index = THEME_IDS.indexOf(current)
  const size = THEME_IDS.length
  return THEME_IDS[(index + (step % size) + size) % size] ?? DEFAULT_THEME
}
