/**
 * B121/S-3：schema 变更互斥（pin/unpin vs ensureSchemas 重建）。
 * 红-绿取证：revert registry.ts(withSchemaMutation/pinSchema 纳锁) → 本文件变红。
 *
 * 背景：pinSchema 的「内存 set → await persistPinned」窗口若与重建的
 * 「clearSchemas（清空 pinned）→ loadPinned（读旧盘）」重叠，用户钉住会从内存消失，
 * 且后续任意 persistPinned 把不含它的列表整体写盘（静默永久删除）。
 */
import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/schema-mutex-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { withSchemaMutation, pinSchema, unpinSchema, pinnedIds, clearSchemas, loadPinned, setPinnedSchemaPath } from '@main/schema/registry'
import type { RecipeTypeSchema } from '@shared/types'

const pinFile = join(process.cwd(), `.vitest-tmp/schema-mutex-${process.pid}/customRecipeTypes.json`)

function schemaOf(id: string): RecipeTypeSchema {
  return {
    id,
    displayName: id,
    modId: id.split(':')[0] ?? id,
    modDisplayName: id,
    source: 'builtin',
    layoutKind: 'custom',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

describe('S-3 withSchemaMutation 串行化', () => {
  it('前序变更完成前，后续变更不得进入（顺序保持）', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const order: string[] = []
    const first = withSchemaMutation(async () => {
      await gate
      order.push('first')
    })
    const second = withSchemaMutation(async () => {
      order.push('second')
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual([])
    release()
    await Promise.all([first, second])
    expect(order).toEqual(['first', 'second'])
  })

  it('前序变更抛错不阻塞后续变更（链不断）', async () => {
    await expect(
      withSchemaMutation(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    const order: string[] = []
    await withSchemaMutation(async () => {
      order.push('after-failure')
    })
    expect(order).toEqual(['after-failure'])
  })
})

describe('S-3 钉住与重建（clearSchemas→loadPinned）互斥', () => {
  it('重建清空+重读盘后，随后落下的钉住写入磁盘并在下一次重建中幸存', async () => {
    await fsp.mkdir(join(pinFile, '..'), { recursive: true })
    await fsp.rm(pinFile, { force: true })
    setPinnedSchemaPath(() => pinFile)
    clearSchemas()
    await loadPinned()
    // 先跑一次完整重建等价物（清空 + 从空盘重读）
    expect(pinnedIds()).toEqual([])
    // 钉住落在重建之后：内存 + 磁盘一致
    const pinned = await pinSchema(schemaOf('demo:mutex_a'))
    expect(pinned.pinned).toBe(true)
    // 再来一次重建：从磁盘读回，钉住不丢（互斥保证 persist 完成后 clearSchemas 才能跑）
    clearSchemas()
    await loadPinned()
    expect(pinnedIds()).toContain('demo:mutex_a')
    await unpinSchema('demo:mutex_a')
    expect(pinnedIds()).not.toContain('demo:mutex_a')
    await fsp.rm(pinFile, { force: true })
  })

  it('并发多个 pin：全部落内存并全部持久化', async () => {
    await fsp.mkdir(join(pinFile, '..'), { recursive: true })
    await fsp.rm(pinFile, { force: true })
    setPinnedSchemaPath(() => pinFile)
    clearSchemas()
    await loadPinned()
    await Promise.all([pinSchema(schemaOf('demo:m1')), pinSchema(schemaOf('demo:m2')), pinSchema(schemaOf('demo:m3'))])
    const ids = pinnedIds()
    expect(ids).toContain('demo:m1')
    expect(ids).toContain('demo:m2')
    expect(ids).toContain('demo:m3')
    // 磁盘与内存一致（最后一批 persist 不丢早前的 pin）
    clearSchemas()
    await loadPinned()
    expect(pinnedIds()).toEqual(expect.arrayContaining(['demo:m1', 'demo:m2', 'demo:m3']))
    for (const id of ['demo:m1', 'demo:m2', 'demo:m3']) await unpinSchema(id)
    await fsp.rm(pinFile, { force: true })
  })
})
