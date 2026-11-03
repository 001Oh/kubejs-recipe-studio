/**
 * 图标通道：iconKey = sha1(物品 ID)，与扫描器写盘时用的是同一个派生函数，
 * 因此槽位 / 卡片即使只有 ID 也能拿到贴图，不必先查物品索引。
 */
import { existsSync } from 'node:fs'
import { registerHandler } from '../ipcRegistry'
import { iconFile, iconKeyFor } from '../paths'

export function registerIconHandlers(): void {
  registerHandler('items:icons', ({ ids }) => {
    const out: Record<string, string | null> = {}
    for (const id of ids.slice(0, 2000)) {
      const key = iconKeyFor(id)
      out[id] = existsSync(iconFile(key)) ? key : null
    }
    return out
  })
}
