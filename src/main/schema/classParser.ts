/**
 * L2：从 KubeJS 附属 jar 的 `*RecipeSchema.class` 离线提取参数结构（规格 3.6.15）。
 * 四条规则：`ldc` 的字符串常量 = 字段名；其前的 `getstatic …RecipeComponent` = 类型；
 * `RecipeSchema` 构造处 `anewarray RecipeKey[]` 的元素顺序 = 参数顺序；有无
 * `invokevirtual RecipeKey.optional` = 是否必填（其间压栈常量 = 默认值线索）。
 * 只做常量池 + `<clinit>` 扫描，**不是完整 JVM 解析器**：遇到不认识的指令即停止解码并退化为
 * 字段声明顺序，绝不臆造参数名。Plugin 类里 `namespace(ns)` + `register(path, XxxRecipeSchema.SCHEMA)`
 * 的字节码序列给出 **一个 Schema 接口 ↔ 多个 type** 的映射（ItemToItem → crushing/enriching/smelting）。
 * ProbeJS `.d.ts` 方法签名解析（宽松正则，不做完整 TS 解析）也在本文件。
 */
import { listEntries, readMany } from '../scanner/zip'
import type { FieldKind } from '../../shared/types'

interface CpEntry { tag: number; utf?: string; index?: number; classIndex?: number; natIndex?: number; num?: number }
interface Ref { owner: string; name: string; desc: string }
interface Op { op: number; ref: Ref | null; lit: string; num: number }

export interface ParsedClass {
  thisClass: string
  cp: CpEntry[]
  methods: { name: string; desc: string; code: Buffer | null }[]
}

export interface JarRecipeKey {
  /** JSON 字段名（`ldc` 常量），如 `chemicalInput` */
  name: string
  /** 组件常量名，如 `INFUSE_TYPE_INPUT` / `FLOAT_LONG` */
  component: string
  /** 组件所属类，如 `…kubejs.mekanism.recipe.MekComponents` */
  componentOwner: string
  /** Schema 接口自身的静态字段名，如 `CHEMICAL_INPUT`（与 anewarray 顺序对齐） */
  staticField: string
  required: boolean
  /** 默认值线索（字节码可见常量，如 `REDSTONE · 10`） */
  defaultHint?: string
  /** anewarray 中的位置（0 起） */
  order: number
}

export interface JarRecipeSchema {
  /** JVM 内部类名，如 `dev/latvian/kubejs/mekanism/recipe/ItemToItemRecipeSchema` */
  className: string
  /** 去掉 `RecipeSchema` 后缀的接口名，如 `ItemToItem` */
  simpleName: string
  keys: JarRecipeKey[]
}

export interface JarTypeMapping {
  typeId: string
  schemaClass: string
  schemaSimpleName: string
}

export interface AddonDependency {
  modId: string
  versionRange: string | null
  mandatory: boolean
}

export interface AddonJarInfo {
  jarPath: string
  modId: string | null
  modVersion: string | null
  loaderVersionRange: string | null
  dependencies: AddonDependency[]
  schemas: JarRecipeSchema[]
  types: JarTypeMapping[]
  /** 解析过程的可读说明（不中断扫描，供日志与覆盖率报告） */
  notes: string[]
}

export interface ProbeParam { name: string; tsType: string; optional: boolean }

export interface ProbeSignature {
  ns: string
  method: string
  params: ProbeParam[]
  /** 注释里出现的 recipe type id（如 `immersiveengineering:arc_furnace`） */
  typeId: string | null
}

const CP_SIZE: Record<number, number> = { 3: 4, 4: 4, 5: 8, 6: 8, 7: 2, 8: 2, 9: 4, 10: 4, 11: 4, 12: 4, 15: 3, 16: 2, 17: 4, 18: 4, 19: 2, 20: 2 }
/** [起, 止, 长度]；-1 表示变长（switch / wide 单独计算）。JVMS 表 6.5。 */
const LEN_RANGES: readonly [number, number, number][] = [
  [0x00, 0x0f, 1], [0x10, 0x10, 2], [0x11, 0x11, 3], [0x12, 0x12, 2], [0x13, 0x14, 3], [0x15, 0x19, 2],
  [0x1a, 0x35, 1], [0x36, 0x3a, 2], [0x3b, 0x83, 1], [0x84, 0x84, 3], [0x85, 0x98, 1], [0x99, 0xa7, 3],
  [0xa8, 0xa8, 5], [0xa9, 0xa9, 3], [0xaa, 0xab, -1], [0xac, 0xb1, 1], [0xb2, 0xb8, 3], [0xb9, 0xba, 5],
  [0xbb, 0xbb, 3], [0xbc, 0xbc, 2], [0xbd, 0xbd, 3], [0xbe, 0xc3, 1], [0xc4, 0xc4, -1], [0xc5, 0xc5, 4],
  [0xc6, 0xc7, 3], [0xc8, 0xc9, 5], [0xca, 0xff, 1]
]
const O = {
  iconst: 0x03, bipush: 0x10, sipush: 0x11, ldc: 0x12, ldcW: 0x13, ldc2W: 0x14, iinc: 0x84,
  getstatic: 0xb2, putstatic: 0xb3, invokevirtual: 0xb6, invokeinterface: 0xb9, anewarray: 0xbd,
  aastore: 0x53, tableswitch: 0xaa, lookupswitch: 0xab, wide: 0xc4
}

function instructionLength(op: number): number {
  for (const [lo, hi, len] of LEN_RANGES) if (op >= lo && op <= hi) return len
  return 1
}

function utfAt(cp: CpEntry[], index: number): string {
  const e = cp[index]
  if (!e || index <= 0) return ''
  if (e.tag === 1) return e.utf ?? ''
  if (e.tag === 7 || e.tag === 8 || e.tag === 16 || e.tag === 19 || e.tag === 20) return utfAt(cp, e.index ?? 0)
  return ''
}

/** NameAndType 用 index=名称 / natIndex=描述符 承载，Fieldref·Methodref·InterfaceMethodref 用 classIndex+natIndex。 */
function refAt(cp: CpEntry[], index: number): Ref | null {
  const e = cp[index]
  const nat = e?.natIndex ? cp[e.natIndex] : undefined
  if (!e || e.tag < 9 || e.tag > 11 || !nat) return null
  return { owner: utfAt(cp, cp[e.classIndex ?? 0]?.index ?? 0), name: utfAt(cp, nat.index ?? 0), desc: utfAt(cp, nat.natIndex ?? 0) }
}

function literalAt(cp: CpEntry[], index: number): string {
  const e = cp[index]
  if (!e) return ''
  if (e.tag === 3 || e.tag === 4) return String(e.num ?? 0)
  return utfAt(cp, index)
}

function cpEntry(tag: number, b: Buffer, o: number): CpEntry {
  const u2 = (p: number): number => b.readUInt16BE(p)
  switch (tag) {
    case 3: case 4: return { tag, num: b.readUInt32BE(o) }
    case 5: case 6: return { tag, num: 0 }
    case 7: case 8: case 16: case 19: case 20: return { tag, index: u2(o) }
    case 12: return { tag, index: u2(o), natIndex: u2(o + 2) }
    case 9: case 10: case 11: return { tag, classIndex: u2(o), natIndex: u2(o + 2) }
    case 15: return { tag, classIndex: b[o] ?? 0, index: u2(o + 1) }
    case 17: case 18: return { tag, classIndex: u2(o), index: u2(o + 2) }
    default: return { tag }
  }
}

/** 常量池 + 方法表（含 Code 字节码）。字段表跳过；不解析栈图，任何越界即返回 null。 */
export function parseClassFile(buf: Buffer): ParsedClass | null {
  try {
    if (buf.length < 10 || buf.readUInt32BE(0) !== 0xcafebabe) return null
    let o = 8
    const cpCount = buf.readUInt16BE(o)
    o += 2
    const cp: CpEntry[] = [{ tag: 0 }]
    for (let i = 1; i < cpCount; i++) {
      const tag = buf[o] ?? 0
      o += 1
      if (tag === 1) {
        const len = buf.readUInt16BE(o)
        o += 2
        cp.push({ tag, utf: buf.toString('utf8', o, o + len) })
        o += len
        continue
      }
      const size = CP_SIZE[tag]
      if (size === undefined) return null
      cp.push(cpEntry(tag, buf, o))
      o += size
      if (tag === 5 || tag === 6) {
        cp.push({ tag: 0 })
        i += 1
      }
    }
    o += 2
    const thisClassIndex = buf.readUInt16BE(o)
    o += 6
    o += 2 + buf.readUInt16BE(o) * 2
    const methods: ParsedClass['methods'] = []
    /** fields 表与 methods 表结构相同；只在 methods 上收集 Code 属性字节码。 */
    const readTable = (withCode: boolean): void => {
      const count = buf.readUInt16BE(o)
      o += 2
      for (let i = 0; i < count; i++) {
        o += 2
        const name = utfAt(cp, buf.readUInt16BE(o))
        const desc = utfAt(cp, buf.readUInt16BE(o + 2))
        o += 4
        const attrCount = buf.readUInt16BE(o)
        o += 2
        let code: Buffer | null = null
        for (let a = 0; a < attrCount; a++) {
          const attrName = utfAt(cp, buf.readUInt16BE(o))
          const len = buf.readUInt32BE(o + 2)
          if (withCode && attrName === 'Code') code = buf.subarray(o + 14, o + 14 + buf.readUInt32BE(o + 10))
          o += 6 + len
        }
        if (withCode) methods.push({ name, desc, code })
      }
    }
    readTable(false)
    readTable(true)
    return { thisClass: utfAt(cp, cp[thisClassIndex]?.index ?? 0), cp, methods }
  } catch {
    return null
  }
}

function switchLength(code: Buffer, at: number): number {
  let p = at + 1
  while (p % 4 !== 0) p += 1
  if (code[at] === O.tableswitch) return p - at + 12 + (code.readInt32BE(p + 8) - code.readInt32BE(p + 4) + 1) * 4
  return p - at + 8 + code.readInt32BE(p + 4) * 8
}

/** 线性解码；遇到越界或无法定长的指令立即返回已解码部分（调用方退化处理）。 */
function decode(code: Buffer, cp: CpEntry[]): Op[] {
  const out: Op[] = []
  let i = 0
  while (i < code.length) {
    const op = code[i] ?? 0
    let len = instructionLength(op)
    if (op === O.wide) len = (code[i + 1] ?? 0) === O.iinc ? 6 : 4
    if (op === O.tableswitch || op === O.lookupswitch) len = switchLength(code, i)
    if (len < 0 || i + len > code.length) return out
    const one = code[i + 1] ?? 0
    const two = i + 3 <= code.length ? code.readUInt16BE(i + 1) : 0
    const entry: Op = { op, ref: null, lit: '', num: 0 }
    if (op === O.ldc) entry.lit = literalAt(cp, one)
    else if (op === O.ldcW || op === O.ldc2W) entry.lit = literalAt(cp, two)
    else if (op === O.getstatic || op === O.putstatic || (op >= 0xb4 && op <= 0xba) || op === 0xbb || op === O.anewarray || op === 0xc0 || op === 0xc1) {
      entry.ref = refAt(cp, two)
      if (op === O.anewarray || op === 0xbb || op === 0xc0) entry.lit = utfAt(cp, cp[two]?.index ?? 0)
    } else if (op === O.bipush) entry.num = code.readInt8(i + 1)
    else if (op === O.sipush) entry.num = code.readInt16BE(i + 1)
    else if (op >= 0x02 && op <= 0x0d) entry.num = op - O.iconst
    out.push(entry)
    i += len
  }
  return out
}

/** 规则 ①②④：`<clinit>` → 字段名 / 组件类型 / 必填性 / 默认值线索。 */
function keysFromClinit(parsed: ParsedClass): JarRecipeKey[] {
  const clinit = parsed.methods.find((m) => m.name === '<clinit>' && m.code)?.code
  if (!clinit) return []
  const keys: JarRecipeKey[] = []
  let name = ''
  let component = ''
  let owner = ''
  let hints: string[] = []
  let optional = false
  for (const at of decode(clinit, parsed.cp)) {
    if (at.op === O.getstatic && at.ref) {
      if (at.ref.desc.includes('RecipeComponent')) {
        component = at.ref.name
        owner = at.ref.owner
      } else if (name) hints.push(at.ref.name)
      continue
    }
    if ((at.op === O.ldc || at.op === O.ldcW) && at.lit && !at.lit.includes('/')) name = at.lit
    else if ((at.op === O.invokevirtual || at.op === O.invokeinterface) && at.ref?.name === 'optional') optional = true
    else if (at.op === O.bipush || at.op === O.sipush) hints.push(optional ? `${at.num}` : `常量 ${at.num}`)
    else if (at.op === O.putstatic && at.ref) {
      if (name && at.ref.name !== 'SCHEMA') {
        const key: JarRecipeKey = { name, component: component || at.ref.name, componentOwner: owner, staticField: at.ref.name, required: !optional, order: keys.length }
        const hint = hints.filter((h) => h.length > 0).join(' · ')
        if (hint) key.defaultHint = hint
        keys.push(key)
      }
      name = ''
      component = ''
      owner = ''
      hints = []
      optional = false
    }
  }
  return keys
}

function fallbackOrder(keys: JarRecipeKey[]): JarRecipeKey[] {
  return keys.map((k, i) => ({ ...k, order: i }))
}

/** 规则 ③：`anewarray RecipeKey[]` 后的 `getstatic … / aastore` 序列 → 参数顺序。 */
function applyOrder(parsed: ParsedClass, keys: JarRecipeKey[]): JarRecipeKey[] {
  const clinit = parsed.methods.find((m) => m.name === '<clinit>' && m.code)?.code
  if (!clinit || keys.length === 0) return fallbackOrder(keys)
  const ops = decode(clinit, parsed.cp)
  const start = ops.findIndex((at) => at.op === O.anewarray && at.lit.endsWith('RecipeKey'))
  if (start < 0) return fallbackOrder(keys)
  const order: string[] = []
  for (let i = start; i < ops.length; i++) {
    if (ops[i]?.op !== O.aastore) continue
    for (let j = i - 1; j > start; j--) {
      const prev = ops[j]
      if (prev?.op === O.getstatic && prev.ref) {
        order.push(prev.ref.name)
        break
      }
    }
  }
  if (order.length === 0) return fallbackOrder(keys)
  return keys.map((k) => ({ ...k, order: order.indexOf(k.staticField) })).sort((a, b) => a.order - b.order)
}

/** 组件常量名 / 所属类 / JSON 字段名 → FieldKind（通用英文词根，无任何模组字段表）。 */
export function componentKindOf(component: string, owner: string, jsonName: string): FieldKind {
  const s = `${component} ${owner} ${jsonName}`.toUpperCase()
  if (s.includes('NBT')) return 'nbt'
  if (s.includes('BLOCK') || s.includes('STATE')) return 'blockstate'
  if (/GAS|SLURRY|INFUSE|PIGMENT|CHEMICAL|TANK/u.test(s)) return 'registry'
  if (s.includes('FLUID')) return 'fluid'
  if (s.includes('BOOL')) return 'boolean'
  if (/INT|LONG|FLOAT|DOUBLE|ENERGY|TIME|DURATION|TEMPERATURE|PRESSURE|CHANCE/u.test(s)) return 'number'
  if (s.includes('TAG')) return 'tag'
  if (/STRING|TEXT|GROUP|CATEGORY|NAMESPACE/u.test(s)) return 'text'
  if (/ITEM|INGREDIENT|STACK|RESULT|OUTPUT|INPUT/u.test(s)) return 'item'
  return 'unknown'
}

/** Plugin 类字节码 → type ↔ Schema 映射（支持一个 Schema 被多个 type 复用）。 */
function typesFromPlugin(parsed: ParsedClass, fallbackNs: string | null): JarTypeMapping[] {
  const out: JarTypeMapping[] = []
  for (const method of parsed.methods) {
    if (!method.code || !/register|schema|type/iu.test(method.name)) continue
    const ops = decode(method.code, parsed.cp)
    let ns = fallbackNs ?? ''
    let path = ''
    for (let i = 0; i < ops.length; i++) {
      const at = ops[i]
      if (!at) continue
      if ((at.op === O.ldc || at.op === O.ldcW) && at.lit && !at.lit.includes('/')) {
        const next = ops[i + 1]
        if (next?.op === O.invokevirtual && next.ref?.name === 'namespace') ns = at.lit
        else path = at.lit
      } else if (at.op === O.getstatic && at.ref?.name === 'SCHEMA' && path) {
        const simple = (at.ref.owner.split('/').pop() ?? at.ref.owner).replace(/RecipeSchema$/u, '')
        out.push({ typeId: `${ns}:${path}`, schemaClass: at.ref.owner, schemaSimpleName: simple })
        path = ''
      }
    }
  }
  const seen = new Set<string>()
  return out.filter((t) => (seen.has(t.typeId) ? false : (seen.add(t.typeId), true)))
}

/** mods.toml：modId / version / loaderVersion / `[[dependencies.*]]` 的 modId + versionRange。 */
export function parseModsTomlForAddon(raw: string): { modId: string | null; modVersion: string | null; loaderVersionRange: string | null; dependencies: AddonDependency[] } {
  const value = (line: string): string | null => /^\s*[A-Za-z_][A-Za-z0-9_.]*\s*=\s*["']([^"']*)["']/u.exec(line)?.[1] ?? null
  const dependencies: AddonDependency[] = []
  let inMods = false
  let inDep = false
  let modId: string | null = null
  let modVersion: string | null = null
  let loaderVersionRange: string | null = null
  let current: AddonDependency | null = null
  for (const line of raw.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    const header = /^\s*\[\[?([^\]]+)\]\]?/u.exec(line)
    if (header) {
      const name = (header[1] ?? '').trim().toLowerCase()
      inMods = name === 'mods'
      inDep = name.startsWith('dependencies')
      if (current && inDep) dependencies.push(current)
      current = inDep ? { modId: '', versionRange: null, mandatory: true } : current && !inDep ? (dependencies.push(current), null) : current
      continue
    }
    if (/^\s*loaderVersion\s*=/u.test(line)) loaderVersionRange = value(line) ?? loaderVersionRange
    if (inMods && /^\s*modId\s*=/u.test(line)) modId = value(line) ?? modId
    if (inMods && /^\s*version\s*=/u.test(line)) modVersion = value(line) ?? modVersion
    if (inDep && current) {
      if (/^\s*modId\s*=/u.test(line)) current.modId = value(line) ?? current.modId
      if (/^\s*versionRange\s*=/u.test(line)) current.versionRange = value(line)
      if (/^\s*mandatory\s*=/u.test(line)) current.mandatory = !/false/u.test(line)
    }
  }
  if (current) dependencies.push(current)
  return { modId, modVersion, loaderVersionRange, dependencies: dependencies.filter((d) => d.modId.length > 0) }
}

/** 单个附属 jar → modId / 依赖版本区间 / Schema 结构 / type↔Schema 映射。 */
export async function parseAddonJar(jarPath: string): Promise<AddonJarInfo> {
  const notes: string[] = []
  const list = await listEntries(jarPath)
  if (list.error) notes.push(`jar 无法打开：${list.error}`)
  const wanted = new Set<string>()
  for (const e of list.entries) {
    if (/RecipeSchema[A-Za-z0-9_$]*\.class$/u.test(e.fileName) || /[A-Za-z0-9_$]*KubeJSPlugin[A-Za-z0-9_$]*\.class$/u.test(e.fileName) || e.fileName === 'META-INF/mods.toml' || e.fileName === 'META-INF/neoforge.mods.toml') wanted.add(e.fileName)
  }
  const buffers = wanted.size > 0 ? await readMany(jarPath, wanted) : new Map<string, Buffer>()
  let modId: string | null = null
  let modVersion: string | null = null
  let loaderVersionRange: string | null = null
  const dependencies: AddonDependency[] = []
  const schemas: JarRecipeSchema[] = []
  const types: JarTypeMapping[] = []
  for (const [name, buf] of buffers) {
    if (name.endsWith('.toml')) {
      const facts = parseModsTomlForAddon(buf.toString('utf8'))
      modId = facts.modId ?? modId
      modVersion = facts.modVersion ?? modVersion
      loaderVersionRange = facts.loaderVersionRange ?? loaderVersionRange
      dependencies.push(...facts.dependencies)
      continue
    }
    const parsed = parseClassFile(buf)
    if (!parsed) {
      notes.push(`${name} 常量池解析失败，已跳过`)
      continue
    }
    if (/RecipeSchema/u.test(name)) {
      const keys = applyOrder(parsed, keysFromClinit(parsed))
      const simple = (name.split('/').pop() ?? name).replace(/\.class$/u, '')
      if (keys.length > 0) schemas.push({ className: parsed.thisClass || simple, simpleName: simple.replace(/RecipeSchema$/u, ''), keys })
      else notes.push(`${name} 未提取到 RecipeKey（非新版 Schema 接口）`)
    } else types.push(...typesFromPlugin(parsed, modId?.replace(/^kubejs[-_]/u, '') ?? null))
  }
  const byType = new Map<string, JarTypeMapping>()
  for (const t of types) if (t.typeId.includes(':')) byType.set(t.typeId, t)
  if (byType.size === 0) notes.push('未找到 namespace/register 序列，仅有 Schema 结构可用')
  return { jarPath, modId, modVersion, loaderVersionRange, dependencies, schemas, types: [...byType.values()], notes }
}

const NS_RE = /^\s*(?:export\s+)?namespace\s+([A-Za-z0-9_]+)/u
const FN_RE = /^\s*(?:export\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/u
const TYPE_ID_RE = /["']([a-z0-9_.-]+:[a-z0-9_./-]+)["']/u

function splitParams(raw: string): ProbeParam[] {
  if (!raw.trim()) return []
  return raw.split(',').map((part, index) => {
    const text = part.trim()
    const head = /^(\.\.\.)?([A-Za-z0-9_$]+)(\?)?\s*:/u.exec(text)
    const tsType = text.includes(':') ? text.slice(text.indexOf(':') + 1).trim() : text
    return { name: head?.[2] ?? `arg${index}`, tsType, optional: head?.[3] === '?' || /\bundefined\b/u.test(tsType) || text.includes('=') }
  })
}

/** ProbeJS `.d.ts`：按 `namespace` 嵌套与 `function f(a: T, b?: T2)` 签名宽松提取。 */
export function parseProbeDts(text: string): ProbeSignature[] {
  const out: ProbeSignature[] = []
  const stack: string[] = []
  let depth = 0
  let comment = ''
  for (const line of text.split(/\r?\n/u)) {
    const ns = NS_RE.exec(line)?.[1]
    if (ns) stack.push(ns)
    depth += (line.match(/\{/gu) ?? []).length - (line.match(/\}/gu) ?? []).length
    while (stack.length > 0 && depth <= 0) {
      stack.pop()
      depth = Math.max(depth, 0)
    }
    if (line.includes('/**') || line.includes('@recipeType')) comment = line
    const fn = FN_RE.exec(line)
    if (!fn) continue
    out.push({ ns: stack[stack.length - 1] ?? 'recipe', method: fn[1] ?? '', params: splitParams(fn[2] ?? ''), typeId: TYPE_ID_RE.exec(comment)?.[1] ?? null })
    comment = ''
  }
  return out
}
