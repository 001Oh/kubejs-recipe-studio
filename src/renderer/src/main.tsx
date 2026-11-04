import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { call } from './api'
import { subscribeStudioEvents, useAppStore } from './store/appStore'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/parts.css'
import './styles/slots.css'

const unsubscribe = subscribeStudioEvents()
window.addEventListener('beforeunload', () => unsubscribe())

// P3-22c：启动失败绝不能白屏——init 拒绝时渲染兜底错误界面（含日志目录）。
// 日志目录尽力从桥取（桥也不可用时 bootError 自带通用指引）。
void useAppStore.getState().init().catch(async (err: unknown) => {
  const { renderBootError } = await import('./bootError')
  const rt = await call('app:runtime')
  const userData = rt?.userData ?? null
  const container = document.getElementById('root')
  if (container) renderBootError(container, err, userData ? `${userData}/logs` : null)
})

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
