# P0：IPC 功能接线与完整性修复 · 验收报告

日期：2026-10-31
依据：`docs/PROJECT-WIDE-AUDIT-REPORT.md` 的 **C1**（IPC 通道未接线）
范围：只做接线与 `schema:*` 补充实现 + 渲染端错误反馈 + 测试。未改冻结基线，未打包，未清理目录。

---

## 1. 修复前后的通道映射表

> 审计报告只列了 `schema:list` / `schema:coverage`；**实际 IPC 契约里 schema 有 6 个通道**（`schema:get` / `schema:registryOptions` / `schema:pin` / `schema:unpin` 同样被工作台调用），本报告按源码为准。

| 通道 | Main 实现 | 修复前 | Renderer 调用方 | 修复后 |
| --- | --- | --- | --- | --- |
| `codegen:preview` | `codegenHandlers.ts:66`（已实现） | **未注册** | `views/CodePane.tsx:63` | ✅ 已注册，可用 |
| `codegen:checkTarget` | `:74`（已实现） | **未注册** | `bench/panels/WriteDialog.tsx:56` | ✅ 已注册，可用 |
| `codegen:write` | `:91`（已实现） | **未注册** | `WriteDialog.tsx:71` | ✅ 已注册，可用 |
| `scripts:list` | `:109`（已实现） | **未注册** | `WriteDialog.tsx:50`、`SettingsView.tsx` | ✅ 已注册，可用 |
| `scripts:rename` | `:123`（已实现） | **未注册** | `SettingsView.tsx:286` | ✅ 已注册，可用 |
| `plugins:list` | `pluginHandlers.ts:18`（已实现） | **未注册** | `SettingsView.tsx` | ✅ 已注册，可用 |
| `plugins:setEnabled` | `:22`（已实现） | **未注册** | 当前 UI 无开关入口 | ✅ 已注册（UI 未使用，见 §10） |
| `schema:list` | **无** → 新增 `schemaHandlers.ts` | 无实现 | `benchUiStore.ts:118`、`BenchView.tsx:45` | ✅ 新实现，可用 |
| `schema:get` | **无** → 新增 | 无实现 | `benchUiStore.ts:133,199` | ✅ 新实现，可用 |
| `schema:registryOptions` | **无** → 新增（复用 `registryOptions()`） | 无实现 | `benchUiStore.ts:178` | ✅ 新实现，可用 |
| `schema:pin` | **无** → 新增（复用 `pinSchema()`） | 无实现 | `benchUiStore.ts:187` | ✅ 新实现，可用 |
| `schema:unpin` | **无** → 新增（复用 `unpinSchema()`） | 无实现 | `benchUiStore.ts:196` | ✅ 新实现，可用 |
| `schema:coverage` | **无** → 新增（复用 `buildCoverageReport()`） | 无实现 | `SettingsView.tsx:28` | ✅ 新实现，可用 |

其余 21 个通道此前已注册，本轮未改动。

---

## 2. 新增与修改的文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `src/main/handlers/index.ts` | 修改 | 追加 `registerSchemaHandlers()` / `registerCodegenHandlers()` / `registerPluginHandlers()` |
| `src/main/handlers/schemaHandlers.ts` | 新增 | 6 个 schema 通道 + 入参校验（含钉住结构校验） |
| `src/main/schema/service.ts` | 新增 | 注册表组装、事实收集、快照、覆盖度入口（不新建 Schema 体系） |
| `src/renderer/src/api.ts` | 修改 | 新增 `IpcCallError` 与 `callOrThrow()`；原 `call()` 语义保持不变 |
| `src/renderer/src/views/CodePane.tsx` | 修改 | 预览失败显示错误行与「不是没有内容」说明 |
| `src/renderer/src/views/SettingsView.tsx` | 修改 | 覆盖度 / 插件 / 脚本三块区分「加载失败」与「空数据」 |
| `src/renderer/src/views/BenchView.tsx` | 修改 | 类型列表加载失败时行内提示 |
| `src/renderer/src/views/bench/panels/WriteDialog.tsx` | 修改 | 脚本列表失败走既有错误区域（`SCRIPTS_LIST`） |
| `tests/main/ipcWiring.test.ts` | 新增 | 4 条：完整性、重复注册、未注册错误、P0 目标通道 |
| `tests/main/schemaService.test.ts` | 新增 | 6 条：列表来源/排序、get、coverage 自洽、纯内存、未知类型归类、空状态 |
| `tests/main/handlersWiring.test.ts` | 新增 | 6 条：scripts:list/rename（成功、非法名、缺失）、plugins:list、setEnabled 入参校验 |
| `tests/renderer/ipcErrorFeedback.test.ts` | 新增 | 4 条：空数据、失败抛错、旧 call 返回 null、桥缺失 |

**未改动**（冻结基线）：`commitRecipe.ts`、`backup.ts`、`scanner/zip.ts`、`scanner/iconWriter.ts`、P-OPT4 三个调用方、`styles/tokens.css`、`shared/theme.ts`、既有测试断言。

---

## 3. 每个通道的实现情况

### 3.1 Codegen / scripts（复用既有实现，仅接线）

- `codegen:preview` → `generate({workbench, preference})`，**只生成不写盘**（`writer.ts` 的 `writeGenerated` 未被调用）。
- `codegen:checkTarget` → `sanitizeScriptName` 归一化文件名 → `generate` → `checkTarget(...)`（写入前的冲突/生效链检查）。
- `codegen:write` → 校验 `typeId`、`canWrite`、通道一致性后 `writeGenerated`，保留既有 `GenerationError` 错误码（EACCES/EPERM/EEXIST…）。
- `scripts:list` → 读 `<modpack>/kubejs/server_scripts/*.js`，按字典序编号并带字节数；未导入整合包时返回 `[]`。
- `scripts:rename` → 两端都用 `sanitizeScriptName`（拒绝路径穿越/非法字符），源不存在返回 `ENOENT`，权限错误保留 `EACCES/EPERM`。

### 3.2 Plugins（复用既有实现，仅接线）

- `plugins:list` → `loadPlugins(当前整合包路径 ?? null)`，返回清单（含 `status: loaded/failed/incompatible/disabled` 与 `error`）。
- `plugins:setEnabled` → 校验 `id` 非空字符串、`on` 为布尔，再 `setEnabled()`（内存状态 + 既有持久化路径），返回最新清单。
- 未改动沙箱、清单纯净度校验与启用状态存储位置。

### 3.3 Schema（新实现，全部建立在既有模块之上）

- 组装顺序：`clearSchemas()` → 内置试点层（`shared/pilotSchemas.ts` 3 个类型，经 `pilotToSchema()` 转成注册表格式）→ `loadPinned()`（`userData/customRecipeTypes.json`）→ `applyMerge(facts)`。
- `schema:list` → `listSchemas()`，按 id 稳定排序。
- `schema:get` → 命中返回完整 `RecipeTypeSchema`，未命中返回 **null**（不是空对象，也不是错误）。
- `schema:registryOptions` → 复用 `schema/registryOptions.ts` 的 `registryOptions(registry, allSchemas())`。
- `schema:pin` / `schema:unpin` → 复用 `pinSchema()` / `unpinSchema()`，钉住写入 `customRecipeTypes.json`；入参做最小校验（id 一致、slots/outputs 为数组、layoutKind 存在）。
- 快照：以「整合包路径 + 记录数 + 类型数」为戳，只在变化时重建，避免每次调用重算。

---

## 4. Schema 覆盖度的计算定义

| 项 | 定义 |
| --- | --- |
| 数据来源 | 注册表生效类型（本轮 = 内置试点 3 个 + 钉住项）；样本数来自**内存中的配方索引** `allRecords()` 的 `type` 计数 |
| 磁盘 I/O | **无新增**：不读 jar、不重新扫描；`registryOptions` 仅沿用既有的 probe 缓存读取 |
| 分母 | `totalTypes` = 注册表当前生效类型数 |
| 分子 | `structurable` = `capability !== 'unsupported'` 且 `slots.length + outputs.length > 0` |
| 分桶 | `structurable` / `genericOnly`（可判定但无字段）/ `unsupported`（无法添加），三者之和恒等于 `totalTypes`（测试断言） |
| 通道分布 | 语法糖 / 数据包 JSON / event.custom，三者之和恒等于 `totalTypes`（测试断言） |
| 未知类型 | `capability === 'unsupported'` 的类型进入 `unsupportedTypes`，带 `reason` 与 `suggestion`（例如「未安装主模组」「无样本且未声明」） |
| 空状态 | 无任何类型时返回 `{ totalTypes: 0, structurable: 0, genericOnly: 0, unsupported: 0, addons: [], unsupportedTypes: [] }`，不伪造数据 |
| 版本号 | 取当前整合包 `mcVersion`；未导入时为 `null`（不编造） |

**必须说明的局限**：L1 推断（`schema/infer.ts`）至今没有任何调用方，插件清单里的 `recipeTypes` 也未暴露为 schema 层，因此注册表里只有 3 个试点类型。覆盖度**只覆盖这 3 个类型，不代表本包 426 个配方类型的整体覆盖率**。本轮**没有**为了让数字好看而伪造 schema 或写死模组分支。

---

## 5. 渲染端错误反馈的变化

| 页面 | 修复前 | 修复后 |
| --- | --- | --- |
| `CodePane` | 失败 → `setPreview(null)`，界面显示「工作台还没有可生成的内容」 | 失败 → 红字「代码预览加载失败：…」+「不是没有内容」说明；成功但无代码才显示原空态 |
| `SettingsView`（覆盖度） | 失败 → `coverage=null` → 显示「扫描完成后这里会显示…」 | 失败 → 「覆盖度统计加载失败：…（这不是空数据）」 |
| `SettingsView`（插件/脚本） | 失败 → 空列表，看起来像「没有插件/脚本」 | 失败 → 各自独立的错误行；只有成功且为空才显示空态 |
| `BenchView`（类型列表） | 失败 → datalist 为空 | 行内红字「配方类型列表加载失败（不是「没有类型」）」 |
| `WriteDialog`（脚本列表） | 失败 → 空列表 | 走既有错误区域，`code: SCRIPTS_LIST` |

机制：新增 `callOrThrow()`（失败抛 `IpcCallError{channel, code}` 并记 ERROR 日志），原 `call()`（失败返回 null + WARN）保留给不需要区分的地方。**失败不再被伪装成空数据。**

---

## 6. 新增测试清单（4 文件 / 20 条）

| 文件 | 条数 | 覆盖 |
| --- | --- | --- |
| `tests/main/ipcWiring.test.ts` | 4 | ①`INVOKE_CHANNELS` 全部有 handler 且无多余注册 ②重复注册抛错 ③未注册通道返回统一错误 ④P0 目标 13 个通道全部在册 |
| `tests/main/schemaService.test.ts` | 6 | ①列表来源/排序 ②get 命中与未命中 ③coverage 三个分桶自洽 ④两次调用稳定（纯内存）⑤未知类型进 `unsupportedTypes` ⑥空列表 → 全 0 空状态 |
| `tests/main/handlersWiring.test.ts` | 6 | ①scripts:list 字典序/序号/字节 ②rename 成功 ③rename 拒绝路径穿越 ④rename 源不存在 ⑤plugins:list 空数组不是错误 ⑥setEnabled 入参校验 |
| `tests/renderer/ipcErrorFeedback.test.ts` | 4 | ①空数据不抛错 ②失败抛 `IpcCallError` 且带通道 ③旧 `call` 仍返回 null（语义可区分）④桥缺失抛 BRIDGE |

> 首次全量运行时 `handlersWiring.test.ts` 有 5 条失败：根因是 fixture 里用 `rmSync` 清目录被宿主 safe-delete 守卫拦截（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），不是产品缺陷。改为「每个用例一个独立目录、不做删除」后 6/6 通过，**未削弱任何断言**。

---

## 7. 全量测试结果（本次真实执行）

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | 定向新增测试（4 文件） | 0 | 20 通过 |
| 2 | `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| 3 | `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| 4 | `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| 5 | `electron-vite build` | 0 | 主进程 / preload / renderer 均构建成功 |
| 6 | `vitest run`（全量） | 0 | **57 文件通过 / 2 跳过；580 通过 / 4 跳过**（基线 51 / 546 → +6 文件、+34 用例） |

> 全量首跑（修复测试 fixture 之前）退出码 1，仅新增测试的 5 条失败；修复后 580/580 通过。

---

## 8. P-C5 / C6 / C7 / P-OPT4 / UI 主题回归

| 项 | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| P-C5 / C6 定向 | `commitIndexCache` + `commitFailurePaths` + `commitRecipe` + `commitBridge` + `themeTokens` | 0 | **40 通过**（含 5 条主题令牌断言） |
| P-C7 真实 Electron | `.cache/e2e-pc7.mjs`（8 场景） | 0 | 22 项正向断言全真；`cancel.fileExistsAfterCancel=false`；`uiErrors: []` |
| P-OPT4 | 未改 `zip.ts` 与三个调用方；全量套件中 `zipListAndRead`(13)、`scanPipeline`(19) 通过 | 0 | 无回归 |
| UI 四主题 | `themeTokens.test.ts`（4 主题变量完整性 / 结构令牌唯一 / var 必须已定义） | 0 | 通过；未改 `tokens.css` / `theme.ts` |

---

## 9. 未完成事项及原因

1. **L1 推断未接线**：`schema/infer.ts` 仍无调用方，注册表只有 3 个试点类型。原因：把推断接进扫描会改变扫描行为与耗时，超出 P0「接线」范围，需单独评估（建议 P1 设计后再动）。
2. **插件 `recipeTypes` 未进入 schema 层**：`plugins/loader.ts` 内部消化清单里的类型声明，未对外暴露；把插件类型映射成 `RecipeTypeSchema` 需要改 loader 契约，属功能设计，不在本轮。
3. **`plugins:setEnabled` 无 UI 入口**：通道已注册且经测试，但设置页目前只展示清单与数量，没有开关控件。按「不擅自新增 UI」约束未加。
4. **`codegen:write` / `codegen:checkTarget` 未做 handler 级端到端测试**：它们依赖完整「工作台 → 生成 → 写盘」链路（含 acorn 语法检查与路径决策），现有 `tests/codegen/*`（82 条）已覆盖 `generate`/`writeGenerated`/`checkTarget` 本体；handler 层只验证了注册与脚本相关通道。属于测试层级的取舍，非缺陷。
5. 未做打包后验证（任务禁止打包）。

---

## 10. 可能引入的新风险

| # | 风险 | 说明 | 严重度 |
| --- | --- | --- | --- |
| R1 | 首次真正启用 codegen 写盘通道 | 之前 `codegen:write` 不可用，等于「写盘链路从未在真实 UI 中跑通」；现已在界面上可达。既有 `writer`/`dedupe` 测试覆盖较全，但**真实 UI 点击写入**尚未做 E2E | Medium |
| R2 | 钉住会写 `customRecipeTypes.json` | 校验只做结构最小集；若用户在界面钉住异常 schema，可能被持久化。建议后续在 P1 增加 schema 字段级校验 | Low |
| R3 | 覆盖度语义易被误解 | 只有 3 个类型参与统计，界面文案仍写「配方类型覆盖情况」 | Low（已在报告与代码注释说明） |
| R4 | `callOrThrow` 新增错误行 | 若某页面在正常路径误判失败，会出现红字（不会崩溃）；已有 4 条测试覆盖语义 | Low |
| R5 | 插件开关持久化路径沿用现状 | `setEnabled` 变更在内存 + 既有持久化，未做进程重启后的回归验证 | Low |

---

## 11. 是否建议 P0 封板

**建议封板（有条件）。**

满足的完成标准：

- 13 个目标通道全部有实现且已注册（含审计未列出的 4 个 schema 通道）；
- 渲染端不再把 IPC 失败伪装成空数据（4 个页面 + 1 个对话框）；
- schema 列表与覆盖度有可靠、可重复、无额外磁盘扫描的数据来源；
- 新增 IPC 完整性测试（可拦住同类遗漏）；
- 全量 580 通过、P-C5/C6/C7/P-OPT4/UI 主题全部无回归；
- 报告与实际代码一致。

封板条件（遗留项，不阻塞）：

- R1：补一次「真实 UI 点击生成并写入」的 E2E（建议并入 P1 或下一轮验收）；
- L1 推断 / 插件类型入注册表 / 插件开关 UI 三项独立排期。
