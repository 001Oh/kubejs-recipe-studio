/**
 * B126/T-32：WRITE_VERIFY_FAILED 的唯一测试覆盖。
 *
 * writeOne 的写后回读校验是「写盘后内容正确性」的最后一道防线，
 * 此前全仓零测试——本文件补齐该缺口（D-56/T-32）。
 *
 * mock 策略：vi.mock('node:fs/promises') 整体 mock + 只覆盖 readFile。
 * tamperRead 开关控制「回读时篡改内容」→ 触发 WRITE_VERIFY_FAILED。
 * 关闭时所有 fs 操作走真实实现（正常路径回归）。
 *
 * 语义注意（勿改断言）：
 * - rename 已经发生 → 磁盘上的文件内容是**写入时**的内容（mock 只篡改了读取端）；
 * - 但 WRITE_VERIFY_FAILED 的语义是「回读校验失败」，不是「文件内容一定被篡改」；
 * - 因此**不得**断言目标文件内容是否正确——那是 writeOne 之外的事。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const H = vi.hoisted(() => ({ tamperRead: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readFile: async (p: unknown, enc?: unknown) => {
      const real = await actual.readFile(p as Parameters<typeof actual.readFile>[0], enc as BufferEncoding)
      if (H.tamperRead && typeof real === 'string' && !String(p).includes('.tmp')) {
        return real + '\n/* tampered by test */'
      }
      return real
    }
  }
})

// writer 必须在 mock 声明之后 import（vitest hoist 保证 mock 先生效）
import { writeGenerated } from '../../src/main/codegen/writer'
import type { WritePayload } from '../../src/main/codegen/writer'
import type { WriteRequest } from '../../src/shared/ipc'
import type { ModpackInfo } from '../../src/shared/types'

let dir = ''
const created: string[] = []

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  dir = await mkdtemp(join(tmpdir(), 'kjs-verify-'))
  created.push(dir)
  H.tamperRead = false
})

afterEach(async () => {
  H.tamperRead = false
  for (const d of created.splice(0)) await fsp.rm(d, { recursive: true, force: true }).catch(() => undefined)
})

function modpack(): ModpackInfo {
  return {
    path: dir,
    name: 'verify-test-pack',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: null,
    kubejsVersion: null,
    modCount: 0,
    detectedFrom: [],
    modsDir: join(dir, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

function request(): WriteRequest {
  return {
    workbench: { typeId: 'test:type', layoutKind: 'single_io', values: {}, activeSlotKey: null, modifiers: {} },
    mode: 'new',
    fileName: 'demo.json',
    appendTo: null,
    channel: 'datapack-json',
    overwriteConfirmed: true,
    alternateDir: null
  }
}

function payload(): WritePayload {
  return {
    channel: 'datapack-json',
    mcVersion: '1.20.1',
    header: '',
    statements: [],
    code: '',
    datapackFiles: [{
      fileName: 'demo.json',
      relativePath: 'kubejs/data/recipe_studio/recipes/demo.json',
      json: JSON.stringify({ type: 'demo:test', result: { item: 'test:item' } }, null, 2) + '\n',
      recipeId: 'demo:test'
    }],
    namespace: 'recipe_studio'
  }
}

function opts() {
  return { modpack: modpack(), alternateDir: null }
}

describe('T-32：WRITE_VERIFY_FAILED 回读校验', () => {
  it('正常路径（tamperRead=false）：写入成功，文件内容等于写入内容', async () => {
    const result = await writeGenerated(request(), payload(), opts())
    expect(result.writtenPaths).toHaveLength(1)
    const written = await fsp.readFile(result.writtenPaths[0] as string, 'utf8')
    expect(written).toBe(payload().datapackFiles[0]?.json)
    // tmp 无残留
    const all = await fsp.readdir(dir, { recursive: true })
    expect(all.filter((f) => String(f).endsWith('.tmp'))).toEqual([])
  })

  it('tamperRead=true → WRITE_VERIFY_FAILED（回读不一致），tmp 零残留', async () => {
    H.tamperRead = true
    await expect(
      writeGenerated(request(), payload(), opts())
    ).rejects.toMatchObject({
      code: 'WRITE_VERIFY_FAILED',
      message: expect.stringContaining('写入后回读不一致')
    })
    // tmp 文件零残留（rename 已发生 → tmp 不存在；mock 只篡改了读取端）
    const all = await fsp.readdir(dir, { recursive: true })
    expect(all.filter((f) => String(f).endsWith('.tmp'))).toEqual([])
  })

  it('afterEach 复位后正常路径恢复（mock 不泄漏到下一个用例）', async () => {
    // 前一个用例的 tamperRead 已在 afterEach 复位为 false
    const result = await writeGenerated(request(), payload(), opts())
    expect(result.writtenPaths).toHaveLength(1)
    const written = await fsp.readFile(result.writtenPaths[0] as string, 'utf8')
    expect(written).toBe(payload().datapackFiles[0]?.json)
  })
})
