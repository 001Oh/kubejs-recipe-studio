# BUG-HUNT-01 · 覆盖情况记录（COVERAGE）

> **本文件的目的**：如实记录本轮**读过什么、追踪了哪些链路、哪些没读**。
> **不声称完成全量深入检查。**
> **基线**：台账 v9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`）；工程 `E:\mc kjs`
> **执行时间**：2026-11-01 08:42–09:05
> **操作性质**：只读。未修改任何文件；未构建 / 安装 / 启动 / 扫描 / 跑测试。

---

## 0. 一句话结论

本轮**深入读了 4 个此前完全未读的模块中的 2 个**（`main/schema` 的服务层与注册表、`main/plugins` 的 loader 与沙箱），并**补读了渲染层的 IPC 桥与两个 store 的关键段**、**3 个测试文件的全部断言**。
**未读**：`schema/{classParser,infer,primitives,naming,registryOptions}`、`plugins/{manifest,merge,capabilityLink,report}`、`renderer` 的大部分视图与组件、`tests` 的约 60 个文件断言体、`scanner` / `codegen` / `recipes` / `modpack` 的多数实现。

---

## 1. 已深入阅读的文件（本轮全文或整函数段）

### 1.1 主进程 · Schema 模块

| 文件 | 行数 | 阅读范围 | 关键结论 |
| --- | --- | --- | --- |
| `src/main/schema/service.ts` | 141 | **全文** | 发现 BH-002（`ensureSchemas` 并发短路）、BH-004（`ensureSchemas` 不装插件层） |
| `src/main/schema/registry.ts` | 266 | **全文** | 发现 BH-006（`augment` 兜底重复）、BH-007（`demoted` 双推）；确认 `clearSchemas` 清空 plugin 层 |
| `src/main/schema/capability.ts` | 184 | **全文** | 核对了 `buildCoverageReport` 的分母自洽（`structurable+genericOnly+unsupported=total` 成立）；发现 `unsupportedTypes` 数组含 `genericOnly` 项（**语义偏差，未单列为 BH**，见 §5 盲区说明） |
| `src/main/handlers/schemaHandlers.ts` | 75 | **全文** | 发现 BH-001（`assertPinnable` 校验后被丢弃） |

### 1.2 主进程 · 插件系统

| 文件 | 行数 | 阅读范围 | 关键结论 |
| --- | --- | --- | --- |
| `src/main/plugins/loader.ts` | 301 | **全文** | 发现 BH-004/BH-005（注册表不同步）、BH-003（`matchesVirtualItem` 死代码）、BH-014（缓存键无文件签名） |
| `src/main/plugins/hookSandbox.ts` | 184 | **全文** | 发现 BH-008（黑名单匹配注释/字符串）；确认沙箱边界（`vm` + `codeGeneration:false` + 1s 超时 + 64KB 上限 + 路径包含检查）实际存在且实现正确 |
| `src/main/handlers/pluginHandlers.ts` | 32 | **全文** | 入参校验完整（非空 id + boolean on）；确认失败不静默 |

### 1.3 渲染层

| 文件 | 行数 | 阅读范围 | 关键结论 |
| --- | --- | --- | --- |
| `src/renderer/src/api.ts` | 59 | **全文** | 确认 `call` / `callOrThrow` / `callRaw` 三种语义；`call` 失败返回 `null` 是 BH-009 的根源 |
| `src/renderer/src/views/bench/benchUiStore.ts` | 约 220 | **L105–215**（`loadSummaries` / `ensureSchema` / `applyType` / `syncCurrentSchema` / `registryOptions` / `pinCurrent` / `unpinCurrent`） | 发现 BH-009（失败缓存 null）、BH-010（静默失败）、BH-001 的调用端 |
| `src/renderer/src/store/appStore.ts` | 398 | **L140–215、L370–399** | `init` 的 `Promise.all` 用 `call` 容错，未发现问题；`index-ready` 里的 `modpack:current` 回填存在**窄窗口竞态**（未单列，见 §5） |
| `src/renderer/src/views/bench/layouts/SequenceEditor.tsx` | — | **L130–175** | 确认 BH-002 的并发触发点 `for (const typeId of missing) void ensureSchema(typeId)` |
| `src/renderer/src/views/BenchView.tsx` | — | **L35–60** | 确认 `schema:list` 在 mount 时发起，且用 `callOrThrow` 正确处理了错误态 |
| `src/renderer/src/views/SettingsView.tsx` | — | **L25–45** | 确认 `schema:coverage` / `plugins:list` / `scripts:list` **并发**发起并各自区分错误（写法正确） |

### 1.4 数据与共享层

| 文件 | 阅读范围 | 用途 |
| --- | --- | --- |
| `src/shared/search.ts` | L280–305 | 确认 `isVirtualItem` 不消费插件规则（BH-003 的关键证据） |
| `src/main/scanner/itemRules.ts` | L190–205 | 确认扫描期虚拟标记来源 |
| `src/data/recipeTypes/minecraft.ts` | L1–72 | 确认 `slots` 内存在 `zone:'extra'` 实例（BH-007 的触发前提） |
| `src/shared/types.ts` | L1–30、L200–230 | 确认 `SchemaSource` 含 `'custom'`；`RecipeTypeSchema` 字段完整 |

### 1.5 测试文件（本轮读全文并逐条核对断言）

| 文件 | 用例 / 断言 | 核对结论 |
| --- | --- | --- |
| `tests/main/schemaService.test.ts` | 6 / 21 | 只测服务层出口；**串行调用**，无并发用例 → BH-002 未覆盖；无 `togglePin` → BH-001/BH-012 未覆盖 |
| `tests/main/ipcWiring.test.ts` | 4 / 7 | **质量好**：`missing`/`extra` 双向断言，能真正拦住漏接线；但只断言"通道已注册"，不断言行为 |
| `tests/main/windowGuards.test.ts` | 3 / 5 | 是**源码文本扫描**（断言文件里出现 `installNavigationGuards(`），不是行为测试。**但这不构成缺口**——导航行为另由 `navigation.test.ts` + `navigationBoundary.test.ts` 覆盖（见 §2.3） |

---

## 2. 已追踪的调用链（12 条）

### 2.1 完整追踪并落地为发现的链路

| # | 链路 | 结果 |
| --- | --- | --- |
| 1 | `BenchHead` 按钮 → `benchUiStore.pinCurrent` → `schema:pin` → `assertPinnable` → `togglePin` → `ensureSchemas` → `getSchema` → `pinSchema` → `persistPinned` → `customRecipeTypes.json` | **BH-001、BH-010、BH-012** |
| 2 | `SequenceEditor` useEffect → N× `ensureSchema` → `schema:get` → `schemaById` → `ensureSchemas` → `listSchemas`/`getSchema` → `schemaCache` | **BH-002、BH-009** |
| 3 | `plugins:list` → `loadPlugins` → `listPluginFiles` → `buildRecord` → `parseManifest` → `missingDependencyMods` → `buildPluginSchema` → `pushToRegistry` → `upsert` → `layerMaps.plugin` | **BH-004** |
| 4 | 任意 `schema:*` → `ensureSchemas` → `factsKey()` 变化 → `clearSchemas` → `putMany('builtin')` → `loadPinned` → `applyMerge` | **BH-004**（插件层被清空） |
| 5 | `plugins:setEnabled` → `setEnabled` → `userDisabled` → `currentRecords` → `snapshot`（**无注册表调用**） | **BH-005** |
| 6 | 插件 manifest `virtualItemPatterns` → `parseManifest` → `manifestOf` → `report.ts:135` 计数；对照 `itemRules.ts:199` → `isVirtualItem`（不看插件） | **BH-003** |
| 7 | `applyMerge` → `augment` → `keep` ×2 + `demoted` → `extraFields` | **BH-006、BH-007** |
| 8 | 插件钩子 → `pluginHooks()` → `runEmitHook` → `resolveHookPath` → `readFileSync` → `inspectHookSource` → `new Script` → `runInContext` → `contextPayload['__result']` | **BH-008**；确认路径包含与超时实现正确 |

### 2.2 追踪后**未发现问题**的链路（同样重要）

| # | 链路 | 结论 |
| --- | --- | --- |
| 9 | `SettingsView.refresh` 三路并发（`schema:coverage` / `plugins:list` / `scripts:list`） | 各用 `callOrThrow` + 独立 error state，**错误与空数据被正确区分**。写法可作范式 |
| 10 | `appStore.init` 的 `Promise.all([app:runtime, ui:get, modpack:current])` | `call` 返回 null 时逐项 `if (x) set(...)`，**不会用 null 覆盖已有状态** |
| 11 | `subscribeStudioEvents` → `scan-failed` | 置 `scanning:false` + `banner(..., 'error')`，**没有静默吞掉** |
| 12 | `hookSandbox` 沙箱逃逸面 | `createContext({}, {codeGeneration:{strings:false,wasm:false}})` + 1s 超时 + 只注入 JSON 数据（无宿主对象）+ `resolveHookPath` 做 `startsWith(root+sep)` 包含检查。**实现与注释一致，未发现逃逸口** |

### 2.3 反向核对：确认**不是**缺口的事项

| 疑似缺口 | 核实结果 |
| --- | --- |
| "导航守卫只有静态扫描测试" | **不成立**。`tests/main/navigation.test.ts`（8 例）覆盖：允许应用页面 / 允许渲染目录内路由 / 拒绝目录外 `file://`（含穿越）/ 拒绝 http(s) 与不可信协议 / 拒绝畸形 URL；`tests/main/navigationBoundary.test.ts` 覆盖同源与端口/主机差异。`windowGuards.test.ts` 只是额外的结构性护栏 |
| "`ipcWiring.test.ts` 断言太弱（4 例 7 断言）" | **不成立**。它做 `missing` 与 `extra` **双向**断言，任何漏接线或多余注册都会失败；这正是 P0 缺口的对症测试 |
| "`buildCoverageReport` 分母不自洽" | **不成立**。逐项推演 `structurable + genericOnly + unsupported = totalTypes` 成立，且 `schemaService.test.ts:38` 有断言锁死 |
| "`schema:pin` 会把渲染端任意对象写盘（注入风险）" | **不成立**。落盘的是 `getSchema(typeId)` 的返回值，渲染端对象被丢弃——这既是安全问题上的"侥幸",也是 BH-001 的功能缺陷 |

---

## 3. 尚未检查的区域（明确列出）

### 3.1 Schema 模块剩余（**未读**）

| 文件 | 行数 | 为何重要 |
| --- | --- | --- |
| `src/main/schema/classParser.ts` | 450 | Java 字节码解析，`RecipeType` 提取的真源；异常输入可能导致崩溃或错误类型 |
| `src/main/schema/infer.ts` | 约 400 | L1 反推，直接产出 BH-006/BH-007 涉及的 `inferred` 对象 |
| `src/main/schema/primitives.ts` | 约 350 | 字段类型推断与默认值，关系到"必填/可选/类型约束是否一致" |
| `src/main/schema/naming.ts` | 约 300 | 字段显示名生成 |
| `src/main/schema/registryOptions.ts` | 约 220 | 注册表候选选项（`schema:registryOptions`） |

### 3.2 插件系统剩余（**未读全文**）

| 文件 | 行数 | 为何重要 |
| --- | --- | --- |
| `src/main/plugins/manifest.ts` | 481 | 本轮只**按 grep 看了校验分支**（约 20 行），未逐字段核对；BH-013 的定级依赖它 |
| `src/main/plugins/merge.ts` | 约 280 | `buildPluginSchema` / `resolvePluginOverrides` 的实现，决定插件字段如何映射成 slot |
| `src/main/plugins/capabilityLink.ts` | 约 150 | `missingDependencyMods` / `addonState` 的判定，关系到"依赖缺失整包禁用"是否正确 |
| `src/main/plugins/report.ts` | 约 160 | 插件报告 |

### 3.3 渲染层（**绝大部分未读**）

已读仅 6 个文件的片段（约 600 行 / 约 8,700 行）。**未读**：

- `store/benchStore.ts`（460 行，工作台核心状态机）
- `store/commitBridge.ts`（只读了 grep 摘要，未读全文）
- `store/draftBridge.ts`
- `views/Sidebar.tsx`（447 行）、`views/browse/*`
- `components/DetailPanel.tsx`（376 行）、`components/CodePane` 等 14 个组件
- `views/bench/layouts/*`（除 `SequenceEditor` 片段）
- `views/bench/panels/*`（除 `BenchHead`、`TypeSelect`、`WriteDialog` 片段）
- `views/bench/fieldModel.ts`（BH-006 的严重度取决于 `bucketFields` 是否去重——**未核实**）
- `hooks/*`

### 3.4 主进程其余模块（**未读**）

- `scanner/`：`jarScan.ts`、`iconPass.ts`、`zip.ts`、`scanService.ts`、`pool.ts`、`probeImport.ts`（只看了 `jarPoolCore` 片段与 `itemRules` 片段）
- `codegen/`：`emitScript.ts`、`emitJson.ts`、`context.ts`、`previewService.ts`（只看了 `writer.ts` 片段）
- `recipes/`：`listAndRead`、`record.ts`、`sources.ts`、`recipeIndex.ts`
- `modpack/`：`detect.ts`、`pathFix.ts`
- `cache.ts` 的 `writeJson` 无 `fsync`（已在 N-06 登记，未重复）

### 3.5 测试断言（**约 60 个文件的断言体未逐条读**）

本轮只完整读了 3 个测试文件（`schemaService` / `ipcWiring` / `windowGuards`）。其余按"用例数 / 断言数"做了静态统计（见下表），**但未逐条判断断言是否指向正确对象**。

| 断言密度偏低（需优先补读） | 用例 / 断言 |
| --- | --- |
| `tests/recipes/realPack.test.ts` | 1 / 9（条件跳过，非缺口） |
| `tests/shared/ipc.test.ts` | 2 / 3 |
| `tests/recipes/record.test.ts` | 3 / 7 |
| `tests/main/windowGuards.test.ts` | 3 / 5（已读，静态扫描，合理） |
| `tests/main/ipcWiring.test.ts` | 4 / 7（已读，质量好） |
| `tests/renderer/sidebarPaging.test.ts` | 4 / 11 |
| `tests/renderer/ipcErrorFeedback.test.ts` | 4 / 8（**与 BH-009 直接相关，应优先补读**） |

---

## 4. 因只读限制而无法验证的事项

| # | 无法验证的事项 | 限制原因 | 对应发现 |
| --- | --- | --- | --- |
| 1 | BH-002 的并发竞态是否在真机可稳定复现 | 需要启动应用 + 导入整合包 + 打开序列配方 | BH-002（A 级判定基于源码推导，未实测） |
| 2 | BH-007 是否在真实数据上触发（取决于 L1 反推是否总产出 `key` 槽位） | 需要跑一次扫描并读 `schema:get('minecraft:crafting_shaped')` 的 `extraFields` | BH-007（B 级） |
| 3 | BH-006 的严重度（UI 是否已去重） | 需要读 `fieldModel.bucketFields` 或看界面 | BH-006（标注"若 UI 已去重则降 P3"） |
| 4 | BH-003 的意图是"该做未做"还是"决定不做" | 需产品决策；`docs/plugins/插件编写说明.md` §7 承诺了该功能 | BH-003 |
| 5 | BH-008 是否被产品接受为保守策略 | 需产品决策 | BH-008 |
| 6 | BH-013 的实际影响（10k 类型的加载耗时） | 需构造超大 manifest 并实测 | BH-013（D 级） |
| 7 | BH-014 是否已被插件文档覆盖 | 需读 `docs/plugins/插件编写说明.md` 全文（本轮只看了 §7 片段） | BH-014（D 级） |
| 8 | `cacheHit` 运行时值 | 台账已登记"未测量"；本轮未扫描，**继续保持未测量**，不据此推断任何缓存 Bug | —（遵守任务要求，未包装成 Bug） |

---

## 5. 仍然存在的审计盲区

| # | 盲区 | 风险 |
| --- | --- | --- |
| B1 | **`applyMerge` 的 `decideForSchema` 与 `pinned` 的交互未穷举**：`applyMerge:224` 对 `pinnedFlag` 跳过 `decideForSchema`，意味着钉住后 `capability`/`channel` 冻结。若此后换整合包（附属模组变了），钉住的类型仍宣称"语法糖可用"——**可能是设计意图，也可能是陈旧状态**，本轮未判定 | 中 |
| B2 | **`unsupportedTypes` 数组语义与 `unsupported` 计数不一致**：`capability.ts:162-163` 的 filter 包含 `capability !== 'sugar' && slots+outputs === 0` 的项（即 `genericOnly`），但数组名与 UI 文案是"无法添加"。本轮**未单列为 BH**，因为需要先确认 UI 如何呈现该字段 | 低-中 |
| B3 | **`appStore` 的 `index-ready` → `modpack:current` 回填竞态**：若用户在事件与回填之间切换整合包，旧结果会覆盖新 `modpack`。窗口很窄，本轮**未单列**（缺复现条件） | 低 |
| B4 | **`api.ts:57` `iconUrl()` 未对 `window.studio` 缺失做保护**（`call` 有保护，`iconUrl` 没有） | 低（仅 preload 异常时 TypeError） |
| B5 | **`registry.ts:97` 的 `group` 语义**：`schema.pinned ? 'plugin'` 让用户钉住的类型在 UI 上归入"插件"组，而 `pinSchema` 把 `source` 设为 `'custom'`；`listSchemas` 里 `schema.source === 'custom' ? 'builtin'` 分支因此**不可达**（pinned 分支先命中）。可能是 UI 分组的有意取舍，也可能是死分支 | 低 |
| B6 | 上述 B1–B5 都属"看了但没定论"，**不是已排除** | — |

---

## 6. 覆盖度自评

| 维度 | 覆盖情况 |
| --- | --- |
| 源码文件（177 个） | **本轮新读 14 个**（4 全文 + 3 近全文 + 7 片段），累计已读约 31 个（含上一轮 17 个）→ 约 **18%** |
| 源码行数（26,447） | 本轮新读约 **1,900 行**（含片段），累计约 4,700 行 → 约 **18%** |
| 模块级 | `main/schema` 服务层+注册表 **~60%**；`main/plugins` loader+沙箱 **~45%**；`renderer` **< 8%**；`scanner`/`codegen`/`recipes`/`modpack` **< 15%** |
| 测试文件（64 个） | 全文读 **3 个**（累计 5 个）→ **8%**；其余仅统计用例/断言数 |
| 调用链 | 追踪 **12 条**，其中 8 条落地为发现、4 条确认无问题 |

> **明确声明**：本轮**没有**完成"全量逐行检查"。发现的 14 项集中在 `main/schema` 与 `main/plugins` 两处，这是因为这两个模块**首次被深入阅读**；`renderer` 与 `scanner`/`codegen` 仍是高概率藏有缺陷的区域，本轮的"未发现"**不等于"不存在"**。
