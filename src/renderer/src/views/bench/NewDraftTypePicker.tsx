/**
 * 第 116 批 A-4：「② 从零新建」先选类型。
 *
 * 旧行为：点"新建"直接用当前 `bench.typeId` 建草稿——用户往往不知道当前类型是什么，
 * 建错了还得取消重来。这里把类型选择前置，并且：
 *   - 选项来自 `schema:list`（已在 BenchView 里加载，不额外打 IPC）；
 *   - **不在试点白名单的类型置灰但可见**（不是藏起来——藏起来用户只会以为"没有这个类型"），
 *     旁边给「去设置开启」；
 *   - 顶部常驻「当前类型」标签，让"我现在用的是什么"始终有答案。
 */
import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { SchemaSummary } from '@shared/ipc'
import { Icon } from '../../components/Icon'

export function NewDraftTypePicker({
  summaries,
  pilotTypes,
  currentTypeId,
  onPick,
  onCancel,
  onOpenSettings
}: {
  summaries: SchemaSummary[]
  pilotTypes: readonly string[]
  currentTypeId: string
  onPick: (summary: SchemaSummary) => void
  onCancel: () => void
  onOpenSettings: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pilot = new Set(pilotTypes)
    const filtered = summaries.filter((s) => {
      if (!q) return true
      return `${s.displayName} ${s.id} ${s.modDisplayName ?? ''}`.toLowerCase().includes(q)
    })
    // 试点的排前面，其次按样本量（有真实配方的类型更可能是用户要找的）
    return [...filtered].sort((a, b) => {
      const pa = pilot.has(a.id) ? 0 : 1
      const pb = pilot.has(b.id) ? 0 : 1
      if (pa !== pb) return pa - pb
      return b.sampleCount - a.sampleCount
    })
  }, [summaries, pilotTypes, query])

  const current = summaries.find((s) => s.id === currentTypeId)

  return (
    <section className="bench-empty" aria-label="选择一个配方类型">
      <header className="bench-empty-head">
        <span className="section-label">选择一个配方类型</span>
        <span className="badge" title="当前工作台的配方类型">
          当前类型：{current?.displayName || currentTypeId}
        </span>
        <span className="topbar-spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onCancel} title="回到三个入口">
          返回
        </button>
      </header>

      <div className="field">
        <span className="field-icon">
          <Icon name="search" size={14} />
        </span>
        <input
          className="input"
          placeholder={`按名称 / 类型 ID / 模组过滤（共 ${summaries.length} 种）`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="过滤配方类型"
        />
      </div>

      {rows.length === 0 ? (
        <p className="settings-hint">没有匹配「{query}」的配方类型。</p>
      ) : (
        <ul className="type-pick-list">
          {rows.map((s) => {
            const enabled = pilotTypes.includes(s.id)
            return (
              <li key={s.id} className={`type-pick-row${enabled ? '' : ' is-disabled'}`} data-type-id={s.id}>
                <span className="type-pick-name truncate" title={s.id}>
                  {s.displayName || s.id}
                  {s.sampleCount > 0 ? <span className="count">{s.sampleCount}</span> : null}
                </span>
                <span className="type-pick-id mono truncate" title={s.id}>
                  {s.id}
                </span>
                {enabled ? (
                  <button className="btn btn-sm btn-primary" onClick={() => onPick(s)}>
                    用这个类型
                  </button>
                ) : (
                  <>
                    <span className="type-pick-reason" role="note">
                      当前不在试点白名单
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={onOpenSettings}
                      title="打开设置 → 工作台试点，把该类型加入白名单"
                    >
                      去设置开启
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
