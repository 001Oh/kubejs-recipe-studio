/**
 * custom 布局：按 schema 的 `cells` 坐标数组绝对定位（Botania 花瓣药房 16 格环形 + 中心物品）。
 * 坐标只决定视觉位置，值仍写进通用字典的对应键，因此与网格/列表布局共用同一套落点逻辑。
 */
import { useMemo } from 'react'
import type { JSX } from 'react'
import type { RecipeSlotSchema, RecipeTypeSchema } from '@shared/types'
import { ItemSlot } from '../../../components/ItemSlot'
import { GRID_MAX_SIZE } from '@shared/constants'
import { allFieldsFlat, bucketFields } from '../fieldModel'
import { encodeSlot } from '../slotAddress'
import { asSlot } from '../valueAccess'
import { useBenchStore } from '../../../store/benchStore'
import { cellPixelSize } from '../gridModel'
import { useBenchUiStore } from '../benchUiStore'
import { useElementWidth } from '../useElementWidth'
import { FieldControl } from '../controls/FieldControl'
import { useSlotBinding } from '../controls/useSlotBinding'
import { SLOT_PX } from '../controls/controlProps'
import { FieldList, Zone } from './ZoneShell'

/** cells 里出现但 schema 未声明的键：仍给一个可拖放的空槽，避免坐标位丢失 */
function LooseCell({ cellKey, size }: { cellKey: string; size: number }): JSX.Element {
  const bench = useBenchStore((s) => s.bench)
  const value = asSlot(bench.values[cellKey])
  const binding = useSlotBinding({ slotId: encodeSlot({ kind: 'value', key: cellKey }), value, kind: 'item' })
  return <ItemSlot {...binding} size={size} />
}

function Cell({ name, size, field }: { name: string; size: number; field?: RecipeSlotSchema }): JSX.Element {
  const label = size >= 40 ? name.slice(0, 3) : ''
  if (field) {
    return (
      <div className="bench-cell" title={name}>
        <FieldControl field={field} size={size} />
        {label ? <span className="cell-label aux">{label}</span> : null}
      </div>
    )
  }
  return (
    <div className="bench-cell" title={name}>
      <LooseCell cellKey={name} size={size} />
      {label ? <span className="cell-label aux">{label}</span> : null}
    </div>
  )
}

export function CustomGrid({ schema, narrow }: { schema: RecipeTypeSchema; narrow: boolean }): JSX.Element {
  const cells = schema.cells ?? []
  const fields = allFieldsFlat(schema)
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields])
  const rows = Math.min(GRID_MAX_SIZE, Math.max(schema.grid?.rows ?? 0, ...cells.map((c) => c.row + 1), 1))
  const cols = Math.min(GRID_MAX_SIZE, Math.max(schema.grid?.cols ?? 0, ...cells.map((c) => c.col + 1), 1))
  const zoom = useBenchUiStore((s) => s.zoom)
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const size = cells.length > 0 ? cellPixelSize(width > 0 ? width : 420, cols, zoom) : SLOT_PX

  const placed = new Set(cells.map((c) => c.key))
  const buckets = bucketFields(schema)
  const unplaced = [
    ...buckets.inputs.filter((f) => !placed.has(f.key)),
    ...buckets.extras.filter((f) => !placed.has(f.key))
  ]

  if (cells.length === 0) {
    return (
      <Zone zone="extra" title="坐标缺失" note="schema 未提供 cells 坐标数组，请用通用布局或原始 JSON 编辑">
        <FieldList fields={fields} />
      </Zone>
    )
  }

  return (
    <div className={`bench-board${narrow ? ' narrow' : ''}`}>
      <div className="board-left">
        <Zone
          zone="input"
          title={`${schema.displayName} · ${rows}×${cols}`}
          note="格子位置来自 schema.cells，值仍写进通用字典"
        >
          <div className="grid-scroll">
            <div
              className="cells-layer"
              ref={ref}
              style={{
                ['--cols' as string]: String(cols),
                ['--rows' as string]: String(rows),
                ['--cell' as string]: `${size}px`
              }}
            >
              {cells.map((cell) => {
                const field = byKey.get(cell.key)
                return (
                  <div
                    key={cell.key}
                    className="cells-item"
                    style={{ gridRowStart: cell.row + 1, gridColumnStart: cell.col + 1 }}
                  >
                    <Cell name={cell.key} size={size} field={field} />
                  </div>
                )
              })}
            </div>
          </div>
        </Zone>
      </div>
      <span className={`flow-arrow${narrow ? ' down' : ''}`} aria-hidden="true">
        {narrow ? '↓' : '→'}
      </span>
      <div className="board-right">
        <Zone zone="output" title="产物">
          <FieldList fields={buckets.outputs} emptyHint="此类型无产物字段" />
        </Zone>
      </div>
      {unplaced.length > 0 ? (
        <div className="board-extra">
          <Zone zone="extra" title="坐标之外的字段">
            <FieldList fields={unplaced} />
          </Zone>
        </div>
      ) : null}
    </div>
  )
}
