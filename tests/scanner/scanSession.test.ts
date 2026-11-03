/**
 * OPT4-R4（A）：取消清理的单元用例（node 环境，真实临时目录）。
 *
 * 覆盖规格四条：
 *   1. 取消清理：记录内的文件全删；
 *   2. 误删保护：不在记录里的既有文件必须仍在；
 *   3. 清理失败不中断：删不掉的路径只计数，其余继续删、不抛；
 *   4. 无会话 / 结束后调用是 no-op。
 */
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupScanSession,
  endScanSession,
  recordCacheFile,
  recordIcon,
  scanSessionSnapshot,
  startScanSession
} from '../../src/main/scanner/scanSession'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kjs-scan-session-'))
  await mkdir(join(root, 'icons'), { recursive: true })
})

afterEach(async () => {
  endScanSession()
  await rm(root, { recursive: true, force: true })
})

async function touch(name: string): Promise<string> {
  const p = join(root, 'icons', name)
  await writeFile(p, 'x', 'utf8')
  return p
}

describe('scanSession 取消清理', () => {
  it('记录内的图标在取消时被删除', async () => {
    const a = await touch('a.png')
    const b = await touch('b.png')
    startScanSession()
    recordIcon(a)
    recordIcon(b)
    const report = await cleanupScanSession()
    expect(report).toEqual({ removed: 2, failed: 0, total: 2 })
    expect(existsSync(a)).toBe(false)
    expect(existsSync(b)).toBe(false)
  })

  it('未记录的既有文件不被删除（误删保护）', async () => {
    const existing = await touch('existing.png')
    const mine = await touch('mine.png')
    startScanSession()
    recordIcon(mine)
    await cleanupScanSession()
    expect(existsSync(mine)).toBe(false)
    expect(existsSync(existing)).toBe(true)
  })

  it('单个路径删不掉时只计数，其余继续清理且不抛', async () => {
    const ok1 = await touch('ok1.png')
    const ok2 = await touch('ok2.png')
    // 目录无法被 unlink（Windows/POSIX 都会失败，且不是 ENOENT）
    const dir = join(root, 'icons', 'as-dir')
    await mkdir(dir, { recursive: true })
    startScanSession()
    recordIcon(dir)
    recordIcon(ok1)
    recordIcon(ok2)
    const report = await cleanupScanSession()
    expect(report.failed).toBe(1)
    expect(report.removed).toBe(2)
    expect(existsSync(ok1)).toBe(false)
    expect(existsSync(ok2)).toBe(false)
  })

  it('缓存文件同样被清理；无会话/已结束时为 no-op', async () => {
    const cache = await touch('recipes.json')
    startScanSession()
    recordCacheFile(cache)
    expect(scanSessionSnapshot()?.cacheFiles).toEqual([cache])
    await cleanupScanSession()
    expect(existsSync(cache)).toBe(false)
    // 会话已结束，再清理不应报错也不应影响任何东西
    const again = await cleanupScanSession()
    expect(again.total).toBe(0)
    expect(scanSessionSnapshot()).toBeNull()
    expect(await readdir(join(root, 'icons'))).toEqual([])
  })

  it('endScanSession 只丢弃记录、不删文件（完成/失败路径不清）', async () => {
    const keep = await touch('keep.png')
    startScanSession()
    recordIcon(keep)
    endScanSession()
    expect(existsSync(keep)).toBe(true)
    expect(scanSessionSnapshot()).toBeNull()
  })
})
