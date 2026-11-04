/**
 * 第 116 批 B1：扫描期配方原始 JSON 采样器（每个进程一份）。
 *
 * 设计要点（对应"不得增加扫描耗时"）：
 *   - 只在**已经解析好的对象上存引用**（不拷贝、不序列化、不二次读 jar）；
 *   - 每个 type 在本进程最多留 `MAX_SAMPLES_PER_TYPE` 条，O(1) 判断；
 *   - 聚合在扫描全部结束后统一做一次，不在热路径上做字段遍历。
 *
 * worker 与主进程各持一份：worker 里 `drainShapeSamples()` 随 jar 结果一起 postMessage 回主进程，
 * 主进程用 `mergeShapeSamples()` 收进全局集合；两者在 `collectAllSamples()` 里合并。
 */
export const MAX_SAMPLES_PER_TYPE = 20

export interface ShapeSampleBatch {
  type: string
  /** 原始 JSON 对象（引用，不是拷贝） */
  samples: unknown[]
}

/** 本进程（worker 或主线程）采样到的样本 */
const local = new Map<string, unknown[]>()
/** 主进程从各 worker 收回的样本 */
const collected = new Map<string, unknown[]>()

/** 热路径：解析完一条配方 JSON 后调用。type 为空/unknown 的样本不收（形状没有意义）。 */
export function noteShapeSample(type: string, json: unknown): void {
  if (!type || type === 'unknown' || json === null || typeof json !== 'object' || Array.isArray(json)) return
  const list = local.get(type)
  if (list) {
    if (list.length < MAX_SAMPLES_PER_TYPE) list.push(json)
    return
  }
  local.set(type, [json])
}

function appendBatch(target: Map<string, unknown[]>, batches: readonly ShapeSampleBatch[]): void {
  for (const batch of batches) {
    if (!batch?.type) continue
    const list = target.get(batch.type)
    if (!list) {
      target.set(batch.type, batch.samples.slice(0, MAX_SAMPLES_PER_TYPE))
      continue
    }
    for (const sample of batch.samples) {
      if (list.length >= MAX_SAMPLES_PER_TYPE) break
      list.push(sample)
    }
  }
}

/** worker 侧：把本 jar 采到的样本取走（清空 local，避免下一个 jar 串味） */
export function drainShapeSamples(): ShapeSampleBatch[] {
  const out: ShapeSampleBatch[] = [...local].map(([type, samples]) => ({ type, samples }))
  local.clear()
  return out
}

/** 主进程侧：接收 worker 回传的样本 */
export function mergeShapeSamples(batches: readonly ShapeSampleBatch[]): void {
  appendBatch(collected, batches)
}

/** 主进程侧：合并「自己解析的 + worker 回传的」，全局仍然每个 type ≤ 20 条 */
export function collectAllSamples(): ShapeSampleBatch[] {
  const merged = new Map<string, unknown[]>()
  appendBatch(merged, drainShapeSamples())
  appendBatch(merged, [...collected].map(([type, samples]) => ({ type, samples })))
  collected.clear()
  return [...merged].map(([type, samples]) => ({ type, samples }))
}

/** 测试与新一轮扫描开头用 */
export function resetShapeSamples(): void {
  local.clear()
  collected.clear()
}
