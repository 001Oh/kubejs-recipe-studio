/**
 * 配方载入工作台的唯一实现（卡片与右侧详情共用，避免两套逻辑漂移）。
 * 只做"取原始数据 → 交给 benchStore"的编排，业务规则仍在 store/主进程。
 */
import type { RecipeRecord } from '@shared/types'
import { call } from '../../api'
import { useAppStore } from '../../store/appStore'
import { useBenchStore } from '../../store/benchStore'
import { pilotEnabled } from '../../store/draftBridge'

/** 旧链路没有 schema 布局信息，按类型粗分：只有有序合成本身是网格 */
export function layoutForRecord(record: RecipeRecord): 'shaped' | 'multi_io' {
  return record.type === 'minecraft:crafting_shaped' ? 'shaped' : 'multi_io'
}

export async function loadRecipeToBench(record: RecipeRecord): Promise<{ ok: boolean; conflict?: boolean }> {
  const app = useAppStore.getState()
  const bench = useBenchStore.getState()
  app.selectRecipe(record)

  /** 试点类型走 recipes:open（原始为权威）；其余类型保持旧链路不变 */
  if (!pilotEnabled(app.ui?.benchV2 ?? [], record.type)) {
    bench.loadFromRecipe(record, layoutForRecord(record), record.type)
    app.setView('bench')
    return { ok: true }
  }

  const opened = await call('recipes:open', { uid: record.uid })
  if (!opened) return { ok: false }
  if (!opened.normalized) {
    app.toast(
      opened.status === 'raw-missing' ? '源文件已失效，无法载入完整配方（仍可查看摘要）' : '配方原始 JSON 已损坏，无法载入',
      'error'
    )
    return { ok: false }
  }
  const res = bench.loadOpenedRecipe(opened)
  app.setView('bench')
  if (!res.ok && res.conflict) {
    app.toast('原始配方已变化：请在「工作台」里选择重新载入 / 保留我的 / 另存副本', 'warn')
  }
  return { ok: res.ok, conflict: res.conflict }
}
