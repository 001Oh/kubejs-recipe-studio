/**
 * P3-15：commitCreateRecipe 返回的 opened 必须是完整的 OpenedRecipe。
 *
 * 旧实现用 `as unknown as OpenedRecipe` 掩盖了 schemaSource / status / raw / notes
 * 四个必填字段的缺失（并夹带一个不属于该类型的 source 字段）。这些字段在
 * 运行时确实是 undefined —— 本用例直接按 OpenedRecipe 的声明读取并断言，
 * 修复前失败、修复后通过；修复后源码删除断言由 typecheck 单独证明。
 */
import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo, RecipeRecord, SlotValue, WorkbenchState } from '@shared/types'
import type { OpenedRecipe } from '@shared/ipc'
import type { NormalizedSchema } from '@shared/schemaModel'
import { normalizeRecipe } from '@shared/normalize'
import { normalizedToDraft } from '../../src/renderer/src/store/draftBridge'
import { commitRecipe, type CommitDeps } from '@main/recipes/commitRecipe'
import { samples, schemas } from '../schema/fixtures'

const ROOT = join(process.cwd(), '.vitest-tmp')
const dirs: string[] = []
const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/p3-15-userdata-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

function modpack(path: string): ModpackInfo {
  return {
    path,
    name: 'p3-15',
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
  const dir = await fsp.mkdtemp(join(ROOT, 'p3-15-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

function record(uid: string): RecipeRecord {
  return {
    uid,
    recipeId: 'testmod:foo/bar',
    type: 'minecraft:crafting_shaped',
    outputs: [],
    inputs: [],
    source: 'jar',
    sourcePath: 'a.jar#data/testmod/recipes/foo/bar.json',
    jarPath: 'a.jar',
    entryPath: 'data/testmod/recipes/foo/bar.json',
    partial: false
  }
}

function shapedWorkbench(): { workbench: WorkbenchState; schema: NormalizedSchema } {
  const raw = samples.shaped.json
  const schema = schemas.shaped as NormalizedSchema
  const uid = 'jar:a.jar#data/testmod/recipes/foo/bar.json'
  const { normalized } = normalizeRecipe({
    raw,
    rawText: JSON.stringify(raw),
    schema,
    uid,
    source: { source: 'jar', sourcePath: 'foo.json' }
  })
  const opened: OpenedRecipe = {
    record: record(uid),
    schema,
    schemaSource: 'builtin',
    status: 'ok',
    rawKind: 'file',
    raw: { json: raw, rawText: JSON.stringify(raw) },
    normalized,
    diagnostics: [],
    notes: []
  }
  const loaded = normalizedToDraft(opened)
  if (!loaded) throw new Error('draft load failed')
  const cells = [...(loaded.workbench.values['grid'] as SlotValue[])]
  cells[4] = { kind: 'item', id: 'minecraft:emerald', count: 1 }
  return {
    workbench: { ...loaded.workbench, values: { ...loaded.workbench.values, grid: cells } },
    schema
  }
}

function createDeps(dir: string, schema: NormalizedSchema): CommitDeps {
  return {
    modpack: modpack(dir),
    select: () => ({ schema, source: 'builtin', notes: [] }),
    readText: async (p: string) => {
      try {
        return await fsp.readFile(p, 'utf8')
      } catch {
        return null
      }
    },
    writeAtomic: async (target: string, text: string, guard?: () => Promise<void>) => {
      if (guard) await guard()
      await fsp.mkdir(dirname(target), { recursive: true })
      await fsp.writeFile(target, text, 'utf8')
    },
    removeFile: async (p: string) => {
      await fsp.rm(p, { force: true })
    },
    now: () => 1_700_000_000_000
  }
}

describe('P3-15 create 分支返回完整 OpenedRecipe', () => {
  it('opened 具备 schemaSource / status / raw / notes 四字段且值与写盘内容一致（修复前全缺 → 红）', async () => {
    const dir = await tempDir()
    const { workbench, schema } = shapedWorkbench()
    const result = await commitRecipe(
      {
        uid: 'draft:new',
        mode: 'create',
        expectedRawHash: null,
        expectedSchemaId: schema.id,
        workbench,
        dirtyFields: Object.keys(workbench.values)
      },
      createDeps(dir, schema)
    )

    expect(result.mode).toBe('create')
    const saved = JSON.parse(await fsp.readFile(result.savedPath, 'utf8')) as Record<string, unknown>
    expect(result.opened.schemaSource).toBe('builtin')
    expect(result.opened.status).toBe('ok')
    expect(result.opened.raw?.rawText).toContain('"type"')
    expect(result.opened.raw?.json).toEqual(saved)
    expect(result.opened.notes).toEqual([])
    expect(result.opened.rawKind).toBe('file')
    expect(result.opened.diagnostics).toEqual([])
    expect(result.opened.normalized).not.toBeNull()
    expect(result.opened.record.uid).toBe(result.savedUid)
  })

  it('删掉类型断言后仍不含多余 source 字段（契约守卫）', async () => {
    const dir = await tempDir()
    const { workbench, schema } = shapedWorkbench()
    const result = await commitRecipe(
      {
        uid: 'draft:new',
        mode: 'create',
        expectedRawHash: null,
        expectedSchemaId: schema.id,
        workbench,
        dirtyFields: Object.keys(workbench.values)
      },
      createDeps(dir, schema)
    )
    expect(Object.prototype.hasOwnProperty.call(result.opened, 'source')).toBe(false)
  })
})
