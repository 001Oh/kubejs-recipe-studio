/**
 * 版本与加载器识别（规格 3.1 检测表的文件名分支）。
 * 纯函数，便于单测；所有解析失败都返回 null，由调用方决定回退顺序。
 *
 * 文件名里的「1.x.y」有两类含义：MC 版本（forge-1.20.1-47.2.0）或模组自身版本
 * （kubejs_botania-1.4.0-forge）。因此不许直接抓第一个 1.x 片段，必须靠上下文：
 * 加载器名相邻、`mc`/`minecraft` 标记、fabric 的 `+1.20.1` 尾缀，或 KubeJS 的 2001 前缀码。
 */

/** KubeJS 主版本前缀码 → MC 版本。仅覆盖已知发布线，未命中返回 null。 */
const KUBEJS_PREFIX_TO_MC: Record<string, string> = {
  '1605': '1.16.5',
  '1604': '1.16.4',
  '1603': '1.16.3',
  '1701': '1.17.1',
  '1800': '1.18',
  '1802': '1.18.2',
  '1900': '1.19',
  '1902': '1.19.2',
  '2000': '1.20',
  '2001': '1.20.1',
  '2002': '1.20.2',
  '2004': '1.20.4',
  '2100': '1.21',
  '2101': '1.21.1',
  '2140': '1.21.4',
  '2180': '1.21.8'
}

export type LoaderGuess = 'forge' | 'neoforge' | 'fabric' | 'quilt'

function base(name: string): string {
  return name.toLowerCase().replace(/\.jar$/, '')
}

/** 上下文规则抽取 MC 版本；抓不到返回 null，绝不返回模组建版本。 */
export function extractMcFromFileName(fileName: string): string | null {
  const b = base(fileName)
  const loaderAdjacent = /(?:forge|neofabric|neoforge|fabric|quilt)[-_](1\.\d{1,2}(?:\.\d{1,2})?)(?:[-_.]|$)/.exec(b)
  if (loaderAdjacent) return loaderAdjacent[1]
  const marked = /(?:^|[-_+])(?:mc|minecraft)[-_](1\.\d{1,2}(?:\.\d{1,2})?)(?:[-_.]|$)/.exec(b)
  if (marked) return marked[1]
  const tail = /[+_](1\.\d{1,2}(?:\.\d{1,2})?)$/.exec(b)
  if (tail) return tail[1]
  return null
}

/** 从 forge-1.20.1-47.2.0.jar / neoforge-21.1.247-installer.jar / fabric-loader-0.15.11+1.20.1.jar 取版本 */
export function parseLoaderJar(
  fileName: string
): { loader: LoaderGuess; mcVersion: string | null; loaderVersion: string | null } | null {
  const b = base(fileName)
  const neo = /^neoforge[-_](\d[\w.+-]*)/.exec(b)
  if (neo) {
    const version = neo[1]
    const major = Number.parseInt(version.split('.')[0] ?? '', 10)
    // NeoForge 的版本号与 MC 主版本对齐：20.x = MC 1.20，21.x = MC 1.21
    const derived = Number.isFinite(major) && major >= 20 && major < 64 ? `1.${major}` : null
    return { loader: 'neoforge', mcVersion: extractMcFromFileName(b) ?? derived, loaderVersion: version }
  }
  const forge = /^forge[-_](.+)$/.exec(b)
  if (forge) {
    const rest = forge[1]
    const mc = extractMcFromFileName(b)
    const parts = rest.split(/[-_]/).filter(Boolean)
    const versionPart = parts.find((p) => p !== mc && /^\d+(?:\.\d+){1,3}$/.test(p))
    return { loader: 'forge', mcVersion: mc, loaderVersion: versionPart ?? rest }
  }
  const fabric = /^fabric-loader[-_](\d[\w.+-]*)/.exec(b)
  if (fabric) {
    return { loader: 'fabric', mcVersion: extractMcFromFileName(b), loaderVersion: fabric[1] }
  }
  const quilt = /^quilt-loader[-_](\d[\w.+-]*)/.exec(b)
  if (quilt) {
    return { loader: 'quilt', mcVersion: extractMcFromFileName(b), loaderVersion: quilt[1] }
  }
  return null
}

/** mods/kubejs-*.jar → 完整版本号与 MC 版本（显式版本优先，其次 2001 之类前缀码）。非 kubejs 返回 null。 */
export function parseKubejsJar(
  fileName: string
): { version: string | null; mcVersion: string | null; isAddon: boolean; modId: string | null } | null {
  const b = base(fileName)
  if (!b.startsWith('kubejs')) return null
  const explicit = /(?:^|[-_])(\d{4}(?:\.\d+){1,3}(?:-build\.\d+)?)/.exec(b)
  const version = explicit?.[1] ?? null
  const prefix = version ? version.slice(0, 4) : null
  const mcVersion = extractMcFromFileName(b) ?? (prefix ? (KUBEJS_PREFIX_TO_MC[prefix] ?? null) : null)
  return { version, mcVersion, isAddon: isAddonKubejs(b), modId: modIdFromKubejsName(b) }
}

/** kubejs-forge / kubejs-fabric 是本体；kubejs_create、kubejs-mekanism 等是附属。 */
function isAddonKubejs(b: string): boolean {
  if (/^kubejs[-_](forge|fabric|neoforge|quilt)/.test(b)) return false
  return /^kubejs[-_][a-z]/.test(b)
}

function modIdFromKubejsName(b: string): string | null {
  if (!b.startsWith('kubejs')) return null
  if (/^kubejs[-_](forge|fabric|neoforge|quilt)/.test(b)) return 'kubejs'
  const m = /^(kubejs[-_][a-z0-9_]+?)(?:[-_.]|$)/.exec(b)
  return m ? m[1].replace(/-/g, '_') : 'kubejs'
}

export function mcVersionFromKubejsPrefix(version: string): string | null {
  return KUBEJS_PREFIX_TO_MC[version.slice(0, 4)] ?? null
}

/** 比较 MC 版本；仅用于 ≤1.18 的头部分支判断。 */
export function mcAtMost(a: string | null, max: [number, number]): boolean {
  if (!a) return false
  const parts = a.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length < 2 || parts.some(Number.isNaN)) return false
  const [major, minor] = parts
  return major < max[0] || (major === max[0] && minor <= max[1])
}

/** 1.19+ 用 ServerEvents.recipes，≤1.18 用 onEvent('recipes')。 */
export function scriptEventHeader(mcVersion: string | null): 'ServerEvents.recipes' | "onEvent('recipes'" {
  if (!mcVersion) return 'ServerEvents.recipes'
  return mcAtMost(mcVersion, [1, 18]) ? "onEvent('recipes'" : 'ServerEvents.recipes'
}

/** modrinth / mmc / curseforge 元数据里的 MC 版本字段提取（宽松，取不到返回 null）。 */
export function mcFromManifestJson(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const deps = obj['dependencies']
  if (deps && typeof deps === 'object') {
    const mc = (deps as Record<string, unknown>)['minecraft']
    if (typeof mc === 'string') return mc
  }
  const components = obj['components']
  if (Array.isArray(components)) {
    for (const c of components) {
      if (c && typeof c === 'object') {
        const cc = c as Record<string, unknown>
        if (cc['id'] === 'net.minecraft' && typeof cc['version'] === 'string') return cc['version']
      }
    }
  }
  const gameVersion = obj['gameVersion']
  if (typeof gameVersion === 'string') return gameVersion
  return null
}
