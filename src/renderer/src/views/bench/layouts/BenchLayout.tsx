/** 布局分派：只看 layoutKind（规格 3.4 布局映射），绝不影响控件层的 kind 分派。 */
import type { JSX } from 'react'
import type { LayoutKind, RecipeTypeSchema } from '@shared/types'
import { ZoneBoard } from './ZoneBoard'
import { ShapedGrid } from './ShapedGrid'
import { CustomGrid } from './CustomGrid'
import { SequenceEditor } from './SequenceEditor'

export function BenchLayout({
  layoutKind,
  schema,
  narrow
}: {
  layoutKind: LayoutKind
  schema: RecipeTypeSchema | null
  narrow: boolean
}): JSX.Element {
  switch (layoutKind) {
    case 'shaped':
      return <ShapedGrid schema={schema} narrow={narrow} />
    case 'custom':
      return schema ? (
        <CustomGrid schema={schema} narrow={narrow} />
      ) : (
        <ZoneBoard schema={null} narrow={narrow} />
      )
    case 'sequence':
      return <SequenceEditor narrow={narrow} />
    case 'shapeless':
    case 'single_io':
    case 'multi_io':
      return <ZoneBoard schema={schema} narrow={narrow} />
  }
}
