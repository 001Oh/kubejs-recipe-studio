/**
 * 单个 jar 的扫描实现（IO 层）：列条目 → 批量读取 → 规格化物品 → 落图标。
 * worker 与「无 worker 环境」共用这一份，保证两条路径行为一致。
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { ItemEntry } from '../../shared/types'
import { pinyinIndex } from '../../shared/pinyin'
import { listAndRead } from './zip'
import { writeIcon } from './iconWriter'
import { scanJarEntries } from './itemRules'

const LANG_RE = /^assets\/[^/]+\/lang\/[^/]+\.json$/i
// 模型要收全（item 与 block 两类都要）：方块物品的模型只在 models/block 下，
// 漏掉它们会让跨 jar 图标解析丢掉最常见的一类贴图来源。
const MODEL_RE = /^assets\/[^/]+\/models\/.+\.json$/i
const TEXTURE_RE = /^assets\/[^/]+\/textures\/(item|block)\/.+\.png$/i

export interface JarScanOutcome {
  jarName: string
  items: ItemEntry[]
  /** 本 jar 的资源条目（模型/贴图/lang），供跨 jar 图标解析复用，避免二次列目录 */
  assetEntries: string[]
  /** 本次新写入的图标数（缓存里已存在的 PNG 不重复写） */
  iconsWritten: number
  missingZh: number
  elapsedMs: number
}

function iconKey(id: string): string {
  return createHash('sha1').update(id).digest('hex')
}

/** 读取本 jar 需要的全部条目（lang / item 模型 / item 与 block 贴图），其余不读 */
/** 每批提交的图标写任务数：批内并发，批间等待，既拿到并发也把内存与队列水位压在可控范围 */
const ICON_WRITE_BATCH = 64

export async function scanJar(
  jarPath: string,
  iconDir: string,
  signal?: AbortSignal
): Promise<JarScanOutcome> {
  const started = Date.now()
  const jarName = jarPath.replace(/\\/g, '/').split('/').pop() ?? jarPath
  // P-OPT4-S2：本来要「listEntries + readMany」各遍历一次中央目录，这里合并成一次遍历。
  // wanted 的收集放进 matcher，顺序与原先「filter 后的条目顺序」完全一致。
  const wanted: string[] = []
  const { entries: listedEntries, buffers } = await listAndRead(jarPath, {
    matcher: (name) => {
      if (!LANG_RE.test(name) && !MODEL_RE.test(name) && !TEXTURE_RE.test(name)) return false
      wanted.push(name)
      return true
    }
  })
  const readEntry = (name: string): Buffer | undefined => buffers.get(name)

  const scanned = scanJarEntries(listedEntries, readEntry)
  let iconsWritten = 0
  const items: ItemEntry[] = []
  let batch: Promise<void>[] = []
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    const current = batch
    batch = []
    await Promise.all(current)
  }
  for (const draft of scanned.items) {
    let key: string | null = null
    if (draft.iconEntry) {
      const key64 = iconKey(draft.id)
      const target = join(iconDir, `${key64}.png`)
      key = key64
      const png = buffers.get(draft.iconEntry)
      if (png) {
        // 交给全局限流队列；写失败会 reject，最终让该 jar 计为失败（与原来一致）
        batch.push(
          writeIcon(target, png, signal).then((written) => {
            if (written) iconsWritten += 1
          })
        )
        if (batch.length >= ICON_WRITE_BATCH) await flush()
      } else {
        key = null
      }
    }
    const py = pinyinIndex(draft.nameZh)
    items.push({
      id: draft.id,
      nameZh: draft.nameZh,
      nameEn: draft.nameEn,
      modId: draft.modId,
      confidence: draft.confidence,
      verified: false,
      hasIcon: key !== null,
      iconKey: key,
      pyFull: py.pyFull,
      pyInitials: py.pyInitials,
      virtual: draft.virtual,
      hasRecipe: false
    })
  }
  await flush()
  return {
    jarName,
    items,
    assetEntries: wanted,
    iconsWritten,
    missingZh: scanned.missingZh,
    elapsedMs: Date.now() - started
  }
}
