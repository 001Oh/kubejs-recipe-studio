/**
 * P3-19：内置名表卫生——BUILTIN_FIELD_NAMES / BUILTIN_VALUE_NAMES 的标签不得带
 * 前导空格（naming.ts 原有两处：' refined 黑曜石（INF）' 与 ' Smoking'，
 * 会以「[space]Smoking」形态直接渲染进下拉与徽标）。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_FIELD_NAMES, BUILTIN_VALUE_NAMES, displayNameForValue } from '../../src/main/schema/naming'

describe('P3-19 内置名表不得带前导/尾随空白', () => {
  it('两张内置名表的每个标签都无前导/尾随空白', () => {
    for (const [table, entries] of [
      ['BUILTIN_FIELD_NAMES', Object.entries(BUILTIN_FIELD_NAMES)],
      ['BUILTIN_VALUE_NAMES', Object.entries(BUILTIN_VALUE_NAMES)]
    ] as const) {
      for (const [key, label] of entries) {
        expect(label, `${table}['${key}'] = ${JSON.stringify(label)}`).toBe(label.trim())
      }
    }
  })

  it('displayNameForValue 不再吐出带前导空格的标签（原缺陷键直查）', () => {
    expect(displayNameForValue('refined_obsidian')).not.toMatch(/^\s/)
    expect(displayNameForValue('smoking')).not.toMatch(/^\s/)
  })
})
