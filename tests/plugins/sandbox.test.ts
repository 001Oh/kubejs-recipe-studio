/**
 * JS 钩子沙箱单测（规格 3.6.14 安全约束：Node vm + 白名单 API + 禁 require/fs/网络 + 1s 超时）。
 * 顺带验证「纯 JSON 插件绝不执行代码」这条路。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { ModpackInfo } from '@shared/types'
import { MODPACK_PLUGIN_DIR } from '@shared/constants'
import { loadPlugins, pluginHooks, resetPluginLoader } from '../../src/main/plugins/loader'
import { HOOK_TIMEOUT_MS, inspectHookSource, resolveHookPath, runEmitHook, runHookSource } from '../../src/main/plugins/hookSandbox'

const root = mkdtempSync(join(tmpdir(), 'krs-hook-'))

function hookEnv(name: string, source: string): { pluginId: string; dir: string; file: string } {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  const file = `${name}.js`
  writeFileSync(join(dir, file), source, 'utf8')
  return { pluginId: name, dir, file }
}

const baseInput = {
  typeId: 'occultism:ritual',
  values: { activation_item: { id: 'occultism:ritual', count: 1 }, pentacle_id: 'occultism:craft_djinni' },
  modifiers: { maxTimes: 3 },
  fieldNames: { pentacle_id: '法阵等级' },
  valueNames: { 'occultism:craft_djinni': '巨灵法阵（Tier 2）' }
}

describe('沙箱内可用的白名单 API', () => {
  it('module.exports 函数拿到 recipe 与助手，返回代码文本', () => {
    const loc = hookEnv(
      'sugar',
      `module.exports = function (recipe) {
        var lines = []
        lines.push('event.recipes.occultism.ritual(' + quote(recipe.values.activation_item.id) + ')')
        lines.push('  .require_sacrifice(' + recipe.values.pentacle_id + ')')
        lines.push('  // ' + fieldName('pentacle_id') + '=' + valueName(recipe.values.pentacle_id))
        lines.push('  .with(' + JSON.stringify(item('occultism:spirit_request', 2)) + ')')
        return list(lines, '\\n')
      }`
    )
    const out = runEmitHook(loc, baseInput)
    expect(out.ok).toBe(true)
    expect(out.code).toContain('event.recipes.occultism.ritual("occultism:ritual")')
    expect(out.code).toContain('法阵等级=巨灵法阵（Tier 2）')
    expect(out.code).toContain('"count":2')
  })

  it('exports.emit 写法同样可用', () => {
    const loc = hookEnv('emit', 'exports.emit = function (recipe) { return "type=" + recipe.typeId }')
    expect(runEmitHook(loc, baseInput).code).toBe('type=occultism:ritual')
  })

  it('沙箱里拿不到宿主对象：require / process / globalThis 全被静态拒绝', () => {
    expect(inspectHookSource("require('fs')")).toContain('require')
    expect(inspectHookSource('process.exit(1)')).toContain('process')
    expect(inspectHookSource('globalThis.x = 1')).toContain('globalThis')
    expect(inspectHookSource('const p = {}.constructor.prototype')).toEqual(expect.arrayContaining(['constructor', 'prototype']))
    expect(inspectHookSource('new Function("return 1")()')).toContain('Function')
    expect(inspectHookSource('import("node:fs")')).toContain('import')
    expect(inspectHookSource('fetch("http://x")')).toContain('fetch')
    expect(inspectHookSource('')).toEqual([])
  })

  it('钩子里 require("fs") 直接被拒，不进入执行', () => {
    const out = runHookSource({ pluginId: 'evil', dir: root, file: 'evil.js' }, "const fs = require('fs'); module.exports = function () { return fs.readFileSync('/etc/passwd') }", baseInput)
    expect(out.ok).toBe(false)
    expect(out.error).toContain('require')
    expect(out.error).toContain('沙箱只允许纯数据变换')
  })

  it('eval / new Function 这类字符串代码生成被禁', () => {
    expect(runHookSource({ pluginId: 'e', dir: root, file: 'e.js' }, 'eval("1"); module.exports = function () { return "x" }', baseInput).error).toContain('eval')
    expect(runHookSource({ pluginId: 'f', dir: root, file: 'f.js' }, 'module.exports = function () { return Function("return 1")() }', baseInput).error).toContain('Function')
  })
})

describe('超时与用法错误', () => {
  it('死循环钩子被 1 秒超时强杀', () => {
    const started = Date.now()
    const out = runHookSource({ pluginId: 'loop', dir: root, file: 'loop.js' }, 'module.exports = function () { var i = 0; while (true) { i++ } }', baseInput)
    expect(out.ok).toBe(false)
    expect(out.error).toContain(`执行超过 ${HOOK_TIMEOUT_MS}ms，已被强制终止`)
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('钩子必须导出函数，且返回值必须是字符串', () => {
    expect(runHookSource({ pluginId: 'nofn', dir: root, file: 'nofn.js' }, 'var x = 1', baseInput).error).toContain('钩子必须导出函数')
    const num = runHookSource({ pluginId: 'num', dir: root, file: 'num.js' }, 'module.exports = function () { return 42 }', baseInput)
    expect(num.ok).toBe(false)
    expect(num.error).toContain('钩子必须返回字符串代码')
    const forgotten = runHookSource({ pluginId: 'voidfn', dir: root, file: 'void.js' }, 'module.exports = function () { }', baseInput)
    expect(forgotten.error).toContain('忘了 return')
  })

  it('抛异常的钩子只回错，不把主进程带崩', () => {
    const out = runHookSource({ pluginId: 'boom', dir: root, file: 'boom.js' }, 'module.exports = function () { throw new Error("模板缺字段") }', baseInput)
    expect(out.ok).toBe(false)
    expect(out.error).toContain('模板缺字段')
  })
})

describe('钩子文件位置约束', () => {
  it('拒绝逃出插件目录的路径与非 js 文件', () => {
    expect(resolveHookPath({ pluginId: 'p', dir: root, file: '../evil.js' }).ok).toBe(false)
    expect(resolveHookPath({ pluginId: 'p', dir: root, file: 'hook.sh' })).toEqual({ ok: false, error: expect.stringContaining('.js / .cjs') })
    expect(resolveHookPath({ pluginId: 'p', dir: root, file: 'nested/hook.js' }).ok).toBe(true)
  })

  it('读不到的钩子文件只记 WARN 并返回错误', () => {
    const out = runEmitHook({ pluginId: 'ghost', dir: root, file: 'ghost.js' }, baseInput)
    expect(out.ok).toBe(false)
    expect(out.error).toContain('钩子文件读取失败')
  })

  it('纯 JSON 插件（没写 hooks）不会进入钩子链路', () => {
    const modpackPath = join(root, 'pack')
    const pluginDir = join(modpackPath, MODPACK_PLUGIN_DIR)
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(
      join(pluginDir, 'jsononly.json'),
      JSON.stringify({ id: 'jsononly', name: '纯 JSON', version: '1.0.0', hooks: { 'x:y': 'note.txt' }, recipeTypes: [{ id: 'x:y', layoutKind: 'single_io', emitTarget: null, slots: [{ key: 'a', kind: 'item' }] }] }),
      'utf8'
    )
    const info: ModpackInfo = {
      path: modpackPath, name: 'pack', mcVersion: '1.20.1', loader: 'forge', loaderVersion: null, kubejsVersion: null,
      modCount: 1, detectedFrom: ['test'], modsDir: join(modpackPath, 'mods'), hasKubejs: true, kubejsAddons: [], installedModIds: ['kubejs']
    }
    resetPluginLoader()
    loadPlugins(modpackPath, { userDir: null, appVersion: '1.0.0', modpack: info })
    expect(pluginHooks()).toHaveLength(0)
  })
})
