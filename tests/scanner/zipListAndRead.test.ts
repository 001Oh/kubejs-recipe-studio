import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listAndRead, listEntries, readMany } from '@main/scanner/zip'
import { buildZip, writeJar } from '../helpers/zipWriter'
import { cleanupTmp } from '../helpers/cleanup'

/**
 * P-OPT4-S1：listAndRead 单次遍历 API 的单元/集成测试。
 * 全部使用真实临时 ZIP 文件（不 mock yauzl），覆盖正常、缺失、损坏、取消与资源释放。
 */
const TMP = `${process.cwd()}/.vitest-tmp/pc-opt4s1-${process.pid}-${Date.now()}`
let seq = 0

function newJar(entries: Parameters<typeof buildZip>[0]): string {
  seq += 1
  return writeJar(join(TMP, `jar-${seq}.jar`), entries)
}

beforeEach(async () => {
  await fsp.mkdir(TMP, { recursive: true })
})

/** 句柄已释放的**真实**证据：Windows 上被占用的文件无法 rename，且 rename 不受 safe-delete 守卫影响 */
async function expectReleased(jar: string): Promise<void> {
  const moved = `${jar}.released-${Date.now()}`
  await expect(fsp.rename(jar, moved)).resolves.toBeUndefined()
  expect((await fsp.stat(moved)).size).toBeGreaterThan(0)
}

afterEach(() => {
  cleanupTmp(TMP)
})

describe('P-OPT4-S1 listAndRead', () => {
  it('一次遍历同时返回条目清单与命中内容', async () => {
    const jar = newJar([
      { name: 'assets/demo/lang/zh_cn.json', data: '{"a":"甲"}' },
      { name: 'assets/demo/models/item/a.json', data: '{"parent":"x"}' },
      { name: 'assets/demo/textures/item/a.png', data: Buffer.from([1, 2, 3, 4]) },
      { name: 'data/demo/recipes/a.json', data: '{"type":"x"}' }
    ])
    const res = await listAndRead(jar, { matcher: (name) => name.includes('/models/') || name.endsWith('.png') })

    expect(res.entries.map((e) => e.fileName)).toEqual([
      'assets/demo/lang/zh_cn.json',
      'assets/demo/models/item/a.json',
      'assets/demo/textures/item/a.png',
      'data/demo/recipes/a.json'
    ])
    expect([...res.buffers.keys()]).toEqual(['assets/demo/models/item/a.json', 'assets/demo/textures/item/a.png'])
    expect(res.buffers.get('assets/demo/models/item/a.json')?.toString('utf8')).toBe('{"parent":"x"}')
    expect([...(res.buffers.get('assets/demo/textures/item/a.png') ?? [])]).toEqual([1, 2, 3, 4])
  })

  it('条目清单与 listEntries 完全一致（含顺序与大小）', async () => {
    const jar = newJar([
      { name: 'b.txt', data: 'bb' },
      { name: 'a/c.txt', data: 'ccc' },
      { name: 'a/d.bin', data: Buffer.alloc(9, 7) }
    ])
    const listed = await listEntries(jar)
    const res = await listAndRead(jar, { matcher: () => false })
    expect(res.entries).toEqual(listed.entries)
    expect(res.buffers.size).toBe(0)
  })

  it('没有命中任何条目时只返回清单', async () => {
    const jar = newJar([{ name: 'x.txt', data: 'x' }])
    const res = await listAndRead(jar, { matcher: () => false })
    expect(res.entries).toHaveLength(1)
    expect(res.buffers.size).toBe(0)
  })

  it('请求不存在的条目：不抛错、不产生 buffer', async () => {
    const jar = newJar([{ name: 'x.txt', data: 'x' }])
    const res = await listAndRead(jar, { matcher: (name) => name === 'nope.txt' })
    expect(res.entries.map((e) => e.fileName)).toEqual(['x.txt'])
    expect(res.buffers.has('nope.txt')).toBe(false)
  })

  it('重复条目名：两条都进清单，buffer 以最后一次为准（与 readMany 一致）', async () => {
    const jar = newJar([
      { name: 'dup.txt', data: 'v1' },
      { name: 'other.txt', data: 'o' },
      { name: 'dup.txt', data: 'v2' }
    ])
    const res = await listAndRead(jar, { matcher: (name) => name === 'dup.txt' })
    expect(res.entries.filter((e) => e.fileName === 'dup.txt')).toHaveLength(2)
    expect(res.buffers.get('dup.txt')?.toString('utf8')).toBe('v2')
  })

  it('目录条目被排除，也不会传给 matcher', async () => {
    const jar = newJar([
      { name: 'assets/', data: '' },
      { name: 'assets/a.txt', data: 'a' }
    ])
    const seen: string[] = []
    const res = await listAndRead(jar, {
      matcher: (name) => {
        seen.push(name)
        return true
      }
    })
    expect(res.entries.map((e) => e.fileName)).toEqual(['assets/a.txt'])
    expect(seen).toEqual(['assets/a.txt'])
  })

  it('条目读取失败时整体 reject，不返回部分结果', async () => {
    const text = 'a'.repeat(4096) // 高度可压缩 → 一定会走 deflate
    const buf = buildZip([
      { name: 'ok.txt', data: 'fine' },
      { name: 'broken.txt', data: text }
    ])
    // 篡改中央目录里 broken.txt 的 uncompressedSize（声明 10，实际 4096）：
    // yauzl 默认 validateEntrySizes，会在流结束时抛「too many bytes」，这是真实的读取错误路径
    const eocd = buf.length - 22
    let central = buf.readUInt32LE(eocd + 16)
    for (let i = 0; i < 2; i += 1) {
      const nameLen = buf.readUInt16LE(central + 28)
      const extraLen = buf.readUInt16LE(central + 30)
      const commentLen = buf.readUInt16LE(central + 32)
      const name = buf.subarray(central + 46, central + 46 + nameLen).toString('utf8')
      if (name === 'broken.txt') {
        buf.writeUInt32LE(10, central + 24)
        break
      }
      central += 46 + nameLen + extraLen + commentLen
    }
    const jar = join(TMP, 'broken.jar')
    await fsp.writeFile(jar, buf)

    const err = (await listAndRead(jar, { matcher: (n) => n === 'broken.txt' }).catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('broken.txt')
    // 句柄已释放：文件可被重命名（无残留占用）
    await expectReleased(jar)
  })

  it('打开/枚举失败（非 zip 文件）会抛错并释放资源', async () => {
    const jar = join(TMP, 'not-a-zip.jar')
    await fsp.writeFile(jar, 'this is not a zip')
    const err = (await listAndRead(jar, { matcher: () => true }).catch((e: unknown) => e)) as Error
    expect(err.message).toContain('打开 jar 失败')
    await expectReleased(jar)
  })

  it('截断的 zip 会在枚举阶段失败', async () => {
    const full = buildZip([{ name: 'a.txt', data: 'a'.repeat(100) }])
    const jar = join(TMP, 'truncated.jar')
    await fsp.writeFile(jar, full.subarray(0, full.length - 30))
    const err = (await listAndRead(jar, { matcher: () => true }).catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(Error)
  })

  it('matcher 抛错原样传播（同一个错误对象）', async () => {
    const jar = newJar([{ name: 'a.txt', data: 'a' }])
    const boom = new Error('matcher-boom')
    const err = (await listAndRead(jar, {
      matcher: () => {
        throw boom
      }
    }).catch((e: unknown) => e)) as Error
    expect(err).toBe(boom)
    await expectReleased(jar)
  })

  it('取消：先行中止不打开文件；中途中止抛 AbortError 且不返回部分结果', async () => {
    const jar = newJar([
      { name: 'a.txt', data: 'a' },
      { name: 'b.txt', data: 'b' },
      { name: 'c.txt', data: 'c' }
    ])

    const pre = new AbortController()
    pre.abort()
    await expect(listAndRead(jar, { matcher: () => true, signal: pre.signal })).rejects.toMatchObject({
      name: 'AbortError'
    })

    const mid = new AbortController()
    let hits = 0
    const err = (await listAndRead(jar, {
      matcher: () => {
        hits += 1
        if (hits === 2) mid.abort()
        return true
      },
      signal: mid.signal
    }).catch((e: unknown) => e)) as Error
    expect(err.name).toBe('AbortError')
    await expectReleased(jar)
  })

  it('并发读取多个不同 jar', async () => {
    const jars = [0, 1, 2, 3].map((i) =>
      newJar([
        { name: `m${i}.txt`, data: `payload-${i}` },
        { name: `skip${i}.txt`, data: 'x' }
      ])
    )
    const all = await Promise.all(jars.map((jar, i) => listAndRead(jar, { matcher: (n) => n === `m${i}.txt` })))
    all.forEach((res, i) => {
      expect(res.entries).toHaveLength(2)
      expect(res.buffers.get(`m${i}.txt`)?.toString('utf8')).toBe(`payload-${i}`)
    })
  })

  it('与 readMany 的内容逐字节一致', async () => {
    const entries = [
      { name: 'assets/demo/lang/zh_cn.json', data: '{"k":"值"}' },
      { name: 'assets/demo/models/item/z.json', data: JSON.stringify({ parent: 'block/cube_all' }) },
      { name: 'assets/demo/textures/item/z.png', data: randomBytes(128) },
      { name: 'data/demo/recipes/z.json', data: '{"type":"minecraft:crafting_shaped"}' }
    ]
    const jar = newJar(entries)
    const wanted = new Set(['assets/demo/models/item/z.json', 'assets/demo/textures/item/z.png'])

    const legacy = await readMany(jar, wanted)
    const res = await listAndRead(jar, { matcher: (name) => wanted.has(name) })

    expect([...res.buffers.keys()].sort()).toEqual([...legacy.keys()].sort())
    for (const [name, buf] of legacy) {
      expect(res.buffers.get(name)?.equals(buf)).toBe(true)
    }
  })
})
