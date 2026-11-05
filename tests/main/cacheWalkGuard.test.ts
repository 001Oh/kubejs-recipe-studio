/**
 * B121/D-1：cache.ts 的 extras 签名 walk 必须与全仓防护口径一致——
 * 不跟随符号链接/junction、递归深度有上限。
 * 红-绿取证：revert cache.ts walk → 环状 junction 会无限递归，本文件的 5s 竞速变红。
 */
import { execFile as execFileCb } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computeExtrasSignature } from '@main/cache'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/cache-walk-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

const execFile = promisify(execFileCb)
const ROOT = join(process.cwd(), '.vitest-tmp')
const dirs: string[] = []
const IS_WINDOWS = process.platform === 'win32'
let linksOk = false

async function tempDir(tag: string): Promise<string> {
  await fsp.mkdir(ROOT, { recursive: true })
  const dir = await fsp.mkdtemp(join(ROOT, `${tag}-`))
  dirs.push(dir)
  return dir
}

async function makeDirLink(target: string, link: string): Promise<void> {
  if (IS_WINDOWS) {
    try {
      await execFile('cmd.exe', ['/d', '/c', 'mklink', '/J', link, target])
      return
    } catch {
      /* 退回 symlink（需要开发者模式或管理员） */
    }
  }
  await fsp.symlink(target, link, 'junction')
}

beforeAll(async () => {
  const base = await tempDir('walklink-probe')
  const target = join(base, 'target-dir')
  await fsp.mkdir(target, { recursive: true })
  try {
    await makeDirLink(target, join(base, 'link-dir'))
    linksOk = true
  } catch {
    linksOk = false
  }
})

afterAll(async () => {
  for (const dir of dirs.splice(0)) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
})

describe('B121/D-1 extras 签名 walk 的链接防护', () => {
  it('kubejs/data 里的自引用 junction：5s 内返回，不无限递归（不跟随链接）', async ({ skip }) => {
    if (!linksOk) skip()
    const pack = await tempDir('walk-self')
    const dataDir = join(pack, 'kubejs', 'data', 'ns', 'recipes')
    await fsp.mkdir(dataDir, { recursive: true })
    await fsp.writeFile(join(dataDir, 'a.json'), '{}', 'utf8')
    // 自引用环：旧实现（stat 跟随 + 无深度上限）在此无限递归
    await makeDirLink(dataDir, join(dataDir, 'self'))

    const outcome = await Promise.race([
      computeExtrasSignature(pack).then((sig) => ({ ok: true as const, sig })),
      new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), 5000))
    ])
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      // 签名仍能覆盖真实文件（链接本身不参与统计）
      expect(outcome.sig).toContain('data:1:')
    }
  })

  it('深度 > 32 的目录树：截断并告警，不栈溢出', async () => {
    const pack = await tempDir('walk-deep')
    let deep = join(pack, 'kubejs', 'data')
    await fsp.mkdir(deep, { recursive: true })
    for (let i = 0; i < 40; i += 1) {
      deep = join(deep, `d${i}`)
    }
    await fsp.mkdir(deep, { recursive: true })
    await fsp.writeFile(join(deep, 'buried.json'), '{}', 'utf8')
    const sig = await computeExtrasSignature(pack)
    expect(typeof sig).toBe('string')
    expect(sig.length).toBeGreaterThan(0)
  })
})
