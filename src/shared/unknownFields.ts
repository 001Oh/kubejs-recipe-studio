/**
 * 未认领字段的收集与限幅（P-B 纯函数，P-C 增加 struct 子路径支持）。
 *
 * 规则（与用户决策一致）：
 * - 常规展开最多 3 层，单条展开后最多 8KB；
 * - 超限只截断「展开结构」，**原始数据仍完整保存在 RawSource**，不会丢；
 * - 超限原因单独记录（truncatedDepth / 超字节 → value=undefined），不得误标为 parse-failed；
 * - 环境类条件（conditions / research 等）单独标 reason，便于 partial 归因。
 */
import {
  UNKNOWN_EXPAND_MAX_BYTES,
  UNKNOWN_EXPAND_MAX_DEPTH,
  type UnknownField,
  type UnknownReason
} from './schemaModel'
import { jsonByteLength, isPlainObject } from './canonicalJson'

const AMBIENT_RE = /(^|\.)(conditions?|research|requirement|environment)$/i

export function unknownReasonFor(path: string): UnknownReason {
  return AMBIENT_RE.test(path.replace(/\[\d+\]/g, '')) ? 'ambient-condition' : 'not-in-schema'
}

interface Shrunk {
  value?: unknown
  truncatedDepth?: boolean
}

/** 按层数截断；超深处的容器只留类型骨架，标量原样保留 */
function shrink(value: unknown, depthLeft: number): Shrunk {
  if (Array.isArray(value)) {
    if (depthLeft <= 0) return { truncatedDepth: true, value: { __type: 'array', length: value.length } }
    let truncated = false
    const out = value.map((item) => {
      const shrunk = shrink(item, depthLeft - 1)
      if (shrunk.truncatedDepth) truncated = true
      return shrunk.value
    })
    return { value: out, ...(truncated ? { truncatedDepth: true } : {}) }
  }
  if (isPlainObject(value)) {
    if (depthLeft <= 0) return { truncatedDepth: true, value: { __type: 'object', keys: Object.keys(value).length } }
    let truncated = false
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      const shrunk = shrink(child, depthLeft - 1)
      if (shrunk.truncatedDepth) truncated = true
      out[key] = shrunk.value
    }
    return { value: out, ...(truncated ? { truncatedDepth: true } : {}) }
  }
  return { value }
}

export interface CollectOptions {
  maxDepth?: number
  maxBytes?: number
  /** 路径前缀（struct 子对象收集时传父路径），默认 `$` */
  pathPrefix?: string
}

/**
 * @param root 原始 JSON（只读）
 * @param consumed 已被 schema 认领的路径（含前缀，如 `$.result`、`$.itemInput.ingredient`）
 */
export function collectUnknownFields(
  root: Record<string, unknown>,
  consumed: ReadonlySet<string>,
  options: CollectOptions = {}
): UnknownField[] {
  const maxDepth = options.maxDepth ?? UNKNOWN_EXPAND_MAX_DEPTH
  const maxBytes = options.maxBytes ?? UNKNOWN_EXPAND_MAX_BYTES
  const prefix = options.pathPrefix ?? '$'
  const out: UnknownField[] = []
  for (const [key, value] of Object.entries(root)) {
    const path = `${prefix}.${key}`
    if (key === 'type' || consumed.has(path)) continue
    const shrunk = shrink(value, maxDepth)
    const bytes = shrunk.value === undefined ? 0 : jsonByteLength(shrunk.value)
    if (bytes > maxBytes) {
      // 只截断展开结构：保留路径、字节数与截断标记；原文在 RawSource.raw 里
      out.push({ path, reason: unknownReasonFor(path), bytes, truncatedDepth: shrunk.truncatedDepth })
      continue
    }
    out.push({
      path,
      reason: unknownReasonFor(path),
      value: shrunk.value,
      bytes,
      ...(shrunk.truncatedDepth ? { truncatedDepth: true } : {})
    })
  }
  return out
}
