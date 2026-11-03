/**
 * 工作台：schema 驱动的配方编辑区（试点类型）+ 通用表单兜底（任意模组配方）。
 * 布局：会话条（试点面板）→ 编辑区 → 底部动作条；改动一律写回同一份 bench values。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { SchemaSummary } from '@shared/ipc'
import type { SlotValue } from '@shared/types'
import { callOrThrow } from '../api'
import { useAppStore } from '../store/appStore'
import { INPUTS_KEY, OUTPUTS_KEY, useBenchStore } from '../store/benchStore'
import { PilotDraftPanel } from './bench/PilotDraftPanel'
import { createBlankDraft } from '../store/draftBridge'
import { PilotGridEditor } from './bench/PilotGridEditor'
import { PilotListEditor } from './bench/PilotListEditor'
import { WriteDialog } from './bench/panels/WriteDialog'
import { useBenchInteractions } from './bench/useBenchInteractions'
import { Icon } from '../components/Icon'
import './views.css'

const GENERIC = '__generic__'

interface ExtraField {
  key: string
  json: string
}

export function BenchView(): JSX.Element {
  // W-01 链头：这个 hook 负责 DnD 落点、吸取放置与键盘（撤销/重做/清空/设为产物/Ctrl+S 写入）。
  // 它无参数、自己取 store；此前全仓只借了它的两个独立函数，hook 本体从未执行，
  // 导致 Ctrl+S 的 keydown 监听器没安装、setWriteOpen(true) 永不触发、WriteDialog 永远不可达。
  useBenchInteractions()
  const bench = useBenchStore((s) => s.bench)
  const setValue = useBenchStore((s) => s.setValue)
  const undo = useBenchStore((s) => s.undo)
  const redo = useBenchStore((s) => s.redo)
  const reset = useBenchStore((s) => s.reset)
  const loadedFrom = useBenchStore((s) => s.loadedFrom)
  const pilotDraft = useBenchStore((s) => s.draft)
  // 第 4 条：清空是破坏性操作，改两步内联确认（项目 lint 禁 window.confirm）
  const [clearArmed, setClearArmed] = useState(false)
  const [newDraftBusy, setNewDraftBusy] = useState(false)
  // B 方案：从零新建结构化配方（当前类型是试点类型、且还没有草稿时可用）
  const startBlankDraft = async (): Promise<void> => {
    if (newDraftBusy) return
    setNewDraftBusy(true)
    try {
      const schema = await callOrThrow('schema:get', { typeId: bench.typeId })
      if (!schema) {
        toast('该类型没有可用 schema，无法进入结构化编辑', 'warn')
        return
      }
      const draft = createBlankDraft(bench.typeId, schema as never)
      useBenchStore.setState({ draft, bench: draft.workbench, draftConflict: null, loadedFrom: null })
      toast('已新建空白结构化配方：填好材料与产物后提交', 'success')
    } catch (err) {
      toast(`新建失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setNewDraftBusy(false)
    }
  }
  const past = useBenchStore((s) => s.past.length)
  const onClearClick = (): void => {
    if (!clearArmed) {
      setClearArmed(true)
      window.setTimeout(() => setClearArmed(false), 3000)
      return
    }
    setClearArmed(false)
    reset()
  }
  const future = useBenchStore((s) => s.future.length)
  const pilotShaped = pilotDraft?.schema.layoutKind === 'shaped'
  const eyedropper = useAppStore((s) => s.eyedropper)
  const clearEyedropper = useAppStore((s) => s.clearEyedropper)
  const toast = useAppStore((s) => s.toast)

  const [summaries, setSummaries] = useState<SchemaSummary[]>([])
  const [typeError, setTypeError] = useState<string | null>(null)
  const [extras, setExtras] = useState<ExtraField[]>([])
  const typeInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void callOrThrow('schema:list')
      .then((res) => {
        setSummaries(res)
        setTypeError(null)
      })
      .catch((err: unknown) => {
        setSummaries([])
        setTypeError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  useEffect(() => {
    const focus = (): void => typeInput.current?.focus()
    window.addEventListener('studio:focus-type-select', focus)
    return () => window.removeEventListener('studio:focus-type-select', focus)
  }, [])

  const inputs = useMemo(() => asList(bench.values[INPUTS_KEY]), [bench.values])
  const outputs = useMemo(() => asList(bench.values[OUTPUTS_KEY]), [bench.values])
  const extrasValue = bench.values['extras']
  const pilotTypes = useAppStore((s) => s.ui?.benchV2 ?? [])
  const pilotType = pilotTypes.includes(bench.typeId)
  const isGeneric = bench.typeId === GENERIC || (summaries.length > 0 && summaries.every((s) => s.id !== bench.typeId))

  const setList = (key: string, list: SlotValue[]): void => setValue(key, list)

  const addFromEyedropper = (key: string): void => {
    if (!eyedropper) return
    const value: SlotValue = { kind: 'item', id: eyedropper.id, count: 1 }
    setList(key, [...asList(bench.values[key]), value])
    clearEyedropper()
  }

  const syncExtras = (next: ExtraField[]): void => {
    setExtras(next)
    const obj: Record<string, unknown> = {}
    for (const f of next) {
      if (!f.key) continue
      try {
        obj[f.key] = f.json.trim() === '' ? null : JSON.parse(f.json)
      } catch {
        obj[f.key] = f.json
      }
    }
    setValue('extras', obj, false)
  }

  useEffect(() => {
    if (extrasValue && typeof extrasValue === 'object' && !Array.isArray(extrasValue)) {
      const keys = Object.keys(extrasValue as Record<string, unknown>)
      setExtras((prev) =>
        prev.length === keys.length ? prev : keys.map((key) => ({ key, json: JSON.stringify((extrasValue as Record<string, unknown>)[key]) }))
      )
    }
  }, [extrasValue])

  return (
    <div className="bench">
      <header className="work-head">
        <label className="section-label bench-type-label" htmlFor="bench-type">
          配方类型
        </label>
        <div className="field bench-type-field">
          <span className="field-icon">
            <Icon name="recipe" size={14} />
          </span>
          <input
            id="bench-type"
            ref={typeInput}
            className="input mono"
            list="bench-type-options"
            value={bench.typeId}
            disabled={!!pilotDraft}
            title={pilotDraft ? '试点草稿打开时不能切换类型（先取消草稿）' : '输入或选择配方类型，Ctrl+E 聚焦'}
            onChange={(e) => useBenchStore.getState().setTypeId(e.target.value, bench.layoutKind, [], 3, 3)}
            placeholder="例如 create:mixing"
          />
        </div>
        {typeError ? (
          <span className="note-error" title={typeError}>
            配方类型列表加载失败（不是「没有类型」）：{typeError}
          </span>
        ) : null}
        <datalist id="bench-type-options">
          {summaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName} · {s.capability === 'sugar' ? '✓ 语法糖' : s.capability === 'compatible' ? '✓ 兼容' : '✗ 不支持'}
            </option>
          ))}
          <option value={GENERIC}>⚙ 通用 / 任意模组配方</option>
        </datalist>
        <span
          className={`badge${pilotDraft ? ' badge-accent' : isGeneric && !pilotType ? ' badge-warn' : ''}`}
          title={
            pilotDraft
              ? '结构化编辑：以原始 JSON 为权威，脏字段可追踪、未建模字段原样保留、提交前校验哈希'
              : '通用模式：自由表单 + 额外 JSON 字段，不就地改写原始配方'
          }
        >
          {pilotDraft ? '结构化编辑' : pilotType ? '试点类型 · 未载入' : '通用模式'}
        </span>
        {pilotType && !pilotDraft ? (
          <button
            className="btn btn-ghost tiny"
            disabled={newDraftBusy}
            title="用当前类型新建一条空白结构化配方（不基于任何已有配方）"
            onClick={() => void startBlankDraft()}
          >
            {newDraftBusy ? '新建中…' : '新建结构化配方'}
          </button>
        ) : null}
        <span className="topbar-spacer" />
        <button className="btn btn-ghost btn-icon" title="撤销（Ctrl+Z）" aria-label="撤销" disabled={past === 0} onClick={() => (undo() ? undefined : toast('没有可撤销的操作', 'info'))}>
          <Icon name="undo" size={16} />
        </button>
        <button className="btn btn-ghost btn-icon" title="重做（Ctrl+Shift+Z）" aria-label="重做" disabled={future === 0} onClick={() => (redo() ? undefined : toast('没有可重做的操作', 'info'))}>
          <Icon name="redo" size={16} />
        </button>
      </header>

      <div className="bench-scroll">
        <PilotDraftPanel />

        {loadedFrom && !pilotDraft ? (
          <div className="banner-bar banner-info">
            <span className="banner-icon">
              <Icon name="info" size={14} />
            </span>
            <span>已载入现有配方作为模板 · 修改后点「写入文件」将追加新配方，不影响原配方</span>
            <span className="topbar-spacer" />
            <button className="btn btn-ghost tiny" onClick={() => useBenchStore.setState({ loadedFrom: null })}>
              知道了
            </button>
          </div>
        ) : null}

        {pilotDraft ? (
          // 试点草稿：shaped 用网格，其余（shapeless / mixing）用统一列表；都只读写同一份 bench values
          pilotShaped ? <PilotGridEditor /> : <PilotListEditor />
        ) : (
          <>
            {inputs.length === 0 && outputs.length === 0 ? (
              <div className="bench-hint">
                <Icon name="info" size={14} />
                <span>
                  工作台是空的：在左侧搜索物品并拖进槽位，或到「配方浏览」里选一条现有配方点「载入工作台」，也可以用上方的类型输入框切换配方类型。
                </span>
              </div>
            ) : null}
            <div className="bench-cols">
              <SlotColumn
                title="材料"
                hint="输入 namespace:id 或 #tag"
                list={inputs}
                onAdd={() => setList(INPUTS_KEY, [...inputs, { kind: 'item', id: '', count: 1 }])}
                onChange={(i, v) => setList(INPUTS_KEY, inputs.map((old, idx) => (idx === i ? v : old)))}
                onRemove={(i) => setList(INPUTS_KEY, inputs.filter((_, idx) => idx !== i))}
                eyedropper={eyedropper}
                onPick={() => addFromEyedropper(INPUTS_KEY)}
              />
              <span className="arrow big" aria-hidden="true">
                <Icon name="arrow-right" size={18} />
              </span>
              <SlotColumn
                title="产物"
                hint="数量 + 可选概率"
                allowChance
                list={outputs}
                onAdd={() => setList(OUTPUTS_KEY, [...outputs, { kind: 'item', id: '', count: 1 }])}
                onChange={(i, v) => setList(OUTPUTS_KEY, outputs.map((old, idx) => (idx === i ? v : old)))}
                onRemove={(i) => setList(OUTPUTS_KEY, outputs.filter((_, idx) => idx !== i))}
                eyedropper={eyedropper}
                onPick={() => addFromEyedropper(OUTPUTS_KEY)}
              />
            </div>
          </>
        )}

        {/* 试点草稿的未建模字段只读展示在面板里，lite 的 extras 编辑器不参与草稿 */}
        {!pilotDraft ? (
          <details className="bench-extras">
            <summary>
              <Icon name="chevron-right" size={12} />
              附加 JSON 字段（未知参数兜底）
              {extras.length > 0 ? <span className="count">{extras.length}</span> : null}
            </summary>
            {extras.map((f, i) => (
              <div key={i} className="bench-row">
                <input
                  className="input mono bench-extra-key"
                  value={f.key}
                  placeholder="字段名"
                  onChange={(e) => syncExtras(extras.map((old, idx) => (idx === i ? { ...old, key: e.target.value } : old)))}
                />
                <input
                  className="input mono bench-extra-val"
                  value={f.json}
                  placeholder='值，JSON 字面量，如 4000 或 {"item":"minecraft:coal"}'
                  onChange={(e) => syncExtras(extras.map((old, idx) => (idx === i ? { ...old, json: e.target.value } : old)))}
                />
                <button className="btn btn-ghost btn-icon" aria-label="删除该字段" title="删除该字段" onClick={() => syncExtras(extras.filter((_, idx) => idx !== i))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm bench-extra-add" onClick={() => syncExtras([...extras, { key: '', json: '0' }])}>
              + 添加字段
            </button>
          </details>
        ) : null}
      </div>

      <footer className="bench-footer">
        <button className="btn btn-ghost btn-sm" onClick={onClearClick} title={clearArmed ? '再点一次确认清空（不可撤销）' : '清空当前工作台内容'}>
          <Icon name="trash" size={14} />
          {clearArmed ? '确认清空？' : '清空'}
        </button>
        <span className="topbar-spacer" />
        <button
          className="btn btn-sm"
          onClick={() => {
            void navigator.clipboard
              .writeText(JSON.stringify(bench, null, 2))
              .then(() => toast('工作台状态已复制到剪贴板', 'success'))
          }}
        >
          <Icon name="copy" size={14} />
          复制状态
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled
          title="通用模式不直接写盘：结构化提交在试点类型（有序合成 / 无序合成 / Create 混合）的会话条里"
          onClick={() => undefined}
        >
          <Icon name="save" size={14} />
          写入文件
        </button>
      </footer>
      {/* W-01：这个对话框此前全仓零引用——Ctrl+S（useBenchInteractions:95）置位 writeOpen 后没有任何消费者，
          热键表现为"按了没反应"。挂回这里即可让 writeOpen 生效。 */}
      <WriteDialog />
    </div>
  )
}

function asList(v: unknown): SlotValue[] {
  return Array.isArray(v) ? (v as SlotValue[]) : []
}

function SlotColumn({
  title,
  hint,
  list,
  onAdd,
  onChange,
  onRemove,
  eyedropper,
  onPick,
  allowChance
}: {
  title: string
  hint: string
  list: SlotValue[]
  onAdd: () => void
  onChange: (index: number, value: SlotValue) => void
  onRemove: (index: number) => void
  eyedropper: { id: string; nameZh: string } | null
  onPick: () => void
  allowChance?: boolean
}): JSX.Element {
  return (
    <section className="slot-column">
      <header className="slot-column-head">
        <h3>{title}</h3>
        <span className="count">{list.length}</span>
        <span className="topbar-spacer" />
        <span className="subtle">{hint}</span>
      </header>
      {list.length === 0 ? <p className="slot-column-empty">还没有条目。</p> : null}
      {list.map((slot, i) => (
        <div key={i} className="bench-row">
          <input
            className="input mono slot-id"
            value={slot.id}
            placeholder="namespace:id 或 #tag"
            aria-label={`${title}第 ${i + 1} 项 ID`}
            onChange={(e) => {
              const id = e.target.value
              onChange(i, {
                ...slot,
                id,
                kind: id.startsWith('#') ? 'tag' : slot.kind
              })
            }}
          />
          <input
            className="input slot-count"
            type="number"
            min={1}
            aria-label="数量"
            value={slot.count ?? slot.amount ?? 1}
            onChange={(e) => onChange(i, { ...slot, count: Number(e.target.value) || 1 })}
          />
          {allowChance ? (
            <input
              className="input slot-chance-input"
              type="number"
              min={0}
              max={100}
              aria-label="概率百分比"
              value={Math.round((slot.chance ?? 0) * 100)}
              title="概率 %"
              onChange={(e) => onChange(i, { ...slot, chance: (Number(e.target.value) || 0) / 100 })}
            />
          ) : null}
          <button className="btn btn-ghost btn-icon" aria-label="移除该条" title="移除该条" onClick={() => onRemove(i)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <div className="bench-row slot-column-actions">
        <button className="btn btn-ghost btn-sm" onClick={onAdd}>
          + 添加{title}
        </button>
        {eyedropper ? (
          <button className="btn btn-sm" onClick={onPick} title={`吸取中的物品：${eyedropper.nameZh}`}>
            <Icon name="dot" size={12} />
            放入「{eyedropper.nameZh}」
          </button>
        ) : null}
      </div>
    </section>
  )
}
