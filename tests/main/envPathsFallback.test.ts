/**
 * P2-MKDIR：隔离数据目录**创建失败**时必须降级，而不是让应用起不来。
 *
 * 旧行为（`envPaths.ts` 的 `applyUserDataDir`）：`mkdirSync(resolved.dir)` 直接抛出 →
 * 磁盘只读 / 路径被同名文件占用 / 权限不足时，应用在启动阶段就挂了，且没有任何替代路径。
 *
 * 新行为：捕获后**回退到 Electron 默认目录**，并在返回值里带上 `fallbackFrom` / `fallbackError`，
 * 由 `index.ts` 记 ERROR（不让"隔离没生效"被静默吞掉）。
 *
 * 本测试不 mock `node:fs`：直接把目标目录设成「一个普通文件的子路径」，
 * `mkdirSync(..., { recursive: true })` 必然抛 ENOTDIR —— 这是真实的失败路径，而非打桩出来的。
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { applyUserDataDir } from '@main/envPaths'

const ROOT = mkdtempSync(join(tmpdir(), 'p2-mkdir-'))
const DEFAULT = join(ROOT, 'default-ud')

function fakeApp(): { getPath: () => string; setPath: ReturnType<typeof vi.fn>; isPackaged: boolean } {
  return { getPath: () => DEFAULT, setPath: vi.fn(), isPackaged: true }
}

describe('P2-MKDIR：数据目录创建失败的降级', () => {
  it('目标目录不可创建时回退到默认目录，不抛错、不 setPath，并带上失败原因', () => {
    // 用一个普通文件占位，令 `<file>/child` 无法作为目录创建（ENOTDIR）
    const blocker = join(ROOT, 'blocker.txt')
    writeFileSync(blocker, 'x', 'utf8')
    const bad = join(blocker, 'child')

    const app = fakeApp()
    const res = applyUserDataDir(app, [], { STUDIO_USER_DATA: bad })

    expect(res.dir).toBe(DEFAULT)
    expect(res.source).toBe('prod')
    expect(res.fallbackFrom).toBe(bad)
    expect(String(res.fallbackError)).toContain('ENOTDIR')
    // 关键：不能把默认目录"假装"成隔离目录设置进去
    expect(app.setPath).not.toHaveBeenCalled()
  })

  it('正常情况下（目录可创建）不受影响：照常 setPath，且不带 fallback 字段', () => {
    const ok = join(ROOT, 'ok-ud')
    const app = fakeApp()
    const res = applyUserDataDir(app, [], { STUDIO_USER_DATA: ok })

    expect(res.dir).toBe(ok)
    expect(res.source).toBe('env')
    expect(res.fallbackError).toBeUndefined()
    expect(app.setPath).toHaveBeenCalledWith('userData', ok)
  })
})
