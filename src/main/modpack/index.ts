/**
 * 整合包导入编排（规格 3.1）：路径纠正 → 元数据检测 → 写入会话状态 → 按 3.8 文案记日志。
 * 三种结局：可用（ImportResult）、要用户选（ImportCandidates）、不可用（抛中文错误，
 * 由 ipcRegistry 统一转成 `{ ok:false, error }`，渲染进程弹横幅即可）。
 */
import type { ImportCandidates, ImportResult } from '../../shared/ipc'
import type { Loader, ModpackInfo } from '../../shared/types'
import { logger } from '../logger'
import { detectMetadata } from './detect'
import { resolveModpackRoot } from './pathFix'
import { setCurrentModpack } from './state'
import { patchUiState, saveUiState } from '../uiStateStore'

const LOADER_LABEL: Record<Loader, string> = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  quilt: 'Quilt'
}

/** 规格 3.8 示例文案：`检测到 MC 1.20.1 / Forge 47.2.0 / KubeJS 2001.6.5`。 */
export function describeDetected(info: ModpackInfo): string {
  const mc = info.mcVersion ? `MC ${info.mcVersion}` : 'MC 版本未知'
  const loader = info.loader ? `${LOADER_LABEL[info.loader]}${info.loaderVersion ? ` ${info.loaderVersion}` : ''}` : '加载器未知'
  const kubejs = info.kubejsVersion ? `KubeJS ${info.kubejsVersion}` : '未检测到 KubeJS'
  return `检测到 ${mc} / ${loader} / ${kubejs}`
}

export async function importModpack(pickedPath: string): Promise<ImportResult | ImportCandidates> {
  logger.info('MODPACK', `开始导入：${pickedPath}`)
  const fix = await resolveModpackRoot(pickedPath)

  if ('error' in fix) {
    logger.error('MODPACK', fix.error, `所选路径：${pickedPath}`)
    throw new Error(fix.error)
  }
  if ('candidates' in fix) {
    logger.warn('MODPACK', `发现 ${fix.candidates.length} 个含 mods 的子目录，等待用户选择`, fix.candidates.join('\n'))
    return { candidates: fix.candidates }
  }

  const info = await detectMetadata(fix.root)
  logger.info('MODPACK', describeDetected(info), `来源：${info.detectedFrom.join('；') || '无'}`)
  logger.info('MODPACK', `共发现 ${info.modCount} 个 mod`)
  if (fix.corrected) logger.info('MODPACK', `路径已自动纠正：${fix.note}`, `实际根目录：${info.path}`)
  if (!info.mcVersion) logger.warn('MODPACK', '未能检测到 MC 版本，请在设置里手动指定后再扫描')
  if (!info.hasKubejs) logger.warn('MODPACK', '该整合包未安装 KubeJS，生成的脚本将不会生效', `mods 目录：${info.modsDir}`)
  if (info.kubejsAddons.length > 0) {
    logger.info('MODPACK', `已检测到 KubeJS 附属：${info.kubejsAddons.join(', ')}`)
  }
  logger.success('MODPACK', `导入完成：${info.name}`, `mods 目录：${info.modsDir}`)

  setCurrentModpack(info)
  // T-25：把包标识落到本实例的 uiState.json（envPaths 派生路径），供下次冷启动恢复。
  // 写失败不影响本次导入（用户仍可正常使用），只记 WARN。
  try {
    patchUiState({ lastModpackPath: info.path, lastModpackName: info.name })
    saveUiState()
  } catch (err) {
    logger.warn('MODPACK', '记录上次整合包失败（不影响本次导入）', err instanceof Error ? err.message : String(err))
  }
  return { info, corrected: fix.corrected, note: fix.note }
}
