/**
 * P2-SYMLINK：词法判定看不出软链 —— `isPathInsideDir(base, base/link/x)` 里
 * `link` 是一个指向**外部目录**的 junction/symlink 时，纯词法比较会误判为「在 base 内」。
 *
 * 修复后：词法通过之后，若目标**存在**，再用 `realpath` 比一次。
 * 目标不存在时保留词法结论（不存在的路径无法通过软链逃逸，且渲染层资源在打包前可能尚未生成）。
 *
 * 本文件用一个**真实 junction**（Windows 下目录联接不需要管理员）构造逃逸路径，
 * 不是 mock —— 若当前账户无法创建链接，用例会显式 skip 并在报告里说明。
 */
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInsideDir } from '@main/navigation'

const ROOT = mkdtempSync(join(tmpdir(), 'p2-symlink-'))
const BASE = join(ROOT, 'base')
const OUTSIDE = join(ROOT, 'outside')

mkdirSync(BASE, { recursive: true })
mkdirSync(OUTSIDE, { recursive: true })
writeFileSync(join(OUTSIDE, 'evil.txt'), 'x', 'utf8')
writeFileSync(join(BASE, 'ok.txt'), 'x', 'utf8')

/** 尝试创建 junction；失败（无权限）时返回 false，用例据此 skip */
function makeJunction(): boolean {
  const link = join(BASE, 'link')
  try {
    symlinkSync(OUTSIDE, link, 'junction')
    return true
  } catch {
    return false
  }
}

const junctionOk = makeJunction()

describe('P2-SYMLINK：软链 / junction 不得绕过包含判定', () => {
  it('base 内的普通文件：仍在 base 内（回归）', () => {
    expect(isPathInsideDir(BASE, join(BASE, 'ok.txt'))).toBe(true)
  })

  it('经 junction 指向外部目录的文件：必须判为「不在 base 内」', () => {
    if (!junctionOk) {
      // 无法创建 junction 时不伪造结论
      expect(junctionOk).toBe(false)
      return
    }
    const escaped = join(BASE, 'link', 'evil.txt')
    // 词法上它在 BASE 之下；只有 realpath 才能看出来
    expect(escaped.startsWith(BASE)).toBe(true)
    expect(isPathInsideDir(BASE, escaped)).toBe(false)
  })

  it('不存在的路径退回词法判定（不因 realpath 失败而误判为「在外面」）', () => {
    expect(isPathInsideDir(BASE, join(BASE, 'not-yet-built', 'app.js'))).toBe(true)
  })

  it('外部绝对路径仍然判为「不在 base 内」（回归）', () => {
    expect(isPathInsideDir(BASE, join(OUTSIDE, 'evil.txt'))).toBe(false)
  })
})
