import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo, RecipeRecord, SlotValue, WorkbenchState } from '@shared/types'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import { hashRaw } from '@shared/canonicalJson'
import { normalizeRecipe } from '@shared/normalize'
import { normalizedToDraft } from '../../src/renderer/src/store/draftBridge'
import { commitRecipe } from '@main/recipes/commitRecipe'
import { samples, schemas } from '../schema/fixtures'
import { pc2Opened, pc2samples } from '../schema/pc2Fixtures'

const ROOT = join(process.cwd(), '.vitest-tmp')
const dirs: string[] = []

// P-C6 起，覆盖前会先把原文件备份到 userData/recipe-backups；这里把 userData 指到测试临时目录
const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/pc3-userdata-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

function modpack(path: string): ModpackInfo {
  return {
    path,
    name: 'pc3',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: null,
    kubejsVersion: '2001.6.5',
    modCount: 1,
    detectedFrom: ['test'],
    modsDir: join(path, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

async function tempDir(): Promise<string> {
  await fsp.mkdir(ROOT, { recursive: true })
  const dir = await fsp.mkdtemp(join(ROOT, 'pc3-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  // 清理失败不应让用例失败（Windows 上偶发 EPERM/占用）；工作区 .vitest-tmp 可随时手工删除
  for (const dir of dirs.splice(0)) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

function record(over: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    uid: 'jar:a.jar#data/testmod/recipes/foo/bar.json',
    recipeId: 'testmod:foo/bar',
    type: 'minecraft:crafting_shaped',
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: 'a.jar#data/testmod/recipes/foo/bar.json',
    jarPath: 'a.jar',
    entryPath: 'data/testmod/recipes/foo/bar.json',
    partial: false,
    ...over
  }
}

function openedFor(
  raw: Record<string, unknown>,
  schema: NormalizedSchema,
  uid = 'jar:a.jar#data/testmod/recipes/foo/bar.json',
  type = 'minecraft:crafting_shaped'
): OpenedRecipe {
  const { normalized } = normalizeRecipe({
    raw,
    rawText: JSON.stringify(raw),
    schema,
    uid,
    source: { source: 'jar', sourcePath: 'foo.json' }
  })
  return {
    record: record({ uid, recipeId: 'testmod:foo/bar', type }),
    schema,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText: JSON.stringify(raw) },
    normalized,
    diagnostics: [],
    notes: []
  }
}

function shapedWorkbench(): { raw: Record<string, unknown>; workbench: WorkbenchState; loaded: ReturnType<typeof normalizedToDraft>; schema: NormalizedSchema } {
  const raw = samples.shaped.json
  const schema = schemas.shaped as NormalizedSchema
  const opened = openedFor(raw, schema)
  const loaded = normalizedToDraft(opened)
  if (!loaded) throw new Error('draft load failed')
  const cells = [...(loaded.workbench.values['grid'] as SlotValue[])]
  cells[4] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
  const workbench: WorkbenchState = {
    ...loaded.workbench,
    values: { ...loaded.workbench.values, grid: cells }
  }
  return { raw, workbench, loaded, schema }
}

function selectFor(schema: NormalizedSchema): () => { schema: NormalizedSchema; source: 'builtin'; notes: string[] } {
  return () => ({ schema, source: 'builtin', notes: [] })
}

function commonDeps(dir: string, raw: Record<string, unknown>, schema: NormalizedSchema, extra: Record<string, unknown> = {}) {
  return {
    modpack: modpack(dir),
    lookup: () => record(),
    readFull: async () => ({ json: raw, sourcePath: 'foo.json' }),
    select: selectFor(schema),
    upsertIndex: vi.fn(),
    ...extra
  }
}

describe('P-C3 提交：正常覆盖', () => {
  it('真实 shaped 草稿写 kubejs/data 覆盖文件，回读校验并返回新 baseline', async () => {
    const dir = await tempDir()
    const { raw, workbench, loaded, schema } = shapedWorkbench()
    const deps = commonDeps(dir, raw, schema)
    const result = await commitRecipe(
      {
        uid: record().uid,
        mode: 'overwrite',
        expectedRawHash: loaded?.meta.base?.rawHash ?? null,
        expectedSchemaId: schema.id,
        expectedSchemaRevision: schema.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      deps
    )

    const target = join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json')
    expect(result.savedPath).toBe(target)
    expect(result.savedRelativePath).toBe('kubejs/data/testmod/recipes/foo/bar.json')
    const saved = JSON.parse(await fsp.readFile(target, 'utf8')) as Record<string, unknown>
    expect(saved['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    expect(saved['result']).toEqual(raw['result'])
    expect(saved['conditions']).toEqual(raw['conditions'])
    expect(result.opened.raw?.json).toEqual(saved)
    expect(result.opened.normalized?.rawHash).toBe(hashRaw(saved))
    expect(deps.upsertIndex).toHaveBeenCalledWith('overwrite', 'testmod:foo/bar', expect.objectContaining({ uid: `file:${target.replace(/\\/g, '/')}` }))
    expect(result.savedUid).toBe(`file:${target.replace(/\\/g, '/')}`)
    expect(result.dirtyFields).toEqual(['grid'])
  })

  it('字符串 count/chance 与 fluidTag/heatRequirement 在提交后保持原始类型', async () => {
    const dir = await tempDir()
    const opened = pc2Opened('mixingChance')
    const loaded = normalizedToDraft(opened)
    if (!loaded) throw new Error('draft load failed')
    const results = [...(loaded.workbench.values['results'] as SlotValue[])]
    results[1] = { ...results[1]!, chance: 0.1 }
    const workbench: WorkbenchState = { ...loaded.workbench, values: { ...loaded.workbench.values, results } }
    const raw = pc2samples.mixingChance.json
    const rec = { ...opened.record }
    const result = await commitRecipe(
      {
        uid: rec.uid,
        mode: 'overwrite',
        expectedRawHash: opened.normalized?.rawHash ?? null,
        expectedSchemaId: opened.schema.id,
        expectedSchemaRevision: opened.schema.revision ?? 0,
        workbench,
        dirtyFields: ['results']
      },
      {
        modpack: modpack(dir),
        lookup: () => rec,
        readFull: async () => ({ json: raw, sourcePath: 'mixingChance.json' }),
        select: selectFor(opened.schema),
        upsertIndex: vi.fn()
      }
    )
    const saved = JSON.parse(await fsp.readFile(result.savedPath, 'utf8')) as {
      results: Array<Record<string, unknown>>
      ingredients: unknown
      heatRequirement: unknown
      processingTime: unknown
    }
    expect(saved.results[0]).toEqual({ item: 'minecraft:glowstone_dust', count: '2', chance: '0.35' })
    expect(saved.results[1]).toEqual({ item: 'minecraft:gold_nugget', chance: 0.1 })
    expect(saved.ingredients).toEqual(raw['ingredients'])
    expect(saved.heatRequirement).toBe('superheated')
    expect(saved.processingTime).toBe(200)
  })

  it('shapeless 真实草稿提交：材料顺序/标签/产物/category 保持', async () => {
    const dir = await tempDir()
    const opened = pc2Opened('shapelessBrass')
    const loaded = normalizedToDraft(opened)
    if (!loaded) throw new Error('draft load failed')
    const ingredients = [...(loaded.workbench.values['ingredients'] as SlotValue[])]
    ingredients[1] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
    const workbench: WorkbenchState = { ...loaded.workbench, values: { ...loaded.workbench.values, ingredients } }
    const raw = pc2samples.shapelessBrass.json
    const rec = { ...opened.record }
    const result = await commitRecipe(
      {
        uid: rec.uid,
        mode: 'overwrite',
        expectedRawHash: opened.normalized?.rawHash ?? null,
        expectedSchemaId: opened.schema.id,
        expectedSchemaRevision: opened.schema.revision ?? 0,
        workbench,
        dirtyFields: ['ingredients']
      },
      {
        modpack: modpack(dir),
        lookup: () => rec,
        readFull: async () => ({ json: raw, sourcePath: 'shapeless.json' }),
        select: selectFor(opened.schema),
        upsertIndex: vi.fn()
      }
    )
    const saved = JSON.parse(await fsp.readFile(result.savedPath, 'utf8')) as {
      ingredients: unknown[]
      result: unknown
      category: unknown
    }
    expect(saved.ingredients).toEqual([
      { item: 'alltheores:copper_dust' },
      { item: 'minecraft:emerald', count: 1 },
      { item: 'alltheores:copper_dust' },
      { tag: 'forge:dusts/zinc' }
    ])
    expect(saved.result).toEqual(raw['result'])
    expect(saved.category).toBe('misc')
    expect(result.opened.normalized?.unknowns.map((u) => u.path)).toContain('$.category')
  })

  it('文件型配方原地覆盖（tmp+rename），未改字段与类型保留', async () => {
    const dir = await tempDir()
    const target = join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json')
    await fsp.mkdir(join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo'), { recursive: true })
    const raw = samples.shaped.json
    await fsp.writeFile(target, JSON.stringify(raw), 'utf8')
    const schema = schemas.shaped as NormalizedSchema
    const rec = record({ uid: `file:${target}`, source: 'datapack', sourcePath: target, jarPath: target })
    const opened = openedFor(raw, schema, rec.uid)
    const loaded = normalizedToDraft(opened)
    if (!loaded) throw new Error('draft load failed')
    const cells = [...(loaded.workbench.values['grid'] as SlotValue[])]
    cells[4] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
    const workbench: WorkbenchState = { ...loaded.workbench, values: { ...loaded.workbench.values, grid: cells } }

    const result = await commitRecipe(
      {
        uid: rec.uid,
        mode: 'overwrite',
        expectedRawHash: loaded.meta.base?.rawHash ?? null,
        expectedSchemaId: schema.id,
        expectedSchemaRevision: schema.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      { modpack: modpack(dir), lookup: () => rec, readFull: async () => ({ json: raw, sourcePath: target }), select: selectFor(schema), upsertIndex: vi.fn() }
    )
    expect(result.savedPath).toBe(target)
    const saved = JSON.parse(await fsp.readFile(target, 'utf8')) as Record<string, unknown>
    expect(saved['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
    expect(saved['conditions']).toEqual(raw['conditions'])
  })
})

describe('P-C3 提交：拒绝与失败语义', () => {
  it('基线变化：CONFLICT，且不写盘', async () => {
    const dir = await tempDir()
    const { raw, workbench, loaded, schema } = shapedWorkbench()
    const changed = { ...raw, result: { item: 'minecraft:stone' } }
    const writeAtomic = vi.fn()
    const deps = commonDeps(dir, changed, schema, { writeAtomic })
    await expect(
      commitRecipe(
        {
          uid: record().uid,
          mode: 'overwrite',
          expectedRawHash: loaded?.meta.base?.rawHash ?? null,
          expectedSchemaId: schema.id,
          expectedSchemaRevision: schema.revision ?? 0,
          workbench,
          dirtyFields: ['grid']
        },
        deps
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(writeAtomic).not.toHaveBeenCalled()
    await expect(fsp.stat(join(dir, 'kubejs'))).rejects.toThrow()
  })

  it('原始不可读 / schema 变化 / 不安全引用 / 无效脏字段 / 无修改', async () => {
    const dir = await tempDir()
    const { raw, workbench, loaded, schema } = shapedWorkbench()
    const base = {
      uid: record().uid,
      mode: 'overwrite' as const,
      expectedRawHash: loaded?.meta.base?.rawHash ?? null,
      expectedSchemaId: schema.id,
      expectedSchemaRevision: schema.revision ?? 0,
      workbench,
      dirtyFields: ['grid']
    }
    await expect(
      commitRecipe(base, {
        ...commonDeps(dir, raw, schema),
        readFull: async () => {
          throw new Error('ENOENT')
        }
      })
    ).rejects.toMatchObject({ code: 'RAW_UNREADABLE' })
    await expect(
      commitRecipe({ ...base }, { ...commonDeps(dir, raw, schema), lookup: () => record({ uid: 'jar:other#data/x.json' }) })
    ).rejects.toMatchObject({ code: 'UID_MISMATCH' })
    await expect(commitRecipe({ ...base, expectedSchemaId: 'other:schema' }, commonDeps(dir, raw, schema))).rejects.toMatchObject({
      code: 'SCHEMA_CHANGED'
    })
    await expect(commitRecipe({ ...base, dirtyFields: ['nope'] }, commonDeps(dir, raw, schema))).rejects.toMatchObject({
      code: 'INVALID_DIRTY_FIELDS'
    })
    await expect(commitRecipe({ ...base, dirtyFields: [] }, commonDeps(dir, raw, schema))).rejects.toMatchObject({ code: 'NO_CHANGES' })

    const unsafeRaw = {
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ weird: 'no-id' }, { item: 'minecraft:stick' }],
      result: { item: 'minecraft:torch' }
    }
    const unsafeSchema = schemas.shapeless as NormalizedSchema
    const unsafeOpened = openedFor(unsafeRaw, unsafeSchema, 'jar:u#data/x/recipes/y.json', 'minecraft:crafting_shapeless')
    const unsafeLoaded = normalizedToDraft(unsafeOpened)
    if (!unsafeLoaded) throw new Error('unsafe load failed')
    const unsafeRec = record({ uid: unsafeOpened.record.uid, recipeId: 'x:y', type: unsafeOpened.record.type })
    await expect(
      commitRecipe(
        {
          uid: unsafeRec.uid,
          mode: 'overwrite',
          expectedRawHash: hashRaw(unsafeRaw),
          expectedSchemaId: unsafeSchema.id,
          expectedSchemaRevision: unsafeSchema.revision ?? 0,
          workbench: unsafeLoaded.workbench,
          dirtyFields: ['result']
        },
        { modpack: modpack(dir), lookup: () => unsafeRec, readFull: async () => ({ json: unsafeRaw, sourcePath: 'y.json' }), select: selectFor(unsafeSchema), upsertIndex: vi.fn() }
      )
    ).rejects.toMatchObject({ code: 'UNSAFE' })
  })

  it('目标已存在（jar 覆盖路径）时拒绝静默覆盖', async () => {
    const dir = await tempDir()
    const { raw, workbench, loaded, schema } = shapedWorkbench()
    const target = join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json')
    await fsp.mkdir(join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo'), { recursive: true })
    await fsp.writeFile(target, '{"type":"existing"}', 'utf8')
    await expect(
      commitRecipe(
        {
          uid: record().uid,
          mode: 'overwrite',
          expectedRawHash: loaded?.meta.base?.rawHash ?? null,
          expectedSchemaId: schema.id,
          expectedSchemaRevision: schema.revision ?? 0,
          workbench,
          dirtyFields: ['grid']
        },
        commonDeps(dir, raw, schema)
      )
    ).rejects.toMatchObject({ code: 'TARGET_EXISTS' })
  })

  it('写入异常：SAVE_FAILED，不调用索引更新，目标不存在', async () => {
    const dir = await tempDir()
    const { raw, workbench, loaded, schema } = shapedWorkbench()
    const deps = commonDeps(dir, raw, schema, {
      writeAtomic: async () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      }
    })
    await expect(
      commitRecipe(
        {
          uid: record().uid,
          mode: 'overwrite',
          expectedRawHash: loaded?.meta.base?.rawHash ?? null,
          expectedSchemaId: schema.id,
          expectedSchemaRevision: schema.revision ?? 0,
          workbench,
          dirtyFields: ['grid']
        },
        deps
      )
    ).rejects.toMatchObject({ code: 'SAVE_FAILED' })
    expect(deps.upsertIndex).not.toHaveBeenCalled()
    await expect(fsp.stat(join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json'))).rejects.toThrow()
  })

  it('保存后回读不一致：SAVE_VERIFY_FAILED、不更新索引、按原内容回滚（删除新文件）', async () => {
    const dir = await tempDir()
    const { raw, workbench, loaded, schema } = shapedWorkbench()
    const target = join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json')
    // 确定性制造「回读内容与写入内容不一致」：不改 writer，只让第 3 次 readText（写后回读）返回被篡改的文本。
    // 这样 writer 与回滚走真实文件系统，不依赖「删除一定成功」（并行/带守卫的宿主里删除会被拦）。
    const realRead = async (p: string): Promise<string | null> => {
      try {
        return await fsp.readFile(p, 'utf8')
      } catch {
        return null
      }
    }
    let reads = 0
    const removeFile = vi.fn(async (p: string) => {
      await fsp.rm(p, { force: true })
    })
    const deps = commonDeps(dir, raw, schema, {
      readText: async (p: string) => {
        reads += 1
        // jar 源路径比文件型多一次「目标是否已存在」读取：previous(1) → existing(2) → guard(3) → readBack(4)
        if (reads === 4) return '{"type":"tampered"}'
        return realRead(p)
      },
      removeFile
    })
    await expect(
      commitRecipe(
        {
          uid: record().uid,
          mode: 'overwrite',
          expectedRawHash: loaded?.meta.base?.rawHash ?? null,
          expectedSchemaId: schema.id,
          expectedSchemaRevision: schema.revision ?? 0,
          workbench,
          dirtyFields: ['grid']
        },
        deps
      )
    ).rejects.toMatchObject({ code: 'SAVE_VERIFY_FAILED' })
    expect(deps.upsertIndex).not.toHaveBeenCalled()
    // 回滚被触发（基线为空 → 删除新文件）
    expect(removeFile).toHaveBeenCalledWith(target)
    // 回滚后磁盘上不应留下「被篡改」的内容：要么不存在，要么是本次写入的合法 JSON
    const left = await realRead(target)
    if (left !== null) expect(JSON.parse(left)).toMatchObject({ type: 'minecraft:crafting_shaped' })
  })

  it('文件型覆盖的回读失败会恢复旧文件内容', async () => {
    const dir = await tempDir()
    const target = join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo', 'bar.json')
    await fsp.mkdir(join(dir, 'kubejs', 'data', 'testmod', 'recipes', 'foo'), { recursive: true })
    const raw = samples.shaped.json
    const originalText = JSON.stringify(raw)
    await fsp.writeFile(target, originalText, 'utf8')
    const schema = schemas.shaped as NormalizedSchema
    const rec = record({ uid: `file:${target}`, source: 'datapack', sourcePath: target, jarPath: target })
    const opened = openedFor(raw, schema, rec.uid)
    const loaded = normalizedToDraft(opened)
    if (!loaded) throw new Error('draft load failed')
    const cells = [...(loaded.workbench.values['grid'] as SlotValue[])]
    cells[4] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
    const workbench: WorkbenchState = { ...loaded.workbench, values: { ...loaded.workbench.values, grid: cells } }
    let calls = 0
    const upsertIndex = vi.fn()
    await expect(
      commitRecipe(
        {
          uid: rec.uid,
          mode: 'overwrite',
          expectedRawHash: loaded.meta.base?.rawHash ?? null,
          expectedSchemaId: schema.id,
          expectedSchemaRevision: schema.revision ?? 0,
          workbench,
          dirtyFields: ['grid']
        },
        {
          modpack: modpack(dir),
          lookup: () => rec,
          readFull: async () => ({ json: raw, sourcePath: target }),
          select: selectFor(schema),
          upsertIndex,
          // 第一次写坏内容，验证失败后的回滚用真实写入恢复旧值
          writeAtomic: async (p, text) => {
            calls += 1
            await fsp.writeFile(p, calls === 1 ? '{"type":"broken"}' : text, 'utf8')
          }
        }
      )
    ).rejects.toMatchObject({ code: 'SAVE_VERIFY_FAILED' })
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(upsertIndex).not.toHaveBeenCalled()
    expect(JSON.parse(await fsp.readFile(target, 'utf8'))).toEqual(raw)
  })

  it('另存副本：写新 path、不覆盖原配方，索引按新增处理', async () => {
    const dir = await tempDir()
    const { raw, workbench, schema } = shapedWorkbench()
    const deps = commonDeps(dir, raw, schema)
    const result = await commitRecipe(
      {
        uid: record().uid,
        mode: 'copy',
        expectedRawHash: null,
        expectedSchemaId: schema.id,
        expectedSchemaRevision: schema.revision ?? 0,
        workbench,
        dirtyFields: ['grid']
      },
      deps
    )
    expect(result.mode).toBe('copy')
    expect(result.savedRelativePath.startsWith('kubejs/data/recipe_studio/recipes/')).toBe(true)
    expect(result.recipeId.startsWith('recipe_studio:')).toBe(true)
    expect(result.savedPath).not.toContain('data/testmod/recipes/foo/bar.json')
    expect(deps.upsertIndex).toHaveBeenCalledWith('copy', 'testmod:foo/bar', expect.objectContaining({ recipeId: result.recipeId }))
    const saved = JSON.parse(await fsp.readFile(result.savedPath, 'utf8')) as Record<string, unknown>
    expect(saved['pattern']).toEqual(['I#I', 'IBI', 'PPP'])
  })
})
