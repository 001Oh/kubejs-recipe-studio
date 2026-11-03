import { describe, expect, it } from 'vitest'
import {
  mcAtMost,
  mcFromManifestJson,
  mcVersionFromKubejsPrefix,
  parseKubejsJar,
  parseLoaderJar,
  scriptEventHeader
} from '@shared/version'

describe('加载器 jar 文件名解析', () => {
  it('Forge', () => {
    expect(parseLoaderJar('forge-1.20.1-47.2.0.jar')).toEqual({
      loader: 'forge',
      mcVersion: '1.20.1',
      loaderVersion: '47.2.0'
    })
  })

  it('旧版 Forge 文件名里没有 MC 版本，留空交给其它检测源', () => {
    const r = parseLoaderJar('forge-14.23.5.2847.jar')
    expect(r?.loader).toBe('forge')
    expect(r?.mcVersion).toBeNull()
    expect(r?.loaderVersion).toBe('14.23.5.2847')
  })

  it('Fabric loader', () => {
    const r = parseLoaderJar('fabric-loader-0.15.11+1.20.1.jar')
    expect(r?.loader).toBe('fabric')
    expect(r?.mcVersion).toBe('1.20.1')
  })

  it('NeoForge 主版本映射到 MC 版本', () => {
    const r = parseLoaderJar('neoforge-21.1.247-installer.jar')
    expect(r?.loader).toBe('neoforge')
    expect(r?.mcVersion).toBe('1.21')
  })

  it('非加载器 jar 返回 null', () => {
    expect(parseLoaderJar('create-1.20.1-0.5.1.j.jar')).toBeNull()
  })
})

describe('KubeJS jar 解析', () => {
  it('本体：显式版本号 + 附属判定', () => {
    const r = parseKubejsJar('kubejs-forge-2001.6.5-build.26.jar')
    expect(r?.version).toBe('2001.6.5-build.26')
    expect(r?.mcVersion).toBe('1.20.1')
    expect(r?.isAddon).toBe(false)
    expect(r?.modId).toBe('kubejs')
  })

  it('附属：kubejs-mekanism 识别为附属并给出 modId', () => {
    const r = parseKubejsJar('kubejs-mekanism-forge-2001.1.5.1-build.2.jar')
    expect(r?.isAddon).toBe(true)
    expect(r?.modId).toBe('kubejs_mekanism')
    expect(r?.version).toBe('2001.1.5.1-build.2')
  })

  it('下划线风格附属名也归一化', () => {
    expect(parseKubejsJar('kubejs_botania-1.4.0-forge.jar')?.modId).toBe('kubejs_botania')
  })

  it('模组建版本号不能被当成 MC 版本', () => {
    // kubejs_botania-1.4.0-forge：1.4.0 是模组自身版本，MC 版本应留给别的检测源
    const r = parseKubejsJar('kubejs_botania-1.4.0-forge.jar')
    expect(r?.mcVersion).toBeNull()
    expect(r?.isAddon).toBe(true)
  })

  it('附属名里显式的 MC 版本可取到', () => {
    const r = parseKubejsJar('kubejs_enderio-forge-1.20.1-0.6.1.jar')
    expect(r?.mcVersion).toBe('1.20.1')
    expect(r?.modId).toBe('kubejs_enderio')
  })

  it('前缀码反推 MC 版本', () => {
    expect(mcVersionFromKubejsPrefix('2001.6.5')).toBe('1.20.1')
    expect(mcVersionFromKubejsPrefix('1902.6.2')).toBe('1.19.2')
    expect(mcVersionFromKubejsPrefix('1802.6.0')).toBe('1.18.2')
    expect(mcVersionFromKubejsPrefix('1605.0.0')).toBe('1.16.5')
    expect(mcVersionFromKubejsPrefix('2101.0.0')).toBe('1.21.1')
    expect(mcVersionFromKubejsPrefix('9999.0.0')).toBeNull()
  })

  it('非 kubejs 文件返回 null', () => {
    expect(parseKubejsJar('botania-1.20.1.jar')).toBeNull()
  })
})

describe('脚本头部分支（MC 版本差异）', () => {
  it('1.19+ 用 ServerEvents.recipes', () => {
    expect(scriptEventHeader('1.19.2')).toBe('ServerEvents.recipes')
    expect(scriptEventHeader('1.20.1')).toBe('ServerEvents.recipes')
    expect(scriptEventHeader('1.21.1')).toBe('ServerEvents.recipes')
  })

  it('≤1.18 用 onEvent', () => {
    expect(scriptEventHeader('1.18.2')).toBe("onEvent('recipes'")
    expect(scriptEventHeader('1.16.5')).toBe("onEvent('recipes'")
  })

  it('版本未知时按新版生成，不猜旧版', () => {
    expect(scriptEventHeader(null)).toBe('ServerEvents.recipes')
  })

  it('mcAtMost 边界', () => {
    expect(mcAtMost('1.18.2', [1, 18])).toBe(true)
    expect(mcAtMost('1.19', [1, 18])).toBe(false)
    expect(mcAtMost(null, [1, 18])).toBe(false)
  })
})

describe('元数据 JSON 里的 MC 版本', () => {
  it('modrinth.index.json', () => {
    expect(mcFromManifestJson({ dependencies: { minecraft: '1.20.1' } })).toBe('1.20.1')
  })

  it('mmc-pack.json components', () => {
    expect(
      mcFromManifestJson({ components: [{ id: 'net.minecraft', version: '1.19.2' }, { id: 'org.quiltmc.loader' }] })
    ).toBe('1.19.2')
  })

  it('curseforge gameVersion', () => {
    expect(mcFromManifestJson({ gameVersion: '1.16.5' })).toBe('1.16.5')
  })

  it('缺字段返回 null 而不是抛错', () => {
    expect(mcFromManifestJson({})).toBeNull()
    expect(mcFromManifestJson(null)).toBeNull()
  })
})
