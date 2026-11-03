/**
 * kind → 控件的唯一分派表（规格 3.4「参数→控件映射表」）。
 * 这里的 switch 只看 `kind` 与 `multiple`，代码里不存在任何按配方类型 ID 的分支。
 */
import type { JSX } from 'react'
import type { RecipeSlotSchema } from '@shared/types'
import { isReferenceKind } from '../fieldModel'
import { FieldShell } from './FieldShell'
import { MultiSlotControl, SingleItemControl } from './ItemControls'
import { FluidControl, TagControl } from './RefControls'
import { RegistryControl } from './RegistryControl'
import { BooleanControl, ChoiceControl, NumberControl, TextControl } from './ScalarControls'
import { BlockstateControl, NbtControl, UnknownControl } from './ComplexControls'
import type { ControlProps } from './controlProps'

/** struct 子字段在字典里以 `父键.子键` 寻址，写回时还原成嵌套对象 */
export function childField(parent: RecipeSlotSchema, child: RecipeSlotSchema): RecipeSlotSchema {
  return { ...child, key: `${parent.key}.${child.key}`, displayName: child.displayName || parent.displayName }
}

function StructControl({ field, scope, size }: ControlProps): JSX.Element {
  const children = field.fields ?? []
  return (
    <FieldShell field={field}>
      <div className={`struct-box${field.orientation === 'vertical' ? ' vertical' : ''}`}>
        {children.length === 0 ? <p className="aux">schema 未声明子字段</p> : null}
        {children.map((child) => (
          <FieldControl key={child.key} field={childField(field, child)} scope={scope} size={size} />
        ))}
      </div>
    </FieldShell>
  )
}

/** 单值形态：一个 kind 一个控件 */
function KindControl(props: ControlProps): JSX.Element {
  switch (props.field.kind) {
    case 'item':
      return <SingleItemControl {...props} />
    case 'fluid':
      return <FluidControl {...props} />
    case 'tag':
      return <TagControl {...props} />
    case 'registry':
      return <RegistryControl {...props} />
    case 'number':
      return <NumberControl {...props} />
    case 'boolean':
      return <BooleanControl {...props} />
    case 'choice':
      return <ChoiceControl {...props} />
    case 'text':
      return <TextControl {...props} />
    case 'nbt':
      return <NbtControl {...props} />
    case 'blockstate':
      return <BlockstateControl {...props} />
    case 'struct':
      return <StructControl {...props} />
    case 'unknown':
      return <UnknownControl {...props} />
  }
}

export function FieldControl(props: ControlProps): JSX.Element {
  const { field } = props
  if (field.multiple && isReferenceKind(field.kind)) {
    return <MultiSlotControl {...props} renderRow={(index) => <KindControl {...props} index={index} />} />
  }
  return <KindControl {...props} />
}
