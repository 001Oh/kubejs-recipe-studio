/**
 * 代码生成的外部依赖注入点（唯一一份）。
 *
 * 为什么要这层：代码生成需要「物品索引是否存在某 ID」「配方库里有没有该 type 的样本」
 * 「数据包 namespace 是否被 jar 占用」三类事实，它们分属 P2/P3/P4 的模块。本模块用可注入的
 * 探针把这些依赖收口到一处，领域模块落地后调用 `setGenerationContext` 接线即可；
 * 未接线时按「事实不可知」降级：跳过未知物品警告、用 schema 的 sampleCount 判断样本、
 * namespace 视为未占用（写盘前 `codegen:checkTarget` 会再查一次）。
 */
import type { ModpackInfo } from '../../shared/types'

/** namespace 占用探测：由调用方注入（jar 扫描 / 测试替身） */
export type NamespaceProbe = (namespace: string) => Promise<boolean>

export interface SemanticContext {
  /** 物品/流体 ID 是否存在于本包索引；未接线时为 undefined（不做未知物品判断） */
  itemExists?: (id: string) => boolean
}

export interface GenerationContext {
  /** 当前整合包；null 表示尚未导入（只导出到替代目录） */
  modpack?: () => ModpackInfo | null
  /** 配方库中是否存在该 type 的样本（决定数据包通道优先于 event.custom） */
  hasSamples?: (typeId: string) => boolean
  /** 本包已知的 namespace 集合（数据包通道用它判断占用） */
  usedNamespaces?: () => Set<string>
  /** namespace 占用探针（通常是 `jarNamespaceProbe(modsDir)`） */
  namespaceProbe?: NamespaceProbe
  semantic: SemanticContext
}

const state: GenerationContext = { semantic: {} }

export function setGenerationContext(next: GenerationContext): GenerationContext {
  if (next.modpack) state.modpack = next.modpack
  if (next.hasSamples) state.hasSamples = next.hasSamples
  if (next.usedNamespaces) state.usedNamespaces = next.usedNamespaces
  if (next.namespaceProbe) state.namespaceProbe = next.namespaceProbe
  Object.assign(state.semantic, next.semantic)
  return state
}

export function getGenerationContext(): GenerationContext {
  return state
}

export function semanticContext(): SemanticContext {
  return state.semantic
}

/** 默认 namespace 探针：优先用已接线的 namespace 集合，退化成「一律未占用」 */
export function defaultNamespaceProbe(): NamespaceProbe {
  return async (namespace: string) => {
    const used = state.usedNamespaces?.()
    return used ? used.has(namespace) : false
  }
}
