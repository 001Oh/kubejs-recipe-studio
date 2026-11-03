/**
 * 设计令牌完整性：四套主题都要有完整配色，且组件里引用的每个变量都能在 tokens.css 找到定义。
 * 这是"换主题不掉色"的自动化守卫——漏一个变量，某个面板就会在深色主题下变成白底。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_IDS } from '../../src/shared/theme'

const ROOT = process.cwd()
const TOKENS_PATH = join(ROOT, 'src/renderer/src/styles/tokens.css')
const tokensCss = readFileSync(TOKENS_PATH, 'utf8')

/** 取某个主题块的选择器名 → 块内声明的变量集合 */
function themeBlock(id: string): Set<string> {
  const re = new RegExp(`\\[data-theme='${id}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'm')
  const m = tokensCss.match(re)
  expect(m, `tokens.css 缺少 [data-theme='${id}'] 块`).not.toBeNull()
  const body = m?.[1] ?? ''
  return new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((x) => x[1] as string))
}

const REQUIRED = [
  'bg-app',
  'bg-panel',
  'bg-raised',
  'bg-hover',
  'bg-active',
  'bg-inset',
  'bg-inset-hover',
  'line',
  'line-soft',
  'line-strong',
  'line-inset',
  'fg',
  'fg-muted',
  'fg-subtle',
  'fg-on-accent',
  'accent',
  'accent-strong',
  'accent-deep',
  'accent-soft',
  'accent-softer',
  'accent-line',
  'accent-glow',
  'ok',
  'warn',
  'err',
  'info',
  'registry',
  'fluid',
  'dirty',
  'badge-bg',
  'highlight-bg',
  'highlight-fg',
  'overlay-bg',
  'skeleton',
  'level-debug',
  'level-info',
  'level-warn',
  'level-error',
  'level-success',
  'shadow-1',
  'shadow-2',
  'shadow-3'
]

describe('tokens.css 主题块', () => {
  it('每套主题都有独立的 [data-theme] 块', () => {
    for (const id of THEME_IDS) {
      expect(themeBlock(id).size).toBeGreaterThan(20)
    }
  })

  it('每套主题都定义了全部必需变量', () => {
    for (const id of THEME_IDS) {
      const vars = themeBlock(id)
      const missing = REQUIRED.filter((v) => !vars.has(v))
      expect({ theme: id, missing }).toEqual({ theme: id, missing: [] })
    }
  })

  it('每套主题都声明 color-scheme', () => {
    for (const id of THEME_IDS) {
      const re = new RegExp(`\\[data-theme='${id}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'm')
      const body = tokensCss.match(re)?.[1] ?? ''
      expect(body).toMatch(/color-scheme:\s*(light|dark);/)
    }
  })

  it('结构令牌（间距 / 圆角 / 字号 / 控件高度）只定义一次，不随主题变化', () => {
    for (const name of ['sp-1', 'sp-2', 'sp-4', 'r-md', 'r-lg', 'fs-body', 'h-control', 'h-topbar']) {
      const hits = tokensCss.match(new RegExp(`--${name}\\s*:`, 'g')) ?? []
      expect({ name, count: hits.length }).toEqual({ name, count: 1 })
    }
  })
})

describe('组件 CSS 引用的变量都已定义', () => {
  function cssFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) cssFiles(full, out)
      else if (entry.endsWith('.css')) out.push(full)
    }
    return out
  }

  const defined = new Set([...tokensCss.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1] as string))

  it('renderer 下所有 css 里 var(--x) 都有定义（排除局部自定义属性）', () => {
    const local = new Set(['cols', 'cell']) // .grid-wrap 在自己的作用域里定义
    const missing: string[] = []
    for (const file of cssFiles(join(ROOT, 'src/renderer/src'))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/var\(--([a-z0-9-]+)/g)) {
        const name = m[1] as string
        if (local.has(name)) continue
        if (!defined.has(name)) missing.push(`${file.replace(ROOT, '')}: --${name}`)
      }
    }
    expect(missing).toEqual([])
  })
})
