import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo, RecipeRecord, SlotValue, WorkbenchState } from '@shared/types'
import type { NormalizedSchema } from '@shared/schemaModel'
import { PILOT_SCHEMAS } from '@shared/pilotSchemas'
import { normalizeRecipe } from '@shared/normalize'
import { hashRaw } from '@shared/canonicalJson'
import { clearIndex, buildIndex, lookup, stats } from '@main/recipes/recipeIndex'
import { recipeBackupDir } from '@main/paths'
import { setCurrentModpack, setCurrentSummary } from '@main/modpack/state'
import { commitRecipe } from '@main/recipes/commitRecipe'
import { backupOriginalFile } from '@main/recipes/backup'
import { extractRecipeIo } from '@main/recipes/heuristics'
import { normalizedToDraft } from '../../src/renderer/src/store/draftBridge'
import { cleanupTmp } from '../helpers/cleanup'
import { samples } from '../schema/fixtures'

/**
 * P-C6：写入失败 / 备份 / 回滚的异常路径。
 * 全部使用真实文件系统（临时整合包目录）；故障通过注入 `writeAtomic` / `readText` / `backup` 触发，
 * 只有「原始 JSON 来源」与「schema 选择」是注入的。
 */
const H = vi.hoisted(() => ({ root: `${process.cwd()}/.vitest-tmp/pc6-${process.pid}-${Date.now()}` }))
vi.mock('electron', () => ({ app: { getPath: () => `${H.root}/userData`, getVersion: () => '0.1.0-test' } }))
const TMP = H.root
const SCHEMA = PILOT_SCHEMAS['minecraft:crafting_shaped'] as NormalizedSchema

function modpackAt(path: string): ModpackInfo {
  return {
    path,
    name: 'pc6',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: null,
    kubejsVersion: '2001.6.5',
    modCount: 0,
    detectedFrom: ['test'],
    modsDir: join(path, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

function jarRecord(): RecipeRecord {
  const heur = extractRecipeIo('minecraft:crafting_shaped', samples.shaped.json)
  return {
    uid: 'jar:a.jar#data/testmod/recipes/foo/bar.json',
    recipeId: 'testmod:foo/bar',
    type: 'minecraft:crafting_shaped',
    outputs: heur.outputs,
    inputs: heur.inputs,
    source: 'jar',
    sourcePath: 'a.jar#data/testmod/recipes/foo/bar.json',
    jarPath: 'a.jar',
    entryPath: 'data/testmod/recipes/foo/bar.json',
    partial: false
  }
}

function fileRecord(target: string): RecipeRecord {
  const base = jarRecord()
  return { ...base, uid: `file:${target}`, source: 'datapack', sourcePath: target, jarPath: target }
}

function workbenchFor(uid: string): { raw: Record<string, unknown>; workbench: WorkbenchState } {
  const raw = samples.shaped.json
  const { normalized } = normalizeRecipe({
    raw,
    rawText: JSON.stringify(raw, null, 2),
    schema: SCHEMA,
    uid,
    source: { source: 'jar', sourcePath: 'a.jar' }
  })
  const loaded = normalizedToDraft({
    record: jarRecord(),
    schema: SCHEMA,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText: JSON.stringify(raw, null, 2) },
    normalized,
    diagnostics: [],
    notes: []
  })
  if (!loaded) throw new Error('草稿建立失败')
  const cells = [...(loaded.workbench.values['grid'] as SlotValue[])]
  cells[4] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
  return { raw, workbench: { ...loaded.workbench, values: { ...loaded.workbench.values, grid: cells } } }
}

function reqFor(uid: string, raw: Record<string, unknown>, workbench: WorkbenchState) {
  return {
    uid,
    mode: 'overwrite' as const,
    expectedRawHash: hashRaw(raw),
    expectedSchemaId: SCHEMA.id,
    expectedSchemaRevision: SCHEMA.revision ?? 0,
    workbench,
    dirtyFields: ['grid']
  }
}

function baseDeps(mp: ModpackInfo, raw: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    modpack: mp,
    readFull: async () => ({ json: raw, sourcePath: 'a.jar#data/testmod/recipes/foo/bar.json' }),
    select: () => ({ schema: SCHEMA, source: 'builtin' as const, notes: [] }),
    upsertIndex: vi.fn(),
    refreshSummary: vi.fn(),
    ...extra
  }
}

async function makePack(name: string): Promise<string> {
  const pack = join(TMP, name)
  await fsp.mkdir(join(pack, 'mods'), { recursive: true })
  return pack
}

async function writeOriginalFile(pack: string): Promise<string> {
  const target = join(pack, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json')
  await fsp.mkdir(join(pack, 'kubejs', 'data', 'testmod', 'recipes', 'foo'), { recursive: true })
  await fsp.writeFile(target, JSON.stringify(samples.shaped.json, null, 2), 'utf8')
  return target
}

beforeEach(() => {
  clearIndex()
  setCurrentModpack(null)
  setCurrentSummary(null)
})

afterEach(() => {
  clearIndex()
  setCurrentModpack(null)
  setCurrentSummary(null)
})

afterEach(() => {
  cleanupTmp(TMP)
})

describe('P-C6 A：覆盖前的原文件备份', () => {
  it('覆盖已有文件前写出备份：内容等于原文、meta 指向目标、位置不在整合包内', async () => {
    const pack = await makePack('backup')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)

    const result = await commitRecipe(reqFor(`file:${target}`, raw, workbench), baseDeps(mp, raw))

    expect(result.backupCreated).toBe(true)
    const dir = recipeBackupDir(pack)
    expect(dir.startsWith(pack)).toBe(false) // 备份不落在 kubejs/data（否则会被扫描成配方）
    const files = await fsp.readdir(dir)
    const metaName = files.find((f) => f.endsWith('.meta.json'))
    expect(metaName).toBeTruthy()
    const meta = JSON.parse(await fsp.readFile(join(dir, metaName!), 'utf8')) as Record<string, unknown>
    expect(meta['target']).toBe(target)
    const backupText = await fsp.readFile(String(meta['backup']), 'utf8')
    expect(JSON.parse(backupText)).toEqual(samples.shaped.json)
    expect(meta['bytes']).toBe(Buffer.byteLength(backupText, 'utf8'))
    expect(String(meta['backup']).startsWith(pack)).toBe(false)
    // 目标文件已是新内容
    const onDisk = JSON.parse(await fsp.readFile(target, 'utf8')) as Record<string, unknown>
    expect(onDisk['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
  })

  it('备份失败：中止覆盖并报 BACKUP_FAILED，原文件与索引都不动', async () => {
    const pack = await makePack('backupfail')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    const before = await fsp.readFile(target, 'utf8')
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    const writeAtomic = vi.fn()
    const deps = baseDeps(mp, raw, {
      writeAtomic,
      backup: async () => {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
      }
    })

    await expect(commitRecipe(reqFor(`file:${target}`, raw, workbench), deps)).rejects.toMatchObject({ code: 'BACKUP_FAILED' })
    expect(writeAtomic).not.toHaveBeenCalled()
    expect(await fsp.readFile(target, 'utf8')).toBe(before)
    expect(deps.upsertIndex).not.toHaveBeenCalled()
  })

  it('新建文件（jar 源写入 kubejs/data）不需要备份，也不产生备份文件', async () => {
    const pack = await makePack('newfile')
    const mp = modpackAt(pack)
    setCurrentModpack(mp)
    buildIndex([jarRecord()])
    const { raw, workbench } = workbenchFor(jarRecord().uid)

    const result = await commitRecipe(reqFor(jarRecord().uid, raw, workbench), baseDeps(mp, raw))
    expect(result.backupCreated).toBe(false)
    await expect(fsp.readdir(recipeBackupDir(pack))).rejects.toThrow()
  })
})

  it('同一秒内重复备份不会互相覆盖（wx + 递增后缀）', async () => {
    const pack = await makePack('backup-collision')
    const target = await writeOriginalFile(pack)
    const content = await fsp.readFile(target, 'utf8')
    const at = 1_730_000_000_000
    const a = await backupOriginalFile({ target, content, modpackPath: pack, now: at })
    const b = await backupOriginalFile({ target, content, modpackPath: pack, now: at })
    expect(a.file).not.toBe(b.file)
    const files = (await fsp.readdir(recipeBackupDir(pack))).filter((f) => !f.endsWith('.meta.json'))
    expect(files.length).toBe(2)
    expect(await fsp.readFile(a.file, 'utf8')).toBe(content)
    expect(await fsp.readFile(b.file, 'utf8')).toBe(content)
  })

describe('P-C6 B：替换与回滚的故障点', () => {
  it('临时文件写入/rename 失败：SAVE_FAILED，目标保持原文，索引不更新，消息不含绝对路径', async () => {
    const pack = await makePack('savefail')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    const before = await fsp.readFile(target, 'utf8')
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    const deps = baseDeps(mp, raw, {
      writeAtomic: async () => {
        throw Object.assign(new Error(`EPERM: operation not permitted, rename '${target}'`), { code: 'EPERM' })
      }
    })

    const err = (await commitRecipe(reqFor(`file:${target}`, raw, workbench), deps).catch((e: unknown) => e)) as {
      code: string
      message: string
    }
    expect(err.code).toBe('SAVE_FAILED')
    expect(err.message).toContain('kubejs/data/testmod/recipes/foo/bar.json')
    expect(err.message).not.toContain(pack)
    expect(await fsp.readFile(target, 'utf8')).toBe(before)
    expect(deps.upsertIndex).not.toHaveBeenCalled()
  })

  it('回读不一致且回滚成功：SAVE_VERIFY_FAILED，目标恢复原文', async () => {
    const pack = await makePack('rollbackok')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    const original = await fsp.readFile(target, 'utf8')
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    let reads = 0
    const deps = baseDeps(mp, raw, {
      readText: async (p: string) => {
        reads += 1
        if (reads === 3) return '{"type":"tampered"}'
        return fsp.readFile(p, 'utf8').catch(() => null)
      }
    })

    await expect(commitRecipe(reqFor(`file:${target}`, raw, workbench), deps)).rejects.toMatchObject({
      code: 'SAVE_VERIFY_FAILED'
    })
    expect(JSON.parse(await fsp.readFile(target, 'utf8'))).toEqual(JSON.parse(original))
    expect(deps.upsertIndex).not.toHaveBeenCalled()
  })

  it('回滚也失败：SAVE_ROLLBACK_FAILED，消息说明状态不确定并给出相对路径与备份名', async () => {
    const pack = await makePack('rollbackfail')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    let reads = 0
    let writes = 0
    const deps = baseDeps(mp, raw, {
      readText: async (p: string) => {
        reads += 1
        if (reads === 3) return '{"type":"tampered"}'
        return fsp.readFile(p, 'utf8').catch(() => null)
      },
      writeAtomic: async (p: string, text: string, guard?: () => Promise<void>) => {
        writes += 1
        if (writes > 1) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
        await guard?.()
        await fsp.writeFile(p, text, 'utf8')
      }
    })

    const err = (await commitRecipe(reqFor(`file:${target}`, raw, workbench), deps).catch((e: unknown) => e)) as {
      code: string
      message: string
    }
    expect(err.code).toBe('SAVE_ROLLBACK_FAILED')
    expect(err.message).toContain('状态不确定')
    expect(err.message).toContain('kubejs/data/testmod/recipes/foo/bar.json')
    expect(err.message).toContain('原文件备份')
    expect(deps.upsertIndex).not.toHaveBeenCalled()
  })

  it('写入过程中目标被外部修改：TARGET_CHANGED，外部内容不被覆盖', async () => {
    const pack = await makePack('changed')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    const external = `${JSON.stringify({ ...samples.shaped.json, _external: true }, null, 2)}\n`
    let reads = 0
    const deps = baseDeps(mp, raw, {
      readText: async (p: string) => {
        reads += 1
        if (reads === 2) {
          // 模拟外部程序在「读原文件」之后、rename 之前改写目标
          await fsp.writeFile(p, external, 'utf8')
          return external
        }
        return fsp.readFile(p, 'utf8').catch(() => null)
      }
    })

    await expect(commitRecipe(reqFor(`file:${target}`, raw, workbench), deps)).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
    expect(await fsp.readFile(target, 'utf8')).toBe(external)
    expect(deps.upsertIndex).not.toHaveBeenCalled()
  })

  it('回读时目标被外部删除：TARGET_VANISHED，不复活旧文件', async () => {
    const pack = await makePack('vanished')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    let reads = 0
    const removeFile = vi.fn(async () => undefined)
    const deps = baseDeps(mp, raw, {
      removeFile,
      readText: async (p: string) => {
        reads += 1
        if (reads === 3) {
          await fsp.rm(p, { force: true })
          return null
        }
        return fsp.readFile(p, 'utf8').catch(() => null)
      }
    })

    await expect(commitRecipe(reqFor(`file:${target}`, raw, workbench), deps)).rejects.toMatchObject({
      code: 'TARGET_VANISHED'
    })
    await expect(fsp.stat(target)).rejects.toThrow()
    expect(removeFile).not.toHaveBeenCalled()
    expect(deps.upsertIndex).not.toHaveBeenCalled()
  })

  it('提交前基线已被外部改动：CONFLICT（回归）', async () => {
    const pack = await makePack('conflict')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    await fsp.writeFile(target, JSON.stringify({ ...samples.shaped.json, _external: 1 }, null, 2), 'utf8')
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    await expect(commitRecipe(reqFor(`file:${target}`, raw, workbench), baseDeps(mp, raw))).rejects.toMatchObject({
      code: 'CONFLICT'
    })
  })

  it('真实只读目标文件（磁盘行为，非注入）：rename 失败→SAVE_FAILED，原文不变，无临时文件残留', async () => {
    const pack = await makePack('readonly-real')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    const original = await fsp.readFile(target, 'utf8')
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    // Windows：只读属性会让 rename 覆盖失败（本机实测 EPERM）；POSIX 由目录权限决定
    await fsp.chmod(target, 0o444)
    try {
      const err = (await commitRecipe(reqFor(`file:${target}`, raw, workbench), baseDeps(mp, raw)).catch((e: unknown) => e)) as {
        code: string
        message: string
      }
      expect(err.code).toBe('SAVE_FAILED')
      expect(err.message).toContain('kubejs/data/testmod/recipes/foo/bar.json')
      expect(await fsp.readFile(target, 'utf8')).toBe(original)
      const siblings = await fsp.readdir(join(pack, 'kubejs', 'data', 'testmod', 'recipes', 'foo'))
      expect(siblings.filter((f) => f.endsWith('.tmp'))).toEqual([])
    } finally {
      await fsp.chmod(target, 0o666)
    }
  })

  it('正常提交仍然成功：备份 + 索引更新（P-C5 回归）', async () => {
    const pack = await makePack('ok')
    const mp = modpackAt(pack)
    const target = await writeOriginalFile(pack)
    setCurrentModpack(mp)
    buildIndex([fileRecord(target)])
    const { raw, workbench } = workbenchFor(`file:${target}`)
    const result = await commitRecipe(
      reqFor(`file:${target}`, raw, workbench),
      baseDeps(mp, raw, { upsertIndex: undefined })
    )
    expect(result.indexUpdated).toBe(true)
    expect(result.backupCreated).toBe(true)
    expect(stats()?.total).toBe(1)
    expect(lookup(result.savedUid)?.recipeId).toBe('testmod:foo/bar')
  })
})
