/**
 * P-C1 试点网格编辑：只服务 shaped 草稿（固定 44px 格子，不引入 P6 布局的宽度反馈）。
 * 写入仍走 ItemSlot → useSlotBinding → commitOps（同一套撤销/选择器/右键行为），
 * 草稿脏字段由 benchStore 标记，不另建状态。
 */
import type { JSX } from 'react'
import type { SlotValue } from '@shared/types'
import { BENCH_GRID_KEY, BENCH_OUTPUTS_KEY } from '@shared/constants'
import { ItemSlot } from '../../components/ItemSlot'
import { useBenchStore } from '../../store/benchStore'
import { useSlotBinding } from './controls/useSlotBinding'
import { CountEditor } from './overlays/CountEditor'
import { ItemPicker } from './overlays/ItemPicker'
import { encodeSlot } from './slotAddress'

const CELL = 44

function PilotCell({ index, value }: { index: number; value: SlotValue | null }): JSX.Element {
  const binding = useSlotBinding({ slotId: encodeSlot({ kind: 'grid', index }), value, kind: 'item' })
  return <ItemSlot {...binding} size={CELL} />
}

function PilotResult({ value }: { value: SlotValue | null }): JSX.Element {
  const binding = useSlotBinding({ slotId: encodeSlot({ kind: 'list', key: BENCH_OUTPUTS_KEY, index: 0 }), value, kind: 'item' })
  return <ItemSlot {...binding} size={CELL} />
}

export function PilotGridEditor(): JSX.Element | null {
  const bench = useBenchStore((s) => s.bench)
  const draft = useBenchStore((s) => s.draft)
  if (!draft || draft.schema.layoutKind !== 'shaped') return null
  const rows = bench.gridRows ?? 3
  const cols = bench.gridCols ?? 3
  const cells = Array.isArray(bench.values[BENCH_GRID_KEY]) ? (bench.values[BENCH_GRID_KEY] as (SlotValue | null)[]) : []
  const outputs = Array.isArray(bench.values[BENCH_OUTPUTS_KEY]) ? (bench.values[BENCH_OUTPUTS_KEY] as SlotValue[]) : []
  return (
    <div className="pilot-grid-editor">
      <div className="bench-row">
        <strong>有序网格 {rows}×{cols}</strong>
        <span className="aux">双击格子替换 · 右键更多 · 只改已建模字段，其余原样保留</span>
      </div>
      <div className="pilot-grid-row">
        <div className="pilot-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${CELL}px)` }} role="group" aria-label="有序合成网格">
          {Array.from({ length: rows * cols }, (_, index) => (
            <PilotCell key={index} index={index} value={cells[index] ?? null} />
          ))}
        </div>
        <span className="arrow big" aria-hidden="true">
          →
        </span>
        <div className="pilot-grid-out">
          <span className="aux">产物</span>
          <PilotResult value={outputs[0] ?? null} />
        </div>
      </div>
      {/* lite 外壳没有挂 P6 的浮层，这里随试点网格挂上，双击/右键才有反馈 */}
      <ItemPicker />
      <CountEditor />
    </div>
  )
}
