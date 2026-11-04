/**
 * 编辑会话条（试点草稿）：来源与基线、修改状态、提交 / 取消、冲突三选一、
 * 未建模字段（只读）、打开诊断与回写预览。
 * 只在 benchV2 白名单命中的配方载入后出现；关闭白名单即完全不渲染。
 *
 * 文案约定（P-C7 端到端脚本按文本定位，改动前先看 .cache/e2e-pc7.mjs）：
 *   「脏字段 N」「原始配方已变化」「提交配方 / 保存副本 / 取消草稿 /
 *    重新载入 / 保留我的修改 / 另存为副本」以及 .pilot-unknowns / .pilot-diagnostics / .pilot-preview
 */
import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useBenchStore } from '../../store/benchStore'
import { isBlankDraft } from '../../store/draftBridge'
import { retryConflictRefresh, submitDraft } from '../../store/commitBridge'
import { callRaw } from '../../api'
import { Icon } from '../../components/Icon'
import { FailurePanel } from '../../components/FailurePanel'
import { useAppStore } from '../../store/appStore'
import { writeTargetOf } from './editModes'

/** D3：失败码 → 用户能读懂的一句话（术语只留在 code 徽标里） */
function failureTitle(code: string): string {
  switch (code) {
    case 'RAW_UNREADABLE':
      return '读不到原始配方文件，提交已停止'
    case 'STALE':
      return '源文件已经失效'
    case 'TARGET_VANISHED':
      return '目标文件已经被外部删除'
    case 'TARGET_CHANGED':
      return '目标文件在写入前被外部改动'
    case 'SAVE_FAILED':
      return '写入没有成功，原文件未改动'
    case 'SAVE_VERIFY_FAILED':
      return '写入后校验失败，已回滚'
    case 'SAVE_ROLLBACK_FAILED':
      return '写入失败且回滚异常，请先检查该文件'
    case 'BACKUP_FAILED':
      return '备份失败，未写入任何内容'
    case 'INVALID_RECIPE':
      return '配方内容不完整，被拒绝写入'
    default:
      return '提交没有完成'
  }
}

export function PilotDraftPanel(): JSX.Element | null {
  const draft = useBenchStore((s) => s.draft)
  const conflict = useBenchStore((s) => s.draftConflict)
  const conflictLoadFailed = useBenchStore((s) => s.conflictLoadFailed)
  const bench = useBenchStore((s) => s.bench)
  const committing = useBenchStore((s) => s.committing)
  const lastCommit = useBenchStore((s) => s.lastCommit)
  const commitFailure = useBenchStore((s) => s.commitFailure)
  const setCommitFailure = useBenchStore((s) => s.setCommitFailure)
  const toast = useAppStore((s) => s.toast)
  // 第 115 批续：主进程拒绝定位（包外 / 文件没了 / 没有独立文件）后，本按钮降级为"复制路径"
  const [revealBroken, setRevealBroken] = useState(false)
  const getPreview = useBenchStore((s) => s.getDraftPreview)
  const cancelDraft = useBenchStore((s) => s.cancelDraft)
  const reload = useBenchStore((s) => s.resolveConflictReload)
  const keepMine = useBenchStore((s) => s.resolveConflictKeepMine)
  const saveCopy = useBenchStore((s) => s.resolveConflictSaveCopy)

  const preview = useMemo(() => getPreview(), [bench, draft, conflict, getPreview])
  if (!draft) return null
  const copyMode = draft.meta.base === null
  const dirty = draft.meta.dirtyFields.length
  const canSubmit = !committing && !conflict && !draft.unsafeReason && draft.meta.dirtyFields.length > 0
  const target = writeTargetOf({
    hasDraft: true,
    copyMode,
    blank: isBlankDraft(draft),
    sourcePath: draft.normalized.source.sourcePath
  })
  // D2：无论能不能提交，title 都要先说清"会写到哪"（覆盖哪个文件 / 新建文件），再解释为什么现在不能点
  const submitHint = conflict
    ? '先处理冲突才能提交'
    : draft.unsafeReason
      ? draft.unsafeReason
      : dirty === 0
        ? `${target.submitTitle}；当前没有修改需要保存`
        : `${target.submitTitle}；失败不会清空草稿`

  const copySourcePath = (): void => {
    const path = draft.normalized.source.sourcePath
    if (!path) return
    void navigator.clipboard?.writeText(path)
    toast('源文件路径已复制，可粘贴到资源管理器定位', 'info')
  }

  /**
   * 第 115 批续：只把 uid 交给主进程，路径解析与越界校验都在主进程做。
   * 被拒绝时不弹新面板——把本动作降级成"复制路径"并说明原因（不静默失败）。
   */
  const revealSourceFile = async (): Promise<void> => {
    const uid = draft.normalized.source.uid
    const res = await callRaw('source:reveal', { uid }).catch((err: unknown) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
      code: 'BRIDGE'
    }))
    if (res.ok) {
      toast(`已在资源管理器中定位：${res.data.relativePath}`, 'success')
      return
    }
    setRevealBroken(true)
    copySourcePath()
    toast(`无法打开所在目录（${res.code ?? '未知'}）：${res.error}；已改为复制路径`, 'warn')
  }

  return (
    <section className="pilot-panel" aria-label="试点草稿">
      <header className="pilot-bar">
        <span className="pilot-flag">
          <Icon name="sparkle" size={12} />
          草稿
        </span>
        <span className="badge mono" title="配方类型">
          {draft.normalized.typeId}
        </span>
        <span className="badge" title="该配方类型使用的 schema 修订号">
          schema rev {draft.normalized.schemaRef.revision ?? 1}
        </span>
        <span className="subtle mono pilot-hash" title={draft.normalized.rawHash}>
          #{draft.normalized.rawHash.slice(0, 8)}
        </span>
        <span className={`pilot-dirty${dirty > 0 ? ' is-dirty' : ''}`} title="相对原始数据被改过的字段数">
          <span className="dot" aria-hidden="true" />
          脏字段 {dirty}
        </span>
        <span className="topbar-spacer" />
        {lastCommit ? (
          <span className="pilot-commit mono truncate" title={lastCommit.path}>
            <Icon name="check" size={12} />
            {lastCommit.path.replace(/\\/g, '/').split('/').slice(-2).join('/')}
          </span>
        ) : null}
        <button className="btn btn-sm" onClick={cancelDraft} title="丢弃草稿，原始文件不动">
          取消草稿
        </button>
        <button className="btn btn-primary btn-sm" disabled={!canSubmit} title={submitHint} onClick={() => void submitDraft()}>
          <Icon name="save" size={14} />
          {committing ? '提交中…' : copyMode ? '保存副本' : '提交配方'}
        </button>
      </header>

      {draft.banners.map((banner, i) => (
        <div key={i} className={`banner-bar ${banner.level === 'warn' ? 'banner-warn' : ''}`}>
          <span className="banner-icon">
            <Icon name={banner.level === 'warn' ? 'alert' : 'info'} size={14} />
          </span>
          <span>{banner.text}</span>
        </div>
      ))}

      {!conflict && commitFailure ? (
        // D3：读不了原始 / 写盘失败不再只丢一个 9 秒 toast——面板留着，给出能点的出路
        <FailurePanel
          className="pilot-failure"
          title={failureTitle(commitFailure.code)}
          message={commitFailure.message}
          code={commitFailure.code}
          actions={[
            { label: '重试读取', onClick: () => void submitDraft(), variant: 'primary', title: '重新读一次磁盘上的源文件并重新校验；失败不会清空草稿' },
            ...(revealBroken
              ? [
                  {
                    label: '复制路径（打开目录不可用）',
                    onClick: copySourcePath,
                    disabled: !draft.normalized.source.sourcePath,
                    title: '上次定位被拒绝，已降级为复制路径'
                  }
                ]
              : [
                  {
                    label: '打开所在目录',
                    onClick: () => void revealSourceFile(),
                    disabled: !draft.normalized.source.sourcePath,
                    title: draft.normalized.source.sourcePath
                      ? `在资源管理器中选中 ${draft.normalized.source.sourcePath}（只定位，不打开文件）`
                      : '新建配方还没有源文件'
                  },
                  {
                    label: '复制路径',
                    onClick: copySourcePath,
                    disabled: !draft.normalized.source.sourcePath,
                    title: '打不开资源管理器时的兜底：把源文件路径复制到剪贴板'
                  }
                ]),
            { label: '取消草稿', onClick: cancelDraft, title: '丢弃草稿，原始文件保持不动' }
          ]}
          onDismiss={() => setCommitFailure(null)}
        >
          <p className="failure-hint">
            草稿已保留：收起这个提示不会丢掉你改过的内容，原始文件也没有被改动。
            {draft.normalized.source.sourcePath ? `源文件：${draft.normalized.source.sourcePath}` : null}
          </p>
        </FailurePanel>
      ) : null}

      {!conflict && conflictLoadFailed ? (
        // P3-22a：提交撞 CONFLICT 后读取最新原始失败——显式冲突态 + 可操作出路，提交按钮保持可用
        <div className="conflict-card" role="alert">
          <header className="conflict-head">
            <span className="conflict-icon" aria-hidden="true">
              <Icon name="alert" size={18} />
            </span>
            <div>
              <strong>原始配方已变化，且无法读取最新内容</strong>
              <p>
                提交被基线校验拒绝，但重新读取原始数据也失败了。可以直接重试读取；也可以取消草稿后在浏览页重新打开配方。
              </p>
            </div>
          </header>
          <ul className="conflict-options">
            <li>
              <div className="conflict-opt">
                <strong>重试读取</strong>
                <p>再读一次磁盘上的最新原始数据；读取成功后进入正常的冲突三选一。</p>
              </div>
              <button className="btn btn-sm" onClick={() => void retryConflictRefresh()}>
                重试读取
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      {conflict ? (
        <div className="conflict-card" role="alert">
          <header className="conflict-head">
            <span className="conflict-icon" aria-hidden="true">
              <Icon name="alert" size={18} />
            </span>
            <div>
              <strong>原始配方已变化</strong>
              <p>
                磁盘上的文件在你打开草稿之后被改过（rawHash 不一致）。为避免覆盖别人的修改，提交已暂停。请选择一种处理方式：
              </p>
            </div>
          </header>          <ul className="conflict-options">
            <li>
              <div className="conflict-opt">
                <strong>重新载入最新内容</strong>
                <p>以磁盘上的最新原始数据重建草稿，之后的编辑从新内容出发。</p>
                <span className="conflict-cons conflict-cons-danger">会丢弃你当前未提交的修改</span>
              </div>
              <button className="btn btn-sm" onClick={reload}>
                重新载入
              </button>
            </li>
            <li>
              <div className="conflict-opt">
                <strong>保留我的修改</strong>
                <p>保留当前编辑内容，把基线换成最新原始数据；再次提交会覆盖磁盘上的外部改动。</p>
                <span className="conflict-cons conflict-cons-warn">提交后外部修改会被替换（写入前仍会备份）</span>
              </div>
              <button className="btn btn-sm" onClick={keepMine}>
                保留我的修改
              </button>
            </li>
            <li>
              <div className="conflict-opt">
                <strong>另存为副本</strong>
                <p>脱离原始基线，改写到 recipe_studio 数据包下的一份新配方，原文件保持不动。</p>
                <span className="conflict-cons conflict-cons-safe">最安全：不会覆盖任何现有文件</span>
              </div>
              <button className="btn btn-sm" onClick={saveCopy}>
                另存为副本
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      <div className="pilot-disclosures">
        {draft.passThrough.length > 0 ? (
          <details className="pilot-unknowns">
            <summary>
              <Icon name="chevron-right" size={12} />
              未建模字段 {draft.passThrough.length} 个
              <span className="subtle">只读 · 生成时原样保留</span>
            </summary>
            <ul>
              {draft.passThrough.map((field) => (
                <li key={field.path} className="mono">
                  <span className="pilot-field-path">{field.path}</span>
                  {field.value === undefined ? (
                    <span className="badge badge-warn">超出展开限制（{field.bytes ?? 0} 字节，原文保留）</span>
                  ) : (
                    <span className="pilot-field-val">{JSON.stringify(field.value).slice(0, 120)}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {draft.diagnostics.length > 0 ? (
          <details className="pilot-diagnostics">
            <summary>
              <Icon name="chevron-right" size={12} />
              打开诊断 {draft.diagnostics.length} 条
              <span className="subtle">只读</span>
            </summary>
            <ul>
              {draft.diagnostics.map((d, i) => (
                <li key={`${d.code}-${i}`} className="mono">
                  <span className={`badge ${d.level === 'error' ? 'badge-error' : d.level === 'warn' ? 'badge-warn' : ''}`}>{d.code}</span>
                  {d.path ? <span className="pilot-field-path">{d.path}</span> : null}
                  <span className="pilot-field-val">{d.message}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <details className="pilot-preview">
          <summary>
            <Icon name="chevron-right" size={12} />
            回写预览
            <span className="subtle">
              {preview?.kind === 'text' ? '未编辑：原始文本' : `已编辑 ${preview?.dirtyFields.join('、') || ''}`}
            </span>
          </summary>
          {preview ? (
            <pre className="mono">{preview.kind === 'text' ? preview.text : JSON.stringify(preview.json, null, 2)}</pre>
          ) : (
            <p className="subtle">冲突未处理或草稿不可用，预览已阻止。</p>
          )}
        </details>
      </div>
    </section>
  )
}
