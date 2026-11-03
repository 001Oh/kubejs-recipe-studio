import { describe, expect, it } from 'vitest'
import { INVOKE_CHANNELS } from '@shared/ipc'
import type { InvokeName } from '@shared/ipc'

/** 编译期兜底：InvokeMap 里新增 channel 却忘了登记进 INVOKE_CHANNELS 时，这行直接报错 */
type NotRegistered = Exclude<InvokeName, (typeof INVOKE_CHANNELS)[number]>
const completeness: NotRegistered extends never ? true : false = true

describe('IPC 契约完整性', () => {
  it('InvokeMap 的每个 channel 都在 INVOKE_CHANNELS 中登记', () => {
    expect(completeness).toBe(true)
    expect(new Set(INVOKE_CHANNELS).size).toBe(INVOKE_CHANNELS.length)
  })

  it('通道名一律带领域前缀，便于日志与来源过滤', () => {
    for (const name of INVOKE_CHANNELS) {
      expect(name).toMatch(/^(app|ui|modpack|items|favorites|probe|recipes|schema|plugins|codegen|scripts|logs|cache):/)
    }
  })
})
