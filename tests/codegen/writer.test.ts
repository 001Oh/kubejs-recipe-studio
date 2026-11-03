/**
 * 写盘行为（规格 3.7 + 第六章）。**只在系统临时目录里自造的假整合包上测**，
 * 绝不触碰任何真实整合包（`os.tmpdir()` + `fs.mkdtemp`）。
 */
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WriteRequest } from '../../src/shared/ipc'
import type { WorkbenchState } from '../../src/shared/types'
import { defaultScriptFileName, describeWriteFailure, uniqueSessionName, writeGenerated, GenerationError } from '../../src/main/codegen/writer'
import { findRecipesBlockEnd, insertIntoExisting } from '../../src/main/codegen/scriptBlock'
import type { WriteOptions, WritePayload } from '../../src/main/codegen/writer'
import { CREATED_AT, field, modpack, schema, sv, workbench } from './helpers'

let root = ''
const MIXING = schema({
  id: 'create:mixing',
  modId: 'create',
  layoutKind: 'multi_io',
  emitTarget: 'event.recipes.create.mixing',
  outputs: [field('result', 'item')],
  slots: [field('ingredients', 'item', { multiple: true })]
})
const BENCH: WorkbenchState = workbench({
  typeId: 'create:mixing',
  layoutKind: 'multi_io',
  values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: [sv('item', 'minecraft:iron_ingot')] }
})

async function payloadOf(): Promise<WritePayload> {
  const { emitScript } = await import('../../src/main/codegen/emitScript')
  const emit = emitScript(MIXING, BENCH, 'kubejs-sugar', modpack({ path: root, modsDir: join(root, 'mods') }), CREATED_AT)
  return {
    channel: 'kubejs-sugar',
    mcVersion: '1.20.1',
    header: emit.header,
    statements: emit.statements,
    code: emit.code,
    datapackFiles: [],
    namespace: 'recipe_studio'
  }
}

function request(over: Partial<WriteRequest> = {}): WriteRequest {
  return {
    workbench: BENCH,
    mode: 'new',
    fileName: defaultScriptFileName(CREATED_AT),
    appendTo: null,
    channel: 'kubejs-sugar',
    overwriteConfirmed: false,
    alternateDir: null,
    ...over
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kjs-codegen-'))
  await mkdir(join(root, 'mods'), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('模式 A 写盘', () => {
  it('目录不存在时自动创建 kubejs/server_scripts 并写入文件', async () => {
    const payload = await payloadOf()
    const result = await writeGenerated(request(), payload, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null, now: CREATED_AT })
    const dir = join(root, 'kubejs', 'server_scripts')
    expect(existsSync(dir)).toBe(true)
    expect(result.writtenPaths[0]).toBe(join(dir, 'recipe_studio_20261030_214000.js'))
    expect(result.bytes).toBeGreaterThan(0)
    expect(result.message).toContain('/reload')
    const text = await readFile(result.writtenPaths[0], 'utf8')
    expect(text).toContain('ServerEvents.recipes(event => {')
    expect(text).toContain("event.recipes.create.mixing('minecraft:steel_ingot', ['minecraft:iron_ingot'])")
  })

  it('同会话多文件时间戳递加 _01', async () => {
    const payload = await payloadOf()
    const ctx = { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null as string | null, now: CREATED_AT }
    const first = await writeGenerated(request(), payload, ctx)
    const second = await writeGenerated(request(), payload, ctx)
    expect(first.writtenPaths[0].endsWith('recipe_studio_20261030_214000.js')).toBe(true)
    expect(second.writtenPaths[0].endsWith('recipe_studio_20261030_214000_01.js')).toBe(true)
    expect(uniqueSessionName('recipe_studio_20261030_214000.js', new Set(['recipe_studio_20261030_214000.js'])))
      .toBe('recipe_studio_20261030_214000_01.js')
  })

  it('用户指定的同名文件未确认覆盖时拒绝写入', async () => {
    const payload = await payloadOf()
    const dir = join(root, 'kubejs', 'server_scripts')
    await mkdir(dir, { recursive: true })
    const mine = 'my_recipes.js'
    await writeFile(join(dir, mine), '// 用户手写\n', 'utf8')
    await expect(writeGenerated(request({ fileName: mine }), payload, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null, now: CREATED_AT })).rejects.toMatchObject({
      code: 'EEXIST'
    })
    expect(await readFile(join(dir, mine), 'utf8')).toBe('// 用户手写\n')
  })

  it('确认覆盖后先备份到 .backup/<原名>.<时间戳> 再写', async () => {
    const payload = await payloadOf()
    const dir = join(root, 'kubejs', 'server_scripts')
    await mkdir(dir, { recursive: true })
    const mine = 'my_recipes.js'
    await writeFile(join(dir, mine), '// 旧内容\n', 'utf8')
    const result = await writeGenerated(request({ fileName: mine, overwriteConfirmed: true }), payload, {
      modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
      alternateDir: null,
      now: CREATED_AT
    })
    expect(result.backupPath).not.toBeNull()
    expect(result.backupPath?.includes('.backup')).toBe(true)
    expect(await readFile(result.backupPath ?? '', 'utf8')).toBe('// 旧内容\n')
    expect(await readFile(join(dir, mine), 'utf8')).toContain('ServerEvents.recipes')
  })

  it('追加模式插进已有 ServerEvents.recipes 块内，并保留原内容', async () => {
    const payload = await payloadOf()
    const dir = join(root, 'kubejs', 'server_scripts')
    await mkdir(dir, { recursive: true })
    const existing = 'existing.js'
    await writeFile(
      join(dir, existing),
      ['ServerEvents.recipes(event => {', "  event.remove({ id: 'minecraft:diamond_sword' })", '})', ''].join('\n'),
      'utf8'
    )
    const result = await writeGenerated(request({ mode: 'append', appendTo: existing, fileName: existing }), payload, {
      modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
      alternateDir: null,
      now: CREATED_AT
    })
    expect(result.appendedTo).toBe(join(dir, existing))
    const text = await readFile(join(dir, existing), 'utf8')
    expect(text).toContain("event.remove({ id: 'minecraft:diamond_sword' })")
    expect(text).toContain('event.recipes.create.mixing(')
    const braces = text.split('{').length - text.split('}').length
    expect(braces).toBe(0)
    expect(existsSync(join(dir, '.backup'))).toBe(true)
  })

  it('插不进去时另建文件并在 message 里说明', async () => {
    const payload = await payloadOf()
    const dir = join(root, 'kubejs', 'server_scripts')
    await mkdir(dir, { recursive: true })
    const weird = 'weird.js'
    await writeFile(join(dir, weird), "// 没有配方事件块\nconsole.log('hi')\n", 'utf8')
    const result = await writeGenerated(request({ mode: 'append', appendTo: weird, fileName: weird }), payload, {
      modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
      alternateDir: null,
      now: CREATED_AT
    })
    expect(result.appendedTo).toBeNull()
    expect(result.message).toContain('无法安全插入')
    expect(result.writtenPaths[0]).toContain('recipe_studio_20261030_214000_01.js')
    expect(await readFile(join(dir, weird), 'utf8')).toContain("console.log('hi')")
  })

  it('alternateDir 非空时只写该目录（不动整合包）', async () => {
    const payload = await payloadOf()
    const exportDir = join(root, 'desktop-export')
    await mkdir(exportDir, { recursive: true })
    const result = await writeGenerated(request(), payload, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: exportDir, now: CREATED_AT })
    expect(result.writtenPaths[0].startsWith(exportDir)).toBe(true)
    expect(existsSync(join(root, 'kubejs'))).toBe(false)
  })

  it('语法校验不通过一律阻止写盘（禁止事项 5）', async () => {
    const payload = await payloadOf()
    const broken: WritePayload = { ...payload, code: payload.code.replace(/\n\}\)\n$/, '\n') }
    await expect(
      writeGenerated(request(), broken, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null, now: CREATED_AT })
    ).rejects.toBeInstanceOf(GenerationError)
    expect(existsSync(join(root, 'kubejs', 'server_scripts', defaultScriptFileName(CREATED_AT)))).toBe(false)
  })
})

describe('模式 B 写盘', () => {
  it('写出 kubejs/data/<ns>/recipes/<name>.json 且 JSON 合法', async () => {
    const { emitDatapack } = await import('../../src/main/codegen/emitDatapack')
    const built = emitDatapack(MIXING, BENCH, 'recipe_studio')
    const payload: WritePayload = {
      channel: 'datapack-json',
      mcVersion: '1.20.1',
      header: '',
      statements: [],
      code: built.files[0]?.json ?? '',
      datapackFiles: built.files,
      namespace: 'recipe_studio'
    }
    const result = await writeGenerated(request({ channel: 'datapack-json' }), payload, {
      modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
      alternateDir: null,
      now: CREATED_AT
    })
    const expected = join(root, 'kubejs', 'data', 'recipe_studio', 'recipes', 'mixing_steel_ingot_1.json')
    expect(result.writtenPaths[0]).toBe(expected)
    const parsed = JSON.parse(await readFile(expected, 'utf8')) as { type?: string }
    expect(parsed.type).toBe('create:mixing')
    expect(result.message).toContain('数据包')
  })

  it('同名文件已存在且未确认覆盖时自动加序号', async () => {
    const { emitDatapack } = await import('../../src/main/codegen/emitDatapack')
    const built = emitDatapack(MIXING, BENCH, 'recipe_studio')
    const recipesDir = join(root, 'kubejs', 'data', 'recipe_studio', 'recipes')
    await mkdir(recipesDir, { recursive: true })
    await writeFile(join(recipesDir, 'mixing_steel_ingot_1.json'), '{"type":"create:mixing"}\n', 'utf8')
    const payload: WritePayload = {
      channel: 'datapack-json',
      mcVersion: '1.20.1',
      header: '',
      statements: [],
      code: built.files[0]?.json ?? '',
      datapackFiles: built.files,
      namespace: 'recipe_studio'
    }
    const result = await writeGenerated(request({ channel: 'datapack-json' }), payload, {
      modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
      alternateDir: null,
      now: CREATED_AT
    })
    expect(result.writtenPaths[0].endsWith('mixing_steel_ingot_1_1.json')).toBe(true)
  })
})

describe('错误映射与插入定位', () => {
  it('EACCES / EPERM 给出「另存到桌面」出口并保留 code', () => {
    const accces = describeWriteFailure({ code: 'EACCES' }, 'C:/pack/kubejs/server_scripts')
    expect(accces).toBeInstanceOf(GenerationError)
    expect(accces.code).toBe('EACCES')
    expect(accces.name).toBe('EACCES')
    expect(accces.message).toContain('另存到桌面')
    expect(describeWriteFailure({ code: 'ENOENT' }, 'x').message).toContain('ENOENT')
  })

  it('findRecipesBlockEnd 不被字符串里的花括号骗到', () => {
    const text = ['ServerEvents.recipes(event => {', "  event.shapeless('a', ['}']),", '})'].join('\n')
    // 返回的是闭合 `}` 的下标（len-2）；len-3 是它前面的换行
    expect(findRecipesBlockEnd(text)).toBe(text.length - 2)
    expect(insertIntoExisting(text, ["  event.remove({ id: 'x' })"]).inserted).toBe(true)
  })

  it('没有配方事件块时不插入', () => {
    const result = insertIntoExisting("console.log('no block')", ["  event.remove({ id: 'x' })"])
    expect(result.inserted).toBe(false)
    expect(result.text).toBe("console.log('no block')")
  })

  it('文件名非法字符与路径穿越被拒绝（只落到 server_scripts 内）', async () => {
    const payload = await payloadOf()
    const result = await writeGenerated(request({ fileName: '../../evil' }), payload, {
      modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
      alternateDir: null,
      now: CREATED_AT
    })
    expect(result.writtenPaths[0].startsWith(join(root, 'kubejs', 'server_scripts'))).toBe(true)
    const dirFiles = await readdir(join(root, 'kubejs', 'server_scripts'))
    expect(dirFiles.some((n) => n.endsWith('evil.js'))).toBe(true)
    expect(existsSync(join(root, 'kubejs', 'evil.js'))).toBe(false)
  })

  it('空文件名与非法字符直接报错', async () => {
    const payload = await payloadOf()
    await expect(
      writeGenerated(request({ fileName: '  ' }), payload, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null, now: CREATED_AT })
    ).rejects.toBeInstanceOf(GenerationError)
    await expect(
      writeGenerated(request({ fileName: 'a<b>c.js' }), payload, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null, now: CREATED_AT })
    ).rejects.toThrow(/非法字符/)
  })
})

describe('T-08 写盘保护（对齐 recipes:commit）', () => {
  const ctx = (): WriteOptions => ({
    modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
    alternateDir: null,
    now: CREATED_AT
  })

  it('正常写入后不留 .tmp 残留（原子写）', async () => {
    const payload = await payloadOf()
    const result = await writeGenerated(request(), payload, ctx())
    const dir = dirname(result.writtenPaths[0] as string)
    const names = await readdir(dir)
    expect(names.filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('文件名里的路径穿越被清洗，落点仍在 root 内（根校验）', async () => {
    const payload = await payloadOf()
    const outside = await mkdtemp(join(tmpdir(), 'kjs-outside-'))
    try {
      const result = await writeGenerated(request({ fileName: '../escaped.js' }), payload, {
        modpack: modpack({ path: root, modsDir: join(root, 'mods') }),
        alternateDir: outside,
        now: CREATED_AT
      })
      // sanitizeScriptName 先剥掉 `../`，inside() 是第二道防线：两者任一失效都会让这条失败
      for (const p of result.writtenPaths) {
        expect(p.startsWith(outside)).toBe(true)
        expect(existsSync(join(outside, '..', 'escaped.js'))).toBe(false)
      }
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})
