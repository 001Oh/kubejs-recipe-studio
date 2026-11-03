/**
 * preload：只暴露一个类型化桥，渲染进程拿不到任何 fs / require（规格第二章安全约束）。
 */
import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_CHANNEL, INVOKE_CHANNEL } from '../shared/ipc'
import type { IpcResult, InvokeName, InvokeReq, InvokeRes, StudioBridge, StudioEvent } from '../shared/ipc'
import { ICON_PROTOCOL } from '../shared/constants'

async function invoke<N extends InvokeName>(
  name: N,
  req?: InvokeReq<N>
): Promise<IpcResult<InvokeRes<N>>> {
  try {
    return (await ipcRenderer.invoke(INVOKE_CHANNEL, name, req)) as IpcResult<InvokeRes<N>>
  } catch (err) {
    // 主进程 handler 已捕获异常，这里只兜底通道级失败（例如窗口销毁瞬间）
    return { ok: false, error: err instanceof Error ? err.message : String(err), code: 'BRIDGE' }
  }
}

const bridge: StudioBridge = {
  invoke,
  onEvent(cb: (event: StudioEvent) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, event: StudioEvent): void => cb(event)
    ipcRenderer.on(EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  },
  iconUrl(iconKey: string): string {
    return `${ICON_PROTOCOL}://${iconKey}`
  }
}

contextBridge.exposeInMainWorld('studio', bridge)
