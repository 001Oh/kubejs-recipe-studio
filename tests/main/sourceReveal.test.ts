/**
 * 第 115 批续：`source:reveal` 的**安全边界**用例。
 *
 * 这一组用例的目的不是"功能能跑"，而是证明：**渲染进程无法让主进程打开/定位任意路径**。
 * 因此 1/2 两条都必须断言 `showItemInFolder` 调用次数为 0——只返回错误码不算过关。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModpackInfo } from '../../src/shared/types'

const H = vi.hoisted(() => ({
  shell: { showItemInFolder: vi.fn() }
}))

vi.mock('electron', () => ({
  app: { getPath: () => `${process.cwd()}/.vitest-tmp/b115-reveal-${process.pid}`, getVersion: () => '0.1.0-test' },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
  shell: H.shell,
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  dialog: { showOpenDialogSync: () => undefined }
}))

import { pathFromFileUid, revealSource } from '../../src/main/handlers/sourceHandlers'

let root = ''
let outsideFile = ''

function modpackAt(path: string): ModpackInfo {
  return {
    path,
    name: 'test-pack',
    mcVersion: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.2.0',
    kubejsVersion: '2001.6.5',
    modCount: 1,
    detectedFrom: [],
    modsDir: join(path, 'mods'),
    hasKubejs: true,
    kubejsAddons: [],
    installedModIds: []
  }
}

async function mk(rel: string, content = '{}'): Promise<string> {
  const full = join(root, rel)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content, 'utf8')
  return full
}

const depsWith = (modpack: ModpackInfo | null) => ({
  modpack,
  showItemInFolder: H.shell.showItemInFolder
})

beforeEach(async () => {
  H.shell.showItemInFolder.mockClear()
  root = await mkdtemp(join(tmpdir(), 'kjs-reveal-'))
  await mk('kubejs/data/ad_astra/recipes/crafting/module.json', '{"type":"minecraft:crafting_shaped"}')
  outsideFile = join(tmpdir(), `kjs-outside-${process.pid}-${Date.now()}.json`)
  await writeFile(outsideFile, '{}', 'utf8')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outsideFile, { force: true })
})

describe('pathFromFileUid：三种既有 uid 写法都要认', () => {
  it('正斜杠 / 反斜杠 / 带 #recipe# 后缀', () => {
    expect(pathFromFileUid('file:E:/pack/kubejs/data/a.json')).toBe('E:\\pack\\kubejs\\data\\a.json')
    expect(pathFromFileUid('file:E:\\pack\\kubejs\\data\\a.json')).toBe('E:\\pack\\kubejs\\data\\a.json')
    expect(pathFromFileUid('file:E:/pack/kubejs/server_scripts/a.js#recipe#3')).toBe('E:\\pack\\kubejs\\server_scripts\\a.js')
  })

  it('非 file: 形态（jar / datapack 内嵌）返回 null——不猜路径', () => {
    expect(pathFromFileUid('jar:create-1.0.jar#data/x/recipes/a.json')).toBeNull()
    expect(pathFromFileUid('datapack:E:/pack/datapacks/d.zip#data/x.json')).toBeNull()
    expect(pathFromFileUid('file:')).toBeNull()
    expect(pathFromFileUid('')).toBeNull()
  })
})

describe('revealSource：拒绝路径（shell 必须零调用）', () => {
  it('1) uid 解析到包外路径 → OUTSIDE_ROOT，且 shell 未被调用', async () => {
    const uid = `file:${outsideFile.replace(/\\/g, '/')}`
    await expect(revealSource({ uid }, depsWith(modpackAt(root)))).rejects.toMatchObject({ name: 'OUTSIDE_ROOT' })
    expect(H.shell.showItemInFolder).toHaveBeenCalledTimes(0)
  })

  it('1b) 用 `..` 跳出包根的相对写法同样被拦（先校验，再 stat）', async () => {
    const escape = `file:${join(root, '..', 'escape.json').replace(/\\/g, '/')}`
    await expect(revealSource({ uid: escape }, depsWith(modpackAt(root)))).rejects.toMatchObject({ name: 'OUTSIDE_ROOT' })
    expect(H.shell.showItemInFolder).toHaveBeenCalledTimes(0)
  })

  it('2) uid 不存在 → SOURCE_NOT_FOUND，且 shell 未被调用', async () => {
    const missing = `file:${join(root, 'kubejs/data/nope/gone.json').replace(/\\/g, '/')}`
    await expect(revealSource({ uid: missing }, depsWith(modpackAt(root)))).rejects.toMatchObject({ name: 'SOURCE_NOT_FOUND' })
    expect(H.shell.showItemInFolder).toHaveBeenCalledTimes(0)
  })

  it('2b) jar 内嵌条目（没有独立文件）→ SOURCE_NOT_FOUND，不猜 kubejs/server_scripts', async () => {
    await expect(
      revealSource({ uid: 'jar:create-1.0.jar#data/create/recipes/mixing/a.json' }, depsWith(modpackAt(root)))
    ).rejects.toMatchObject({ name: 'SOURCE_NOT_FOUND' })
    expect(H.shell.showItemInFolder).toHaveBeenCalledTimes(0)
  })

  it('2c) 没导入整合包 → NO_MODPACK', async () => {
    await expect(revealSource({ uid: 'file:E:/x.json' }, depsWith(null))).rejects.toMatchObject({ name: 'NO_MODPACK' })
    expect(H.shell.showItemInFolder).toHaveBeenCalledTimes(0)
  })
})

describe('revealSource：合法 uid', () => {
  it('3) 调用一次 showItemInFolder，参数是包内绝对路径（inside 成立）', async () => {
    const file = await mk('kubejs/data/ad_astra/recipes/crafting/module.json')
    const uid = `file:${file.replace(/\\/g, '/')}`

    const res = await revealSource({ uid }, depsWith(modpackAt(root)))

    expect(H.shell.showItemInFolder).toHaveBeenCalledTimes(1)
    const calledWith = H.shell.showItemInFolder.mock.calls[0][0] as string
    // 正斜杠 / 反斜杠都接受，但必须是同一个包内文件
    expect(resolve(calledWith)).toBe(resolve(file))
    const rel = relative(resolve(root), resolve(calledWith))
    expect(rel.startsWith('..')).toBe(false)
    expect(res.relativePath).toBe('kubejs/data/ad_astra/recipes/crafting/module.json')
  })
})
