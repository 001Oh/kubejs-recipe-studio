/**
 * 右侧详情面板：当前选中配方的"档案"与生成结果。
 * 只读展示 + 一个"载入工作台"动作（复用 views/browse/loadRecipe 的唯一实现）。
 * 不在这里重复实现任何提交 / 冲突 / 备份逻辑。
 */
import { useMemo } from 'react'
import type { JSX, ReactNode } from 'react'
import type { RecipeIO, RecipeRecord } from '@shared/types'
import { useAppStore } from '../store/appStore'
import { useBenchStore } from '../store/benchStore'
import { ItemIcon } from './ItemIcon'
import { Icon } from './Icon'
import { useIconKeys } from '../hooks/useIconKeys'
import { CodePane } from '../views/CodePane'
import { loadRecipeToBench } from '../views/browse/loadRecipe'

export function DetailPanel(): JSX.Element {
  const tab = useAppStore((s) => s.detailTab)
  const setTab = useAppStore((s) => s.setDetailTab)
  const collapsed = useAppStore((s) => s.ui?.codeCollapsed ?? false)
  const patchUi = useAppStore((s) => s.patchUi)

  if (collapsed) return <></>

  return (
    <section className="detail" aria-label="配方详情">
      <header className="detail-head">
        <div className="seg" role="tablist" aria-label="详情面板页签">
          <button
            role="tab"
            aria-selected={tab === 'detail'}
            className={`seg-btn${tab === 'detail' ? ' active' : ''}`}
            onClick={() => setTab('detail')}
          >
            <Icon name="info" size={14} />
            详情
          </button>
          <button
            role="tab"
            aria-selected={tab === 'code'}
            className={`seg-btn${tab === 'code' ? ' active' : ''}`}
            onClick={() => setTab('code')}
          >
            <Icon name="code" size={14} />
            代码
          </button>
        </div>
        <span className="topbar-spacer" />
        <button
          className="btn btn-ghost btn-icon"
          title="收起详情面板"
          aria-label="收起详情面板"
          onClick={() => patchUi({ codeCollapsed: true })}
        >
          <Icon name="panel-right" size={16} />
        </button>
      </header>
      {tab === 'code' ? <CodePane /> : <DetailBody />}
    </section>
  )
}

function DetailBody(): JSX.Element {
  const draft = useBenchStore((s) => s.draft)
  const selected = useAppStore((s) => s.selectedRecipe)
  const view = useAppStore((s) => s.view)
  const settingsOpen = useAppStore((s) => s.settingsOpen)

  if (settingsOpen) {
    return (
      <div className="detail-body">
        <Hint icon="settings" title="设置与诊断" text="左侧可切换外观、生成偏好与试点开关；诊断结果在中央区域。" />
      </div>
    )
  }

  if (view === 'bench') {
    return draft ? <DraftFacts /> : <LegacyBenchFacts />
  }

  if (!selected) {
    return (
      <div className="detail-body">
        <Hint icon="recipe" title="未选择配方" text="在中间列表点选一条配方，这里会显示它的类型、材料与产物。" />
      </div>
    )
  }

  return <RecipeFacts record={selected} />
}

/* ───────────────────────── 配方档案（浏览） ───────────────────────── */

function RecipeFacts({ record }: { record: RecipeRecord }): JSX.Element {
  const sourceLabel =
    record.source === 'kubejs'
      ? '来自现有脚本'
      : record.source === 'datapack'
        ? '需要数据包'
        : record.type.startsWith('minecraft:')
          ? '原版'
          : '来自模组'

  return (
    <div className="detail-body">
      <Card title="配方档案">
        <KV label="类型" mono value={record.type} />
        <KV label="配方 ID" mono value={record.recipeId} wrap />
        <KV label="来源" value={sourceLabel} />
        <PathRow label="源文件" path={record.sourcePath} />
        {record.jarPath ? <PathRow label="容器" path={record.jarPath} /> : null}
      </Card>

      {record.partial ? (
        <div className="dcard-note dcard-note-warn">
          <Icon name="alert" size={14} />
          <span>解析不完整：原始定义含动态逻辑，只提取到可静态解析的部分。</span>
        </div>
      ) : null}

      <IoCard title="产物" list={record.outputs} accent />
      <IoCard title="材料" list={record.inputs} />

      {record.unknownIds && record.unknownIds.length > 0 ? (
        <Card title={`未知物品 ${record.unknownIds.length}`}>
          <div className="chip-wrap">
            {record.unknownIds.slice(0, 24).map((id) => (
              <span className="badge badge-warn mono" key={id} title={id}>
                {id}
              </span>
            ))}
          </div>
          <p className="dcard-hint">这些 ID 不在物品索引里：可能来自未启用的模组或拼写不同。</p>
        </Card>
      ) : null}

      <div className="detail-actions">
        <button className="btn btn-primary" onClick={() => void loadRecipeToBench(record)}>
          <Icon name="bench" size={14} />
          {record.partial ? '载入可解析部分' : '载入工作台'}
        </button>
      </div>
    </div>
  )
}

function IoCard({ title, list, accent }: { title: string; list: RecipeIO[]; accent?: boolean }): JSX.Element {
  const ids = useMemo(() => list.map((io) => io.id), [list])
  const icons = useIconKeys(ids)
  return (
    <Card title={title} count={list.length} accent={accent}>
      {list.length === 0 ? (
        <p className="dcard-hint">该配方没有{title}信息。</p>
      ) : (
        <ul className="io-list">
          {list.map((io, i) => (
            <li className="io-row" key={`${io.id}-${i}`} title={`${io.id}`}>
              <ItemIcon
                item={{ id: io.id, name: io.id, iconKey: icons[io.id] ?? null, hasIcon: !!icons[io.id] }}
                size={32}
              />
              <span className="io-row-name mono truncate">{io.id}</span>
              <span className="io-row-amt">
                {io.kind === 'fluid' ? `${io.count} mB` : `×${io.count}`}
                {io.chance ? <em>{Math.round(io.chance * 100)}%</em> : null}
                {io.kind === 'tag' ? <em>tag</em> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ───────────────────────── 编辑会话档案（工作台） ───────────────────────── */

function DraftFacts(): JSX.Element {
  const draft = useBenchStore((s) => s.draft)
  const conflict = useBenchStore((s) => s.draftConflict)
  const lastCommit = useBenchStore((s) => s.lastCommit)
  const bench = useBenchStore((s) => s.bench)
  const committing = useBenchStore((s) => s.committing)
  const selected = useAppStore((s) => s.selectedRecipe)

  if (!draft) return <></>
  const dirty = draft.meta.dirtyFields
  const source = draft.normalized.source
  const copyMode = draft.meta.base === null
  const slotCount = draft.schema.slots.length
  const outputCount = draft.schema.outputs.length
  const inputValues = countSlots(bench.values.inputs) + countSlots(bench.values.grid) + countSlots(bench.values.ingredients)
  const outputValues = countSlots(bench.values.outputs) + countSlots(bench.values.result) + countSlots(bench.values.results)

  return (
    <div className="detail-body">
      <Card title="编辑会话">
        <KV label="类型" mono value={draft.normalized.typeId} />
        <KV label="schema" value={`${draft.schema.id} · rev ${draft.schema.revision ?? 1}`} />
        <KV label="模式" value={copyMode ? '另存副本（不覆盖原配方）' : '就地提交'} />
        <KV label="原始哈希" mono value={`${draft.normalized.rawHash.slice(0, 12)}…`} />
        {selected ? <KV label="配方 ID" mono value={selected.recipeId} wrap /> : null}
        <PathRow label="源文件" path={source.sourcePath} />
      </Card>

      <Card title="修改状态">
        <div className={`dirty-state${dirty.length > 0 ? ' is-dirty' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {committing
            ? '正在提交…'
            : dirty.length > 0
              ? `有 ${dirty.length} 处修改尚未提交`
              : '与原始数据一致，没有待提交修改'}
        </div>
        {dirty.length > 0 ? (
          <div className="chip-wrap">
            {dirty.map((f) => (
              <span className="chip chip-static" key={f} title={f}>
                {fieldLabel(f)}
              </span>
            ))}
          </div>
        ) : null}
        {conflict ? (
          <p className="dcard-note dcard-note-error">
            <Icon name="error" size={14} />
            <span>原始数据已被外部修改，提交已暂停，请在中央的冲突卡片里选择处理方式。</span>
          </p>
        ) : null}
        {lastCommit ? (
          <div className="commit-line">
            <Icon name="check" size={14} />
            <span className="mono truncate" title={lastCommit.path}>
              {lastCommit.path.replace(/\\/g, '/').split('/').slice(-2).join('/')}
            </span>
          </div>
        ) : null}
      </Card>

      <Card title="结构">
        <KV label="编辑形态" value={layoutLabel(draft.schema.layoutKind)} />
        <KV label="当前材料" value={`${inputValues} 项`} />
        <KV label="当前产物" value={`${outputValues} 项`} />
        <KV label="可编辑字段" value={`${slotCount + outputCount} 个`} />
        <KV label="未建模字段" value={`${draft.passThrough.length} 个（原样保留）`} />
        <KV label="打开诊断" value={`${draft.diagnostics.length} 条`} />
      </Card>

      {draft.unsafeReason ? (
        <div className="dcard-note dcard-note-warn">
          <Icon name="alert" size={14} />
          <span>{draft.unsafeReason}</span>
        </div>
      ) : null}
    </div>
  )
}

function LegacyBenchFacts(): JSX.Element {
  const bench = useBenchStore((s) => s.bench)
  const inputValues = countSlots(bench.values.inputs) + countSlots(bench.values.grid)
  const outputValues = countSlots(bench.values.outputs)
  return (
    <div className="detail-body">
      <Card title="工作台（通用模式）">
        <KV label="类型" mono value={bench.typeId} />
        <KV label="布局" value={bench.layoutKind} />
        <KV label="当前材料" value={`${inputValues} 项`} />
        <KV label="当前产物" value={`${outputValues} 项`} />
      </Card>
      <div className="dcard-note">
        <Icon name="info" size={14} />
        <span>
          该类型走通用模式：可以直接编辑字段并查看生成的代码，但不会就地改写原始配方。需要结构化编辑请使用「工作台」试点类型。
        </span>
      </div>
    </div>
  )
}

/* ───────────────────────── 小件 ───────────────────────── */

function Card({
  title,
  count,
  accent,
  children
}: {
  title: string
  count?: number
  accent?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <section className={`dcard${accent ? ' dcard-accent' : ''}`}>
      <header className="dcard-head">
        <span className="section-label">{title}</span>
        {typeof count === 'number' ? <span className="count">{count}</span> : null}
      </header>
      {children}
    </section>
  )
}

function KV({ label, value, mono, wrap }: { label: string; value: string; mono?: boolean; wrap?: boolean }): JSX.Element {
  return (
    <div className="kv">
      <span className="kv-k">{label}</span>
      <span className={`kv-v${mono ? ' mono' : ''}${wrap ? ' kv-wrap' : ''}`} title={value}>
        {value}
      </span>
    </div>
  )
}

/** 长路径只显示尾部两段，完整值放 title 并提供一键复制 */
function PathRow({ label, path }: { label: string; path: string }): JSX.Element {
  const normalized = path.replace(/\\/g, '/')
  const tail = normalized.split('/').slice(-2).join('/')
  return (
    <div className="kv">
      <span className="kv-k">{label}</span>
      <span className="kv-v kv-path" title={normalized}>
        <span className="mono truncate">{tail}</span>
        <button
          className="copy-inline"
          title="复制完整路径"
          aria-label="复制完整路径"
          onClick={() => {
            void navigator.clipboard?.writeText(normalized)
          }}
        >
          <Icon name="copy" size={12} />
        </button>
      </span>
    </div>
  )
}

function Hint({ icon, title, text }: { icon: 'recipe' | 'settings'; title: string; text: string }): JSX.Element {
  return (
    <div className="detail-hint">
      <span className="empty-art" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

function countSlots(value: unknown): number {
  return Array.isArray(value) ? value.filter((v) => v !== null && v !== undefined).length : 0
}

function layoutLabel(kind: string): string {
  if (kind === 'shaped') return '有序网格'
  if (kind === 'shapeless') return '无序列表'
  if (kind === 'multi_io') return '多输入多输出'
  if (kind === 'single_io') return '单输入单输出'
  return kind
}

/** 脏字段名 → 用户能读懂的标签（字段名本身仍保留在 title 里） */
function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    grid: '材料网格',
    inputs: '材料',
    ingredients: '材料',
    outputs: '产物',
    results: '产物',
    result: '产物',
    extras: '附加字段'
  }
  return map[key] ?? key
}
