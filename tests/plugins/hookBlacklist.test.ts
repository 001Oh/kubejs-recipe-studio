/**
 * BUG-HUNT-02：钩子沙箱静态黑名单的**误伤**行为（BH-008）。
 *
 * 背景：`inspectHookSource()` 直接对**源文件原文**跑禁用词正则，不区分代码、注释与字符串。
 * 于是一段完全合法的钩子只要在注释里写了英文单词 `import` / `fs`，或在字符串里出现
 * `'require'`，就会被判定为「使用了被禁用的能力」而拒绝执行——错误信息还指向一个源码里
 * 根本不存在的调用，插件作者无法自助排查。
 *
 * 本文件同时锁定「不能因此放宽真正的逃逸检测」：真实的 `require(...)` / `process.` /
 * `new Function(...)` / 模板插值里的调用必须继续被拦下。
 */
import { describe, expect, it } from 'vitest'
import { inspectHookSource, stripLiteralsAndComments } from '../../src/main/plugins/hookSandbox'

describe('hookSandbox 黑名单：不得误伤注释与字符串', () => {
  it('注释里出现 import / process / fs 不算违规', () => {
    const source = `
      // import the ingredients into the result
      /* process them, read fs if needed */
      module.exports = function (recipe) { return 'ok' }
    `
    expect(inspectHookSource(source)).toEqual([])
  })

  it('字符串字面量里出现 require / eval 不算违规', () => {
    const source = `
      module.exports = function (recipe) {
        var note = 'require(eval) is not allowed'
        return note
      }
    `
    expect(inspectHookSource(source)).toEqual([])
  })

  it('字符串里出现 fs / Buffer / Symbol 不算违规（常见字段名与提示文案）', () => {
    const source = `
      module.exports = function (recipe) {
        return fieldName('fs') + valueName('Buffer') + 'Symbol'
      }
    `
    expect(inspectHookSource(source)).toEqual([])
  })

  it('真实的 require 调用必须继续被拦下', () => {
    const source = "module.exports = function () { return require('fs').readFileSync('x') }"
    expect(inspectHookSource(source)).toContain('require')
  })

  it('真实的 process 访问必须继续被拦下', () => {
    const source = 'module.exports = function () { return process.env.HOME }'
    expect(inspectHookSource(source)).toContain('process')
  })

  it('new Function 必须继续被拦下', () => {
    const source = 'module.exports = function () { return new Function("return 1")() }'
    expect(inspectHookSource(source)).toContain('Function')
  })

  it('模板字符串插值里的调用也必须被拦下（不能靠反引号绕过）', () => {
    const source = 'module.exports = function () { return `${require("fs")}` }'
    expect(inspectHookSource(source)).toContain('require')
  })

  it('__proto__ 访问必须继续被拦下', () => {
    const source = 'module.exports = function (o) { return o.__proto__ }'
    expect(inspectHookSource(source)).toContain('__proto__')
  })
})

describe('stripLiteralsAndComments', () => {
  it('去掉注释与字符串，但保留代码标识符', () => {
    const out = stripLiteralsAndComments("a // hidden\nb /* hidden */ c 'hidden' d")
    expect(out).toContain('a')
    expect(out).toContain('b')
    expect(out).toContain('c')
    expect(out).toContain('d')
    expect(out).not.toContain('hidden')
  })

  it('保留模板插值内容', () => {
    const out = stripLiteralsAndComments('x = `head ${danger} tail`')
    expect(out).toContain('danger')
    expect(out).not.toContain('head')
  })

  it('转义引号不会提前结束字符串', () => {
    const out = stripLiteralsAndComments("a = 'it\\'s fine' ; b")
    expect(out).toContain('a')
    expect(out).toContain('b')
    expect(out).not.toContain('fine')
  })

  it('未闭合的注释不会整体崩溃', () => {
    expect(() => stripLiteralsAndComments('a /* never ends')).not.toThrow()
  })
})

describe('RV1-005 / RV1-006：正则字面量与嵌套模板', () => {
  it('含 /* 的正则字面量不得吞掉后续代码：真实 require 仍被拦下', () => {
    const source = "var re = /[/*]/; module.exports = function () { return require('fs').readFileSync('x') }"
    expect(inspectHookSource(source)).toContain('require')
  })

  it('正则字面量里的禁用词不算违规（正则不是代码）', () => {
    const source = "var re = /import|process|fs/; module.exports = function () { return 'ok' }"
    expect(inspectHookSource(source)).toEqual([])
  })

  it('嵌套模板插值里的调用仍被拦下', () => {
    const source = 'module.exports = function () { return `a${`b${require("fs")}`}` }'
    expect(inspectHookSource(source)).toContain('require')
  })

  it('插值里出现含 "}" 的字符串，不影响其后的代码检查', () => {
    const source = 'module.exports = function (o) { return `x${o["}"]}y` }; var z = require("fs")'
    expect(inspectHookSource(source)).toContain('require')
  })

  it('除号不会被误当成正则起点', () => {
    const source = 'module.exports = function (a, b) { return a / b }'
    expect(inspectHookSource(source)).toEqual([])
  })

  it('语法非法的源码回退到字符扫描，且不抛错', () => {
    const source = 'module.exports = function ( { return 1'
    expect(() => inspectHookSource(source)).not.toThrow()
  })
})
