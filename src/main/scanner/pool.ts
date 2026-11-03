/**
 * 物品扫描的并发池：业务薄壳，生命周期/分发/取消/降级全部复用 `jarPoolCore`。
 * worker 产物缺失时（例如没有构建产物）自动退化为同线程并发，行为与 worker 路径一致。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ItemEntry } from '../../shared/types'
import { scanJar, type JarScanOutcome } from './jarScan'
import { defaultPoolConcurrency, jarBaseName, runJarPoolCore } from './jarPoolCore'
import { ICON_WRITE_CONCURRENCY_TOTAL } from '../../shared/constants'
import { configureIconWriter, forgetKnownIcons } from './iconWriter'

export interface ScanRunOptions {
  jars: string[]
  iconDir: string
  signal: AbortSignal
  onJar: (done: number, total: number, outcome: JarScanOutcome) => void
  onJarFailed: (jarName: string, error: string) => void
}

export interface ScanRunResult {
  items: ItemEntry[]
  failed: { name: string; error: string }[]
  usedWorkers: boolean
  /** jar 路径 → 资源条目名（模型/贴图/lang），供跨 jar 图标解析复用 */
  entriesByJar: Map<string, readonly string[]>
}

export function defaultConcurrency(): number {
  return defaultPoolConcurrency()
}

export async function runJarPool(opts: ScanRunOptions, concurrency = defaultConcurrency()): Promise<ScanRunResult> {
  const items: ItemEntry[] = []
  const failed: { name: string; error: string }[] = []
  const entriesByJar = new Map<string, readonly string[]>()
  let done = 0
  const total = opts.jars.length
  const workerScript = join(__dirname, 'scan.worker.js')
  // 全局写入预算按 lane 均分：8 个 worker 各 3 张并发，总上限 24，避免并发写把磁盘打满
  const perLane = Math.max(1, Math.ceil(ICON_WRITE_CONCURRENCY_TOTAL / Math.max(1, concurrency)))
  if (!existsSync(workerScript)) configureIconWriter(ICON_WRITE_CONCURRENCY_TOTAL)
  forgetKnownIcons()

  const result = await runJarPoolCore<JarScanOutcome>({
    jars: opts.jars,
    signal: opts.signal,
    workerScript,
    workerAvailable: existsSync(workerScript),
    workerData: { iconDir: opts.iconDir, writeConcurrency: perLane },
    concurrency,
    inline: (jarPath) => scanJar(jarPath, opts.iconDir),
    onResult: (jarPath, outcome) => {
      items.push(...outcome.items)
      entriesByJar.set(jarPath, outcome.assetEntries)
      done += 1
      opts.onJar(done, total, outcome)
    },
    onFailed: (jarPath, error) => {
      const name = jarBaseName(jarPath)
      failed.push({ name, error })
      done += 1
      opts.onJarFailed(name, error)
    }
  })
  return { items, failed, usedWorkers: result.usedWorkers, entriesByJar }
}
