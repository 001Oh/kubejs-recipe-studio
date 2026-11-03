/** 代码生成测试夹具：只构造纯数据结构，不碰真实整合包。 */
import type {
  FieldKind,
  LayoutKind,
  ModpackInfo,
  RecipeSlotSchema,
  RecipeTypeSchema,
  SlotKind,
  SlotValue,
  WorkbenchState
} from '../../src/shared/types'

export const CREATED_AT = new Date(2026, 9, 30, 21, 40, 0).getTime()

export function sv(kind: SlotKind, id: string, extra: Partial<SlotValue> = {}): SlotValue {
  return { kind, id, ...extra }
}

export function field(key: string, kind: FieldKind, extra: Partial<RecipeSlotSchema> = {}): RecipeSlotSchema {
  return { key, displayName: key, kind, multiple: false, ...extra }
}

export function workbench(over: Partial<WorkbenchState> & { typeId: string }): WorkbenchState {
  return {
    layoutKind: 'custom',
    values: {},
    activeSlotKey: null,
    modifiers: {},
    ...over
  }
}

export function schema(over: Partial<RecipeTypeSchema> & { id: string }): RecipeTypeSchema {
  return {
    displayName: over.id,
    modId: over.id.split(':')[0] ?? 'minecraft',
    modDisplayName: over.id.split(':')[0] ?? 'minecraft',
    source: 'builtin',
    layoutKind: 'custom' as LayoutKind,
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'event-custom',
    capability: 'compatible',
    ...over
  }
}

export function modpack(over: Partial<ModpackInfo> = {}): ModpackInfo {
  return {
    path: 'C:/Fake/Modpack',
    name: 'Nomifactory GTCEu',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 412,
    detectedFrom: ['mods/forge-1.20.1-47.2.0.jar'],
    modsDir: 'C:/Fake/Modpack/mods',
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: ['kubejs', 'create'],
    ...over
  }
}

export function emptyGrid(rows: number, cols: number): (SlotValue | null)[] {
  return new Array<SlotValue | null>(rows * cols).fill(null)
}

export function putGrid(grid: (SlotValue | null)[], cols: number, row: number, col: number, value: SlotValue | null): void {
  grid[row * cols + col] = value
}

/** 取事件块内部的语句文本（丢掉头部注释块与 `})` 收尾），便于逐字符比对 §一 示例 */
export function statementsOf(code: string): string {
  const lines = code.split('\n')
  const open = lines.findIndex((l) => l.startsWith('ServerEvents.recipes(') || l.startsWith("onEvent('recipes'"))
  if (open < 0) return ''
  let end = lines.length - 1
  while (end > open && lines[end].trim() !== '})') end -= 1
  return lines.slice(open + 1, end).join('\n')
}
