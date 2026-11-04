/**
 * B120/E-2：`recipes:commit` 主进程运行时校验。
 *
 * 契约：「主进程不信任渲染层」。被攻破（或出 bug）的渲染层可能发来
 * `gridRows:"9"` / `values:null` / `dirtyFields:['']` 这类畸形请求，
 * 这些输入不允许进入任何业务分支，更不允许走到写盘。
 *
 * 判据：错误码统一 `INVALID_REQUEST`，且 `writeAtomic` 零调用（说明在 IO 之前就被拒）。
 * 合法请求（含 `gridRows` 缺省）必须原样放行——用「后续流程报 NO_MODPACK / RECIPE_NOT_FOUND」
 * 反证它已通过校验闸门。
 */
import { describe, expect, it, vi } from 'vitest'
import type { CommitRecipeRequest } from '@shared/ipc'
import type { ModpackInfo } from '@shared/types'
import { commitRecipe, validateCommitRequest } from '@main/recipes/commitRecipe'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/commit-validate-userdata-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

function modpack(path: string): ModpackInfo {
  return {
    path,
    name: 'validate-pc',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: null,
    kubejsVersion: '2001.6.5',
    modCount: 1,
    detectedFrom: ['test'],
    modsDir: `${path}/mods`,
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

/** 合法基线（overwrite，shaped，含网格尺寸） */
function legal(over: Record<string, unknown> = {}): CommitRecipeRequest {
  return {
    uid: 'file:E:/pack/kubejs/data/ns/recipes/x.json',
    mode: 'overwrite',
    expectedRawHash: 'abc',
    expectedSchemaId: 'minecraft:crafting_shaped',
    expectedSchemaRevision: 1,
    workbench: {
      typeId: 'minecraft:crafting_shaped',
      layoutKind: 'shaped',
      values: {},
      gridRows: 3,
      gridCols: 3,
      activeSlotKey: null
    },
    dirtyFields: ['grid'],
    ...over
  } as CommitRecipeRequest
}

function withWorkbench(over: Record<string, unknown>): CommitRecipeRequest {
  const base = legal()
  return { ...base, workbench: { ...base.workbench, ...over } } as CommitRecipeRequest
}

describe('E-2 validateCommitRequest（纯函数）', () => {
  it('合法请求不抛错', () => {
    expect(() => validateCommitRequest(legal())).not.toThrow()
  })

  it('shaped 缺网格尺寸 → INVALID_REQUEST（禁静默按 3×3 兜底，v3 增补）', () => {
    const req = legal()
    delete (req.workbench as { gridRows?: number }).gridRows
    delete (req.workbench as { gridCols?: number }).gridCols
    expect(() => validateCommitRequest(req)).toThrowError(
      expect.objectContaining({ code: 'INVALID_REQUEST' })
    )
  })

  it('shaped 只缺一个方向的尺寸同样拒绝', () => {
    const req = legal()
    delete (req.workbench as { gridCols?: number }).gridCols
    expect(() => validateCommitRequest(req)).toThrowError(
      expect.objectContaining({ code: 'INVALID_REQUEST' })
    )
  })

  it('非 shaped 布局缺网格尺寸合法（本就不用网格）', () => {
    const req = legal({
      workbench: { typeId: 'minecraft:smelting', layoutKind: 'single_io', values: {}, activeSlotKey: null }
    })
    expect(() => validateCommitRequest(req)).not.toThrow()
  })

  it.each([
    ['gridRows 是字符串 "9"', () => withWorkbench({ gridRows: '9' })],
    ['gridRows 为 0', () => withWorkbench({ gridRows: 0 })],
    ['gridRows 为 3.5', () => withWorkbench({ gridRows: 3.5 })],
    ['gridRows 为 10（超上限）', () => withWorkbench({ gridRows: 10 })],
    ['gridCols 为 NaN', () => withWorkbench({ gridCols: Number.NaN })],
    ['values 为 null', () => withWorkbench({ values: null })],
    ['values 为数组', () => withWorkbench({ values: [] })],
    ['dirtyFields 含空串', () => legal({ dirtyFields: [''] })],
    ['dirtyFields 不是数组', () => legal({ dirtyFields: 'grid' })],
    ['dirtyFields 超过 256 项', () => legal({ dirtyFields: Array.from({ length: 257 }, (_, i) => `f${i}`) })],
    ['mode 为未知值', () => legal({ mode: 'foo' })],
    ['uid 为空', () => legal({ uid: '' })],
    ['uid 超长', () => legal({ uid: 'x'.repeat(513) })],
    ['uid 不是字符串', () => legal({ uid: 42 })],
    ['workbench 为 null', () => legal({ workbench: null })],
    ['typeId 超长', () => withWorkbench({ typeId: 'y'.repeat(513) })]
  ])('%s → INVALID_REQUEST', (_label, build) => {
    expect(() => validateCommitRequest(build())).toThrowError(
      expect.objectContaining({ code: 'INVALID_REQUEST' })
    )
  })
})

describe('E-2 commitRecipe 入口拦截（不进业务、不写盘）', () => {
  it('畸形请求在 commitRecipe 入口即被拒，writeAtomic 零调用', async () => {
    const writeAtomic = vi.fn()
    await expect(
      commitRecipe(withWorkbench({ gridRows: '9' }), { modpack: modpack('E:/no-such-pack'), writeAtomic })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(
      commitRecipe(legal({ mode: 'foo' }), { modpack: modpack('E:/no-such-pack'), writeAtomic })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(
      commitRecipe(withWorkbench({ values: null }), { modpack: modpack('E:/no-such-pack'), writeAtomic })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(writeAtomic).not.toHaveBeenCalled()
  })

  it('create 模式同样过这道闸（不因走独立分支而漏校验）', async () => {
    const writeAtomic = vi.fn()
    await expect(
      commitRecipe(
        legal({ mode: 'create', uid: '__new__:minecraft:smelting', workbench: { typeId: 'minecraft:smelting', layoutKind: 'single_io', values: {}, gridRows: '9', activeSlotKey: null } }),
        { modpack: modpack('E:/no-such-pack'), writeAtomic }
      )
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(writeAtomic).not.toHaveBeenCalled()
  })

  it('合法请求放行到后续业务（无整合包 → NO_MODPACK，证明不是被入口拦掉）', async () => {
    await expect(commitRecipe(legal(), { modpack: null })).rejects.toMatchObject({ code: 'NO_MODPACK' })
  })
})
