/** KubeJS 脚本静态解析单测：字面量提取、partial 分支、语法错误兜底。 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { cleanupTmp } from '../helpers/cleanup'

// logger 间接 import electron：node 环境下用空壳顶掉，日志落盘指向项目内 .vitest-tmp
vi.mock('electron', () => ({ app: { getPath: () => `${process.cwd()}/.vitest-tmp/scriptSource` } }))

import { parseKubejsScript } from '../../src/main/recipes/scriptSource'

afterAll(() => {
  cleanupTmp(`${process.cwd()}/.vitest-tmp/scriptSource`)
})

const wrap = (body: string): string => `ServerEvents.recipes(event => {\n${body}\n})`

describe('事件方法识别', () => {
  it('event.shaped：产出 2x 前缀 + pattern×key 展开', () => {
    const hits = parseKubejsScript(
      wrap(`event.shaped('2x minecraft:cake', ['ABA', 'B B'], { A: 'minecraft:wheat', B: 'minecraft:egg' })`),
      'server_scripts/cake.js'
    )
    expect(hits).toHaveLength(1)
    const h = hits[0]!
    expect(h.type).toBe('minecraft:crafting_shaped')
    expect(h.result.partial).toBe(false)
    expect(h.result.outputs).toEqual([{ id: 'minecraft:cake', count: 2, kind: 'item' }])
    expect(h.result.inputs).toHaveLength(5) // A×2 + B×3（空格跳过）
  })

  it('event.shapeless：产物 + 材料列表', () => {
    const hits = parseKubejsScript(
      wrap(`event.shapeless('minecraft:bread', ['minecraft:wheat', '2x minecraft:sugar'])`),
      'server_scripts/bread.js'
    )
    const h = hits[0]!
    expect(h.type).toBe('minecraft:crafting_shapeless')
    expect(h.result.partial).toBe(false)
    expect(h.result.outputs[0]?.id).toBe('minecraft:bread')
    const sugar = h.result.inputs.find((i) => i.id === 'minecraft:sugar')
    expect(sugar?.count).toBe(2)
  })

  it('event.smelting / blasting 等炉类方法', () => {
    const hits = parseKubejsScript(wrap(`event.smelting('minecraft:glass', 'minecraft:sand')`), 's.js')
    const h = hits[0]!
    expect(h.type).toBe('minecraft:smelting')
    expect(h.result.outputs[0]?.id).toBe('minecraft:glass')
    expect(h.result.inputs[0]?.id).toBe('minecraft:sand')
    expect(h.result.partial).toBe(false)
  })

  it('event.recipes.<ns>.<method>：位置参数（Create 搅拌）', () => {
    const hits = parseKubejsScript(
      wrap(`event.recipes.create.mixing('2x create:crushed_raw_osmium', ['minecraft:raw_osmium'])`),
      'mix.js'
    )
    const h = hits[0]!
    expect(h.type).toBe('create:mixing')
    expect(h.result.outputs[0]).toMatchObject({ id: 'create:crushed_raw_osmium', count: 2 })
    expect(h.result.inputs[0]?.id).toBe('minecraft:raw_osmium')
    expect(h.result.partial).toBe(false)
  })

  it('event.recipes.<ns>：对象字面量参数按数据 JSON 解析', () => {
    const hits = parseKubejsScript(
      wrap(`event.recipes.mymod.process({ type: 'mymod:process', input: { item: 'a:b' }, output: { item: 'c:d' } })`),
      'obj.js'
    )
    const h = hits[0]!
    expect(h.type).toBe('mymod:process')
    expect(h.result.outputs[0]?.id).toBe('c:d')
    expect(h.result.inputs[0]?.id).toBe('a:b')
    expect(h.result.partial).toBe(false)
  })

  it('event.custom：内联 JSON 提取', () => {
    const hits = parseKubejsScript(
      wrap(`event.custom('minejs:thing', { type: 'somemod:process', ingredient: { tag: 'forge:ores' }, result: 'somemod:bar' })`),
      'custom.js'
    )
    const h = hits[0]!
    expect(h.type).toBe('somemod:process')
    expect(h.result.outputs[0]?.id).toBe('somemod:bar')
    expect(h.result.inputs[0]).toMatchObject({ id: 'forge:ores', kind: 'tag' })
  })
})

describe('动态逻辑 → partial，只记已解析部分', () => {
  it('key 引用变量：产物仍入索引，配方标 partial', () => {
    const hits = parseKubejsScript(
      wrap(`const press = itemById('ae2:press')\nevent.shaped('minecraft:gold_ingot', ['AAA'], { A: press })`),
      'dyn.js'
    )
    const h = hits[0]!
    expect(h.result.partial).toBe(true)
    expect(h.result.outputs).toEqual([{ id: 'minecraft:gold_ingot', count: 1, kind: 'item' }])
  })

  it('模板字符串插值 → partial', () => {
    const hits = parseKubejsScript(wrap('event.shapeless(`minecraft:${suffix}`, [\'a:b\'])'), 'tpl.js')
    const h = hits[0]!
    expect(h.result.partial).toBe(true)
    expect(h.result.outputs).toHaveLength(0)
    expect(h.result.inputs.map((i) => i.id)).toContain('a:b')
  })

  it('函数调用产物 → partial 且保留输入', () => {
    const hits = parseKubejsScript(wrap(`event.smelting(makeOutput(), 'minecraft:raw_copper')`), 'fn.js')
    const h = hits[0]!
    expect(h.result.partial).toBe(true)
    expect(h.result.inputs[0]?.id).toBe('minecraft:raw_copper')
  })

  it('同一脚本多个调用：分别成条', () => {
    const hits = parseKubejsScript(
      wrap(`event.shapeless('a:x', ['b:y'])\nevent.shapeless('c:z', ['d:w'])`),
      'multi.js'
    )
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.index)).toEqual([0, 1])
  })

  it('非配方调用（event.remove / event.forEachRecipe）不产出记录', () => {
    const hits = parseKubejsScript(
      wrap(`event.remove({ output: 'minecraft:dirt' })\nevent.forEachRecipe({ type: 'minecraft:smelting' }, (recipe) => {})\nconsole.log('x')`),
      'remove.js'
    )
    expect(hits).toHaveLength(0)
  })
})

describe('失败兜底', () => {
  it('语法错误脚本：返回空数组不抛错（WARN 已记）', () => {
    expect(parseKubejsScript('event.shaped((( broken', 'broken.js')).toEqual([])
  })

  it('空脚本', () => {
    expect(parseKubejsScript('', 'empty.js')).toEqual([])
  })
})
