/** 全局快捷键（规格 3.9.9）。视图相关的键位在各视图内自行处理。 */
import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useBenchStore } from '../store/benchStore'

export function emitUiShortcut(name: 'focus-search'): void {
  window.dispatchEvent(new CustomEvent(`studio:${name}`))
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const store = useAppStore.getState()
      const target = e.target as HTMLElement | null
      const typing = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)

      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        store.patchUi({ logCollapsed: !(store.ui?.logCollapsed ?? false) })
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        store.patchUi({ sidebarCollapsed: !(store.ui?.sidebarCollapsed ?? false) })
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        store.patchUi({ codeCollapsed: !(store.ui?.codeCollapsed ?? false) })
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        emitUiShortcut('focus-search')
        return
      }
      // 视图切换用 Ctrl+Tab，把裸 Tab 留给键盘焦点遍历（规格 3.9.9 的两条要求冲突，取可访问性优先）
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        store.setView(store.view === 'browse' ? 'bench' : 'browse')
        return
      }
      if (e.key === 'Escape') {
        if (store.eyedropper) {
          store.clearEyedropper()
          return
        }
        if (store.settingsOpen) {
          store.setSettingsOpen(false)
          return
        }
        if (store.candidates) {
          store.closeCandidates()
          return
        }
      }
      if (typing) return
      // 撤销 / 重做：只在非输入态接管，输入框里保留系统原生撤销
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) useBenchStore.getState().redo()
        else useBenchStore.getState().undo()
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        store.setView('bench')
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('studio:focus-type-select')), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
