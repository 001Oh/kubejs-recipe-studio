/** 批量把物品 ID 换成可显示的 iconKey；模块级缓存，避免同一 ID 反复问主进程。 */
import { useEffect, useState } from 'react'
import { call } from '../api'

const cache = new Map<string, string | null>()
const inflight = new Set<string>()

export function cachedIconKey(id: string): string | null | undefined {
  return cache.get(id)
}

export function useIconKeys(ids: string[]): Record<string, string | null> {
  const [map, setMap] = useState<Record<string, string | null>>({})

  useEffect(() => {
    const missing = [...new Set(ids)].filter((id) => id && !cache.has(id) && !inflight.has(id))
    for (const id of new Set(ids)) {
      if (cache.has(id)) inflight.delete(id)
    }
    if (missing.length > 0) {
      for (const id of missing) inflight.add(id)
      void call('items:icons', { ids: missing }).then((res) => {
        for (const id of missing) {
          inflight.delete(id)
          if (res) cache.set(id, res[id] ?? null)
        }
        setMap({ ...(res ?? {}) })
      })
      return
    }
    const local: Record<string, string | null> = {}
    for (const id of new Set(ids)) if (cache.has(id)) local[id] = cache.get(id) ?? null
    setMap(local)
  }, [ids.join('\n')])

  return map
}
