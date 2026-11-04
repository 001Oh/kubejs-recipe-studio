/**
 * 第 115 批 D1：工作台空态的三个并列入口。
 *
 * 目标只有一个：**任何时刻都能看清"我现在处于哪种编辑方式、下一步能做什么"**。
 * 三个入口的文案来自 `editModes.ts`（唯一来源），禁用状态与原因由 `resolveEntryStates` 推导，
 * 这里只负责把 `reason` 显示出来——禁用而不能说明原因等于没禁用。
 */
import type { JSX } from 'react'
import { Icon } from '../../components/Icon'
import { ENTRY_SUBTITLE, ENTRY_TITLE, type EditEntryId, type EntryState } from './editModes'

export function StartHerePanel({
  entries,
  onPick
}: {
  entries: EntryState[]
  onPick: (id: EditEntryId) => void
}): JSX.Element {
  return (
    <section className="bench-empty" aria-label={ENTRY_TITLE}>
      <header className="bench-empty-head">
        <span className="section-label">{ENTRY_TITLE}</span>
        <span className="subtle">{ENTRY_SUBTITLE}</span>
      </header>
      <ul className="bench-empty-list">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`edit-entry${entry.disabled ? ' is-disabled' : ''}`}
            data-entry={entry.id}
            data-disabled={entry.disabled ? 'true' : 'false'}
          >
            <span className="edit-entry-ordinal" aria-hidden="true">
              {entry.ordinal}
            </span>
            <span className="edit-entry-body">
              <strong>{entry.title}</strong>
              <span className="edit-entry-when">{entry.when}</span>
              {entry.disabled && entry.reason ? (
                <span className="edit-entry-reason" role="note">
                  <Icon name="info" size={12} />
                  {entry.reason}
                </span>
              ) : null}
            </span>
            <button
              className={`btn btn-sm${entry.disabled ? '' : ' btn-primary'}`}
              disabled={entry.disabled}
              title={entry.disabled ? entry.reason : entry.when}
              aria-label={`${entry.title}：${entry.disabled ? entry.reason : entry.when}`}
              onClick={() => onPick(entry.id)}
            >
              {entry.action}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
