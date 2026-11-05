/**
 * B124/D-37：熔炼家族标量参数的生成钉子。
 *
 * 陷阱一（顺序）：PILOT_SCHEMAS 声明顺序 [ingredient, experience, cookingtime] 必须生成
 *   event.smelting(result, ingredient, xp, cookingTime)——xp 第 3 位、tick 第 4 位，
 *   写反会静默生成 (result, ingredient, 200, 0.35)，游戏里经验=200、时长=0.35 tick。
 * 陷阱二（占位）：isBlank(0)=false，但前提是 0 真的进了 values——渲染层位置回填
 *   （解法 C，见 PilotListEditor.writeScalarWithBackfill）负责写入；本文件在
 *   codegen 层钉住「values 就位后四条路径的实参形态」。
 *
 * 真实输入取证在 tests/renderer/components/scalarFields.test.tsx。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ userData: `${process.cwd()}/.vitest-tmp/b124-smelting-${process.pid}` }))
vi.mock('electron', () => ({ app: { getPath: () => H.userData, getVersion: () => '0.1.0-test' } }))

import { PILOT_SCHEMAS } from '@shared/pilotSchemas'
import type { WorkbenchState } from '@shared/types'
import { pilotToSchema } from '@main/schema/service'
import { normalizeUiValues } from '@main/codegen/preview'
import { emitScript } from '@main/codegen/emitScript'

const schema = pilotToSchema(PILOT_SCHEMAS['minecraft:smelting'] as Parameters<typeof pilotToSchema>[0])

function workbench(values: Record<string, unknown>): WorkbenchState {
  return {
    typeId: 'minecraft:smelting',
    layoutKind: 'single_io',
    values,
    activeSlotKey: null,
    modifiers: {}
  }
}

const INGREDIENT = [{ kind: 'item', id: 'minecraft:iron_ingot', count: 1 }]
const RESULT = [{ kind: 'item', id: 'minecraft:gold_ingot', count: 1 }]

/** 生成文本统一折叠空白后比对（4 个实参时 renderCall 走多行形态） */
function smelt(values: Record<string, unknown>): string {
  // 镜像真实 emit 路径（preview.generate）：先 normalizeUiValues（multiple=false 的
  // 数组拆成单值），再 emitScript——否则 fieldArguments 会把单值产物也括成数组
  const wb: WorkbenchState = {
    ...workbench(values),
    values: normalizeUiValues(schema, workbench(values).values),
    layoutKind: schema.layoutKind
  }
  const emit = emitScript(schema, wb, 'kubejs-sugar', null, 1)
  expect(emit.error).toBeNull()
  return emit.code.replace(/\s+/g, ' ')
}

const RESULT_ARG = "['minecraft:gold_ingot']"
const INGREDIENT_ARG = "['minecraft:iron_ingot']"

describe('B124/D-37 熔炼标量参数（陷阱一顺序 + 陷阱二占位）', () => {
  it('① 参数区不填 → 不生成垃圾参数', () => {
    const code = smelt({ ingredient: INGREDIENT, result: RESULT })
    expect(code).toContain(`event.smelting(${RESULT_ARG}, ${INGREDIENT_ARG})`)
    expect(code).not.toContain('0.35')
    expect(code).not.toMatch(/, 0[,)]/)
    expect(code).not.toMatch(/, 200/)
  })

  it('② 只填 experience=0.35 → xp 落第 3 位', () => {
    const code = smelt({ ingredient: INGREDIENT, result: RESULT, experience: 0.35 })
    expect(code).toContain(`event.smelting( ${RESULT_ARG}, ${INGREDIENT_ARG}, 0.35 )`)
  })

  it('③ 只填 cookingtime=200（experience 回填 0 占位）→ 0 占第 3 位、200 落第 4 位', () => {
    // experience=0 由渲染层回填写入（scalarFields.test.tsx 钉渲染行为），此处钉 codegen 形态
    const code = smelt({ ingredient: INGREDIENT, result: RESULT, experience: 0, cookingtime: 200 })
    expect(code).toContain(`event.smelting( ${RESULT_ARG}, ${INGREDIENT_ARG}, 0, 200 )`)
    // 关键反向：200 不得出现在第 3 位（xp 位）
    expect(code).not.toContain(`event.smelting( ${RESULT_ARG}, ${INGREDIENT_ARG}, 200`)
  })

  it('④ 两者都填 0.35 / 200 → 顺序正确', () => {
    const code = smelt({ ingredient: INGREDIENT, result: RESULT, experience: 0.35, cookingtime: 200 })
    expect(code).toContain(`event.smelting( ${RESULT_ARG}, ${INGREDIENT_ARG}, 0.35, 200 )`)
  })

  it('四个熔炼家族的语法糖目标齐全（event.smelting/blasting/smoking/campfireCooking）', () => {
    for (const [id, target] of [
      ['minecraft:smelting', 'event.smelting'],
      ['minecraft:blasting', 'event.blasting'],
      ['minecraft:smoking', 'event.smoking'],
      ['minecraft:campfire_cooking', 'event.campfire_cooking']
    ] as const) {
      const s = pilotToSchema(PILOT_SCHEMAS[id] as Parameters<typeof pilotToSchema>[0])
      expect(s.emitTarget, id).toBe(target)
      // 标量槽带 zone:extra 与区间约束（S-2 透传链）
      const scalar = s.slots.filter((f) => f.kind === 'number')
      expect(scalar.map((f) => f.key), id).toEqual(['experience', 'cookingtime'])
      expect(scalar.every((f) => f.zone === 'extra'), id).toBe(true)
    }
  })
})

describe('B124/D-37 四家族默认值（原版数值）', () => {
  beforeEach(() => {
    // pilotToSchema 是纯函数，无需清理注册表；此 beforeEach 仅为结构对齐
  })

  it('cookingtime 默认值：smelting 200 / blasting 100 / smoking 100 / campfire_cooking 600；experience 全 0', () => {
    for (const [id, time] of [
      ['minecraft:smelting', 200],
      ['minecraft:blasting', 100],
      ['minecraft:smoking', 100],
      ['minecraft:campfire_cooking', 600]
    ] as const) {
      const raw = PILOT_SCHEMAS[id] as unknown as { slots: { key: string; defaultValue?: unknown }[] }
      const cookingtime = raw.slots.find((s) => s.key === 'cookingtime')
      const experience = raw.slots.find((s) => s.key === 'experience')
      expect(cookingtime?.defaultValue, id).toBe(time)
      expect(experience?.defaultValue, id).toBe(0)
    }
  })
})
