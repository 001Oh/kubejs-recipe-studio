/**
 * 物品查找（左栏下半部）：找物品的唯一入口（规格 3.3）。
 * 搜索实时防抖 120ms，结果虚拟滚动，每行以真实物品贴图为视觉主体。
 * 编辑操作一律不在这里发生——这里只有"选择 / 拖拽 / 收藏"。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { JSX } from 'react'
import type { ItemHit } from '@shared/types'
import { SIDEBAR_PAGE_SIZE, SIDEBAR_ROW_HEIGHT, SEARCH_DEBOUNCE_MS } from '@shared/constants'
import { appendUnique, nextPageOffset, shouldPrefetch } from './sidebar/paging'
import { useHoverPreview } from './sidebar/useHoverPreview'
import { call } from '../api'
import { useAppStore } from '../store/appStore'
import { ItemIcon } from '../components/ItemIcon'
import { Highlight } from '../components/Highlight'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'

interface Filters {
  modId: string
  onlyRegistered: boolean
  onlyWithRecipes: boolean
  onlyFavorites: boolean
}

const EMPTY_FILTERS: Filters = { modId: '', onlyRegistered: false, onlyWithRecipes: false, onlyFavorites: false }

export function Sidebar(): JSX.Element {
  const modpack = useAppStore((s) => s.modpack)
  const summary = useAppStore((s) => s.summary)
  const favorites = useAppStore((s) => s.favorites)
  const pushLog = useAppStore((s) => s.pushLog)
  const toast = useAppStore((s) => s.toast)
  const patchUi = useAppStore((s) => s.patchUi)
  const ui = useAppStore((s) => s.ui)
  const scanning = useAppStore((s) => s.scanning)

  const [text, setText] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [hits, setHits] = useState<ItemHit[]>([])
  // 第 3 条 roving tabindex：整个列表只保留一个 Tab 停靠点，↑↓ 移动该停靠点
  const [focusIndex, setFocusIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [matched, setMatched] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [mods, setMods] = useState<{ modId: string; count: number }[]>([])
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const reqSeq = useRef(0)
  const loadingMore = useRef(false)
  // 槽位里的物品可以拖回侧边栏：拖出 = 清空该槽 / 递归打开该材料的配方
  const drop = useDroppable({ id: 'sidebar' })

  useEffect(() => {
    const focus = (): void => inputRef.current?.focus()
    window.addEventListener('studio:focus-search', focus)
    return () => window.removeEventListener('studio:focus-search', focus)
  }, [])

  useEffect(() => {
    if (!modpack) return
    void call('items:mods').then((res) => res && setMods(res))
  }, [modpack])

  const query = useCallback(
    async (value: string, f: Filters, offset: number, append: boolean): Promise<void> => {
      if (!modpack || !summary) return
      const seq = ++reqSeq.current
      if (!append) setPending(true)
      const res = await call('items:query', {
        text: value,
        modId: f.modId || undefined,
        onlyRegistered: f.onlyRegistered,
        onlyWithRecipes: f.onlyWithRecipes,
        onlyFavorites: f.onlyFavorites,
        // 虚拟物品开关只影响查询；语料始终含全量，切换不重扫、不重建
        includeVirtual: ui?.showVirtualItems ?? false,
        offset,
        limit: SIDEBAR_PAGE_SIZE
      })
      if (!res || seq !== reqSeq.current) return
      // 首页整表替换并回到顶部；后续页追加去重（同一物品可能因数据变化出现在两页里）
      setHits((prev) => (append ? appendUnique(prev, res.hits) : res.hits))
      if (!append) {
        listRef.current?.scrollTo({ top: 0 })
        setPending(false)
      }
      setTotal(res.total)
      setMatched(res.matched)
      setElapsed(res.elapsedMs)
    },
    [modpack, summary, ui?.showVirtualItems]
  )

  /** 滚动到接近末尾时加载下一页（单页条数固定 SIDEBAR_PAGE_SIZE） */
  const loadMore = useCallback((): void => {
    if (loadingMore.current) return
    if (nextPageOffset({ loaded: hits.length, matched, pageSize: SIDEBAR_PAGE_SIZE }) === null) return
    loadingMore.current = true
    void query(text, filters, hits.length, true).finally(() => {
      loadingMore.current = false
    })
  }, [hits.length, matched, query, text, filters])

  useEffect(() => {
    // 搜索词 / 筛选 / 虚拟开关任一变化：防抖后从第一页重查
    const t = setTimeout(() => void query(text, filters, 0, false), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text, filters, query])

  const virt = useVirtualizer({
    count: hits.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => SIDEBAR_ROW_HEIGHT,
    overscan: 12
  })

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const toggleFav = async (hit: ItemHit): Promise<void> => {
    const on = !favoriteSet.has(hit.item.id)
    const res = await call('favorites:set', { id: hit.item.id, on })
    if (res) {
      useAppStore.setState({ favorites: res })
      pushLog('DEBUG', 'UI', `${on ? '收藏' : '取消收藏'} ${hit.item.id}`)
    } else toast('收藏写入失败', 'error')
  }

  /** 搜索框里的上下键直接移动选中项：不用离开输入框就能翻结果 */
  const moveSelection = (delta: number): void => {
    if (hits.length === 0) return
    const current = useAppStore.getState().selectedItemId
    const index = hits.findIndex((h) => h.item.id === current)
    const next = index === -1 ? 0 : Math.max(0, Math.min(hits.length - 1, index + delta))
    const hit = hits[next]
    if (!hit) return
    useAppStore.getState().selectItem(hit.item.id, useAppStore.getState().browseTab)
    virt.scrollToIndex(next, { align: 'auto' })
  }

  if (!modpack) {
    return (
      <EmptyState
        kind="no-modpack"
        compact
        title="导入后在这里查找物品"
        steps={['① 导入整合包', '② 扫描物品与配方', '③ 拖拽构建配方']}
        hint="支持拼音全拼与首字母，例如 zuanshi / zs / jgs"
      />
    )
  }

  if (!summary) {
    return (
      <EmptyState
        kind="indexing"
        compact
        title={scanning ? '正在建立索引' : '物品与配方索引尚未建立'}
        hint={scanning ? '首次扫描需要解析全部 mod jar，请稍候' : `${modpack.modCount} 个 mod 待解析`}
        actionLabel={scanning ? undefined : '开始扫描'}
        onAction={scanning ? undefined : () => void useAppStore.getState().startScan(false)}
      />
    )
  }

  const activeFilters =
    (filters.modId ? 1 : 0) +
    (filters.onlyRegistered ? 1 : 0) +
    (filters.onlyWithRecipes ? 1 : 0) +
    (filters.onlyFavorites ? 1 : 0) +
    (text.trim() ? 1 : 0)

  return (
    <section className="finder" aria-label="物品查找">
      <div className="finder-head">
        <span className="section-label">物品</span>
        <span className="count" title="匹配数量">
          {matched.toLocaleString('zh-CN')}
        </span>
        <span className="topbar-spacer" />
        {activeFilters > 0 ? (
          <button
            className="btn btn-ghost tiny finder-clear"
            onClick={() => {
              setText('')
              setFilters(EMPTY_FILTERS)
            }}
            title="清除搜索与全部筛选"
          >
            清除 {activeFilters}
          </button>
        ) : null}
      </div>

      <div className="sidebar-search">
        <div className="field">
          <span className="field-icon">
            <Icon name="search" size={14} />
          </span>
          <input
            ref={inputRef}
            className={`input has-affix${pending ? ' is-pending' : ''}`}
            placeholder="物品 / ID / 拼音 / 首字母"
            value={text}
            aria-label="物品搜索"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                moveSelection(1)
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                moveSelection(-1)
              }
              if (e.key === 'Escape' && text !== '') {
                e.stopPropagation()
                setText('')
              }
            }}
          />
          {text !== '' ? (
            <span className="field-affix">
              <button className="input-clear" aria-label="清除搜索词" onClick={() => setText('')}>
                <Icon name="close" size={12} />
              </button>
            </span>
          ) : null}
        </div>
        <div className="finder-filters">
          <select
            className="input finder-mod"
            value={filters.modId}
            aria-label="按模组筛选"
            title="按模组筛选"
            onChange={(e) => setFilters({ ...filters, modId: e.target.value })}
          >
            <option value="">全部模组</option>
            {mods.map((m) => (
              <option key={m.modId} value={m.modId}>
                {m.modId}（{m.count}）
              </option>
            ))}
          </select>
          <div className="finder-chips">
            <button
              className={`chip${filters.onlyRegistered ? ' on' : ''}`}
              aria-pressed={filters.onlyRegistered}
              onClick={() => setFilters({ ...filters, onlyRegistered: !filters.onlyRegistered })}
            >
              已注册
            </button>
            <button
              className={`chip${filters.onlyWithRecipes ? ' on' : ''}`}
              aria-pressed={filters.onlyWithRecipes}
              onClick={() => setFilters({ ...filters, onlyWithRecipes: !filters.onlyWithRecipes })}
            >
              有配方
            </button>
            <button
              className={`chip${filters.onlyFavorites ? ' on' : ''}`}
              aria-pressed={filters.onlyFavorites}
              onClick={() => setFilters({ ...filters, onlyFavorites: !filters.onlyFavorites })}
            >
              收藏 {favorites.length}
            </button>
            <button
              className={`chip${ui?.showVirtualItems ? ' on' : ''}`}
              title="显示 / 隐藏 ritual_dummy 等虚拟物品"
              aria-pressed={ui?.showVirtualItems ?? false}
              onClick={() => patchUi({ showVirtualItems: !(ui?.showVirtualItems ?? false) })}
            >
              虚拟
            </button>
          </div>
        </div>
      </div>

      {hits.length === 0 ? (
        pending ? (
          <div className="item-skeleton" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="item-skeleton-row" key={i}>
                <span className="skeleton sk-icon" />
                <span className="sk-lines">
                  <span className="skeleton sk-line" style={{ width: `${52 + ((i * 13) % 34)}%` }} />
                  <span className="skeleton sk-line sk-line-sm" style={{ width: `${34 + ((i * 7) % 26)}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            kind="no-result"
            compact
            title={text ? `未找到与「${text}」匹配的物品` : '没有符合筛选条件的物品'}
            hint="支持拼音与首字母，如 jgs → 金刚石"
            actionLabel="清除筛选"
            onAction={() => {
              setText('')
              setFilters(EMPTY_FILTERS)
            }}
          />
        )
      ) : (
        <div
          className={`item-list${drop.isOver ? ' drag-over-valid' : ''}`}
          ref={(node) => {
            listRef.current = node
            drop.setNodeRef(node)
          }}
          role="list"
          aria-label="物品列表"
          onScroll={() => {
            // 可见区最后一行进入「距末尾 20 行」范围时预取下一页
            const last = virt.getVirtualItems().at(-1)?.index ?? -1
            if (shouldPrefetch(last, { loaded: hits.length, matched, pageSize: SIDEBAR_PAGE_SIZE })) loadMore()
          }}
        >
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((row) => {
              const hit = hits[row.index]
              if (!hit) return null
              return (
                <SideRow
                  key={hit.item.id}
                  hit={hit}
                  top={row.start}
                  height={row.size}
                  selected={useAppStore.getState().selectedItemId === hit.item.id}
                  favorite={favoriteSet.has(hit.item.id)}
                  onToggleFavorite={() => void toggleFav(hit)}
                  rovingIndex={row.index}
                  focusIndex={focusIndex}
                  onRovingMove={(next) => {
                    const clamped = Math.max(0, Math.min(hits.length - 1, next))
                    setFocusIndex(clamped)
                    virt.scrollToIndex(clamped, { align: 'auto' })
                    // 等虚拟列表把目标行渲染出来再聚焦（否则 focus 落空）
                    window.setTimeout(() => {
                      const el = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${clamped}"]`)
                      el?.focus()
                    }, 0)
                  }}
                />
              )
            })}
          </div>
        </div>
      )}

      <footer className="statusbar finder-status">
        <span title="当前已渲染 / 匹配总数">
          {`${hits.length} / ${(matched || total).toLocaleString('zh-CN')}`}
        </span>
        <span className="sep" />
        <span title="全库物品数">库 {total.toLocaleString('zh-CN')}</span>
        <span className="topbar-spacer" />
        <span title="本次查询耗时">{elapsed.toFixed(1)}ms</span>
      </footer>
    </section>
  )
}

/** 一行 = 一个物品。侧边栏只做选择与拖拽源，不承担编辑（规格 3.9.2 硬约束 2）。 */
function SideRow({
  hit,
  top,
  height,
  selected,
  favorite,
  onToggleFavorite,
  rovingIndex,
  focusIndex,
  onRovingMove
}: {
  hit: ItemHit
  top: number
  height: number
  selected: boolean
  favorite: boolean
  onToggleFavorite: () => void
  rovingIndex: number
  focusIndex: number
  onRovingMove: (next: number) => void
}): JSX.Element {
  const drag = useDraggable({
    id: `item:${hit.item.id}`,
    data: {
      from: `item:${hit.item.id}`,
      origin: 'item' as const,
      value: { kind: 'item' as const, id: hit.item.id, count: 1, name: hit.item.nameZh }
    }
  })

  const pick = (useTab = false): void => {
    useAppStore.getState().selectItem(hit.item.id, useTab ? 'use' : useAppStore.getState().browseTab)
  }
  // T-26 / UI-U3：悬停 400 ms 显示物品预览（纯附加行为，不影响原有交互）
  const hover = useHoverPreview(hit.item.id)

  return (
    <div
      ref={drag.setNodeRef}
      className={`item-row${selected ? ' selected' : ''}`}
      style={{
        position: 'absolute',
        top,
        height,
        left: 0,
        right: 0,
        opacity: drag.isDragging ? 0.4 : 1,
        cursor: 'grab'
      }}
      {...drag.attributes}
      {...drag.listeners}
      // 第 3 条 roving tabindex：整列只有一个 Tab 停靠点，其余行 -1，靠 ↑↓ 移动
      tabIndex={rovingIndex === focusIndex ? 0 : -1}
      data-row-index={rovingIndex}
      role="listitem"
      aria-pressed={selected}
      {...hover}
      onMouseDown={(e) => {
        // 中键吸取：Windows 会触发自动滚动，必须在 mousedown 上吃掉默认行为
        if (e.button === 1) {
          e.preventDefault()
          useAppStore.getState().pickEyedropper(hit.item)
        }
      }}
      onAuxClick={(e) => e.preventDefault()}
      onClick={(e) => pick(e.altKey)}
      onKeyDown={(e) => {
        // 第 3 条：行内子元素（如星标按钮）的按键不应被行级处理接管，
        // 否则在星标上按 Enter 会变成「选中行」而不是「切换收藏」。
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          pick(e.altKey)
          return
        }
        // 第 3 条：↑↓ 在行间移动（焦点 + 滚动），保持「焦点不切详情」——选中仍由 Enter/点击触发
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onRovingMove(rovingIndex + 1)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onRovingMove(rovingIndex - 1)
          return
        }
        if (e.key === 'Home') {
          e.preventDefault()
          onRovingMove(0)
          return
        }
        if (e.key === 'End') {
          e.preventDefault()
          onRovingMove(Number.MAX_SAFE_INTEGER)
        }
      }}
      title={`${hit.item.nameZh}\n${hit.item.id}\n左键查看配方 · Alt+左键直达用途 · 中键吸取 · 拖拽放置`}
    >
      <ItemIcon
        item={{ id: hit.item.id, name: hit.item.nameZh, iconKey: hit.item.iconKey, hasIcon: hit.item.hasIcon }}
        size={32}
      />
      <span className="item-row-names">
        <span className="item-zh">
          <Highlight text={hit.item.nameZh} ranges={hit.highlights} field="nameZh" />
          {hit.item.verified ? (
            <span className="badge badge-ok item-verified" title="已在注册表中验证">
              ✓
            </span>
          ) : null}
        </span>
        <span className="item-sub">
          <Highlight text={hit.item.id} ranges={hit.highlights} field="id" />
        </span>
      </span>
      <span className="item-actions">
        <button
          className={`star${favorite ? ' on' : ''}`}
          // 第 3 条：星标随 roving 焦点切换 Tab 可达性（当前行 0，其余 -1）
          tabIndex={rovingIndex === focusIndex ? 0 : -1}
          aria-label={favorite ? '取消收藏' : '收藏'}
          title={favorite ? '取消收藏' : '收藏'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
        >
          <Icon name="star" size={14} />
        </button>
      </span>
    </div>
  )
}
