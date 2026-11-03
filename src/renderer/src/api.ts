/** 渲染进程访问主进程的唯一入口：失败时记日志并返回 null，组件不必到处写 try/catch。 */
import type { InvokeName, InvokeReq, InvokeRes, IpcResult } from '../../../src/shared/ipc'
import { useAppStore } from './store/appStore'

export async function call<N extends InvokeName>(
  name: N,
  req?: InvokeReq<N>
): Promise<InvokeRes<N> | null> {
  const bridge = window.studio
  if (!bridge) {
    useAppStore.getState().pushLog('ERROR', 'IO', 'preload 桥不可用，请重启程序')
    return null
  }
  const res = await bridge.invoke(name, req)
  if (res.ok) return res.data
  // 分阶段开发中「通道尚未接线」不是错误，降级为 WARN 免得刷屏
  const level = res.error.startsWith('未注册的 IPC channel') ? 'WARN' : 'ERROR'
  useAppStore.getState().pushLog(level, 'IO', `${name} 调用失败：${res.error}`)
  return null
}

/** IPC 失败的结构化错误：页面据此区分「加载失败」与「确实是空数据」 */
export class IpcCallError extends Error {
  readonly channel: string
  readonly code: string
  constructor(channel: string, message: string, code: string) {
    super(message)
    this.name = 'IpcCallError'
    this.channel = channel
    this.code = code
  }
}

/**
 * 与 call 的区别：失败时抛 {@link IpcCallError}，调用方必须显式处理。
 * 用于「空列表」与「请求失败」必须区分开的页面（schema / plugins / scripts / codegen）。
 */
export async function callOrThrow<N extends InvokeName>(name: N, req?: InvokeReq<N>): Promise<InvokeRes<N>> {
  const bridge = window.studio
  if (!bridge) throw new IpcCallError(name, 'preload 桥不可用，请重启程序', 'BRIDGE')
  const res = await bridge.invoke(name, req)
  if (res.ok) return res.data
  useAppStore.getState().pushLog('ERROR', 'IO', `${name} 调用失败：${res.error}`)
  throw new IpcCallError(name, res.error, res.code ?? 'IPC_FAILED')
}

/** 与 call 不同：把错误也交给调用方处理（用于需要向用户说明原因的写入流程）。 */
export async function callRaw<N extends InvokeName>(
  name: N,
  req?: InvokeReq<N>
): Promise<IpcResult<InvokeRes<N>>> {
  return window.studio.invoke(name, req)
}

export function iconUrl(key: string | null): string | null {
  if (!key) return null
  return window.studio.iconUrl(key)
}
