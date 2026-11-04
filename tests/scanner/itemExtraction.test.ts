import { describe, expect, it } from 'vitest'
import type { ZipEntryInfo } from '@main/scanner/zip'
import { scanJarEntries } from '@main/scanner/itemRules'
import { displayName } from '@shared/itemName'
import { parseAssetEntry, resolveIcon } from '@main/scanner/iconResolve'
import { fakePng } from '../helpers/zipWriter'

function entry(name: string): ZipEntryInfo {
  return { fileName: name, uncompressedSize: 100 }
}

function harness(files: Record<string, string | Buffer>): {
  entries: ZipEntryInfo[]
  read: (name: string) => Buffer | undefined
} {
  const entries = Object.keys(files).map(entry)
  return {
    entries,
    read: (name) => {
      const value = files[name]
      if (value === undefined) return undefined
      return typeof value === 'string' ? Buffer.from(value, 'utf8') : value
    }
  }
}

describe('物品 ID 提取（规格 3.2 源 A）', () => {
  it('lang 的 item./block. 键、模型与贴图求并集，置信度按层级', () => {
    const h = harness({
      'assets/mymod/lang/zh_cn.json': JSON.stringify({
        'item.mymod.ruby': '红宝石',
        'block.mymod.ruby_block': '红宝石块',
        'itemGroup.mymod': '不该出现',
        'item.mod.mymod.name': '也不是物品',
        'item.kubejs.something': 'KubeJS 元数据'
      }),
      'assets/mymod/lang/en_us.json': JSON.stringify({ 'item.mymod.ruby': 'Ruby' }),
      'assets/mymod/models/item/model_only.json': JSON.stringify({ parent: 'item/generated' }),
      'assets/mymod/textures/item/texture_only.png': fakePng()
    })
    const result = scanJarEntries(h.entries, h.read)
    const byId = new Map(result.items.map((i) => [i.id, i]))
    expect([...byId.keys()].sort()).toEqual([
      'mymod:model_only',
      'mymod:ruby',
      'mymod:ruby_block',
      'mymod:texture_only'
    ])
    expect(byId.get('mymod:ruby')?.confidence).toBe('lang')
    expect(byId.get('mymod:ruby_block')?.confidence).toBe('block')
    expect(byId.get('mymod:model_only')?.confidence).toBe('model')
    expect(byId.get('mymod:texture_only')?.confidence).toBe('texture')
    expect(byId.get('mymod:ruby')?.nameZh).toBe('红宝石')
    expect(byId.get('mymod:ruby')?.nameEn).toBe('Ruby')
  })

  it('排除 debug_ / _overlay / _layer，但保留 _spawn_egg', () => {
    const h = harness({
      'assets/mymod/lang/zh_cn.json': JSON.stringify({
        'item.mymod.debug_tool': '调试',
        'item.mymod.thing_overlay': '覆盖层',
        'item.mymod.thing_layer': '图层',
        'item.mymod.cow_spawn_egg': '牛刷怪蛋'
      })
    })
    const ids = scanJarEntries(h.entries, h.read).items.map((i) => i.id)
    expect(ids).toEqual(['mymod:cow_spawn_egg'])
  })

  it('缺中文名时 nameZh 保持为空、名字落 nameEn（第 116 批 A-3）；两者都缺时用 path 转可读形式', () => {
    const h = harness({
      'assets/mymod/lang/en_us.json': JSON.stringify({ 'item.mymod.only_en': 'Only English' }),
      'assets/mymod/textures/item/no_name_thing.png': fakePng()
    })
    const result = scanJarEntries(h.entries, h.read)
    const onlyEn = result.items.find((i) => i.id === 'mymod:only_en')
    const noName = result.items.find((i) => i.id === 'mymod:no_name_thing')
    // 旧契约把英文名塞进 nameZh（"中文名污染"）；新契约只让中文语系 + CJK 进 nameZh
    expect(onlyEn?.nameZh).toBe('')
    expect(onlyEn?.nameEn).toBe('Only English')
    expect(displayName(onlyEn!)).toBe('Only English')
    expect(noName?.nameZh).toBe('')
    expect(noName?.nameEn).toBe('No name thing')
    expect(result.missingZh).toBe(2)
  })

  it('虚拟物品沿用 isVirtualItem 规则（ritual_dummy 与 jei_ 路径）', () => {
    const h = harness({
      'assets/mymod/lang/zh_cn.json': JSON.stringify({
        'item.mymod.ritual_dummy_x': '仪式假物',
        'item.mymod.jei_dummy/y': 'JEI 假物',
        'item.mymod.real_gem': '真宝石'
      })
    })
    const byId = new Map(scanJarEntries(h.entries, h.read).items.map((i) => [i.id, i]))
    expect(byId.get('mymod:ritual_dummy_x')?.virtual).toBe(true)
    expect(byId.get('mymod:jei_dummy/y')?.virtual).toBe(true)
    expect(byId.get('mymod:real_gem')?.virtual).toBe(false)
  })
})

describe('贴图定位（规格 3.2 图标链）', () => {
  const texture = fakePng()

  it('优先 textures/item，其次 textures/block', () => {
    const h = harness({
      'assets/mymod/textures/item/gem.png': texture,
      'assets/mymod/textures/block/gem.png': texture
    })
    expect(resolveIcon('mymod:gem', new Set(h.entries.map((e) => e.fileName)), h.read).entry).toBe(
      'assets/mymod/textures/item/gem.png'
    )
    const onlyBlock = harness({ 'assets/mymod/textures/block/ore.png': texture })
    expect(resolveIcon('mymod:ore', new Set(onlyBlock.entries.map((e) => e.fileName)), onlyBlock.read).entry).toBe(
      'assets/mymod/textures/block/ore.png'
    )
  })

  it('模型 textures.layer0 指向别处时按命名空间拼接', () => {
    const h = harness({
      'assets/mymod/models/item/fancy.json': JSON.stringify({ textures: { layer0: 'mymod:item/shared_gem' } }),
      'assets/mymod/textures/item/shared_gem.png': texture
    })
    const hit = resolveIcon('mymod:fancy', new Set(h.entries.map((e) => e.fileName)), h.read)
    expect(hit.entry).toBe('assets/mymod/textures/item/shared_gem.png')
    expect(hit.depth).toBe(1)
  })

  it('parent 链最多 3 层；原版父模型（item/generated）到此为止', () => {
    const h = harness({
      'assets/mymod/models/item/child.json': JSON.stringify({ parent: 'mymod:item/base' }),
      'assets/mymod/models/item/base.json': JSON.stringify({ textures: { all: 'mymod:block/base_tex' } }),
      'assets/mymod/textures/block/base_tex.png': texture,
      'assets/mymod/models/item/vanilla.json': JSON.stringify({ parent: 'item/generated' })
    })
    const set = new Set(h.entries.map((e) => e.fileName))
    const child = resolveIcon('mymod:child', set, h.read)
    expect(child.entry).toBe('assets/mymod/textures/block/base_tex.png')
    expect(child.depth).toBe(2)
    expect(resolveIcon('mymod:vanilla', set, h.read).entry).toBeNull()
  })

  it('四条链路都没有结果时返回 null，由上层计入占位比例', () => {
    const h = harness({ 'assets/mymod/lang/zh_cn.json': '{}' })
    expect(resolveIcon('mymod:nothing', new Set(h.entries.map((e) => e.fileName)), h.read).entry).toBeNull()
  })

  it('parseAssetEntry 能区分 lang / model / 两类贴图，其它条目返回 null', () => {
    expect(parseAssetEntry('assets/a/lang/zh_cn.json')?.kind).toBe('lang')
    expect(parseAssetEntry('assets/a/models/item/x.json')?.kind).toBe('model')
    expect(parseAssetEntry('assets/a/textures/item/x.png')?.kind).toBe('itemTexture')
    expect(parseAssetEntry('assets/a/textures/block/x.png')?.kind).toBe('blockTexture')
    expect(parseAssetEntry('data/a/recipes/x.json')).toBeNull()
  })
})
