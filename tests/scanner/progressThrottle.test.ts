import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProgressThrottle } from '@main/progressThrottle'
import type { ScanProgress } from '@shared/types'

function p(current: number, total = 100, phase: ScanProgress['phase'] = 'items', label = 'x'): ScanProgress {
  return { phase, current, total, label, elapsedMs: 0 }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('进度事件节流', () => {
  it('首条与收尾必发；密集的中途事件被压掉', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const out: number[] = []
    const t = createProgressThrottle((e) => out.push(e.current), { minStep: 20, minIntervalMs: 250 })
    for (let i = 1; i <= 100; i += 1) t.push(p(i))
    expect(out[0]).toBe(1)
    expect(out.at(-1)).toBe(100)
    expect(out.length).toBeLessThan(10)
  })

  it('前进不足 minStep 时不发，越过阈值后发', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const out: number[] = []
    const t = createProgressThrottle((e) => out.push(e.current), { minStep: 30, minIntervalMs: 0 })
    t.push(p(0))
    t.push(p(10))
    t.push(p(20))
    vi.setSystemTime(100)
    t.push(p(40))
    expect(out).toEqual([0, 40])
  })

  it('时间不足 minInterval 时不发（即使步进够）', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const out: number[] = []
    const t = createProgressThrottle((e) => out.push(e.current), { minStep: 1, minIntervalMs: 250 })
    t.push(p(0))
    t.push(p(50))
    vi.setSystemTime(300)
    t.push(p(51))
    expect(out).toEqual([0, 51])
  })

  it('阶段切换必发', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const out: string[] = []
    const t = createProgressThrottle((e) => out.push(`${e.phase}:${e.current}`), { minStep: 20, minIntervalMs: 250 })
    t.push(p(1, 100, 'items'))
    t.push(p(2, 100, 'items'))
    t.push(p(1, 10, 'recipes'))
    expect(out).toEqual(['items:1', 'recipes:1'])
  })

  it('flush 能补发终态，且不影响后续节流窗口', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const out: number[] = []
    const t = createProgressThrottle((e) => out.push(e.current), { minStep: 20, minIntervalMs: 250 })
    t.push(p(1))
    t.flush(p(100))
    t.push(p(2))
    expect(out).toEqual([1, 100])
    expect(out.at(-1)).toBe(100)
  })

  it('节流只过滤 UI 事件，不吞掉终态：1000 次推送后最后一个一定到达', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const out: number[] = []
    const t = createProgressThrottle((e) => out.push(e.current), { minStep: 20, minIntervalMs: 250 })
    for (let i = 1; i <= 1000; i += 1) t.push(p(i, 1000))
    expect(out.at(-1)).toBe(1000)
    expect(out[0]).toBe(1)
  })
})
