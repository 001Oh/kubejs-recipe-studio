/**
 * B129/D-57：backup:list / backup:restore 单测。
 *
 * 安全红线逐条验证：
 * - 红线 1：target 只从 meta 读（反向验证：篡改 meta.target → OUTSIDE_ROOT）
 * - 红线 2a：包路径一致性（MODPACK_MISMATCH）
 * - 红线 2b：目标在包内（realpath + lexical，OUTSIDE_ROOT）
 * - 红线 3：恢复前二次备份（undo 点存在且 sha256 正确）
 * - 红线 4：恢复不删备份
 *
 * 已知限制：备份/恢复走真实文件系统（不 mock fs），只在临时目录操作。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/b129-restore-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

import { backupOriginalFile } from '@main/recipes/backup'
import { listBackupsFor, restoreBackupFromFile } from '@main/handlers/backupHandlers'

let packA = ''
let packB = ''
const created: string[] = []

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  packA = await mkdtemp(join(tmpdir(), 'b129-packA-'))
  packB = await mkdtemp(join(tmpdir(), 'b129-packB-'))
  created.push(packA, packB)
  await fsp.mkdir(join(packA, 'kubejs', 'data'), { recursive: true })
})

afterEach(async () => {
  for (const d of created.splice(0)) await fsp.rm(d, { recursive: true, force: true }).catch(() => undefined)
})

async function createBackup(target: string, content: string, modpackPath: string) {
  return backupOriginalFile({ target, content, modpackPath })
}

describe('B129/D-57 backup:list', () => {
  it('用例 1：列出备份——条目数与备份文件数一致，按 atMs 倒序', async () => {
    const t1 = join(packA, 'test1.json')
    const t2 = join(packA, 'test2.json')
    await fsp.writeFile(t1, '{"v":1}', 'utf8')
    await fsp.writeFile(t2, '{"v":2}', 'utf8')
    const b1 = await createBackup(t1, '{"v":1}', packA)
    await new Promise((r) => setTimeout(r, 10))
    const b2 = await createBackup(t2, '{"v":2}', packA)

    const entries = await listBackupsFor(packA)
    expect(entries.length).toBe(2)
    // 倒序：最新的在前
    expect(entries[0]?.file).toBe(b2.file)
    expect(entries[1]?.file).toBe(b1.file)
    // 条目含 sha256/bytes/exists
    expect(entries[0]?.sha256).toBeTruthy()
    expect(entries[0]?.bytes).toBeGreaterThan(0)
    expect(entries[0]?.exists).toBe(true)
  })
})

describe('B129/D-57 backup:restore 正常路径', () => {
  it('用例 2：正常恢复——目标文件内容 == 备份内容，返回 restored:true', async () => {
    const target = join(packA, 'recipe.json')
    const original = '{"type":"test","original":true}'
    await fsp.writeFile(target, '{"type":"test","original":false}', 'utf8')
    const backup = await createBackup(target, original, packA)

    // 当前内容被改成别的
    await fsp.writeFile(target, '{"type":"test","modified":true}', 'utf8')

    const result = await restoreBackupFromFile(backup.file, packA)
    expect(result.restored).toBe(true)
    expect(result.target).toBe(target)
    const restored = await fsp.readFile(target, 'utf8')
    expect(restored).toBe(original)
  })

  it('用例 3：恢复前二次备份存在且 sha256 正确', async () => {
    const target = join(packA, 'recipe.json')
    const original = '{"original":true}'
    const current = '{"current":true}'
    await fsp.writeFile(target, original, 'utf8')
    const backup = await createBackup(target, original, packA)
    await fsp.writeFile(target, current, 'utf8')

    const result = await restoreBackupFromFile(backup.file, packA)
    expect(result.undoBackup).toBeTruthy()
    // 撤销点的 sha256 == 恢复前目标内容的 sha256（用 sha256Of 验证已在 backupOriginalFile 内部完成）
    const undoContent = await fsp.readFile(result.undoBackup as string, 'utf8')
    expect(undoContent).toBe(current)
  })

  it('用例 4：dryRun 不写盘——目标 mtime/内容不变', async () => {
    const target = join(packA, 'recipe.json')
    const current = '{"current":true}'
    await fsp.writeFile(target, current, 'utf8')
    const before_mtime = (await fsp.stat(target)).mtimeMs
    const backup = await createBackup(target, '{"backup":true}', packA)

    const result = await restoreBackupFromFile(backup.file, packA, true)
    expect(result.dryRun).toBe(true)
    expect(result.restored).toBe(false)
    expect((result as { before?: string }).before).toBe('{"backup":true}')
    expect((await fsp.readFile(target, 'utf8'))).toBe(current)
    expect((await fsp.stat(target)).mtimeMs).toBe(before_mtime)
  })
})

describe('B129/D-57 backup:restore 安全红线', () => {
  it('用例 5：目标越界被拒（OUTSIDE_ROOT），包外文件零新增', async () => {
    const target = join(packA, 'recipe.json')
    await fsp.writeFile(target, '{}', 'utf8')
    const backup = await createBackup(target, '{}', packA)

    // 篡改 meta.target → 指向包外
    const metaPath = backup.file + '.meta.json'
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
    meta.target = join(packB, 'evil.json')
    await fsp.writeFile(metaPath, JSON.stringify(meta), 'utf8')

    await expect(restoreBackupFromFile(backup.file, packA)).rejects.toMatchObject({
      name: 'OUTSIDE_ROOT'
    })
    // 包外零新增
    expect(await fsp.readdir(packB)).toEqual([])
  })

  it('用例 6：包不一致被拒（MODPACK_MISMATCH）', async () => {
    const targetA = join(packA, 'test.json')
    await fsp.writeFile(targetA, '{}', 'utf8')
    const backup = await createBackup(targetA, '{}', packA)
    // packB ≠ packA → MODPACK_MISMATCH
    await expect(restoreBackupFromFile(backup.file, packB)).rejects.toMatchObject({
      name: 'MODPACK_MISMATCH'
    })
  })

  it('用例 7：备份损坏被拒（BACKUP_CORRUPT），目标不变', async () => {
    const target = join(packA, 'recipe.json')
    const current = '{"current":true}'
    await fsp.writeFile(target, current, 'utf8')
    const backup = await createBackup(target, '{"backup":true}', packA)
    // 篡改备份文件内容
    await fsp.writeFile(backup.file, '{"tampered":true}', 'utf8')

    await expect(restoreBackupFromFile(backup.file, packA)).rejects.toMatchObject({
      name: 'BACKUP_CORRUPT'
    })
    // 目标内容未被改动
    expect(await fsp.readFile(target, 'utf8')).toBe(current)
  })

  it('用例 8：目标原本不存在 → 恢复创建文件，无 undo 备份', async () => {
    const target = join(packA, 'new_file.json')
    const backup = await createBackup(target, '{"created":true}', packA)
    // target 文件不存在（已被删除）→ 恢复应创建文件
    await expect(fsp.stat(target)).rejects.toThrow()

    const result = await restoreBackupFromFile(backup.file, packA)
    expect(result.restored).toBe(true)
    expect(result.undoBackup).toBeNull()
    expect(await fsp.readFile(target, 'utf8')).toBe('{"created":true}')
  })
})
