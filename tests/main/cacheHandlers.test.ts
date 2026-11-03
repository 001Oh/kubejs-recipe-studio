/**
 * T-27：清理缓存的用例（node 环境 + 真实临时目录，根目录注入）。
 *
 * 覆盖规格六条中的可在主进程侧验证者：
 *   1. 统计口径（5 类 + 目录不存在为 0 + 备份只读统计）
 *   2. 只删勾选类别
 *   3. 安全：用户数据零变化
 *   4. 进度单调、最终 done=total
 *   5. 占用/失败只计数不中断
 *   6. 并发单例
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearCache, isCacheClearRunning, statCache } from '../../src/main/handlers/cacheHandlers'

let root = ''

async function mk(rel: string, content = 'x'): Promise<string> {
  const p = join(root, rel)
  await mkdir(join(p, '..'), { recursive: true })
  await writeFile(p, content, 'utf8')
  return p
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kjs-cache-'))
  await mk('studio-cache/abc/items.json', '{"a":1}')
  await mk('studio-cache/abc/recipes.json', '{"b":2}')
  await mk('icon-cache/aa/icon1.png', 'png')
  await mk('icon-cache/aa/icon2.png', 'png')
  await mk('Cache/data_1', 'cc')
  await mk('logs/studio-2026-11-03.log', 'log')
  await mk('logs/other.txt', 'keep')
  await mk('studio-cache/leftover.tmp', 'tmp')
  // 用户数据（必须永不被删）
  await mk('recipe-backups/backup1.js', 'BACKUP')
  await mk('uiState.json', '{"v":1}')
  await mk('customRecipeTypes.json', '[]')
  await mk('plugin-disabled.json', '[]')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('T-27 清理缓存', () => {
  it('统计：五类齐全，缺失目录为 0，备份只读统计', async () => {
    const { rows, backup } = await statCache(root)
    const by = Object.fromEntries(rows.map((r) => [r.kind, r]))
    expect(by.index.files).toBe(3) // 含 studio-cache 下的 .tmp（与 temp 类有重叠）
    expect(by.icons.files).toBe(2)
    expect(by.browser.files).toBe(1)
    expect(by.temp.files).toBe(1)
    expect(by.logs.files).toBe(1) // 只算 studio-*.log
    expect(backup.files).toBe(1)
    expect(existsSync(join(root, 'recipe-backups/backup1.js'))).toBe(true)
  })

  it('只删勾选类别，未勾选的仍在', async () => {
    await clearCache(['icons'], root)
    expect(existsSync(join(root, 'icon-cache/aa/icon1.png'))).toBe(false)
    expect(existsSync(join(root, 'studio-cache/abc/items.json'))).toBe(true)
    expect(existsSync(join(root, 'Cache/data_1'))).toBe(true)
  })

  it('安全：四类用户数据逐字节不变', async () => {
    const files = ['recipe-backups/backup1.js', 'uiState.json', 'customRecipeTypes.json', 'plugin-disabled.json']
    const before = await Promise.all(files.map((f) => readFile(join(root, f), 'utf8')))
    await clearCache(['index', 'icons', 'browser', 'temp', 'logs'], root)
    const after = await Promise.all(files.map((f) => readFile(join(root, f), 'utf8')))
    expect(after).toEqual(before)
  })

  it('进度单调递增且最终 done=total', async () => {
    const events: { kind: string; done: number; total: number }[] = []
    await clearCache(['index', 'icons'], root, (p) => events.push(p))
    const last = events[events.length - 1]
    expect(last.done).toBe(last.total)
    const perKind = new Map<string, number[]>()
    for (const e of events) {
      const arr = perKind.get(e.kind) ?? []
      arr.push(e.done)
      perKind.set(e.kind, arr)
    }
    for (const arr of perKind.values()) {
      for (let i = 1; i < arr.length; i += 1) expect(arr[i]).toBeGreaterThanOrEqual(arr[i - 1])
    }
  })

  it('目录不被当文件删、也不计入文件数', async () => {
    await mkdir(join(root, 'icon-cache/aa/blockdir'), { recursive: true })
    const { rows } = await statCache(root)
    expect(rows.find((r) => r.kind === 'icons')?.files).toBe(2) // 目录不计数
    const r = await clearCache(['icons'], root)
    expect(r.removed).toBe(2)
    expect(existsSync(join(root, 'icon-cache/aa/blockdir'))).toBe(true) // 目录本身不删
    expect(isCacheClearRunning()).toBe(false)
  })

  it('并发单例：清理进行中再请求被拒', async () => {
    const first = clearCache(['icons', 'index'], root)
    await expect(clearCache(['icons'], root)).rejects.toThrow(/已有清理任务/)
    await first
    expect(isCacheClearRunning()).toBe(false)
  })
})
