/**
 * T-26 / UI-U3：物品预览浮窗组件（固定定位，独立可删）。
 *
 * - 由 `usePreviewStore` 驱动：只有悬停满 400 ms 才会被 `show()`；
 * - 数据懒加载 + 会话内缓存：`items:get` 取名称、`recipes:byOutput` 取配方条数；
 * - 位置：光标右下 12 px；右/下边界自动翻转；
 * - 样式全部走 tokens（`themeTokens.test` 会拦未定义变量）。
 */
import { useEffect, useState } from 'react'
import { usePreviewStore, modOf, previewCacheGet, previewCacheSet, SUPPRESS_AFTER_SCROLL_MS, type PreviewInfo } from '@renderer/store/previewStore'
import { call } from '../api'
import { displayName } from '@shared/itemName'
import { flipOf } from './previewFlip'


export function ItemPreview(): JSX.Element | null {
  const id = usePreviewStore((s) => s.id)
  const anchor = usePreviewStore((s) => s.anchor)
  const suppressFor = usePreviewStore((s) => s.suppressFor)
  const [info, setInfo] = useState<{ nameZh: string; nameEn?: string; iconKey?: string; hasIcon?: boolean } | null>(null)
  const [extra, setExtra] = useState<PreviewInfo | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    const cached = previewCacheGet(id)
    if (cached) {
      setExtra(cached)
      return
    }
    void (async () => {
      try {
        const [items, recipes] = await Promise.all([
          call('items:get', { id }),
          call('recipes:byOutput', { id, offset: 0, limit: 1 })
        ])
        if (!alive) return
        const total = Number(recipes?.total ?? 0)
        const next = { mod: modOf(id), recipeCount: Number.isFinite(total) ? total : 0 }
        previewCacheSet(id, next)
        setExtra(next)
        const entry = items as { nameZh?: string; nameEn?: string } | null
        // A-3：没有中文名时用原名兜底（以前 nameZh 为空就直接显示 ID）
        if (entry && ((entry.nameZh ?? '') !== '' || (entry.nameEn ?? '') !== '')) {
          setInfo({ nameZh: entry.nameZh ?? '', nameEn: entry.nameEn ?? '' })
        }
      } catch {
        if (alive) setExtra({ mod: modOf(id), recipeCount: 0 })
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  // 滚动即隐藏：虚拟列表行位置会变，浮窗跟着漂移会误导。
  // `scroll` 不冒泡，元素内滚动只能靠 capture 捕获；`wheel` 会冒泡，两者都挂上更稳。
  // 用 `suppressFor` 而不是 `hide`：滚动后列表重渲染会让光标下换成另一行并再次 mouseenter，
  // 单纯 hide 会在 400 ms 后被重新唤起（实测 t0=true → t120=false → t520=true）。
  useEffect(() => {
    if (!id) return
    const onMove = (): void => suppressFor(SUPPRESS_AFTER_SCROLL_MS)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('wheel', onMove, { capture: true, passive: true })
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('wheel', onMove, true)
    }
  }, [id, suppressFor])

  useEffect(() => {
    if (!id) {
      setInfo(null)
      setExtra(null)
    }
  }, [id])

  if (!id || !anchor) return null

  // 右下偏移；越界则翻到光标左侧/上方（定位规则抽到 flipOf，四边界由单测覆盖）
  const pos = flipOf(anchor, { w: window.innerWidth, h: window.innerHeight })

  return (
    <div className="item-preview" role="tooltip" style={{ left: pos.x, top: pos.y }}>
      <div className="item-preview-name">{info ? displayName({ id, ...info }) : id}</div>
      <div className="item-preview-id mono">{id}</div>
      <div className="item-preview-meta">
        <span className="chip">{extra?.mod ?? modOf(id)}</span>
        <span className="chip">{extra ? `${extra.recipeCount} 条配方` : '查询中…'}</span>
      </div>
    </div>
  )
}
