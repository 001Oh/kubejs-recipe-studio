/** 空状态：每种空状态都必须给出明确出口（规格 3.9.6）。 */
import type { JSX } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface Props {
  kind: 'no-modpack' | 'indexing' | 'no-result' | 'no-recipe' | 'generic'
  title?: string
  hint?: string
  steps?: string[]
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  /** 嵌在窄栏（左栏/侧栏）时收紧留白 */
  compact?: boolean
}

const DEFAULTS: Record<Props['kind'], { title: string; hint: string; icon: IconName }> = {
  'no-modpack': { title: '还没有导入整合包', hint: '选择包含 mods / config / kubejs 的目录', icon: 'folder' },
  indexing: { title: '索引尚未建立', hint: '首次扫描需要解析全部 mod jar', icon: 'clock' },
  'no-result': { title: '没有匹配结果', hint: '', icon: 'search' },
  'no-recipe': {
    title: '暂无已知配方',
    hint: '可能是动态注册配方，或该模组未提供数据驱动配方',
    icon: 'recipe'
  },
  generic: { title: '这里还是空的', hint: '', icon: 'info' }
}

export function EmptyState({
  kind,
  title,
  hint,
  steps,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact
}: Props): JSX.Element {
  const d = DEFAULTS[kind]
  return (
    <div className={`empty-card${compact ? ' empty-card-compact' : ''}`}>
      <span className="empty-art" aria-hidden="true">
        <Icon name={d.icon} size={compact ? 18 : 20} />
      </span>
      <h2>{title ?? d.title}</h2>
      {steps ? (
        <div className="empty-steps">
          {steps.map((s) => (
            <span key={s} className="badge">
              {s}
            </span>
          ))}
        </div>
      ) : null}
      {hint || d.hint ? <p>{hint ?? d.hint}</p> : null}
      {actionLabel && onAction ? (
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onAction}>
            {actionLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button className="btn" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      ) : secondaryLabel && onSecondary ? (
        <div className="empty-actions">
          <button className="btn" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
