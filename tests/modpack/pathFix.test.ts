/**
 * 路径智能纠正（规格 3.1）：四种返回形态 + 边界。用系统临时目录造结构，测完删掉。
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import {
  NO_MODS_ERROR,
  UNREADABLE_ERROR,
  hasModsDir,
  resolveModpackRoot
} from '../../src/main/modpack/pathFix'

const created: string[] = []
const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

async function tempRoot(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `krp-${name}-`))
  created.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(created.map((d) => rm(d, { recursive: true, force: true })))
})

describe('resolveModpackRoot', () => {
  it('所选目录本身含 mods/ 时直接采用，corrected=false', async () => {
    const base = await tempRoot('direct')
    await mkdir(join(base, 'mods'), { recursive: true })
    const res = await resolveModpackRoot(base)
    expect('root' in res).toBe(true)
    if (!('root' in res)) return
    expect(norm(res.root)).toBe(norm(base))
    expect(res.corrected).toBe(false)
    expect(res.note).toBe('')
  })

  it('向下纠正一层：.minecraft/mods 唯一候选自动采用并说明', async () => {
    const base = await tempRoot('dotmc')
    await mkdir(join(base, '.minecraft', 'mods'), { recursive: true })
    await mkdir(join(base, '.minecraft', 'config'), { recursive: true })
    const res = await resolveModpackRoot(base)
    expect('root' in res).toBe(true)
    if (!('root' in res)) return
    expect(norm(res.root)).toBe(norm(join(base, '.minecraft')))
    expect(res.corrected).toBe(true)
    expect(res.note).toContain('.minecraft')
    expect(res.note).toContain('mods')
  })

  it('实例名/mods 也能纠正（唯一候选）', async () => {
    const base = await tempRoot('instance')
    await mkdir(join(base, '我的整合包', 'mods'), { recursive: true })
    await mkdir(join(base, 'logs'), { recursive: true })
    const res = await resolveModpackRoot(base)
    expect('root' in res).toBe(true)
    if (!('root' in res)) return
    expect(norm(res.root)).toBe(norm(join(base, '我的整合包')))
    expect(res.corrected).toBe(true)
  })

  it('多个候选目录时返回 candidates，不自行挑选', async () => {
    const base = await tempRoot('multi')
    for (const name of ['packB', 'packA']) await mkdir(join(base, name, 'mods'), { recursive: true })
    await mkdir(join(base, 'empty'), { recursive: true })
    const res = await resolveModpackRoot(base)
    expect('candidates' in res).toBe(true)
    if (!('candidates' in res)) return
    expect(res.candidates).toHaveLength(2)
    expect(res.candidates.map((c) => norm(c))).toEqual([norm(join(base, 'packA')), norm(join(base, 'packB'))])
    for (const c of res.candidates) expect(resolve(c)).toBe(c)
  })

  it('找不到 mods/ 时返回规格要求的中文错误原文', async () => {
    const base = await tempRoot('none')
    await mkdir(join(base, 'config'), { recursive: true })
    await writeFile(join(base, 'mods'), '这不是目录')
    const res = await resolveModpackRoot(base)
    expect(res).toEqual({ error: NO_MODS_ERROR })
    expect(res).not.toHaveProperty('root')
  })

  it('空路径 / 不存在的路径都给出中文错误，不抛异常', async () => {
    expect(await resolveModpackRoot('')).toEqual({ error: NO_MODS_ERROR })
    expect(await resolveModpackRoot('   ')).toEqual({ error: NO_MODS_ERROR })
    const missing = join(tmpdir(), 'krp-绝对不存在-12345')
    expect(await resolveModpackRoot(missing)).toEqual({ error: UNREADABLE_ERROR })
  })

  it('hasModsDir 只认真实目录', async () => {
    const base = await tempRoot('flag')
    expect(await hasModsDir(base)).toBe(false)
    await mkdir(join(base, 'mods'))
    expect(await hasModsDir(base)).toBe(true)
  })

  it('带引号的粘贴路径也能处理', async () => {
    const base = await tempRoot('quoted')
    await mkdir(join(base, 'mods'))
    const res = await resolveModpackRoot(`"${base}"`)
    expect('root' in res).toBe(true)
  })
})

const AE = 'E:/PCL/.minecraft/versions/ae'
const PCL_VERSIONS = 'E:/PCL/.minecraft/versions'

describe.skipIf(!existsSync(join(AE, 'mods')))('真实 PCL 目录（只读）', () => {
  it('实例目录本身含 mods/ → 直接采用', async () => {
    const res = await resolveModpackRoot(AE)
    expect('root' in res).toBe(true)
    if (!('root' in res)) return
    expect(res.corrected).toBe(false)
    expect(await hasModsDir(res.root)).toBe(true)
  })

  it('versions 目录 → 多个候选，交给用户选', async () => {
    const res = await resolveModpackRoot(PCL_VERSIONS)
    expect('candidates' in res).toBe(true)
    if (!('candidates' in res)) return
    expect(res.candidates.length).toBeGreaterThan(1)
    const names = res.candidates.map((c) => norm(c))
    expect(names.some((c) => c.endsWith('/ae'))).toBe(true)
    expect(names.some((c) => c.includes('baka'))).toBe(true)
  })
})
