# P-C2 接入评审：crafting_shapeless / create:mixing

日期：2026-10-31
范围：在 P-C1 试点上扩展两个白名单类型。**不替换 benchStore、不改扫描/缓存/搜索/ProbeJS、不接生成与写盘、不扩大类型范围。**

## 1. 审查结论（接入前盘点）

P-C1 的 `draftBridge` 只对 shaped 用规范化槽位键；非 shaped 仍借 lite 的 `inputs/outputs`，且没有列表级逐项保留。直接复用会导致：

- 改一个材料时整张列表被 `slotToNormalized` 重写，未改条目从 `{item:...}` / 字符串变成统一对象；
- 产物槽键（`outputs`）与规范化键（`result/results`）不一致；
- 流体只认 `fluid`，`fluidTag` 会被当 unknown；
- 引用对象内未建模键（如 IE 自定义 `type`）没有保留位置。

P-C2 因此把非 shaped 草稿改为**槽位键直连**（`ingredients/result/results`），并复用同一 `RecipeDraft`：

| 项目 | crafting_shapeless | create:mixing |
| --- | --- | --- |
| 真实样本 | alltheores 黄铜粉（1112） | Create fluix（Construct）；tea/brass 同 jar |
| 原始结构 | `ingredients[]`（对象 item/tag）、`result{count,item}`、`category` | `ingredients[]`（tag/item/fluid，amount/nbt/fluidTag）、`results[]`（item/fluid，count/chance）、`conditions/heatRequirement` |
| 可编辑 | 材料顺序/增删/替换、产物 item/count | 材料替换/增删、流体 mB、产物 item/fluid、count、chance |
| 未建模 | `category` | `conditions` / `heatRequirement` / `processingTime` 等 |
| 原始类型 | count 可能是数字；材料对象/标签对象 | amount/count/chance 可能是数字或字符串；`nbt` 可为 `{}` |
| 回写规则 | 只写 dirty 槽位；列表逐项比对，未改条目复用原 Normalized 值 | 同上；`outputs→results` 脏键映射；流体 `refKey/nbt/extras` 保留 |
| 不安全情形 | 无 id 的引用 → unknown，草稿只读 | 同上；自定义引用内键 → extras + 诊断，仍可安全回写 |

## 2. 实现变更

- `src/main/recipes/selectSchema.ts`：新增 shapeless / create:mixing 试点 schema；**试点期内置 schema 优先于注册表推断**，避免同一配方两套槽位；`supportsChance` 仅影响试点 UI。
- `src/shared/schemaModel.ts`：引用值增加 `nbt/extras`；`NormalizedSchema.supportsChance`。
- `src/shared/normalize.ts`：
  - `fluidTag` 识别为流体；`{amount,tag}`（IE 自定义流体）识别为流体，不再丢掉 amount；
  - 引用对象未建模键进 `extras` 并产生 `UNKNOWN_FIELD_PRESERVED` 诊断；
  - 回写保留 `extras/nbt/refKey`（item/tag/fluid/registry）。
- `src/renderer/src/store/draftBridge.ts`：
  - 非 shaped 草稿 values 直接使用 schema 槽位键；
  - 列表逐项保留（未改条目原样复用）；
  - 编辑同一条目时保留隐藏的 `extras/nbt/refKey`；
  - 产物 `outputs ↔ result/results` 映射；
  - 含完全无法表达的 unknown 引用时，草稿标记 `unsafeReason`，列表只读并在面板告警。
- `src/renderer/src/store/benchStore.ts`：草稿携带 diagnostics/unsafeReason；换基线（冲突）时同步。
- `src/renderer/src/views/bench/PilotListEditor.tsx`（新）：shapeless/mixing 共用的材料/产物列表，支持 ItemSlot 选择器、数量/流体 mB/概率输入；未建模字段不进入表单。
- `src/renderer/src/views/BenchView.tsx`：有草稿时只显示试点编辑（shaped 网格 / 其他列表），隐藏 lite extras 与类型切换；旧路径无草稿时完全不变。
- `src/renderer/src/views/SettingsView.tsx`：三个类型各自的试点开关，互不清空。
- `PilotDraftPanel.tsx`：标题改为「试点草稿」，新增只读诊断区。
- 测试：`tests/schema/pc2Normalize.test.ts`、`tests/renderer/pc2DraftBridge.test.ts`、`tests/renderer/benchStorePc2.test.ts`，扩展 `tests/main/openRecipe.test.ts`；真实样本夹具 `tests/fixtures/schema/pc2-samples-raw.json`。
- E2E：`.cache/e2e-pc2.mjs`（参数化，两个包分别运行）。

## 3. 真实样本与结构化对比

### 3.1 shapeless（alltheores 黄铜粉）

原始（编辑前）：

```json
{
  "type": "minecraft:crafting_shapeless",
  "category": "misc",
  "ingredients": [
    {"item":"alltheores:copper_dust"},
    {"item":"alltheores:copper_dust"},
    {"item":"alltheores:copper_dust"},
    {"tag":"forge:dusts/zinc"}
  ],
  "result": {"count":4,"item":"alltheores:brass_dust"}
}
```

E2E 双击第 2 个材料替换为 `minecraft:emerald` 后：

```json
{
  "type": "minecraft:crafting_shapeless",
  "category": "misc",
  "ingredients": [
    {"item":"alltheores:copper_dust"},
    {"item":"minecraft:emerald","count":1},
    {"item":"alltheores:copper_dust"},
    {"tag":"forge:dusts/zinc"}
  ],
  "result": {"count":4,"item":"alltheores:brass_dust"}
}
```

顺序、标签、产物、`category` 不变；`ingredients` 长度保持 4。

### 3.2 create:mixing（AE2 fluix，真实 Create jar）

编辑前（关键字段）：

```json
{
  "type":"create:mixing",
  "conditions":[{"type":"forge:mod_loaded","modid":"ae2"}],
  "ingredients":[
    {"tag":"forge:dusts/redstone"},
    {"item":"ae2:charged_certus_quartz_crystal"},
    {"tag":"forge:gems/quartz"},
    {"amount":250,"fluid":"minecraft:water","nbt":{}}
  ],
  "results":[{"count":2,"item":"ae2:fluix_crystal"}]
}
```

E2E 将产物数量改为 3、概率设为 25%：

```json
"results":[{"item":"ae2:fluix_crystal","count":3,"chance":0.25}]
```

`conditions`、`ingredients`（含 fluid amount/nbt）、`type` 全部保持不变；`dirtyFields` 为 1 个字段（`results`），因为 count/chance 属于同一产物列表。

另有真实的 tea 样本覆盖 `fluidTag` + `heatRequirement`、以及本地合成样本覆盖字符串 `count:"2"` / `chance:"0.35"` 的类型保真（单测，见第 5 节）。

## 4. 真实 Electron E2E

### 4.1 shapeless（1112，`e2e-pc2.mjs`）

- 环境：1112 / 43,474 物品 / 32,890 配方；目标 `alltheores:brass_dust`。
- 打开配方 → 面板显示 `$.category` 未建模字段与原文；诊断展示 `PARTIAL_RECIPE`。
- 双击材料 1 替换为 `minecraft:emerald` → `脏字段 1`、预览 `ingredients` 差异如 3.1。
- 检查：条目数、顺序、标签、产物、category 全部 `true`。
- 取消 → 面板消失；重新打开 → 预览等于原始文本。
- 关闭「无序合成」开关 → 卡片按旧路径载入：无试点面板、`.bench-cols` 出现、旧横幅与 5 个输入值（4 材料 + 产物）。
- 截图：`.cache/e2e-pc2-shapeless-1-panel.png`、`-2-edited.png`、`-3-reopen.png`、`-4-legacy.png`。

### 4.2 create:mixing（Construct，`e2e-pc2.mjs`）

- 环境：Construct 1.19.2 / 71,532 物品 / 32,793 配方（该包非既定基线，仅用于本阶段 E2E）；目标 `ae2:fluix_crystal`（Create 卡片在第 5 页，E2E 自动翻页）。
- 打开配方 → `$.conditions` 未建模字段可见；材料 4 项含 tag/item/fluid(250 mB)+NBT。
- 修改产物数量 2→3、概率设为 25% → `脏字段 1`、`results` 变为 `{count:3,chance:0.25}`。
- 检查：`ingredients`、`conditions`、`type` 全部保持。
- 取消 → 重开原文；关闭「Create 混合」开关 → 旧列表路径载入，输入值 5 项（4 材料 + 产物）。
- 截图：`.cache/e2e-pc2-mixing-1-panel.png`、`-2-edited.png`、`-3-reopen.png`、`-4-legacy.png`。

两个 E2E 退出码均为 0，渲染进程异常列表为空。

### 4.3 P-C1 shaped 回归

P-C2 改动后再次运行 `.cache/e2e-pilot.mjs`（1112，Ad Astra shaped）：面板/未建模字段正常；网格编辑后 `preservedOtherCells/resultPreserved/conditionsPreserved` 均为 true；产物编辑后 conditions 保持；取消、重开原文、关闭开关旧路径均通过，退出码 0。

## 5. 自动化测试 + 命令

新增/扩展测试：

- `tests/schema/pc2Normalize.test.ts`（7）：shapeless 顺序/标签/count、mixing 流体/nbt/count/conditions、tea fluidTag+heatRequirement、字符串概率/数量、IE 自定义流体 extras+诊断、未编辑深比较等于原文。
- `tests/renderer/pc2DraftBridge.test.ts`（10）：两种草稿槽位、单字段回写、逐项保留、字符串数量/概率、fluidTag/extras、unknown 只读保护。
- `tests/renderer/benchStorePc2.test.ts`（9）：真实写入路径（writeAt/append/setValue）、dirty、取消、旧路径映射。
- `tests/main/openRecipe.test.ts`（12，其中 P-C2 新增 4）：schema 选择、注册表推断不覆盖试点、真实样本打开、诊断透出。

实际命令与退出码：

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `node node_modules/eslint/bin/eslint.js . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `node node_modules/vitest/vitest.mjs run` | 0 | 44 文件通过 / 2 跳过；486 测试通过 / 4 跳过 |
| `node node_modules/electron-vite/bin/electron-vite.js build` | 0 | — |
| `RUN_REAL_PACK=1 … tests/scanner/realPack.test.ts` | 0 | 3 通过；43,474 物品 / 38,760 图标（89.2%）/ 32,890 配方 / 426 类型 / 5,334 partial / 295 jars；首扫 33.0s，缓存 757ms，二次 795ms |
| `RUN_REAL_PACK=1 … tests/recipes/realPack.test.ts` | 0 | 1 通过；32,890 / 426 / 5,334，5.4s |
| `PACK=1112 … node .cache/e2e-pc2.mjs` | 0 | shapeless 全部断言 true |
| `PACK=Construct … node .cache/e2e-pc2.mjs` | 0 | mixing 全部断言 true |

过程中失败并修复：首轮 tsc 的 `GenerationChannel` 值写错与测试未用 import；E2E 首轮 mixing 找不到卡片（BrowseView 分页，仅第一页 6 张），改为自动翻页；首轮全量测试在**并行运行 tsc/eslint 时** `virtualFilter` 最坏耗时阈值（<16ms）失败一次，单独重跑两次均通过（未放宽阈值；并行 CPU 争用导致）。

## 6. 未运行 / 已知限制

- **真实 UI 冲突按钮**（reload/keep-mine/save-copy）未运行；P-C1 的单测仅覆盖 generic 逻辑，P-C2 未新增真实 UI 冲突验证。按用户要求不修改只读整合包，未来用开发环境专用模拟。
- 提交/写盘未实现（P-C3 才接生成）。
- 真实 Electron 只覆盖 fluix（conditions + fluid + count）；tea 的 `fluidTag/heatRequirement`、chance 字符串/数字、IE 自定义流体均为**真实/合成样本单测**，未逐一走 UI。
- `create:mixing` 未找到带概率的真实配方，概率测试使用仓库内合成样本（已在夹具 `source` 标注）。
- 不是所有无法表达的嵌套配方（nested）都支持：含无 id 引用的非 shaped 草稿会进入只读保护，不提供编辑。
