# BUG-HUNT-02 · 覆盖情况记录（COVERAGE）

> **工程**：`E:\mc kjs`｜**基线**：台账 v9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，未修改）
> **执行时间**：2026-11-01 08:54–09:06
> **本文件如实记录本轮读了什么、追踪了哪些链路、哪些没读**。**不声称完成全量检查。**

---

## 0. 执行前核对

| 任务书要求读取的 8 份资料 | 结果 |
| --- | --- |
| `AUDIT-FULL-01-ENGINEERING-AUDIT.md` | 存在，按本轮需要引用其结论（A/B/C/D 证据状态定义、N-01～N-07） |
| `AUDIT-FULL-01-EVIDENCE-MATRIX.md` | 存在 |
| `AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.md` | 存在，作为 D-1～D-8 待决项来源 |
| `AUDIT-FULL-01-R1-REPORT.md` | 存在，作为 C1–C8 与统计口径来源 |
| `BUG-HUNT-01-FINDINGS.md` | 存在，BH-001～014 逐条复核 |
| `BUG-HUNT-01-COVERAGE.md` | 存在，作为"未深入区域"清单 |
| `BUG-HUNT-01-SUMMARY.md` | 存在，作为去重基线（12 个独立问题） |
| `PROJECT-SEALING-LEDGER-REPORT.md`（V9） | 存在，MD5 与基线一致；**只读** |

**无缺失文件**，未做任何重建或猜测。

---

## 1. 本轮深入阅读的文件

### 1.1 新增全文阅读（BUG-HUNT-01 未读）

| 文件 | 行数 | 读法 | 产出 |
| --- | --- | --- | --- |
| `src/main/schema/infer.ts` | 299 | **全文** | 核对九步反推：并发消费 `cursor++` 无重复/遗漏、`presence` 去重正确、`pickSamples` 优先 `partial=false`、`slots` 可含 `zone:'extra'`（BH-007 前提）。**未发现 A 类缺陷** |
| `src/main/schema/primitives.ts` | 285 | **全文** | 产出 BH2-003（`looksBlockstate` 过宽）、BH2-004（`kindForField` 缺 `list`）、BH2-005（数量侧接受任意字符串）、BH2-006（`absorbsWholeLevel` 保守，**已排除**） |
| `src/renderer/src/views/bench/fieldModel.ts` | 约 130 | **L50–125** | 发现 `declaredFields` 已按 key 去重 → 更正 BH-006 的影响描述（BH2-002） |

### 1.2 因修复需要而重读/细读

| 文件 | 读法 | 用途 |
| --- | --- | --- |
| `src/main/schema/registry.ts` | 全文重读 + 大改 | BH-006/007 修复；新增 `replaceLayer` / 层提供者 / 快照戳 |
| `src/main/schema/service.ts` | 全文重读 + 大改 | BH-002（in-flight）、BH-001（override）、BH-004（层装配） |
| `src/main/handlers/schemaHandlers.ts` | 全文 | BH-001（把 schema 传下去） |
| `src/main/plugins/loader.ts` | 全文重读 + 大改 | BH2-001/004/005（同步机制）、BH-003（虚拟物品匹配器） |
| `src/main/plugins/hookSandbox.ts` | 全文重读 + 改 | BH-008（剥离注释/字符串） |
| `src/shared/search.ts` | 关键段（L30–40、L280–300） | BH-003（拆分规则 vs 匹配器） |
| `src/main/scanner/itemRules.ts` | L1–20、L150–205 | BH-003（扫描期改用仅命名规则） |
| `src/main/scanner/probeImport.ts` | L1–20、L150–165 | 同上 |
| `src/renderer/src/views/bench/benchUiStore.ts` | L1–20、L105–215 + 改 | BH-009/010 |
| `src/renderer/src/api.ts` | 全文 | 确认 `call`/`callOrThrow`/`callRaw` 语义 |
| `src/renderer/src/store/appStore.ts` | L200–215、Toast 定义 | 确认 Toast 结构为 `{id, level, text}`（修正测试断言字段） |
| `src/main/plugins/manifest.ts` | 按 `grep` 看校验分支（约 20 行） | 核对 `virtualItemPatterns` 解析与"未知字段忽略"策略；BH-013 的定级依据 |

### 1.3 测试文件

| 文件 | 读法 | 说明 |
| --- | --- | --- |
| `tests/main/ipcWiring.test.ts` | 全文（上一轮已读，本轮复用） | 确认通道断言方式，作为新测试的样板 |
| `tests/main/handlersWiring.test.ts` | 全文（上一轮） | electron mock + `ipcMain.handle` 捕获样板 |
| `tests/plugins/loader.test.ts` | **L1–101** | 复用其 `makeEnv` / `typeDecl` / manifest 形态 |
| `tests/renderer/ipcErrorFeedback.test.ts` | 全文 | 复用其 `stubGlobal('window', …)` 样板 |
| 新增 6 个测试文件 | 全部自写 | 见 REPAIR-REPORT §1 |

---

## 2. 追踪的调用链（12 条）

| # | 链路 | 结论 |
| --- | --- | --- |
| 1 | `BenchHead` → `pinCurrent` → `schema:pin` → `assertPinnable` → `togglePin` → `pinSchema` → `persistPinned` → `customRecipeTypes.json` | BH-001 已修 |
| 2 | `SequenceEditor` 并发 `ensureSchema` → `schema:get` → `schemaById` → `ensureSchemas` → `effective` | BH-002 已修 |
| 3 | `plugins:list` → `loadPlugins` → `listPluginFiles` → `buildRecord` → `parseManifest` → `buildPluginSchema` → （原 `pushToRegistry` 异步）→ `ensureSchemas.clearSchemas` | BH2-001/BH-004 已修 |
| 4 | `ensureSchemas` → `clearSchemas` → `putMany('builtin')` → **（原缺 plugin）** → `loadPinned` → `applyMerge` | BH-004 已修 |
| 5 | `plugins:setEnabled` → `setEnabled` → `userDisabled` → **（原无注册表连接）** | BH-005 已修 |
| 6 | 插件 `virtualItemPatterns` → `virtualItemPatterns()` → `matchesVirtualItem`（原零调用）→ `isVirtualItem` | BH-003 已修 |
| 7 | `applyMerge` → `augment` → `keep`×2 + `demoted` → `extraFields` → `declaredFields` 去重 | BH-006/007 已修 + BH2-002 更正 |
| 8 | 扫描 → `itemRules`/`probeImport` → `isVirtualItem` → `items.json.virtual` | BH-003 拆分为"仅命名规则"，未引入回归（完整套件验证） |
| 9 | 插件钩子 → `pluginHooks` → `runEmitHook` → `resolveHookPath` → `readFileSync` → `inspectHookSource` → `vm` | BH-008 已修 |
| 10 | `settings.refresh` 三路并发（`schema:coverage`/`plugins:list`/`scripts:list`） | **无问题**：各用 `callOrThrow` + 独立 error state，空数据与失败可区分 |
| 11 | `appStore.init` → `Promise.all([app:runtime, ui:get, modpack:current])` | **无问题**：`call` 返回 null 时逐项 `if (x) set(...)`，不会用 null 覆盖已有状态 |
| 12 | `ensureSchemas` 的 provider 回调 → `loader.currentPluginOverrides` → `loadPlugins`（key 感知）→ `resolvePluginOverrides` | 修复后新链路；已确认**不会无限递归**（第二次进缓存键即匹配） |

---

## 3. 本轮**未**深入的区域（与 BUG-HUNT-01 相比的变化）

| 区域 | BUG-HUNT-01 状态 | **本轮状态** |
| --- | --- | --- |
| `schema/infer.ts` | 未读 | ✅ **全文已读** |
| `schema/primitives.ts` | 未读 | ✅ **全文已读** |
| `schema/naming.ts`（287 行） | 未读 | ❌ **仍未读** |
| `schema/registryOptions.ts`（164 行） | 未读 | ❌ **仍未读** |
| `schema/classParser.ts`（450 行） | 未读 | ❌ **仍未读**（Java 字节码解析，异常输入路径完全未验证） |
| `plugins/manifest.ts`（302 行） | 未读 | 🟡 **仅读校验分支**（约 20 行 grep），未逐字段核对 |
| `plugins/merge.ts`（206 行） | 未读 | ❌ **仍未读**（`buildPluginSchema` / `resolvePluginOverrides` 实现） |
| `plugins/capabilityLink.ts`（111 行） | 未读 | ❌ **仍未读** |
| `plugins/report.ts`（138 行） | 未读 | ❌ **仍未读** |
| `renderer/benchStore.ts`（460 行） | 未读 | ❌ **仍未读** |
| `renderer/commitBridge.ts` | 只读 grep 摘要 | ❌ **仍未全文读** |
| `renderer/Sidebar.tsx`（447）、`DetailPanel.tsx`（376）、`CodePane` 等 14 组件 | 未读 | ❌ **仍未读** |
| `scanner/`（jarScan/iconPass/zip/scanService/pool） | 未读 | ❌ **仍未读**（只碰了 `itemRules`/`probeImport` 的 virtual 入口） |
| `codegen/`（emitScript/emitJson/context/previewService） | 未读 | ❌ **仍未读** |
| `recipes/`（listAndRead/record/sources/recipeIndex） | 未读 | ❌ **仍未读** |
| `modpack/`（detect/pathFix） | 未读 | ❌ **仍未读** |
| `tests/` 其余约 58 个文件的断言体 | 未读 | ❌ **仍未逐条读**（本轮只补写了 6 个新文件） |

---

## 4. 因只读/边界限制而未验证的事项

| # | 事项 | 限制 | 影响 |
| --- | --- | --- | --- |
| 1 | 真机并发（多步序列配方首次打开是否还会降级） | 需启动应用 | BH-002 的修复只有单测证据，无真机证据 |
| 2 | 真实整合包下 `augment` 的降级行为（`key` 槽位是否会被降级） | 需扫描真实包 | BH-006/007 的修复在单测中构造样本验证，未在真实数据上验证 |
| 3 | 插件通配在 43k 物品下的查询耗时 | 需启动应用 + 真实索引 | BH-003 的性能影响未测（只有编译缓存的设计保证） |
| 4 | `cacheHit` 运行时值 | 需扫描 | **仍为未测量**；本轮未把它当缓存 Bug |
| 5 | UI 实际呈现（toast 是否可见、布局变化观感） | 需启动应用 | BH-009/010、BH-006 的用户可见变化只在断言层面验证 |
| 6 | `isVirtualItem` 语义变化对**已存在缓存**的影响 | 需真实 `items.json` | 已通过"扫描期改用仅命名规则"规避，但**既有缓存里已有 `virtual` 标记**不会被改写（设计如此），未实测 |
| 7 | 插件清单热改（BH-014）行为 | 需启动应用 + 改文件 | 未验证 |

---

## 5. 仍然存在的审计盲区

| # | 盲区 | 风险 | 说明 |
| --- | --- | --- | --- |
| B1 | **`classParser.ts` 完全未读**（450 行，全工程最大单文件之一） | **高** | 解析 Java 类文件的是"配方类型从哪来"的真源；异常/畸形字节码的崩溃路径完全未验证 |
| B2 | **`plugins/merge.ts` 未读** | 中 | `buildPluginSchema` 决定插件字段如何映射成 slot；本轮只验证了"层是否同步"，没验证"映射是否正确" |
| B3 | **`renderer/benchStore.ts` 未读**（460 行） | 中 | 工作台值字典 + 撤销历史的核心；`dirtyFields` 计算、`carryValues` 丢字段等风险未查 |
| B4 | **`codegen/` 未读** | 中 | 预览与实际写入是否一致（任务书 D 项重点）未验证 |
| B5 | **58 个测试文件的断言体未逐条审** | 中 | 只统计了用例/断言数（上轮），本轮未扩大抽查面 |
| B6 | **`looksBlockstate` 与真实数据的匹配度未定**（BH2-003） | 中 | 若 `{id,count}` 形态在真实包中常见，则会产出一批被误判为 blockstate 的字段 |
| B7 | 上列盲区**均属"没看"而非"看了没问题"** | — | 不得由本报告的"未发现"推出"不存在" |

---

## 6. 覆盖度自评

| 维度 | 本轮增量 | 累计（含 BUG-HUNT-01） |
| --- | --- | --- |
| 源码文件（177 个） | 新增全文 2 个（`infer`、`primitives`）+ 因修复细读 9 个 | 约 **31 / 177 ≈ 18%**（全量口径未变，但**首次覆盖了两个核心算法文件**） |
| 源码行数（26,447） | 新增约 584 行全文 + 约 1,900 行修复相关细读 | 约 **6,600 / 26,447 ≈ 25%** |
| 模块级 | `main/schema` 服务层+注册表+原语+推断 **约 85%**；`main/plugins` **约 65%**；`renderer` **约 12%**；`scanner`/`codegen`/`recipes`/`modpack` **< 20%** | — |
| 测试文件（64 → 70） | 新增 6 个（48 用例），全文读 3 个既有文件 | 全文读 **8 / 70 ≈ 11%** |
| 调用链 | 12 条（8 条落地为发现，4 条确认无问题） | 累计 24 条 |

**明确声明**：本轮把 `main/schema` 的"推断 + 原语"补到了可下结论的程度，但 `classParser`、`plugins/merge`、`renderer` 主体、`codegen`、`scanner` 主体仍是**未深入**区域。本轮的 7 项新发现全部集中在 `schema` 与 `plugins` 两个模块，这是**覆盖优先级的产物**，不是"其他模块没问题"的证据。
