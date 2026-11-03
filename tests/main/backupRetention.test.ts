/**
 * C7-F1：备份保留策略与隔离区清理。
 *
 * 验收口径（任务书 §3.3）：
 * ① 每个目标数量硬上限 **50**；
 * ② 超额时**最旧优先**移入隔离区；
 * ③ **每个目标永远保留最新一份**（即使上限被配成 0）；
 * ④ 备份与其 `.meta.json` **成对移动**；
 * ⑤ 隔离区超过 **2 天**（D-36）才永久删除——**恰好 2 天整不删**。
 *
 * 本文件直接调用 `enforceBackupRetention` / `purgeTrash`（两个函数都接受显式目录），
 * 因此不需要 electron 桩，也就不会碰到 userData。
 *
 * 本文件为**新增**，不修改任何既有测试文件。
 */
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BACKUP_KEEP_LIMIT,
  TRASH_TTL_MS,
  enforceBackupRetention,
  listBackups,
  purgeTrash
} from '@main/recipes/backupRetention'
import { cleanupTmp } from '../helpers/cleanup'

const ROOT = mkdtempSync(join(tmpdir(), 'c7f1-retention-'))

afterAll(() => {
  cleanupTmp(ROOT)
})

const DAY = 24 * 60 * 60 * 1000

/** 造一份"备份 + meta"（文件名形态与 `backupOriginalFile` 一致） */
function makeBackup(dir: string, target: string, atMs: number, idx: number): string {
  mkdirSync(dir, { recursive: true })
  const name = `${target.split(/[\\/]/).pop()}.${String(atMs)}.${String(idx).padStart(6, '0')}`
  const file = join(dir, name)
  writeFileSync(file, `content-${target}-${idx}`, 'utf8')
  writeFileSync(
    `${file}.meta.json`,
    JSON.stringify({ target, backup: file, sha256: 'x', bytes: 1, atMs, modpackPath: '/pack' }, null, 2),
    'utf8'
  )
  return file
}

function dirOf(name: string): { backupDir: string; trashDir: string } {
  const base = join(ROOT, name)
  return { backupDir: join(base, 'backups'), trashDir: join(base, 'trash') }
}

describe('C7-F1：备份保留（50 上限 + 最新保护）', () => {
  it('单目标 55 份 → 保留 50、移走最旧的 5 份', async () => {
    const { backupDir, trashDir } = dirOf('limit55')
    const target = 'E:/pack/kubejs/data/demo/recipes/a.json'
    const base = 1_700_000_000_000
    for (let i = 0; i < 55; i += 1) makeBackup(backupDir, target, base + i * 1000, i)

    const result = await enforceBackupRetention(backupDir, trashDir)
    expect(result.moved).toBe(5)
    expect(result.kept).toBe(BACKUP_KEEP_LIMIT)

    const left = await listBackups(backupDir)
    expect(left).toHaveLength(50)
    // 留下的必须是最新的 50 份：最旧一份的 atMs 应为 base + 5*1000
    const oldest = [...left].sort((a, b) => a.atMs - b.atMs)[0]
    expect(oldest.atMs).toBe(base + 5 * 1000)

    const trashed = readdirSync(trashDir).filter((n) => !n.endsWith('.meta.json'))
    expect(trashed).toHaveLength(5)
  })

  it('成对移动：隔离区里每条备份都有对应的 .meta.json', async () => {
    const { backupDir, trashDir } = dirOf('pair')
    const target = 'E:/pack/kubejs/data/demo/recipes/pair.json'
    const base = 1_700_000_000_000
    for (let i = 0; i < 6; i += 1) makeBackup(backupDir, target, base + i * 1000, i)

    await enforceBackupRetention(backupDir, trashDir, { limit: 2 })
    const names = readdirSync(trashDir)
    const files = names.filter((n) => !n.endsWith('.meta.json'))
    const metas = names.filter((n) => n.endsWith('.meta.json'))
    expect(files).toHaveLength(4)
    expect(metas).toHaveLength(4)
    for (const f of files) expect(names).toContain(`${f}.meta.json`)
  })

  it('上限配成 0 也必须保留最新一份（最新保护优先于上限）', async () => {
    const { backupDir, trashDir } = dirOf('zero')
    const target = 'E:/pack/kubejs/data/demo/recipes/z.json'
    const base = 1_700_000_000_000
    for (let i = 0; i < 3; i += 1) makeBackup(backupDir, target, base + i * 1000, i)

    const result = await enforceBackupRetention(backupDir, trashDir, { limit: 0 })
    expect(result.kept).toBe(1)
    const left = await listBackups(backupDir)
    expect(left).toHaveLength(1)
    expect(left[0].atMs).toBe(base + 2000) // 最新的那份
  })

  it('多个目标各自计数：各自 30 份都不超额，一份也不移', async () => {
    const { backupDir, trashDir } = dirOf('multi')
    const base = 1_700_000_000_000
    for (const t of ['E:/pack/a.json', 'E:/pack/b.json']) {
      for (let i = 0; i < 30; i += 1) makeBackup(backupDir, t, base + i * 1000, i)
    }
    const result = await enforceBackupRetention(backupDir, trashDir)
    expect(result.moved).toBe(0)
    expect(result.kept).toBe(60)
  })

  it('幂等：连续跑两次，第二次不再移动', async () => {
    const { backupDir, trashDir } = dirOf('idem')
    const target = 'E:/pack/kubejs/data/demo/recipes/i.json'
    const base = 1_700_000_000_000
    for (let i = 0; i < 53; i += 1) makeBackup(backupDir, target, base + i * 1000, i)

    const first = await enforceBackupRetention(backupDir, trashDir)
    const second = await enforceBackupRetention(backupDir, trashDir)
    expect(first.moved).toBe(3)
    expect(second.moved).toBe(0)
  })

  it('目录不存在时安全返回（不抛）', async () => {
    const { backupDir, trashDir } = dirOf('missing')
    const result = await enforceBackupRetention(backupDir, trashDir)
    expect(result).toEqual({ kept: 0, moved: 0 })
  })
})

describe('C7-F1：隔离区 2 天清理（D-36）', () => {
  it('恰好 2 天整：不删（边界保守）', async () => {
    const { trashDir } = dirOf('edge-eq')
    const now = 1_700_000_000_000
    makeBackup(trashDir, 'E:/pack/kubejs/data/demo/recipes/e1.json', now - TRASH_TTL_MS, 1)

    const result = await purgeTrash(trashDir, { now })
    expect(result.purged).toBe(0)
    expect(result.kept).toBe(1)
    expect(readdirSync(trashDir).filter((n) => !n.endsWith('.meta.json'))).toHaveLength(1)
  })

  it('2 天 + 1 毫秒：删除（成对删除）', async () => {
    const { trashDir } = dirOf('edge-gt')
    const now = 1_700_000_000_000
    makeBackup(trashDir, 'E:/pack/kubejs/data/demo/recipes/e2.json', now - TRASH_TTL_MS - 1, 1)

    const result = await purgeTrash(trashDir, { now })
    expect(result.purged).toBe(1)
    expect(readdirSync(trashDir)).toEqual([])
  })

  it('混合：只删过期的，未到期与刚到 2 天的都留下', async () => {
    const { trashDir } = dirOf('mixed')
    const now = 1_700_000_000_000
    makeBackup(trashDir, 'E:/a.json', now - TRASH_TTL_MS - 1, 1) // 过期
    makeBackup(trashDir, 'E:/b.json', now - TRASH_TTL_MS, 2) // 恰好 2 天
    makeBackup(trashDir, 'E:/c.json', now - DAY, 3) // 1 天

    const result = await purgeTrash(trashDir, { now })
    expect(result.purged).toBe(1)
    expect(result.kept).toBe(2)
    const files = readdirSync(trashDir).filter((n) => !n.endsWith('.meta.json'))
    expect(files).toHaveLength(2)
    expect(statSync(join(trashDir, files[0])).isFile()).toBe(true)
  })
})
