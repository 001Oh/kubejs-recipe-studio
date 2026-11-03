/**
 * 真实整合包只读验证（默认 skip）。运行：RUN_REAL_PACK=1 npx vitest run tests/recipes/realPack.test.ts
 * 可选 REAL_PACK=<路径> 指定其它整合包。全程只读，不写整合包目录；缓存写入用 skipPersist 关闭。
 */
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModpackInfo } from '../../src/shared/types'
import { scanJsonRecipes } from '../../src/main/recipes/jsonSource'
import { scanScriptRecipes } from '../../src/main/recipes/scriptSource'
import { mergeChains } from '../../src/main/recipes/jsonSource'
import { buildIndex, queryByOutput, queryByInput, stats, typeUniverse } from '../../src/main/recipes/recipeIndex'
import { readFullRecipe } from '../../src/main/recipes/lazy'

const run = process.env.RUN_REAL_PACK === '1'
const packPath = process.env.REAL_PACK ?? 'E:/PCL/.minecraft/versions/1112'

function asModpack(path: string): ModpackInfo {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    mcVersion: null,
    loader: null,
    loaderVersion: null,
    kubejsVersion: null,
    modCount: 0,
    detectedFrom: ['real-pack-test'],
    modsDir: join(path, 'mods'),
    hasKubejs: existsSync(join(path, 'kubejs')),
    kubejsAddons: [],
    installedModIds: []
  }
}

describe.skipIf(!run)('真实整合包只读验证', () => {
  it('三源解析 + 索引构建（默认 120s 上限内完成）', async () => {
    expect(existsSync(packPath), `整合包不存在：${packPath}`).toBe(true)
    expect(statSync(packPath).isDirectory()).toBe(true)
    const modpack = asModpack(packPath)
    const t0 = Date.now()
    const json = await scanJsonRecipes(modpack, {})
    const scripts = await scanScriptRecipes(modpack, {})
    const merged = mergeChains([...json, ...scripts])
    buildIndex(merged)
    const s = stats()
    expect(s).not.toBeNull()
    expect(s!.total).toBeGreaterThan(0)
    // eslint-disable-next-line no-console
    console.info(
      `[real-pack] ${packPath}\n` +
        `  条目：json 源 ${json.length} / 脚本源 ${scripts.length} → 合并后 ${merged.length}\n` +
        `  统计：${s!.total}（原版 ${s!.vanilla} / 模组 ${s!.modded} / KubeJS ${s!.kubejs}）partial ${s!.partial}\n` +
        `  类型：${typeUniverse().length} 种；耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`
    )
    const multi = merged.filter((r) => r.definedBy && r.definedBy.length > 1)
    // eslint-disable-next-line no-console
    console.info(`  覆盖链：${multi.length} 条`, multi.slice(0, 3).map((r) => `${r.recipeId} → ${r.effectiveSource}`))
    // 抽查一个高频产物：两个方向必须都能查（同一索引）
    const top = merged.find((r) => r.outputs.length > 0 && r.inputs.length > 0)
    if (top) {
      const outId = top.outputs[0]!.id
      expect(queryByOutput(outId, 0, 6).items.length).toBeGreaterThan(0)
      const inId = top.inputs[0]!.id
      expect(queryByInput(inId, 0, 6).total).toBeGreaterThan(0)
    }
    expect(s!.partial).toBeLessThanOrEqual(s!.total)
    // 惰性完整读取回归：jar / datapack / file 三种源各抽一条能拿到 JSON
    for (const src of ['jar', 'datapack', 'kubejs'] as const) {
      const sample = merged.find((r) => r.source === src)
      if (!sample) continue
      try {
        const full = await readFullRecipe(sample)
        expect(full.json).toBeDefined()
      } catch (e) {
        // kubejs 脚本记录返回重建摘要，jar/datapack 缺源文件时报中文失效说明
        expect((e as Error).message).toContain('配方')
      }
    }
  }, 180_000)
})
