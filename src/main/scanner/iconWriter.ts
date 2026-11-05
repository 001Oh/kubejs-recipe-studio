/**
 * P-OPT2：图标写入的受控并发队列（主扫描与 iconPass 共用）。
 *
 * 背景（见 docs/P-OPT1-冷启动剖析.md）：原实现在 jarScan 内对每张图标执行一次
 * `existsSync` + 一次串行 `await writeFile`，单张约 1.2ms；TConstruct 单个 jar 11,726 张
 * 就占 15.2s（该 jar 的 79%），并成为整池的关键路径。
 *
 * 本模块只做三件事，不改任何图标语义：
 * 1. **去重**：同一目标路径在一次扫描里只写一次；并发重复提交共享同一个 Promise；
 * 2. **限流**：全进程共享一个并发上限，避免 8 个 worker 各自乱写把磁盘打满；
 * 3. **错误/取消传播**：写入失败按任务 reject（调用方据此让该 jar 失败），
 *    取消后不再写入排队任务，已开始的写入任其完成。
 *
 * 落盘语义（B121/D-2）：写前 stat 保住「已存在即跳过」；新写入走 tmp + rename 原子替换，
 * 进程中途被杀不会留下被内容寻址永久占位的截断 PNG（残留 tmp 由 cache:clear 的 temp 类清扫）。
 */
import { promises as fsp } from 'node:fs'
import { recordIcon } from './scanSession'

export interface IconWriteStats {
  submitted: number
  written: number
  skipped: number
  failed: number
  /** 同时处于「排队 + 正在写」的峰值，用于验证限流是否真的生效 */
  peakPending: number
  queued: number
  active: number
  concurrency: number
}

interface Job {
  target: string
  bytes: Buffer
  signal?: AbortSignal
  resolve: (written: boolean) => void
  reject: (err: unknown) => void
}

export class IconAbortError extends Error {
  constructor() {
    super('已取消：图标写入')
    this.name = 'IconAbortError'
  }
}

export function isIconAbort(err: unknown): boolean {
  return err instanceof IconAbortError || (err as { name?: string } | null)?.name === 'AbortError'
}

class IconWriter {
  private readonly queue: Job[] = []
  private readonly inflight = new Map<string, Promise<boolean>>()
  /** 本次扫描内已确认存在的路径（写过或跳过），避免重复打开 */
  private readonly known = new Set<string>()
  private active = 0
  private peakPending = 0
  private counters = { submitted: 0, written: 0, skipped: 0, failed: 0 }

  constructor(private concurrency: number) {}

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, Math.floor(n))
    this.pump()
  }

  snapshot(): IconWriteStats {
    return {
      ...this.counters,
      peakPending: this.peakPending,
      queued: this.queue.length,
      active: this.active,
      concurrency: this.concurrency
    }
  }

  resetStats(): void {
    this.counters = { submitted: 0, written: 0, skipped: 0, failed: 0 }
    this.peakPending = 0
  }

  /** 换整合包/换图标目录时清空「已知路径」 */
  forgetKnown(): void {
    this.known.clear()
  }

  write(target: string, bytes: Buffer, signal?: AbortSignal): Promise<boolean> {
    this.counters.submitted += 1
    const previous = this.inflight.get(target)
    if (previous) return previous
    if (this.known.has(target)) {
      this.counters.skipped += 1
      return Promise.resolve(false)
    }
    if (signal?.aborted) return Promise.reject(new IconAbortError())

    let resolve!: (written: boolean) => void
    let reject!: (err: unknown) => void
    const promise = new Promise<boolean>((ok, bad) => {
      resolve = ok
      reject = bad
    })
    this.inflight.set(target, promise)
    this.queue.push({ target, bytes, ...(signal ? { signal } : {}), resolve, reject })
    this.trackPending()
    this.pump()
    return promise
  }

  private trackPending(): void {
    const pending = this.queue.length + this.active
    if (pending > this.peakPending) this.peakPending = pending
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!
      this.active += 1
      void this.run(job).finally(() => {
        this.active -= 1
        this.pump()
      })
    }
  }

  private async run(job: Job): Promise<void> {
    if (job.signal?.aborted) {
      this.inflight.delete(job.target)
      this.counters.failed += 1
      job.reject(new IconAbortError())
      return
    }
    try {
      // B121/D-2：先 stat 保住「已存在即跳过」语义（P-OPT2 的 fast path），
      // 再用 tmp+rename 原子落盘——原先直接 wx 写最终路径，进程在写途中被杀会留下
      // 截断 PNG，且内容寻址 + EEXIST 跳过让它永远不会被修复。
      try {
        await fsp.stat(job.target)
        this.counters.skipped += 1
        this.known.add(job.target)
        this.inflight.delete(job.target)
        job.resolve(false)
        return
      } catch {
        /* 不存在 → 继续写入 */
      }
      const tmp = `${job.target}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`
      let handle: Awaited<ReturnType<typeof fsp.open>> | null = null
      try {
        handle = await fsp.open(tmp, 'wx')
        await handle.writeFile(job.bytes)
        await handle.close()
        handle = null
        await fsp.rename(tmp, job.target)
      } catch (err) {
        if (handle) await handle.close().catch(() => undefined)
        await fsp.rm(tmp, { force: true }).catch(() => undefined)
        throw err
      }
      this.counters.written += 1
      this.known.add(job.target)
      this.inflight.delete(job.target)
      job.resolve(true)
    } catch (err) {
      // 失败路径不记入 known，允许后续重试（与原「每张独立尝试」的语义一致）
      this.counters.failed += 1
      this.inflight.delete(job.target)
      job.reject(err)
    }
  }
}

const writer = new IconWriter(24)

export function configureIconWriter(concurrency: number): void {
  writer.setConcurrency(concurrency)
}

export function iconWriterStats(): IconWriteStats {
  return writer.snapshot()
}

export function resetIconWriterStats(): void {
  writer.resetStats()
}

export function forgetKnownIcons(): void {
  writer.forgetKnown()
}

/** 写入一张图标；返回 true=本次新写，false=已存在（跳过）。失败会 reject。 */
export async function writeIcon(target: string, bytes: Buffer, signal?: AbortSignal): Promise<boolean> {
  const written = await writer.write(target, bytes, signal)
  // OPT4-R4：记录本次写出的图标，供取消时精确清理（只记真正写成功的）
  if (written) recordIcon(target)
  return written
}
