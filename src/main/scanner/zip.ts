/**
 * yauzl 流式 jar 读取。两个特性必须保留：
 * 1) 只按需读条目，绝不把整个 jar 解压到磁盘（整合包目录尤其不能污染）；
 * 2) 每次读取独立打开 / 关闭句柄，供惰性读取完整配方 JSON 时使用（规格 3.2）。
 */
import { Buffer } from 'node:buffer'
import yauzl from 'yauzl'

export interface ZipEntryInfo {
  fileName: string
  uncompressedSize: number
}

export interface JarListResult {
  entries: ZipEntryInfo[]
  /** CRC / 截断等错误的摘要；调用方据此记 ERROR 日志并跳过该 mod */
  error: string | null
}

function open(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false, decodeStrings: true }, (err, zip) => {
      // OPT4-R8：yauzl 的原始错误（如 "invalid central directory header"）对用户没有意义。
      // 只包一层可读前缀，**保留原文**——诊断仍需要它，不吞掉细节。
      if (err || !zip) {
        const detail = err?.message ?? '未返回 zip 句柄'
        reject(new Error(`无法读取 jar（可能损坏或不是 zip）：${path} —— ${detail}`))
      } else resolve(zip)
    })
  })
}

function readStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error('条目读取失败'))
        return
      }
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  })
}

function closeQuietly(zip: yauzl.ZipFile): void {
  try {
    zip.close()
  } catch {
    /* 已关闭 */
  }
}

/** 列出全部条目名与大小；用于按前缀过滤后决定读哪些。 */
export async function listEntries(path: string): Promise<JarListResult> {
  let zip: yauzl.ZipFile | undefined
  try {
    zip = await open(path)
    const entries: ZipEntryInfo[] = []
    await new Promise<void>((resolve, reject) => {
      zip!.on('entry', (entry) => {
        if (!entry.fileName.endsWith('/')) entries.push({ fileName: entry.fileName, uncompressedSize: entry.uncompressedSize })
        zip!.readEntry()
      })
      zip!.on('end', () => resolve())
      zip!.on('error', reject)
      zip!.readEntry()
    })
    return { entries, error: null }
  } catch (err) {
    return { entries: [], error: err instanceof Error ? err.message : String(err) }
  } finally {
    // P3-10：与 readEntryBuffer/readMany/listAndRead 同口径——迭代期 error 也必须关句柄，
    // 否则损坏 jar 的句柄一直挂着（Windows 上文件删不掉、磁盘句柄泄漏）。
    if (zip) closeQuietly(zip)
  }
}

/**
 * 读单个条目的文本 / 二进制；找不到返回 null。
 * 每次都重新打开 jar（规格要求不复用句柄，避免十几万条配方时句柄泄漏）。
 */
export async function readEntryBuffer(path: string, wanted: string): Promise<Buffer | null> {
  const zip = await open(path)
  try {
    return await new Promise<Buffer | null>((resolve, reject) => {
      let found = false
      zip.on('entry', (entry) => {
        if (found) return
        if (entry.fileName === wanted) {
          found = true
          void readStream(zip, entry).then(resolve, reject)
          return
        }
        zip.readEntry()
      })
      zip.on('end', () => {
        if (!found) resolve(null)
      })
      zip.on('error', reject)
      zip.readEntry()
    })
  } catch (err) {
    throw new Error(`读取 jar 条目失败 ${path}#${wanted}：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    closeQuietly(zip)
  }
}

export async function readEntryText(path: string, wanted: string): Promise<string | null> {
  const buf = await readEntryBuffer(path, wanted)
  if (!buf) return null
  // MC 资源文件多为 UTF-8 无 BOM，个别 jar 带 BOM
  return buf.toString('utf8').replace(/^\uFEFF/, '')
}

/** 一次打开读多个条目，用于物品索引这类批量场景（比逐条打开快一个数量级）。 */
export async function readMany(path: string, wanted: Set<string>): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  if (wanted.size === 0) return out
  const zip = await open(path)
  try {
    await new Promise<void>((resolve, reject) => {
      let pending = 0
      zip.on('entry', (entry) => {
        if (!wanted.has(entry.fileName)) {
          zip.readEntry()
          return
        }
        pending += 1
        void readStream(zip, entry)
          .then((buf) => {
            out.set(entry.fileName, buf)
          })
          .catch(reject)
          .finally(() => {
            // 每个条目读 complete 后再推进，保证流与条目一一对应
            pending -= 1
            zip.readEntry()
          })
      })
      // readEntry 只在流完成后推进，故 end 触发时 pending 必为 0
      zip.on('end', () => {
        if (pending === 0) resolve()
      })
      zip.on('error', reject)
      zip.readEntry()
    })
    return out
  } catch (err) {
    throw new Error(`批量读取 jar 失败 ${path}：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    closeQuietly(zip)
  }
}

/** 前缀过滤，减少 Set 构造开销。 */
export function matchPrefixes(entries: ZipEntryInfo[], prefixes: string[]): ZipEntryInfo[] {
  return entries.filter((e) => prefixes.some((p) => e.fileName.startsWith(p)))
}

// ─────────────────────────────────────────────────────────────────────────────
// P-OPT4-S1：单次遍历的「列目录 + 按需读取」
//
// 背景（docs/P-OPT4-ZIP读取架构评审.md）：现有调用方普遍是「先 listEntries 再 readMany」，
// 两个 API 各自打开一次归档、各自把中央目录走一遍，同一份索引被遍历两次。
// listAndRead 在一次遍历里同时产出「条目清单」和「命中条目的字节」，句柄只在本次调用内持有。
//
// 语义约定（调用方必须知道）：
// - entries：与 listEntries 完全一致（排除以 / 结尾的目录条目，保持中央目录顺序）；
// - buffers：只包含 matcher 命中且读取成功的条目，键为条目名；插入顺序 = 遍历顺序；
// - matcher：接收 (fileName, {uncompressedSize})，不得在内部执行阻塞操作；
//   抛错会立即中止遍历、关闭句柄，并把**原始错误对象**原样抛出（不包装）；
// - 读取失败：不返回部分结果，整体 reject（错误信息含 jar 与条目名，cause 为原始错误）；
// - 取消：signal 已中止时不打开文件；遍历/读取过程中中止则关闭句柄并抛 name='AbortError'；
// - 重复条目名（zip 允许）：两条都会读取，buffers 以最后一次为准（与 readMany 的 Map 语义一致）；
// - 返回值只含普通数据，不依赖任何已关闭的句柄或 Entry 对象。
export interface ListAndReadOptions {
  matcher: (fileName: string, info: { uncompressedSize: number }) => boolean
  signal?: AbortSignal
}

export interface ListAndReadResult {
  entries: ZipEntryInfo[]
  buffers: Map<string, Buffer>
}

function abortError(): Error {
  const err = new Error('已取消：读取 jar 条目')
  err.name = 'AbortError'
  return err
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function listAndRead(path: string, options: ListAndReadOptions): Promise<ListAndReadResult> {
  const { matcher, signal } = options
  if (signal?.aborted) throw abortError()

  let zip: yauzl.ZipFile
  try {
    zip = await open(path)
  } catch (err) {
    throw new Error(`打开 jar 失败 ${path}：${messageOf(err)}`, { cause: err })
  }

  const entries: ZipEntryInfo[] = []
  const buffers = new Map<string, Buffer>()
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        fn()
      }
      const fail = (err: unknown): void => {
        finish(() => reject(err))
      }

      zip.on('error', (err) => fail(new Error(`遍历 jar 失败 ${path}：${messageOf(err)}`, { cause: err })))
      zip.on('end', () => finish(resolve))
      zip.on('entry', (entry) => {
        if (settled) return
        // 目录条目与 listEntries 保持一致：不进清单，也不交给 matcher
        if (entry.fileName.endsWith('/')) {
          zip.readEntry()
          return
        }
        entries.push({ fileName: entry.fileName, uncompressedSize: entry.uncompressedSize })
        if (signal?.aborted) {
          fail(abortError())
          return
        }
        let matched: boolean
        try {
          matched = matcher(entry.fileName, { uncompressedSize: entry.uncompressedSize })
        } catch (err) {
          // matcher 的异常原样传播，不做包装
          fail(err)
          return
        }
        if (settled) return
        if (!matched) {
          zip.readEntry()
          return
        }
        if (signal?.aborted) {
          fail(abortError())
          return
        }
        void readStream(zip, entry).then(
          (buf) => {
            if (settled) return
            buffers.set(entry.fileName, buf)
            zip.readEntry()
          },
          (err: unknown) => {
            fail(new Error(`读取 jar 条目失败 ${path}#${entry.fileName}：${messageOf(err)}`, { cause: err }))
          }
        )
      })
      zip.readEntry()
    })
    return { entries, buffers }
  } finally {
    closeQuietly(zip)
  }
}
