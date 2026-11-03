/**
 * P-C3 渲染端提交编排：只负责发 IPC、处理 UI 状态与把成功结果重新装回草稿。
 * 所有安全校验（基线/unsafe/schema/写盘/回读）在主进程独立执行。
 */
import type { CommitRecipeResult } from '@shared/ipc'
import { call, callRaw } from '../api'
import { useAppStore } from './appStore'
import { useBenchStore } from './benchStore'
import { isBlankDraft, normalizedToDraft } from './draftBridge'

export interface SubmitOutcome {
  ok: boolean
  code?: string
  error?: string
  conflict?: boolean
  result?: CommitRecipeResult
}

/** P-C6：把提交失败码翻译成「接下来该做什么」，避免用户盲目重试覆盖 */
const FAILURE_HINTS: Record<string, string> = {
  BACKUP_FAILED: '未写入任何内容，原文件未被改动；可重试或取消',
  SAVE_ROLLBACK_FAILED: '目标文件状态不确定，请先检查该配方文件再决定是否重试（原文件有备份）',
  TARGET_VANISHED: '目标文件在提交过程中被外部删除，已保持删除状态；请重新打开配方',
  TARGET_CHANGED: '目标文件在写入前被外部修改，已放弃覆盖；请重新打开配方后再改',
  SAVE_FAILED: '未写入目标文件；草稿已保留，可重试',
  SAVE_VERIFY_FAILED: '写入后校验失败，已回滚到提交前内容；草稿已保留'
}

function failWithHint(message: string, code: string): SubmitOutcome {
  const hint = FAILURE_HINTS[code]
  const text = hint ? `${message}（${hint}）` : message
  useAppStore.getState().toast(text, 'error')
  useAppStore.getState().pushLog('ERROR', 'RECIPE', `提交失败[${code}]：${text}`)
  return { ok: false, code, error: text }
}

function applyCommitted(result: CommitRecipeResult): void {
  const loaded = normalizedToDraft(result.opened)
  if (!loaded) {
    useAppStore.getState().toast('保存成功但重新载入失败，请重新打开配方检查', 'error')
    useAppStore.getState().pushLog('ERROR', 'RECIPE', `保存成功但规范化失败：${result.savedPath}`)
    return
  }
  useBenchStore.setState({
    bench: loaded.workbench,
    past: [],
    future: [],
    draft: {
      uid: result.savedUid,
      meta: loaded.meta,
      passThrough: loaded.passThrough,
      normalized: loaded.normalized,
      schema: loaded.schema,
      diagnostics: loaded.diagnostics,
      ...(loaded.unsafeReason ? { unsafeReason: loaded.unsafeReason } : {}),
      banners: [
        ...loaded.banners,
        { level: 'info', text: `已保存到 ${result.savedRelativePath}（已从磁盘回读校验）` },
        ...(result.indexUpdated
          ? []
          : [
              {
                level: 'warn' as const,
                text: result.indexWarning ?? '文件已写入，但内存索引更新失败；请执行「重新扫描」后再查询/打开该配方'
              }
            ])
      ]
    },
    draftConflict: null,
    loadedFrom: result.savedUid,
    lastCommit: { path: result.savedPath, uid: result.savedUid, at: Date.now() }
  })
}

async function refreshConflict(uid: string): Promise<void> {
  const opened = await call('recipes:open', { uid })
  if (!opened || !opened.normalized) {
    useAppStore.getState().toast('原始配方已变化，且无法读取最新内容；请重新打开配方', 'error')
    return
  }
  // 只挂起冲突，绝不在这里替换用户草稿（默认不覆盖）
  useBenchStore.setState({ draftConflict: opened })
  useAppStore
    .getState()
    .toast('原始配方已变化：请在面板里选择「重新载入 / 保留我的修改 / 另存副本」', 'warn')
}

/** 提交当前试点草稿；成功后才清 dirtyFields，失败保持草稿可重试 */
export async function submitDraft(): Promise<SubmitOutcome> {
  const store = useBenchStore.getState()
  const draft = store.draft
  if (!draft) return failWithHint('没有可提交的试点草稿', 'NO_DRAFT')
  if (store.committing) return failWithHint('正在提交，请稍候', 'BUSY')
  if (store.draftConflict) return failWithHint('存在未解决的冲突，请先处理冲突再提交', 'CONFLICT_PENDING')
  if (draft.unsafeReason) return failWithHint(draft.unsafeReason, 'UNSAFE')
  if (draft.meta.dirtyFields.length === 0) return failWithHint('没有修改需要保存', 'NO_CHANGES')

  // T-28：空白草稿无索引记录 → 走 create；其余沿用 overwrite/copy 不变
  const mode = isBlankDraft(draft) ? 'create' : draft.meta.base ? 'overwrite' : 'copy'
  useBenchStore.setState({ committing: true })
  try {
    const res = await callRaw('recipes:commit', {
      uid: draft.normalized.source.uid,
      mode,
      expectedRawHash: draft.meta.base?.rawHash ?? null,
      expectedSchemaId: draft.schema.id,
      expectedSchemaRevision: draft.schema.revision ?? 0,
      workbench: useBenchStore.getState().bench,
      dirtyFields: [...draft.meta.dirtyFields]
    })
    if (!res.ok) {
      if (res.code === 'CONFLICT') {
        await refreshConflict(draft.normalized.source.uid)
        useAppStore.getState().pushLog('WARN', 'RECIPE', `提交被拒绝（冲突）：${res.error}`)
        return { ok: false, code: res.code, error: res.error, conflict: true }
      }
      return failWithHint(res.error, res.code ?? 'COMMIT_FAILED')
    }
    const result = res.data as CommitRecipeResult
    applyCommitted(result)
    if (result.indexUpdated) {
      useAppStore.getState().toast(`已保存：${result.savedRelativePath}`, 'success')
      useAppStore.getState().pushLog('SUCCESS', 'RECIPE', `配方已提交：${result.savedRelativePath}（${result.bytes} 字节）`)
    } else {
      // 文件已写入但索引没更新：必须显式告警，不能让界面继续展示旧数据
      useAppStore.getState().toast('已保存，但索引未更新：请重新扫描', 'warn')
      useAppStore
        .getState()
        .pushLog('WARN', 'RECIPE', result.indexWarning ?? '文件已写入，但索引更新失败；请重新扫描')
    }
    return { ok: true, result }
  } catch (err) {
    return failWithHint(`提交失败：${err instanceof Error ? err.message : String(err)}`, 'COMMIT_FAILED')
  } finally {
    useBenchStore.setState({ committing: false })
  }
}
