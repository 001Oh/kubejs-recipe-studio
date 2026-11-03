/**
 * 进度事件节流（只影响「发给渲染进程的频率」，不影响内部任务状态）。
 *
 * 规则：
 * - 每个阶段的第一条一定发（用户要知道开始了）；
 * - `current >= total` 的收尾事件一定发（否则进度条停在 97%）；
 * - 阶段切换一定发；
 * - 其余按「至少前进 minStep 个任务」且「距上次发送 ≥ minIntervalMs」双重条件限制；
 * - `flush()` 供调用方在阶段结束/失败/取消时显式补发，保证终态必达。
 */
import type { ScanProgress } from '../shared/types'

export type ProgressSink = (progress: ScanProgress) => void

export interface ThrottleOptions {
  /** 两次发送的最小间隔，默认 250ms */
  minIntervalMs?: number
  /** 一次至少前进多少个任务才允许发送（与时间条件取与），默认 20 */
  minStep?: number
}

export interface ProgressThrottle {
  push: (progress: ScanProgress) => void
  /** 强制发送（可附带一条终态进度），并复位节流窗口 */
  flush: (progress?: ScanProgress) => void
  reset: () => void
}

export function createProgressThrottle(sink: ProgressSink, options: ThrottleOptions = {}): ProgressThrottle {
  const minIntervalMs = options.minIntervalMs ?? 250
  const minStep = Math.max(1, options.minStep ?? 20)
  let lastAt = 0
  let lastCurrent = -1
  let lastPhase: string | null = null
  let last: ScanProgress | null = null

  return {
    push(progress) {
      const now = Date.now()
      const phaseChanged = progress.phase !== lastPhase
      const first = lastCurrent < 0 || phaseChanged
      const final = progress.total > 0 && progress.current >= progress.total
      const step = progress.current - lastCurrent
      last = progress
      if (!first && !final) {
        if (now - lastAt < minIntervalMs || step < minStep) return
      }
      lastAt = now
      lastCurrent = progress.current
      lastPhase = progress.phase
      sink(progress)
    },
    flush(progress) {
      if (progress) {
        last = progress
        lastCurrent = progress.current
        lastPhase = progress.phase
        lastAt = Date.now()
        sink(progress)
        return
      }
      if (!last) return
      sink(last)
      lastAt = Date.now()
    },
    reset() {
      lastAt = 0
      lastCurrent = -1
      lastPhase = null
      last = null
    }
  }
}
