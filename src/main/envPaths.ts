/**
 * P2：运行环境数据目录隔离。
 *
 * 目标：开发态（`electron .` / electron-vite dev）与正式安装版不再共用同一个 userData ——
 * 否则单实例锁会互相抢占（P1-R1），缓存、uiState、备份也可能串环境。
 *
 * 解析优先级（第一条命中即用）：
 *   1. `STUDIO_USER_DATA` 环境变量 —— 自动化测试/调试显式指定
 *   2. 命令行 `--user-data-dir=…` —— 既有 E2E 脚本依赖 Chromium 原生开关
 *   3. 开发态（`app.isPackaged === false`）→ `<默认 userData>-dev`（稳定，不随机）
 *   4. 正式安装版 → 默认 userData（**保持原位置不变**，兼容既有用户数据）
 *
 * 时序要求：必须在 `app.whenReady()`、`app.requestSingleInstanceLock()` 以及任何
 * `app.getPath('userData')` 之前调用 `applyUserDataDir()`（单实例锁文件就在 userData 下）。
 */
import { mkdirSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

export const DEV_SUFFIX = '-dev'

export type UserDataSource = 'env' | 'cli' | 'dev' | 'prod'

export interface ResolvedUserData {
  dir: string
  source: UserDataSource
  /** P2-MKDIR：目标是隔离目录但**创建失败**时，记录原目标与被回退的原因 */
  fallbackFrom?: string
  fallbackError?: string
}

export interface ResolveUserDataInput {
  /** `app.getPath('userData')` 的默认值（Electron 已应用 --user-data-dir 后的结果） */
  defaultDir: string
  isPackaged: boolean
  /** STUDIO_USER_DATA */
  envDir?: string | undefined
  /** 是否显式传了 --user-data-dir */
  cliUserDataDir?: boolean
  cwd?: string
}

/** 纯函数：便于覆盖四种来源与相对路径等边界 */
export function resolveUserDataDir(input: ResolveUserDataInput): ResolvedUserData {
  const envDir = input.envDir?.trim()
  if (envDir) {
    const dir = isAbsolute(envDir) ? envDir : resolve(input.cwd ?? process.cwd(), envDir)
    return { dir, source: 'env' }
  }
  if (input.cliUserDataDir) return { dir: input.defaultDir, source: 'cli' }
  if (!input.isPackaged) return { dir: devUserDataDir(input.defaultDir), source: 'dev' }
  return { dir: input.defaultDir, source: 'prod' }
}

/** 命令行里是否显式指定了数据目录（Chromium 原生开关，E2E 脚本在用） */
export function hasUserDataDirSwitch(argv: readonly string[]): boolean {
  return argv.some((a) => a === '--user-data-dir' || a.startsWith('--user-data-dir='))
}

export interface UserDataAppLike {
  getPath: (name: 'userData') => string
  setPath?: (name: 'userData', path: string) => void
  isPackaged: boolean
}

/**
 * 应用隔离策略。返回最终目录与来源，供启动日志记录。
 * 只有 dev / env 会 `setPath`；prod 与 cli 保持 Electron 已解析的路径不变。
 */
export function applyUserDataDir(app: UserDataAppLike, argv: readonly string[] = process.argv, env = process.env): ResolvedUserData {
  const defaultDir = app.getPath('userData')
  const resolved = resolveUserDataDir({
    defaultDir,
    isPackaged: app.isPackaged,
    envDir: env['STUDIO_USER_DATA'],
    cliUserDataDir: hasUserDataDirSwitch(argv)
  })
  if (resolved.source === 'dev' || resolved.source === 'env') {
    try {
      mkdirSync(resolved.dir, { recursive: true })
    } catch (err) {
      // P2-MKDIR：隔离目录不可创建（只读盘 / 被同名文件占用 / 权限不足）时，
      // 旧实现直接抛出 → 应用起不来。这里改为**回退到 Electron 默认目录**并保留失败原因，
      // 由调用方（index.ts）记 ERROR。故意不调用 setPath：宁可退回默认目录，
      // 也不要让一个"部分可用"的路径继续往下走。
      return {
        dir: defaultDir,
        source: 'prod',
        fallbackFrom: resolved.dir,
        fallbackError: err instanceof Error ? err.message : String(err)
      }
    }
    app.setPath?.('userData', resolved.dir)
  }
  return resolved
}

/** 开发态目录名（供测试断言）：`<默认>-dev` */
export function devUserDataDir(defaultDir: string): string {
  return `${defaultDir}${DEV_SUFFIX}`
}
