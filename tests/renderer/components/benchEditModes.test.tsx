// @vitest-environment jsdom
/**
 * 第 115 批 D1 / D2：编辑入口收敛 + 写盘目标可见。
 *
 * 覆盖三件事：
 *   1. 三入口的可用性由状态推导，**禁用必须带原因**（不能只是变灰）
 *   2. 同一套文案只有一份定义（扫描源码断言每个 `when` 句子只出现在 editModes.ts）
 *   3. 写盘目标三种状态（源文件 / 新文件 / 脚本）各自的标签与提交按钮 title
 */
import '@testing-library/jest-dom/vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StartHerePanel } from '../../../src/renderer/src/views/bench/StartHerePanel'
import {
  EDIT_ENTRIES,
  MODE_NOTES,
  resolveEntryStates,
  writeTargetOf
} from '../../../src/renderer/src/views/bench/editModes'

afterEach(cleanup)

const ROOT = process.cwd()

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

describe('D1 入口可用性推导', () => {
  it('未导入整合包：三个入口都禁用，且原因都是「请先导入整合包」', () => {
    const states = resolveEntryStates({ hasModpack: false, pilotType: true })
    expect(states.map((s) => s.id)).toEqual(['open', 'create', 'export'])
    for (const state of states) {
      expect({ id: state.id, disabled: state.disabled }).toEqual({ id: state.id, disabled: true })
      expect(state.reason).toContain('请先导入整合包')
    }
  })

  it('当前类型不在试点白名单：只有「从零新建」禁用，并说明可以换类型', () => {
    const states = resolveEntryStates({ hasModpack: true, pilotType: false })
    const byId = Object.fromEntries(states.map((s) => [s.id, s]))
    expect(byId.create.disabled).toBe(true)
    expect(byId.create.reason).toContain('该类型不支持结构化编辑')
    expect(byId.open.disabled).toBe(false)
    expect(byId.export.disabled).toBe(false)
  })

  it('条件齐备：三个入口都可用，且不带残留原因', () => {
    const states = resolveEntryStates({ hasModpack: true, pilotType: true })
    expect(states.every((s) => !s.disabled && s.reason === '')).toBe(true)
  })
})

describe('D1 空态面板渲染', () => {
  it('三个并列选项可见，禁用项把原因写出来（不是只有一个灰按钮）', () => {
    render(<StartHerePanel entries={resolveEntryStates({ hasModpack: false, pilotType: true })} onPick={vi.fn()} />)
    expect(screen.getByLabelText('开始编辑')).toBeTruthy()
    for (const entry of EDIT_ENTRIES) {
      expect(screen.getByText(entry.title)).toBeTruthy()
      expect(screen.getByText(entry.when)).toBeTruthy()
    }
    // 三个「原因」文案都应出现在面板里
    expect(screen.getAllByRole('note')).toHaveLength(3)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })

  it('可用项点击后回传 id，禁用项点击不触发', () => {
    const onPick = vi.fn()
    render(<StartHerePanel entries={resolveEntryStates({ hasModpack: true, pilotType: false })} onPick={onPick} />)
    screen.getByRole('button', { name: /打开已有配方/ }).click()
    expect(onPick).toHaveBeenCalledWith('open')
    screen.getByRole('button', { name: /从零新建/ }).click()
    expect(onPick).toHaveBeenCalledTimes(1)
  })
})

describe('D1 文案单一来源（等价于 grep：只有一份定义）', () => {
  const files = sourceFiles(join(ROOT, 'src/renderer/src')).map((file) => ({
    file: file.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/'), ''),
    text: readFileSync(file, 'utf8')
  }))

  it('每个入口的 when 句子在全仓只出现一次，且就在 editModes.ts', () => {
    for (const entry of EDIT_ENTRIES) {
      const hits = files.filter((f) => f.text.includes(entry.when)).map((f) => f.file)
      expect({ id: entry.id, hits }).toEqual({ id: entry.id, hits: ['/src/renderer/src/views/bench/editModes.ts'] })
    }
  })

  it('每个模式说明句子在全仓只出现一次，且就在 editModes.ts', () => {
    for (const [key, sentence] of Object.entries(MODE_NOTES)) {
      const hits = files.filter((f) => f.text.includes(sentence)).map((f) => f.file)
      expect({ key, hits }).toEqual({ key, hits: ['/src/renderer/src/views/bench/editModes.ts'] })
    }
  })

  it('三处消费者都是 import 复用，没有各自复制一份文案', () => {
    for (const file of [
      '/src/renderer/src/views/BenchView.tsx',
      '/src/renderer/src/views/bench/StartHerePanel.tsx',
      '/src/renderer/src/views/SettingsView.tsx'
    ]) {
      const text = files.find((f) => f.file === file)?.text ?? ''
      expect({ file, imports: /from '\.\.?\/[^']*editModes'|from '\.\/editModes'/.test(text) }).toEqual({ file, imports: true })
    }
  })
})

describe('D2 写盘目标（三种编辑态各一句话）', () => {
  it('通用模式：写的是脚本，需要 Ctrl+S 选文件', () => {
    const target = writeTargetOf({ hasDraft: false, copyMode: false, blank: false, sourcePath: '' })
    expect(target.label).toContain('脚本（Ctrl+S 选择）')
    expect(target.detail).toContain('不会覆盖')
  })

  it('空白新建：提交时命名新文件', () => {
    const target = writeTargetOf({ hasDraft: true, copyMode: true, blank: true, sourcePath: '' })
    expect(target.label).toContain('新文件（提交时命名）')
    expect(target.submitTitle).toContain('将新建文件')
  })

  it('就地编辑：标签是源文件名，提交 title 说清「将覆盖」', () => {
    const target = writeTargetOf({
      hasDraft: true,
      copyMode: false,
      blank: false,
      sourcePath: 'E:/pack/kubejs/data/foo/recipes/bar.json'
    })
    expect(target.label).toBe('recipes/bar.json')
    expect(target.submitTitle).toContain('将覆盖')
    expect(target.detail).toContain('备份')
  })
})
