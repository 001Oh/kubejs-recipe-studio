/**
 * 通用三区布局：激活物单独成区（琥珀色）→ 材料 → 箭头 → 产物，其余字段进下方附加区。
 * 无 schema（通用模式 / 三级降级）时退到 inputs / outputs 两个伪字段，仍走同一套控件。
 */
import { useDroppable } from '@dnd-kit/core'
import type { JSX } from 'react'
import type { RecipeTypeSchema } from '@shared/types'
import { bucketFields, isActivatorField } from '../fieldModel'
import { FieldControl } from '../controls/FieldControl'
import { FieldList, InputsOf, OutputsOf, Zone } from './ZoneShell'
import { placeOnSurface } from '../useBenchInteractions'

export function ZoneBoard({
  schema,
  narrow,
  scope
}: {
  schema: RecipeTypeSchema | null
  narrow: boolean
  /** 序列步骤内的字段用 step:N: 前缀寻址，同一套控件复用 */
  scope?: string
}): JSX.Element {
  const surface = useDroppable({ id: 'slot:surface' })
  const buckets = bucketFields(schema)
  const inputs = schema ? buckets.inputs : InputsOf({ schema: null })
  const outputs = schema ? buckets.outputs : OutputsOf({ schema: null })
  const activators = inputs.filter(isActivatorField)
  const materials = inputs.filter((field) => !isActivatorField(field))
  const extras = schema ? [...buckets.extras, ...buckets.requirements.filter((f) => !buckets.extras.includes(f))] : []

  return (
    <div
      ref={surface.setNodeRef}
      className={`bench-board${narrow ? ' narrow' : ''}${surface.isOver ? ' dropping' : ''}`}
      onClick={placeOnSurface}
    >
      <div className="board-left">
        {activators.length > 0 ? (
          <Zone zone="activator" title="激活物" note="点向仪式方块使用，不是丢进去的消耗材料">
            {activators.map((field) => (
              <FieldControl key={field.key} field={field} scope={scope} />
            ))}
          </Zone>
        ) : null}
        <Zone zone="input" title="材料">
          <FieldList fields={materials} scope={scope} emptyHint="从侧边栏拖入，或双击空格选择物品" />
        </Zone>
      </div>
      <span className={`flow-arrow${narrow ? ' down' : ''}`} aria-hidden="true">
        {narrow ? '↓' : '→'}
      </span>
      <div className="board-right">
        <Zone
          zone="output"
          title="产物"
          note={schema?.supportsChance ? '概率：右键槽位 → 设置数量' : undefined}
        >
          <FieldList fields={outputs} scope={scope} emptyHint="此类型无产物字段" />
        </Zone>
      </div>
      {extras.length > 0 ? (
        <div className="board-extra">
          <Zone zone="extra" title="附加槽位">
            <FieldList fields={extras} scope={scope} />
          </Zone>
        </div>
      ) : null}
    </div>
  )
}
