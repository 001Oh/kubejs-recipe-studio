/**
 * P2-B：环境数据目录隔离的纯逻辑测试。
 * 覆盖开发 / 正式 / 环境变量 / 命令行四种来源，以及"稳定不随机"的要求。
 */
import { isAbsolute, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { applyUserDataDir, devUserDataDir, hasUserDataDirSwitch, resolveUserDataDir } from '@main/envPaths'

/** 用可写的临时目录代替真实 AppData，避免测试在有权限限制的路径上 mkdir */
const DEFAULT = join(process.cwd(), '.vitest-tmp', `p2-env-${process.pid}`, 'ud')

function fakeApp(overrides: { defaultDir?: string; isPackaged: boolean }): {
  getPath: () => string
  setPath: ReturnType<typeof vi.fn>
  isPackaged: boolean
} {
  return {
    getPath: () => overrides.defaultDir ?? DEFAULT,
    setPath: vi.fn(),
    isPackaged: overrides.isPackaged
  }
}

describe('P2-B 数据目录解析', () => {
  it('正式安装版沿用默认目录（不改变既有用户数据位置）', () => {
    const r = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: true })
    expect(r).toEqual({ dir: DEFAULT, source: 'prod' })
  })

  it('开发态使用 <默认>-dev，且与正式目录不同', () => {
    const r = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: false })
    expect(r.source).toBe('dev')
    expect(r.dir).toBe(devUserDataDir(DEFAULT))
    expect(r.dir).not.toBe(DEFAULT)
    expect(r.dir.endsWith('-dev')).toBe(true)
  })

  it('开发态目录稳定：连续两次解析结果一致（不随机）', () => {
    const a = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: false })
    const b = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: false })
    expect(a).toEqual(b)
  })

  it('STUDIO_USER_DATA 优先于环境判定，且支持相对路径', () => {
    const envDir = join(process.cwd(), '.vitest-tmp', `p2-env-${process.pid}`, 'from-env')
    const abs = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: false, envDir })
    expect(abs).toEqual({ dir: envDir, source: 'env' })

    const rel = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: false, envDir: 'rel/dir', cwd: 'E:/work' })
    expect(rel.source).toBe('env')
    expect(isAbsolute(rel.dir)).toBe(true)
    expect(rel.dir.replace(/\\/g, '/')).toContain('rel/dir')
  })

  it('显式 --user-data-dir 时不再追加 -dev（保持 E2E 与调试行为）', () => {
    const cliDir = join(process.cwd(), '.vitest-tmp', `p2-env-${process.pid}`, 'cli-ud')
    const r = resolveUserDataDir({ defaultDir: cliDir, isPackaged: false, cliUserDataDir: true })
    expect(r).toEqual({ dir: cliDir, source: 'cli' })
  })

  it('空白的环境变量被忽略，回落到环境判定', () => {
    const r = resolveUserDataDir({ defaultDir: DEFAULT, isPackaged: true, envDir: '   ' })
    expect(r.source).toBe('prod')
  })

  it('识别 --user-data-dir 的两种写法', () => {
    expect(hasUserDataDirSwitch(['electron', '.', '--user-data-dir=E:/x'])).toBe(true)
    expect(hasUserDataDirSwitch(['electron', '--user-data-dir', 'E:/x'])).toBe(true)
    expect(hasUserDataDirSwitch(['electron', '.'])).toBe(false)
    expect(hasUserDataDirSwitch(['electron', '--user-data-directory=x'])).toBe(false)
  })
})

describe('P2-B applyUserDataDir 副作用', () => {
  it('开发态会 setPath 到 -dev 目录', () => {
    const app = fakeApp({ isPackaged: false })
    const r = applyUserDataDir(app, ['electron', '.'], {})
    expect(r.source).toBe('dev')
    expect(app.setPath).toHaveBeenCalledWith('userData', devUserDataDir(DEFAULT))
  })

  it('正式版不调用 setPath（保持 Electron 默认）', () => {
    const app = fakeApp({ isPackaged: true })
    const r = applyUserDataDir(app, ['kubejs-recipe-studio.exe'], {})
    expect(r.source).toBe('prod')
    expect(app.setPath).not.toHaveBeenCalled()
  })

  it('测试用 STUDIO_USER_DATA 会 setPath 到指定目录', () => {
    const app = fakeApp({ isPackaged: true })
    const envDir = join(process.cwd(), '.vitest-tmp', `p2-env-${process.pid}`, 'e2e-ud')
    const r = applyUserDataDir(app, ['x'], { STUDIO_USER_DATA: envDir })
    expect(r).toEqual({ dir: envDir, source: 'env' })
    expect(app.setPath).toHaveBeenCalledWith('userData', envDir)
  })
})
