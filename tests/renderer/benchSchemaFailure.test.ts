/**
 * BUG-HUNT-02：工作台 schema 拉取失败后的可恢复性（BH-009）与钉住操作的失败反馈（BH-010）。
 *
 * 背景：
 *   - BH-009：`ensureSchema` 用 `call()`（失败返回 null）并把 null 写进 `schemaCache`；
 *             缓存判定是 `cached !== undefined`，因此一次瞬时失败会让该类型在整场会话里
 *             都拿不到 schema，且永不再重试。
 *   - BH-010：`pinCurrent` / `unpinCurrent` 在失败时直接 `return`，界面上毫无反应。
 *
 * 断言的是**对外可观察行为**：缓存是否被污染、能否重试、是否给了用户提示。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type BridgeResult = { ok: true; data: unknown } | { ok: false; error: string; code?: string }

let nextResult: BridgeResult = { ok: true, data: null }

function installBridge(): void {
  vi.stubGlobal('window', {
    studio: {
      invoke: async () => nextResult,
      onEvent: () => () => undefined,
      iconUrl: (k: string) => `app-icon://${k}`
    }
  })
}

const TYPE = 'demo:broken'

function schemaOf(displayName: string): Record<string, unknown> {
  return {
    id: TYPE,
    displayName,
    modId: 'demo',
    modDisplayName: 'demo',
    source: 'builtin',
    layoutKind: 'single_io',
    emitTarget: null,
    slots: [],
    outputs: [],
    channel: 'datapack-json',
    capability: 'compatible'
  }
}

async function boot() {
  const ui = await import('@renderer/views/bench/benchUiStore')
  const app = await import('@renderer/store/appStore')
  return { ui: ui.useBenchUiStore, app: app.useAppStore }
}

describe('工作台 schema 失败后的可恢复性', () => {
  beforeEach(() => {
    vi.resetModules()
    nextResult = { ok: true, data: null }
    installBridge()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('BH-009：加载失败不得把 null 写进 schemaCache（否则本会话不会重试）', async () => {
    const { ui } = await boot()
    nextResult = { ok: false, error: '读取失败', code: 'IO' }

    const got = await ui.getState().ensureSchema(TYPE)

    expect(got).toBeNull()
    expect(ui.getState().schemaCache[TYPE]).toBeUndefined()
  })

  it('BH-009：失败给出可见提示，而不是静默降级', async () => {
    const { ui, app } = await boot()
    nextResult = { ok: false, error: '读取失败', code: 'IO' }

    await ui.getState().ensureSchema(TYPE)

    const toasts = app.getState().toasts
    expect(toasts.length).toBeGreaterThan(0)
    expect(toasts.some((t) => t.level === 'error')).toBe(true)
  })

  it('BH-009：失败之后再次调用能够真正重试并拿到结果', async () => {
    const { ui } = await boot()
    nextResult = { ok: false, error: '一时失败' }
    await ui.getState().ensureSchema(TYPE)

    nextResult = { ok: true, data: schemaOf('恢复后的名字') }
    const retried = await ui.getState().ensureSchema(TYPE)

    expect(retried?.displayName).toBe('恢复后的名字')
    expect(ui.getState().schemaCache[TYPE]).toMatchObject({ displayName: '恢复后的名字' })
  })

  it('成功结果会被缓存，第二次调用不再发起请求', async () => {
    const { ui } = await boot()
    let calls = 0
    vi.stubGlobal('window', {
      studio: {
        invoke: async () => {
          calls += 1
          return { ok: true as const, data: schemaOf('缓存值') }
        },
        onEvent: () => () => undefined,
        iconUrl: () => ''
      }
    })

    await ui.getState().ensureSchema(TYPE)
    await ui.getState().ensureSchema(TYPE)

    expect(calls).toBe(1)
  })
})

describe('钉住操作的失败反馈', () => {
  beforeEach(() => {
    vi.resetModules()
    nextResult = { ok: true, data: null }
    installBridge()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('BH-010：pin 失败时给出错误提示，且不谎报成功', async () => {
    const { ui, app } = await boot()
    ui.setState({ schema: schemaOf('待钉住') as never })
    nextResult = { ok: false, error: '写入失败', code: 'EPERM' }

    await ui.getState().pinCurrent()

    const toasts = app.getState().toasts
    expect(toasts.some((t) => t.level === 'error')).toBe(true)
    expect(toasts.some((t) => t.level === 'success')).toBe(false)
  })

  it('BH-010：pin 成功时给出成功提示并采用返回值', async () => {
    const { ui, app } = await boot()
    ui.setState({ schema: schemaOf('待钉住') as never })
    nextResult = { ok: true, data: schemaOf('已钉住的版本') }

    await ui.getState().pinCurrent()

    expect(ui.getState().schema?.displayName).toBe('已钉住的版本')
    expect(app.getState().toasts.some((t) => t.level === 'success')).toBe(true)
  })

  it('BH-010：unpin 返回 false（本来未钉住）时不得再谎报「已取消」', async () => {
    const { ui, app } = await boot()
    ui.setState({ schema: schemaOf('未钉住') as never })
    nextResult = { ok: true, data: false }

    await ui.getState().unpinCurrent()

    const toasts = app.getState().toasts
    expect(toasts.some((t) => t.level === 'info')).toBe(true)
    expect(toasts.some((t) => t.text.includes('已取消钉住'))).toBe(false)
  })
})
