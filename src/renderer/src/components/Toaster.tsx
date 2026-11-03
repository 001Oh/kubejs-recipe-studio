/** 自绘 toast，替代被禁止的 alert / confirm。轻量反馈用 toast，数据风险用对话框/内联卡片。 */
import type { JSX } from 'react'
import { useAppStore } from '../store/appStore'
import { Icon } from './Icon'
import type { IconName } from './Icon'

const ICONS: Record<string, IconName> = { info: 'info', warn: 'alert', error: 'error', success: 'check' }

export function Toaster(): JSX.Element | null {
  const toasts = useAppStore((s) => s.toasts)
  const dismiss = useAppStore((s) => s.dismissToast)
  if (toasts.length === 0) return null
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`}>
          <span className="toast-icon" aria-hidden="true">
            <Icon name={ICONS[t.level] ?? 'info'} size={14} />
          </span>
          <span className="toast-text">{t.text}</span>
          {t.action ? (
            <button
              className="btn btn-sm"
              onClick={() => {
                t.action?.()
                dismiss(t.id)
              }}
            >
              {t.actionLabel ?? '执行'}
            </button>
          ) : null}
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="关闭提示" title="关闭">
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
