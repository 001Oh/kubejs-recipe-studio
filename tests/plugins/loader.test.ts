/**
 * 插件加载器单测（规格 3.6.14 加载来源 / 健壮性 / 附属联动）。
 * 全部插件写在 os.tmpdir() 自造目录里，绝不碰真实整合包。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { ModpackInfo } from '@shared/types'
import { MODPACK_PLUGIN_DIR } from '@shared/constants'
import {
  checkAppVersion,
  getPluginSchemaOverrides,
  loadPlugins,
  matchesVirtualItem,
  pluginFieldNames,
  pluginHooks,
  pluginValueNames,
  resetPluginLoader,
  setEnabled,
  virtualItemPatterns
} from '../../src/main/plugins/loader'

const root = mkdtempSync(join(tmpdir(), 'krs-plugins-'))

interface Env {
  modpackPath: string
  userDir: string
  put: (origin: 'modpack' | 'user', file: string, body: unknown | string) => void
  info: (over?: Partial<ModpackInfo>) => ModpackInfo
}

function makeEnv(label: string): Env {
  const modpackPath = join(root, label, 'modpack')
  const userDir = join(root, label, 'user')
  mkdirSync(join(modpackPath, MODPACK_PLUGIN_DIR), { recursive: true })
  mkdirSync(userDir, { recursive: true })
  const put = (origin: 'modpack' | 'user', file: string, body: unknown | string): void => {
    const base = origin === 'modpack' ? join(modpackPath, MODPACK_PLUGIN_DIR) : userDir
    mkdirSync(join(base, dirname(file)), { recursive: true })
    writeFileSync(join(base, file), typeof body === 'string' ? body : JSON.stringify(body), 'utf8')
  }
  const info = (over: Partial<ModpackInfo> = {}): ModpackInfo => ({
    path: modpackPath,
    name: label,
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 3,
    detectedFrom: ['test'],
    modsDir: join(modpackPath, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: ['kubejs', 'minecraft'],
    ...over
  })
  return { modpackPath, userDir, put, info }
}

function load(env: Env, info: ModpackInfo | null = null, appVersion = '1.0.0') {
  resetPluginLoader()
  return loadPlugins(env.modpackPath, { userDir: env.userDir, appVersion, modpack: info ?? env.info() })
}

const typeDecl = (id: string, displayName: string): Record<string, unknown> => ({
  id,
  displayName,
  layoutKind: 'multi_io',
  emitTarget: null,
  customTemplate: { type: id },
  slots: [{ key: 'ingredients', displayName: '材料', kind: 'item', multiple: true }]
})

describe('双来源与优先级', () => {
  it('整合包内插件优先于用户目录，并标出来自哪里', () => {
    const env = makeEnv('dual')
    env.put('user', 'shared.json', { id: 'shared', name: '用户级', version: '1.0.0', recipeTypes: [typeDecl('foo:bar', '用户目录版本')] })
    env.put('modpack', 'shared.json', { id: 'shared', name: '整合包级', version: '1.0.0', recipeTypes: [typeDecl('foo:bar', '整合包版本')] })
    const list = load(env)
    expect(list.map((p) => p.origin)).toEqual(['modpack', 'user'])
    expect(getPluginSchemaOverrides().map((s) => s.displayName)).toEqual(['整合包版本'])
  })

  it('目录形态（manifest.json）插件同样被发现，并允许带钩子', () => {
    const env = makeEnv('dirform')
    env.put('modpack', join('occultism', 'manifest.json'), { id: 'occultism-ritual', name: '神秘学', version: '1.0.0', recipeTypes: [typeDecl('occultism:ritual', '仪式')], hooks: { 'occultism:ritual': 'ritual.js' } })
    writeFileSync(join(env.modpackPath, MODPACK_PLUGIN_DIR, 'occultism', 'ritual.js'), 'module.exports = function () { return "ok" }', 'utf8')
    load(env)
    expect(getPluginSchemaOverrides().map((s) => s.id)).toEqual(['occultism:ritual'])
    expect(pluginHooks()).toHaveLength(1)
    expect(pluginHooks()[0]?.file).toBe('ritual.js')
  })

  it('同 type 被两个插件声明：取来源优先级第一个，另一个标为冲突', () => {
    const env = makeEnv('conflict')
    env.put('user', 'a.json', { id: 'a', name: 'A', version: '1.0.0', recipeTypes: [typeDecl('dup:type', '来自 A')] })
    env.put('user', 'b.json', { id: 'b', name: 'B', version: '1.0.0', recipeTypes: [typeDecl('dup:type', '来自 B'), typeDecl('only:b', 'B 独有')] })
    const list = load(env)
    expect(getPluginSchemaOverrides().map((s) => s.displayName).sort()).toEqual(['B 独有', '来自 A'])
    expect(list.find((p) => p.id === 'b')?.coveredTypes).toContain('dup:type')
  })

  it('插件 id 重复时低优先级那份标禁用而不是静默消失', () => {
    const env = makeEnv('dupid')
    env.put('modpack', 'a.json', { id: 'same', name: '本包', version: '1.0.0' })
    env.put('user', 'b.json', { id: 'same', name: '用户', version: '1.0.0' })
    const list = load(env)
    expect(list).toHaveLength(2)
    const loser = list[1]
    expect(loser?.status).toBe('disabled')
    expect(loser?.error).toContain('重复')
  })
})

describe('部分覆盖与词典', () => {
  it('只声明 fieldNames 的插件：不接管类型，但词典生效', () => {
    const env = makeEnv('dictonly')
    env.put('user', 'names.json', { id: 'names', name: '字段词典', version: '1.0.0', fieldNames: { pentacle_id: '法阵等级' } })
    const list = load(env)
    expect(list[0]?.status).toBe('loaded')
    expect(list[0]?.coveredTypes).toHaveLength(0)
    expect(getPluginSchemaOverrides()).toHaveLength(0)
    expect(pluginFieldNames()).toEqual({ pentacle_id: '法阵等级' })
  })

  it('同键词典由高优先级来源占位，低优先级不覆盖', () => {
    const env = makeEnv('dictpriority')
    env.put('modpack', 'm.json', { id: 'm', name: '本包词典', version: '1.0.0', fieldNames: { x: '本包名' }, valueNames: { 'a:v': '本包值' } })
    env.put('user', 'u.json', { id: 'u', name: '用户词典', version: '1.0.0', fieldNames: { x: '用户名', y: '只有用户有' }, valueNames: { 'a:v': '用户值' } })
    load(env)
    expect(pluginFieldNames()).toEqual({ x: '本包名', y: '只有用户有' })
    expect(pluginValueNames()).toEqual({ 'a:v': '本包值' })
  })

  it('choice 槽位用 choicesSource 从 valueNames 取中文标签', () => {
    const env = makeEnv('choices')
    env.put('modpack', 'p.json', {
      id: 'p',
      name: '神秘学',
      version: '1.0.0',
      valueNames: { 'occultism:craft_djinni': '巨灵法阵（Tier 2）', 'occultism:summon_small': '小型使魔法阵（Tier 1）' },
      recipeTypes: [{ id: 'occultism:ritual', layoutKind: 'single_io', emitTarget: null, slots: [{ key: 'pentacle_id', kind: 'choice', choicesSource: 'values:pentacle_id' }] }]
    })
    load(env)
    const slot = getPluginSchemaOverrides()[0]?.slots[0]
    expect(slot?.choices?.map((c) => c.label)).toEqual(['巨灵法阵（Tier 2）', '小型使魔法阵（Tier 1）'])
  })
})

describe('健壮性：不静默消失，也不阻断启动', () => {
  it('manifest 缺 name → failed，错误文案点名 name 字段', () => {
    const env = makeEnv('badmanifest')
    env.put('modpack', 'broken.json', { id: 'broken', version: '1.0.0' })
    const list = load(env)
    expect(list[0]?.status).toBe('failed')
    expect(list[0]?.error).toContain('name：缺少非空字符串 name')
  })

  it('单个插件 JSON 语法错误只影响它自己', () => {
    const env = makeEnv('badjson')
    env.put('modpack', 'oops.json', '{ "id": "oops", "name": ')
    env.put('modpack', 'good.json', { id: 'good', name: '好的', version: '1.0.0', recipeTypes: [typeDecl('ok:type', '可用')] })
    const list = load(env)
    expect(list.map((p) => p.status).sort()).toEqual(['failed', 'loaded'])
    expect(list.find((p) => p.id === 'oops')?.error).toContain('JSON 解析失败')
    expect(getPluginSchemaOverrides().map((s) => s.id)).toEqual(['ok:type'])
  })

  it('appVersion 不兼容显示为不兼容并写明要求，而非从列表消失', () => {
    const env = makeEnv('incompatible')
    env.put('modpack', 'new.json', { id: 'new', name: '需要新程序', version: '2.0.0', appVersion: '>=2.0.0', recipeTypes: [typeDecl('new:type', '新')] })
    env.put('user', 'old.json', { id: 'ok', name: '兼容', version: '1.0.0', appVersion: '>=1.0.0', recipeTypes: [typeDecl('ok:type', '兼容')] })
    const list = load(env)
    const bad = list.find((p) => p.id === 'new')
    expect(bad?.status).toBe('incompatible')
    expect(bad?.error).toContain('需要 app >=2.0.0，当前 1.0.0')
    expect(bad?.coveredTypes).toHaveLength(0)
    expect(getPluginSchemaOverrides().map((s) => s.id)).toEqual(['ok:type'])
  })

  it('依赖模组未安装 → 整包禁用并说明原因', () => {
    const env = makeEnv('missingmod')
    env.put('modpack', 'occ.json', { id: 'occ', name: '神秘学', version: '1.0.0', mods: ['occultism'], recipeTypes: [typeDecl('occultism:ritual', '仪式')] })
    const list = load(env)
    expect(list[0]?.status).toBe('disabled')
    expect(list[0]?.error).toContain('依赖模组未安装：occultism')
    expect(getPluginSchemaOverrides()).toHaveLength(0)
    expect(pluginFieldNames()).toEqual({})
    expect(load(env, env.info({ installedModIds: ['kubejs', 'occultism'] }))[0]?.status).toBe('loaded')
  })

  it('setEnabled 关闭后从类型与词典中撤出，打开即恢复', () => {
    const env = makeEnv('toggle')
    env.put('modpack', 't.json', { id: 't', name: '可开关', version: '1.0.0', fieldNames: { k: '值' }, recipeTypes: [typeDecl('t:type', 'T')] })
    load(env)
    expect(getPluginSchemaOverrides()).toHaveLength(1)
    const off = setEnabled('t', false)
    expect(off[0]?.status).toBe('disabled')
    expect(off[0]?.error).toBe('已在插件管理页关闭')
    expect(getPluginSchemaOverrides()).toHaveLength(0)
    expect(pluginFieldNames()).toEqual({})
    expect(setEnabled('t', true)[0]?.status).toBe('loaded')
    expect(pluginFieldNames()).toEqual({ k: '值' })
  })
})

describe('与附属模组检测联动', () => {
  const createPlugin = (env: Env): void => {
    env.put('modpack', 'create.json', {
      id: 'create-extra',
      name: 'Create 语法糖',
      version: '1.0.0',
      kubejsAddon: 'kubejs_create',
      recipeTypes: [{ id: 'create:mixing', displayName: '搅拌', layoutKind: 'multi_io', emitTarget: 'event.recipes.create.mixing', slots: [{ key: 'ingredients', kind: 'item', multiple: true }] }]
    })
  }

  it('附属已装 → 语法糖通道', () => {
    const env = makeEnv('addon-ok')
    createPlugin(env)
    load(env, env.info({ kubejsAddons: ['kubejs_create'] }))
    const schema = getPluginSchemaOverrides()[0]
    expect(schema?.channel).toBe('kubejs-sugar')
    expect(schema?.capability).toBe('sugar')
  })

  it('附属未装 → 自动降级数据包 JSON 并把提示写进插件列表', () => {
    const env = makeEnv('addon-missing')
    createPlugin(env)
    const list = load(env, env.info({ installedModIds: ['kubejs', 'create'] }))
    const schema = getPluginSchemaOverrides()[0]
    expect(schema?.channel).toBe('datapack-json')
    expect(schema?.capabilityNote).toBe('因未安装 KubeJS Create，已切换为数据包模式')
    expect(schema?.notes).toContain('因未安装 KubeJS Create，已切换为数据包模式')
    expect(list[0]?.status).toBe('loaded')
    expect(list[0]?.error).toContain('因未安装 KubeJS Create，已切换为数据包模式')
  })

  it('无语法糖目标但有 customTemplate → event.custom', () => {
    const env = makeEnv('custom')
    env.put('user', 'c.json', { id: 'c', name: 'C', version: '1.0.0', recipeTypes: [{ id: 'x:y', layoutKind: 'single_io', emitTarget: null, customTemplate: { type: 'x:y' }, slots: [{ key: 'a', kind: 'item' }] }] })
    load(env)
    expect(getPluginSchemaOverrides()[0]?.channel).toBe('event-custom')
    expect(getPluginSchemaOverrides()[0]?.capability).toBe('compatible')
  })
})

describe('虚拟物品过滤规则', () => {
  it('occultism:ritual_dummy/* 命中前缀下全部物品，其它不误伤', () => {
    const env = makeEnv('virtual')
    env.put('modpack', 'v.json', { id: 'v', name: 'V', version: '1.0.0', virtualItemPatterns: ['occultism:ritual_dummy/*'] })
    load(env)
    expect(virtualItemPatterns()).toEqual(['occultism:ritual_dummy/*'])
    expect(matchesVirtualItem('occultism:ritual_dummy/greater_ritual')).toBe(true)
    expect(matchesVirtualItem('OCCULTISM:RITUAL_DUMMY/craft_djinni')).toBe(true)
    expect(matchesVirtualItem('occultism:ritual_dummy')).toBe(false)
    expect(matchesVirtualItem('occultism:ritual')).toBe(false)
    expect(matchesVirtualItem('create:ritual_dummy/x')).toBe(false)
  })

  it('关闭插件后其虚拟物品规则一并失效', () => {
    const env = makeEnv('virtual-off')
    env.put('modpack', 'v.json', { id: 'v2', name: 'V2', version: '1.0.0', virtualItemPatterns: ['foo:bar/*'] })
    load(env)
    expect(matchesVirtualItem('foo:bar/z')).toBe(true)
    setEnabled('v2', false)
    expect(matchesVirtualItem('foo:bar/z')).toBe(false)
  })
})

describe('最小 semver（appVersion 范围）', () => {
  const cases: { range: string; current: string; ok: boolean }[] = [
    { range: '>=1.0.0', current: '1.2.0', ok: true },
    { range: '>=1.0.0', current: '0.9.0', ok: false },
    { range: '^1.2.0', current: '1.9.0', ok: true },
    { range: '^1.2.0', current: '2.0.0', ok: false },
    { range: '^0.2.3', current: '0.2.9', ok: true },
    { range: '^0.2.3', current: '0.3.0', ok: false },
    { range: '~1.2.3', current: '1.2.9', ok: true },
    { range: '~1.2.3', current: '1.3.0', ok: false },
    { range: '1.2.0', current: '1.2.0', ok: true },
    { range: '1.2', current: '1.2.7', ok: true },
    { range: '>=1.0.0 <2.0.0', current: '1.5.0', ok: true },
    { range: '>=1.0.0 <2.0.0', current: '2.1.0', ok: false },
    { range: '1.0.0 || >=3.0.0', current: '3.1.0', ok: true },
    { range: '*', current: '9.9.9', ok: true },
    { range: '>=1.0.0', current: '1.0.0-beta.1', ok: false }
  ]
  it.each(cases)('$range 对 $current → $ok', ({ range, current, ok }) => {
    expect(checkAppVersion(range, current).compatible).toBe(ok)
  })

  it('范围写错时不放过：incompatible 并说明无法解析', () => {
    const verdict = checkAppVersion('=>1.0.0', '1.0.0')
    expect(verdict.compatible).toBe(false)
    expect(verdict.reason).toContain('无法解析')
  })

  it('当前版本取不到（非 Electron 环境）时不做兼容判定', () => {
    expect(checkAppVersion('>=9.0.0', '').compatible).toBe(true)
  })
})
