/**
 * P3-10：listEntries 失败路径句柄泄漏。同文件 readEntryBuffer/readMany/listAndRead
 * 都用 finally 关句柄，唯独 listEntries 的 closeQuietly 在 try 尾部——迭代期 error
 * 会跳过 close（catch 分支按现有契约返回 entries:[]，但不关句柄）。
 * 真实文件上 yauzl 在 open 期就完整解析中央目录（实测四种 CD 损坏构造均在 open 期
 * 报错），迭代期 error 无法用真实文件构造，故用 yauzl mock 驱动该路径。
 * 判据：error 返回后 zip.close 必须已调用（与兄弟 API 同口径）。
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { listEntries } from '../../src/main/scanner/zip'

const H = vi.hoisted(() => ({
  closeSpy: vi.fn(),
  /** fake 的行为模式：error = 首条后注入迭代期错误；ok = 首条后正常 end */
  mode: 'error'
}))

vi.mock('yauzl', () => ({
  default: {
    open: (_path: string, _opts: unknown, cb: (err: unknown, zip?: FakeZip) => void) => {
      cb(null, makeFakeZip())
    }
  }
}))

type FakeZip = EventEmitter & { readEntry: () => void; close: () => void }

function makeFakeZip(): FakeZip {
  const zip = new EventEmitter() as FakeZip
  let reads = 0
  zip.readEntry = () => {
    reads += 1
    if (reads === 1) zip.emit('entry', { fileName: 'a.txt', uncompressedSize: 5 })
    else if (H.mode === 'error') zip.emit('error', new Error('迭代期错误（测试注入）'))
    else zip.emit('end')
  }
  zip.close = () => H.closeSpy()
  return zip
}

describe('P3-10 listEntries 失败/成功路径都必须关句柄', () => {
  it('迭代期 error 路径：返回 error 且 close 已调用（修复前 close 未调用 → 红）', async () => {
    H.mode = 'error'
    H.closeSpy.mockClear()
    const res = await listEntries('fake.jar')
    expect(res.error).toContain('迭代期错误')
    expect(H.closeSpy).toHaveBeenCalledTimes(1)
  })

  it('成功路径：close 恰好调用一次（防回归）', async () => {
    H.mode = 'ok'
    H.closeSpy.mockClear()
    const res = await listEntries('ok.jar')
    expect(res.error).toBeNull()
    expect(res.entries).toHaveLength(1)
    expect(H.closeSpy).toHaveBeenCalledTimes(1)
  })
})
