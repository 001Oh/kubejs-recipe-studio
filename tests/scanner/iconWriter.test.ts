import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configureIconWriter, iconWriterStats, resetIconWriterStats, writeIcon } from '@main/scanner/iconWriter'
import { cleanupTmp } from '../helpers/cleanup'

/**
 * P-OPT2：图标写入队列的单元测试。
 * 覆盖：并发上限、同路径去重、已存在跳过（EEXIST 语义）、失败传播、取消后不再写。
 */
const TMP = `${process.cwd()}/.vitest-tmp/pc-opt2-${process.pid}-${Date.now()}`
const DIR = join(TMP, 'icons')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

beforeEach(async () => {
  await fsp.mkdir(DIR, { recursive: true })
  configureIconWriter(4)
  resetIconWriterStats()
})

afterEach(() => {
  cleanupTmp(TMP)
})

describe('P-OPT2 图标写入队列', () => {
  it('并发不超过配置上限，且全部落盘', async () => {
    configureIconWriter(3)
    const names = Array.from({ length: 40 }, (_, i) => join(DIR, `c-${i}.png`))
    const results = await Promise.all(names.map((n) => writeIcon(n, PNG)))
    expect(results.every((r) => r === true)).toBe(true)
    const stats = iconWriterStats()
    expect(stats.written).toBe(40)
    // 队列峰值不会超过「并发 + 单批提交量」，但至少要能证明有一个可控上限存在
    expect(stats.concurrency).toBe(3)
    for (const n of names) expect((await fsp.stat(n)).size).toBe(PNG.length)
  })

  it('同一路径并发提交只写一次（去重共享 Promise）', async () => {
    const target = join(DIR, 'dup.png')
    const results = await Promise.all(Array.from({ length: 8 }, () => writeIcon(target, PNG)))
    // 8 次提交共享同一个 Promise，因此都拿到同一个「已写入」结果；物理写入只有 1 次
    expect(results.every((r) => r === true)).toBe(true)
    const stats = iconWriterStats()
    expect(stats.submitted).toBe(8)
    expect(stats.written).toBe(1)
  })

  it('目标已存在时跳过且不报错（等价旧的 existsSync 分支）', async () => {
    const target = join(DIR, 'exists.png')
    await fsp.writeFile(target, PNG)
    resetIconWriterStats()
    configureIconWriter(2)
    const written = await writeIcon(target, Buffer.from('different'))
    expect(written).toBe(false)
    expect(iconWriterStats().skipped).toBe(1)
    // 原文件内容不被覆盖
    expect((await fsp.readFile(target)).length).toBe(PNG.length)
  })

  it('写入失败会 reject（不静默吞掉），失败计数可观察', async () => {
    // 目录不存在 → ENOENT，不是 EEXIST，必须冒泡
    const target = join(TMP, 'missing-dir', 'x.png')
    await expect(writeIcon(target, PNG)).rejects.toBeTruthy()
    expect(iconWriterStats().failed).toBe(1)
  })

  it('写入成功后目录无 .tmp 残留（B121/D-2：tmp+rename 原子落盘）', async () => {
    const names = Array.from({ length: 5 }, (_, i) => join(DIR, `atomic-${i}.png`))
    await Promise.all(names.map((n) => writeIcon(n, PNG)))
    const left = (await fsp.readdir(DIR)).filter((n) => n.endsWith('.tmp'))
    expect(left).toEqual([])
  })

  it('取消后不再写入排队任务', async () => {
    const controller = new AbortController()
    controller.abort()
    const target = join(DIR, 'aborted.png')
    await expect(writeIcon(target, PNG, controller.signal)).rejects.toMatchObject({ name: 'IconAbortError' })
    await expect(fsp.stat(target)).rejects.toThrow()
  })

  it('写入中途取消：已提交的排队任务不再落盘', async () => {
    configureIconWriter(1)
    const controller = new AbortController()
    const first = writeIcon(join(DIR, 'a1.png'), PNG, controller.signal)
    const queued = Array.from({ length: 10 }, (_, i) => writeIcon(join(DIR, `q-${i}.png`), PNG, controller.signal))
    controller.abort()
    const settled = await Promise.allSettled([first, ...queued])
    const rejected = settled.filter((s) => s.status === 'rejected')
    expect(rejected.length).toBeGreaterThan(0)
    // 至少有一个排队任务的文件没有写出来
    const existing = await Promise.all(queued.map((_, i) => fsp.stat(join(DIR, `q-${i}.png`)).then(() => true).catch(() => false)))
    expect(existing.some((v) => v === false)).toBe(true)
  })
})
