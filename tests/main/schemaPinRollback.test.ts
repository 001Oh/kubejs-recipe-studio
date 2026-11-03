/**
 * BUG-HUNT-02-RV1 修复 RV1-001：pin / unpin 写盘失败时必须回滚内存。
 *
 * 背景：`pinSchema` 先 `pinned.set` + `effective.set`，再 `await persistPinned()`。
 * 写盘失败时错误虽然会抛给调用方（UI 会看到"钉住失败"），但内存已经被改过：
 * 本会话里该类型**实际已钉住**，重启后又静默回退——用户看到"我明明钉过又没了"。
 *
 * 复现手法：把 pinned 文件路径指向一个**已存在的目录**，`writeJson` 的 rename 会因目标是
 * 目录而失败（不依赖 mock，也不碰真实 userData）。
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecipeTypeSchema } from '@shared/types'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/bh02-pinrollback-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

const WORK = mkdtempSync(join(tmpdir(), 'bh02-pinrollback-'))
/** 合法的写盘目标（文件） */
const GOOD_PATH = join(WORK, 'customRecipeTypes.json')
/** 故意的非法目标（目录）→ writeJson 的 rename 失败 */
const BAD_PATH = join(WORK, 'as-directory')
// 让它真实存在且是目录：writeJson 的 rename(tmp → BAD_PATH) 会失败
mkdirSync(BAD_PATH, { recursive: true })

const TYPE = 'demo:rollback'

function demo(): RecipeTypeSchema {
  return {
    id: TYPE,
    displayName: '回滚测试',
    modId: 'demo',
    modDisplayName: 'demo',
    source: 'builtin',
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [{ key: 'input', displayName: 'input', kind: 'item', multiple: false, zone: 'input', required: true }],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

async function boot() {
  vi.resetModules()
  const registry = await import('@main/schema/registry')
  registry.clearSchemas()
  registry.putLayer('builtin', demo())
  registry.applyMerge({})
  return registry
}

describe('pin / unpin 写盘失败时回滚内存（RV1-001）', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('pin 写盘失败：抛错、pinned 不新增、effective 保持原值', async () => {
    const registry = await boot()
    // 目录已存在，writeJson 的 rename 目标非法
    registry.setPinnedSchemaPath(() => BAD_PATH)

    await expect(registry.pinSchema({ ...demo(), displayName: '不该生效' })).rejects.toThrow()

    expect(registry.pinnedIds()).not.toContain(TYPE)
    expect(registry.getSchema(TYPE)?.source).toBe('builtin')
    expect(registry.getSchema(TYPE)?.displayName).toBe('回滚测试')
  })

  it('pin 写盘成功：pinned 新增且 effective 变成 custom', async () => {
    const registry = await boot()
    registry.setPinnedSchemaPath(() => GOOD_PATH)

    const pinned = await registry.pinSchema({ ...demo(), displayName: '应生效' })

    expect(pinned.pinned).toBe(true)
    expect(registry.pinnedIds()).toContain(TYPE)
    expect(registry.getSchema(TYPE)?.source).toBe('custom')
    expect(registry.getSchema(TYPE)?.displayName).toBe('应生效')
  })

  it('unpin 写盘失败：抛错且 pinned 仍然保留（不能悄悄取消）', async () => {
    const registry = await boot()
    registry.setPinnedSchemaPath(() => GOOD_PATH)
    await registry.pinSchema({ ...demo(), displayName: '先钉住' })

    registry.setPinnedSchemaPath(() => BAD_PATH)
    await expect(registry.unpinSchema(TYPE)).rejects.toThrow()

    expect(registry.pinnedIds()).toContain(TYPE)
    expect(registry.getSchema(TYPE)?.source).toBe('custom')
  })

  it('unpin 写盘成功：pinned 移除', async () => {
    const registry = await boot()
    registry.setPinnedSchemaPath(() => GOOD_PATH)
    await registry.pinSchema({ ...demo(), displayName: '先钉住' })

    await expect(registry.unpinSchema(TYPE)).resolves.toBe(true)

    expect(registry.pinnedIds()).not.toContain(TYPE)
  })

  it('对未钉住的类型 unpin：返回 false，且不触碰磁盘', async () => {
    const registry = await boot()
    registry.setPinnedSchemaPath(() => BAD_PATH)

    await expect(registry.unpinSchema('never:pinned')).resolves.toBe(false)
  })
})
