/**
 * P3-16：扫描进行中拒绝缓存清理（cacheHandlers 头注释铁律第 5 条的后端落地）。
 * UI 的按钮禁用是唯一防线，绕过 UI 直接 IPC 可在扫描在途时清掉正在写的缓存。
 * 修复：clearCache 开头检查 isScanning()，命中即拒绝（SCAN_IN_PROGRESS）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({
  userData: `${process.cwd()}/.vitest-tmp/b113-cacheguard-${process.pid}`,
  scanning: false
}))

vi.mock('electron', () => ({
  app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: { openExternal: () => undefined },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined }
}))

vi.mock('../../src/main/scanOrchestrator', () => ({
  isScanning: () => H.scanning
}))

import { clearCache } from '../../src/main/handlers/cacheHandlers'

describe('P3-16 扫描进行中 cache:clear 被后端拒绝', () => {
  beforeEach(() => {
    H.scanning = false
  })

  it('isScanning()=true 时拒绝（修复前正常完成 → 红）', async () => {
    H.scanning = true
    const root = mkdtempSync(join(tmpdir(), 'b113-cg-'))
    await expect(clearCache(['index'], root)).rejects.toMatchObject({ code: 'SCAN_IN_PROGRESS' })
  })

  it('非扫描状态正常清理（守卫，防误伤）', async () => {
    H.scanning = false
    const root = mkdtempSync(join(tmpdir(), 'b113-cg-'))
    const res = await clearCache(['index'], root)
    expect(res.removed).toBe(0)
  })
})
