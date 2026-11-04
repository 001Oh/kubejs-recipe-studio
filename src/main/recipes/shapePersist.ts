/**
 * 第 116 批 B3：`inferred-shapes.json` 的读写。
 *
 * 本批选择**直接落盘**（不新增 IPC）：形状只是诊断数据，还没有任何消费者，
 * 加一条 IPC 会平白多出类型映射 / 通道数组 / handler 三处注册。下一批注入 registry 时
 * 再决定要不要给渲染层开只读入口。
 *
 * 文件与 `recipes.json` 同目录（`cacheFile(modpackPath,'inferred-shapes')`），
 * 冷启动时 `readInferredShapes()` 直接复用，不需要重扫。
 */
import { app } from 'electron'
import { readJson, writeJson } from '../cache'
import { cacheFile } from '../paths'
import type { InferredShapesFile, TypeShape } from './inferShapes'

/** 单测里 electron 可能只导出一个路径字符串，取不到版本时写 'unknown'，绝不让扫描挂掉 */
function currentVersion(): string {
  try {
    const getter = app?.getVersion
    return typeof getter === 'function' ? getter.call(app) : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function inferredShapesPath(modpackPath: string): string {
  return cacheFile(modpackPath, 'inferred-shapes')
}

export async function writeInferredShapes(
  modpackPath: string,
  types: Record<string, TypeShape>,
  buildMs: number
): Promise<InferredShapesFile> {
  const payload: InferredShapesFile = {
    builtAtMs: Date.now(),
    appVersion: currentVersion(),
    buildMs,
    typeCount: Object.keys(types).length,
    types
  }
  await writeJson(inferredShapesPath(modpackPath), payload)
  return payload
}

export async function readInferredShapes(modpackPath: string): Promise<InferredShapesFile | null> {
  const data = await readJson<InferredShapesFile>(inferredShapesPath(modpackPath))
  if (!data || typeof data !== 'object' || !data.types) return null
  return data
}
