/**
 * IPC 注册中心：所有 channel 在此登记，主进程 handler 抛出的异常统一转成
 * { ok:false, error } 返回，绝不向渲染进程抛未捕获异常（规格第七章 4）。
 */
import { BrowserWindow, ipcMain } from 'electron'
import { EVENT_CHANNEL, INVOKE_CHANNEL } from '../shared/ipc'
import type { InvokeName, InvokeReq, InvokeRes, StudioEvent } from '../shared/ipc'
import { logger } from './logger'

export type Handler<N extends InvokeName> = (
  req: InvokeReq<N>
) => Promise<InvokeRes<N>> | InvokeRes<N>

/** 边界处做一次类型擦除：登记表按名字取 handler，具体类型由 registerHandler 保证。 */
type ErasedHandler = (req: unknown) => Promise<unknown> | unknown
const handlers = new Map<InvokeName, ErasedHandler>()

export function registerHandler<N extends InvokeName>(name: N, handler: Handler<N>): void {
  if (handlers.has(name)) throw new Error(`IPC channel 重复注册：${name}`)
  handlers.set(name, handler as ErasedHandler)
}

export function registeredChannels(): InvokeName[] {
  return [...handlers.keys()]
}

export function installIpc(): void {
  ipcMain.handle(INVOKE_CHANNEL, async (_event, name: unknown, req: unknown) => {
    if (typeof name !== 'string' || !handlers.has(name as InvokeName)) {
      // 分阶段开发期间未接线的通道按 WARN 记录，不算运行错误
      logger.warn('IO', `通道尚未接线：${String(name)}`, '该功能对应的模块还没注册 handler')
      return { ok: false, error: `未注册的 IPC channel：${String(name)}` }
    }
    const handler = handlers.get(name as InvokeName)!
    try {
      const data = await handler(req)
      return { ok: true, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      logger.error('IO', `IPC ${name} 失败：${message}`, stack)
      return { ok: false, error: message, code: err instanceof Error ? err.name : 'ERROR' }
    }
  })
}

export function emitEvent(win: BrowserWindow | null, event: StudioEvent): void {
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send(EVENT_CHANNEL, event)
  } catch (err) {
    logger.debug('IO', '事件推送失败', err instanceof Error ? err.message : String(err))
  }
}

/** 供 index.ts 在 app ready 前调用；渲染进程只有这一条 invoke 通道。 */
export const ipcChannels = { invoke: INVOKE_CHANNEL, event: EVENT_CHANNEL }
