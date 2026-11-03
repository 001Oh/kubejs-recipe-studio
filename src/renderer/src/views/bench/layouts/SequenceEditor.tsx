/**
 * 序列编辑器（Create 序列组装 / nested recipe，规格 3.6.12 原语 6）。
 * 步骤数组存进通用字典的 `steps` 键，撤销/重做与切换类型的保留策略自动生效；
 * 每步按该子类型自己的 schema 渲染 —— 还是那 11 个控件，没有为 Create 写专属界面。
 */
import type { JSX } from 'react'
import { useEffect, useMemo } from 'react'
import type { RecipeTypeSchema, SequenceStep } from '@shared/types'
import { ItemSlot } from '../../../components/ItemSlot'
import { useBenchStore } from '../../../store/benchStore'
import { encodeSlot } from '../slotAddress'
import { asSlot, useFieldValue } from '../valueAccess'
import { useBenchUiStore } from '../benchUiStore'
import { FieldControl } from '../controls/FieldControl'
import { useSlotBinding } from '../controls/useSlotBinding'
import { GENERIC_OUTPUT_FIELD, Zone } from './ZoneShell'
import { ZoneBoard } from './ZoneBoard'

export const STEPS_KEY = 'steps'
export const TRANSITIONAL_KEY = 'transitionalItem'
export const LOOPS_KEY = 'loops'

function stepArray(value: unknown): SequenceStep[] {
  return Array.isArray(value) ? (value as SequenceStep[]) : []
}

function writeSteps(steps: SequenceStep[]): void {
  useBenchStore.getState().setValue(STEPS_KEY, steps)
}

function patchStep(index: number, patch: Partial<SequenceStep>): void {
  const steps = stepArray(useBenchStore.getState().bench.values[STEPS_KEY])
  const target = steps[index]
  if (!target) return
  steps[index] = { ...target, ...patch }
  writeSteps(steps)
}

function addStep(typeId: string): void {
  const steps = stepArray(useBenchStore.getState().bench.values[STEPS_KEY])
  steps.push({ key: `step-${steps.length + 1}`, typeId, values: {} })
  writeSteps(steps)
}

function removeStep(index: number): void {
  const steps = stepArray(useBenchStore.getState().bench.values[STEPS_KEY])
  steps.splice(index, 1)
  writeSteps(steps)
}

function moveStep(index: number, delta: -1 | 1): void {
  const steps = stepArray(useBenchStore.getState().bench.values[STEPS_KEY])
  const to = index + delta
  if (to < 0 || to >= steps.length) return
  const [hit] = steps.splice(index, 1)
  if (hit) steps.splice(to, 0, hit)
  writeSteps(steps)
}

function StepCard({
  index,
  step,
  schema,
  narrow,
  isLast,
  candidates
}: {
  index: number
  step: SequenceStep
  schema: RecipeTypeSchema | null
  narrow: boolean
  isLast: boolean
  candidates: { id: string; displayName: string }[]
}): JSX.Element {
  return (
    <article className="step-card">
      <header className="step-head">
        <span className="step-no">步骤 {index + 1}</span>
        <select
          className="input step-type"
          value={step.typeId}
          title="选择该步的子配方类型（候选来自 schema:list）"
          onChange={(e) => {
            const typeId = e.target.value
            void useBenchUiStore.getState().ensureSchema(typeId).then(() => patchStep(index, { typeId, values: {} }))
          }}
        >
          {candidates.length === 0 ? <option value={step.typeId}>{step.typeId || '未选择子类型'}</option> : null}
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <span className="topbar-spacer" />
        <button className="btn micro" disabled={index === 0} onClick={() => moveStep(index, -1)} title="上移">
          ↑
        </button>
        <button className="btn micro" disabled={isLast} onClick={() => moveStep(index, 1)} title="下移">
          ↓
        </button>
        <button className="btn micro" onClick={() => removeStep(index)} title="删除该步骤">
          删除
        </button>
      </header>
      <div className="step-body">
        <ZoneBoard schema={schema} narrow={narrow} scope={`step:${index}:`} />
      </div>
    </article>
  )
}

function TransitionalSlot(): JSX.Element {
  const value = asSlot(useFieldValue(TRANSITIONAL_KEY))
  const slotId = encodeSlot({ kind: 'value', key: TRANSITIONAL_KEY })
  const binding = useSlotBinding({ slotId, value, kind: 'item', nameZh: '过渡物品' })
  return (
    <div className="transitional">
      <span className="aux">过渡物品（序列结束时被消耗的半成品）</span>
      <div className="slot-line">
        <ItemSlot {...binding} />
        <input
          className="input mono"
          placeholder="create:incomplete_x"
          value={value?.id ?? ''}
          onChange={(e) =>
            useBenchStore.getState().setValue(TRANSITIONAL_KEY, { kind: 'item', id: e.target.value, count: 1 })
          }
        />
      </div>
    </div>
  )
}

export function SequenceEditor({ narrow }: { narrow: boolean }): JSX.Element {
  const steps = stepArray(useFieldValue(STEPS_KEY))
  const cache = useBenchUiStore((s) => s.schemaCache)
  const summaries = useBenchUiStore((s) => s.summaries)
  const ensureSchema = useBenchUiStore((s) => s.ensureSchema)
  const loops = useFieldValue(LOOPS_KEY)

  const candidates = useMemo(
    () =>
      summaries
        .filter((s) => s.group !== 'generic')
        .map((s) => ({ id: s.id, displayName: `${s.modDisplayName || s.modId} · ${s.displayName}` })),
    [summaries]
  )

  // 未缓存的子类型 schema 补齐后自动重渲染（缓存写在 benchUiStore 里）
  const missing = steps.filter((step) => step.typeId && cache[step.typeId] === undefined).map((step) => step.typeId)
  useEffect(() => {
    for (const typeId of missing) void ensureSchema(typeId)
  }, [missing.join('|'), ensureSchema])

  return (
    <div className="sequence-editor">
      <div className="steps-col">
        {steps.length === 0 ? (
          <Zone
            zone="extra"
            title="序列步骤"
            note="Create 序列组装通常需要 2–6 步（部署 / 切割 / 压印 / 灌注），每步是一个完整子配方。"
          >
            <button className="btn" onClick={() => addStep(candidates[0]?.id ?? '')}>
              + 添加第一步
            </button>
          </Zone>
        ) : null}
        {steps.map((step, index) => (
          <StepCard
            key={step.key || index}
            index={index}
            step={step}
            schema={cache[step.typeId] ?? null}
            narrow={narrow}
            isLast={index === steps.length - 1}
            candidates={candidates}
          />
        ))}
        {steps.length > 0 ? (
          <button className="btn" onClick={() => addStep(candidates[0]?.id ?? '')}>
            + 添加步骤
          </button>
        ) : null}
      </div>
      <aside className="sequence-tail">
        <Zone zone="output" title="最终产物">
          <FieldControl field={GENERIC_OUTPUT_FIELD} />
        </Zone>
        <TransitionalSlot />
        <div className="loops">
          <label className="aux" htmlFor="bench-loops">
            循环次数
          </label>
          <input
            id="bench-loops"
            className="input number-input"
            type="number"
            min={1}
            value={typeof loops === 'number' ? loops : 1}
            onChange={(e) => useBenchStore.getState().setValue(LOOPS_KEY, Number(e.target.value) || 1)}
          />
          <span className="aux">整段序列重复执行的次数</span>
        </div>
      </aside>
    </div>
  )
}
