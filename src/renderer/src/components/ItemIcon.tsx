/**
 * 物品图标。常规路径必须是 jar 里提取的真实贴图（image-rendering: pixelated），
 * 占位块只在 hasIcon=false 或加载失败时出现——那是提取器缺陷的信号，不是兜底方案。
 */
import { useState } from 'react'
import type { JSX } from 'react'

export interface IconSource {
  id: string
  name: string
  iconKey: string | null
  hasIcon: boolean
}

interface Props {
  item: IconSource | null
  /** 只允许 16 / 32 / 48 的整数倍渲染 */
  size?: 16 | 32 | 48
  className?: string
  title?: string
}

/**
 * 占位块的首字：优先用 ID 的路径段（minecraft:glowstone → G），
 * 否则同一命名空间的物品全是同一个字母，占位块就失去区分度。
 */
function initialOf(item: IconSource | null): string {
  if (!item) return '?'
  const raw = item.id.includes(':') ? item.id.slice(item.id.lastIndexOf(':') + 1) : item.id || item.name
  const cleaned = raw.replace(/^[^0-9a-zA-Z\u4e00-\u9fa5]+/, '')
  return (cleaned || item.name || '?').slice(0, 1).toUpperCase()
}

export function ItemIcon({ item, size = 32, className, title }: Props): JSX.Element {
  const [failed, setFailed] = useState(false)
  const src = item?.iconKey ? window.studio.iconUrl(item.iconKey) : null
  const label = item ? `${item.name} · ${item.id}` : '空槽位'

  if (!item || !src || !item.hasIcon || failed) {
    return (
      <span
        className={`icon-box${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
        title={`${label}（缺少真实贴图）`}
        aria-hidden="true"
      >
        <span className="icon-fallback" style={{ fontSize: size <= 16 ? 8 : 10 }}>
          {initialOf(item)}
        </span>
      </span>
    )
  }

  return (
    <span className={`icon-box${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} title={title ?? label}>
      <img
        className="pixel"
        src={src}
        width={size}
        height={size}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  )
}
