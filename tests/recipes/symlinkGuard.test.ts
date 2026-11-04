/**
 * B120/E-1：符号链接防护。
 *
 * 覆盖三个面：
 * 1. 扫描端（jsonSource.walkDir / scriptSource.findScripts）：包外 junction 挂进包内
 *    → 不跟随、不收录；自引用 junction（A→A）→ 正常返回不挂死（5 s 超时保护）；
 *    深度 > 32 的目录树 → 截断并告警（logger.warn）。
 * 2. 提交端（commitRecipe overwrite + fileBacked）：源文件是指向包外的链接 →
 *    PATH_ESCAPE，且包外文件 mtime / 内容不变。
 * 3. create：`kubejs/data/recipe_studio` 本身是指向包外的 junction → PATH_ESCAPE，包外不落盘。
 *
 * Windows 用 `mklink /J`（junction 不需管理员）；非 Windows 用 `fs.symlink`；
 * 本环境完全无法创建链接时该条用测试上下文 `skip()` 跳过（不是注册新用例）。
 *
 * 红-绿取证：恢复 `E:/kjs-audit/patches-b120/E-1/*.pre-b120` 三个实现文件 →
 * 本文件「不收录 / PATH_ESCAPE / 深度截断」断言应变红；恢复实现 → 全绿。
 */
import { execFile as execFileCb } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo, RecipeRecord } from '@shared/types'
import { hashRaw } from '@shared/canonicalJson'
import { commitRecipe } from '@main/recipes/commitRecipe'
import { scanJsonRecipes } from '@main/recipes/jsonSource'
import { logger } from '@main/logger'

const execFile = promisify(execFileCb)
const ROOT = join(process.cwd(), '.vitest-tmp')
const dirs: string[] = []

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/symlink-userdata-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

const IS_WINDOWS = process.platform === 'win32'

async function tempDir(tag: string): Promise<string> {
  await fsp.mkdir(ROOT, { recursive: true })
  const dir = await fsp.mkdtemp(join(ROOT, `${tag}-`))
  dirs.push(dir)
  return dir
}

/** Windows 上 junction 不需管理员，但只支持目录；文件级逃逸用 symlink（实测本机可建）。 */
async function makeLink(target: string, link: string, kind: 'dir' | 'file'): Promise<void> {
  if (kind === 'dir' && IS_WINDOWS) {
    try {
      await execFile('cmd.exe', ['/d', '/c', 'mklink', '/J', link, target])
      return
    } catch {
      /* 退回 symlink（需要开发者模式或管理员） */
    }
  }
  await fsp.symlink(target, link, kind === 'dir' ? 'junction' : 'file')
}

let linksOk = false

beforeAll(async () => {
  const base = await tempDir('linkprobe')
  const target = join(base, 'target-dir')
  await fsp.mkdir(target, { recursive: true })
  try {
    await makeLink(target, join(base, 'link-dir'), 'dir')
    linksOk = true
  } catch {
    linksOk = false
  }
})

afterAll(async () => {
  for (const dir of dirs.splice(0)) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

function modpack(path: string): ModpackInfo {
  return {
    path,
    name: 'symlink-pc',
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

const SMELTING_JSON = {
  type: 'minecraft:smelting',
  ingredient: { item: 'minecraft:cobblestone' },
  result: { item: 'minecraft:stone' },
  cookingtime: 200
}

/** 在包内造 kubejs/data/<ns>/recipes 并返回其绝对路径 */
async function recipesDir(packDir: string, ns = 'ns'): Promise<string> {
  const dir = join(packDir, 'kubejs', 'data', ns, 'recipes')
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

describe('E-1 扫描端：不跟随符号链接', () => {
  it('包外目录 junction 挂在包内 recipes 下 → 扫描不收录其中配方', async ({ skip }) => {
    if (!linksOk) skip()
    const pack = await tempDir('symlink-scan')
    const outside = await tempDir('symlink-scan-out')
    await fsp.writeFile(join(outside, 'evil.json'), JSON.stringify(SMELTING_JSON), 'utf8')
    const dir = await recipesDir(pack)
    await makeLink(outside, join(dir, 'linked'), 'dir')

    const records = await scanJsonRecipes(modpack(pack), { isAborted: () => false })
    expect(records).toHaveLength(0)
  })

  it('自引用 junction（recipes/self → recipes）→ 正常返回且只收录一次（5 s 超时保护）', async ({ skip }) => {
    if (!linksOk) skip()
    const pack = await tempDir('symlink-self')
    const dir = await recipesDir(pack)
    await fsp.writeFile(join(dir, 'real.json'), JSON.stringify(SMELTING_JSON), 'utf8')
    await makeLink(dir, join(dir, 'self'), 'dir')

    const outcome = await Promise.race([
      scanJsonRecipes(modpack(pack), { isAborted: () => false }).then((r) => ({ ok: true as const, r })),
      new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), 5000))
    ])
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.r).toHaveLength(1)
      expect(outcome.r[0]?.record.recipeId).toBe('ns:real')
    }
  })

  it('深度 > 32 的目录树 → 截断并告警', async () => {
    const pack = await tempDir('symlink-depth')
    const dir = await recipesDir(pack)
    await fsp.writeFile(join(dir, 'shallow.json'), JSON.stringify(SMELTING_JSON), 'utf8')
    let deep = join(dir, 'deep')
    for (let i = 0; i < 40; i += 1) {
      deep = join(deep, `d${i}`)
      await fsp.mkdir(deep, { recursive: true })
    }
    await fsp.writeFile(join(deep, 'buried.json'), JSON.stringify(SMELTING_JSON), 'utf8')

    const warns: string[] = []
    const spy = vi.spyOn(logger, 'warn').mockImplementation(((...args: unknown[]) => {
      warns.push(String(args[1] ?? ''))
      return { ts: Date.now(), level: 'WARN', source: 'INDEX', message: '' }
    }) as unknown as typeof logger.warn)
    try {
      const records = await scanJsonRecipes(modpack(pack), { isAborted: () => false })
      const ids = records.map((r) => r.record.recipeId)
      expect(ids).toContain('ns:shallow')
      expect(ids.some((id) => id.includes('buried'))).toBe(false)
      expect(warns.some((w) => w.includes('32'))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('E-1 提交端：realpath 后仍须在包内', () => {
  function fileRecord(pack: string, rel: string): RecipeRecord {
    const abs = join(pack, 'kubejs', 'data', 'ns', 'recipes', rel)
    return {
      uid: `file:${abs.replace(/\\/g, '/')}`,
      recipeId: `ns:${rel.replace(/\.json$/, '')}`,
      type: 'minecraft:smelting',
      outputs: [],
      inputs: [],
      source: 'datapack',
      sourcePath: abs,
      jarPath: abs,
      entryPath: `data/ns/recipes/${rel}`,
      partial: false
    }
  }

  it('overwrite 源文件是指向包外的链接 → PATH_ESCAPE，包外文件 mtime 与内容不变', async ({ skip }) => {
    if (!linksOk) skip()
    const pack = await tempDir('symlink-commit')
    const outside = await tempDir('symlink-commit-out')
    const outsideFile = join(outside, 'evil.json')
    const text = JSON.stringify(SMELTING_JSON, null, 2)
    await fsp.writeFile(outsideFile, text, 'utf8')
    const before = await fsp.stat(outsideFile)

    const dir = await recipesDir(pack)
    await makeLink(outsideFile, join(dir, 'evil.json'), 'file')

    const record = fileRecord(pack, 'evil.json')
    await expect(
      commitRecipe(
        {
          uid: record.uid,
          mode: 'overwrite',
          expectedRawHash: hashRaw(SMELTING_JSON),
          expectedSchemaId: 'minecraft:smelting',
          expectedSchemaRevision: 1,
          workbench: {
            typeId: 'minecraft:smelting',
            layoutKind: 'single_io',
            values: { ingredient: [{ kind: 'item', id: 'minecraft:diamond' }] },
            activeSlotKey: null
          },
          dirtyFields: ['ingredient']
        },
        // 直接喂原始 JSON：本用例只验证「链接目标越界」这一道闸，不依赖 lazy 读取链的链接策略
        { modpack: modpack(pack), lookup: () => record, readFull: async () => ({ json: SMELTING_JSON, sourcePath: outsideFile }) }
      )
    ).rejects.toMatchObject({ code: 'PATH_ESCAPE' })

    const after = await fsp.stat(outsideFile)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(await fsp.readFile(outsideFile, 'utf8')).toBe(text)
  })

  it('create 的 recipe_studio 目录指向包外 → PATH_ESCAPE，包外不落任何文件', async ({ skip }) => {
    if (!linksOk) skip()
    const pack = await tempDir('symlink-create')
    const outside = await tempDir('symlink-create-out')
    const dataDir = join(pack, 'kubejs', 'data')
    await fsp.mkdir(dataDir, { recursive: true })
    await makeLink(outside, join(dataDir, 'recipe_studio'), 'dir')

    await expect(
      commitRecipe(
        {
          uid: '__new__:minecraft:smelting',
          mode: 'create',
          expectedRawHash: null,
          expectedSchemaId: 'minecraft:smelting',
          expectedSchemaRevision: 1,
          workbench: {
            typeId: 'minecraft:smelting',
            layoutKind: 'single_io',
            values: {
              ingredient: [{ kind: 'item', id: 'minecraft:cobblestone' }],
              result: [{ kind: 'item', id: 'minecraft:stone' }]
            },
            activeSlotKey: null
          },
          dirtyFields: ['ingredient', 'result']
        },
        { modpack: modpack(pack) }
      )
    ).rejects.toMatchObject({ code: 'PATH_ESCAPE' })

    expect(await fsp.readdir(outside)).toHaveLength(0)
  })
})
