/** manifest 校验单测：致命错误点名到字段，局部瑕疵只降级不牵连整包（规格 3.6.14）。 */
import { describe, expect, it } from 'vitest'
import { LAYOUT_KINDS, formatIssues, parseManifest } from '../../src/main/plugins/manifest'

function minimal(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'p1', name: '测试插件', version: '1.0.0', ...extra }
}

describe('致命校验', () => {
  it('缺 id / name / version 时逐个点名', () => {
    const res = parseManifest({ version: '1.0.0' })
    expect(res.data).toBeNull()
    expect(res.errors.map((e) => e.field)).toEqual(['id', 'name'])
    expect(formatIssues(res.errors)).toContain('缺少非空字符串 id')
  })

  it('根节点不是对象直接失败', () => {
    const res = parseManifest([1, 2, 3])
    expect(res.errors[0]?.field).toBe('(根节点)')
  })

  it('recipeTypes 写成对象时报 recipeTypes 字段', () => {
    const res = parseManifest(minimal({ recipeTypes: { id: 'a:b' } }))
    expect(res.errors.map((e) => e.field)).toContain('recipeTypes')
  })
})

describe('部分覆盖：只声明词典也合法', () => {
  it('只有 fieldNames 的插件不算错误', () => {
    const res = parseManifest(minimal({ fieldNames: { pentacle_id: '法阵等级' }, valueNames: { 'occultism:craft_djinni': '巨灵法阵（Tier 2）' } }))
    expect(res.errors).toHaveLength(0)
    expect(res.data?.typeDecls).toHaveLength(0)
    expect(res.data?.fieldNames['pentacle_id']).toBe('法阵等级')
    expect(res.data?.valueNames['occultism:craft_djinni']).toContain('Tier 2')
    expect(res.warnings).toHaveLength(0)
  })

  it('fieldNames 值类型错误只忽略该项', () => {
    const res = parseManifest(minimal({ fieldNames: { good: '可用', bad: 42 } }))
    expect(res.data?.fieldNames['good']).toBe('可用')
    expect(res.data?.fieldNames['bad']).toBeUndefined()
    expect(res.warnings.map((w) => w.field)).toContain('fieldNames.bad')
  })
})

describe('配方类型声明校验', () => {
  const ritual = {
    id: 'occultism:ritual',
    displayName: '神秘学 · 仪式',
    layoutKind: 'multi_io',
    emitTarget: null,
    customTemplate: { type: 'occultism:ritual' },
    slots: [
      { key: 'activation_item', displayName: '激活物', kind: 'item', multiple: false, required: true, role: 'requirement' },
      { key: 'ingredients', displayName: '祭祀材料', kind: 'item', multiple: true, min: 1, max: 12 },
      { key: 'pentacle_id', displayName: '法阵等级', kind: 'choice', choicesSource: 'values:pentacle_id', role: 'requirement' },
      { key: 'require_sacrifice', displayName: '需要活体献祭', kind: 'boolean', defaultValue: false, role: 'requirement' }
    ],
    outputs: [{ key: 'result', displayName: '产物', kind: 'item', multiple: false }]
  }

  it('照规格的仪式声明能完整解析，含前置条件角色', () => {
    const res = parseManifest(minimal({ recipeTypes: [ritual] }))
    expect(res.errors).toHaveLength(0)
    const decl = res.data?.typeDecls[0]
    expect(decl?.id).toBe('occultism:ritual')
    expect(decl?.modId).toBe('occultism')
    expect(decl?.layoutKind).toBe('multi_io')
    expect(decl?.emitTarget).toBeNull()
    expect(decl?.customTemplate).toEqual({ type: 'occultism:ritual' })
    expect(decl?.slots.filter((s) => s.role === 'requirement').map((s) => s.key)).toEqual(['activation_item', 'pentacle_id', 'require_sacrifice'])
    expect(decl?.slots[1]?.multiple).toBe(true)
    expect(decl?.outputs[0]?.displayName).toBe('产物')
  })

  it('layoutKind 越界即拒绝该条并点名六个内置值', () => {
    const res = parseManifest(minimal({ recipeTypes: [{ ...ritual, layoutKind: 'my_fancy_grid' }] }))
    expect(res.data?.typeDecls).toHaveLength(0)
    const warning = res.warnings.find((w) => w.field.endsWith('layoutKind'))
    expect(warning?.message).toContain('插件不得自定义 UI 组件')
    for (const kind of LAYOUT_KINDS) expect(warning?.message).toContain(kind)
  })

  it('缺 id 的类型声明丢弃该条，其它条保留', () => {
    const res = parseManifest(minimal({ recipeTypes: [{ layoutKind: 'single_io' }, ritual] }))
    expect(res.data?.typeDecls).toHaveLength(1)
    expect(res.warnings.map((w) => w.field)).toContain('recipeTypes[0].id')
  })

  it('槽位缺 key 只丢槽位；未知 kind 归入 unknown；choice 无来源降为 text', () => {
    const res = parseManifest(
      minimal({
        recipeTypes: [
          {
            id: 'foo:bar',
            layoutKind: 'single_io',
            slots: [
              { displayName: '没 key', kind: 'item' },
              { key: 'weird', kind: 'color_wheel' },
              { key: 'orphan_choice', kind: 'choice' }
            ],
            outputs: [{ key: 'out', kind: 'item' }]
          }
        ]
      })
    )
    const slots = res.data?.typeDecls[0]?.slots ?? []
    expect(slots.map((s) => s.key)).toEqual(['weird', 'orphan_choice'])
    expect(slots[0]?.kind).toBe('unknown')
    expect(slots[1]?.kind).toBe('text')
    expect(res.warnings.map((w) => w.field)).toContain('recipeTypes[0].slots[0].key')
  })

  it('既无槽位也无模板/emitTarget 的空声明被丢弃', () => {
    const res = parseManifest(minimal({ recipeTypes: [{ id: 'foo:bar', layoutKind: 'custom' }] }))
    expect(res.data?.typeDecls).toHaveLength(0)
    expect(res.warnings.some((w) => w.message.includes('对表单无贡献'))).toBe(true)
  })

  it('shaped 的 grid / cells 与修饰符一并解析', () => {
    const res = parseManifest(
      minimal({
        recipeTypes: [
          {
            id: 'create:sequenced_assembly',
            layoutKind: 'sequence',
            emitTarget: 'event.recipes.create.sequenced_assembly',
            grid: { rows: 3, cols: 3, maxRows: 4 },
            cells: [{ key: 'input', row: 0, col: 0 }],
            modifiers: [{ key: 'processingTime', displayName: '耗时', kind: 'number', chain: 'processingTime', min: 1 }],
            requirements: ['需要部署台', { kind: 'structure', text: '需要搅拌机' }]
          }
        ]
      })
    )
    const decl = res.data?.typeDecls[0]
    expect(decl?.grid).toEqual({ rows: 3, cols: 3, maxRows: 4 })
    expect(decl?.cells).toEqual([{ key: 'input', row: 0, col: 0 }])
    expect(decl?.modifiers?.[0]?.key).toBe('processingTime')
    expect(decl?.requirements).toEqual([
      { kind: 'other', text: '需要部署台' },
      { kind: 'structure', text: '需要搅拌机' }
    ])
  })

  it('非法 grid / cells 只忽略并给出字段名', () => {
    const res = parseManifest(
      minimal({
        recipeTypes: [
          { id: 'a:b', layoutKind: 'custom', slots: [{ key: 's', kind: 'item' }], grid: { rows: 'x' }, cells: [{ key: 's' }] }
        ]
      })
    )
    expect(res.data?.typeDecls[0]?.grid).toBeUndefined()
    expect(res.data?.typeDecls[0]?.cells).toBeUndefined()
    expect(res.warnings.map((w) => w.field)).toContain('recipeTypes[0].grid')
  })
})

describe('依赖声明与钩子声明', () => {
  it('mods / kubejsAddon:null / virtualItemPatterns 原样保留', () => {
    const res = parseManifest(minimal({ mods: ['occultism'], kubejsAddon: null, virtualItemPatterns: ['occultism:ritual_dummy/*'] }))
    expect(res.data?.mods).toEqual(['occultism'])
    expect(res.data?.kubejsAddon).toBeNull()
    expect(res.data?.virtualItemPatterns).toEqual(['occultism:ritual_dummy/*'])
  })

  it('kubejsAddon 写成数字时忽略并点名', () => {
    const res = parseManifest(minimal({ kubejsAddon: 7 }))
    expect(res.data?.kubejsAddon).toBeUndefined()
    expect(res.warnings.map((w) => w.field)).toContain('kubejsAddon')
  })

  it('hooks 只接受 .js / .cjs 文件名', () => {
    const res = parseManifest(minimal({ hooks: { 'occultism:ritual': 'ritual.js', 'a:b': 'evil.sh', 'c:d': 5 } }))
    expect(res.data?.hooks).toEqual({ 'occultism:ritual': 'ritual.js' })
    expect(res.warnings.map((w) => w.field)).toContain('hooks.c:d')
  })

  it('顶层拼写错的字段按未知字段警告，不影响加载', () => {
    const res = parseManifest(minimal({ appVerion: '>=1.0.0' }))
    expect(res.data?.appVersion).toBeUndefined()
    expect(res.warnings.map((w) => w.field)).toContain('manifest.appVerion')
  })

  it('完全空的插件给出「不产生任何效果」提醒', () => {
    const res = parseManifest(minimal())
    expect(res.warnings.some((w) => w.message.includes('不产生任何效果'))).toBe(true)
  })
})
