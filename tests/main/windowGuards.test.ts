/**
 * P2-C5：窗口创建点与导航守卫覆盖的静态约束。
 *
 * 目的：未来若有人新增 `new BrowserWindow(...)` 却忘记安装导航守卫，这里会直接失败。
 * 只做源码扫描，不启动 Electron，也不新增窗口功能。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('P2-C5 窗口创建点与守卫覆盖', () => {
  const files = walk(SRC).filter((f) => !f.endsWith('.d.ts'))

  it('每一处 new BrowserWindow 所在文件都安装了导航守卫', () => {
    const creators = files.filter((f) => readFileSync(f, 'utf8').includes('new BrowserWindow'))
    expect(creators.length).toBeGreaterThan(0)
    const unguarded = creators.filter((f) => !readFileSync(f, 'utf8').includes('installNavigationGuards('))
    expect(unguarded).toEqual([])
  })

  it('当前只有一个窗口创建点（主窗口），记录该事实便于未来审查', () => {
    const creators = files
      .filter((f) => readFileSync(f, 'utf8').includes('new BrowserWindow'))
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/'))
    expect(creators).toEqual(['main/window.ts'])
  })

  it('主窗口同时保留了 setWindowOpenHandler（外部链接策略）', () => {
    const winSrc = readFileSync(join(SRC, 'main', 'window.ts'), 'utf8')
    expect(winSrc).toContain('setWindowOpenHandler')
    expect(winSrc).toContain('installNavigationGuards(')
  })
})
