/**
 * BUG-HUNT-03 处理 REM-03 / REM-04：`applyMerge()` 的契约与「快照 vs 当前状态」边界。
 *
 * REM-03 结论（本轮核实后确认，不改实现）：`applyMerge()` **是幂等的**——
 * 开头 `effective.clear()` 后完全由当前各层内容重建，同一输入重复执行结果一致，
 * 且不会累积已消失的类型。多一次调用的代价只是一次合并的 CPU，不产生错误状态。
 * 本文件把该契约固化为可执行断言。
 *
 * REM-04 结论：`allSchemas()` / `listSchemas()` 返回**数组快照**（调用时的新数组），
 * `getSchema()` 返回**当前对象**。调用方若长期持有旧对象，看到的是旧状态——这是设计允许的
 * （只读快照），但**不能**把旧快照当成最新状态。本文件同时证明「重新取 getter 能拿到当前值」。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh03-merge-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const PIN_FILE = join(mkdtempSync(join(tmpdir(), 'bh03-merge-')), 'customRecipeTypes.json')

function slot(key: string, zone: RecipeSlotSchema['zone'] = 'input'): RecipeSlotSchema {
  return { key, displayName: key, kind: 'text', multiple: false, zone }
}

function schema(id: string, source: RecipeTypeSchema['source'], over: Partial<RecipeTypeSchema> = {}): RecipeTypeSchema {
  return {
    id,
    displayName: `${source}:${id}`,
    modId: id.split(':')[0] ?? 'x',
    modDisplayName: id.split(':')[0] ?? 'x',
    source,
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [slot('input')],
    outputs: [slot('result', 'output')],
    channel: 'datapack-json',
    capability: 'compatible',
    ...over
  }
}

async function boot() {
  vi.resetModules()
  const registry = await import('@main/schema/registry')
  registry.setPinnedSchemaPath(() => PIN_FILE)
  registry.clearSchemas()
  return registry
}

describe('REM-03：applyMerge 的幂等与所有权契约', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('同样的层内容连续合并两次，结果深度相等', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:a', 'builtin'))

    r.applyMerge({})
    const first = JSON.stringify(r.getSchema('demo:a'))
    r.applyMerge({})
    const second = JSON.stringify(r.getSchema('demo:a'))

    expect(second).toBe(first)
  })

  it('连续合并三次不累积：结论只由当前层决定', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:b', 'builtin'))
    for (let i = 0; i < 3; i += 1) r.applyMerge({})

    expect(r.schemaIds()).toEqual(['demo:b'])
    expect(r.allSchemas()).toHaveLength(1)
  })

  it('类型从层里消失后重新合并，不得残留在生效表', async () => {
    const r = await boot()
    r.putLayer('plugin', schema('demo:gone', 'plugin'))
    r.applyMerge({})
    expect(r.getSchema('demo:gone')).not.toBeNull()

    r.replaceLayer('plugin', [])
    r.applyMerge({})

    expect(r.getSchema('demo:gone')).toBeNull()
    expect(r.schemaIds()).not.toContain('demo:gone')
  })

  it('新增 → 删除 → 重新加入，三次之后结果与首次一致', async () => {
    const r = await boot()
    r.putLayer('plugin', schema('demo:x', 'plugin'))
    r.applyMerge({})
    const first = JSON.stringify(r.getSchema('demo:x'))

    r.replaceLayer('plugin', [])
    r.applyMerge({})
    expect(r.getSchema('demo:x')).toBeNull()

    r.replaceLayer('plugin', [schema('demo:x', 'plugin')])
    r.applyMerge({})
    expect(JSON.stringify(r.getSchema('demo:x'))).toBe(first)
  })

  it('同一 id 同时存在于 builtin 与 plugin：plugin 胜，且与 putLayer 顺序无关', async () => {
    const a = await boot()
    a.putLayer('builtin', schema('demo:same', 'builtin', { displayName: '内置' }))
    a.putLayer('plugin', schema('demo:same', 'plugin', { displayName: '插件' }))
    a.applyMerge({})
    const order1 = a.getSchema('demo:same')?.displayName

    const b = await boot()
    b.putLayer('plugin', schema('demo:same', 'plugin', { displayName: '插件' }))
    b.putLayer('builtin', schema('demo:same', 'builtin', { displayName: '内置' }))
    b.applyMerge({})
    const order2 = b.getSchema('demo:same')?.displayName

    expect(order1).toBe('插件')
    expect(order2).toBe('插件')
  })

  it('钉住层覆盖 plugin 与 builtin（用户覆盖边界）', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:pin', 'builtin', { displayName: '内置' }))
    r.putLayer('plugin', schema('demo:pin', 'plugin', { displayName: '插件' }))
    r.applyMerge({})

    await r.pinSchema(schema('demo:pin', 'builtin', { displayName: '用户钉住' }))
    r.applyMerge({})

    expect(r.getSchema('demo:pin')?.displayName).toBe('用户钉住')
    expect(r.getSchema('demo:pin')?.pinned).toBe(true)
  })
})

describe('REM-04：快照与当前状态的边界', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allSchemas() 是数组快照：之后层变化不会改写已取到的数组', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:s1', 'builtin'))
    r.applyMerge({})

    const snapshot = r.allSchemas()
    expect(snapshot.map((s) => s.id)).toEqual(['demo:s1'])

    r.putLayer('builtin', schema('demo:s2', 'builtin'))
    r.applyMerge({})

    // 旧快照保持不变（只读快照语义）
    expect(snapshot.map((s) => s.id)).toEqual(['demo:s1'])
    // 重新取 getter 才能看到当前状态
    expect(r.allSchemas().map((s) => s.id).sort()).toEqual(['demo:s1', 'demo:s2'])
  })

  it('层更新后 getSchema 返回当前对象，旧引用不等于最新状态', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:ref', 'builtin', { displayName: '旧版本' }))
    r.applyMerge({})
    const oldRef = r.getSchema('demo:ref')

    r.putLayer('builtin', schema('demo:ref', 'builtin', { displayName: '新版本' }))
    r.applyMerge({})

    const newRef = r.getSchema('demo:ref')
    expect(newRef?.displayName).toBe('新版本')
    expect(oldRef?.displayName).toBe('旧版本') // 旧快照不被就地改写
    expect(newRef).not.toBe(oldRef) // 重新合并产生新对象，而不是原地修改
  })

  it('listSchemas() 每次都反映当前生效表', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:l1', 'builtin'))
    r.applyMerge({})
    expect(r.listSchemas().map((s) => s.id)).toEqual(['demo:l1'])

    r.replaceLayer('builtin', [schema('demo:l1', 'builtin'), schema('demo:l2', 'builtin')])
    r.applyMerge({})
    expect(r.listSchemas().map((s) => s.id).sort()).toEqual(['demo:l1', 'demo:l2'])
  })

  it('快照数组本身不可被外部改动影响注册表（返回的是副本）', async () => {
    const r = await boot()
    r.putLayer('builtin', schema('demo:copy', 'builtin'))
    r.applyMerge({})

    const snapshot = r.allSchemas()
    snapshot.length = 0

    expect(r.getSchema('demo:copy')).not.toBeNull()
    expect(r.allSchemas()).toHaveLength(1)
  })
})
