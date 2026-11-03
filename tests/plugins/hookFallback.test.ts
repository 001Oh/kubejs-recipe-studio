/**
 * RV1-005 / RV1-006 的**回退路径**覆盖（T-10 ⑤）。
 *
 * ## 为什么不能沿用 `hookBlacklist.test.ts:124` 那条用例
 * `stripLiteralsAndComments` 只在 **acorn 词法器抛错**时才回退到字符扫描；而 `tokenizer`
 * 只做**词法**分析——`function ( {` 这类**语法**错误它不会抛。因此那条题为
 * "语法非法的源码回退到字符扫描"的用例，实际走的是**主路径**（它只断言 `not.toThrow()`，
 * 所以主路径也能通过）。要真正进入回退路径，输入必须含**词法**错误（本例用未闭合字符串）。
 *
 * ## 本文件怎么证明"确实走了回退路径"
 * 用**同一段文本、只差一个未闭合引号**做对照：
 *   - 主路径（引号闭合）→ `['require']`
 *   - 回退路径（引号未闭合）→ `[]`（RV1-005 的假阴性被复现）
 * 两条断言放在一起，差异只能由"走了不同路径"解释——这就是路径证据，而不是靠注释声称。
 *
 * ## 为什么断言的是"当前行为"而不是"修复后的行为"
 * 回退只在源码**过不了词法分析**时发生，这类源码也不可能被编译执行；沙箱的真实边界是
 * `vm` + `codeGeneration` 限制，黑名单只是第二道防线。因此这里的缺陷只影响**诊断质量**，
 * 不影响安全性。按"不得为了让测试变绿而降低标准"的反面同理：也不应为了让测试看起来
 * 漂亮而假定它已修好。若将来改进字符扫描，这两条断言会变红——那是有意的，改动必须被显式确认。
 */
import { describe, expect, it } from 'vitest'
import { inspectHookSource } from '@main/plugins/hookSandbox'

/** 词法错误：末尾字符串未闭合 → acorn 词法器抛错 → 进入字符扫描回退 */
const LEX_ERR_SUFFIX = " var s = 'abc"

const regexFallback = `var re = /[/*]/; require('fs');${LEX_ERR_SUFFIX}`
const regexMainPath = "var re = /[/*]/; require('fs'); var s = 'abc'"

const templateFallback = `var t = \`a\${\`b\${require("fs")}\`}\`;${LEX_ERR_SUFFIX}`
const templateMainPath = 'var t = `a${`b${require("fs")}`}`; var s = \'x\''

describe('RV1-005 / RV1-006：字符扫描回退路径的实际行为', () => {
  it('RV1-005（回退）：正则字面量之后的 require 会被吞掉——与主路径对照可证走了回退路径', () => {
    // 主路径：同一个正则，require 被正常检出
    expect(inspectHookSource(regexMainPath)).toContain('require')
    // 回退路径：`/[/*]/` 中的 `/*` 被当成块注释起点，其后内容全部被吞 → 漏检
    expect(inspectHookSource(regexFallback)).toEqual([])
  })

  it('RV1-006（回退）：嵌套模板不产生假阴性，但字符串边界处理不当会多判（主路径无此问题）', () => {
    // 主路径：只报 require（字符串里的 fs 被正确丢弃）
    expect(inspectHookSource(templateMainPath)).toEqual(['require'])
    // 回退路径：require 仍被检出（不产生假阴性），但字符串内的 fs 泄漏成了命中项
    const hits = inspectHookSource(templateFallback)
    expect(hits).toContain('require')
    expect(hits).toContain('fs')
  })
})
