/**
 * 整合包元数据检测（规格 3.1 检测表）。MC 版本按五级优先级依次尝试，每步命中都把来源写进
 * `detectedFrom` 供 UI 标注可信度；全部失败则 `mcVersion = null`，不抛错（UI 引导手动指定）。
 *
 * 关于 `shared/version.ts`：它的文件名提取偏宽松——`forge-carpet-1.20.1-*` 会被认成 Forge 本体、
 * `fabric-loader-0.15.11+1.20.1` 的加载器版本会带游戏版本尾缀、`neoforge-21.1.247-installer`
 * 会带 `-installer`。因此这里先做严格形状校验、再回落到 version.ts 的判定，KubeJS 的 MC 版本
 * 优先取文件名里的显式标记、其次四位前缀码表（2001 → 1.20.1）。
 */
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Loader, ModpackInfo } from '../../shared/types'
import { extractMcFromFileName, mcFromManifestJson, mcVersionFromKubejsPrefix, parseKubejsJar, parseLoaderJar } from '../../shared/version'
import { isKubejsAddonModId, listJarNames, scanModMetadata, uniqueSorted } from './modList'
import type { ModScanResult } from './modList'

export const KUBEJS_MOD_ID = 'kubejs'
const LOADER_TOKENS: [string, Loader][] = [['neoforge', 'neoforge'], ['forge', 'forge'], ['fabric', 'fabric'], ['quilt', 'quilt']]
/** 严格形状：拒绝 `forge-carpet-…` 这类同名前缀的附属 jar。 */
const FORGE_RE = /^forge-(1\.\d{1,2}(?:\.\d{1,2})?)-(\d+(?:\.\d+)*)(?:-[a-z]+)?$/i
const NEOFORGE_RE = /^neoforge-(\d+\.\d+(?:\.\d+)*)(?:-[a-z]+)?$/i
const MC_IN_NAME = /\+(\d+(?:\.\d+)+)$/

interface LoaderNameHit { loader: Loader; mc: string | null; version: string | null }
interface KubejsNameHit { role: 'main' | 'addon'; modId: string; version: string | null; mc: string | null; loaderHint: Loader | null }

export interface JarNameFacts {
  loader: Loader | null
  loaderVersion: string | null
  loaderJar: string | null
  mcFromLoader: string | null
  kubejsVersion: string | null
  mcFromKubejs: string | null
  kubejsJar: string | null
  hasKubejsJar: boolean
  loaderHint: Loader | null
  /** 仅凭文件名识别出的 KubeJS 附属 modId（kubejs_xxx） */
  addons: string[]
}

/** 加载器 jar 文件名 → 家族 + MC 版本 + 加载器版本；形状不认识返回 null。 */
export function loaderFromJarName(name: string): LoaderNameHit | null {
  const base = stripExtension(name)
  const guess = parseLoaderJar(base)
  if (!guess) return null
  if (guess.loader === 'forge') {
    const m = FORGE_RE.exec(base)
    return m ? { loader: 'forge', mc: m[1] ?? null, version: m[2] ?? null } : null
  }
  if (guess.loader === 'neoforge') {
    const m = NEOFORGE_RE.exec(base)
    if (!m || !m[1]) return null
    return { loader: 'neoforge', mc: `1.${m[1].split('.')[0]}`, version: m[1] }
  }
  // fabric / quilt 的前缀判定本身够严格；MC 版本取 `+1.20.1` 尾巴，加载器版本要去掉这段游戏版本
  const plus = MC_IN_NAME.exec(base)
  const version = guess.loaderVersion?.split('+')[0] ?? null
  return { loader: guess.loader, mc: plus?.[1] ?? guess.mcVersion, version }
}

function loaderTokenOf(body: string): Loader | null {
  for (const [token, loader] of LOADER_TOKENS) if (body === token || new RegExp(`^${token}[-_.]`, 'i').test(body)) return loader
  return null
}

/**
 * KubeJS jar 文件名 → 本体 / 附属判定。`kubejs-forge-*`、`kubejs-2001.6.5.jar` 是本体；
 * `kubejs-mekanism-*`、`kubejs_botania-*` 是附属；`kubejsadditions-*` 是另一个独立 modId，两边都不算。
 */
export function kubejsFromJarName(name: string): KubejsNameHit | null {
  const base = stripExtension(name).toLowerCase()
  if (!base.startsWith(KUBEJS_MOD_ID)) return null
  const tail = base.slice(KUBEJS_MOD_ID.length)
  const parsed = parseKubejsJar(name)
  const version = parsed?.version ?? null
  const mc = mcOfKubejs(name, version)
  if (tail === '') return { role: 'main', modId: KUBEJS_MOD_ID, version, mc, loaderHint: null }
  if (!/^[-_]/.test(tail)) return null
  const body = tail.slice(1)
  const loaderHint = loaderTokenOf(body)
  const isMain = loaderHint !== null || /^\d/.test(body)
  if (isMain) return { role: 'main', modId: KUBEJS_MOD_ID, version, mc, loaderHint }
  return { role: 'addon', modId: normalizeAddonId(body) ?? parsed?.modId ?? KUBEJS_MOD_ID, version, mc, loaderHint: null }
}

/**
 * 附属 modId：截到版本号之前，再去掉尾部的加载器字样。
 * 不用 `parseKubejsJar().modId` 作首选，因为它的正则在第二个下划线处截断
 * （`kubejs_extended_crafting-2001.5` 会被折成 `kubejs_extended`）。
 */
function normalizeAddonId(body: string): string | null {
  const versionStart = body.search(/[-_.]\d/)
  const head = (versionStart >= 0 ? body.slice(0, versionStart) : body).replace(/[-_](?:neoforge|forge|fabric|quilt)$/i, '')
  return head ? `kubejs_${head.replace(/-/g, '_').toLowerCase()}` : null
}

/** MC 版本：文件名里有显式标记就用它，否则用四位前缀码表（2001 → 1.20.1）。 */
function mcOfKubejs(name: string, version: string | null): string | null {
  const explicit = extractMcFromFileName(name)
  if (explicit) return explicit
  return version ? mcVersionFromKubejsPrefix(version) : null
}

function stripExtension(name: string): string {
  return name.replace(/\.(jar|zip)$/i, '')
}

/** 汇总 mods 目录文件名能给出的全部事实（不读 jar 内容，纯字符串）。 */
export function detectFromJarNames(jarNames: readonly string[]): JarNameFacts {
  const facts: JarNameFacts = {
    loader: null, loaderVersion: null, loaderJar: null, mcFromLoader: null,
    kubejsVersion: null, mcFromKubejs: null, kubejsJar: null, hasKubejsJar: false,
    loaderHint: null, addons: []
  }
  for (const name of jarNames) {
    const hit = loaderFromJarName(name)
    if (hit && !facts.loader) {
      facts.loader = hit.loader
      facts.loaderVersion = hit.version
      facts.mcFromLoader = hit.mc
      facts.loaderJar = name
    }
    const kj = kubejsFromJarName(name)
    if (!kj) continue
    if (kj.role === 'addon') {
      if (isKubejsAddonModId(kj.modId)) facts.addons.push(kj.modId)
      continue
    }
    facts.hasKubejsJar = true
    // 取第一个能给出完整版本号的本体 jar（个别包会把附属写成 kubejs-2xxx 形状）
    if (!facts.kubejsJar || (!facts.kubejsVersion && !!kj.version)) {
      facts.kubejsJar = name
      facts.kubejsVersion = kj.version
      facts.mcFromKubejs = kj.mc
      facts.loaderHint = kj.loaderHint
    }
  }
  facts.addons = uniqueSorted(facts.addons)
  return facts
}

interface Manifests { modrinth: unknown; mmc: unknown; instance: unknown; launcher: unknown; launcherName: string }

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

/** 规格点名的三个清单，外加 PCL/启动器的 `<实例名>.json`（五级全失败时的兜底源）。 */
async function readManifests(root: string): Promise<Manifests> {
  const launcherName = `${basename(root)}.json`
  return {
    modrinth: await readJson(join(root, 'modrinth.index.json')),
    mmc: await readJson(join(root, 'mmc-pack.json')),
    instance: await readJson(join(root, 'minecraftinstance.json')),
    launcher: await readJson(join(root, launcherName)),
    launcherName
  }
}

function firstString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null
  const record = obj as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const VERSION_SHAPE = /^\d+(?:\.\d+){1,3}(?:-[\w.]+)?$/

/** 清单来源的 MC 版本：先走 version.ts 的宽松提取，再试 extraKeys 里形如版本号的字段。 */
function mcFromManifest(obj: unknown, label: string, extraKeys: string[]): { value: string | null; from: string } {
  const raw = mcFromManifestJson(obj) ?? firstString(obj, extraKeys)
  const value = raw && VERSION_SHAPE.test(raw) ? raw : null
  return { value, from: label }
}

/** 规格 3.1 的 ①→⑤，外加启动器 profile 兜底（PCL 实例只有 `<名>.json`）。 */
function pickMc(manifests: Manifests, facts: JarNameFacts, detectedFrom: string[]): string | null {
  const chain = [
    mcFromManifest(manifests.modrinth, 'MC ← modrinth.index.json → dependencies.minecraft', ['minecraftVersion']),
    mcFromManifest(manifests.mmc, 'MC ← mmc-pack.json → components.net.minecraft', ['minecraftVersion']),
    mcFromManifest(manifests.instance, 'MC ← minecraftinstance.json → gameVersion', ['gameVersion', 'clientVersion']),
    { value: facts.mcFromLoader, from: `MC ← mods/${facts.loaderJar} 文件名` },
    { value: facts.mcFromKubejs, from: `MC ← mods/${facts.kubejsJar} 的 KubeJS 版本前缀码` },
    mcFromManifest(manifests.launcher, `MC ← ${manifests.launcherName} → clientVersion（启动器 profile 兜底）`, ['clientVersion', 'id'])
  ]
  for (const hit of chain) {
    if (hit.value) {
      detectedFrom.push(hit.from)
      return hit.value
    }
  }
  return null
}

const LOADER_COMPONENTS: Record<string, Loader> = {
  'net.fabricmc.loader': 'fabric',
  'org.quiltmc.loader': 'quilt',
  'net.minecraftforge': 'forge',
  'net.neoforged': 'neoforge'
}

/** mmc-pack 的 components 与 CurseForge 的 modLoaders 里的加载器声明。 */
function loaderFromManifest(obj: unknown): { loader: Loader | null; version: string | null; from: string | null } {
  if (!obj || typeof obj !== 'object') return { loader: null, version: null, from: null }
  const record = obj as Record<string, unknown>
  const components = record['components']
  if (Array.isArray(components)) {
    for (const item of components) {
      const id = firstString(item, ['id'])
      const loader = id ? LOADER_COMPONENTS[id] : undefined
      if (loader) return { loader, version: firstString(item, ['version']), from: `mmc-pack.json → ${id}` }
    }
  }
  const modLoaders = record['modLoaders']
  const id = Array.isArray(modLoaders) && modLoaders.length > 0 ? firstString(modLoaders[0], ['id']) : null
  if (id) {
    const dash = id.indexOf('-')
    const token = (dash > 0 ? id.slice(0, dash) : id).toLowerCase()
    const loader = LOADER_TOKENS.find(([family]) => family === token)?.[1] ?? null
    if (loader) return { loader, version: dash > 0 ? id.slice(dash + 1) : null, from: 'minecraftinstance.json → modLoaders' }
  }
  return { loader: null, version: null, from: null }
}

/** 加载器判定：jar 文件名 → 清单声明 → KubeJS 本体后缀 → mod 元数据格式多数派。 */
function pickLoader(manifests: Manifests, facts: JarNameFacts, scan: ModScanResult, detectedFrom: string[]): { loader: Loader | null; loaderVersion: string | null } {
  if (facts.loader && facts.loaderJar) {
    detectedFrom.push(`加载器 ← mods/${facts.loaderJar} 文件名`)
    return { loader: facts.loader, loaderVersion: facts.loaderVersion }
  }
  for (const obj of [manifests.mmc, manifests.instance]) {
    const hit = loaderFromManifest(obj)
    if (hit.loader) {
      detectedFrom.push(`加载器 ← ${hit.from}`)
      return { loader: hit.loader, loaderVersion: hit.version }
    }
  }
  if (facts.loaderHint && facts.kubejsJar) {
    detectedFrom.push(`加载器 ← mods/${facts.kubejsJar} 的加载器后缀`)
    return { loader: facts.loaderHint, loaderVersion: null }
  }
  const counts = scan.formatCounts
  const ranked: [Loader | null, number][] = [['neoforge', counts.neoforge], ['forge', counts.forge], ['fabric', counts.fabric]]
  ranked.sort((a, b) => b[1] - a[1])
  const [loader, won] = ranked[0] as [Loader | null, number]
  if (loader && won > 0) {
    detectedFrom.push(`加载器 ← mod 元数据格式分布（mods.toml ${counts.forge} / neoforge.mods.toml ${counts.neoforge} / fabric.mod.json ${counts.fabric}）`)
    return { loader, loaderVersion: null }
  }
  return { loader: null, loaderVersion: null }
}

function packName(manifests: Manifests, root: string): string {
  const fromModrinth = firstString(manifests.modrinth, ['name'])
  if (fromModrinth) return fromModrinth
  const dir = basename(root)
  // `.minecraft` 这类隐藏目录不是整合包名，用它上一层（实例名）
  const fallback = dir.startsWith('.') ? basename(join(root, '..')) : dir
  const fromInstance = firstString(manifests.instance, ['name'])
  return fromInstance && fromInstance !== fallback ? fromInstance : fallback
}

/**
 * 目录 → ModpackInfo。不抛错：mods 缺失 / jar 损坏 / 清单格式怪异都只是少一个字段，
 * 具体如何补由 UI 决定（规格 3.1「全部失败则让用户手动指定」）。
 */
export async function detectMetadata(root: string): Promise<ModpackInfo> {
  const modsDir = join(root, 'mods')
  const jarNames = await listJarNames(modsDir)
  const facts = detectFromJarNames(jarNames)
  const [scan, manifests] = await Promise.all([scanModMetadata(modsDir), readManifests(root)])
  const detectedFrom: string[] = []
  const mcVersion = pickMc(manifests, facts, detectedFrom)
  const loader = pickLoader(manifests, facts, scan, detectedFrom)
  const kubejsAddons = uniqueSorted([...facts.addons, ...scan.kubejsAddons])
  const installedModIds = uniqueSorted([...scan.installedModIds, ...kubejsAddons, ...(facts.hasKubejsJar ? [KUBEJS_MOD_ID] : [])])
  if (scan.entries.length > 0) detectedFrom.push(`modId ← mods.toml / neoforge.mods.toml / fabric.mod.json（${scan.entries.length} 条）`)
  return {
    path: root,
    name: packName(manifests, root),
    mcVersion,
    loader: loader.loader,
    loaderVersion: loader.loaderVersion,
    kubejsVersion: facts.hasKubejsJar ? facts.kubejsVersion : null,
    modCount: jarNames.length,
    detectedFrom,
    modsDir,
    hasKubejs: installedModIds.includes(KUBEJS_MOD_ID),
    kubejsAddons,
    installedModIds
  }
}
