# P-C 接入设计：把规范化模型接进「配方浏览 → 工作台」

状态：**设计评审稿**。本文件批准前不改 benchStore / WorkbenchState / IPC；本轮只做了纯函数层的专项补强（见 §10）。
基准：`docs/schema-设计.md`、`docs/KubeJS配方工坊-需求规格-完整版.md`、当前 `src/` 实况。

---

## 1. 现状调用链（逐处核对过）

```
侧栏点击物品
  → BrowseView 查 recipes:byOutput/byInput（主进程 recipeIndex，返回 RecipeRecord 摘要）
  → 点卡片「载入工作台」：BrowseView.tsx:164 `load(record, layoutFor(record), record.type)`
  → benchStore.loadFromRecipe(record, layoutKind, typeId)   // store/benchStore.ts:211
        · shaped：record.inputs 按顺序填进 9 格（忽略原始 pattern 的位置与 key 字符）
        · 其他：record.inputs/outputs 转 SlotValue 列表
        · 只写 values，没有任何原始字段（energy/time/未知键）——这就是「载入即丢」的位置
  → CodePane 监听 benchStore 变化 → codegen:preview（主进程 preview.ts：validateSemantics + emitScript/emitDatapack）
```

其它相关事实：

- `RecipeRecord` 只有摘要：`uid/recipeId/type/outputs/inputs/source/sourcePath/partial`（+`jarPath/entryPath`）。**没有 raw、没有位置、没有未知字段**。
- 原始 JSON 只能用 `recipes:full` → `lazy.readFullRecipe(record)` 按 uid 惰性读（jar 读一条关一次；`kubejs` 脚本记录用 `reconstructFromRecord` 重建，本身就不完整）。
- `WorkbenchState` 是通用字典（`values/modifiers/gridRows/gridCols/steps`），撤销用整份快照（100 步）。
- `codegen/preview` 只消费 `WorkbenchState`；`buildRecipeJson` 只兜底「用户填过但 schema 未声明」的键，**不兜底原始 JSON 里从未进过 values 的键**。
- 工作台没有「草稿基线 / 脏字段 / 冲突」概念，`loadedFrom` 只是提示条字符串。

**结论**：P-C 的接入点只有两个——`载入`（record → 原始 → 规范化 → 草稿）与`生成前`（草稿 → 原始结构 + 未建模字段回写）。其余链路（扫描、索引、查询、预览渲染）不动。

---

## 2. 目标与非目标

**目标**
1. 载入配方时以**原始 JSON 为准**建立规范化模型与草稿，而不是靠摘要猜。
2. 只改一个字段时，其它已建模字段与未建模字段逐值保留；未编辑时可直接返回原文/原始结构。
3. 未知类型、partial、原始数据缺失、kubejs 动态脚本都有明确降级路径，不静默。
4. 草稿有基线（`rawHash`），原始变化不覆盖用户编辑。
5. 按类型灰度接入，随时可回退到现有 `loadFromRecipe`。

**非目标（本轮不做）**
- 不改 `RecipeRecord` / 倒排索引 / 扫描 / 缓存 / 搜索 / 虚拟过滤 / ProbeJS。
- 不实现代码生成器；P-C 阶段只在「草稿 → 结构化 JSON」层验证不丢字段，生成器仍独立排期。
- 不替换 `WorkbenchState`；只在它旁边加草稿元信息。

---

## 3. 适配层接口

### 3.1 主进程：`recipes/openRecipe`

新增（**加法**）IPC `recipes:open`，输入 `{ uid }`，输出：

```ts
interface OpenedRecipe {
  record: RecipeRecord                 // 回给 UI 的摘要（卡片头）
  schema: NormalizedSchema | null      // 选中/降级后的 schema
  schemaSource: 'pinned' | 'plugin' | 'builtin' | 'probejs' | 'inferred' | 'generic'
  raw: { json: unknown; rawText: string } | null   // 原始（lazy 读到才有）
  normalized: NormalizedRecipe | null              // raw+schema 才有
  diagnostics: SchemaDiagnostic[]      // 含 RAW_MISSING / TYPE_UNMAPPED / PARTIAL_* 等
  notes: string[]
}
```

实现位置：`src/main/recipes/openRecipe.ts`（新）+ `handlers/recipeHandlers.ts` 注册 1 个通道。
职责：`lookup(uid)` → `readFullRecipe`（含 stale/损坏错误转诊断，不抛穿）→ `selectSchema(type)` → `normalizeRecipe`。
**它不碰扫描、不写缓存、不登记 scanControl。**

### 3.2 Schema 选择策略（`recipes/selectSchema.ts`，纯函数）

优先级沿用注册表现有顺序：**用户钉住 > 插件 > L0 > L2 > L1**。

| 情况 | 结果 | UI 表现 |
|---|---|---|
| 命中 schema（任意层） | 用它；`schemaSource` 标注 | 正常表单 + 来源角标 |
| 未命中，但 `typeUniverse`/样本存在 | 交给 L1 反推（若未构建则用 generic） | 「本包实测」角标；低样本黄条 |
| 完全未知类型 | `generic` 兜底 schema（无 slots，全部进 unknowns） | 「通用模式」+ JSON 编辑 |
| 原始缺失（ENOENT/损坏） | `normalized=null`，只回 `record` | 明确提示「源文件已失效，仅能查看摘要」，不假装可编辑 |

### 3.3 渲染端：`draftBridge`（新，纯函数）

```ts
interface LoadedDraft {
  workbench: WorkbenchState          // 仍是现有结构
  meta: RecipeDraftMeta              // draftVersion / base{uid,rawHash} / dirtyFields[]
  passThrough: UnknownField[]        // 未建模字段（不进 values，生成前回写）
  banner: { level: 'info' | 'warn'; text: string }[]
}

normalizedToDraft(normalized, schema, record): LoadedDraft
markDraftDirty(meta, slotKey): RecipeDraftMeta     // 复用 draftState
resolveDraftConflict(meta, currentHash): 'clean' | 'conflict' | 'no-base'
```

映射规则（与 P-B 模型一一对应）：

| NormalizedValue | WorkbenchState |
|---|---|
| `item/tag/fluid/registry` | `SlotValue`（`kind/id/count|amount/chance/nbt`） |
| `scalar` | number/boolean/string/null |
| `list`（含 grid） | `SlotValue[]`；shaped → `values.grid`（按原 pattern 行列） |
| `struct` | 拍平成 `parent.child` 键（`itemInput.ingredient`），与现有「struct 子字段 = 点路径」约定一致 |
| `unknown` | 不进 values；在 `passThrough` 里保留 |
| `nested` | 暂按 `unknown` 处理（Create 序列组装在 P-F 专用编辑器） |

> 兼容性关键：`LoadedDraft.workbench` 与现在的 `WorkbenchState` **完全同构**，所以 CodePane、撤销快照、schema 表单都不需要改。

### 3.4 生成前的回写路径（**本阶段只验证接口，不接**）

`draftToJson({workbench, meta, passThrough, normalized})`：

1. `dirtyFields` 为空 → 直接返回 `normalized.source.raw` 深拷贝（或 rawText，文本级）。
2. 有脏字段 → 以原始 JSON 深拷贝为底，只重写这些字段（P-B `denormalizeRecipe` 已实现）。
3. `passThrough` 的未建模键已在原始底里，天然保留。
4. 若 `checkDraftConflict(meta, currentRawHash) === 'conflict'` → 阻断生成，提示三选（见 §5）。

---

## 4. 特殊输入的处理矩阵

| 输入情况 | 载入行为 | 可见提示 |
|---|---|---|
| 有 schema、raw 可读 | 规范化 → 草稿；未建模字段进 `passThrough` | 「N 个字段未建模，生成时原样保留」 |
| `partial: true`（任何原因） | 照常载入；`partial.reasons` 决定文案 | 「解析不完整」+ 原因（`dynamic-script` 单独文案） |
| kubejs 脚本记录（无原始文件） | `lazy` 返回重建摘要 → `normalized.source = reconstructed`，标 `dynamic` | 「原始脚本含动态逻辑，仅载入可静态解析的部分」 |
| 未知类型 | `generic` schema，`values` 留空，整段 raw 进 JSON 编辑器 | 「未识别类型，可用通用模式编辑 JSON」 |
| 原始缺失/损坏 | 不建草稿，只显示摘要 | 「源文件已失效，无法载入完整配方」 |

**明确不承诺**：`generic` 模式编辑后的生成仍走「原样 + 用户改动的 JSON」，不做语义校验（与规格 §3.6.8 的三级降级一致）。

---

## 5. 草稿生命周期

```
open(uid)
  ├─ raw 缺失 → 只读摘要（结束）
  └─ normalize → createDraftMeta(base{uid, rawHash}, dirtyFields=[])
        │
        ├─ 用户编辑槽位 → markDraftDirty(meta, slotKey)  （只有真实编辑才进 dirtyFields）
        ├─ 撤销/重做 → 快照里同时包含 workbench 与 meta（现有 snapshot 机制加一个字段）
        ├─ 取消（Esc/关闭/切换配方）
        │     └─ 丢弃 draft；raw 与 normalized 不动；不写任何缓存
        ├─ 重新载入同一 uid
        │     ├─ currentRawHash === base.rawHash → 保留草稿（先询问是否丢弃）
        │     └─ 不同 → conflict：三选一
        │         ① 以新原始为准（rebaseDraft + 清空 dirtyFields）
        │         ② 保留我的修改（base 更新为新 hash，dirtyFields 保留，风险提示）
        │         ③ 另存为副本（新 uid，原配方不动）
        └─ 生成/预览 → draftToJson（§3.4）
```

约束：

- `dirtyFields` 只在用户操作时变化；**载入、规范化、撤销重做本身不写脏**。
- 冲突时默认**不自动覆盖**；任何自动 rebase 都视为缺陷。
- 取消编辑只丢弃草稿对象，`RawSource.raw` 与磁盘文件都不变（P-B 已用深冻结验证）。

---

## 6. 渐进式接入（按类型灰度）

| 步骤 | 范围 | 开关 | 退出条件 |
|---|---|---|---|
| **P-C1 试点** | 仅 `minecraft:crafting_shaped`：点击卡片优先走 `recipes:open`；其余类型仍用现有 `loadFromRecipe` | `ui.benchV2: string[]`（默认 `[]`，UI 设置页可开关，仅供开发期） | 试点类型的「载入 → 改一格 → 预览」与旧路径结果一致，且未建模字段在草稿里可见 |
| **P-C2 扩面** | 加 `crafting_shapeless`、`create:mixing`（含流体/标签/字符串概率） | 同上，逐类型加入 | 3 类真实样本的「改一个字段，其它不变」通过；旧路径仍兜底 |
| **P-C3 回写** | 生成前改用 `draftToJson`（未知字段回写）；此步与代码生成器 P-F 同批评审 | `ui.benchV2Emit` | 「未编辑 ≡ 原文」「改一处其余不变」在真实包抽样通过 |

切换逻辑集中在 `benchStore.loadFromRecipe` **入口的一行判断**（类型在 `benchV2` 列表里 → 走新路径，否则原逻辑）。回滚 = 清空列表，无需改代码。

**不做的事**：不在 P-C1 阶段删掉旧 `loadFromRecipe`；不把 `passThrough` 塞进 `values`（避免污染表单与撤销快照体积）。

---

## 7. 涉及文件与接口变化

| 文件 | 变化 | 风险 |
|---|---|---|
| `src/main/recipes/openRecipe.ts`（新） | 组织 lazy 读取 + schema 选择 + normalize | 低；纯新增 |
| `src/main/recipes/selectSchema.ts`（新） | 纯函数：type → schema/降级 | 低 |
| `src/main/handlers/recipeHandlers.ts` | 注册 `recipes:open`（加法） | 低；旧通道不动 |
| `src/shared/ipc.ts` | `recipes:open` 的请求/响应类型（加法） | 低；`INVOKE_CHANNELS` 追加 |
| `src/renderer/src/store/draftBridge.ts`（新） | normalized ↔ WorkbenchState 纯函数 | 低 |
| `src/renderer/src/store/benchStore.ts` | 入口加灰度判断；`loadedFrom` 旁边加 `draftMeta`/`passThrough`（**P-C1 才动，且只加字段**） | 中；撤销快照需带上 meta |
| `src/main/codegen/preview.ts` / emit | **P-C3 才动**：优先用 `draftToJson` 的结果 | 中；需回归现有 codegen 测试 |

不改：扫描器、`cache.ts`、items/recipes 查询、ProbeJS、`WorkbenchState` 结构本身。

---

## 8. 测试计划

**纯函数（P-C1 前必须绿）**
1. `recipes:open` 的 schema 选择矩阵（命中/未命中/未知/raw 缺失）；
2. `normalizedToDraft` ↔ `draftToJson` 往返：3 个试点类型 ×（未编辑 / 改一个字段 / 改网格）；
3. `passThrough` 在草稿与回写之间不丢；
4. 冲突：hash 变化 → 三选一逻辑（用纯函数模拟，不碰 UI）；
5. 取消编辑：原始与 normalized 均不变（现有深冻结用例扩展）。

**集成（P-C1）**
6. 试点类型：点卡片 → 草稿 → 预览与旧路径**逐字符一致**（未编辑时）；
7. 非试点类型：行为与现在完全一致（回归现有 `loadFromRecipe` 测试）；
8. 真实包 8 类抽样：`crafting_shaped / shapeless / create:mixing / IE arc_furnace / Mekanism infusing / reaction / AE2 inscriber / Occultism ritual` 的「读 → 规范化 → 草稿 → 回写」；其中 IE/AE2/Occultism 只验证「未知字段不丢 + 明确提示」，不承诺结构化编辑。

**回归**
9. `vitest run` 全量；`RUN_REAL_PACK=1 tests/scanner`（32,890 / 5,334 / 426 基线不得变化）；`build`；真实应用 E2E（导入→扫描→浏览→载入→预览）。

---

## 9. 回滚策略

- **功能开关**：`ui.benchV2` 为空数组即完全回到旧行为；不涉及数据迁移。
- **IPC 加法**：`recipes:open` 不被调用时零影响；旧 `recipes:full` 保留。
- **草稿不持久化**：P-C1/C2 的 `draftMeta` 只活在内存，重启无残留 → 无需回滚格式。
- **回写未启用**：P-C3 之前生成仍走今天的 `buildRecipeJson`，不存在「新逻辑写坏旧配方」的窗口。
- **缓存不动**：本阶段不新增缓存键、不改 `PARSER_VERSION`。

---

## 10. 本轮已做的纯函数补强（为满足专项验证，未接 UI）

- `NormalizedStruct.unknowns`：struct 内部未认领子键收集与回写（`itemInput.slotHint` 类字段不再丢）。
- 引用键按实际出现识别：`{tag}`/`{gas}`/`{slurry}`/`{pigment}`/`{fluid}`/`{item|id}`；注册表槽保持 registry，`refKey` 记录原键名（Mekanism 的 `tag`/`gas` 形态可原样还原）。
- struct 子字段支持列表值（`itemInput.ingredient: [...]`）。
- 新增 `tests/schema/structural.test.ts`：覆盖 Mekanism 灌注/反应、Create 混合、struct 未知子键、Hash 行为与冲突、取消编辑。

**仍未解决（设计层面记录）**
1. `nested`（配方套配方）只保留 `typeId`，序列组装仍是 P-F 专用编辑器；
2. `generic` 模式不做语义校验，只保证不丢数据；
3. 未知值的「更深层」未认领子键只在所在层收集一层（例如 unknown 对象内部的键整体作为值保留，不再展开成多个条目）；
4. 草稿持久化（跨重启恢复未保存草稿）不在本设计内。

---

## 11. P-C1 实施记录（crafting_shaped 试点，2026-10-31）

本节记录实际落地时与设计稿不同、或设计稿没预见到的点，均为保证「原始为权威 + 不丢未建模字段」而做的最小改动。

### 11.1 新增/修改文件

| 文件 | 职责 |
| --- | --- |
| `src/main/recipes/selectSchema.ts` | 只内置 `minecraft:crafting_shaped` 试点 schema；注册表 → 试点 → generic 三级选择 |
| `src/main/recipes/openRecipe.ts` | 打开配方：原始 JSON 为权威；不可读返回 `raw-missing/parse-failed` 且 `raw/normalized=null`，不用摘要冒充 |
| `src/main/handlers/recipeHandlers.ts` | `recipes:open` IPC 注册与日志 |
| `src/renderer/src/store/draftBridge.ts` | `normalizedToDraft / applyDraftToNormalized / draftPreview / pilotEnabled`；未知字段走 `passThrough`，不混入可编辑 values |
| `src/renderer/src/store/benchStore.ts` | 草稿状态、`loadOpenedRecipe`、冲突三选一、`cancelDraft`、`getDraftPreview`；`record` 只控历史快照，真实编辑一律记脏 |
| `src/renderer/src/views/bench/PilotDraftPanel.tsx` | 面板：来源/hash/脏字段、未建模字段只读列表、预览、取消、冲突按钮 |
| `src/renderer/src/views/bench/PilotGridEditor.tsx` | 试点 shaped 网格编辑（固定 44px 格子）+ 产物槽，复用 ItemSlot/选择器；挂载 ItemPicker/CountEditor 浮层 |
| `src/renderer/src/views/BenchView.tsx` | 仅在草稿为 shaped 时显示试点网格；其余情况完全保留旧 lite 列表 |
| `src/renderer/src/views/BrowseView.tsx` | 白名单命中才走 `recipes:open` + 草稿；否则旧 `load()` 原样 |
| `src/renderer/src/views/SettingsView.tsx`、`uiStateStore.ts`、`types.ts` | `ui.benchV2` 试点开关（空数组 = 完全回旧路径） |
| `src/shared/normalize.ts` | 网格回写改进（见 11.2）；字符串标签输出 `#ns:tag` |
| `src/shared/canonicalJson.ts` | 去掉 `node:crypto`/`Buffer`，改为同结果纯 JS SHA-1 + TextEncoder，渲染端可打包 |
| `src/renderer/src/views/bench/slotAddress.ts` | `gridSet` 改为不可变复制（见 11.3） |

### 11.2 网格回写（验收 A 的硬约束）

- 未编辑：`draftPreview` 直接返回 `rawText`，不重建 JSON。
- 编辑一个格子：只重写 `grid` 字段；旧 `key` 的「引用 → 字母」映射优先复用，未改动材料不会换字母。
- 逐格比较：未改动的格子复用规范化原值，保留 `{item:...}` / 裸字符串 / 字符串数量（如 `"2"`）的原始形态。
- 工作台网格宽度显式传入 `denormalizeRecipe({gridSize})`：只按「原 pattern 行列」与「最后一个非空材料」重建，UI 补齐的空格不会被写成 recipe 的空行/空列（1×2 配方不会被改成 9 列）。
- 字符串标签回写为 `#ns:tag`，修复了此前可能输出裸 `#` 的缺陷。

### 11.3 真实 UI 暴露并修复的两个既有缺陷

1. **`commitOps` 的 `gridSet` 原地修改 store 数组**：`applyOps` 浅拷贝后直接改 `values.grid`，导致 `same(bench, next)` 看到同一引用而判定“无变化”，既不记脏也不进撤销栈。已改为复制后再写，并加 `writeAt` 回归测试（旧数组必须保持不变）。
2. **lite 工作台没有网格/浮层**：`BenchView` 仍是 P1 的输入/输出列表，schema 布局组件（`BenchLayout/ShapedGrid`）尚未接线，且直接用会触发 React #185（其 ResizeObserver 宽度反馈在 lite 外壳里不稳定）。P-C1 因此只新增固定尺寸的 `PilotGridEditor`，不提前接入 P6 布局；原 lite 路径保持原样。

### 11.4 验证证据

- 单测：`tests/main/openRecipe.test.ts`、`tests/renderer/draftBridge.test.ts`、`tests/renderer/benchStorePilot.test.ts`、`tests/shared/canonicalJson.test.ts`；
  覆盖原始不可读、generic 降级、kubejs 重建、未建模字段、单字段回写、字符串标签/计数、取消、冲突 reload/keep-mine/save-copy、旧路径。
- 真实应用 E2E（`.cache/e2e-pilot.mjs`，只读 1112 包）：白名单开 → 打开 ad_astra 酸雨单元 shaped 配方 → 面板显示 `$.conditions` 未建模字段 →
  网格双击替换 `mekanism:module_base → minecraft:emerald` → 脏字段 1、pattern `I#I/IBI/PPP`、result/conditions/其余格子逐值保持 →
  再双击产物改为 `minecraft:diamond ×1` → 脏字段 2（`grid`+`result`，验证 UI `outputs` → 规范化 `result` 映射），网格与 conditions 均保持 →
  取消后草稿消失且原始数据未动 → 关闭白名单后同一配方走旧列表路径、试点面板不出现、旧「已载入现有配方作为模板」提示仍在。
- 冲突三选一与「取消后重开」已由单测覆盖；**未在真实应用里制造磁盘文件变化**（测试整合包只读），因此冲突按钮的真实点击未运行。

### 11.5 本阶段明确未做

- 不接 `crafting_shapeless`/`create:mixing`（P-C2），不接生成器/写盘（P-C3/P-F）；
- 不做草稿持久化；不改扫描、缓存、搜索、ProbeJS；
- 未改 `BenchView` 的旧表单/撤销/预览行为（除试点 shaped 分支与 `setValue` 脏标记修复）。

---

## 12. 验收点 A 补证：新旧路径对同一真实配方（2026-10-31）

评审要求「用同一份 `minecraft:crafting_shaped` 原始配方，分别走旧路径与新路径，比较同一处修改」。为此新增
`tests/renderer/pc1PathParity.test.ts`（6 条）与真实样本 `tests/fixtures/schema/pc1-parity-raw.json`：
`ad_astra` 的 `aeronos_ladder`（`["# #","###","# #"]`）、`aeronos_stairs`（`["#  ","## ","###"]`）、
`aeronos_door`（`["##","##","##"]`），均取自 `ad_astra-forge-1.20.1-1.15.20.jar`（1112 包）。

实测结论：

| 观察 | 旧路径（`loadFromRecipe` 摘要） | 新路径（`recipes:open` → 草稿） |
| --- | --- | --- |
| 格子位置 | 把 inputs 连续拍平到 0..N-1；ladder 实际应在 0/2/3/4/5/6/8，被填成 0..6 | 按 pattern 逐行还原，空格保持为空 |
| 3×2 网格（door） | 填成 0..5，与真实 0/1/3/4/6/7 不一致 | 0/1/3/4/6/7，2/5/8 为空 |
| `key` 字母 / 引用形态 | 不可见（只保留 id/kind） | 保留字母映射与 `{item}` / `{tag}` 形态 |
| `conditions` / `category` / `show_notification` | 丢 | 原样保留 |
| 草稿与预览 | `draft=null`、预览 `null`，且「写入文件」按钮为 `disabled`（本版本旧路径无回写能力） | 未编辑时预览 == 原文（pretty 文本） |
| 同一处修改 | 无输出可比 | 仅被改格子不同；pattern 行宽、其余 key、result、未建模字段逐值不变 |

因此：**旧路径不能作为完整性基线**；新路径是原始数据的超集，且对同一处修改的解释与手写 JSON 一致。
stairs 用例另外证明行宽不齐的 pattern 在编辑后仍保持 3 行、空格未被压实。

顺带把试点内置 schema 抽到 `src/shared/pilotSchemas.ts`（主进程 `selectSchema` 与测试共用同一份），
避免测试另抄 schema 造成漂移；`selectSchema` 的对外行为不变（`isPilotType` 仍从其导出）。
