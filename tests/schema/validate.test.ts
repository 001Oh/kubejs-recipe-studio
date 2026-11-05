import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeRecipe } from '@shared/normalize'
import { hasErrors, validateNormalized } from '@shared/schemaValidate'
import type { NormalizedSchema, SlotConstraints } from '@shared/schemaModel'

const schema: NormalizedSchema = {
  id: 'demo:mix',
  layoutKind: 'multi_io',
  slots: [
    { key: 'ingredients', kind: 'item', multiple: true, required: true },
    { key: 'fluid', kind: 'fluid', multiple: false },
    { key: 'result', kind: 'item', multiple: false, required: true },
    { key: 'level', kind: 'number', multiple: false }
  ],
  outputs: []
}

function build(raw: Record<string, unknown>) {
  return normalizeRecipe({ raw, schema, uid: 'u', source: { source: 'jar', sourcePath: 'p' } }).normalized
}

describe('校验器：只依赖规范化数据 + Schema', () => {
  it('必填缺失定位到字段', () => {
    const recipe = build({ type: 'demo:mix', fluid: { fluid: 'a:water', amount: 100 } })
    const diagnostics = validateNormalized(recipe, schema)
    const missing = diagnostics.filter((d) => d.code === 'REQUIRED_MISSING')
    expect(missing.map((d) => d.field).sort()).toEqual(['ingredients', 'result'])
    expect(hasErrors(diagnostics)).toBe(true)
  })

  it('引用 ID 形态不合法：PATTERN_INVALID + 精确 path', () => {
    const recipe = build({
      type: 'demo:mix',
      ingredients: [{ item: 'ok:fine' }, { item: 'BAD ID' }],
      result: { item: 'ok:out' }
    })
    const hit = validateNormalized(recipe, schema).find((d) => d.code === 'PATTERN_INVALID')
    expect(hit?.field).toBe('ingredients')
    expect(hit?.path).toBe('$.ingredients[1]')
  })

  it('概率越界与无法解析的字符串概率都拦下', () => {
    const bad = build({
      type: 'demo:mix',
      ingredients: [{ item: 'a:x', chance: 1.7 }, { item: 'a:y', chance: 'abc' }],
      result: { item: 'a:out' }
    })
    const codes = validateNormalized(bad, schema).filter((d) => d.code === 'CHANCE_OUT_OF_RANGE')
    expect(codes).toHaveLength(2)
  })

  it('流体量必须为正整数；物品数量必须为正整数', () => {
    const bad = build({
      type: 'demo:mix',
      ingredients: [{ item: 'a:x', count: 0 }],
      fluid: { fluid: 'a:water', amount: 1.5 },
      result: { item: 'a:out' }
    })
    const diagnostics = validateNormalized(bad, schema)
    expect(diagnostics.some((d) => d.code === 'FLUID_AMOUNT_INVALID')).toBe(true)
    expect(diagnostics.some((d) => d.code === 'INTEGER_INVALID' && d.field === 'ingredients')).toBe(true)
  })

  it('枚举 / 范围 / 整数约束与 mustBe', () => {
    const constrainedSchema: NormalizedSchema = {
      ...schema,
      slots: [
        { key: 'mode', kind: 'text', multiple: false },
        { key: 'energy', kind: 'number', multiple: false },
        { key: 'fluid', kind: 'fluid', multiple: false }
      ],
      outputs: [{ key: 'result', kind: 'item', multiple: false, required: true }]
    }
    const constraints: Record<string, SlotConstraints> = {
      mode: { enum: ['inscribe', 'press'] },
      energy: { min: 0, max: 1000, integer: true },
      fluid: { mustBe: 'tag' }
    }
    const recipe = normalizeRecipe({
      raw: { type: 'demo:mix', mode: 'x', energy: 1000.5, fluid: { fluid: 'a:w', amount: 1 }, result: { item: 'a:o' } },
      schema: constrainedSchema,
      uid: 'u',
      source: { source: 'jar', sourcePath: 'p' }
    }).normalized
    const diagnostics = validateNormalized(recipe, constrainedSchema, { constraints })
    expect(diagnostics.some((d) => d.code === 'ENUM_INVALID')).toBe(true)
    expect(diagnostics.some((d) => d.code === 'INTEGER_INVALID' && d.field === 'energy')).toBe(true)
    expect(diagnostics.some((d) => d.code === 'MUST_BE_INVALID' && d.field === 'fluid')).toBe(true)
  })

  it('未知物品只警告不阻断；不传就完全静默', () => {
    const recipe = build({ type: 'demo:mix', ingredients: [{ item: 'ghost:item' }], result: { item: 'a:o' } })
    const withProbe = validateNormalized(recipe, schema, { itemExists: (id) => id !== 'ghost:item' })
    expect(withProbe.find((d) => d.code === 'REF_UNKNOWN_ITEM')?.level).toBe('warn')
    expect(hasErrors(withProbe.filter((d) => d.code !== 'REQUIRED_MISSING'))).toBe(false)
    const without = validateNormalized(recipe, schema)
    expect(without.some((d) => d.code === 'REF_UNKNOWN_ITEM')).toBe(false)
  })

  it('列表条数约束', () => {
    const recipe = build({ type: 'demo:mix', ingredients: [{ item: 'a:one' }], result: { item: 'a:o' } })
    const diagnostics = validateNormalized(recipe, schema, { constraints: { ingredients: { minItems: 2 } } })
    expect(diagnostics.some((d) => d.code === 'ITEMS_COUNT_INVALID')).toBe(true)
  })
})

describe('架构约束：校验器与规范化不依赖 Electron/扫描器/界面', () => {
  // B121/D-49：schemaMigrate.ts 已删除（四处 userData 无历史钉住数据，现行落盘格式即裸数组）
  const files = ['schemaModel.ts', 'normalize.ts', 'schemaValidate.ts', 'unknownFields.ts', 'draftState.ts']
  for (const file of files) {
    it(`${file} 不带进程耦合依赖`, () => {
      const source = readFileSync(join(process.cwd(), 'src', 'shared', file), 'utf8')
      for (const forbidden of ["from 'electron'", 'from "@electron', "from '../main", "'@main/", "'@renderer", '/scanner/', 'require(']) {
        expect(source.includes(forbidden)).toBe(false)
      }
      // 只允许相对同层引用与 node 内置（规范化层只用 node:crypto 做哈希）
      const imports = source.match(/from '[^']+'/g) ?? []
      for (const spec of imports) {
        expect(spec).toMatch(/from '(\.\/|node:crypto')/)
      }
    })
  }
})

describe('约束可以声明在 schema 槽位上（无需调用方注入）', () => {
  it('slot.constraints 优先生效', () => {
    const withConstraint: NormalizedSchema = {
      ...schema,
      slots: schema.slots.map((s) => (s.key === 'level' ? { ...s, constraints: { min: 1, max: 5, integer: true } } : s))
    }
    const recipe = normalizeRecipe({
      raw: { type: 'demo:mix', ingredients: [{ item: 'a:x' }], result: { item: 'a:o' }, level: 9 },
      schema: withConstraint,
      uid: 'u',
      source: { source: 'jar', sourcePath: 'p' }
    }).normalized
    const diagnostics = validateNormalized(recipe, withConstraint)
    expect(diagnostics.some((d) => d.code === 'RANGE_INVALID' && d.field === 'level')).toBe(true)
  })
})
