/**
 * 取消控制：扫描类长任务在此登记中断回调，窗口关闭 / 用户点取消时统一触发。
 * 扫描模块自身不感知 app 生命周期，便于在 vitest 里直接调用。
 */
import { logger } from './logger'

type CancelFn = () => void | Promise<void>

const cancellers = new Map<string, CancelFn>()
const aborts = new Map<string, AbortController>()

export function beginTask(id: string, onCancel?: CancelFn): AbortSignal {
  // 同 id 重复登记时先中止旧任务，否则旧 signal 的持有者永远等不到取消
  const previous = aborts.get(id)
  if (previous && !previous.signal.aborted) {
    previous.abort(new Error(`任务被同 id 的新任务取代：${id}`))
    try {
      cancellers.get(id)?.()
    } catch (err) {
      logger.warn('SCAN', `旧任务清理失败：${id}`, err instanceof Error ? err.message : String(err))
    }
  }
  const ctrl = new AbortController()
  aborts.set(id, ctrl)
  if (onCancel) cancellers.set(id, onCancel)
  else cancellers.delete(id)
  return ctrl.signal
}

export function endTask(id: string): void {
  aborts.delete(id)
  cancellers.delete(id)
}

export function isAborted(id: string): boolean {
  return aborts.get(id)?.signal.aborted ?? false
}

/** 只取消指定任务（不动其它），返回是否真的触发了取消 */
export async function cancelTask(id: string, reason = '用户取消'): Promise<boolean> {
  const ctrl = aborts.get(id)
  if (!ctrl || ctrl.signal.aborted) return false
  ctrl.abort(new Error(`已取消：${reason}`))
  try {
    await cancellers.get(id)?.()
  } catch (err) {
    logger.warn('SCAN', `任务取消回调失败：${id}`, err instanceof Error ? err.message : String(err))
  }
  logger.info('SCAN', `任务已请求取消：${id}（${reason}）`)
  return true
}

/** 返回实际触发的任务数，供 before-quit 日志使用。 */
export async function cancelAll(reason: string): Promise<number> {
  const ids = [...aborts.keys()]
  for (const id of ids) {
    try {
      aborts.get(id)!.abort(new Error(`已取消：${reason}`))
      await cancellers.get(id)?.()
      logger.info('SCAN', `任务已中断：${id}（${reason}）`)
    } catch (err) {
      logger.warn('SCAN', `任务中断失败：${id}`, err instanceof Error ? err.message : String(err))
    } finally {
      endTask(id)
    }
  }
  return ids.length
}

export function activeTasks(): string[] {
  return [...aborts.keys()]
}
