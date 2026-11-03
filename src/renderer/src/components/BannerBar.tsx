/** 顶部横幅：可关闭、不阻断已加载内容（规格 3.9.6 全局错误态）。 */
import type { JSX } from 'react'
import { useAppStore } from '../store/appStore'
import { Icon } from './Icon'

export function BannerBar(): JSX.Element | null {
  const banners = useAppStore((s) => s.banners)
  const dismiss = useAppStore((s) => s.dismissBanner)
  if (banners.length === 0) return null
  return (
    <div className="banner-stack">
      {banners.map((b) => (
        <div key={b.id} className={`banner-bar ${b.kind === 'error' ? 'banner-error' : 'banner-warn'}`}>
          <span className="banner-icon" aria-hidden="true">
            <Icon name={b.kind === 'error' ? 'error' : 'alert'} size={14} />
          </span>
          <span className="banner-text">{b.text}</span>
          <span className="topbar-spacer" />
          <button className="btn btn-ghost tiny" onClick={() => dismiss(b.id)} aria-label="关闭提示">
            关闭
          </button>
        </div>
      ))}
    </div>
  )
}
