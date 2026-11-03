/**
 * 原始配方 ↔ 规范化模型（P-B 纯函数，不接线任何现有流程）。
 *
 * 不变量：
 * - 原始数据只读：`RawSource.raw` 不被修改，规范化只产出新对象；
 * - 未认领字段必保留：进 `unknowns`（带限幅），反解时按原始结构原样带回；
 * - 未编辑优先原文：`denormalizeRecipe` 在 `dirtyFields` 为空时返回原始结构的深拷贝（可选文本级原样）；
 * - 数字/字符串严格区分：`0.07` 与 `"0.07"` 在 `Quantity.raw` 里各自保留。
 */
import type {
  NormalizedRecipe,
  NormalizedSchema,
  NormalizedSchemaSlot,
  NormalizedSlot,
  NormalizedValue,
  PartialReason,
  Quantity,
  SchemaDiagnostic
} from './schemaModel'
import { canonicalStringify, hashRaw, isPlainObject } from './canonicalJson'
import { collectUnknownFields } from './unknownFields'
import type { RawSource } from './schemaModel'

const REF_KINDS = new Set(['item', 'fluid', 'tag', 'registry'])
const QUANTITY_KEYS = ['count', 'size', 'amount', 'chance', 'probability'] as const
/** 引用键候选：按实际出现的键识别形态（含 Mekanism 的 gas/tag、Create 的 fluidTag 与浆液/色素） */
const REF_KEY_CANDIDATES = ['item', 'id', 'tag', 'fluid', 'fluidTag', 'gas', 'slurry', 'pigment', 'infuse_type', 'registry'] as const
/** 引用对象里由规范化负责的键；其余键进 extras 原样保留（如自定义 input 的 type） */
const REF_HANDLED_KEYS = new Set<string>([...REF_KEY_CANDIDATES, ...QUANTITY_KEYS, 'nbt', 'fluidStack'])

export interface NormalizeInput {
  raw: unknown
  rawText?: string
  schema: NormalizedSchema
  uid: string
  source: {
    source: RawSource['source']
    sourcePath: string
    jarPath?: string
    entryPath?: string
    rawText?: string
    dynamic?: boolean
  }
}

export interface NormalizeResult {
  normalized: NormalizedRecipe
  diagnostics: SchemaDiagnostic[]
}

function toQuantity(value: unknown): Quantity | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return { raw: value, numeric: value }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return { raw: value, numeric: Number.isFinite(n) ? n : null }
  }
  return undefined
}

function refKindOf(slot: NormalizedSchemaSlot): 'item' | 'fluid' | 'tag' | 'registry' {
  return slot.kind === 'fluid' || slot.kind === 'tag' || slot.kind === 'registry' ? slot.kind : 'item'
}

/** 从对象里提取 quantity（原值保留类型）；找不到返回 undefined */
function pickQuantities(obj: Record<string, unknown>): Partial<Record<'count' | 'amount' | 'chance', Quantity>> {
  const out: Partial<Record<'count' | 'amount' | 'chance', Quantity>> = {}
  for (const key of QUANTITY_KEYS) {
    const q = toQuantity(obj[key])
    if (!q) continue
    if (key === 'count' || key === 'size') out.count = q
    else if (key === 'amount') out.amount = q
    else out.chance = q
  }
  return out
}

function convertRef(
  slot: NormalizedSchemaSlot,
  raw: unknown,
  path: string,
  parent: Record<string, unknown> | null,
  consumed: Set<string>,
  diagnostics?: SchemaDiagnostic[]
): NormalizedValue {
  let kind = refKindOf(slot)
  const asObject = isPlainObject(raw)
  let id = ''
  let inner: Record<string, unknown> | null = null
  let refKey: string | undefined
  if (typeof raw === 'string') {
    id = raw.trim()
  } else if (isPlainObject(raw)) {
    inner = raw
    // 引用键按实际出现的键识别：Mekanism 的 {tag}/{gas}、Create 的 {fluid}/{fluidTag}、通用 {item}/{id}
    const found = REF_KEY_CANDIDATES.find((k) => typeof raw[k] === 'string')
    if (found) {
      refKey = found
      id = String(raw[found]).trim()
    } else {
      const nestedCandidate = raw['fluidStack'] ?? raw['tag']
      if (isPlainObject(nestedCandidate)) {
        const nested = nestedCandidate['fluid'] ?? nestedCandidate['id']
        if (typeof nested === 'string') {
          id = nested.trim()
          refKey = 'fluidStack'
        }
      }
    }
  }
  if (!id) return { kind: 'unknown', value: raw, path }
  // 形态优先于槽位声明：{tag:...} 就是标签，{fluid:...}/fluidStack 就是流体；"#ns:tag" 同样是标签。
  // 例外：schema 明确声明为 registry 的槽位（灌注/气体/浆液/色素）保持 registry。
  if (isPlainObject(raw)) {
    if (slot.kind === 'registry') kind = 'registry'
    else if ('fluid' in raw || 'fluidTag' in raw || 'fluidStack' in raw) kind = 'fluid'
    // 带 amount 的 tag 只能是流体标签（Create/IE 的 {amount, tag}），不能当物品标签丢数量
    else if ('tag' in raw && ('amount' in raw || (typeof raw['type'] === 'string' && /fluid/i.test(raw['type'])))) kind = 'fluid'
    else if ('tag' in raw) kind = 'tag'
    else kind = 'item'
  } else if (typeof raw === 'string' && raw.trim().startsWith('#')) {
    kind = 'tag'
  }

  const quantities: Partial<Record<'count' | 'amount' | 'chance', Quantity>> = inner ? pickQuantities(inner) : {}
  // 配对字段在父对象上（如 { base_ingredient:{...}, count:4 }）
  if (parent && slot.compound) {
    const sibling = pickQuantities(parent)
    for (const [part, q] of Object.entries(sibling) as ['count' | 'amount' | 'chance', Quantity][]) {
      const key = QUANTITY_KEYS.find((k) => (part === 'count' ? k === 'count' || k === 'size' : k === part))
      if (slot.compound.includes(key ?? part) && !quantities[part]) {
        quantities[part] = q
        if (key) consumed.add(`${path.replace(/[.[].*$/, '')}.${key}`)
      }
    }
  }

  // 未建模的引用内键（自定义 type 等）原样保留；编辑该条目时随 extras 一起写回
  const extras = inner
    ? Object.fromEntries(Object.entries(inner).filter(([k]) => !REF_HANDLED_KEYS.has(k)))
    : undefined
  if (extras && Object.keys(extras).length > 0) {
    diagnostics?.push({
      level: 'warn',
      code: 'UNKNOWN_FIELD_PRESERVED',
      field: slot.key,
      path,
      message: `${path} 含未建模键 ${Object.keys(extras).join('、')}，已按原样保留`
    })
  }

  const base = {
    path,
    asObject,
    ...(refKey ? { refKey } : {}),
    ...(inner?.['nbt'] !== undefined ? { nbt: inner['nbt'] } : {}),
    ...(extras && Object.keys(extras).length > 0 ? { extras } : {})
  }
  if (kind === 'tag') {
    return { kind: 'tag', id: id.replace(/^#/, ''), ...(quantities.count ? { count: quantities.count } : {}), ...(quantities.chance ? { chance: quantities.chance } : {}), ...base }
  }
  if (kind === 'fluid') {
    return { kind: 'fluid', id, ...(quantities.amount ? { amount: quantities.amount } : {}), ...(quantities.chance ? { chance: quantities.chance } : {}), ...base }
  }
  if (kind === 'registry') {
    return {
      kind: 'registry',
      registry: slot.registry ?? 'unknown:registry',
      id,
      ...(quantities.amount ? { amount: quantities.amount } : {}),
      ...(quantities.chance ? { chance: quantities.chance } : {}),
      ...base
    }
  }
  return {
    kind: 'item',
    id,
    ...(quantities.count ? { count: quantities.count } : {}),
    ...(quantities.chance ? { chance: quantities.chance } : {}),
    ...base
  }
}

function convertOne(
  slot: NormalizedSchemaSlot,
  raw: unknown,
  path: string,
  parent: Record<string, unknown> | null,
  consumed: Set<string>,
  diagnostics?: SchemaDiagnostic[]
): NormalizedValue {
  if (REF_KINDS.has(slot.kind)) return convertRef(slot, raw, path, parent, consumed, diagnostics)
  if (slot.kind === 'number' || slot.kind === 'boolean' || slot.kind === 'choice' || slot.kind === 'text') {
    if (raw === null || ['string', 'number', 'boolean'].includes(typeof raw)) {
      return { kind: 'scalar', value: raw as string | number | boolean | null, path }
    }
    return { kind: 'unknown', value: raw, path }
  }
  if (slot.kind === 'struct' && isPlainObject(raw)) {
    // 声明了子字段：已声明部分按子 schema 规范化，其余子键进 struct.unknowns（P-C 专项：不得丢失）
    if (slot.fields && slot.fields.length > 0) {
      const fields: Record<string, NormalizedValue> = {}
      const consumedChildren = new Set<string>()
      for (const sub of slot.fields) {
        const key = sub.jsonKey ?? sub.key
        if (!(key in raw)) continue
        consumedChildren.add(`${path}.${key}`)
        const childRaw = raw[key]
        fields[sub.key] =
          sub.multiple && Array.isArray(childRaw)
            ? {
                kind: 'list',
                of: childRaw.map((item, i) =>
                  convertOne(sub, item, `${path}.${key}[${i}]`, isPlainObject(item) ? item : null, consumed, diagnostics)
                ),
                path: `${path}.${key}`
              }
            : convertOne(sub, childRaw, `${path}.${key}`, raw, consumed, diagnostics)
      }
      const unknowns = collectUnknownFields(raw, consumedChildren, { pathPrefix: path })
      return { kind: 'struct', fields, ...(unknowns.length > 0 ? { unknowns } : {}), path }
    }
    const fields: Record<string, NormalizedValue> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        fields[key] = { kind: 'scalar', value: value as string | number | boolean | null, path: `${path}.${key}` }
      } else {
        fields[key] = { kind: 'unknown', value, path: `${path}.${key}` }
      }
    }
    return { kind: 'struct', fields, path }
  }
  if (slot.kind === 'blockstate' && isPlainObject(raw)) {
    const block = isPlainObject(raw['block']) ? raw['block'] : raw
    const id = typeof block['id'] === 'string' ? block['id'] : ''
    if (id) {
      const props = (isPlainObject(block['properties']) ? block['properties'] : {}) as Record<
        string,
        string | string[] | { min: string; max: string }
      >
      return { kind: 'blockstate', block: id, props, path }
    }
  }
  return { kind: 'unknown', value: raw, path }
}

function convertSlot(
  slot: NormalizedSchemaSlot,
  raw: unknown,
  path: string,
  parent: Record<string, unknown> | null,
  consumed: Set<string>,
  diagnostics: SchemaDiagnostic[]
): NormalizedValue {
  const isArray = Array.isArray(raw)
  if (slot.multiple) {
    const arr = isArray ? raw : [raw]
    if (!isArray) {
      diagnostics.push({
        level: 'warn',
        code: 'TYPE_MISMATCH',
        field: slot.key,
        path,
        message: `${slot.key} 在 schema 里是列表，原始数据是单值（已按单元素列表规范化）`
      })
    }
    return { kind: 'list', of: arr.map((item, i) => convertOne(slot, item, `${path}[${i}]`, isPlainObject(item) ? item : parent, consumed, diagnostics)), path }
  }
  if (isArray) {
    diagnostics.push({
      level: 'warn',
      code: 'TYPE_MISMATCH',
      field: slot.key,
      path,
      message: `${slot.key} 在 schema 里是单值，原始数据是数组（已取第一个）`
    })
  }
  return convertOne(slot, isArray ? raw[0] : raw, path, parent, consumed, diagnostics)
}

/** 有序合成：pattern×key → 网格；result 等仍走通用槽位 */
function shapedSlot(raw: Record<string, unknown>, consumed: Set<string>, diagnostics: SchemaDiagnostic[]): NormalizedSlot | null {
  const pattern = raw['pattern']
  const key = raw['key']
  if (!Array.isArray(pattern) || !isPlainObject(key)) return null
  consumed.add('$.pattern')
  consumed.add('$.key')
  const cells: (NormalizedValue | null)[] = []
  pattern.forEach((row, r) => {
    if (typeof row !== 'string') return
    for (const ch of row) {
      if (ch === ' ') {
        cells.push(null)
        continue
      }
      const ref = key[ch]
      if (ref === undefined) {
        diagnostics.push({
          level: 'warn',
          code: 'PATTERN_INVALID',
          field: 'grid',
          path: `$.pattern[${r}]`,
          message: `pattern 里的字符 "${ch}" 在 key 中没有定义`
        })
        cells.push({ kind: 'unknown', value: ch })
        continue
      }
      cells.push(convertRef({ key: 'grid', kind: 'item', multiple: false }, ref, `$.key.${ch}`, null, consumed, diagnostics))
    }
  })
  return { key: 'grid', value: { kind: 'list', of: cells, path: '$.pattern' }, path: '$.pattern', wasArray: true }
}

export function normalizeRecipe(input: NormalizeInput): NormalizeResult {
  const diagnostics: SchemaDiagnostic[] = []
  const { raw, schema } = input
  const rawHash = hashRaw(raw)
  const source: RawSource = {
    uid: input.uid,
    source: input.source.source,
    sourcePath: input.source.sourcePath,
    ...(input.source.jarPath ? { jarPath: input.source.jarPath } : {}),
    ...(input.source.entryPath ? { entryPath: input.source.entryPath } : {}),
    ...((input.source.rawText ?? input.rawText) ? { rawText: (input.source.rawText ?? input.rawText) as string } : {}),
    ...(isPlainObject(raw) ? { raw } : {}),
    dynamic: input.source.dynamic ?? false
  }
  if (!isPlainObject(raw)) {
    return {
      normalized: {
        typeId: schema.id,
        schemaRef: { id: schema.id, revision: schema.revision },
        slots: [],
        unknowns: [],
        partial: { isPartial: true, reasons: ['parse-failed'] },
        rawHash,
        source
      },
      diagnostics: [{ level: 'error', code: 'TYPE_MISMATCH', message: '原始配方不是 JSON 对象，无法规范化' }]
    }
  }

  const consumed = new Set<string>(['$.type'])
  const slots: NormalizedSlot[] = []
  if (schema.layoutKind === 'shaped') {
    const grid = shapedSlot(raw, consumed, diagnostics)
    if (grid) slots.push(grid)
  }
  for (const slot of [...schema.slots, ...schema.outputs]) {
    const jsonKey = slot.jsonKey ?? slot.key
    if (!(jsonKey in raw)) {
      slots.push({ key: slot.key, value: null })
      continue
    }
    consumed.add(`$.${jsonKey}`)
    slots.push({ key: slot.key, value: convertSlot(slot, raw[jsonKey], `$.${jsonKey}`, raw, consumed, diagnostics), path: `$.${jsonKey}` })
  }

  const unknowns = collectUnknownFields(raw, consumed)
  for (const unknown of unknowns) {
    if (unknown.truncatedDepth || unknown.value === undefined) {
      diagnostics.push({
        level: 'warn',
        code: 'UNKNOWN_TRUNCATED',
        path: unknown.path,
        message: `未认领字段 ${unknown.path} 的展开超出限制（深度或 8KB），已保留原始数据但未展开`,
        hint: '原始 JSON 未丢失；需要编辑请直接使用原文'
      })
    }
  }
  const reasons: PartialReason[] = []
  const rawType = typeof raw['type'] === 'string' ? raw['type'] : ''
  if (rawType !== schema.id) reasons.push('unmapped-type')
  if (unknowns.length > 0) reasons.push('unclaimed-keys')
  if (unknowns.some((u) => u.reason === 'ambient-condition')) reasons.push('ambient-conditions')
  if (unknowns.some((u) => u.truncatedDepth || u.value === undefined)) reasons.push('unknowns-truncated')
  if (source.dynamic) reasons.push('dynamic-script')
  if (slots.some((s) => containsUnknown(s.value))) reasons.push('unknown-ref')

  return {
    normalized: {
      typeId: schema.id,
      schemaRef: { id: schema.id, revision: schema.revision },
      slots,
      unknowns,
      partial: { isPartial: reasons.length > 0, reasons: [...new Set(reasons)] },
      rawHash,
      source
    },
    diagnostics
  }
}

function containsUnknown(value: NormalizedValue | null): boolean {
  if (!value) return false
  if (value.kind === 'unknown') return true
  if (value.kind === 'list') return value.of.some((v) => containsUnknown(v))
  if (value.kind === 'struct') return Object.values(value.fields).some((v) => containsUnknown(v))
  return false
}

/** canonical 数量键 → 原始 JSON 里可能出现的兄弟键名（pickQuantities 的映射逆表） */
const QUANTITY_SIBLING_KEYS: Record<string, readonly string[]> = {
  count: ['count', 'size'],
  amount: ['amount'],
  chance: ['chance', 'probability']
}

/** 反解成 JSON：未编辑（dirtyFields 为空）时直接返回原始结构，避免不必要的重构 */
export function denormalizeRecipe(
  normalized: NormalizedRecipe,
  schema: NormalizedSchema,
  options: {
    dirtyFields?: readonly string[]
    preferRawText?: boolean
    /** 工作台网格的实际行列：用于区分「UI 补齐的空格」与「用户真的扩了网格」 */
    gridSize?: { rows: number; cols: number }
  } = {}
): { kind: 'json'; json: Record<string, unknown> } | { kind: 'text'; text: string } {
  const dirty = options.dirtyFields ?? []
  if (options.preferRawText && normalized.source.rawText && dirty.length === 0) {
    return { kind: 'text', text: normalized.source.rawText }
  }
  const base = isPlainObject(normalized.source.raw) ? (JSON.parse(JSON.stringify(normalized.source.raw)) as Record<string, unknown>) : {}
  if (dirty.length === 0) return { kind: 'json', json: base }
  for (const key of dirty) {
    const slot = normalized.slots.find((s) => s.key === key)
    if (!slot || slot.value === null) continue
    if (key === 'grid') {
      writeGrid(base, slot.value, options.gridSize)
      continue
    }
    const schemaSlot = [...schema.slots, ...schema.outputs].find((s) => s.key === key)
    const jsonKey = schemaSlot?.jsonKey ?? key
    base[jsonKey] = toJsonValue(slot.value, schemaSlot)
    // P2-2：compound 槽的数量来自父对象的兄弟键（normalize 侧 convertRef 从 parent 拾取），
    // 而 toJsonValue 会把数量写进引用对象内部。若不清理 raw 里的旧顶层键，
    // 会产出 {"base":{...,"count":4},"count":4} 新旧双值并存，游戏侧解析结果取决于键序。
    // 只在 schema 明确声明 compound 的槽生效，普通槽零影响。
    if (schemaSlot?.compound) {
      for (const c of schemaSlot.compound) {
        for (const sibling of QUANTITY_SIBLING_KEYS[c] ?? []) {
          if (sibling !== jsonKey) delete base[sibling]
        }
      }
    }
  }
  return { kind: 'json', json: base }
}

function quantityValue(q: Quantity | undefined): unknown {
  return q ? q.raw : undefined
}

function toJsonValue(value: NormalizedValue, slot?: NormalizedSchemaSlot): unknown {
  switch (value.kind) {
    case 'item': {
      const keyName = value.refKey && value.refKey !== 'item' ? value.refKey : 'item'
      const obj: Record<string, unknown> = { ...(value.extras ?? {}), [keyName]: value.id }
      if (value.count) obj['count'] = quantityValue(value.count)
      if (value.chance) obj['chance'] = quantityValue(value.chance)
      if (value.nbt !== undefined) obj['nbt'] = value.nbt
      // 原始是 {item:...} 就保持对象形态，避免「只改 id」把形状改掉
      return value.asObject || value.count || value.chance || value.nbt !== undefined || value.extras
        ? obj
        : value.id
    }
    case 'tag': {
      const tagKey = value.refKey && value.refKey !== 'tag' ? value.refKey : 'tag'
      const obj: Record<string, unknown> = { ...(value.extras ?? {}), [tagKey]: value.id }
      if (value.count) obj['count'] = quantityValue(value.count)
      if (value.chance) obj['chance'] = quantityValue(value.chance)
      if (value.nbt !== undefined) obj['nbt'] = value.nbt
      if (value.asObject || value.count || value.chance || value.nbt !== undefined || value.extras) return obj
      // 字符串形态的标签：必须带回 id，否则「改别的字段」会把 #tag 写成裸 '#'
      return `#${value.id}`
    }
    case 'fluid':
      return {
        ...(value.extras ?? {}),
        [value.refKey ?? 'fluid']: value.id,
        ...(value.amount ? { amount: quantityValue(value.amount) } : {}),
        ...(value.chance ? { chance: quantityValue(value.chance) } : {}),
        ...(value.nbt !== undefined ? { nbt: value.nbt } : {})
      }
    case 'registry': {
      if (!value.amount && !value.asObject && !value.extras && slot?.emitShape === 'scalar') return value.id
      const key =
        slot?.compound?.find((c) => !QUANTITY_KEYS.includes(c as (typeof QUANTITY_KEYS)[number])) ?? value.refKey ?? 'id'
      return {
        ...(value.extras ?? {}),
        [key]: value.id,
        ...(value.amount ? { amount: quantityValue(value.amount) } : {}),
        ...(value.nbt !== undefined ? { nbt: value.nbt } : {})
      }
    }
    case 'scalar':
      return value.value
    case 'list':
      return value.of.map((v) => (v === null ? null : toJsonValue(v, slot)))
    case 'struct': {
      const obj = Object.fromEntries(Object.entries(value.fields).map(([k, v]) => [k, toJsonValue(v)]))
      // struct 内部未认领子键原样带回（path 形如 1itemInput.foo → 取最后一段作键）
      for (const unknown of value.unknowns ?? []) {
        if (unknown.value === undefined) continue
        const rel = unknown.path.slice((value.path ? value.path.length + 1 : 2))
        obj[rel] = unknown.value
      }
      return obj
    }
    case 'blockstate':
      return { block: { id: value.block, ...(Object.keys(value.props).length ? { properties: value.props } : {}) } }
    case 'nested':
      return { type: value.typeId }
    case 'unknown':
      return value.value
  }
}

/**
 * 编辑了网格：按当前行列重建 pattern/key。
 * - 给定工作台尺寸时，以「原 pattern 行列」为下限、以最后一件非空材料为上限，
 *   避免把 UI 补齐的空格扩成 recipe 的空行列（1×2 配方不应被改成 9 列）；
 * - 未改动的引用优先复用旧字母，未改动的材料不会因别的格子变化而被换字母。
 */
function writeGrid(
  base: Record<string, unknown>,
  value: NormalizedValue,
  gridSize?: { rows: number; cols: number }
): void {
  if (value.kind !== 'list') return
  const oldPattern = Array.isArray(base['pattern']) ? (base['pattern'] as unknown[]) : []
  const originalRows = oldPattern.length > 0 ? oldPattern.length : 3
  const originalCols = oldPattern.reduce<number>(
    (n, row) => (typeof row === 'string' ? Math.max(n, row.length) : n),
    0
  ) || (gridSize ? gridSize.cols : 3)
  const width = gridSize ? gridSize.cols : Math.max(1, Math.ceil(value.of.length / Math.max(1, originalRows)))
  let rows = gridSize ? originalRows : Math.max(1, Math.ceil(value.of.length / Math.max(1, width)))
  let cols = gridSize ? Math.max(originalCols, width) : width
  if (gridSize) {
    // 只有真的往补齐区放置了材料才扩网格；纯空格不扩
    let lastRow = -1
    let lastCol = -1
    value.of.forEach((cell, i) => {
      if (!cell || cell.kind === 'unknown') return
      if (!('id' in cell) || !cell.id) return
      lastRow = Math.max(lastRow, Math.floor(i / width))
      lastCol = Math.max(lastCol, i % width)
    })
    rows = Math.max(originalRows, lastRow + 1)
    cols = Math.max(originalCols, lastCol + 1)
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  // 优先复用旧 key 的「引用 → 字母」映射：只改一个材料时，其它格子的字母保持不变
  const oldKey = isPlainObject(base['key']) ? (base['key'] as Record<string, unknown>) : {}
  const letterByRef = new Map<string, string>()
  const used = new Set<string>()
  for (const [ch, ref] of Object.entries(oldKey)) {
    letterByRef.set(canonicalStringify(ref), ch)
    used.add(ch)
  }
  const nextFree = (): string => {
    for (const ch of letters) if (!used.has(ch)) return ch
    return `K${used.size}`
  }

  const pattern: string[] = []
  const key: Record<string, unknown> = {}
  const assigned = new Set<string>()
  for (let r = 0; r < rows; r += 1) {
    let row = ''
    for (let c = 0; c < cols; c += 1) {
      // value.of 的行宽是工作台宽度，输出宽度可能更窄（去掉尾部空列）
      const cell = value.of[r * width + c]
      if (!cell || cell.kind === 'unknown') {
        row += ' '
        continue
      }
      const id = 'id' in cell ? String(cell.id) : ''
      if (!id) {
        row += ' '
        continue
      }
      const ref = toJsonValue(cell, { key: 'A', kind: 'item', multiple: false })
      const refKey = canonicalStringify(ref)
      let ch = letterByRef.get(refKey) ?? [...assigned].find((x) => canonicalStringify(key[x]) === refKey)
      if (!ch) {
        ch = nextFree()
        used.add(ch)
        letterByRef.set(refKey, ch)
      }
      assigned.add(ch)
      key[ch] = ref
      row += ch
    }
    pattern.push(row)
  }
  base['pattern'] = pattern
  base['key'] = key
}
