/**
 * 第 115 批 D1 / D2：编辑入口与写盘目标的**唯一文案源**。
 *
 * 三处必须说同一句话（计划 D1）：
 *   1. 工作台空态面板（`.bench-empty`）
 *   2. 工作台徽标 hover（`.work-head .badge`）
 *   3. 设置页「工作台试点」说明
 * 改文案只改这里；`tests/renderer/components/benchEditModes.test.tsx` 断言三处取的是同一份常量。
 *
 * 注意两条既有契约，本批不动：
 *   - 徽标**可见文字**保持「结构化编辑 / 试点类型 · 未载入 / 通用模式」，
 *     `.cache/e2e-pc7.mjs` 等验收脚本按这些文字定位。
 *   - 入口按钮文字保持「去浏览 / 新建 / 填字段」这类短词，长解释放 `when`（悬停与副标题）。
 */

export type EditEntryId = 'open' | 'create' | 'export'

export interface EditEntry {
  id: EditEntryId
  /** 序号：①②③ */
  ordinal: string
  title: string
  /** 什么时候用它——一句话，避免术语 */
  when: string
  /** 按钮文字 */
  action: string
}

export const ENTRY_TITLE = '开始编辑'

export const ENTRY_SUBTITLE = '三种编辑方式只影响「改哪个文件」，编辑界面本身是同一套'

export const EDIT_ENTRIES: readonly EditEntry[] = [
  {
    id: 'open',
    ordinal: '①',
    title: '打开已有配方',
    when: '改一条已经存在的配方：从「配方浏览」选配方载入，提交时写回它自己的文件',
    action: '去浏览'
  },
  {
    id: 'create',
    ordinal: '②',
    title: '从零新建',
    when: '手上没有现成配方：用当前类型建一条空白配方，提交时新建文件，不碰任何现有配方',
    action: '新建'
  },
  {
    id: 'export',
    ordinal: '③',
    title: '快速导出',
    when: '只想生成脚本：自由填字段，按 Ctrl+S 存成脚本或数据包，原配方一个都不改',
    action: '填字段'
  }
]

/** 徽标 hover / 空态顶部的模式解释：结构化编辑 vs 通用模式，各一句话 */
export const MODE_NOTES = {
  structured: '结构化编辑：改的是磁盘上那条原配方，提交前会核对它有没有被别人改过',
  generic: '通用模式：填字段生成脚本或数据包，任何现有配方都不会被覆盖',
  pilotIdle: '当前类型支持结构化编辑，但还没载入配方：载入后才会出现「提交配方」'
} as const

export interface EntryState {
  id: EditEntryId
  ordinal: string
  title: string
  when: string
  action: string
  disabled: boolean
  /** 禁用原因；可用时为空字符串 */
  reason: string
}

export interface EntryContext {
  /** 已导入整合包（且索引可用） */
  hasModpack: boolean
  /** 当前类型在试点白名单里 */
  pilotType: boolean
}

const NEED_MODPACK = '请先导入整合包'

/**
 * D1：三入口的可用性按当前状态推导，禁用必须给出原因（不能只是变灰）。
 */
export function resolveEntryStates(ctx: EntryContext): EntryState[] {
  return EDIT_ENTRIES.map((entry) => {
    if (!ctx.hasModpack) {
      return { ...entry, disabled: true, reason: NEED_MODPACK }
    }
    if (entry.id === 'create' && !ctx.pilotType) {
      return { ...entry, disabled: true, reason: '该类型不支持结构化编辑，可切换类型（有序合成 / 无序合成 / Create 混合）' }
    }
    return { ...entry, disabled: false, reason: '' }
  })
}

export interface WriteTargetInput {
  hasDraft: boolean
  /** 草稿没有基线：新建或另存副本 */
  copyMode: boolean
  /** 空白结构化配方（还没落盘，提交时命名） */
  blank: boolean
  /** 草稿对应的源文件绝对路径（新建草稿为空串） */
  sourcePath: string
}

export interface WriteTarget {
  /** 常驻标签：一句话说清"提交会写到哪" */
  label: string
  /** 悬停完整说明 */
  detail: string
  /** 提交按钮 title */
  submitTitle: string
}

function tail(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || path
}

/**
 * D2：把"当前这次提交会写到哪里"说成一句人话。
 * 三种编辑态各有稳定文案，切换编辑方式时标签随之变化，不靠用户猜。
 */
export function writeTargetOf(input: WriteTargetInput): WriteTarget {
  if (!input.hasDraft) {
    return {
      label: '脚本（Ctrl+S 选择）',
      detail: '通用模式不会覆盖任何现有配方：Ctrl+S 打开写入对话框，自己选文件名与通道',
      submitTitle: '通用模式的「写入文件」走 Ctrl+S 的写入对话框，不会覆盖原配方'
    }
  }
  if (input.copyMode) {
    return {
      label: input.blank ? '新文件（提交时命名）' : '新文件（副本，不覆盖原配方）',
      detail: input.blank
        ? '空白配方还没落盘：提交时在 recipe_studio 数据包里新建文件'
        : '已脱离原始基线：提交时新建文件，原配方保持不动',
      submitTitle: '将新建文件（提交时命名），不会覆盖任何现有配方'
    }
  }
  return {
    label: tail(input.sourcePath) || '源文件',
    detail: `将覆盖磁盘上的 ${input.sourcePath}（写前自动备份到 userData/recipe-backups）`,
    submitTitle: `将覆盖 ${tail(input.sourcePath)}（写前自动备份，提交前校验它有没有被别人改过）`
  }
}
