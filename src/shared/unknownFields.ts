/**
 * 未认领字段的收集与限幅（P-B 纯函数，P-C 增加 struct 子路径支持）。
 *
 * 规则（与用户决策一致）：
 * - 常规展开最多 3 层，单条展开后最多 8KB；
 * - 超限只截断「展开结构」用于展示与体积控制；`value` 一律保存**原始值**——
 *   原始数据既完整保存在 RawSource.raw，也随本条目随身携带，反解（denormalize
 *   的 struct 回写）才能原样带回，不会把骨架/空值写进配方文件（B121/S-1）；
 * - 超限原因单独记录（truncatedDepth / truncatedBytes），不得误标为 parse-failed；
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

/** 按层数截断；超深处的容器只留类型骨架，标量原样保留（骨架仅用于体积估算） */
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
      // 超字节：value 保存原始值（不再置 undefined）——struct 回写时才能原样带回；
      // truncatedBytes 单独标记超限原因，诊断与 partial 归因据此触发
      out.push({ path, reason: unknownReasonFor(path), value, bytes, truncatedBytes: true })
      continue
    }
    out.push({
      path,
      reason: unknownReasonFor(path),
      value,
      bytes,
      ...(shrunk.truncatedDepth ? { truncatedDepth: true } : {})
    })
  }
  return out
}
