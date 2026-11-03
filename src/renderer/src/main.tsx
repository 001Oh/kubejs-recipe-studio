import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { subscribeStudioEvents, useAppStore } from './store/appStore'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/parts.css'
import './styles/slots.css'

const unsubscribe = subscribeStudioEvents()
window.addEventListener('beforeunload', () => unsubscribe())
void useAppStore.getState().init()

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
