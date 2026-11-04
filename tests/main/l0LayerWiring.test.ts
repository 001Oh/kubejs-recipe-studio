/**
 * T-117 C 的回归钉子：l0 层必须真的存在于注册表。
 *
 * 成因（本批核实发现）：`SchemaLayer` 联合类型加了 'l0'，但 `LAYERS` 数组没加。
 * `layerMaps` 由 `LAYERS.map(...)` 构建，于是 `putMany('l0', …)` 里
 * `layerMaps.get('l0')` 是 **undefined**，`?.set()` 静默跳过——
 * 整个 L0 内置库装配不出来，而且**不报错**（typecheck 与 lint 都发现不了）。
 * 因此这里用行为断言把「写入 l0 层 → 能被读到」钉死。
 */
import { describe, expect, it } from 'vitest'
import type { RecipeTypeSchema } from '@shared/types'
import { applyMerge, clearSchemas, putMany, getSchema, schemaIds } from '@main/schema/registry'

function stubSchema(id: string): RecipeTypeSchema {
  return {
    id,
    displayName: id,
    modId: id.split(':')[0] ?? '',
    modDisplayName: id.split(':')[0] ?? '',
    source: 'builtin',
    layoutKind: 'multi_io',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible'
  } as RecipeTypeSchema
}

describe('l0 层接线（第 117 批核实发现的静默丢弃）', () => {
  it('putMany("l0", …) 写入的类型必须能被 getSchema 读到', () => {
    clearSchemas()
    putMany('l0', [stubSchema('l0test:one'), stubSchema('l0test:two')])
    applyMerge({})

    expect(getSchema('l0test:one')?.id).toBe('l0test:one')
    expect(getSchema('l0test:two')?.id).toBe('l0test:two')
    expect(schemaIds()).toContain('l0test:one')
  })

  it('l0 与 builtin 同 id 时都能装配，且 l0 不吞掉 builtin 的其它类型', () => {
    clearSchemas()
    putMany('builtin', [stubSchema('dup:shadowed'), stubSchema('dup:only-builtin')])
    putMany('l0', [stubSchema('dup:shadowed'), stubSchema('dup:only-l0')])
    applyMerge({})

    const ids = schemaIds()
    expect(ids).toContain('dup:shadowed')
    expect(ids).toContain('dup:only-builtin')
    expect(ids).toContain('dup:only-l0')
  })

  it('clearSchemas 之后 l0 层不残留（换包重建的前提）', () => {
    clearSchemas()
    putMany('l0', [stubSchema('l0test:ghost')])
    applyMerge({})
    expect(getSchema('l0test:ghost')).not.toBeNull()

    clearSchemas()
    applyMerge({})
    expect(getSchema('l0test:ghost')).toBeNull()
  })
})
