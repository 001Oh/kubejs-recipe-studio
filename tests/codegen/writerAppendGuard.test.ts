/**
 * P3-14：追加模式 TOCTOU。appendToExisting 在 readFile 与 writeOne 之间没有任何
 * 二次校验（commitRecipe 有 TARGET_CHANGED guard，writer 没有）——外部并发修改
 * 会被静默覆盖（虽有备份）。修复：写前重读比对，不一致即放弃追加。
 * 注入方式：mock fs/promises.writeFile——备份写完后立刻在目标文件上落一笔外部改动，
 * 严格落在「读原文」与「写入」两个时点之间。
 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WriteRequest } from '../../src/shared/ipc'
import type { WorkbenchState } from '../../src/shared/types'
import { writeGenerated } from '../../src/main/codegen/writer'
import type { WritePayload } from '../../src/main/codegen/writer'
import { CREATED_AT, field, modpack, schema, sv, workbench } from './helpers'

const H = vi.hoisted(() => ({
  targetPath: null as string | null,
  mutated: false,
  externalLine: '// 外部并发改动（P3-14 注入）\n'
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    writeFile: async (path: unknown, data: unknown, options?: unknown) => {
      const res = await actual.writeFile(path as Parameters<typeof actual.writeFile>[0], data as Parameters<typeof actual.writeFile>[1], options as Parameters<typeof actual.writeFile>[2])
      // 备份文件（.backup/ 下）写完 = 已过「读原文」时点；此刻注入外部改动
      if (typeof path === 'string' && path.includes('.backup') && H.targetPath !== null && !H.mutated) {
        H.mutated = true
        const cur = await actual.readFile(H.targetPath, 'utf8')
        await actual.writeFile(H.targetPath, cur + H.externalLine, 'utf8')
      }
      return res
    }
  }
})

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

let root = ''
const ORIGINAL = "// 手写头部\nServerEvents.recipes(event => {\n})\n"

async function payloadOf(): Promise<WritePayload> {
  const { emitScript } = await import('../../src/main/codegen/emitScript')
  const emit = emitScript(MIXING, BENCH, 'kubejs-sugar', modpack({ path: root, modsDir: join(root, 'mods') }), CREATED_AT)
  return { channel: 'kubejs-sugar', mcVersion: '1.20.1', header: emit.header, statements: emit.statements, code: emit.code, datapackFiles: [], namespace: 'recipe_studio' }
}

function appendRequest(): WriteRequest {
  return {
    workbench: BENCH,
    mode: 'append',
    fileName: 'ignored.js',
    appendTo: 'my_recipes.js',
    channel: 'kubejs-sugar',
    overwriteConfirmed: false,
    alternateDir: null
  }
}

beforeEach(async () => {
  root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'kjs-append-'))
  H.targetPath = null
  H.mutated = false
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('P3-14 追加模式二次校验（TARGET_CHANGED guard）', () => {
  it('读取与写入之间文件被外部修改 → 放弃追加且外部改动原样保留（修复前被覆盖 → 红）', async () => {
    const dir = join(root, 'kubejs', 'server_scripts')
    await mkdir(dir, { recursive: true })
    const target = join(dir, 'my_recipes.js')
    await (await import('node:fs/promises')).writeFile(target, ORIGINAL, 'utf8')
    H.targetPath = target

    const payload = await payloadOf()
    await expect(
      writeGenerated(appendRequest(), payload, { modpack: modpack({ path: root, modsDir: join(root, 'mods') }), alternateDir: null, now: CREATED_AT })
    ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })

    // 外部改动必须原样保留（没有被本次追加覆盖）
    const onDisk = await readFile(target, 'utf8')
    expect(onDisk).toContain('外部并发改动')
  })
})
