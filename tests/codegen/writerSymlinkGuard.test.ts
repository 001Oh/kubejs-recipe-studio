/**
 * B120/E-1（writer 端补全）：写盘三入口（ensureScriptsDir / writeOne / backupExisting）
 * 的真实路径校验——`inside()` 只做词法判断，目录级 junction 能让 tmp+rename **整体穿过**
 * 链接落在整合包之外（委托方实测 `landedOutside:true`，REVIEW-S0-A §6.1）。
 *
 * 覆盖两个写穿面（均为目录 junction，Windows 用 `mklink /J` 不需管理员）：
 * 1. 脚本通道：`kubejs/server_scripts` 本身是指向包外的 junction → 拒写，包外零新增；
 * 2. 数据包通道：`kubejs/data/demo/recipes` 是 junction，包外已有同名文件 + 已确认覆盖 →
 *    backupExisting 在 rename 之前拒绝，包外**连 .backup/ 都不许出现**、原文件内容不变。
 *
 * 红-绿取证：revert `src/main/codegen/writer.ts` 到 0.1.18（8827659）→ 本文件两个用例变红
 * （写穿成功而非被拒）；恢复实现 → 全绿。正常路径（无链接自动建目录、正常覆盖备份）
 * 由 `writer.test.ts` 既有用例钉住，防误伤。
 */
import { execFile as execFileCb } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WriteRequest } from '../../src/shared/ipc'
import type { WorkbenchState } from '../../src/shared/types'
import { writeGenerated } from '../../src/main/codegen/writer'
import type { WritePayload } from '../../src/main/codegen/writer'
import { CREATED_AT, field, modpack, schema, sv, workbench } from './helpers'

const execFile = promisify(execFileCb)

let packRoot = ''
let outside = ''
const created: string[] = []

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

/** Windows 上 junction 不需管理员；失败则整个文件没有意义（两条用例都依赖 junction） */
async function makeJunction(target: string, link: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFile('cmd.exe', ['/d', '/c', 'mklink', '/J', link, target])
    return
  }
  await fsp.symlink(target, link, 'dir')
}

let linksOk = false

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  packRoot = await mkdtemp(join(tmpdir(), 'kjs-wlink-pack-'))
  outside = await mkdtemp(join(tmpdir(), 'kjs-wlink-out-'))
  created.push(packRoot, outside)
  await fsp.mkdir(join(packRoot, 'mods'), { recursive: true })
  try {
    const probeTarget = join(packRoot, 'probe-target')
    await fsp.mkdir(probeTarget, { recursive: true })
    await makeJunction(probeTarget, join(packRoot, 'probe-link'))
    await fsp.rm(join(packRoot, 'probe-link'), { recursive: true, force: true })
    await fsp.rm(probeTarget, { recursive: true, force: true })
    linksOk = true
  } catch {
    linksOk = false
  }
})

afterEach(async () => {
  for (const dir of created.splice(0)) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

async function scriptPayload(): Promise<WritePayload> {
  const { emitScript } = await import('../../src/main/codegen/emitScript')
  const emit = emitScript(MIXING, BENCH, 'kubejs-sugar', modpack({ path: packRoot, modsDir: join(packRoot, 'mods') }), CREATED_AT)
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

function scriptRequest(): WriteRequest {
  return {
    workbench: BENCH,
    mode: 'new',
    fileName: 'recipe_studio_test.js',
    appendTo: null,
    channel: 'kubejs-sugar',
    overwriteConfirmed: false,
    alternateDir: null
  }
}

describe('E-1 writer 端：junction 写穿被拒且包外零新增', () => {
  it('kubejs/server_scripts 是指向包外的 junction → 脚本通道拒写，包外零新增', async ({ skip }) => {
    if (!linksOk) skip()
    await fsp.mkdir(join(packRoot, 'kubejs'), { recursive: true })
    await makeJunction(outside, join(packRoot, 'kubejs', 'server_scripts'))

    await expect(
      writeGenerated(scriptRequest(), await scriptPayload(), {
        modpack: modpack({ path: packRoot, modsDir: join(packRoot, 'mods') }),
        alternateDir: null,
        now: CREATED_AT
      })
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' })

    // 包外目录必须零新增：没有脚本、没有 tmp、没有 README 提示文件
    expect(await fsp.readdir(outside)).toEqual([])
  })

  it('kubejs/data/demo/recipes 是 junction + 包外已有同名文件 + 已确认覆盖 → backupExisting 先拒，包外连 .backup 都不出现', async ({ skip }) => {
    if (!linksOk) skip()
    const original = '{\n  "type": "minecraft:smelting"\n}\n'
    await fsp.writeFile(join(outside, 'evil.json'), original, 'utf8')
    await fsp.mkdir(join(packRoot, 'kubejs', 'data', 'demo'), { recursive: true })
    await makeJunction(outside, join(packRoot, 'kubejs', 'data', 'demo', 'recipes'))

    const file = {
      fileName: 'evil.json',
      relativePath: 'kubejs/data/demo/recipes/evil.json',
      json: '{\n  "type": "minecraft:crafting_shaped"\n}\n',
      recipeId: 'demo:evil'
    }
    const payload: WritePayload = {
      channel: 'datapack-json',
      mcVersion: '1.20.1',
      header: '',
      statements: [],
      code: '',
      datapackFiles: [file],
      namespace: 'demo'
    }

    await expect(
      writeGenerated(
        {
          workbench: BENCH,
          mode: 'new',
          fileName: 'evil.json',
          appendTo: null,
          channel: 'datapack-json',
          overwriteConfirmed: true,
          alternateDir: null
        },
        payload,
        {
          modpack: modpack({ path: packRoot, modsDir: join(packRoot, 'mods') }),
          alternateDir: null,
          now: CREATED_AT
        }
      )
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' })

    // 包外只有原文件本身：没被 rename 进 .backup、没有 tmp 残留
    expect(await fsp.readdir(outside)).toEqual(['evil.json'])
    expect(await fsp.readFile(join(outside, 'evil.json'), 'utf8')).toBe(original)
  })
})
