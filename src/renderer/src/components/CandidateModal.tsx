/** 多个含 mods/ 的候选目录时让用户选择（规格 3.1）。 */
import type { JSX } from 'react'
import { useAppStore } from '../store/appStore'
import { Icon } from './Icon'

export function CandidateModal(): JSX.Element | null {
  const candidates = useAppStore((s) => s.candidates)
  const choose = useAppStore((s) => s.chooseCandidate)
  const close = useAppStore((s) => s.closeCandidates)
  if (!candidates || candidates.length === 0) return null
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="选择整合包目录">
      <div className="modal">
        <header className="modal-head">
          <span className="modal-icon" aria-hidden="true">
            <Icon name="folder" size={18} />
          </span>
          <div>
            <h3>所选目录下发现多个整合包</h3>
            <p className="aux">请选择要编辑的整合包根目录（应包含 mods / config / kubejs）。</p>
          </div>
        </header>
        <div className="modal-list">
          {candidates.map((path, i) => (
            <button key={path} className="modal-row" onClick={() => void choose(i)} title={path}>
              <Icon name="chevron-right" size={14} />
              <span className="truncate">{path}</span>
            </button>
          ))}
        </div>
        <footer className="modal-foot">
          <button className="btn" onClick={close}>
            取消
          </button>
        </footer>
      </div>
    </div>
  )
}
