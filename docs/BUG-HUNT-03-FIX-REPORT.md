# BUG-HUNT-03 · 已知遗留问题修复报告（FIX-REPORT）

> **工程**：`E:\mc kjs`｜**执行时间**：2026-11-01 15:32–15:42
> **基线**：台账 V9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，**只读，未修改**）
> **范围**：REM-01～REM-04 的根因核实与处理；BH-002 / BH-003 / BH-006+BH2-002 的测试证据补齐；BH-013 / BH2-003 / BH2-005 的暂缓复核。
> **未做**：构建、安装、卸载、启动应用、发布；未改版本号/依赖/安装包/`app.asar`；未触碰生产 userData、`dist`、`dist-011`、隔离区、npm cache。

---

## 1. 文件级备份（项目无 Git）

备份目录：`.cache/bh03-backup-1532/`，按原目录结构保存，5 个待改文件逐一 `sha256` 对照通过。

| 备份文件 | 修改前 SHA-256 |
| --- | --- |
| `src/main/codegen/preview.ts` | `eb460f12a3f3996e370154c353fa5bfa22c526e2886f757e3d7825306891b507` |
| `src/main/handlers/recipeHandlers.ts` | `63d0bc837fc3dadbf69d28d334e51503aab2545d1e83c6c3b2d326a279b6c730` |
| `src/shared/search.ts` | `2b3e2b2b918a4a60d0034b6e7de67d5fad777f6c9fabb37efb711ad2886c1bb0` |
| `src/main/scanner/itemIndex.ts` | `c45a8a938ab12ff47aaf6d877d762c911e026265de407c6877383928a9f18fd6` |
| `src/main/plugins/loader.ts` | `387fd44529e72f66503e842fb653f482bb713ebae5ac933caed97a5df01b7767` |

**两次受控回退（已还原并校验）**：

1. REM-01：`preview.ts` 换回备份 → 跑出 5 个失败 → 从 `.cache/bh03-preview-fixed.ts` 还原，`sha256 = 0ba2a034…`（与换前一致）。
2. REM-02：`itemIndex.ts` 换回备份 → 跑出 2 个失败 → 从 `.cache/bh03-itemIndex-fixed.ts` 还原，`sha256 = 0ef4b643…`（与换前一致）。

---

## 2. 修改清单（7 个源文件）

| 文件 | 改动 | 对应项 | 修改后 SHA-256 |
| --- | --- | --- | --- |
| `src/main/codegen/preview.ts` | `loadSchema` 从 `getSchema` 改为 `service.schemaById`（按需重建注册表） | REM-01 | `0ba2a034…b0a1` |
| `src/main/handlers/recipeHandlers.ts` | `recipes:open` / `recipes:commit` 先 `await ensureSchemas()` | REM-01 | `73adb328…f143` |
| `src/main/schema/service.ts` | `factsKey()` 增加附属数与已装模组数 | REM-01 加固 | `79dc3325…ab5a` |
| `src/shared/search.ts` | 新增 `virtualPatternsVersion` / `getVirtualPatternsVersion` / `bumpVirtualPatternsVersion`；`setPluginVirtualMatchers` 递增版本 | REM-02 | `20f1aeb3…c9ab1` |
| `src/main/scanner/itemIndex.ts` | 记录 `corpusVersion`，`getCorpus()` 在版本不一致时惰性重建 | REM-02 | `0ef4b643…e62c` |
| `src/main/plugins/loader.ts` | `invalidateVirtualMatchers()` 同时 `bumpVirtualPatternsVersion()` | REM-02 | `cb7d3c85…6151` |
| `src/main/scanner/itemRules.ts` | 修正一处与实现不符的注释（"isVirtualItem 会补判"→ 说明只用命名规则） | BH-003 证据一致性 | `828add6a…7169` |

---

## 3. REM-01 · 换包后 preview 读取旧注册表

### 3.1 实际根因（本轮核实，非照抄摘要）

`factsKey()` = `整合包路径 | 记录数 | 类型数`，`ensureSchemas()` 只在该键变化且**有人调用**时才重建。而：

- `preview.loadSchema()` 直接 `getSchema()`（同步读，不触发重建）；
- `recipes/selectSchema.ts:56` 同样直接 `getSchema()`，被 `openRecipe` / `commitRecipe` 用作默认依赖；
- **只有插件开关**会通过 `loader.syncPluginLayer()` → `refreshEffective()` 即时刷新。

于是「换包成功 → 立刻预览/打开配方」会继续使用上一个包的判定。**这不是"读不到"，而是"读到旧包"**：
`decideForSchema` 依据 `installedModIds` / `kubejsAddons` / `sampleCounts` 计算 `capability` 与 `channel`，换包后必然变。

### 3.2 触发条件

1. 应用在包 A 下已使用过（注册表已就绪）；
2. 成功切换到包 B（`setCurrentModpack`，索引随之替换）；
3. **不经过任何 `schema:*` IPC**（例如直接点生成预览、或直接打开配方）。

### 3.3 处理

- `loadSchema` → `service.schemaById()`。`ensureSchemas()` 在键未变时只做一次字符串比较即返回（**稳态无 IO**），换包后首次调用才重建。
- `recipes:open` / `recipes:commit` 入口加 `await ensureSchemas()`（`selectSchema` 是同步函数，改它会把整条链异步化，风险更大，故在 IPC 边界补齐）。
- `factsKey()` 增加 `kubejsAddons.length` 与 `installedModIds.length`：否则"同路径但重新检测到不同模组集合"不会触发重建。

### 3.4 行为差异

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 包 A（装了 create）→ 切到包 B（未装）→ 立刻 `loadSchema('create:mixing')` | `capability: 'compatible'`（旧包判定） | `capability: 'unsupported'` |
| 同上 → `generate()` | 与 `loadSchema` 说两套话（内部读旧值） | 与 `loadSchema` 一致 |
| 换包失败（modpack 置空） | 沿用旧判定 | 判为 `unsupported`，不抛错、不影响内置 schema 可用性 |
| 同路径但模组集合变化 | 不重建（键相同） | 重建 |

### 3.5 未完全消除的部分（如实记录）

`recipes/selectSchema.ts` 仍是**同步直读** `getSchema()`。生产路径已由 `recipeHandlers` 的 `ensureSchemas()` 覆盖；但**直接以编程方式调用** `openRecipe` / `commitRecipe`（测试、或未来新增的内部调用）仍可能读到当前快照。未改的原因：`selectSchema` 被 `openRecipe` / `commitRecipe` 作为可注入依赖使用，改签名会把同步链变异步，影响面大于收益。

---

## 4. REM-02 · 插件开关不重建语料

### 4.1 实际根因

`SearchCorpus.build()` 在**构建期**把 `isVirtualItem(item)` 的结果写进 `virtualMask`；查询期 `accepts()` **只读掩码**。语料只在 `setItemIndex()`（扫描/索引替换）时重建。插件开关只做 `invalidateVirtualMatchers()`（清编译后的正则缓存），**没有通知语料层**。

因此：禁用插件后，语料仍按旧掩码隐藏该物品，直到下次扫描。

### 4.2 处理

- `shared/search`：新增版本号。`setPluginVirtualMatchers()` 与 `bumpVirtualPatternsVersion()` 都递增它。
- `scanner/itemIndex`：`setItemIndex` 记录构建时的版本；`getCorpus()` 发现版本不一致则用**同一份 `items`** 重建一次。
- `loader`：`invalidateVirtualMatchers()` 里 bump 版本。

选择"惰性 + 版本"而不是"开关时立即重建"，是因为重建 4 万条物品的语料有明显开销；版本机制保证**只在真正变化后重建一次**，且不改变既有「查询参数不触发重建」的规格。

### 4.3 行为差异

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 关闭插件后立即搜索（不重扫、不手动刷新） | 命中通配的物品仍被隐藏 | 立即可见 |
| 重新启用后搜索 | 需重扫才恢复隐藏 | 立即恢复隐藏 |
| 插件状态未变时连续 `getCorpus()` | 同一实例 | 仍是同一实例（不反复重建） |
| 语料条数 | 全量 | 全量不变（过滤仍在查询期） |

---

## 5. REM-03 · 重复调用 `applyMerge`

### 5.1 核实结论：**当前实现是幂等的，不构成缺陷**

`applyMerge()` 开头 `effective.clear()`，随后完全由当前各层（plugin > builtin > jar > inferred，pinned 最高）重建，**不读旧状态**。所以：

- 同一输入连续执行 → 结果一致；
- 类型从层里消失后重新合并 → 不残留；
- 结果只由当前层决定，与调用次数、调用顺序无关；
- 并发观察不到"半成品"（合并过程全是同步代码，中间没有 `await`）。

**确有的冗余**：`ensureSchemas()` 组装过程中，`fetchLayer('plugin')` → `loadPlugins`（键变时）→ `syncPluginLayer()` → `refreshEffective()` 会合并一次，之后 `ensureSchemas` 末尾再合并一次。**多一次合并的 CPU，无状态污染**。

### 5.2 处理

**未改实现**。理由：任务要求"不要仅为避免重复调用而删除必要的更新路径"、"不得引入不必要的全局重构"。为消掉一次重复合并在 `registry` 与 `loader` 之间加抑制标志，会让所有权边界更模糊，收益仅是一次 CPU。

改为**固化契约**：`tests/main/schemaMergeContract.test.ts` 用 6 个用例锁定幂等、增删重加、层优先级与 putLayer 顺序无关、pinned 覆盖边界。

### 5.3 所有权边界（本轮明确）

| 层 | 写入方 | 何时失效 |
| --- | --- | --- |
| `builtin` | `service.ensureSchemas`（每次重建都重装） | 随重建 |
| `plugin` | `loader.syncPluginLayer`（`replaceLayer`） | 插件加载/开关 |
| `jar` / `inferred` | 目前无生产写入方（保留能力） | — |
| `pinned` | `registry.pinSchema` / `unpinSchema`（落盘 `customRecipeTypes.json`） | 用户操作 |

---

## 6. REM-04 · 外部可能持有旧引用

### 6.1 核实结论：**未发现"已发生的产品缺陷"**

- `allSchemas()` / `listSchemas()` 返回**调用时新建的数组**（快照语义）；
- `getSchema()` 返回**当前对象**，重新合并后是**新对象**（不就地改写旧对象）；
- 现有调用方（grep 全文）：`preview`（本轮改为 `schemaById`）、`selectSchema`（当次使用）、`schemaHandlers`（`registryOptions(registry, allSchemas())` 当次使用）、`service` 内部（`getSchema` 后立即返回/比较）；
  **没有任何调用方把结果存到模块级变量跨调用复用**。

### 6.2 处理

**未改实现**。补 4 个用例固化边界：数组快照不随后续合并变化；层更新后 `getSchema` 返回新对象且旧引用保持旧值；`listSchemas` 每次反映当前；快照数组被外部 `length = 0` 不影响注册表。

### 6.3 设计约定（本轮写入报告，供后续维护）

- **只读快照**：`allSchemas()` / `listSchemas()` / `snapshotLayer()` —— 可自由持有，但不代表最新状态。
- **当前状态**：`getSchema()` / `schemaIds()` / `pinnedIds()` —— 每次重新获取，不要缓存对象引用。

---

## 7. BH-002 证据补齐

| 项 | 结果 |
| --- | --- |
| `SequenceEditor.tsx:153` 是否仍是触发点 | **是**（`for (const typeId of missing) void ensureSchema(typeId)`，本轮核对未变） |
| 组件级测试可行性 | **不可行**：`vitest` 环境为 `node`，未安装 `@testing-library/react` / `jsdom`，本轮禁止安装依赖；且 `tsconfig.web` 无 `@main` 别名、`tsconfig.node` 又排除了 `tests/renderer/**` |
| 采用的替代方案 | **两段式**：① `tests/renderer/sequenceSchemaConcurrency.test.ts` 走真实 `benchUiStore.ensureSchema` → 真实 `api.callOrThrow` → stub 桥（5 例）；② 既有 `tests/main/schemaPin.test.ts` 走真实 handler → `schemaById` → `ensureSchemas`（并发 3 例） |
| 覆盖的行为 | 并发不丢结果、每类型只请求一次、结果进缓存、失败不污染缓存且可重试、同类型并发 5 次结果一致 |
| **未覆盖** | React 渲染本身（组件挂载/卸载时序） |

---

## 8. BH-003 证据补齐

| 项 | 结果 |
| --- | --- |
| `itemRules` 调用点 | 存在（`scanJarEntries` → `isVirtualByNamingRules`），**行为测试**：用真实 jar 条目驱动，断言命中插件通配的物品 `virtual:false`、命中 `dummy` 的为 `true`、普通物品为 `false` |
| `probeImport` 调用点 | 存在（`probeImport.ts:158`），**未做行为测试**（需要真实 ProbeJS 导出文件/目录，构造成本高）；改用**源码结构断言**（剥离注释后确认调用 `isVirtualByNamingRules(` 且不调用 `isVirtualItem(`），已在测试文件内明确标注"非行为测试" |
| 两入口差异验证 | 同一物品：扫描期 `false`、查询期 `isVirtualItem` 为 `true` —— 证明分工成立 |

---

## 9. BH-006 / BH2-002 证据补齐

`tests/renderer/fieldModelDedup.test.ts`（7 例）覆盖：`slots`/`outputs` 同 key 只声明一次；`slots` 与 `extraFields` 同 key 采用**先到者**（slots 那份，`required:true` 保留）；仅存在于 `extraFields` 的降级字段仍被声明且 `required:false`；不同 key 全部保留；`compound` 吸收的原键不再声明；`bucketFields` 也基于去重结果；`null`/空 schema 安全。

> **BH2-002 的编号映射**：BH2-002 不是独立缺陷，是对 BH-006"重复渲染"描述的更正。本节的测试证明：**去重发生在 UI 层**，因此 BH-006 的真实危害是"降级失效 + required 残留"（已由 `schemaMerge.test.ts` 断言），而非视觉重复。

---

## 10. BH-013 / BH2-003 / BH2-005 暂缓状态（本轮复核，均未修改）

| 编号 | 当前代码状态（本轮核对） | 暂缓原因 | 解除所需 |
| --- | --- | --- | --- |
| **BH-013** | `manifest.ts` 各数组解析仍无 `length` 上限 | 无阈值依据；凭空设限可能废掉合法的大型整合包插件 | 3–5 个真实插件包的 `recipeTypes` 数量分布 |
| **BH2-003** | `looksBlockstate()` 仍把 `{id, 任意标量}` 判为 blockstate | `{id,facing}` 与 `{id,count}` 结构不可区分，收紧会误伤真 blockstate | 真实样本中两种形态的占比 |
| **BH2-005** | `siblingHasQuantShape()` 对 `count`/`amount` 仍 `return true`（只对 `chance` 要求可转数字） | 统一口径会改变字段分组，属产品语义变更 | 是否存在 `"1x"` 这类带单位写法 |

三项已并入 `BUG-HUNT-03-REMAINING.md` 的统一待决清单（P-01 / P-02 / P-03）。

---

## 11. 编号映射（本轮）

| 原始编号 | 本轮处理 | 实现/证据位置 |
| --- | --- | --- |
| REM-01 | **已修复**（含加固） | `preview.ts`、`recipeHandlers.ts`、`service.ts`；`tests/main/previewFreshness.test.ts`（6 例） |
| REM-02 | **已修复** | `search.ts`、`itemIndex.ts`、`loader.ts`；`tests/main/corpusRefresh.test.ts`（6 例） |
| REM-03 | **确认无缺陷**（契约已固化） | 无代码改动；`tests/main/schemaMergeContract.test.ts`（6 例） |
| REM-04 | **确认无缺陷**（边界已固化） | 无代码改动；同文件（4 例） |
| BH-002 | **证据补齐（两段式）** | `tests/renderer/sequenceSchemaConcurrency.test.ts`（5 例）+ 既有 `schemaPin.test.ts` |
| BH-003 | **证据补齐** | `tests/scanner/virtualCallSite.test.ts`（7 例）；`itemRules.ts` 注释更正 |
| BH-006 / BH2-002 | **证据补齐** | `tests/renderer/fieldModelDedup.test.ts`（7 例） |
| BH-013 / BH2-003 / BH2-005 | **维持暂缓** | `BUG-HUNT-03-REMAINING.md` P-01～P-03 |

---

## 12. 影响面与风险

| 修改 | 可能影响的路径 | 评估 |
| --- | --- | --- |
| `loadSchema` → `schemaById` | 所有 `codegen:preview` / `codegen:checkTarget` 调用 | 稳态只多一次字符串比较；换包后多一次重建（正确行为）。既有 `preview.test.ts` 全部显式传 `schema`，不经 `loadSchema`，未受影响 |
| `recipes:open` / `recipes:commit` 加 `ensureSchemas()` | 两个 IPC 通道 | 首次调用可能多一次注册表组装；错误会以 `{ok:false}` 传播（与既有风格一致） |
| `factsKey` 加两个计数 | 所有 `schema:*` | 只在附属/模组数变化时多一次重建 |
| 语料版本机制 | 物品搜索 / 侧栏 | 插件开关后首次搜索会重建一次语料（4 万条量级，与扫描期构建同级开销） |
| `invalidateVirtualMatchers` 加 bump | 插件加载/开关 | 仅递增整数 |

**未解决风险**：见 `BUG-HUNT-03-REMAINING.md`（含 `selectSchema` 同步直读、真实环境验证、`classParser.ts` 等审计盲区）。
