/**
 * app-icon://<sha1> 协议。图标只落在 userData/icon-cache，绝不解压到整合包目录（规格禁止事项 9）。
 * standard scheme 的 URL 形如 app-icon://<host>/<ignored>，host 即 iconKey。
 */
import { createReadStream } from 'node:fs'
import { existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { ICON_PROTOCOL } from '../shared/constants'
import { logger } from './logger'
import { iconFile } from './paths'

export function registerIconSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ICON_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    }
  ])
}

export function installIconProtocol(): void {
  protocol.handle(ICON_PROTOCOL, async (request) => {
    let key = ''
    try {
      const url = new URL(request.url)
      key = decodeURIComponent(url.host || url.pathname.replace(/^\//, ''))
    } catch (err) {
      logger.debug('UI', `非法图标 URL：${request.url}`, err instanceof Error ? err.message : undefined)
      return new Response('bad url', { status: 400 })
    }
    // 只接受 40 位十六进制 sha1，杜绝路径穿越
    if (!/^[0-9a-f]{40}$/.test(key)) return new Response('bad key', { status: 400 })
    const file = iconFile(key)
    if (!existsSync(file)) return new Response('not found', { status: 404 })
    try {
      const body = Readable.toWeb(createReadStream(file)) as ReadableStream
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400, immutable' }
      })
    } catch (err) {
      logger.warn('UI', `图标读取失败：${key}`, err instanceof Error ? err.message : String(err))
      return new Response('read error', { status: 500 })
    }
  })
}
