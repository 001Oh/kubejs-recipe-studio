import type { StudioBridge } from '../shared/ipc'

declare global {
  interface Window {
    /** 渲染进程访问主进程的唯一入口 */
    studio: StudioBridge
  }
}

export {}
