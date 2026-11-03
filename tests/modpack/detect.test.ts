/**
 * 元数据检测（规格 3.1 / 3.6.1）：文件名解析、mods.toml 宽松解析、目录级检测、真实整合包。
 * `shared/version.ts` 的宽松正则会误读 MC 版本（见 detect.ts 头注释），所以这里断言的是
 * detect 层校正之后的结果。
 */
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { mcVersionFromKubejsPrefix, scriptEventHeader } from '@shared/version'
import {
  detectFromJarNames,
  detectMetadata,
  kubejsFromJarName,
  loaderFromJarName
} from '../../src/main/modpack/detect'
import { parseModsToml, isKubejsAddonModId, readModInventory } from '../../src/main/modpack/modList'

const created: string[] = []

async function tempPack(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'krp-detect-'))
  created.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
  return root
}

afterAll(async () => {
  await Promise.all(created.map((d) => rm(d, { recursive: true, force: true })))
})

describe('加载器 jar 文件名解析', () => {
  it('forge-1.20.1-47.2.0.jar → 1.20.1 / forge / 47.2.0', () => {
    expect(loaderFromJarName('forge-1.20.1-47.2.0.jar')).toEqual({ loader: 'forge', mc: '1.20.1', version: '47.2.0' })
  })

  it('fabric-loader-0.15.11+1.20.1.jar → fabric + 1.20.1', () => {
    const r = loaderFromJarName('fabric-loader-0.15.11+1.20.1.jar')
    expect(r?.loader).toBe('fabric')
    expect(r?.mc).toBe('1.20.1')
    expect(r?.version).toBe('0.15.11')
  })

  it('neoforge-21.1.247-installer.jar → neoforge + 1.21', () => {
    const r = loaderFromJarName('neoforge-21.1.247-installer.jar')
    expect(r?.loader).toBe('neoforge')
    expect(r?.mc).toBe('1.21')
    expect(r?.version).toBe('21.1.247')
  })

  it('quilt-loader 也识别家族', () => {
    expect(loaderFromJarName('quilt-loader-0.20.2+1.20.1.jar')?.loader).toBe('quilt')
  })

  it('forge-carpet 之类带 forge 字样的附属不算加载器', () => {
    expect(loaderFromJarName('forge-carpet-1.20.1-1.0.8+v251027.jar')).toBeNull()
    expect(loaderFromJarName('jei-1.20.1-forge-15.20.0.112.jar')).toBeNull()
  })
})

describe('KubeJS jar 文件名解析', () => {
  it('kubejs-forge-2001.6.5-build.26.jar → 本体 + 1.20.1 + 完整版本号 + forge 后缀', () => {
    const r = kubejsFromJarName('kubejs-forge-2001.6.5-build.26.jar')
    expect(r?.role).toBe('main')
    expect(r?.modId).toBe('kubejs')
    expect(r?.version).toBe('2001.6.5-build.26')
    expect(r?.mc).toBe('1.20.1')
    expect(r?.loaderHint).toBe('forge')
  })

  it('kubejs-2001.6.5.jar（无前缀 loader）也是本体', () => {
    const r = kubejsFromJarName('kubejs-2001.6.5.jar')
    expect(r?.role).toBe('main')
    expect(r?.mc).toBe('1.20.1')
    expect(r?.loaderHint).toBeNull()
  })

  it('四位前缀码反推 MC 版本', () => {
    expect(mcVersionFromKubejsPrefix('1902.6.1')).toBe('1.19.2')
    expect(mcVersionFromKubejsPrefix('1802.6.0')).toBe('1.18.2')
    expect(mcVersionFromKubejsPrefix('1605.3.1')).toBe('1.16.5')
    expect(mcVersionFromKubejsPrefix('2101.0.0')).toBe('1.21.1')
    for (const [code, mc] of [['1902', '1.19.2'], ['1802', '1.18.2'], ['1605', '1.16.5'], ['2101', '1.21.1']] as const) {
      expect(kubejsFromJarName(`kubejs-${code}.6.1-build.2.jar`)?.mc).toBe(mc)
    }
  })

  it('附属 / 本体 / 无关模组三方判定', () => {
    expect(kubejsFromJarName('kubejs-mekanism-forge-2001.1.5.1-build.2.jar')).toMatchObject({ role: 'addon', modId: 'kubejs_mekanism' })
    expect(kubejsFromJarName('kubejs-thermal-2001.1.10-build.5.jar')?.modId).toBe('kubejs_thermal')
    expect(kubejsFromJarName('kubejs_botania-1.4.0-forge.jar')?.modId).toBe('kubejs_botania')
    expect(kubejsFromJarName('kubejs_extended_crafting-2001.5.jar')?.modId).toBe('kubejs_extended_crafting')
    // kubejsadditions 是独立 modId，不能当成 KubeJS 本体，也不是 kubejs_* 附属
    expect(kubejsFromJarName('kubejsadditions-forge-4.3.4.jar')).toBeNull()
    expect(kubejsFromJarName('botania-1.20.1-452-FORGE.jar')).toBeNull()
    expect(isKubejsAddonModId('kubejs')).toBe(false)
    expect(isKubejsAddonModId('kubejs_create')).toBe(true)
  })

  it('detectFromJarNames 汇总整个 mods 目录的文件名事实', () => {
    const facts = detectFromJarNames([
      'forge-1.20.1-47.2.0.jar',
      'kubejs-forge-2001.6.5-build.26.jar',
      'kubejs-mekanism-forge-2001.1.5.1-build.2.jar',
      'kubejs-thermal-2001.1.10-build.5.jar',
      'create-1.20.1-0.5.1.j.jar',
      'jei-1.20.1-forge-15.20.0.112.jar'
    ])
    expect(facts.loader).toBe('forge')
    expect(facts.loaderVersion).toBe('47.2.0')
    expect(facts.mcFromLoader).toBe('1.20.1')
    expect(facts.hasKubejsJar).toBe(true)
    expect(facts.kubejsVersion).toBe('2001.6.5-build.26')
    expect(facts.kubejsJar).toBe('kubejs-forge-2001.6.5-build.26.jar')
    expect(facts.addons).toEqual(['kubejs_mekanism', 'kubejs_thermal'])
  })
})

describe('mods.toml 宽松解析', () => {
  const SAMPLE = [
    'modLoader="javafml" #mandatory',
    'loaderVersion="[47,)"',
    '# 注释里写 modId = "不该被读"',
    '',
    '[[mods]]',
    'modId = "kubejs_mekanism"',
    'displayName = "KubeJS Mekanism"',
    'description = """',
    '这里有一行伪装 modId = "假的那个"',
    '"""',
    '',
    '[[dependencies.kubejs_mekanism]]',
    'modId = "kubejs"',
    'mandatory = true',
    '',
    '[[dependencies.kubejs_mekanism]]',
    "modId='mekanism'",
    '',
    '[[mods]]',
    'modId = ["api_part", "impl_part"]',
    'side = "BOTH" # modId = "行尾注释里的"',
    ''
  ].join('\n')

  it('只取 [[mods]] 块的 modId，多行字符串与注释都屏蔽', () => {
    expect(parseModsToml(SAMPLE).modIds).toEqual(['kubejs_mekanism', 'api_part', 'impl_part'])
  })

  it('[[dependencies.<modId>]] 归到声明方，供下游推断附属→主模组', () => {
    expect(parseModsToml(SAMPLE).dependencies['kubejs_mekanism']).toEqual(['kubejs', 'mekanism'])
  })

  it('空文件 / 没有 mods 块都返回空集合，不抛错', () => {
    expect(parseModsToml('')).toEqual({ modIds: [], dependencies: {} })
    expect(parseModsToml('modLoader="javafml"\nmodId="orphan"\n').modIds).toEqual([])
  })
})

describe('detectMetadata（临时目录）', () => {
  it('modrinth.index.json 优先级最高，即使文件名指向别的版本', async () => {
    const root = await tempPack({
      'modrinth.index.json': JSON.stringify({ name: '测试包', dependencies: { minecraft: '1.18.2' } }),
      'mods/forge-1.20.1-47.2.0.jar': '不是真的 zip',
      'mods/kubejs-forge-2001.6.5-build.26.jar': '也不是 zip',
      'mods/config-entry.txt': 'x'
    })
    const info = await detectMetadata(root)
    expect(info.mcVersion).toBe('1.18.2')
    expect(info.name).toBe('测试包')
    expect(info.loader).toBe('forge')
    expect(info.loaderVersion).toBe('47.2.0')
    expect(info.kubejsVersion).toBe('2001.6.5-build.26')
    expect(info.hasKubejs).toBe(true)
    expect(info.modCount).toBe(2)
    expect(info.modsDir).toBe(join(root, 'mods'))
    expect(info.path).toBe(root)
    expect(info.detectedFrom.join(' ')).toContain('modrinth.index.json')
    // 假 jar 读不出元数据：不抛错，只少 modId
    expect(info.installedModIds).toEqual(['kubejs'])
  })

  it('只有 kubejs 文件名时按前缀码反推，且 1.18 走 onEvent 头', async () => {
    const root = await tempPack({ 'mods/kubejs-forge-1802.6.0-build.1.jar': 'x' })
    const info = await detectMetadata(root)
    expect(info.mcVersion).toBe('1.18.2')
    expect(info.loader).toBe('forge')
    expect(scriptEventHeader(info.mcVersion)).toBe("onEvent('recipes'")
  })

  it('`.minecraft` 不作为整合包名，回退到上一层实例名', async () => {
    const root = await tempPack({ '.minecraft/mods/kubejs-forge-1802.6.0-build.1.jar': 'x' })
    const info = await detectMetadata(join(root, '.minecraft'))
    expect(info.name).toBe(basename(root))
    expect(info.modsDir).toBe(join(root, '.minecraft', 'mods'))
  })

  it('1.20.1 走 ServerEvents.recipes 头', async () => {
    const root = await tempPack({ 'mods/forge-1.20.1-47.2.0.jar': 'x', 'mods/kubejs-2001.6.5.jar': 'x' })
    const info = await detectMetadata(root)
    expect(info.mcVersion).toBe('1.20.1')
    expect(scriptEventHeader(info.mcVersion)).toBe('ServerEvents.recipes')
    expect(info.detectedFrom.join(' ')).toContain('forge-1.20.1-47.2.0.jar')
  })

  it('mmc-pack.json 的 components 给出 MC 版本与 fabric 加载器', async () => {
    const root = await tempPack({
      'mmc-pack.json': JSON.stringify({
        components: [
          { id: 'net.minecraft', version: '1.19.2' },
          { id: 'net.fabricmc.loader', version: '0.14.21' }
        ]
      }),
      'mods/fabric-api-0.76.0+1.19.2.jar': 'x'
    })
    const info = await detectMetadata(root)
    expect(info.mcVersion).toBe('1.19.2')
    expect(info.loader).toBe('fabric')
    expect(info.hasKubejs).toBe(false)
    expect(info.kubejsVersion).toBeNull()
  })

  it('啥都没有时 mcVersion=null，不抛错（UI 让用户手动指定）', async () => {
    const root = await tempPack({ 'mods/readme.txt': 'x' })
    const info = await detectMetadata(root)
    expect(info.mcVersion).toBeNull()
    expect(info.loader).toBeNull()
    expect(info.hasKubejs).toBe(false)
    expect(info.modCount).toBe(0)
    expect(info.detectedFrom).toEqual([])
  })

  it('mods 目录都不存在时也不抛错', async () => {
    const root = await tempPack({ 'package.json': '{}' })
    const info = await detectMetadata(root)
    expect(info.modsDir).toBe(join(root, 'mods'))
    expect(info.modCount).toBe(0)
    expect(info.mcVersion).toBeNull()
  })

  it('readModInventory 对假 jar 记入 failed 并继续', async () => {
    const root = await tempPack({ 'mods/bad-one.jar': 'x', 'mods/bad-two.jar': 'x' })
    let seen = 0
    const res = await readModInventory(join(root, 'mods'), (done) => {
      seen = done
    })
    expect(res.failed).toHaveLength(2)
    expect(res.installedModIds).toEqual([])
    expect(res.kubejsAddons).toEqual([])
    expect(seen).toBe(2)
  })
})

const AE = 'E:/PCL/.minecraft/versions/ae'
const BAKA = 'E:/PCL/.minecraft/versions/baka也要玩红石(by yue)'

describe.skipIf(!existsSync(join(AE, 'mods')))('真实整合包 ae（只读）', () => {
  it('MC 1.20.1 / forge / kubejs 2001.6.5 / 300+ mod / 附属含 mekanism 与 thermal', async () => {
    const info = await detectMetadata(AE)
    expect(info.mcVersion).toBe('1.20.1')
    expect(info.loader).toBe('forge')
    expect(info.kubejsVersion).toContain('2001.6.5')
    expect(info.hasKubejs).toBe(true)
    expect(info.modCount).toBeGreaterThanOrEqual(300)
    expect(info.kubejsAddons).toContain('kubejs_mekanism')
    expect(info.kubejsAddons).toContain('kubejs_thermal')
    expect(info.installedModIds).toContain('kubejs')
    expect(info.installedModIds).toContain('botania')
    expect(info.detectedFrom.length).toBeGreaterThan(1)
  }, 180_000)
})

describe.skipIf(!existsSync(join(BAKA, 'mods')))('真实整合包 baka也要玩红石（只读）', () => {
  it('fabric 且未装 KubeJS', async () => {
    const info = await detectMetadata(BAKA)
    expect(info.loader).toBe('fabric')
    expect(info.hasKubejs).toBe(false)
    expect(info.kubejsVersion).toBeNull()
    expect(info.kubejsAddons).toEqual([])
    expect(info.modCount).toBeGreaterThan(100)
    expect(info.installedModIds.length).toBeGreaterThan(50)
  }, 180_000)
})
