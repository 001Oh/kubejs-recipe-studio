import { describe, expect, it } from 'vitest'
import { migrateSchemaFile, migrateSchemaV1ToV2 } from '@shared/schemaMigrate'
import { SCHEMA_FORMAT_VERSION } from '@shared/schemaModel'

const v1Schema = {
  id: 'mekanism:metallurgic_infusing',
  layoutKind: 'single_io',
  emitTarget: 'event.recipes.mekanism.metallurgic_infusing',
  slots: [
    { key: 'input', kind: 'item', multiple: false },
    {
      key: 'infusionInput',
      kind: 'registry',
      multiple: false,
      registry: 'mekanism:infuse_type',
      emitShape: 'scalar',
      compound: ['amount', 'tag']
    }
  ],
  outputs: [{ key: 'output', kind: 'item', multiple: false }]
}

describe('Schema 迁移', () => {
  it('v1 裸数组 → v2：emitShape 映射到 emit.shape，补 revision/preserveUnknown', () => {
    const result = migrateSchemaFile([v1Schema])
    expect(result.incompatible).toBe(false)
    expect(result.formatVersion).toBe(SCHEMA_FORMAT_VERSION)
    expect(result.failed).toEqual([])
    const migrated = result.schemas[0]
    expect(migrated?.id).toBe('mekanism:metallurgic_infusing')
    expect(migrated?.revision).toBe(1)
    expect(migrated?.preserveUnknown).toBe(true)
    const registry = migrated?.slots.find((s) => s.key === 'infusionInput')
    expect(registry?.emit).toEqual({ shape: 'scalar' })
    expect(registry?.compound).toEqual(['amount', 'tag'])
    expect(registry?.registry).toBe('mekanism:infuse_type')
  })

  it('v2 文件原样通过', () => {
    const file = {
      formatVersion: SCHEMA_FORMAT_VERSION,
      schemas: [
        {
          id: 'demo:keep',
          layoutKind: 'custom',
          slots: [{ key: 'x', kind: 'item', multiple: false }],
          outputs: [],
          revision: 7,
          preserveUnknown: false
        }
      ]
    }
    const result = migrateSchemaFile(file)
    expect(result.schemas[0]).toMatchObject({ id: 'demo:keep', revision: 7, preserveUnknown: false })
    expect(result.diagnostics).toEqual([])
  })

  it('版本高于支持范围：整份只读，不猜、不丢原文件', () => {
    const result = migrateSchemaFile({ formatVersion: 99, schemas: [v1Schema] })
    expect(result.incompatible).toBe(true)
    expect(result.schemas).toEqual([])
    expect(result.diagnostics[0]?.code).toBe('SCHEMA_VERSION_UNSUPPORTED')
  })

  it('单条迁移失败只跳过该条，其余继续', () => {
    const result = migrateSchemaFile([v1Schema, { id: 'bad:no-layout' }, { layoutKind: 'custom' }])
    expect(result.schemas.map((s) => s.id)).toEqual(['mekanism:metallurgic_infusing'])
    expect(result.failed).toHaveLength(2)
    expect(result.failed[0]?.id).toBe('bad:no-layout')
    expect(result.failed[1]?.id).toBeNull()
    expect(result.diagnostics.filter((d) => d.code === 'SCHEMA_MIGRATION_FAILED')).toHaveLength(2)
  })

  it('单条迁移函数对非对象输入抛错（由 caller 隔离）', () => {
    expect(() => migrateSchemaV1ToV2(null)).toThrow(/不是对象/)
    expect(() => migrateSchemaV1ToV2({ id: 'x' })).toThrow(/layoutKind/)
  })
})
