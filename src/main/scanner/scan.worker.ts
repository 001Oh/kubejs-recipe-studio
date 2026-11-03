/**
 * 扫描 worker：只做「一个 jar → 物品片段」，进度与缓存全部交给主线程。
 * 入口在 electron.vite.config.ts 里登记为额外主进程入口（产物 out/main/scan.worker.js）。
 */
import { parentPort, workerData } from 'node:worker_threads'
import { scanJar } from './jarScan'
import { configureIconWriter } from './iconWriter'

interface WorkerInit {
  iconDir: string
  /** 本 lane 的写入并发预算（= 全局预算 / lane 数） */
  writeConcurrency?: number
}

interface ScanRequest {
  id: number
  jarPath: string
}

const init = workerData as WorkerInit
if (init.writeConcurrency) configureIconWriter(init.writeConcurrency)
const port = parentPort
if (!port) throw new Error('scan.worker 必须在 worker_threads 中运行')

port.on('message', (msg: ScanRequest) => {
  if (!msg || typeof msg.jarPath !== 'string') return
  void scanJar(msg.jarPath, init.iconDir)
    .then((outcome) => {
      port.postMessage({ id: msg.id, ok: true, payload: outcome })
    })
    .catch((err: unknown) => {
      port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    })
})
