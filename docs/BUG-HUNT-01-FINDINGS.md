# BUG-HUNT-01 · 全工程深度缺陷挖掘（Findings）

> **工程根目录**：`E:\mc kjs`
> **基线**：正式台账 **v9**（`docs/PROJECT-SEALING-LEDGER-REPORT.md`，MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，90,749 B）
> **执行时间**：2026-11-01 08:42–09:05
> **性质**：**只读**。**未修改**任何源码 / 测试 / 配置 / 依赖 / 正式台账；**未执行**构建、安装、卸载、启动、扫描、测试套件；**未删除 / 移动 / 清理**任何文件；**未触碰**生产 userData、构建产物、隔离区 `E:/_trash_20261101_recipe-studio`、npm 缓存。
> **状态定义**：**A** 已确认 Bug（源码可严格推导）｜**B** 高度疑似（有风险与证据，缺关键验证）｜**C** 测试缺口｜**D** 待验证风险
> **重要边界**：本文件**不修复任何问题**。凡是"需要跑一次才能确认"的，一律登记为 B/D 并写明缺什么验证。

---

## 摘要

| 编号 | 标题 | 状态 | 严重度 | 与旧问题重复 | 影响用户数据 |
| --- | --- | --- | --- | --- | --- |
| BH-001 | `schema:pin` 丢弃调用方提交的 schema，实际钉住注册表当前版本 | **A** | P2 | 否 | **是**（写入 `customRecipeTypes.json`） |
| BH-002 | `ensureSchemas` 并发短路返回未就绪注册表，且 `null` 被永久缓存 | **A** | **P1** | 否 | 否 |
| BH-003 | 插件 `virtualItemPatterns` 完全无效（`matchesVirtualItem` 是死代码） | **A** | P2 | 否 | 否 |
| BH-004 | 插件覆盖层被 `clearSchemas()` 清空，且无恢复路径 | **A** | **P1** | **同根因于台账 `P0-PL1`** | 否 |
| BH-005 | `plugins:setEnabled` 不同步 schema 注册表，关闭插件后覆盖类型仍生效 | **A** | P2 | **同根因于 `P0-PL1`** | 否 |
| BH-006 | `augment()` 全降级时回退到完整 `slots`，同一字段同时出现在 slots 与 extraFields | **A** | P2 | 否 | 否 |
| BH-007 | `augment()` 对 `slots` 中 `zone:'extra'` 槽位可能重复降级（`demoted` 双推） | **B** | P3 | 否 | 否 |
| BH-008 | 钩子沙箱黑名单匹配原始源码（含注释/字符串），合法钩子被误拒 | **B** | P2 | 否 | 否 |
| BH-009 | `ensureSchema` 把 IPC 失败当作"未知类型"缓存为 `null` | **B** | P2 | 否（放大 BH-002） | 否 |
| BH-010 | `pinCurrent` / `unpinCurrent` 失败时静默无反馈 | **B** | P3 | 否 | 否 |
| BH-011 | `src/main/schema` 核心合并逻辑（`augment`/`applyMerge`/`overlayJar` 等）无直接单测 | **C** | P2 | 否 | 否 |
| BH-012 | `schema:pin` 无"钉住内容 == 提交内容"断言测试 | **C** | P2 | 否（针对 BH-001） | 否 |
| BH-013 | 插件 `recipeTypes` / `virtualItemPatterns` 无数量上限 | **D** | P3 | 否 | 否 |
| BH-014 | 插件清单文件变更不纳入缓存键，热改必须重启 | **D** | P3 | 否 | 否 |

---

## BH-001 · `schema:pin` 丢弃调用方提交的 schema，实际钉住注册表当前版本

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `schema:pin` 的入参含完整 schema，但 handler 校验后只用 `typeId`，持久化的是注册表里的当前版本 |
| **2. 状态** | **A（已确认 Bug）** |
| **3. 严重程度** | **P2**。判定依据：不丢磁盘上的用户配方文件，但会把**与用户所见不同**的 schema 写入 `userData/customRecipeTypes.json`，并回报成功；属"写入内容错误 + 反馈失真"，不属数据丢失 |
| **4. 涉及文件及行号** | `src/main/handlers/schemaHandlers.ts:21-29`（`assertPinnable` 校验 `req.schema`）、`:51-57`（只用 `schema.id`）；`src/main/schema/service.ts:121-129`（`togglePin` 只接 `typeId`）；`src/main/schema/registry.ts:244-251`（`pinSchema(schema)` 持久化的是传入对象）；`src/renderer/src/views/bench/benchUiStore.ts:184-191`（`pinCurrent` 发送 `{typeId, schema}` 并以返回值覆盖本地状态） |
| **5. 相关调用链** | `BenchHead.tsx:55` 按钮 → `benchUiStore.pinCurrent()` → `call('schema:pin', { typeId: schema.id, schema })` → `schemaHandlers` `assertPinnable(req)`（**校验通过**）→ `togglePin(schema.id, true)` → `await ensureSchemas()`（**可能重建注册表**）→ `getSchema(typeId)`（**重新取注册表版本**）→ `pinSchema(那个版本)` → `persistPinned()` 写 `customRecipeTypes.json` → 返回该版本 → 渲染端 `set({schema: pinned})` |
| **6. 触发条件** | 渲染端提交的 `schema` 与 `getSchema(typeId)` 的返回值**不是同一份内容**。可达路径：① UI 先 `schema:get` 取得版本 A，此后扫描完成 / 换整合包 / 插件加载使 `factsKey()` 变化，`ensureSchemas()` 重建后注册表变成版本 B，用户点"钉住"→ 钉住 B、UI 被覆盖成 B，而用户以为钉的是 A；② 任何未来给 `schema` 加上编辑能力的功能，编辑内容 100% 丢失 |
| **7. 预期行为** | 接口声明「钉住这个 schema」→ 持久化 `req.schema`（经校验），或在契约里明确写成「钉住当前生效版本」且**不接收 schema 对象** |
| **8. 实际可能发生的行为** | `assertPinnable` 校验的是一份将被丢弃的对象；真正落盘的是注册表当前值。用户点"钉住"，磁盘写入的内容可能不等于他看到的表单；`toast('已钉住 …，后续以本包为准')` 仍报成功 |
| **9. 源码证据** | `schemaHandlers.ts:52-53`：`const schema = assertPinnable(req)` / `const result = await togglePin(schema.id, true)` —— 此后 `schema` 变量**再无任何使用**。<br>`service.ts:124-126`：`const current = getSchema(typeId)` / `if (!current) return …` / `const pinned = await pinSchema(current)` —— 钉的是 `current`，与 `req.schema` 无关 |
| **10. 相关测试及覆盖情况** | `tests/main/ipcWiring.test.ts:82` **只在通道名单里出现 `schema:pin`**，断言的是"通道已注册"，**没有任何用例断言钉住内容 == 提交内容**。`tests/main/schemaService.test.ts`（6 例）只测 `schemaSummaries` / `schemaById` / `coverage`，**未测 `togglePin` / `pinSchema`**。→ 覆盖为 0 |
| **11. 与旧问题重复性** | 不与 N-01～N-07 重复；不与台账 40 条重复（台账 `P0-R2` 是「钉住 schema 仅结构校验」，指的是"校验深度不够"，与"校验完丢弃"是不同缺陷） |
| **12. 用户影响** | ① 钉住结果与所见不一致（静默）；② 若将来加 schema 编辑，"保存"会假成功；③ `customRecipeTypes.json` 里可能出现用户从未确认过的字段集合，且该文件是后续所有合并的**最高优先层**，影响面会持续到用户手动删文件 |
| **13. 修复方向** | 二选一并写进契约：**(a)** `togglePin(typeId, on, schemaOverride?)`，`on=true` 且给了 `schemaOverride` 时 `pinSchema(assertPinnable(...))`；**(b)** 从 `InvokeMap` 里删掉 `schema` 字段，只留 `typeId`，同时改 UI 文案为「钉住当前生效版本」。推荐 (a)，因为 `assertPinnable` 的存在说明原意就是 (a) |
| **14. 修复前需要补充的验证** | ① 写一个用例：提交与注册表不同的 schema（如改 `displayName`），断言 `customRecipeTypes.json` 落盘内容 == 提交内容；② 在真实 app 里复现"打开工作台 → 触发一次扫描 → 点钉住"，比对 `ui:get` 之外的 `customRecipeTypes.json` 与界面显示 |

---

## BH-002 · `ensureSchemas` 并发短路返回未就绪注册表，且 `null` 被永久缓存

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `ensureSchemas()` 在 `await` 之前就写入快照戳 `stamp`，第二个并发调用会立即返回，此时 `effective` 表尚为空 |
| **2. 状态** | **A（已确认 Bug）** |
| **3. 严重程度** | **P1**。判定依据：会让「工作台子步骤编辑器」在整场会话内降级为通用模式（用户可见功能失效），且**无法自愈**；不损坏磁盘数据 |
| **4. 涉及文件及行号** | `src/main/schema/service.ts:88-104`（`stamp` 与 `ensureSchemas`）；`src/renderer/src/views/bench/benchUiStore.ts:122-136`（`ensureSchema` 的缓存判定）；`src/renderer/src/views/bench/layouts/SequenceEditor.tsx:151-154`（并发触发点） |
| **5. 相关调用链** | `SequenceEditor` 渲染 → `missing = steps.filter(…)` → `useEffect` 里 `for (const typeId of missing) void ensureSchema(typeId)`（**一次循环发 N 个并发请求**）→ 每个都走 `call('schema:get')` → `schemaById` → `ensureSchemas()`。<br>同样可并发的一对：`BenchView.tsx:44-52` 的 `useEffect` 调 `schema:list`，与 `benchUiStore.loadSummaries()` 的 `schema:list` 同时发起 |
| **6. 触发条件** | ① 会话内**首次**访问 schema（`stamp === ''`）；② 同时有 ≥2 个 `schema:*` 请求在飞行中。最典型：导入整合包 → 扫描完成 → 打开一条 `sequence` 布局配方（多步）→ 子步骤类型 schema 并发拉取 |
| **7. 预期行为** | 并发调用应等待同一次组装完成（共享同一个 in-flight Promise），拿到的是已合并的注册表 |
| **8. 实际可能发生的行为** | 第一个调用执行到 `await loadPinned()` 时让出；第二个调用看到 `key === stamp` **立刻 resolve**；随后 `listSchemas()` 读 `effective`（此时为空，因为 `applyMerge` 还没跑）→ 返回 `[]`；`getSchema()` 返回 `null`。渲染端把 `null` 写进 `schemaCache`，而缓存判定用的是 `cached !== undefined`，`null` 满足该条件 → **本会话不再重试** |
| **9. 源码证据** | `service.ts:96-104`：<br>`const key = factsKey()` → `if (key === stamp) return` → `stamp = key`（**先赋值**）→ `clearSchemas()` → `putMany('builtin', …)` → `await loadPinned()`（**此处让出事件循环**）→ `applyMerge(schemaFacts())`。<br>`putMany` 只写 `layerMaps`，`effective` 仅在 `applyMerge`（`registry.ts:202-230`）里填充。<br>`benchUiStore.ts:127-131`：`const cached = get().schemaCache[typeId]` / `if (cached !== undefined) { … return cached }` —— `null` 不会被重新请求 |
| **10. 相关测试及覆盖情况** | `tests/main/schemaService.test.ts:16` 每个用例都先 `invalidateSchemaSnapshot()` 再**串行**调用，**没有并发用例**；`Promise.all` 场景 0 覆盖 |
| **11. 与旧问题重复性** | 不与 N-01～N-07 重复；不与台账 40 条重复（`P0-R3` 是覆盖度语义易误解，无关） |
| **12. 用户影响** | 序列配方的子步骤只能退化为通用表单；`schema:list` 可能短暂/持续返回空 → 类型选择器无候选。若首个调用在 `loadPinned` 处抛错（如 userData 路径不可用），`stamp` 已被写入 → **整场会话注册表永久为空** |
| **13. 修复方向** | 把快照戳改成 in-flight Promise 缓存：<br>`let inflight: Promise<void> \| null = null; let loadedKey = ''`<br>`if (loadedKey === key) return; if (inflight) return inflight;`<br>`inflight = (async () => { …组装…; loadedKey = key })(); try { await inflight } finally { inflight = null }`<br>关键：**只在组装成功后**写 `loadedKey` |
| **14. 修复前需补充的验证** | ① 写并发用例：`await Promise.all([schemaSummaries(), schemaSummaries()])`，断言两次结果都非空且相等；② 断言 `loadPinned` 抛错后第二次调用仍会重试；③ 真机复现：清空 `customRecipeTypes.json` → 首次打开序列配方，观察子步骤是否降级 |

---

## BH-003 · 插件 `virtualItemPatterns` 完全无效（`matchesVirtualItem` 是死代码）

| 项 | 内容 |
| --- | --- |
| **1. 标题** | 插件清单声明并在文档中承诺的 `virtualItemPatterns`，其唯一消费函数 `matchesVirtualItem()` **没有任何调用方**；真实判定 `isVirtualItem()` 不看插件规则 |
| **2. 状态** | **A（已确认 Bug）** |
| **3. 严重程度** | **P2**。判定依据：文档化的插件能力静默失效，用户会看到本该隐藏的虚拟物品；不损坏数据 |
| **4. 涉及文件及行号** | `src/main/plugins/loader.ts:239-243`（`virtualItemPatterns()`）、`:245-254`（`patternToRegExp`）、`:256-258`（`matchesVirtualItem`，**唯一消费点，且自身无调用方**）；`src/shared/search.ts:290-292`（真实判定 `isVirtualItem`）；`src/main/scanner/itemRules.ts:199`、`src/main/scanner/probeImport.ts:158`（两个真实调用点）；`src/main/plugins/report.ts:135`（只取 `.length` 做统计） |
| **5. 相关调用链** | 插件 manifest → `parseManifest` 解析 `virtualItemPatterns`（`manifest.ts:260`）→ `manifestOf` 暴露给 UI（`loader.ts:174`）→ `report.ts:135` 统计条数。<br>**但**物品分类实际走：`itemRules.ts:199` → `isVirtualItem()` → `item.virtual \|\| isVirtual(id, nameZh, nameEn)`（纯路径/命名规则）。插件规则**不在链路上** |
| **6. 触发条件** | 任意插件声明了 `virtualItemPatterns`（例如文档示例的 `occultism:ritual_dummy/*`）。无需特殊环境，恒定触发 |
| **7. 预期行为** | 按 `docs/plugins/插件编写说明.md` §7：命中所声明通配的物品应被判为虚拟物品，在默认查询中隐藏（`includeVirtual:false`） |
| **8. 实际可能发生的行为** | 插件规则完全不参与判定 → 这些物品照常出现在浏览/搜索里。插件作者与用户都会认为"插件已生效"，因为 `plugins:list` 返回的 manifest 里带着该字段、报告里也统计了条数 |
| **9. 源码证据** | `grep -rn "matchesVirtualItem" src/` → **仅** `loader.ts:256` 的定义行，**0 个调用点**。<br>`search.ts:290-292`：`return item.virtual === true \|\| isVirtual(item.id, item.nameZh, item.nameEn)` —— 无第三参数、无插件规则注入。<br>`virtualItemPatterns()` 的非测试调用只有 `report.ts:135` 的 `.length` |
| **10. 相关测试及覆盖情况** | `tests/plugins/loader.test.ts` 有 `getPluginSchemaOverrides` 的大量断言，但**没有 `matchesVirtualItem` / `virtualItemPatterns` 的行为用例**（该函数无调用方，无法被测）。`tests/scanner/itemRules` 相关测试只覆盖内置命名规则 |
| **11. 与旧问题重复性** | 不重复。台账 `P0-PL1` 是「插件 recipeTypes 未入注册表」，`P0-PL2` 是「无 UI 开关」，均不涉及虚拟物品规则 |
| **12. 用户影响** | ① 插件文档承诺的功能不生效（对插件作者是"文档撒谎"）；② 虚拟物品污染搜索结果（如 `occultism:ritual_dummy/*` 大量占位物品），正是该功能要解决的问题；③ 排查困难度高——manifest 里字段在、报告里计数在 |
| **13. 修复方向** | 二选一：**(a)** 接线——`isVirtualItem` 增加可选 `extraPatterns` 参数，`itemRules`/`probeImport`/查询期三处都传入 `virtualItemPatterns()`；**(b)** 若决定不做，则从 `PluginManifest` 与插件文档 §7 中移除该字段，避免继续误导。**不建议**保留"解析但不生效"的现状 |
| **14. 修复前需补充的验证** | ① 先确认产品意图：(a) 还是 (b)；② 若走 (a)，需验证 `patternToRegExp` 的转义在真实物品 ID 上的行为（`*` → `[^/]*`，而 MC 物品 ID 用 `:` 分隔，含 `/` 的只有少数子路径）；③ 需确认查询期与扫描期规则一致（`search.ts` 的 `virtualMask` 在语料构建时固化，插件在语料之后加载则不会生效——这是第二个时序问题） |

---

## BH-004 · 插件覆盖层被 `clearSchemas()` 清空，且无恢复路径

| 项 | 内容 |
| --- | --- |
| **1. 标题** | 插件 schema 只能通过 `pushToRegistry()` 进入 `plugin` 层，但 `ensureSchemas()` 的重建会 `clearSchemas()` 清空全部层且**只重装 builtin + pinned**，插件层永久丢失 |
| **2. 状态** | **A（已确认 Bug）** |
| **3. 严重程度** | **P1**。判定依据：插件定义的配方类型在"扫描完成 / 换整合包"这类**常规操作后消失**，且重开设置页也无法恢复（缓存命中不重推），只有重启 app 才行 |
| **4. 涉及文件及行号** | `src/main/schema/service.ts:96-104`（`ensureSchemas` 只装 builtin + pinned）；`src/main/schema/registry.ts:70-74`（`clearSchemas` 清空所有 layer + pinned）；`src/main/plugins/loader.ts:207-215`（`pushToRegistry` 仅在 `cache.key` 变化时调用）、`:219-221`（`getPluginSchemaOverrides` 无生产调用方）、`:288-300`（`pushToRegistry`） |
| **5. 相关调用链** | 启动 → 用户打开设置页 → `plugins:list` → `loadPlugins`（cache 空）→ 构建 records → `void pushToRegistry(...)` → `upsert()` 写入 `layerMaps.plugin` + `effective`。<br>随后扫描完成 → `factsKey()` 改变 → 任意 `schema:*` → `ensureSchemas` → `clearSchemas()`（**插件层没了**）→ `putMany('builtin')` → `loadPinned()` → `applyMerge`（此时 `layerMaps.plugin` 为空）。<br>用户再回设置页 → `plugins:list` → `cache.key` **未变** → 命中缓存 → **不调用 `pushToRegistry`** |
| **6. 触发条件** | ① 必须曾经有过一次 `plugins:list`（插件层被填充）；② 之后 `factsKey()` 变化——即 `getCurrentModpack()?.path`、`allRecords().length`、`typeUniverse().length` 任一变化（导入新包、扫描完成、重扫）。**扫描完成是每次使用都会发生的事** |
| **7. 预期行为** | 注册表重建时，插件层应与 builtin / pinned 一样被重新装配（`ensureSchemas` 里显式调用 `getPluginSchemaOverrides()` 并 `putMany('plugin', …)`） |
| **8. 实际可能发生的行为** | 首次扫描后，插件声明的所有配方类型从 `schema:list` / `schema:get` / 覆盖率报告中消失；`plugins:list` 仍显示 `status: 'loaded'`、`coveredTypes: [...]`（因为它读的是 loader 的 records，不是注册表）→ **UI 自相矛盾**：插件页说"已覆盖 3 个类型"，工作台类型选择器里找不到这 3 个 |
| **9. 源码证据** | `service.ts:100-103`：`clearSchemas()` / `putMany('builtin', …)` / `await loadPinned()` / `applyMerge(schemaFacts())` —— **无 `putMany('plugin', …)`**。<br>`registry.ts:70-74`：`for (const map of layerMaps.values()) map.clear()` —— 包含 `plugin` 层。<br>`loader.ts:207`：`if (!cache \|\| cache.key !== key)` —— 只有缓存未命中才 push；`key` 只含 `modpackPath / userDir / modsDir / appVersion`，**与 `allRecords().length` 无关**。<br>`grep -rn "getPluginSchemaOverrides" src/` → 生产代码仅 `report.ts:134` 取 `.length` |
| **10. 相关测试及覆盖情况** | `tests/plugins/loader.test.ts`（多例）直接测 `getPluginSchemaOverrides()`，**绕过注册表**，因此这条链路的断点不被任何测试覆盖。`tests/main/schemaService.test.ts` 不涉及插件 |
| **11. 与旧问题重复性** | **与台账 `P0-PL1`（「插件 recipeTypes 未入 schema 层」）同根因**。但本条补充了一个 `P0-PL1` 未描述的新事实：**部分接线存在**（`pushToRegistry` → `upsert`），却会被 `clearSchemas` 清空，导致"有时有、有时没有"的不确定行为。登记时应作为 `P0-PL1` 的**补充证据**，不另建新条件 |
| **12. 用户影响** | 插件作者写好的配方类型在第一次扫描后消失；用户看到"插件已加载但类型不存在"，无法自助恢复（重启前）。若插件是整合包作者随包分发的（`.recipe-studio/plugins/`），等于该分发能力默认失效 |
| **13. 修复方向** | 在 `ensureSchemas()` 内显式装配插件层：<br>`putMany('builtin', …)` → `putMany('plugin', getPluginSchemaOverrides())` → `await loadPinned()` → `applyMerge(…)`<br>并把 `loader.ts:213` 的 `void pushToRegistry(...)` 改为只做日志，避免两处双写 |
| **14. 修复前需补充的验证** | ① 写用例：装一个插件 → 调 `schemaSummaries()` → 改 `allRecords().length`（模拟扫描完成）→ 再调 → 断言插件类型仍在；② 与 `P0-PL1` 的修复合并做，避免改两次；③ 需确认 `getPluginSchemaOverrides()` 的调用成本（每次都遍历 records 并 `resolvePluginOverrides`），是否要在 `ensureSchemas` 里缓存 |

---

## BH-005 · `plugins:setEnabled` 不同步 schema 注册表，关闭插件后覆盖类型仍生效

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `setEnabled()` 只改 `userDisabled` 并返回新快照，**从不通知 schema 注册表**；已 `upsert` 进 `plugin` 层的类型不会被移除 |
| **2. 状态** | **A（已确认 Bug）** |
| **3. 严重程度** | **P2**。判定依据：UI 显示"已关闭"但后端仍生效（用户控制失效）；不损坏数据 |
| **4. 涉及文件及行号** | `src/main/plugins/loader.ts:272-278`（`setEnabled`）；`src/main/handlers/pluginHandlers.ts:23-30`（`plugins:setEnabled`）；`src/main/schema/registry.ts:44-48`（`upsert` 存在 `effective` 与 layer 两处，**无 remove**） |
| **5. 相关调用链** | 设置页开关 → `plugins:setEnabled` → `setEnabled(id, on)` → `userDisabled.add(id)` / `delete(id)` → `currentRecords()`（**命中缓存，不重建**）→ `snapshot(records)` → 返回。**注册表未收到任何通知** |
| **6. 触发条件** | 插件已被加载并 `upsert` 进注册表（即曾打开过设置页 / 已 `plugins:list`），然后用户关闭该插件 |
| **7. 预期行为** | 关闭后该插件的 `recipeTypes` 应从注册表撤出（或至少有 `remove` 能力）；重新启用后恢复 |
| **8. 实际可能发生的行为** | 列表里 `status: 'disabled'`、`coveredTypes: []`，但 `schema:list` 仍包含该插件声明的类型，工作台仍可选择并用它生成代码。**UI 状态与生效状态不一致** |
| **9. 源码证据** | `loader.ts:273-278` 全文无 `pushToRegistry` / `upsert` / 清除调用。<br>`registry.ts` 只有 `upsert`（L44）、`putLayer`、`clearSchemas`，**没有按 id 删除单层的 API**——即当前架构下"撤回单个插件类型"根本没有实现手段 |
| **10. 相关测试及覆盖情况** | `tests/main/handlersWiring.test.ts:134-143` 只测"非法入参被拒"；`tests/plugins/loader.test.ts:188-201` 测 `getPluginSchemaOverrides()` 在 disable 后变空（**loader 层是对的**）——这恰好说明**断点在 loader 与注册表之间**，而该断点无用例 |
| **11. 与旧问题重复性** | 与 `P0-PL1` 同根因（插件类型未真正进 schema 层）。台账 `P0-R5`（「插件开关重启后未回归」）是"重启后状态是否一致"，与本条"运行期是否立即生效"不同，但两者会一起被 `P0-PL1` 的修复解决 |
| **12. 用户影响** | 用户以为关掉了某插件的自定义类型（可能因为它覆盖了内置类型导致行为异常），实际仍在用；这类"控制失灵"比"功能缺失"更难排查 |
| **13. 修复方向** | 给注册表加 `removeFromLayer(layer, id)`，在 `setEnabled` 后重新装配：`syncPluginLayer()`（内部 `clearLayer('plugin')` + `putMany('plugin', getPluginSchemaOverrides())` + `applyMerge`）。与 BH-004 的修复共用同一个同步函数 |
| **14. 修复前需补充的验证** | ① 用例：插件类型 A → `schemaSummaries()` 含 A → `setEnabled(id,false)` → 再查断言不含 A → `setEnabled(id,true)` → 又含 A；② 确认 `applyMerge` 重跑后 pinned 类型不被影响 |

---

## BH-006 · `augment()` 全降级时回退到完整 `slots`，同一字段同时出现在 slots 与 extraFields

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `augment()` 用 `keptSlots.length > 0 ? keptSlots : slots` 兜底：当骨架字段**全部**被降级时，`slots` 原样返回，而同一批槽位已被推进 `demoted` 并写入 `extraFields` |
| **2. 状态** | **A（已确认 Bug）** |
| **3. 严重程度** | **P2**。判定依据：同一字段在表单里被渲染两次（一次普通区、一次高级区），`required` 语义冲突；会让用户填错或重复填；不损坏磁盘 |
| **4. 涉及文件及行号** | `src/main/schema/registry.ts:133-168`，关键在 `:145-161`：`keep` 闭包共享 `demoted` 数组；`:159` 的 `keptSlots.length > 0 ? keptSlots : slots`；`:160` 的 outputs 同样兜底；`:161` 的 `extraFields: [...(skeleton.extraFields ?? []), ...demoted]` |
| **5. 相关调用链** | `applyMerge`（`registry.ts:214`）→ `augment(base, inferred)` → 返回的 schema 进 `effective` → `decideForSchema` → `schema:get` → `benchUiStore.ensureSchema` → `fieldModel.declaredFields/bucketFields/allFieldsFlat` → 渲染 |
| **6. 触发条件** | `inferred.sampleCount > 0`（有样本）且**骨架里没有任何一个 slot 的 `key` 出现在 inferred 的 `slotsOf()` 里**。典型：插件声明的 schema 用自定义字段名（`input1` / `output1`），而样本 JSON 用原始键（`ingredients` / `result`）——插件层与 L1 反推层命名不重合 |
| **7. 预期行为** | 全部降级时，`slots` 应为空（或保留结构但不与 `extraFields` 重复）；`extraFields` 里每个字段只出现一次 |
| **8. 实际可能发生的行为** | `keptSlots = []` → 走 `: slots` 分支 → 所有原槽位**回到普通区**；同时 `demoted` 已把它们（`demote()` 后）追加进 `extraFields` → **同一 key 出现两次**，且 `required` 一处为原值、一处为 `false`。`capabilityNote` 还会写"N 个字段未在本包出现"，与"它们现在还在普通区"矛盾 |
| **9. 源码证据** | `registry.ts:146-154`：<br>`const keep = (list, zone) => list.filter((slot) => { const hit = inferredKeys.get(slot.key); if ((inferred.sampleCount ?? 0) > 0 && hit === undefined) { demoted.push(demote(slot)); return false } return slot.zone === zone \|\| zone === undefined })`<br>`registry.ts:159-161`：<br>`slots: keptSlots.length > 0 ? keptSlots : slots,`<br>`outputs: keptOutputs.length > 0 ? keptOutputs : outputs.filter((s) => s.zone === 'output'),`<br>`extraFields: [...(skeleton.extraFields ?? []), ...demoted],`<br>→ 兜底分支与 `demoted` 累积**直接冲突**，无去重、无回滚 `demoted` |
| **10. 相关测试及覆盖情况** | `grep -rl "augment" tests/` → **0 个文件**。整个 `augment`（五层合并的核心）无任何单测。见 BH-011 |
| **11. 与旧问题重复性** | 不重复（N 系列、台账 40 条均未涉及） |
| **12. 用户影响** | 使用插件自定义类型时，表单出现重复字段；用户可能只填其中一处，另一处保持空 → 生成的配方缺字段或字段为空；也可能因为 `required` 冲突被表单校验拦截而无法提交 |
| **13. 修复方向** | 去掉兜底，或改成"只兜底骨架的 required 槽位且不回填已降级项"：<br>`const keptSlots = keep(...).concat(...)`；`slots: keptSlots`（允许为空，空即表示"本包一个都对不上，全靠 extraFields"）；同时 `extraFields` 按 `key` 去重。<br>若确实需要兜底，则兜底前把 `demoted` 里对应 key 移除 |
| **14. 修复前需补充的验证** | ① 先给 `augment` 补单测（BH-011）：覆盖"部分重合""完全不重合""inferred.sampleCount=0""required 字段缺失"四组；② 用一个字段名与样本不重合的插件在真机看表单是否重复；③ 确认 `bucketFields`（`fieldModel.ts:89`）是否已经把 `extraFields` 与 `slots` 合并去重（**若 UI 侧已去重，严重度降为 P3**） |

---

## BH-007 · `augment()` 对 `slots` 中 `zone:'extra'` 槽位可能重复降级

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `keep()` 被调用两次（先 `slots`+`'input'`，再 `slots.filter(zone==='extra')`+`'extra'`）且共享同一个 `demoted` 数组，同一槽位可能被 push 两次 |
| **2. 状态** | **B（高度疑似）**。缺的验证见第 14 项 |
| **3. 严重程度** | **P3** |
| **4. 涉及文件及行号** | `src/main/schema/registry.ts:145-156`；实例来源 `src/data/recipeTypes/minecraft.ts:12-18`（`slots` 内含 `s('key','struct',{zone:'extra'})`） |
| **5. 相关调用链** | 同 BH-006 |
| **6. 触发条件** | `skeleton.slots` 里存在 `zone === 'extra'` 的槽位，**且**该槽位 key 在 `inferred` 中不存在，**且** `inferred.sampleCount > 0` |
| **7. 预期行为** | 每个槽位最多降级一次 |
| **8. 实际可能发生的行为** | `demoted` 里出现两个相同 key → `extraFields` 重复 → `capabilityNote` 的"降级 N 个"虚高 |
| **9. 源码证据** | `registry.ts:155`：`const keptSlots = keep(slots, 'input').concat(keep(slots.filter((s) => s.zone === 'extra'), 'extra'))`<br>第一遍对 extra 槽位：`hit === undefined` → `demoted.push(...)` → return false（**push#1**）<br>第二遍同一个槽位再次进入 `keep`：条件仍成立 → `demoted.push(...)`（**push#2**）<br>两遍都是 `filter` 新数组，`slots` 原数组未被修改，所以第二遍仍能看到它 |
| **10. 相关测试及覆盖情况** | 无（`augment` 0 测试） |
| **11. 与旧问题重复性** | 与 BH-006 同一函数、同一设计（两遍过滤 + 共享外部数组），但**症状不同**（重复降级 vs 兜底重复）。可作为同一修复批次 |
| **12. 用户影响** | 高级区同一字段出现两次；`capabilityNote` 文案数字错误（误导用户以为本包字段差异很大） |
| **13. 修复方向** | 用 `Set` 记录已降级的 key：`const demotedKeys = new Set<string>()`，push 前判重；或只做一遍过滤再分区 |
| **14. 修复前需补充的验证** | **未确认部分**：`minecraft:crafting_shaped` 的 `key` 槽位是否真的会在 `inferred` 中缺失。若 L1 反推总是产出 `key`（shaped 配方 JSON 必然有 `pattern`+`key`），则本条在实际数据上不触发。需跑一次"带 shaped 配方的包扫描 + `schema:get('minecraft:crafting_shaped')`"看 `extraFields` 是否有重复 `key` |

---

## BH-008 · 钩子沙箱黑名单匹配原始源码（含注释/字符串），合法钩子被误拒

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `inspectHookSource()` 对**原文**跑正则黑名单（含 `import` / `process` / `fs` / `prototype` / `Symbol` / `Function` / `eval` 等），不区分代码、注释与字符串字面量 |
| **2. 状态** | **B（高度疑似 Bug）**。判定依据：逻辑上必然误伤；但是否视为缺陷取决于产品是否接受"宁可误杀"的保守策略 |
| **3. 严重程度** | **P2**。判定依据：插件作者写一个正常钩子却拿到"使用了被禁用的能力"这种**指错方向**的错误，排查成本高 |
| **4. 涉及文件及行号** | `src/main/plugins/hookSandbox.ts:21-43`（`FORBIDDEN` 表）、`:74-81`（`inspectHookSource`，直接 `pattern.test(source)`）、`:134-139`（拒绝分支） |
| **5. 相关调用链** | `codegen` 走插件钩子 → `runEmitHook(loc, input)` → `readFileSync` → `runHookSource(loc, source, input)` → `inspectHookSource(source)` → 命中即 `{ok:false, error:'钩子 … 使用了被禁用的能力：…'}` |
| **6. 触发条件** | 钩子源码里出现被禁词，**哪怕只在注释或字符串里**。例如：<br>① 注释 `// import 的物品放进 result` → 命中 `\bimport\b`；<br>② 字符串 `quote('import')` 或 `fieldName('process')` → 命中 `<br>③ 合法用 `Array.prototype.join` → 命中 `\bprototype\b`；<br>④ 写 `typeof Symbol` 或任何 `Symbol.xxx` → 命中 `\bSymbol\b`；<br>⑤ 注释里出现 "fs"（如 `// reads fs?`）→ 命中 `\bfs\b` |
| **7. 预期行为** | 黑名单应针对**可执行语义**（如 `require(` 调用、`process.` 访问），或先做词法分析剔除注释/字符串；至少错误信息应说明"命中位置" |
| **8. 实际可能发生的行为** | 合法钩子被拒，`codegen` 降级或报错；作者按错误提示去删"require"，但源码里根本没有 `require`，无从修改 |
| **9. 源码证据** | `hookSandbox.ts:75-81`：<br>`for (const entry of FORBIDDEN) { if (entry.pattern.test(source) && !hits.includes(entry.label)) hits.push(entry.label) }` —— `source` 是文件原文，未剥离注释/字符串。<br>`FORBIDDEN` 含 `{ pattern: /\bimport\b/, … }`、`/\bprototype\b/`、`/\bSymbol\b/`、`/\bfs\b/`、`/\bprocess\b/` |
| **10. 相关测试及覆盖情况** | `tests/plugins/sandbox.test.ts` 存在（`resetPluginLoader` 被导入），需确认它测的是"拦截成功"还是也有"合法钩子通过"的正向用例。**保守判断：当前用例以负向（必须拦住）为主**，缺少"含 `import` 注释的合法钩子应通过"这类正向用例 → 归为 C 类补充 |
| **11. 与旧问题重复性** | 不重复 |
| **12. 用户影响** | 插件作者按文档写钩子却被拒；错误信息指向错误原因，浪费排查时间；严重时会导致"某个插件在某些整合包上突然不工作"（因为注释里有英文单词） |
| **13. 修复方向** | ① 用 `acorn`（已是依赖）做词法/语法分析，只在真实标识符与成员访问上匹配；② 或保留正则但先把注释与字符串替换成空白再匹配（剥离用正则见本节下方代码块）；③ 错误信息里带上命中片段（前后各 20 字符） |
| **14. 修复前需补充的验证** | ① 需要产品确认：是否接受"宁可误杀"（若接受，本条降为 D/文档问题，但错误信息必须改）；② 找一个真实插件钩子看是否被误伤；③ 确认沙箱逃逸面：`vm` + `codeGeneration:false` 已能阻断 `eval`/`Function`，黑名单其实是**第二道**防线，误伤的收益/成本需重新评估 |

**建议的「先剥离注释与字符串」实现**（把注释/字符串替换为空白后再跑黑名单，可保留黑名单的严格性而消除误伤）：

```js
const STRIPPED = source.replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`/g,
  ' '
)
// 之后对 STRIPPED 跑 inspectHookSource 的 FORBIDDEN 表
```

> 注意：该正则本身不处理模板字符串里的 `${...}` 嵌套，作为「先用起来」的方案足够；若要严谨应改用 `acorn` 的 tokenizer（项目已依赖 `acorn`）。

---

## BH-009 · `ensureSchema` 把 IPC 失败当作"未知类型"缓存为 `null`

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `benchUiStore.ensureSchema` 用 `call()`（失败返回 `null`），把 `null` 当作合法结果写入 `schemaCache`，而缓存判定是 `cached !== undefined` → 一次失败永久生效 |
| **2. 状态** | **B（高度疑似 Bug）**。判定依据：逻辑上必然（失败与"未知类型"不可区分），但"是否真会失败"取决于运行期，缺实测 |
| **3. 严重程度** | **P2** |
| **4. 涉及文件及行号** | `src/renderer/src/views/bench/benchUiStore.ts:122-136`（`ensureSchema`）；`src/renderer/src/api.ts:5-20`（`call` 失败返回 `null`）、`:34-45`（`callOrThrow` 才区分错误） |
| **5. 相关调用链** | `applyType` / `syncCurrentSchema` / `SequenceEditor` → `ensureSchema(typeId)` → `call('schema:get')` → 失败时 `null` → `set({schema: null, schemaCache: {..., [typeId]: null}})` → 后续所有调用走 `cached !== undefined` 直接返回 `null` |
| **6. 触发条件** | 任意一次 `schema:get` 失败：主进程 handler 抛错（如 `customRecipeTypes.json` 不可写导致 `ensureSchemas` 内 `loadPinned` 抛错）、BH-002 的并发短路、IPC 超时/未注册 |
| **7. 预期行为** | 失败应与"未知类型"区分：不写入缓存（或写一个可失效的标记），并给用户可见的失败提示；`api.ts` 的注释本身写明"页面据此区分「加载失败」与「确实是空数据」"，说明作者知道这个区分必要 |
| **8. 实际可能发生的行为** | 一次瞬时失败 → 该类型在整场会话内都是 `null` → `applyType` 用 `bench.layoutKind` 兜底 / 通用表单；用户看到"字段消失了"，重开同类型也没用；日志里只有一条 `pushLog('ERROR', 'IO', …)`，容易被海量日志淹没 |
| **9. 源码证据** | `benchUiStore.ts:127-131`：`const cached = get().schemaCache[typeId]` / `if (cached !== undefined) { set({ schema: cached, … }); return cached }`。<br>`benchUiStore.ts:133-134`：`const schema = await call('schema:get', { typeId })` / `set({ schema, schemaLoading: false, schemaCache: { …get().schemaCache, [typeId]: schema } })` —— **无错误分支** |
| **10. 相关测试及覆盖情况** | `tests/renderer/ipcErrorFeedback.test.ts` 存在（4 例 8 断言），需确认是否覆盖 `ensureSchema` 的失败路径。`benchUiStore` 相关测试为 `benchStorePc2/pilot`，未见 `ensureSchema` 失败用例 → 归 C 类补充 |
| **11. 与旧问题重复性** | 不重复；与 BH-002 是"放大关系"（BH-002 制造 null，本条把它固化） |
| **12. 用户影响** | 编辑器降级且无法自愈；用户不知道是失败还是"这个类型本来就没字段" |
| **13. 修复方向** | `ensureSchema` 改用 `callOrThrow()` + try/catch：失败时 `set({schemaLoading:false})` 并 `toast(...)`，**不写 `schemaCache`**；或引入 `schemaError: Record<string, string>` 供 UI 展示重试按钮 |
| **14. 修复前需补充的验证** | ① 用例：mock `schema:get` 返回 `{ok:false}`，断言 `schemaCache[typeId]` 未被写入且 UI 有错误提示；② 确认 `applyType` 在 `schema === null` 时的兜底是否会让用户误以为"这个类型只有这些字段" |

---

## BH-010 · `pinCurrent` / `unpinCurrent` 失败时静默无反馈

| 项 | 内容 |
| --- | --- |
| **1. 标题** | 两个钉住操作的失败分支都是 `if (!x) return`，用户点按钮后界面毫无变化，也没有 toast |
| **2. 状态** | **B（高度疑似）** |
| **3. 严重程度** | **P3** |
| **4. 涉及文件及行号** | `src/renderer/src/views/bench/benchUiStore.ts:184-191`（`pinCurrent`）、`:193-202`（`unpinCurrent`） |
| **5. 相关调用链** | `BenchHead.tsx:51/55` 按钮 → `pinCurrent()` / `unpinCurrent()` → `call('schema:pin' \| 'schema:unpin')` → 失败返回 `null` → `if (!pinned) return` / `if (!ok) return` |
| **6. 触发条件** | `schema:pin` 抛错（如 `assertPinnable` 拒绝、`persistPinned` 写盘失败：磁盘满 / userData 只读）或 `schema:unpin` 返回 `false` |
| **7. 预期行为** | 失败时给错误 toast 与日志（`call()` 内部有 `pushLog`，但那是日志面板，不是即时反馈） |
| **8. 实际可能发生的行为** | 按钮点了没反应，用户反复点；`schema:unpin` 返回 `false`（本来就没钉住）也被当作失败静默处理 |
| **9. 源码证据** | `benchUiStore.ts:187-188`：`const pinned = await call('schema:pin', { … })` / `if (!pinned) return`；`:196-197`：`const ok = await call('schema:unpin', { … })` / `if (!ok) return` |
| **10. 相关测试及覆盖情况** | `tests/renderer/ipcErrorFeedback.test.ts` 主体测的是其他通道；`pinCurrent`/`unpinCurrent` 无测试 |
| **11. 与旧问题重复性** | 不重复（台账 `P2-CLOSEGUARD` 等无关） |
| **12. 用户影响** | 认为功能坏了；无法区分"失败"与"无需操作" |
| **13. 修复方向** | 用 `callOrThrow` + try/catch，失败 toast 具体原因；`unpin` 的 `false` 视为"本来未钉住"，提示 `info` 而非静默 |
| **14. 修复前需补充的验证** | 用例：mock 失败，断言调用了 `toast(..., 'error')` |

---

## BH-011 · `src/main/schema` 核心合并逻辑无直接单测（测试缺口）

| 项 | 内容 |
| --- | --- |
| **1. 标题** | 五层合并的全部核心函数在 `tests/` 中**零提及** |
| **2. 状态** | **C（测试缺口）**。**不代表产品已出错** |
| **3. 严重程度** | **P2**。判定依据：这是"配方类型/字段从哪来"的核心，错了会直接影响用户能不能编辑某类配方 |
| **4. 涉及文件及行号** | `src/main/schema/registry.ts`（`augment` / `applyMerge` / `overlayJar` / `pinSchema` / `unpinSchema` / `loadPinned`）、`infer.ts`（`inferSchema`）、`classParser.ts`（`parseClassFile`）、`primitives.ts`、`naming.ts`、`registryOptions.ts`（8 文件 / 2,073 行） |
| **5. 相关调用链** | `schema:*` 全部通道 → `ensureSchemas` → `applyMerge` → `augment` / `overlayJar` → `decideForSchema` |
| **6. 触发条件** | 不适用（缺口类） |
| **7. 预期行为** | 五层优先级、字段提升/降级、`sampleCount`/`lowConfidence` 计算、钉住覆盖语义，都应有单测锁死 |
| **8. 实际可能发生的行为** | 无自动化保护；BH-006 / BH-007 这类逻辑矛盾能长期存在正是因为没人测 |
| **9. 源码证据** | `grep -rl "<fn>" tests/` 结果：`augment` **0**、`applyMerge` **0**、`overlayJar` **0**、`classParser` **0**、`parseClassFile` **0**、`primitives` **0**、`naming` **0**、`inferSchema` **0**、`buildPluginSchema` **0**；`resolvePluginOverrides` 1、`registryOptions` 1 |
| **10. 相关测试及覆盖情况** | 现有 `tests/main/schemaService.test.ts`（6 例）只测服务层出口（`schemaSummaries`/`schemaById`/`coverage`/`buildCoverageReport`），**不触及合并算法**；`tests/schema/*`（5 文件）测的是 `shared/schemaModel` 的规范化，不是 `main/schema` 的合并 |
| **11. 与旧问题重复性** | 台账条件 `P0-R2`（钉住仅结构校验）/`P0-R3`（覆盖度语义）与本缺口相关但不同：那两条说的是"功能不够"，本条说的是"没有测试"，不改变它们的状态 |
| **12. 用户影响** | 间接——缺陷会以"某类配方字段不对/类型缺失"的形式到达用户，且回归风险高 |
| **13. 修复方向** | 至少补三组：① `augment`（部分重合 / 完全不重合 / sampleCount=0 / required）；② `applyMerge`（四层优先级、pinned 覆盖、jar 只补语义）；③ `pinSchema`→`loadPinned` 往返 |
| **14. 修复前需补充的验证** | 本项本身就是"需补的验证"，无需前置 |

---

## BH-012 · `schema:pin` 无"钉住内容 == 提交内容"断言（测试缺口，针对 BH-001）

| 项 | 内容 |
| --- | --- |
| **1. 标题** | 没有任何用例验证 `schema:pin` 落盘的内容就是调用方提交的内容 |
| **2. 状态** | **C（测试缺口）** |
| **3. 严重程度** | **P2** |
| **4. 涉及文件及行号** | `tests/main/ipcWiring.test.ts:82`（只有通道名）；`tests/main/schemaService.test.ts`（无 `togglePin` 用例） |
| **5. 相关调用链** | 见 BH-001 |
| **6. 触发条件** | 不适用 |
| **7. 预期行为** | 用例应构造"提交 schema ≠ 注册表 schema"，断言 `customRecipeTypes.json` 内容 |
| **8. 实际可能发生的行为** | BH-001 因此长期未被发现 |
| **9. 源码证据** | `grep -rn "schema:pin\|togglePin\|pinSchema" tests/` → **仅** `ipcWiring.test.ts:82` 的通道名 |
| **10. 相关测试及覆盖情况** | 同第 9 项 |
| **11. 与旧问题重复性** | 不重复 |
| **12. 用户影响** | 间接 |
| **13. 修复方向** | 见 BH-001 第 14 项 |
| **14. 修复前需补充的验证** | — |

---

## BH-013 · 插件 `recipeTypes` / `virtualItemPatterns` 无数量上限

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `parseManifest` 对数组长度无任何上限校验 |
| **2. 状态** | **D（待验证风险）** |
| **3. 严重程度** | **P3** |
| **4. 涉及文件及行号** | `src/main/plugins/manifest.ts:260`（patterns）、`:274-292`（recipeTypes 循环）；`hookSandbox.ts:19` 有 `HOOK_SOURCE_MAX_BYTES`，说明作者对体积有意识，但 manifest 没有对应上限 |
| **5. 相关调用链** | 插件 `manifest.json` → `parseManifest` → `buildPluginSchema` ×N → `record.schemas` → 注册表 |
| **6. 触发条件** | 插件声明极多类型/通配符（恶意或误生成）。插件是本地文件，攻击面有限 |
| **7. 预期行为** | 应有显式上限（如 500 类型 / 1000 通配）并 WARN 截断 |
| **8. 实际可能发生的行为** | 未测。可能拖慢 `applyMerge` / 类型选择器渲染 |
| **9. 源码证据** | `manifest.ts` 中所有 `parseXxxList` 都只校验"是数组"，无 `length` 上限；`HOOK_SOURCE_MAX_BYTES` 只约束钩子文件，不约束 manifest |
| **10. 相关测试及覆盖情况** | `tests/plugins/` 有 manifest 相关用例（5 文件），但无超大输入用例 |
| **11. 与旧问题重复性** | 不重复 |
| **12. 用户影响** | 极端情况下 UI 卡顿；非数据安全 |
| **13. 修复方向** | 加 `MAX_TYPES` / `MAX_PATTERNS` 常量 + 超限 WARN |
| **14. 修复前需补充的验证** | 需构造一个 10k 类型的 manifest 实测加载耗时，才能确定是否值得修 |

---

## BH-014 · 插件清单文件变更不纳入缓存键，热改必须重启

| 项 | 内容 |
| --- | --- |
| **1. 标题** | `loadPlugins` 的 `cache.key` 只含路径与版本，不含 manifest 文件的 mtime/size；改了插件内容（不改路径）不会重载 |
| **2. 状态** | **D（待验证风险）** |
| **3. 严重程度** | **P3** |
| **4. 涉及文件及行号** | `src/main/plugins/loader.ts:203-215`（`key` 组成与 `if (!cache \|\| cache.key !== key)`） |
| **5. 相关调用链** | 用户手工修好一个坏插件 JSON → `plugins:list` → cache.key 未变 → 返回旧 records（仍是 `failed`） |
| **6. 触发条件** | 应用运行期间修改插件文件（文档可能已要求重启，**需核对** `docs/plugins/插件编写说明.md` 是否写明） |
| **7. 预期行为** | 要么纳入 mtime，要么文档明确"改插件需重启"，并在 UI 提供"重新加载插件" |
| **8. 实际可能发生的行为** | 用户改完看不到效果，误以为插件格式仍错 |
| **9. 源码证据** | `loader.ts:206`：`const key = \`${modpackPath ?? ''}\\u0000${userDir ?? ''}\\u0000${modpack?.modsDir ?? ''}\\u0000${appVersion}\`` —— 无文件签名 |
| **10. 相关测试及覆盖情况** | `tests/plugins/loader.test.ts` 每个用例前 `resetPluginLoader()`，**不测缓存命中行为** |
| **11. 与旧问题重复性** | 不重复（台账 `P0-R5` 是"插件开关重启后是否一致"，不同） |
| **12. 用户影响** | 开发者体验问题 |
| **13. 修复方向** | `key` 追加 `entries.map(e => mtime+size).join()`；或加 `resetPluginLoader()` 的 IPC |
| **14. 修复前需补充的验证** | 先核对插件文档是否已写"改动需重启"；若已写明，本条降为文档已覆盖，只保留"建议加 reload 按钮" |

---

## 附录 A · 与既有问题的去重对照

| 本文件编号 | 与 N-01～N-07 | 与台账 40 条 | 说明 |
| --- | --- | --- | --- |
| BH-001 | 不重复 | 不重复 | `P0-R2` 是校验深度，本条是"校验后丢弃" |
| BH-002 | 不重复 | 不重复 | — |
| BH-003 | 不重复 | 不重复 | 台账只有 `P0-PL1`（recipeTypes）/`P0-PL2`（UI 开关） |
| BH-004 | 不重复 | **同根因 `P0-PL1`** | 应作为 `P0-PL1` 的补充证据，不另建条件 |
| BH-005 | 不重复 | **同根因 `P0-PL1`**（与 `P0-R5` 相邻） | 同上 |
| BH-006 | 不重复 | 不重复 | — |
| BH-007 | 不重复 | 不重复 | 与 BH-006 同函数，不同症状 |
| BH-008 | 不重复 | 不重复 | — |
| BH-009 | 不重复 | 不重复 | 放大 BH-002 |
| BH-010 | 不重复 | 不重复 | — |
| BH-011 | 不重复 | 与 `P0-R2`/`P0-R3` 相关但不同 | 缺口类，不改那两条状态 |
| BH-012 | 不重复 | 不重复 | 针对 BH-001 |
| BH-013 | 不重复 | 不重复 | — |
| BH-014 | 不重复 | 与 `P0-R5` 相邻但不同 | — |

**共同根因归并**：

- **「插件层与 schema 注册表之间没有同步机制」** → BH-004 + BH-005（2 项，1 个根因）
- **「`augment()` 两遍过滤 + 共享 `demoted` 数组」** → BH-006 + BH-007（2 项，1 个根因族）

→ **14 项发现 → 按根因合并后 12 个独立问题。**

---

## 附录 B · 严重度判定纪律

| 级别 | 本文件采用的门槛 |
| --- | --- |
| **P0** | 不可恢复的数据丢失 / 崩溃 / 可远程利用的安全漏洞。**本次无 P0** |
| **P1** | 用户可见的核心功能失效且**无法自愈**（需重启才恢复），或写入内容错误 |
| **P2** | 功能静默失效 / 状态不一致 / 校验或契约错误，有绕行办法 |
| **P3** | 文案、反馈、边界、性能、开发者体验 |

> **未把 C/D 包装成 A**：BH-011/BH-012 明确标注为"测试缺口，不代表产品已出错"；BH-013/BH-014 明确标注为"需实测才能定级"。BH-007/BH-008/BH-009/BH-010 标注 B 并逐条写明"未确认的部分"。
