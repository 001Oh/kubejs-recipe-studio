/**
 * 配方扫描 worker：只做「一个 jar → 该 jar 的配方摘要」。
 * 入口在 electron.vite.config.ts 里登记为额外主进程入口（产物 out/main/recipe.worker.js）。
 */
import { parentPort } from 'node:worker_threads'
import { scanJarRecipes } from './jarRecipes'

interface RecipeRequest {
  id: number
  jarPath: string
}

const port = parentPort
if (!port) throw new Error('recipe.worker 必须在 worker_threads 中运行')

port.on('message', (msg: RecipeRequest) => {
  if (!msg || typeof msg.jarPath !== 'string') return
  void scanJarRecipes(msg.jarPath)
    .then((result) => {
      // payload 直接带上采样结果：不新增消息，也不改 jarPoolCore 的协议
      port.postMessage({ id: msg.id, ok: true, payload: result })
    })
    .catch((err: unknown) => {
      port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    })
})
