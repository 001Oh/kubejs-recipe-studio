/**
 * 统一图标：16px 网格、1.5px 描边、currentColor。不引入图标库（保持零新依赖）。
 * 尺寸只用 14 / 16 / 18 / 20 四档，保证与文字基线和控件高度对齐。
 */
import type { JSX } from 'react'

export type IconName =
  | 'logo'
  | 'search'
  | 'close'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-up'
  | 'package'
  | 'recipe'
  | 'bench'
  | 'settings'
  | 'terminal'
  | 'code'
  | 'copy'
  | 'export'
  | 'trash'
  | 'refresh'
  | 'folder'
  | 'filter'
  | 'alert'
  | 'error'
  | 'check'
  | 'info'
  | 'star'
  | 'panel-right'
  | 'panel-left'
  | 'panel-bottom'
  | 'arrow-right'
  | 'undo'
  | 'redo'
  | 'save'
  | 'file'
  | 'sparkle'
  | 'dot'
  | 'clock'

interface Props {
  name: IconName
  size?: 12 | 14 | 16 | 18 | 20
  className?: string
  /** 仅装饰用途时保持 aria-hidden；需要语义时传 label */
  label?: string
  strokeWidth?: number
}

const PATHS: Record<IconName, JSX.Element> = {
  logo: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <path d="M6.2 2.6v10.8M9.8 2.6v10.8M2.6 6.2h10.8M2.6 9.8h10.8" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.1" />
      <path d="M10.4 10.4 13.8 13.8" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  'chevron-down': <path d="M4 6.5 8 10.5 12 6.5" />,
  'chevron-right': <path d="M6.5 4 10.5 8 6.5 12" />,
  'chevron-left': <path d="M9.5 4 5.5 8 9.5 12" />,
  'chevron-up': <path d="M4 9.5 8 5.5 12 9.5" />,
  package: (
    <>
      <path d="M8 1.9 13.6 5v6L8 14.1 2.4 11V5L8 1.9Z" />
      <path d="M2.6 5.1 8 8.2l5.4-3.1M8 8.2v5.7" />
    </>
  ),
  recipe: (
    <>
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" />
      <path d="M2.4 6.4h11.2M2.4 9.8h11.2M6.3 2.4v11.2M9.7 2.4v11.2" />
    </>
  ),
  bench: (
    <>
      <path d="M2.6 9.5h10.8M4.2 9.5V13M11.8 9.5V13" />
      <path d="M2 6.4h12l-1.1-2.6a1.4 1.4 0 0 0-1.3-.9H3.4a1.4 1.4 0 0 0-1.3.9L2 6.4Z" />
    </>
  ),
  settings: (
    <>
      <path d="M2.5 5h5M11 5h2.5M2.5 11h2.5M8.5 11h5" />
      <circle cx="9.2" cy="5" r="1.7" />
      <circle cx="6.6" cy="11" r="1.7" />
    </>
  ),
  terminal: (
    <>
      <rect x="1.9" y="2.6" width="12.2" height="10.8" rx="2" />
      <path d="M4.4 6.2 6.4 8l-2 1.8M8.4 10.2h3.2" />
    </>
  ),
  code: <path d="M5.6 4.6 2.2 8l3.4 3.4M10.4 4.6 13.8 8l-3.4 3.4M9.2 2.8 6.8 13.2" />,
  copy: (
    <>
      <rect x="5.6" y="5.6" width="8" height="8" rx="1.8" />
      <path d="M10.4 5.4V4.2A1.8 1.8 0 0 0 8.6 2.4H4.2A1.8 1.8 0 0 0 2.4 4.2v4.4a1.8 1.8 0 0 0 1.8 1.8h1.2" />
    </>
  ),
  export: (
    <>
      <path d="M8 10.2V2.6M5.4 5.2 8 2.6l2.6 2.6" />
      <path d="M2.6 10.4v1.6a1.6 1.6 0 0 0 1.6 1.6h7.6a1.6 1.6 0 0 0 1.6-1.6v-1.6" />
    </>
  ),
  trash: (
    <>
      <path d="M2.8 4.4h10.4M6.4 4.4V3a.8.8 0 0 1 .8-.8h1.6a.8.8 0 0 1 .8.8v1.4" />
      <path d="M4.2 4.4l.6 8a1.6 1.6 0 0 0 1.6 1.5h3.2a1.6 1.6 0 0 0 1.6-1.5l.6-8" />
    </>
  ),
  refresh: (
    <>
      <path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" />
      <path d="M13.6 2.6v3.2h-3.2" />
    </>
  ),
  folder: <path d="M1.9 4.6A1.6 1.6 0 0 1 3.5 3h2.4l1.4 1.6h5.2a1.6 1.6 0 0 1 1.6 1.6v5.2a1.6 1.6 0 0 1-1.6 1.6H3.5a1.6 1.6 0 0 1-1.6-1.6V4.6Z" />,
  filter: <path d="M2.2 3.4h11.6L9.4 8.2v4.1l-2.8 1.3V8.2L2.2 3.4Z" />,
  alert: (
    <>
      <path d="M8 2.2 14.2 13H1.8L8 2.2Z" />
      <path d="M8 6.2v3.2M8 11.5v.1" />
    </>
  ),
  error: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M8 4.8v3.8M8 11.1v.1" />
    </>
  ),
  check: <path d="M3 8.4 6.2 11.6 13 4.4" />,
  info: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M8 7.2v4M8 4.9v.1" />
    </>
  ),
  star: <path d="M8 2.3l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.6l4-.6L8 2.3Z" />,
  'panel-right': (
    <>
      <rect x="2" y="2.8" width="12" height="10.4" rx="1.8" />
      <path d="M9.6 2.9v10.2" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="2" y="2.8" width="12" height="10.4" rx="1.8" />
      <path d="M6.4 2.9v10.2" />
    </>
  ),
  'panel-bottom': (
    <>
      <rect x="2" y="2.8" width="12" height="10.4" rx="1.8" />
      <path d="M2.1 9.4h11.8" />
    </>
  ),
  'arrow-right': <path d="M2.6 8h10.2M9.2 4.4 12.8 8l-3.6 3.6" />,
  undo: <path d="M5.6 4.4 2.2 7.8l3.4 3.4M2.4 7.8h7.2a3.4 3.4 0 0 1 0 6.8" />,
  redo: <path d="M10.4 4.4l3.4 3.4-3.4 3.4M13.6 7.8H6.4a3.4 3.4 0 0 0 0 6.8" />,
  save: (
    <>
      <path d="M2.6 4.2A1.6 1.6 0 0 1 4.2 2.6h6.2L13.4 5.6v6.2a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6V4.2Z" />
      <path d="M5.4 2.8v3.4h4.4V2.8M5.4 13.2V9.6h5.2v3.6" />
    </>
  ),
  file: (
    <>
      <path d="M3.4 3.2a1.6 1.6 0 0 1 1.6-1.6h3.8L12.6 5.4v7.4a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V3.2Z" />
      <path d="M8.6 1.8v3.8h3.8" />
    </>
  ),
  sparkle: <path d="M8 2.2l1.4 3.6 3.6 1.4-3.6 1.4L8 12.2 6.6 8.6 3 7.2l3.6-1.4L8 2.2Z" />,
  dot: <circle cx="8" cy="8" r="3" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.9" />
      <path d="M8 4.6V8l2.4 1.6" />
    </>
  )
}

/** 实心图标：star / dot 用填充更接近惯例 */
const FILLED: IconName[] = ['star', 'dot']

export function Icon({ name, size = 16, className, label, strokeWidth = 1.5 }: Props): JSX.Element {
  const filled = FILLED.includes(name)
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {PATHS[name]}
    </svg>
  )
}
