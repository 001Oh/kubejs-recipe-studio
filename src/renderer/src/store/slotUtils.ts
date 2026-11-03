/** 槽位值的显示与解析辅助（渲染端）。 */
import type { SlotValue } from '@shared/types'

/** `2x minecraft:diamond` / `#forge:ingots/iron` / 纯 ID → SlotValue；非法输入返回 null */
export function parseSlotInput(raw: string, fallbackKind: SlotValue['kind'] = 'item'): SlotValue | null {
  const text = raw.trim()
  if (text === '') return null
  if (text.startsWith('#')) return { kind: 'tag', id: text.slice(1) }
  const m = /^(\d{1,3})x\s+(.+)$/i.exec(text)
  if (m) {
    const count = Number.parseInt(m[1], 10)
    if (count > 0) return { kind: text.includes(':') ? fallbackKind : fallbackKind, id: m[2].trim(), count }
  }
  if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(text)) return { kind: fallbackKind, id: text, count: 1 }
  return { kind: fallbackKind, id: text, count: 1 }
}

export function slotLabel(value: SlotValue | null): string {
  if (!value) return ''
  if (value.kind === 'tag') return `#${value.id}`
  return value.id
}

export function formatChance(chance: number | undefined): string | null {
  if (chance === undefined || chance >= 1) return null
  const pct = Math.round(chance * 1000) / 10
  return `${pct}%`
}

/** 数量徽章：1 不显示（规格 3.9.4） */
export function countBadge(value: SlotValue | null): string | null {
  if (!value) return null
  if (value.kind === 'fluid' || value.kind === 'registry') {
    const amount = value.amount ?? 0
    return amount > 0 ? `${amount}` : null
  }
  const count = value.count ?? 1
  return count > 1 ? `${count}` : null
}

export function clampCount(n: number, min = 1, max = 64): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function slotTitle(value: SlotValue | null, nameZh?: string): string {
  if (!value) return '空槽位'
  const parts = [nameZh ?? value.id, value.id]
  if (value.count && value.count > 1) parts.push(`×${value.count}`)
  if (value.amount) parts.push(`${value.amount} mB`)
  const chance = formatChance(value.chance)
  if (chance) parts.push(`概率 ${chance}`)
  return parts.join('\n')
}

/** 注册表槽缩写角标（规格 3.4：唯一允许不用真实贴图的地方） */
export function registryAbbr(registryType: string | undefined): 'INF' | 'GAS' | 'SLR' | 'PGM' | 'REG' {
  const r = (registryType ?? '').toLowerCase()
  if (r.includes('infuse')) return 'INF'
  if (r.includes('gas')) return 'GAS'
  if (r.includes('slurry')) return 'SLR'
  if (r.includes('pigment')) return 'PGM'
  return 'REG'
}
