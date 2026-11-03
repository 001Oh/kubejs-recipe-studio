# 配方 Schema 设计（评审稿）

状态：**设计评审稿**，不含实现。批准后再分步落地（见 §9），本阶段不改任何 `src/` 代码。
基准：`docs/KubeJS配方工坊-需求规格-完整版.md`、`docs/架构决策.md`、当前 `src/` 实况（下附证据）。

---

## 0. 现有实现盘点（以实际代码为准）

### 0.1 物品侧

| 数据 | 位置 | 形状 | 备注 |
|---|---|---|---|
| 物品索引 | `studio-cache/<hash>/items.json` | `ItemEntry[]`（`shared/types.ts:53`） | 全量含虚拟物品；含 `confidence/verified/hasIcon/iconKey/pyFull/pyInitials/virtual/hasRecipe` |
| 搜索语料 | 进程内存（`scanner/itemIndex.ts`） | `SearchCorpus` | 由 items 构建，含 `virtualMask`；查询期过滤 |
| 注册表导入 | `scanner/probeImport.ts` | 合并进 items，置 `verified` | 只写 items.json，不动 meta |

### 0.2 配方侧（三层里只有第一层和第三层）

| 数据 | 位置 | 形状 | 关键事实 |
|---|---|---|---|
| 摘要索引 | `recipes.json`（`recipeIndex.ts:135` `PersistedRecipes`） | `{builtAtMs, elapsedMs, types[], records: RecipeRecord[]}` | 只存摘要：`outputs/inputs` 各是 `RecipeIO{id,count,kind,chance}` 的扁平列表，**没有位置、角色、字段路径** |
| 原始配方 | jar / datapack / kubejs 脚本，按需读 | JSON 文本 | `lazy.readFullRecipe(uid)` 惰性读，读一条关一次；从不常驻 |
| 启发式解析 | `recipes/heuristics.ts` `HeuristicResult` | `{outputs, inputs, partial, unknownIds}` | 纯函数、无 schema；`partial` 是单一布尔；`unknownIds` 是「没归类的 id」，与「物品索引里没有」不是一回事 |
| 编辑状态 | `WorkbenchState`（`shared/types.ts:91`） | `values: BenchValues` 通用字典 + `modifiers/grid/steps` | 渲染由 `RecipeTypeSchema` 解释；快照式撤销 |
| Schema | `RecipeTypeSchema` / `RecipeSlotSchema`（`types.ts:199/151`） | 声明式 | 含 `layoutKind/emitTarget/slots/outputs/extraFields/compound/sugarSupported/emitShape` |
| Schema 注册表 | `schema/registry.ts` | 四层：plugin > builtin > jar > inferred；`augment()` 做字段校验补全；`applyMerge()` | 有 `source/sampleCount/lowConfidence`，**没有 revision/version** |
| 生成 | `codegen/{channel,emitScript,emitDatapack,jsonValue,values,validate}.ts` | 由 `WorkbenchState` 直接产出 | `buildRecipeJson` 有「schema 未声明但用户填了 → 原样写出」的兜底，但没有「原始 JSON 里 schema 没覆盖的字段」的兜底 |

### 0.3 查询接口（必须保持不变的对外面）

`recipes:byOutput/byInput/full/stats`、`items:query/get/mods`、`schema:list/get/registryOptions/coverage/pin/unpin`、`favorites:set`、
`codegen:preview/write/checkTarget`、`scripts:list/rename`。它们的返回类型已冻结，Schema 演进**只允许加可选字段**。

### 0.4 盘点结论：缺的是「中间那层」

现在从原始配方到编辑状态是**跳跃**的：
`懒读原始 JSON` ──(heuristics，丢位置/角色/未知字段)──▶ `RecipeRecord 摘要` ──(benchStore.loadFromRecipe，只用 inputs/outputs 摘要)──▶ `WorkbenchState`。

后果（真实风险，不是假设）：

1. 载入一条 IE 电弧炉到工作台时，`energy/time/slag/secondaries` 只存在于原始 JSON；摘要里没有，编辑字典里也没有 → **用户改一个材料，这些字段就消失**，除非手填。
2. `partial: true` 的 5,334 条配方没有「为什么 partial」的记录，也没有保留原始片段的引用；载入后无法判断缺的是哪一段。
3. `unknownIds` 的语义（未归类 id）与 UI 上「⚠ 未知物品」（索引里没有）混用，`RecipeRecord.unknownIds` 的注释写的是后者。
4. Schema 没有版本号与迁移链：`customRecipeTypes.json` 里用户钉住的 schema 一旦字段结构变化，无法安全加载。

**所以本设计的核心是新增一层「规范化数据（NormalizedRecipe）」，并给 Schema 加版本与约束能力，同时不改变任何现有查询接口。**

---

## 1. 目标与非目标

**目标**
1. 明确三层：原始数据（Raw）/ 规范化数据（Normalized）/ 编辑状态（Draft），三者之间可逆、可校验。
2. 任何「schema 没有显式建模的字段」都**默认保留**，编辑与再生成时原样写回（partial 不丢数据）。
3. Schema 自带版本、约束与来源，支持校验、错误定位、迁移与向后兼容。
4. 对 11 种字段 kind（现有 `FieldKind`）给出统一的值模型（含 NBT、blockstate、嵌套配方）。
5. 为后续代码生成提供稳定输入：生成器只消费 Normalized/Draft + Schema，不再自己解析原始 JSON。

**非目标（本阶段不做）**
- 不改 `RecipeRecord` 摘要结构、不改倒排索引、不改 items/搜索/虚拟过滤/ProbeJS 导入。
- 不实现全部 L0 内置库；不实现代码生成器；不做大规模重构。
- 不引入数据库、不改缓存目录与失效键（除版本号按 §7 规则 bump 外）。

---

## 2. 三层数据模型

```
        ┌──────────────────────────── RawSource（原始，不可变）────────────────────────────┐
        │ uid / source(jar|datapack|kubejs) / locator{jarPath,entryPath,absPath,scriptRange} │
        │ raw: unknown | rawText: string | dynamic: boolean（脚本里含变量/插值时为 true）      │
        └───────────────────────────────────┬───────────────────────────────────────────────┘
                                            │  normalize(schema, raw)
                                            ▼
        ┌──────────────────────── NormalizedRecipe（规范化，可重建）────────────────────────┐
        │ typeId / schemaRef{id, revision, source} / slots: NormalizedSlot[]                 │
        │ unknowns: UnknownField[]（原始里未被 schema 认领的键，保存 JSON 路径与原值）           │
        │ partial{ isPartial, reasons: PartialReason[] } / rawHash（用于脏检查）              │
        └───────────────────────────────────┬───────────────────────────────────────────────┘
                                            │  toDraft() / fromDraft()
                                            ▼
        ┌──────────────────────── RecipeDraft（编辑状态，可撤销）──────────────────────────┐
        │ 现有 WorkbenchState 演进：values + modifiers + steps + grid                       │
        │ 新增 base{uid, rawHash} / dirtyFields[] / unknownPassthrough（默认整包带回）        │
        └──────────────────────────────────────────────────────────────────────────────────┘
```

关键不变量：

- **I1 原始不可变**：`RawSource` 一旦读取就只读；规范化与编辑都不回写它。
- **I2 未认领即保留**：凡 schema 未声明、但原始 JSON 里存在的键，必须进 `unknowns` 并在生成时写回（见 §4）。
- **I3 归一化可逆**：`normalize(raw) → emitJson` 在**未编辑**时必须与 `raw` 结构等价（键序除外），由往返测试守住（§8.2）。
- **I4 摘要只读**：`RecipeRecord` 继续是「查询用摘要」，不承担编辑，不新增必填字段。
- **I5 Draft 可无 base**：新建配方（没有原始）时 `base = null`，`unknowns` 为空，行为与今天一致。

---

## 3. 值模型（NormalizedValue）

统一 11 种字段 kind 的**值**表示，替代现在 `SlotValue` 只覆盖 4 种的局面（`SlotValue` 继续作为「UI 槽位值」保留，Normalized 用它 + 额外形态）。

```ts
type NormalizedValue =
  | { kind: 'item';    id: string; count: number; nbt?: unknown }                    // 原语 1/2/8
  | { kind: 'fluid';   id: string; amount: number }                                  // 原语 3
  | { kind: 'tag';     id: string; count?: number }                                  // 引用（标签）
  | { kind: 'registry'; registry: string; id: string; amount?: number }              // 灌注/气体/浆液/色素
  | { kind: 'scalar';  value: string | number | boolean }                            // 原语 1
  | { kind: 'list';    of: NormalizedValue[] }                                       // 原语 4
  | { kind: 'struct';  fields: Record<string, NormalizedValue> }                     // 原语 5
  | { kind: 'nested';  typeId: string; slots: NormalizedSlot[]; unknowns: UnknownField[] } // 原语 6
  | { kind: 'blockstate'; block: string; props: Record<string, string | string[] | { min: string; max: string }> } // 原语 9
  | { kind: 'unknown'; path: string; value: unknown }                                 // 兜底，不丢数据

interface NormalizedSlot {
  key: string                 // schema.slots[i].key
  value: NormalizedValue | null
  /** 值在原 JSON 里的位置，校验报错与未知字段回写都靠它 */
  path?: string               // 如 "$.results[0].chance"
}

interface UnknownField {
  path: string                // JSON 路径，数组用 [i]
  value: unknown              // 原值（已是 JSON 安全类型）
  reason: 'not-in-schema' | 'parse-failed' | 'dynamic'
}
```

**配对字段**（`{item,count}` / `{output,chance}` / `{fluid,amount}` / `{tag,amount}`）在 Normalize 阶段就合并成单值 + `path` 记录两处原位置；
`compound` 只在生成时用于分配写回键名，**不再作为数据结构**。

---

## 4. 未知字段与 partial：不丢数据的完整策略

### 4.1 判定

- schema 没声明、但原始 JSON 里出现的顶层/嵌套键 → `unknowns.push({path, value, reason:'not-in-schema'})`。
- 该键的值如果能被启发式识别成引用（`{item}`/`{tag}`/`{fluid}`…），额外产出**影子摘要**（供 UI 显示，但不进编辑表单）。
- 原始 JSON 解析失败 / kubejs 脚本含动态节点（`dynamic: true`）→ `partial.reasons` 记 `parse-failed` / `dynamic`，并且**原始文本整段保留**在 `RawSource.rawText`。

### 4.2 partial 原因枚举（替代当前单一布尔）

```ts
type PartialReason =
  | 'unmapped-type'      // type 在 schema 里不存在，只能走通用通道
  | 'unclaimed-keys'     // 有 schema 未覆盖的键（已进 unknowns，仍标 partial 以示提醒）
  | 'unknown-ref'        // 引用未归类（现 unknownIds 的真实语义）
  | 'dynamic-script'     // kubejs 脚本含变量/插值/函数调用
  | 'parse-failed'       // JSON 坏 / 读不到
  | 'ambient-conditions' // 依赖结构/维度/研究等游戏内状态
```

`RecipeRecord.partial` 保持布尔（兼容），新增可选 `partialReasons?: PartialReason[]`（加法）。摘要据此可以分类统计（技术债 #3）。

### 4.3 写回规则

1. 生成时先按 schema 写已建模字段；
2. 再按 `path` 原样回写 `unknowns`（同路径冲突时以用户编辑值为准，且记一条 WARN 诊断）；
3. kubejs `dynamic` 配方：只允许「整段原样保留 + 用户显式修改已识别的字面量」，不允许编造。

> 示例（IE 电弧炉，真实样本见 §7.3）：`energy/time/slag/secondaries` 都属于 `not-in-schema` 时，用户改材料后再次生成，这四个键必须原值出现。

---

## 5. Schema 定义演进（RecipeTypeSchema v2）

在现有字段基础上**只加可选字段**，保证插件与已存的钉住 schema 仍可加载：

| 新增字段 | 类型 | 作用 |
|---|---|---|
| `revision` | `number` | 该 schema 的修订号，任何语义变更 +1；迁移与「是否过期」判断用 |
| `fingerprint` | `string` | `hash(layout + slots(key/kind/emit) + outputs)`，用于检测「样本归纳结果变了」，缓存与 UI 角标可复用 |
| `preserveUnknown` | `boolean`（默认 true） | 是否回写未认领字段；只有明确声明「该类型只接受白名单」时才关 |
| `slots[].constraints` | 见下 | 通用约束，供校验引擎直接消费 |
| `slots[].emit` | `{ key?: string; shape: 'key'|'positional'|'object'|'scalar'; index?: number }` | 吸收并取代 `emitShape`/`compound` 的生成语义（旧字段保留兼容） |
| `slots[].presence` | `'required'|'optional'|'conditional'` | 比 `required?: boolean` 更精确（条件字段可配 `presenceWhen`） |
| `origins` | `{ field: string; layer: SchemaLayer }[]` | 记录每个字段来自哪层（plugin/builtin/jar/inferred），便于 UI 标注与冲突排查 |
| `emitTarget.kind` | `'sugar'|'custom'|'datapack-only'` | 显式表达通道能力，避免「null 就代表 custom」的隐式约定 |

约束对象：

```ts
interface SlotConstraints {
  min?: number; max?: number; integer?: boolean
  minItems?: number; maxItems?: number
  enum?: string[]                       // 与 choices 二选一，校验用
  pattern?: string                      // 如 id 形态 /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
  requiredIf?: string[]                 // 依赖字段（如 mode=inscribe 才要求 top）
  mustBe?: 'item' | 'fluid' | 'tag' | 'registry'   // 引用类型约束
}
```

> 与现有实现的关系：`registry` + `emitShape` + `compound` + `firstItemMust` 全部映射到上述结构（`emit.shape`、`constraints.mustBe`、`constraints.requiredIf`），旧字段保留读取兼容，新代码只读新字段。

---

## 6. 校验与错误定位

`Diagnostic` 升级为**加法**兼容（旧字段保留）：

```ts
interface Diagnostic {
  level: 'error' | 'warn' | 'info'        // 既有
  field?: string                          // 既有（schema slot key）
  message: string                         // 既有
  code?: DiagnosticCode                   // 新增：机器可判断
  path?: string                           // 新增：JSON 路径，精确到值
  hint?: string                           // 新增：怎么修
}

type DiagnosticCode =
  | 'REQUIRED_MISSING' | 'TYPE_MISMATCH' | 'ENUM_INVALID' | 'RANGE_INVALID'
  | 'REF_UNKNOWN_ITEM' | 'FLUID_AMOUNT_INVALID' | 'CHANCE_OUT_OF_RANGE'
  | 'UNKNOWN_FIELD_PRESERVED' | 'SUGAR_UNSUPPORTED' | 'NBT_INVALID'
```

校验器分三层，全部**只依赖 Normalized + Schema**（不读原始 JSON，保证可测试）：

1. 结构校验：约束对象逐条比对 → `REQUIRED_MISSING / TYPE_MISMATCH / ENUM_INVALID / RANGE_INVALID`；
2. 引用校验：`mustBe` 与物品索引存在性（只 warn）、流体量为正整数、概率区间；
3. 通道校验：字段 `sugarSupported=false` 被填 → 降级提示（沿用现有 `codegen/channel.ts` 语义）。

错误定位到 `slot.key` + `path`，UI 可直接把焦点移到具体槽位/输入框。

---

## 7. 版本演进与向后兼容

### 7.1 三个版本号，职责分开

| 版本 | 位置 | 何时 +1 | 影响 |
|---|---|---|---|
| `SCHEMA_FORMAT_VERSION` | `schemas.json` 顶层 | schema 的**存储形状**变化 | 旧文件读不出 → 重建（L0/L1/L2 可重算） |
| `PARSER_VERSION`（已有） | `cache.ts` | 启发式/图标/反推**语义**变化 | 物品+配方缓存作废 |
| `schema.revision` | 每个 `RecipeTypeSchema` | 该类型字段/约束/emit 变化 | 只影响该类型的草稿兼容性 |

### 7.2 迁移

- **缓存类**（`schemas.json`）：无迁移，版本不符即重建（数据可从 jar/样本重算）。
- **用户钉住类**（`customRecipeTypes.json`）：必须迁移。文件顶层加 `{formatVersion, schemas:[]}`；
  `migratePinnedSchema(old)` 按 `revision` 链式升级（`v1→v2` 只做字段搬家，如 `emitShape`→`emit.shape`），迁移失败**保留原文件**并标 `incompatible`，不静默丢弃。
- **草稿类**（`WorkbenchState` 若持久化）：加 `draftVersion`；版本高于当前程序 → 打开为只读并提示，不尝试猜测。
- **插件**：`PluginManifest` 增加 `schemaApi: '1'`；不声明视为 1；未知主版本 → 禁用该插件并 WARN（沿用「不兼容但可见」的既有规则）。

### 7.3 何时必须 bump PARSER_VERSION

只要「同一份 jar/脚本产出的摘要会变」就必须 bump：启发式规则、partial 判定、图标解析、schema 反推、**以及本次引入的 Normalize 逻辑**（因为它决定 unknowns/partial）。宁多勿少：多一次重扫（~36s 无头）远好过给出陈旧结果。

### 7.4 与缓存失效的关系（不变）

物品缓存仍只看 mods 签名+版本+PARSER；配方缓存加 extras；虚拟物品开关永不参与。本次设计**不新增**缓存键维度。

---

## 8. 数据结构示例

### 8.1 有序合成（干净类型）

原始：

```json
{ "type": "minecraft:crafting_shaped", "pattern": ["AA","AA"],
  "key": { "A": { "item": "minecraft:oak_log" } },
  "result": { "item": "minecraft:oak_planks", "count": 4 } }
```

规范化：

```json
{
  "typeId": "minecraft:crafting_shaped",
  "schemaRef": { "id": "minecraft:crafting_shaped", "revision": 3, "source": "builtin" },
  "slots": [
    { "key": "grid", "value": { "kind": "list", "of": [
      { "kind": "item", "id": "minecraft:oak_log", "count": 1 } ] }, "path": "$.key.A" }
  ],
  "unknowns": [],
  "partial": { "isPartial": false, "reasons": [] }
}
```

Draft：`values.grid = [SlotValue, null×8]`（沿用现有通用字典），`base = {uid, rawHash}`，`dirtyFields = []`。

### 8.2 Mekanism 冶金灌注（注册表 + 标量形态分歧）

原始（数据包形态）：

```json
{ "type": "mekanism:metallurgic_infusing",
  "input": { "amount": 1, "ingredient": { "item": "minecraft:nether_quartz" } },
  "infusionInput": { "amount": 20, "tag": "mekanism:redstone" },
  "output": { "item": "minecraft:comparator" } }
```

规范化后 `infusionInput` 是**一个** `registry` 值（`registry:'mekanism:infuse_type', id:'mekanism:redstone', amount:20`），`path` 记 `$.infusionInput`；
生成语法糖时按 `emit.shape='scalar'` 拆成「第三个参数字符串 + 第四个参数数量」，数据包模式按 `emit.shape='object'` 写回 `{amount,tag}`。
**同一个值模型，两种输出形态**——这与现有 `jsonValue`/`emitScript` 的行为一致，不引入新语义。

### 8.3 IE 电弧炉（partial + 未知字段保留）

原始见规格 §3.6.12。schema 只建模 `input/additives/results` 时，规范化结果是：

```json
{
  "typeId": "immersiveengineering:arc_furnace",
  "slots": [
    { "key": "input",  "value": { "kind": "tag", "id": "mekanism:crystals/allthemodium" }, "path": "$.input" },
    { "key": "results","value": { "kind": "list", "of": [{ "kind": "item", "id": "…", "count": 1 }] }, "path": "$.results" }
  ],
  "unknowns": [
    { "path": "$.secondaries", "value": [ { "chance": 0.2, "output": { "tag": "forge:ingots/allthemodium" } } ], "reason": "not-in-schema" },
    { "path": "$.slag",  "value": { "tag": "forge:slag" }, "reason": "not-in-schema" },
    { "path": "$.energy","value": 6144000, "reason": "not-in-schema" },
    { "path": "$.time",  "value": 6000, "reason": "not-in-schema" }
  ],
  "partial": { "isPartial": true, "reasons": ["unclaimed-keys"] }
}
```

编辑只改 `input` 后生成：四个 unknown 原值回写，`partial` 仍标 `unclaimed-keys`（提醒还有未建模部分），UI 显示「解析不完整」。

---

## 9. 测试方案

### 9.1 单元（不依赖真实包）

| 主题 | 用例 |
|---|---|
| 往返等价 | 对 §7 五类样本：`normalize → emit` 与原始 JSON 深比较相等（键序无关）；改动一个已建模字段后，其余键逐字节不变 |
| 未知字段 | schema 缺字段 → `unknowns` 有对应 path；冲突回写（用户编辑同名键）→ 以编辑值优先 + 产生一条 `UNKNOWN_FIELD_PRESERVED` |
| partial | 6 种 `PartialReason` 各有触发样例；`dynamic-script` 必须保留整段原文 |
| 配对合并 | `{item,count}` / `{output,chance}` / `{fluid,amount}` / `{tag,amount}` 合并后 `path` 指向原两处，生成能还原 |
| 校验 | 每个 `DiagnosticCode` 至少一条命中 + 一条不误报；`path` 精确到数组下标 |
| 版本 | `migratePinnedSchema` v1→v2；更高版本→只读 + `incompatible`；`PARSER_VERSION` bump 使旧缓存失效（现有 `cache.ts` 测试扩展） |

### 9.2 真实包金样（只读，`RUN_REAL_PACK=1`）

从 295 jar 包里固定抽查这 8 类并落成 golden fixture（首次生成后进仓库，后续比对）：

`minecraft:crafting_shaped`、`create:mixing`、`immersiveengineering:arc_furnace`、`immersivepetroleum:distillation`（`chance:"0.07"` 字符串）、
`mekanism:metallurgic_infusing`、`ae2:inscriber`、`ae2:entropy`（blockstate）、`occultism:ritual`（12 材料 + dummy）。

断言：① 摘要层输出与改造前**完全一致**（回归现有 5,334 partial / 32,890 条）；② 抽样 200 条随机配方往返等价；③ partial 分类统计之和等于 `stats().partial`。

### 9.3 不破坏清单（每次改动必跑）

`vitest run` 全量 + `RUN_REAL_PACK=1 tests/scanner` + `recipes/*`：items 搜索/拼音/收藏/模组过滤/虚拟开关、ProbeJS 导入、缓存命中与 extras 失效、取消不落 meta。

---

## 10. 迁移风险与分步落地

| 风险 | 影响 | 缓解 |
|---|---|---|
| Normalize 引入后与旧摘要不一致 | 配方统计/查询结果漂移 | 阶段 P-B 只做「旁路」：新模型先在内存算、与旧摘要对比告警，不改查询；对比 0 差异后再切换 |
| `unknowns` 体积膨胀 | 内存/缓存变大 | 只存未建模字段；深层结构设 8KB/条上限，超出记 `parse-failed` 并保留原文引用（不展开） |
| 往返不等价（浮点/键序） | 用户改材料即破坏配方 | 生成前做「未编辑 ≡ 原始」自检；不等价则回退为「整段原文 + 仅替换已建模槽位」的保守模式 |
| 钉住 schema 迁移失败 | 用户自定义丢失 | 迁移失败保留原文件 + 只读标记；不覆盖 |
| Schema v2 字段被旧插件忽略 | 插件行为退化 | 新字段全可选；旧字段（emitShape/compound）继续读 |
| 缓存版本误 bump | 每次启动重扫 | 明确规则：只有「同输入产出不同」才 bump，见 §7.3 |

**分步计划（每步独立可回滚，P-A 先只加类型不接线）**

- **P-A（本阶段，设计）**：类型草案 + 文档 + 评审。零 `src/` 改动。
- **P-B**：新增 `recipes/normalize.ts`（纯函数）与 `NormalizedRecipe` 类型；只提供 API 与单测，不接查询、不改缓存。
- **P-C**：在真实包上跑「旧摘要 vs 新规范化的影子对比」，输出差异报告；0 差异后把 `RecipeRecord` 增加可选 `partialReasons`（加法）。
- **P-D**：工作台「载入配方」改走 `normalize → toDraft`，并启用 unknowns 回写；此时才动 `benchStore.loadFromRecipe` 与 `buildRecipeJson` 的 unknown 兜底。
- **P-E**：校验引擎（约束对象 + DiagnosticCode）接入 `codegen:preview`。
- **P-F**：代码生成器按 §11 约束独立开发，先 3 个类型。

---

## 11. 代码生成阶段约束（设计层面，供后续评审）

1. **与扫描索引解耦**：生成器输入 = `NormalizedRecipe | RecipeDraft` + `RecipeTypeSchema`，不 import 扫描器、不读 jar。
   现状里有两处必须解掉的耦合（证据）：`codegen/emitDatapack.ts:14-15` 直接 import `scanner/zip`（命名空间探测）与 `modpack/modList`（列 jar）；
   `codegen/preview.ts` 直接调 `recipes/recipeIndex.allRecords()` 判断 `hasSamples`。P-F 时应改为由编排层注入的只读探针接口。
2. **保留原始信息**：`unknowns` 必须回写；`dynamic` 脚本配方只允许原样保留 + 字面量替换。
3. **不支持要显式报错**：`capability==='unsupported'` 或无 schema → 抛出结构化错误（`UNSUPPORTED_TYPE`），绝不生成「看起来对」的代码。
4. **独立校验**：生成前跑 §6 校验 + acorn 语法预检；两条都过才允许导出。
5. **先窄后宽**：首批只做 `minecraft:crafting_shaped`、`minecraft:crafting_shapeless`、`create:mixing`；通过金样与真实包验证后再扩。
6. **默认不写用户整合包**：只提供预览与「导出到独立目录」；写入 `<modpack>` 必须显式二次确认（沿用现有 write 流程）。

---

## 12. 需要评审拍板的点

1. **Normalized 是否持久化**：建议**不持久化**（按需从原始 JSON 现算，~32,890 条里只有用户打开的少数条），避免再引一个缓存版本；代价是打开配方多一次惰性读（已有通道）。
2. **unknowns 深度上限**：建议 3 层结构展开 + 单条 8KB 上限，超出只存原文引用。是否接受？
3. **`partialReasons` 是否回填历史缓存**：建议不迁移，PARSER_VERSION +1 后自然重建。
4. **首批代码生成类型**：是否就按 §11.5 的三个类型起步？
