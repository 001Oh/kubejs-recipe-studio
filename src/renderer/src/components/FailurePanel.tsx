/**
 * 第 115 批 D3：失败态统一出路（禁裸 toast）。
 *
 * 一套面板覆盖四类失败：
 *   1. RAW_UNREADABLE 等读/写失败（草稿还在，给出重试 / 取消 / 复制路径）
 *   2. 冲突三选一（沿用 PilotDraftPanel 里的 `.conflict-card`，语义不变）
 *   3. 通道不可用 / 写入失败（WriteDialog 内：重试 / 换通道 / 关闭）
 *   4. 启动失败（沿用启动错误页）
 *
 * 硬契约（有组件测试守着）：
 *   - `role="alert"`
 *   - 首个可用动作自动获得焦点，Tab 可在动作间移动
 *   - `Esc` 只关闭面板，不清草稿、不改任何编辑状态
 */
import { useEffect, useRef } from 'react'
import type { JSX, ReactNode } from 'react'
import type { IconName } from './Icon'
import { Icon } from './Icon'

export interface FailureAction {
  label: string
  onClick: () => void
  /** primary = 推荐出路，视觉上唯一高亮 */
  variant?: 'primary' | 'ghost'
  disabled?: boolean
  title?: string
}

export interface FailurePanelProps {
  /** 一句话说清"哪里失败了"，用用户能读懂的话 */
  title: string
  /** 失败原因 / 当前状态；可以是一段话 */
  message: string
  /** 机器可读的失败码，原样展示给排障用（可缺省） */
  code?: string | null
  actions: FailureAction[]
  /** Esc 或点关闭时调用；缺省 = 本面板不可关闭（例如必须先处理） */
  onDismiss?: () => void
  /** 关闭按钮文字：嵌在对话框里时用「收起提示」，避免与外层「关闭」重名 */
  dismissLabel?: string
  icon?: IconName
  /** 附加说明（如"草稿已保留"） */
  children?: ReactNode
  className?: string
}

export function FailurePanel({
  title,
  message,
  code,
  actions,
  onDismiss,
  dismissLabel = '关闭',
  icon = 'alert',
  children,
  className
}: FailurePanelProps): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null)

  // 焦点落到首个可用动作：键盘用户不需要先摸索 Tab 路径
  useEffect(() => {
    const first = sectionRef.current?.querySelector<HTMLButtonElement>('button[data-autofocus="true"]')
    first?.focus()
  }, [])

  // Esc：只关面板。捕获阶段拦下，避免同时触发外层（设置页/其它）的 Esc 语义。
  useEffect(() => {
    if (!onDismiss) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onDismiss()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onDismiss])

  return (
    <section
      ref={sectionRef}
      className={`failure-panel${className ? ` ${className}` : ''}`}
      role="alert"
      aria-label={title}
    >
      <header className="failure-head">
        <span className="failure-icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
        <div className="failure-copy">
          <strong>
            {title}
            {code ? <span className="failure-code mono">{code}</span> : null}
          </strong>
          <p>{message}</p>
        </div>
      </header>

      {children ? <div className="failure-body">{children}</div> : null}

      <footer className="failure-actions">
        {actions.map((action, i) => (
          <button
            key={action.label}
            className={`btn${action.variant === 'primary' ? ' btn-primary' : ' btn-sm'}`}
            data-autofocus={i === 0 && !action.disabled ? 'true' : undefined}
            disabled={action.disabled}
            title={action.title}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
        {onDismiss ? (
          <button className="btn btn-ghost btn-sm failure-dismiss" onClick={onDismiss} title={`关闭（Esc），不改变当前草稿`}>
            {dismissLabel}
          </button>
        ) : null}
      </footer>
    </section>
  )
}
