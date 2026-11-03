/**
 * 第 46 批（A2 一行）：插件开关的无障碍语义。
 *
 * 为什么是结构断言而不是 `render(<SettingsView/>)`：
 * SettingsView 直接依赖 zustand store + `window.studio.invoke` 的整棵树，
 * 在 jsdom 里渲染需要伪造十余个 IPC 通道与 store 初始态——成本远高于它带来的信息量。
 * 本仓已有先例（第 31 批 UI-U2 的焦点解耦同样用结构断言 + 定向行为验证）。
 *
 * 断言目标（与 `getByRole('switch')` 等价的语义前提）：
 *   1. 开关按钮带 `role="switch"`
 *   2. `aria-checked` 绑定表达式（随 status 变化），不是写死字面量
 *   3. `aria-label` 存在（读屏器需要名称）
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 去掉 // 与 /* *\/ 注释，避免断言命中注释里的示例文案（本仓既定做法）。 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const SRC = codeOnly(readFileSync(join(process.cwd(), 'src/renderer/src/views/SettingsView.tsx'), 'utf8'))

/**
 * 取出包含指定下标的 JSX 开标签全文。
 * 不能用 `/<button[^>]*>/`：JSX 属性里有 `onClick={() => ...}`，其中的 `>` 会提前截断。
 * 这里按花括号深度扫描，只在深度 0 遇到 `>` 才认定标签结束。
 */
function openingTagAt(src: string, at: number): string {
  const start = src.lastIndexOf('<button', at)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0) return src.slice(start, i + 1)
  }
  return ''
}

const switchTag = (() => {
  const at = SRC.indexOf('role="switch"')
  return at < 0 ? '' : openingTagAt(SRC, at)
})()

describe('插件开关的 role/aria（第 46 批）', () => {
  it('开关按钮声明 role="switch"', () => {
    expect(SRC).toMatch(/role="switch"/)
  })

  it('aria-checked 由状态表达式驱动，不是写死值', () => {
    const m = switchTag.match(/aria-checked=\{([^}]+)\}/)
    expect(m).not.toBeNull()
    // 必须是表达式（含比较运算），而不是 "true"/"false" 之类的字面量
    expect(m?.[1]).toMatch(/status|disabled|!==|===|!/)
  })

  it('aria-label 存在（读屏器需要可读名称）', () => {
    expect(switchTag).toMatch(/aria-label=\{`[^`]*插件[^`]*`\}/)
  })

  it('三个属性与 onClick 挂在同一个按钮上（避免加到错误的元素）', () => {
    expect(switchTag).not.toBe('')
    expect(switchTag).toContain('role="switch"')
    expect(switchTag).toContain('aria-checked')
    expect(switchTag).toContain('aria-label')
    expect(switchTag).toContain('onClick')
  })
})
