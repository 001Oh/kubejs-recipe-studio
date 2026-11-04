/**
 * 第 116 批 A-4：「② 从零新建」先选类型。
 *
 * T-117：试点白名单废除后，**清单里的每个类型都可选**（清单本身就是「有 schema 的类型」），
 * 不再有置灰行与「去设置开启」——那个开关已经不存在了，留着按钮只会把人带到空页面。
 * 类型的中文名由主进程统一解析（recipeTypeNameZh），这里只负责呈现与过滤。
 */
import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { SchemaSummary } from '@shared/ipc'
import { recipeTypeNameZh } from '@shared/recipeTypeNames'
import { Icon } from '../../components/Icon'

export function NewDraftTypePicker({
  summaries,
  currentTypeId,
  onPick,
  onCancel
}: {
  summaries: SchemaSummary[]
  currentTypeId: string
  onPick: (summary: SchemaSummary) => void
  onCancel: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = summaries.filter((s) => {
      if (!q) return true
      return `${s.displayName} ${recipeTypeNameZh(s.id, s.displayName)} ${s.id} ${s.modDisplayName ?? ''}`.toLowerCase().includes(q)
    })
    // 按样本量降序：有真实配方的类型更可能是用户在找的
    return [...filtered].sort((a, b) => b.sampleCount - a.sampleCount)
  }, [summaries, query])

  const current = summaries.find((s) => s.id === currentTypeId)

  return (
    <section className="bench-empty" aria-label="选择一个配方类型">
      <header className="bench-empty-head">
        <span className="section-label">选择一个配方类型</span>
        <span className="badge" title="当前工作台的配方类型">
          当前类型：{current ? recipeTypeNameZh(current.id, current.displayName) : recipeTypeNameZh(currentTypeId)}
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
          {rows.map((s) => (
            <li key={s.id} className="type-pick-row" data-type-id={s.id}>
              <span className="type-pick-name truncate" title={s.id}>
                {recipeTypeNameZh(s.id, s.displayName)}
                {s.sampleCount > 0 ? <span className="count">{s.sampleCount}</span> : null}
              </span>
              <span className="type-pick-id mono truncate" title={s.id}>
                {s.id}
              </span>
              <button className="btn btn-sm btn-primary" onClick={() => onPick(s)}>
                用这个类型
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
