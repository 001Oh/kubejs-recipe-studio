/**
 * `CodePreview` 汇总层测试。
 * preview.ts 按契约 import `src/main/schema/registry.ts` 的 `getSchema`（由并行开发的 schema 模块提供）；
 * 该文件尚未落地时，本套件整体跳过（其余代码生成测试不依赖它）。
 */
import { describe, expect, it } from 'vitest'
import type { CodePreview } from '../../src/shared/ipc'
import { CREATED_AT, field, modpack, schema, sv, workbench } from './helpers'

type Generate = (input: Record<string, unknown>) => Promise<{ preview: CodePreview }>

let generate: Generate | null = null
try {
  const mod = (await import('../../src/main/codegen/preview')) as unknown as { generate: Generate }
  generate = mod.generate
} catch {
  generate = null
}

async function run(input: Record<string, unknown>): Promise<CodePreview> {
  if (!generate) throw new Error('preview 模块不可用（schema 注册表尚未落地）')
  return (await generate(input)).preview
}

const mixingSchema = schema({
  id: 'create:mixing',
  modId: 'create',
  layoutKind: 'multi_io',
  emitTarget: 'event.recipes.create.mixing',
  outputs: [field('result', 'item')],
  slots: [field('ingredients', 'item', { multiple: true })],
  extraFields: [field('energy', 'number', { sugarSupported: false })]
})

const bench = workbench({
  typeId: 'create:mixing',
  layoutKind: 'multi_io',
  values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: [sv('item', 'minecraft:iron_ingot')] }
})

const pack = modpack({ kubejsAddons: ['kubejs_create'] })

describe.skipIf(generate === null)('CodePreview 汇总', () => {
  it('附属已装 → 语法糖通道，可写盘', async () => {
    const preview = await run({ workbench: bench, schema: mixingSchema, modpack: pack, createdAtMs: CREATED_AT })
    expect(preview.channel).toBe('kubejs-sugar')
    expect(preview.syntaxOk).toBe(true)
    expect(preview.canWrite).toBe(true)
    expect(preview.sugarUnverified).toBe(true)
    expect(preview.header).toContain('// Modpack : Nomifactory GTCEu')
    expect(preview.typeId).toBe('create:mixing')
    expect(preview.fileName).toMatch(/^recipe_studio_\d{8}_\d{6}\.js$/)
  })

  it('附属缺失 → 自动切数据包 JSON，missingAddon 报出模组名', async () => {
    const preview = await run({
      workbench: bench,
      schema: mixingSchema,
      modpack: modpack({ kubejsAddons: [] }),
      hasSamples: true,
      createdAtMs: CREATED_AT
    })
    expect(preview.channel).toBe('datapack-json')
    expect(preview.missingAddon).toBe('kubejs_create')
    expect(preview.blockedFromSugar).toBe(true)
    expect(preview.datapackFiles).toHaveLength(1)
    expect(preview.datapackFiles[0]?.relativePath).toContain('kubejs/data/recipe_studio/recipes/')
  })

  it('填了语法糖表达不了的字段 → 降级并列出字段名', async () => {
    const preview = await run({
      workbench: workbench({
        typeId: 'create:mixing',
        layoutKind: 'multi_io',
        values: { ...bench.values, energy: 4000 }
      }),
      schema: mixingSchema,
      modpack: pack,
      createdAtMs: CREATED_AT
    })
    expect(preview.channel).toBe('event-custom')
    expect(preview.sugarUnsupportedFields).toEqual(['energy'])
    expect(preview.code).toContain('energy: 4000')
  })

  it('always-sugar 且附属缺失 → 明确报错且不可写盘', async () => {
    const preview = await run({
      workbench: bench,
      schema: mixingSchema,
      modpack: modpack({ kubejsAddons: [] }),
      preference: 'always-sugar',
      hasSamples: true,
      createdAtMs: CREATED_AT
    })
    expect(preview.canWrite).toBe(false)
    expect(preview.diagnostics.some((d) => d.level === 'error')).toBe(true)
  })

  it('缺必填产物 → 语义诊断定位字段并禁止写盘', async () => {
    const preview = await run({
      workbench: workbench({
        typeId: 'create:mixing',
        layoutKind: 'multi_io',
        values: { ingredients: [sv('item', 'minecraft:iron_ingot')] }
      }),
      schema: schema({ ...mixingSchema, outputs: [field('result', 'item', { required: true })] }),
      modpack: pack,
      createdAtMs: CREATED_AT
    })
    expect(preview.diagnostics.some((d) => d.level === 'error' && d.field === 'result')).toBe(true)
    expect(preview.canWrite).toBe(false)
  })

  it('会话内重复生成 → duplicateOf 指向前一份', async () => {
    const { rememberGeneration } = await import('../../src/main/codegen/dedupe')
    rememberGeneration(bench, 'recipe_studio_earlier.js')
    const preview = await run({ workbench: bench, schema: mixingSchema, modpack: pack, createdAtMs: CREATED_AT })
    expect(preview.duplicateOf).toBe('recipe_studio_earlier.js')
  })

  it('未知物品只警告不阻断', async () => {
    const { setGenerationContext, getGenerationContext } = await import('../../src/main/codegen/context')
    setGenerationContext({ semantic: { itemExists: (id) => id.startsWith('minecraft:') } })
    const preview = await run({
      workbench: workbench({
        typeId: 'create:mixing',
        layoutKind: 'multi_io',
        values: { result: sv('item', 'minecraft:steel_ingot'), ingredients: [sv('item', 'somemod:ghost')] }
      }),
      schema: mixingSchema,
      modpack: pack,
      createdAtMs: CREATED_AT
    })
    expect(preview.diagnostics.some((d) => d.level === 'warn' && d.message.includes('未知物品'))).toBe(true)
    expect(preview.canWrite).toBe(true)
    getGenerationContext().semantic.itemExists = undefined
  })

  it('schema 缺失 + 有效自定义类型 → 回退 event.custom（U-22）', async () => {
    const preview = await run({
      workbench: workbench({ typeId: 'test:custom_type', layoutKind: 'multi_io', values: { inputs: [sv('item', 'minecraft:dirt')] } }),
      schema: null,
      modpack: pack
    })
    expect(preview.code).toContain('event.custom(')
    expect(preview.code).toContain('test:custom_type')
    expect(preview.syntaxOk).toBe(true)
  })

  it('schema 缺失 + 占位类型 __generic__ → 阻断并给中文错误', async () => {
    const preview = await run({
      workbench: workbench({ typeId: '__generic__', layoutKind: 'multi_io', values: {} }),
      schema: null,
      modpack: pack
    })
    expect(preview.canWrite).toBe(false)
    expect(preview.diagnostics[0]?.message).toContain('通用模式需要填写具体配方类型')
  })

  it('NBT 约束触发降级（不为语法糖丢参数）', async () => {
    const preview = await run({
      workbench: workbench({
        typeId: 'create:mixing',
        layoutKind: 'multi_io',
        values: {
          result: sv('item', 'minecraft:steel_ingot'),
          ingredients: [sv('item', 'minecraft:iron_ingot', { nbt: { Custom: 1 } })]
        }
      }),
      schema: mixingSchema,
      modpack: pack,
      createdAtMs: CREATED_AT
    })
    expect(preview.channel).toBe('event-custom')
    expect(preview.sugarUnsupportedFields).toContain('ingredients')
    expect(preview.code).toContain('nbt')
  })
})
