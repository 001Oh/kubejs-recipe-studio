/**
 * 配方浏览（JEI 风格）lite 版：双 Tab 共用同一份倒排索引，只做两次查询。
 * 卡片负责"扫"，右侧详情面板负责"读"；点卡片只是选中，点「载入工作台」才进入编辑。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ItemEntry, RecipeIO, RecipeRecord } from '@shared/types'
import { RECIPE_DETAIL_PAGE_SIZE, RECIPE_PAGE_SIZE } from '@shared/constants'
import { call } from '../api'
import { useAppStore, type BrowseTab } from '../store/appStore'
import { ItemIcon } from '../components/ItemIcon'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { useIconKeys } from '../hooks/useIconKeys'
import { loadRecipeToBench } from './browse/loadRecipe'
import './views.css'

const MAX_CHIPS = 8

export function BrowseView(): JSX.Element {
  const itemId = useAppStore((s) => s.selectedItemId)
  const tab = useAppStore((s) => s.browseTab)
  const setBrowseTab = useAppStore((s) => s.setBrowseTab)
  const summary = useAppStore((s) => s.summary)
  const browseMode = useAppStore((s) => s.ui?.browseMode ?? 'list')
  const selected = useAppStore((s) => s.selectedRecipe)
  const selectRecipe = useAppStore((s) => s.selectRecipe)
  const [item, setItem] = useState<ItemEntry | null>(null)
  const [page, setPage] = useState(0)
  const [craftTotal, setCraftTotal] = useState(0)
  const [useTotal, setUseTotal] = useState(0)
  const [records, setRecords] = useState<RecipeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const pageSize = browseMode === 'detail' ? RECIPE_DETAIL_PAGE_SIZE : RECIPE_PAGE_SIZE

  useEffect(() => {
    setPage(0)
    selectRecipe(null)
    if (!itemId) {
      setItem(null)
      setRecords([])
      return
    }
    void Promise.all([call('items:get', { id: itemId }), refreshCounts(itemId)]).then(([entry]) => {
      if (entry) setItem(entry)
    })
  }, [itemId])

  const refreshCounts = async (id: string): Promise<void> => {
    const [a, b] = await Promise.all([
      call('recipes:byOutput', { id, offset: 0, limit: 1 }),
      call('recipes:byInput', { id, offset: 0, limit: 1 })
    ])
    setCraftTotal(a?.total ?? 0)
    setUseTotal(b?.total ?? 0)
  }

  useEffect(() => {
    if (!itemId) return
    const channel = tab === 'craft' ? 'recipes:byOutput' : 'recipes:byInput'
    setLoading(true)
    let alive = true
    void call(channel, { id: itemId, offset: page * pageSize, limit: pageSize }).then((res) => {
      if (!alive) return
      const items = res?.items ?? []
      setRecords(items)
      setLoading(false)
      // 首次进入（或翻页后没有选中项）自动选中第一条，让右侧详情有内容可读
      const current = useAppStore.getState().selectedRecipe
      if (items.length > 0 && (!current || !items.some((r) => r.uid === current.uid))) {
        useAppStore.getState().selectRecipe(items[0])
      }
    })
    listRef.current?.scrollTo({ top: 0 })
    return () => {
      alive = false
    }
  }, [itemId, tab, page, pageSize, summary])

  const total = tab === 'craft' ? craftTotal : useTotal
  const pages = Math.max(1, Math.ceil(total / pageSize))

  /** ← / → 翻页（规格 3.9.9）；输入框内不抢键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const store = useAppStore.getState()
      if (store.view !== 'browse' || store.settingsOpen || !itemId) return
      e.preventDefault()
      setPage((p) => Math.max(0, Math.min(pages - 1, p + (e.key === 'ArrowRight' ? 1 : -1))))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages, itemId])

  const sourceBadge = useMemo(
    () => (r: RecipeRecord): string =>
      r.source === 'kubejs' ? '来自现有脚本' : r.type.startsWith('minecraft:') ? '原版' : r.source === 'datapack' ? '需要数据包' : '来自模组',
    []
  )

  if (!itemId) {
    return (
      <div className="work-body">
        <EmptyState
          kind="generic"
          title="从左侧选一个物品开始"
          steps={['搜索物品', '查看制作 / 用途', '载入工作台编辑']}
          hint="左键 = 制作 / 用途；Alt+左键 直达「用途」；中键吸取到工作台；也可以把物品直接拖进槽位"
        />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="work-body">
        <EmptyState
          kind="indexing"
          title="配方索引尚未建立"
          hint="浏览物品配方需要完整解析 jar 与数据包里的配方文件"
          actionLabel="开始扫描"
          onAction={() => void useAppStore.getState().startScan(false)}
        />
      </div>
    )
  }

  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, page * pageSize + records.length)

  return (
    <div className="browse">
      <header className="work-head">
        <ItemIcon
          item={item ? { id: item.id, name: item.nameZh, iconKey: item.iconKey, hasIcon: item.hasIcon } : null}
          size={32}
        />
        <div className="work-head-title">
          <div className="work-title truncate" title={item?.nameZh ?? itemId}>
            {item?.nameZh ?? itemId}
          </div>
          <div className="work-sub mono truncate" title={itemId}>
            {itemId}
          </div>
        </div>
        <div className="seg" role="tablist" aria-label="制作或用途">
          <SegButton label="制作" count={craftTotal} active={tab === 'craft'} onClick={() => setBrowseTab('craft' as BrowseTab)} />
          <SegButton label="用途" count={useTotal} active={tab === 'use'} onClick={() => setBrowseTab('use' as BrowseTab)} />
        </div>
      </header>

      <div className="work-caption">
        <span className="subtle">
          {loading ? '正在读取配方…' : `共 ${total.toLocaleString('zh-CN')} 条${tab === 'craft' ? '产出该物品的配方' : '以该物品为材料的配方'}`}
        </span>
        <span className="topbar-spacer" />
        {total > 0 ? (
          <span className="subtle mono">{`${from}–${to} / ${total.toLocaleString('zh-CN')}`}</span>
        ) : null}
      </div>

      {records.length === 0 ? (
        loading ? (
          <div className="card-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="skeleton sk-card" key={i} />
            ))}
          </div>
        ) : (
          <div className="work-body">
            <EmptyState
              kind="no-recipe"
              title={total === 0 ? '暂无已知配方' : '该页没有配方'}
              hint="可能是动态注册配方，或该模组未提供数据驱动配方"
            />
          </div>
        )
      ) : (
        <>
          <div className="browse-list" ref={listRef}>
            {records.map((r) => (
              <RecipeCard
                key={r.uid}
                record={r}
                badge={sourceBadge(r)}
                selected={selected?.uid === r.uid}
                onSelect={() => selectRecipe(r)}
              />
            ))}
          </div>
          <div className="browse-pager">
            <button className="btn btn-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="上一页" title="上一页（←）">
              <Icon name="chevron-left" size={16} />
            </button>
            <span className="pager-label">
              <strong>{page + 1}</strong> / {pages}
            </span>
            <button
              className="btn btn-icon"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
              aria-label="下一页"
              title="下一页（→）"
            >
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SegButton({
  label,
  count,
  active,
  onClick
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button role="tab" aria-selected={active} className={`seg-btn${active ? ' active' : ''}`} onClick={onClick}>
      {label}
      <span className="count">{count.toLocaleString('zh-CN')}</span>
    </button>
  )
}

/**
 * 配方卡。
 *
 * **UI-U2（T-08b）：键盘焦点不切换详情。**
 * 旧实现同时挂了 `onClick={onSelect}` 与 `onFocus={onSelect}`，于是 Tab / 方向键在卡片间移动焦点时
 * 右侧详情会跟着变——用户只是在"浏览焦点"，并没有选择任何一条。现在只保留两条**显式**选择路径：
 * 点击、以及在卡片上按 Enter；焦点移动本身不再产生副作用。
 * 键盘可达性不受影响：`tabIndex={0}` 与 `role="button"` 仍在，Enter 仍能选中并载入。
 */
export function RecipeCard({
  record,
  badge,
  selected,
  onSelect
}: {
  record: RecipeRecord
  badge: string
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const inputs = record.inputs.slice(0, MAX_CHIPS)
  const outputs = record.outputs.slice(0, MAX_CHIPS)
  const iconMap = useIconKeys([...inputs, ...outputs].map((io) => io.id))

  const onLoad = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await loadRecipeToBench(record)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`recipe-card${record.partial ? ' partial' : ''}${selected ? ' selected' : ''}`}
      onClick={onSelect}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSelect()
          void onLoad()
        }
      }}
    >
      <header>
        <span className="mono aux">{record.type}</span>
        <span className="badge">{badge}</span>
        {record.partial ? <span className="badge badge-warn">部分解析</span> : null}
        {record.unknownIds && record.unknownIds.length > 0 ? (
          <span className="badge badge-warn" title={record.unknownIds.join('\n')}>
            未知物品 {record.unknownIds.length}
          </span>
        ) : null}
        <span className="topbar-spacer" />
        <button
          className="btn btn-sm card-load"
          onClick={(e) => {
            e.stopPropagation()
            void onLoad()
          }}
          title={record.partial ? '原始脚本含动态逻辑，仅载入可静态解析的部分' : '以现有配方为模板打开工作台'}
        >
          <Icon name="bench" size={14} />
          {busy ? '载入中…' : record.partial ? '载入可解析部分' : '载入工作台'}
        </button>
      </header>
      <div className="card-body">
        <div className="card-io">
          {inputs.length === 0 ? <span className="subtle">无材料</span> : null}
          {inputs.map((io, i) => (
            <IoChat key={`${io.id}-${i}`} io={io} iconKey={iconMap[io.id] ?? null} />
          ))}
          {record.inputs.length > MAX_CHIPS ? <span className="subtle">+{record.inputs.length - MAX_CHIPS}</span> : null}
        </div>
        <span className="arrow" aria-hidden="true">
          <Icon name="arrow-right" size={14} />
        </span>
        <div className="card-io card-io-out">
          {outputs.length === 0 ? <span className="subtle">无产物</span> : null}
          {outputs.map((io, i) => (
            <IoChat key={`${io.id}-${i}`} io={io} iconKey={iconMap[io.id] ?? null} chance />
          ))}
          {record.outputs.length > MAX_CHIPS ? <span className="subtle">+{record.outputs.length - MAX_CHIPS}</span> : null}
        </div>
      </div>
    </article>
  )
}

function IoChat({ io, iconKey, chance }: { io: RecipeIO; iconKey: string | null; chance?: boolean }): JSX.Element {
  const short = io.id.split(':').slice(-1)[0] ?? io.id
  return (
    <span className="io-chip" title={`${io.id} ×${io.count}${io.chance ? ` · ${Math.round(io.chance * 100)}%` : ''}`}>
      <ItemIcon item={{ id: io.id, name: short, iconKey, hasIcon: !!iconKey }} size={16} />
      <span className="io-chip-name">{short}</span>
      {io.count > 1 ? <span className="io-chip-n">×{io.count}</span> : null}
      {chance && io.chance ? <span className="io-chip-n io-chip-chance">{Math.round(io.chance * 100)}%</span> : null}
    </span>
  )
}
