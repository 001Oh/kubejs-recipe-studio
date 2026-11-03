# AUDIT-FULL-01 · KubeJS Recipe Studio 全工程精确审计报告

> **审计对象**：`E:\mc kjs`（Electron 33 + React 18 + TypeScript，非 Git 仓库）
> **审计基准**：正式台账 **v9**（`docs/PROJECT-SEALING-LEDGER-REPORT.md`，90,749 B，MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`）
> **审计时间**：2026-11-01
> **审计性质**：**只读**。本轮**未修改任何**应用源码、依赖、配置、构建配置、测试代码、正式台账、历史验收报告；**未执行**构建、安装、卸载、应用启动、模组扫描、完整测试套件。
> **新增文件**：本轮仅新增 4 份独立审计文档（本文 + 证据矩阵 + 缺陷清单 + 执行日志），写入前已逐一确认目标路径无同名文件。

---

## 0. 审计方法与证据状态定义

### 0.1 本轮不采信的内容（仅作导航）

以下内容在本轮**只用于定位**，不作为任何结论的最终真值源：

- `docs/PROJECT-FINAL-CLOSEOUT-REPORT.md`（前一轮收尾报告）
- `docs/PROJECT-NEXT-SESSION-HANDOFF.md`（交接说明）
- 历史审计摘要 / `PROJECT-SEALING-COUNT-RECHECK-REPORT.md` 等的结论段落
- WorkBuddy 记忆文件（`.workbuddy/`、用户级 `MEMORY.md`）
- 此前 Agent 的对话结论
- 台账中标注的「已通过」「已关闭」状态字样

> 本轮对上述每一项均**回到原始证据**（源码、构建产物、注册表、运行日志、原始观测文件、历史报告原文）独立核对。

### 0.2 证据状态四级

| 状态 | 定义 | 本轮计数 |
| --- | --- | --- |
| **A** | **本轮独立验证**——本轮亲自读取源码/产物/日志并直接得出结论 | 见 §10.2 |
| **B** | **历史验收**——本轮核对了报告原文与其引用的原始文件存在性及关键数值，**但未重跑该测试** | 见 §10.2 |
| **C** | **部分**——只核对了一部分，或证据链存在中断 | 见 §10.2 |
| **D** | **未验证**——本轮无法核对，或历史本身缺失 | 见 §10.2 |

> **限制声明（强制）**：**B/C/D 不得写成 A**。历史验收类结论（B）的效力边界是「报告与其原始观测一致」，**不等于「本轮复现成功」**。本轮受规则 §1.4 限制（禁止构建/安装/启动/扫描/删改），绝大多数运行时结论**只能停留在 B**。

### 0.3 判定纪律（本轮自设，沿用 v8 §3.7-A A.5 的教训）

1. 引用某次实测作为某类条件的证据前，必须先确认**执行体**（EXE/进程）、**数据目录**、**产出**三要素。
2. **不得**由「某个子探针不在某环境运行」推断「整个任务不在该环境运行」。
3. **不得**用静态代码推断冒充运行时证据。
4. **不得**用「文件存在」等同「内容正确」。

---

## 1. 审计范围与基线

### 1.1 工程规模（本轮实测）

| 项 | 实测值 | 采集方式 |
| --- | --- | --- |
| `src/` TypeScript 文件 | **177** 个（`.ts` / `.tsx`） | `find src -name "*.ts" -o -name "*.tsx" \| wc -l` |
| `src/` 总行数 | **26,447** 行 | `wc -l` 汇总 |
| `tests/` 测试文件 | **64** 个 | `find tests -name "*.test.ts*"` |
| `tests/` 总行数 | **10,789** 行 | `wc -l` 汇总 |
| `it`/`test` 声明数 | **603** | 静态计数（**实际用例数更多**，见 §5.4） |
| `expect` 断言数 | **2,040** | 静态计数 |
| `docs/` 文档 | **72** 个 `.md`（本轮前） | `ls docs/*.md \| wc -l` |
| IPC 契约 channel 数 | **34** | `src/shared/ipc.ts` `INVOKE_CHANNELS` |
| 主进程已注册 channel | **34**（**全部已接线**） | 逐 channel 检索 `src/main/` |
| 主题数 | **4**（graphite / light / midnight / oled） | `src/shared/theme.ts` `THEME_IDS` |
| 版本 | 源码 **0.1.1** ｜ 安装版 **0.1.0** ｜ `dist/` **0.1.0** ｜ `dist-011/` **0.1.1** | `package.json` + `VersionInfo` |

### 1.2 模块规模（`maxdepth 1` 逐目录统计）

| 目录 | 文件 | 行数 | 目录 | 文件 | 行数 |
| --- | --- | --- | --- | --- | --- |
| `src/shared` | 18 | 3,212 | `src/main/codegen` | 12 | 2,273 |
| `src/main/recipes` | 13 | 2,224 | `src/main/schema` | 8 | 2,073 |
| `src/main/scanner` | 12 | 1,925 | `src/renderer/src/components` | 14 | 1,850 |
| `src/renderer/src/views` | 5 | 1,658 | `src/main`（根） | 14 | 1,363 |
| `src/renderer/src/store` | 5 | 1,293 | `src/main/plugins` | 6 | 1,240 |
| `src/main/modpack` | 5 | 822 | `src/main/handlers` | 10 | 491 |
| `src/renderer/src`（根） | 3 | 250 | `src/preload` | 2 | 43 |

> 剩余约 5,730 行分布在 `views/{bench,browse,sidebar}`、`hooks`、`data/recipeTypes`、`styles`（CSS）中。

### 1.3 本轮实际读取的源码（全文）

`src/main/recipes/commitRecipe.ts`(511) · `src/main/cache.ts`(183) · `src/main/envPaths.ts`(83) · `src/main/navigation.ts`(100) · `src/main/index.ts`(105) · `src/main/singleInstance.ts`(33) · `src/main/window.ts`(84) · `src/main/ipcRegistry.ts`(80) · `src/main/recipes/backup.ts`(107) · `src/main/handlers/index.ts`(26) · `src/preload/index.ts`(33) · `src/shared/draftApply.ts`(158) · `src/shared/ipc.ts`(304) · `src/main/handlers/codegenHandlers.ts`(134) · `src/main/codegen/writer.ts`(部分 120–250) · `src/main/scanner/jarPoolCore.ts`(55–190) · `src/shared/normalize.ts`(`denormalizeRecipe`/`toJsonValue`) · `tests/main/handlersWiring.test.ts`(145) · `src/renderer/src/views/bench/panels/WriteDialog.tsx`(60–99) · `package.json` · `electron-builder.yml`

### 1.4 本轮**未**读取全文的部分（须诚实标注）

| 范围 | 状态 | 说明 |
| --- | --- | --- |
| `src/main/{recipes,scanner,schema,plugins,codegen,modpack}` 其余文件 | **C** | 仅按需检索关键函数与符号，未逐行通读 |
| `src/renderer/src/**` 全部组件与视图 | **C** | 仅核查 IPC 桥接、冲突 UI 文案、uiState 读取 |
| `tests/` 64 个测试文件的断言体 | **C** | 抽查 2 个（`handlersWiring`、`writer.test.ts` 用例名），其余仅做静态统计 |
| 历史报告 72 份中的运行时证据 | **B** | 核对存在性与关键数值，未复跑 |

---

## 2. 工程总体现状

| 维度 | 现状 | 判定 |
| --- | --- | --- |
| 架构分层 | `shared`（契约/模型）→ `main`（能力）→ `preload`（窄桥）→ `renderer`（展示）。`preload` 仅暴露 `invoke`/`onEvent`/`iconUrl` 三个成员，渲染层**拿不到任何 fs** | **健康** |
| 进程隔离 | `contextIsolation: true` / `nodeIntegration: false` / `sandbox: false` | 健康（`sandbox:false` 有既有说明，见 §7.3） |
| IPC 契约 | 34 channel 全部在 `InvokeMap` 登记 + `INVOKE_CHANNELS` 常量 + 全部已注册 | **健康**（P0 缺口已真实修复） |
| 数据写入 | `recipes:commit` 有完整 TOCTOU/备份/回滚链；`codegen:write` **无等价保护** | **不一致**（见 N-01/N-02） |
| 测试体系 | 64 文件 / 2,040 断言 / 0 无条件 skip；条件 skip 6 处（需真实 MOD 包或环境变量） | 健康但**存在不可复现子集** |
| 构建发布 | NSIS 安装包可产出、图标 8/8、安装/升级/回滚均有实测 | 健康；**未签名**为分发风险 |
| 版本一致性 | **源码 0.1.1 / 安装 0.1.0 / `dist` 0.1.0 / `dist-011` 0.1.1**，台账**未记录**此分歧 | **缺陷**（见 N-03 / C8） |
| 台账自洽性 | 计数内部完全自洽（见 §9.1）；但 §3.7-A 尾段与 §10.2/§10.3 存在 **5 处陈旧表述** | **缺陷**（C1/C2/C4/C5） |

---

## 3. 源码与架构审计

### 3.1 模块表（9 列）

| 模块 | 职责 | 关键文件（本轮实读标 ★） | 规模 | 依赖方向 | 测试覆盖 | 风险点 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **shared/contract** | IPC 契约、类型、错误码 | `ipc.ts`★ `types.ts` `ipcErrors.ts` | 18 文件/3,212 行 | 被 main+renderer 依赖，自身零外部依赖 | `tests/shared`(4) + `tests/schema` 部分 | 契约与实现漂移 | **A**（34 channel 与注册逐一比对） | 通过 |
| **shared/model** | 配方规范化/反规范化、草稿应用、搜索 | `normalize.ts`★ `draftApply.ts`★ `search.ts` | 同上 | 纯函数，无 IO | `tests/schema/normalize.test.ts` 等 | 未知字段丢失 | **A**（结构性保留，见 §4.2） | 通过 |
| **main/runtime** | 启动编排、窗口、导航、路径、单实例、IPC 注册、日志 | `index.ts`★ `window.ts`★ `navigation.ts`★ `envPaths.ts`★ `singleInstance.ts`★ `ipcRegistry.ts`★ `logger.ts` | 14 文件/1,363 行 | 依赖 electron + shared | `tests/main`（12 文件） | `mkdirSync` 无 try/catch；IPC 无 sender 校验 | **A** | **有条件通过**（P2-MKDIR 已在账，sender 校验未在账 → N-04） |
| **main/recipes** | 配方读取/提交/备份/冲突 | `commitRecipe.ts`★ `backup.ts`★ `listAndRead` | 13 文件/2,224 行 | 依赖 shared + fs | `commitRecipe.test.ts`(522) `commitFailurePaths.test.ts`(415) 等 | 无（链路完整） | **A** | 通过 |
| **main/scanner** | JAR 池扫描、Worker 池、图标提取、ZIP | `jarPoolCore.ts`★ `iconWriter.ts`(部分) `zip.ts` `scanService.ts` | 12 文件/1,925 行 | 依赖 shared + yauzl + worker_threads | `tests/scanner`(8) | `new Worker` 无 try/catch | **A**（源码）+ **B**（运行时 295-jar） | 通过（附带已知风险） |
| **main/schema** | schema 解析/推断/覆盖 | `classParser.ts` 等 | 8 文件/2,073 行 | 依赖 shared | `tests/schema`(5) | 推断置信度 | **C**（未逐行读） | 未充分审计 |
| **main/plugins** | 插件清单/加载/覆盖 | `manifest.ts` `loader.ts` | 6 文件/1,240 行 | 依赖 shared | `tests/plugins`(5，含 `it.each`) | 插件覆盖类型 | **C**（未逐行读） | 未充分审计 |
| **main/codegen** | 代码生成/语法门/写盘 | `writer.ts`★(120–250) | 12 文件/2,273 行 | 依赖 shared + acorn | `tests/codegen`(8) | **`alternateDir` 无校验；覆盖写非原子** | **A** | **发现 2 项新缺陷** |
| **main/modpack** | 整合包识别/路径修正 | `detect.ts` `pathFix.ts` | 5 文件/822 行 | 依赖 fs | `tests/modpack`(2，条件 skip) | 环境依赖 | **C** | 条件跳过 |
| **preload** | 窄桥 | `index.ts`★ | 2 文件/43 行 | 依赖 electron contextBridge | 无独立测试 | 暴露面 | **A** | 通过（最小面） |
| **renderer** | 视图/状态/样式 | `appStore` `benchStore` `PilotDraftPanel.tsx`(部分) `WriteDialog.tsx`★ | 约 8,700 行 | 仅经 `window.studio` 走后端 | `tests/renderer`(10，含 `themeTokens`) | 无前端 E2E | **C** | 部分审计 |

### 3.2 十条关键数据流（本轮追踪）

| # | 数据流 | 路径 | 失败处理 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 导入整合包 | renderer → `modpack:import` → `modpack/detect` → `setCurrentModpack` | 返回 `ImportCandidates` 引导选子目录 | 完整 |
| 2 | 扫描 | `modpack:scan` → `scanService` → `jarPoolCore`（Worker）→ 聚合 → `items.json`/`recipes.json` | `scan-failed` 事件 + `failedMods` 计数 | 完整（Worker 无 try/catch 为已知风险） |
| 3 | 缓存命中 | `computeModsSignature` + `computeExtrasSignature` → `isCacheValid` | 任一不符 → 重扫并给 `reason` | 完整（见 §6.1） |
| 4 | 打开配方 | `recipes:open` → 原文读取 → `denormalizeRecipe` | `status: raw-missing / parse-failed` 显式三态 | 完整 |
| 5 | 编辑草稿 | `benchStore` 标记 dirtyFields → `applyDraftToNormalized` | 只写脏字段，保留隐藏字段 | 完整 |
| 6 | 提交配方 | `recipes:commit` → `commitRecipe` 七步链 | 21 个错误码，含回滚 | **最完整** |
| 7 | 冲突 | 基线哈希不符 → `CONFLICT` → UI 三选一（重新载入 / 保留我的修改 / 另存为副本） | 默认拒绝覆盖 | 完整（**有真实运行时证据**，见 §4.4） |
| 8 | 代码生成 | `codegen:preview` → `checkSyntax`(acorn) | `syntaxOk=false` + 行号 | 完整 |
| 9 | 代码写盘 | `codegen:write` → `writeGenerated` → `assertSyntax` → `writeOne` | EACCES/EPERM 映射为「另存到桌面」出口 | **不完整**（备份后失败无回滚 → N-02） |
| 10 | uiState | `ui:get`/`ui:patch` → `uiStateStore` → `writeFileSync` | 加载时 `clamp` + `normalizeTheme` 逐字段兜底 | 可恢复（写入非原子 → N-05） |

### 3.3 安全边界（逐项实测）

| 边界 | 实现 | 证据 | 结论 |
| --- | --- | --- | --- |
| 渲染层无 fs | `preload` 仅 `invoke`/`onEvent`/`iconUrl` | `src/preload/index.ts` 全文 | **A** 通过 |
| 路径穿越（配方） | `SAFE_RECIPE_PATH` 正则 + `inside()`（`path.relative` + 拒绝 `..`/绝对） | `commitRecipe.ts` | **A** 通过 |
| 路径穿越（脚本名） | `sanitizeScriptName` = `basename()` + 非法字符拒绝 | `writer.ts` | **A** 通过 |
| **路径穿越（导出目录）** | **无校验**：`alternateDir` 直通写盘根 | `codegenHandlers.ts:103` + `writer.ts:171/234` | **A 缺陷 N-01** |
| 导航逃逸 | `file:` 且 `url.host !== ''` 拒绝 UNC；dev 用 origin 白名单 | `navigation.ts` | **A** 通过 |
| 新窗口 | `setWindowOpenHandler` 全拒，`https` 走系统浏览器 | `window.ts` | **A** 通过 |
| IPC 发送方校验 | **无** `senderFrame`/sender 校验 | `ipcRegistry.ts` 全文 | **A 缺陷 N-04**（P3） |
| 未注册 channel | WARN + `{ok:false}`，不静默 | `ipcRegistry.ts:30-31` | **A** 通过 |
| `--user-data-dir` 绕过 dev 隔离 | 显式传入即生效，不追加 `-dev` | 台账 `P2-USERDATAARG` + `envPaths.ts` | 已在账（未解决，潜在） |

---

## 4. 配方编辑与数据完整性专项审计

### 4.1 提交链路（`commitRecipe.ts`，511 行）——本轮逐行读完

七步顺序固定，每步都有独立错误码：

1. **重读当前原文** → 失败 `READ_FAILED` / `TARGET_VANISHED`
2. **基线哈希比对**（`hashRaw`）→ 不符 `CONFLICT`（默认拒绝）
3. **schema 版本比对**（`expectedSchemaRevision`）→ 不符 `SCHEMA_CHANGED`
4. **未知结构安全检查**（`hasUnsafeUnknown`）→ 命中 `UNSAFE`
5. **脏字段白名单校验** → 越过 schema 的字段 `INVALID_FIELD`
6. **路径安全**（`recipePath` + `SAFE_RECIPE_PATH` + `inside()`）→ `UNSAFE_PATH`
7. **备份 → 守卫 → 原子写 → 回读校验 → 失败回滚**

关键实现细节（均为实测）：

- **备份在写之前**：`backupOriginalFile` 用 `fs.open(flag:'wx')` 循环取名（**永不覆盖已有备份**），内容与 `.meta.json` 均走 tmp+rename；任一步失败会删除半成品备份后抛 `BACKUP_FAILED`，**此时尚未触碰目标文件**。
- **写前守卫**：`guard()` 在 `rename` 前再读一次目标，与基线哈希不符 → `TARGET_CHANGED`。
- **原子写**：`defaultWriteAtomic` = 写 tmp → `fsync` → `rename`。
- **写后回读校验**：重新读取并用 `canonicalStringify` 比对，不符 → `failAfterVerify` → 用备份回滚；回滚再失败 → `SAVE_ROLLBACK_FAILED`（**不静默**）。
- **外部删除**：`TARGET_VANISHED`，**不复活**文件。
- **索引更新失败**：文件已落盘，返回 `indexUpdated:false` + `indexWarning`，UI 必须提示重扫（**不静默**）。

> **结论**：这是全工程保护最完整的写路径，达到「可回滚 + 可验证 + 失败可归因」。**证据状态 A。**

### 4.2 未知字段保留（结构性，而非靠测试）

`denormalizeRecipe`（`normalize.ts`）**以 `normalized.source.raw` 为基底**，只覆盖 `dirtyFields` 命中的键 → **未知字段天然保留**，不依赖白名单枚举。`toJsonValue` 的 `case 'struct'` 会把 `value.unknowns` 写回；`collectUnknownFields` 有深度与 8KB 截断限制（防止极端配方拖死 UI）。

`applyDraftToNormalized`（`draftApply.ts`）另做两件事：`preserveHiddenRefFields`（保留 `extras`/`nbt`/`refKey`/`asObject`）、`cellMatches`（内容等价则不重写网格）。

> **结论**：保留机制是**结构性**的，`hasUnsafeUnknown` 只是提交层的二次拦截。**证据状态 A。**

### 4.3 冲突处理 UI 三条路径（实测存在）

`src/renderer/src/views/bench/PilotDraftPanel.tsx`：

- 第 96 行：`<strong>原始配方已变化</strong>`（冲突提示）
- 第 105/110 行：`重新载入最新内容` / `重新载入`
- 第 115/120 行：`保留我的修改`
- 第 125/130 行：`另存为副本`
- 第 62 行：`脏字段 {dirty}`

三条路径与 P-C7 契约一致。**证据状态 A（存在性）**、**B（交互结果未本轮复跑）**。

### 4.4 冲突与写失败的**真实运行时**证据（本轮新取证）

从克隆 userData 的 `logs/studio-2026-11-01.log` 提取（只读）：

```
ERROR  IO  IPC recipes:commit 失败：原始配方已变化（基线 fcab0b7cbecbcfbaaa16b7bd5fc，当前 befa2dbd2a77d97a），默认拒绝覆盖
ERROR  IO  IPC recipes:commit 失败：原始配方已变化（基线 e6ee9ca14bda0fe6d15e，当前 7bb91a5fc5d3cccfeafea0cdc65c06ee5），默认拒绝覆盖
ERROR  IO  IPC recipes:commit 失败：原始配方已变化（基线 c3ac0db8f4bcb12a15ea8eae6，当前 fcab0b7cbecbcfbaaa16b7bd5fc），默认拒绝覆盖
ERROR  IO  IPC recipes:commit 失败：写入失败（kubejs/data/ad_astra_giselle_addon/recipes/compat/mekanism/crafting/module_acid_rain_proof_unit.json）：EPERM
ERROR  IO  IPC recipes:commit 失败：无法读取当前原始配方：源文件已失效…（raw-missing 路径）
```

**意义**：`CONFLICT`、`EPERM`、`raw-missing` 三条错误路径**均有真实运行记录**（非仅单测），且日志如实记录了基线/当前双哈希，可追溯。**证据状态 A。**

### 4.5 `codegen:write` 的完整性缺口（新发现，见 §11）

与 `recipes:commit` 相比，`codegen:write` 缺三层保护：

| 保护 | `recipes:commit` | `codegen:write` |
| --- | --- | --- |
| 写盘根校验 | `inside()` 强制在整合包内 | **无**（`alternateDir` 任意目录） |
| 写入原子性 | tmp + `fsync` + rename | `mkdir` + `writeFile`（**无 tmp、无 fsync**） |
| 备份后失败回滚 | 有（`failAfterVerify`） | **无**（原文件已被 `rename` 移走，`writeFile` 再失败则目标位置为空） |

`backupExisting` 用的是 **`rename`（移动）**，不是复制：

```ts
const target = join(dirname(file), BACKUP_DIR, `${basename(file)}.${fileStamp(Date.now())}`)
await mkdir(dirname(target), { recursive: true })
await rename(file, target)   // ← 原文件被移走
```

随后 `writeOne(path, ...)` 失败（EPERM/ENOSPC）→ 抛 `GenerationError`，**原位置无文件、不回滚**。备份仍在同目录 `.backup/` 下（日志有记录），故属**可恢复**，但整合包被留在缺文件状态，且 UI 仅提示「写入失败」，**未告知原文件已被移走**。

`tests/codegen/writer.test.ts` 的 16 个用例涵盖：自建目录、时间戳递加、未确认覆盖拒绝、确认覆盖先备份、追加模式、插不进另建、`alternateDir` 只写该目录、语法门阻止写盘、数据包模式、同名自动加序号、EACCES/EPERM 错误映射、花括号不被字符串骗、无配方块不插入、路径穿越拒绝、空文件名报错。**没有**「备份成功后写入失败」用例。

---

## 5. 测试体系审计

### 5.1 覆盖矩阵（按模块，9 列）

| 模块 | 测试文件 | 用例数（声明） | 断言密度 | 真实 IO vs mock | 关键路径覆盖 | 缺口 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `main`（运行时） | 12 | 高 | 高 | mock `electron`，真实 tmp 目录 | IPC 注册、路径、单实例、uiState | 无前端联动 | **C** | 良好 |
| `recipes`（提交） | 6 | 高 | 高 | 真实 tmp 文件 | 冲突/备份/回滚/失败码 | 并发提交 | **C** | 强 |
| `scanner` | 8 | 中高 | 中 | 真实 zip/tmp | Worker 池、图标、ZIP | 真实 295-jar 需 `RUN_REAL_PACK=1` | **C** | 良好（含条件跳过） |
| `schema` | 5 | 中 | 中 | 纯函数 | 规范化/反规范化/推断 | 极端配方 | **C** | 良好 |
| `codegen` | 8 | 16+ | 中高 | 真实 tmp | 写盘/语法门/错误映射 | **备份后失败** | **A**（用例名逐条核对） | 有缺口 → N-02 |
| `plugins` | 5 | 含 `it.each` | 中 | 真实 tmp | manifest/loader | 覆盖优先级 | **C** | 良好 |
| `renderer` | 10 | 中高 | 中 | jsdom + mock bridge | store、桥接、分页、槽位、**主题令牌** | 无 E2E | **C** | 良好 |
| `shared` | 4 | 中 | 中 | 纯函数 | 搜索、错误码 | — | **C** | 良好 |
| `modpack` | 2 | 少 | 低 | 条件 `existsSync` | 检测/路径修正 | **依赖本机路径** | **C** | 不可复现 |
| `algorithms` | 4 | 中 | 中 | 纯函数 | 排序/索引算法 | — | **C** | 良好 |

### 5.2 测试质量检查

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 无条件 `.skip` / `.only` | **0** | 全量检索 `tests/` |
| 条件跳过 | **6 处** | `describe.skipIf`：`RUN_REAL_PACK=1`（`scanner/realPack`、`recipes/realPack`）；`existsSync` 本机路径（`modpack/detect`、`modpack/pathFix`）；`generate === null`（`codegen/preview`） |
| 弱断言（`toBeDefined`/`toBeTruthy`） | **29 处 / 2,040 断言 = 1.4%** | 分布 8 个文件各 1 处，其余为其他模式 |
| 阈值放宽 | **未见** | `vitest.config.ts` 的 `fileParallelism:false` 有明确理由（性能断言对 CPU 争用敏感：串行最差 3.5–3.9 ms vs 并行 19–43 ms），**不是**放宽阈值 |
| 过期测试 | **未见** | 抽查的 `handlersWiring.test.ts` 与当前 `registerHandlers()` 一致 |
| 假阳性风险 | 低 | 抽查用例均断言具体值（如 `toEqual(['a_one.js','b_two.js'])`、`rejects.toThrow()`、`res.error).toContain('不存在')`） |

### 5.3 `handlersWiring.test.ts` 的被测价值（本轮通读）

该文件针对 P0 的「未接线」缺口，用 **真实临时目录**（不 mock 业务实现）覆盖 6 个用例：

- `scripts:list` 字典序 + 顺序号 + 字节数
- `scripts:rename` 成功后列表体现新名，且原文件 `stat` 抛错
- `scripts:rename` 拒绝 `../escape.js`（路径穿越）
- `scripts:rename` 目标不存在 → 错误含「不存在」
- `plugins:list` 空数组而非错误
- `plugins:setEnabled` 拒绝 `id='  '` 与 `on='yes'`

**结论**：P0 的「IPC 未接线」修复有**真实 handler 级测试**，不是只改注册表。**证据状态 A。**

### 5.4 「603」与「621」的口径差异

- 静态声明数 **603**（`it(`/`test(` 文本）。
- 历史记录的实际通过数 **621**（含 `it.each` 展开）。
- `tests/plugins/loader.test.ts:290` 使用 `it.each` → **静态计数必然小于实际用例数**。

> **结论**：`621` 与 `603` **不矛盾**，是不同口径。但**本轮未运行测试套件**（规则禁止），故 `621` 只能是 **B**（历史），**不能**写成 A。

---

## 6. 性能与缓存审计

### 6.1 缓存失效判据（`src/main/cache.ts` 全文实读）

`isCacheValid` 依次比对：

1. `meta.schemaVersion !== CACHE_SCHEMA_VERSION(2)` → 失效
2. `(meta.parserVersion ?? 0) !== PARSER_VERSION(1)` → 失效
3. `meta.mcVersion/kubejsVersion` 变化 → 失效
4. `sameSignature(meta.signature, signature)`——`mtimeMs` + `jarCount` + `totalBytes` → 失效
5. **仅当 `requiredPhases` 含 `recipes`** 才比 `extras`（`kubejs/server_scripts` + `kubejs/data` + `config/openloader/data` + `datapacks` 的 count/bytes/mtime 聚合）
6. `phases` 全部完成 **且** 对应缓存文件存在 → 否则失效
7. **`appVersion` 不参与比对**（`CacheMeta.appVersion` 字段存在但未被 `isCacheValid` 使用）

**推论（静态，不得当运行时证据）**：0.1.0 建好的缓存在 0.1.1 下**按代码逻辑应当命中**。这与 `PACK-18` 观察到「升级前后 `items.json`/`recipes.json`/`meta.json` SHA 未变」**相容**，但 `cacheHit` 的**运行时值本轮与上一轮均未测量**，**必须保持「未测量」**，不得由上述推论改写为 `true`。

### 6.2 其它性能相关实现

| 项 | 实现 | 评价 |
| --- | --- | --- |
| 图标写入 | `iconWriter` 有队列 + `concurrency` + **`flag:'wx'`（永不覆盖已存在图标）** | 良好（幂等 + 有界并发） |
| 缓存写 | `writeJson` = tmp（带 pid + 随机尾）+ rename | 良好；**无 fsync**（P3） |
| mods 签名 | `readdir` + 逐 jar `statSync`（295 次同步 stat） | 可接受；已由 P-OPT 系列优化过卡顿点 |
| ZIP 读取 | `listAndRead`（P-OPT4）单次打开多读 | 已验收（B） |
| 扫描并发 | `jarPoolCore` Worker 池 + `workerAvailable` 分支 | 见 §6.3 |

### 6.3 Worker 分支的两个已知风险（源码实读）

```ts
if (!opts.workerAvailable) return runInline(...)
return runWorkers(...)
```

- `new Worker(...)` **无 try/catch** → 创建失败会 reject，`scanItems` 抛错 → 发 `scan-failed`。**后果是整次扫描失败，不会静默降级**——这一点实际上是「安全失败」，但**没有回退到 inline 的兜底**。
- `finish()` 固定 resolve `{ usedWorkers: true }`，而 `usedWorkers` **无外部观测出口**（IPC/日志/`CacheMeta`/`items.json` 均无）→ 台账 §3.7 D-1 采用「三段实测链推导」判定，**不是字面取值**，该推导方式已在台账中如实声明。

---

## 7. UI / IPC / 插件 / 用户体验审计

### 7.1 IPC 契约完整性（本轮逐 channel 核对）

- `InvokeMap` 登记 **34** 个 channel，`INVOKE_CHANNELS` 常量 **34** 项，`satisfies readonly InvokeName[]` 保证编译期一致。
- 主进程 `registerHandler('<name>'` 检索：**34 个 channel 各命中 1 次，无遗漏、无重复**。
- `handlers/index.ts` 集中调用 9 个 `registerXxxHandlers()`，含注释「P0：此前遗漏的三组（codegen / plugins / schema）」。
- **当前构建运行日志中已无** `通道尚未接线` WARN：`studio-2026-11-01.log` 检索 **0 命中**；仅在 2026-10-31 的历史日志中有 `codegen:preview` 的 WARN（P0 修复前）。

> **结论**：`UI-U1`（IPC 未接线）的「已解决」有**双重证据**（源码全接线 + 当前运行日志无 WARN）。**证据状态 A。**

### 7.2 UI 错误反馈

`tests/renderer/ipcErrorFeedback.test.ts` 存在；`WriteDialog` 在失败时 `setError({message, code})` + `pushLog('ERROR','IO',...)`，不吞错。

### 7.3 窗口与渲染进程配置

`contextIsolation:true` / `nodeIntegration:false` / **`sandbox:false`**。

> `sandbox:false` 意味着渲染进程与 Node 同进程沙箱关闭，但 `nodeIntegration:false` + `contextIsolation:true` + preload 仅暴露 3 个成员，实际暴露面仍很小。台账未见对此的登记；**本轮判定 P3 观察项**（不构成新缺陷，但建议后续在安全章节显式记录理由）。

### 7.4 主题与样式约束

`THEME_IDS = ['graphite','light','midnight','oled']`，`DEFAULT_THEME='graphite'`，旧值 `dark` 映射到 `graphite`。`tests/renderer/themeTokens.test.ts` 存在 → 令牌约束有自动化守卫。

> **方法论价值**：正因为默认是 `graphite`/`320`，`PACK-17` 写入 `light`/`380` 才是**可区分**的非默认值——这是 `uiState` 验证能成立的前提。**本轮确认 `DEFAULT_UI_STATE` 与台账声明一致。证据状态 A。**

### 7.5 插件

`plugins:list` / `plugins:setEnabled` 有 handler 级真实测试（§5.3）。`plugins/loader.ts:297` 在 schema 注册表未接线时降级为 `debug` 日志并改用 `getPluginSchemaOverrides()`。**C（未逐行读 loader）。**

### 7.6 未审计的 UI 项（诚实标注）

空状态、加载态、键盘可达性、无障碍（ARIA）、大列表虚拟化行为、CodePane 折叠/主题联动、BenchView 拖拽边界——**本轮未审计（D）**，列入 §12 未完成范围。

---

## 8. 构建、安装、升级与发布审计

### 8.1 构建配置（`electron-builder.yml` 全文实读）

| 项 | 值 | 影响 |
| --- | --- | --- |
| `appId` | `com.kubejs.recipestudio` | 决定 NSIS 卸载 GUID（`UUID.v5(appId, NS)`）→ **改它会变成另一个应用** |
| `productName` | `KubeJS Recipe Studio` | **`app.getName()` 的来源** → 同时决定 `userData` 路径。`package.json` 中**没有** `productName`，故 `app.getName()` 取 `productName || name` |
| `directories.output` | `dist` | 0.1.1 构建用 `--config.directories.output=dist-011` 覆盖，**已验证不触碰 `dist/`** |
| `files` | `out/**` + `package.json` + 4 个 node_modules 白名单（acorn/yauzl/fd-slicer/pend） | 依赖裁剪准确 |
| `asar` | `true` | — |
| `win.icon` | `build/icon.ico` | 8/8 尺寸命中（PACK-03） |
| `nsis` | `oneClick:false` / `perMachine:false` / `allowToChangeInstallationDirectory:true` / `createDesktopShortcut:true` / `shortcutName: KubeJS Recipe Studio` | 非一键、按用户安装、可改目录 |
| 签名 | **未配置** | 分发风险（SmartScreen 未知发布者），**非 REL-PKG 硬性条款** |

> **关键结构事实（本轮复算）**：`guid = UUID.v5(appInfo.id, ELECTRON_BUILDER_NS_UUID)`（`NsisTarget.js:147`），只依赖 `appId`。因此**默认配置下无法隔离安装**——注册表卸载项与两个快捷方式必然被覆盖。这也是为什么「真实跨版本升级」与「不动正式安装」在结构上互斥，最终由负责人裁决选择前者（`PACK-14`/`PACK-15`）。

### 8.2 产物核对（本轮实测，非引用）

| 产物 | 实测 |
| --- | --- |
| `dist/` | `KubeJS Recipe Studio Setup 0.1.0.exe` + `.blockmap` + `builder-debug.yml` + `win-unpacked/` |
| `dist-011/` | `KubeJS Recipe Studio Setup 0.1.1.exe` + `.blockmap` + `builder-debug.yml` + `win-unpacked/` |
| 安装版 EXE | `FileVersion=0.1.0` / `ProductVersion=0.1.0.0` / `ProductName=KubeJS Recipe Studio` |
| `dist/win-unpacked` EXE | `FileVersion=0.1.0` / `ProductVersion=0.1.0.0` |
| `dist-011/win-unpacked` EXE | `FileVersion=0.1.1` / `ProductVersion=0.1.1.0` |
| 源码 `package.json.version` | **0.1.1** |

### 8.3 安装/升级/回滚链路（历史证据 B，本轮核对原始观测）

| 环节 | 报告 | 关键数值 | 本轮核对 |
| --- | --- | --- | --- |
| 打包 | `PACK-03` / `PACK-16` | 退出码 0；0.1.0 包 82,360,469 B；0.1.1 包 82,360,472 B；图标 8/8 | 产物**实际存在**，版本信息一致 |
| 安装 | `PACK-04` B1 | 退出码 0 / 4.6 s / 74 文件 | **B** |
| 启动 | `PACK-04` B2 / `PACK-11` / `PACK-18` / E1 | DOM 三导航项、0 异常、`appVersion` 正确 | **B**（E1 日志本轮实读，见 §8.4） |
| 核心扫描 | `PACK-07`(D-2 **失败**) / `PACK-09`(D-2 **通过**) | pc5：43,474/38,760/32,890/426/5,334 | **B**，**引用精度问题见 C6** |
| 跨版本升级 | `PACK-17`/`PACK-18` | 0.1.0→0.1.1，仅 `/S`，5.3 s，`uiState.json` SHA 未变 | **B** |
| 回滚 | `PACK-19` | 0.1.1→0.1.0，5.0 s，**74 文件 SHA 逐行一致** | **B** |
| 回滚后启动 | E1 | 4 个 IPC 通道 ok、3 导航项、0 异常、截图 56,565 B | **A**（`.cache/pack-15/e1-launch.log` 本轮实读） |

### 8.4 E1 日志本轮实读（A 级证据）

```
[2] IPC 通道连通性  ui:get/modpack:current/recipes:stats/app:runtime 全部 ok = true
[3] ui:get  {"theme":"light","sidebarWidth":380,...,"benchV2":["minecraft:crafting_shapeless"],"x":270,"y":85,"width":1440,"height":900}
[4] 界面  {"title":"KubeJS Recipe Studio","readyState":"complete","tabs":3,"tabTexts":["配方浏览","工作台","设置与诊断"],"toasts":0,"hasBridge":true,"bridgeKeys":"invoke,onEvent,iconUrl","bodyText":"...v0.1.0..."}
[5] 控制台/异常事件: 0
[6] 截图 .cache\pack-15\e1-010-window.png (56565 B)
[7] 优雅关闭 已发送 Browser.close
结论: E1 通过
```

> 该日志是**原始观测文件**，本轮直接读取，故 E1 结论为 **A**。其局限：本轮**未重跑**，是「读取历史观测」而非「本轮复现」。

### 8.5 发布就绪判定

| 项 | 状态 |
| --- | --- |
| 安装包可产出 | 是 |
| 安装/启动/升级/回滚/卸载有实测 | 是（B） |
| 图标完整 | 是（8/8） |
| 签名 | **无** → 分发风险（非硬性阻塞） |
| 版本一致性 | **不一致**（源码 0.1.1 / 安装 0.1.0）→ 下次构建前须处理（N-03） |
| `dist/` 残留风险 | `dist/` 仍是 0.1.0；若直接 `npm run dist:win` 会**覆盖 `dist/win-unpacked`** 并**遗留 `Setup 0.1.0.exe`** 与新包并存 → 发布前须清理或改用 `dist-011` 流程 |

---

## 9. 正式台账与历史文档一致性审计

### 9.1 计数复算（本轮独立重算，**通过**）

台账声明：**40 / 5 / 2 / 1 / 32**。

本轮按 §4 矩阵逐条枚举：

- **已解决 5**：`C7-F5`、`UI-U1`、`P1-DEVPROD`、`P1-C4`、`REL-PKG` → **5 ✓**
- **部分 2**：`C7-F3`、`P1-GUARD` → **2 ✓**
- **待验证 1**：`P2-DUALFORM` → **1 ✓**
- **未解决 32**：C7 `F1/F2/F4/F6/F7`(5) + OPT4 `R2/R3/R4/R6/R7/R8`(6) + UI `U2/U3/U4/U5`(4) + P0(7) + P1 `FD`(1) + P2(9) = **32 ✓**

**两条校验式同时成立**：

- `5 + 2 + 1 + 32 = 40` ✓
- `C7 7 + OPT4 6 + UI 5 + P0 7 + P1 4 + P2 10 + REL-PKG 1 = 40` ✓

**分模块交叉校验**：

| 模块 | 台账条件数 | 本轮枚举 | 一致 |
| --- | --- | --- | --- |
| P-C7 | 7 | F1–F7 | ✓ |
| P-OPT4 | 6（+1 非条件 `OPT4-C1`） | R2/R3/R4/R6/R7/R8（R1→F2、R5→F3 已归并） | ✓ |
| UI-REDESIGN-1 | 5 | U1–U5（U6→REL-PKG） | ✓ |
| P0 | 7 | 含 v3 新增 `P0-R5` | ✓ |
| P1 | 4 | DEVPROD/GUARD/C4/FD | ✓ |
| P2 | 10 | 含 v3 新增 `USERDATAARG`/`POSIXPATH` | ✓ |
| REL-PKG | 1 | 4 源合并 + C3 新增 | ✓ |

> **结论**：**台账计数内部完全自洽，本轮未发现计数矛盾。** 这是本轮对台账的**正面结论**。

### 9.2 C1–C8 专项核查（本轮独立读原文，**非复述前一轮报告**）

#### C1 — §3.7-A A.5 尾段的现在时表述

**V9 原文**（§3.7-A A.5 末尾引用块）：

> **本次更正不改变任何正式条件的状态**：B3 与「核心扫描」都是 `REL-PKG` 的**子项**，子项通过**不改变条件计数**；`REL-PKG` 仍因「`uiState` 保留」未验证而维持「未验证」+「硬性发布阻塞」。

**冲突对象**：同文件 §3.7 第 305 行 `REL-PKG | … | **已关闭（2026-11-01 v9）** | —（原「硬性发布阻塞」，已解除）`，以及 §3.7-B B.3、§7.1、§4。

**判定**：**真实矛盾（时效性）**。该段绑定于「本次更正」（v8 语境），作为 v8 历史记录保留是**正确的**；但在 v9 中**缺少 v9 交叉引用**，读者读 §3.7-A 会得到与 §3.7 相反的结论，且二者在**同一节内前后相邻**（§3.7 在前、§3.7-A 在后），冲突比跨节更刺眼。

**影响**：不改变计数（40/5/2/1/32），不影响 v9 的关闭判定（§3.7-B 有逐条证据），但**损害读者信任**。
**建议改法**（不改原文，只加注）：在 A.5 引用块末尾追加一行 ——「> **v9 说明**：本条为 v8 时点结论；`REL-PKG` 已于 v9 关闭，见 §3.7-B。」
**严重度**：**P2**。

#### C2 — §3.7「B3 验收标准调整记录」末行

**V9 原文**：

> | **调整未覆盖的范围（不得据此宣称已通过）** | **跨版本升级、配置迁移、数据格式迁移、版本兼容性**——四项**均未验证**，详见 **§10** |

**事实**：`PACK-18` 已真实执行 **0.1.0 → 0.1.1 跨版本升级**。

**判定**：**真实陈旧表述**。四项中**第 1 项已失效**，其余 3 项（配置迁移、数据格式迁移、版本兼容性）仍成立。
**影响**：与 §3.7 B 行「**v9 补强**：原条款『跨版本升级』已于 `PACK-18` 真实执行」**在同一节内直接冲突**。
**建议改法**：改为「跨版本升级已于 v9 由 `PACK-18` 执行，见 §3.7-B；配置迁移、数据格式迁移、版本兼容性三项仍未验证」。
**严重度**：**P2**。

#### C3 — 同一表标题「须与结论连体引用」

**V9 原文**：`**B3 验收标准调整记录（v7 新增，须与结论连体引用）**`

**判定**：**表述遗留，非事实矛盾**。该约束在 v7 有效（替代标准即判据），v9 起替代标准已「不再作为判据依据」（§3.7 B 行原文），「连体引用」的要求随之失去对象。
**影响**：可能诱导读者把已降级为「历史记录」的表当作现行判据。
**建议改法**：改为「（v7 新增，v9 起仅作历史记录，**不再作为判据依据**）」。
**严重度**：**P3**。

#### C4 — §10.2 未验证范围 3 行

**V9 原文**：

> | 1 | **跨版本升级** | 原 B3 验收内容。`PACK-10` 确认**无上一版本安装包**，**从未执行**。B3 的通过基于**同版本覆盖安装**，**不是**跨版本升级 |
> | 4 | **版本兼容性** | 未验证——0.1.0 与任何旧版本/未来版本的共存、**降级、回滚**均未测 |
> | 7 | **`uiState` 内容保留** | 未验证——**单独登记于 §11** |

**冲突对象**：§10.1 第 4 行「**跨版本升级 + `uiState` 保留**（v9 新增）| ✅ **已验证**」；§11 标题「已关闭项归档（v7 登记未验证 → **v9 关闭**）」；§3.7-B B.4 回滚行「『高版本回滚未实测』风险由『未实测』转为『实测通过』」。

**判定**：**真实矛盾，且是本轮最严重的文档缺陷**。第 1 行（从未执行）与第 4 行（回滚均未测）与第 7 行（uiState 未验证）**三项全部已被 v9 证据推翻**，而它们与同节 §10.1 的「已验证」正面冲突。

**为何比其他几项更严重**：§10 的引言明确写「任何对外表述引用 B3 / `REL-PKG` 结论时，**必须连同本节一起引用**」。**照此执行会产生与事实相反的对外表述**（「跨版本升级从未执行、回滚未测、uiState 未验证」）。
**影响**：不改变计数；**改变对外表述的正确性**。
**建议改法**：保留原行作为 v7/v8 历史，另加一列「v9 现状」或在行首标注 `~~删除线~~` + `（v9 已失效）`。
**严重度**：**P1**（文档类最高）。

#### C5 — §10.3 表述纪律第 1 条

**V9 原文**：

> - **不得**将本次验收描述为「跨版本升级测试」「配置迁移验证」或「数据格式迁移验证」。

**判定**：**真实矛盾，且逻辑上自我否定**。v9 的「本次验收」**核心内容就是**跨版本升级测试（`PACK-18`）。照此条执行，台账必须否认自己的核心证据。

该条在 v7 语境（B3 = 同版本覆盖安装）**完全正确**；v9 未更新即成为反向约束。
**影响**：同上，直接危及对外表述正确性。
**建议改法**：改为「**v7 语境**：不得将『同版本覆盖安装』描述为跨版本升级测试；**v9 起**：`PACK-18` 的 0.1.0→0.1.1 **是**真实跨版本升级，可以如此表述，但仍**不得**表述为『配置迁移验证』或『数据格式迁移验证』（二者仍未验证）。」
**严重度**：**P1**。

#### C6 — PACK-07 / PACK-09 引用精度

**核查结果**：

- `PACK-07-REL-PKG-D-REPORT.md` 第 16 行：`**D-2 五项计数** | ❌ **不通过**：4 项一致，**recipes = 32,891 ≠ 32,890（差 1）**`；第 18 行 `**D 类整体** | **不通过**`；第 153 行 `判定：D-2 不通过`。
- `PACK-09-D2-RERUN-REPORT.md` 第 7 行：`结论：**D-2 通过——五项计数逐项与基准完全一致，含 recipes = 32,890。**`
- **V9 §3.7 D 类表**：`**D-2 ✅**——依据 `PACK-09`（选包依据 `PACK-08`）` → **引用正确**。
- **V9 §3.7-B「B·核心扫描」行**：`PACK-07`/`PACK-09`：…五项计数 **43,474 / 38,760 / 32,890 / 426 / 5,334** 一致 → **引用不当**：把 `PACK-07` 与 `PACK-09` 并列作为「一致」的证据，而 `PACK-07` 的 D-2 **明确不通过**。
- **V9 §10.1 第 3 行**：证据列 `PACK-07` §2/§3、`PACK-09` §2/§3 → **同样并列**。

**判定**：**真实引用精度缺陷**。结论正确（32,890 由 `PACK-09` 支撑），但**并列引用了一份其 D-2 判定为失败的报报告**。
**影响**：不影响结论；**严重影响可核查性**——核查者打开 `PACK-07` 会看到「D 类整体 不通过」，进而怀疑整个 B·核心扫描判定。
**建议改法**：改为「`PACK-09`（D-2 通过，pc5 基准，32,890）；`PACK-07` 提供 D-1 的 asar worker 探针证据（其 D-2 因选错基准包 pc7 得 32,891 判为不通过，差异 1 由 P-C7 遗留副本解释）」。
**严重度**：**P2**。

#### C7 — `cacheHit=false` 出现两处

**核查结果**：

- V9 §3.7 D 类 D-2 描述中：`基准包 `pc5-pack-1112`、`cacheHit=false`` — 这是 **PACK-09 那次 295-jar 扫描**的属性（该次为完整重建，未命中缓存）。
- V9 §3.7-B「非阻塞观察项」：`cacheHit` 运行时值**未测量** — 这是 **PACK-18 升级场景**的属性。

**判定**：**真实歧义风险，非矛盾**。两个 `cacheHit` 分属**不同场景**，各自都正确。
**影响**：读者易把「某次扫描 `cacheHit=false`」误读为「升级后缓存未命中」，从而推翻「缓存仍在」的结论。
**建议改法**：D-2 处改为「该次重建扫描的 `cacheHit=false`（与升级场景无关）」；观察项处明确「升级场景的 `cacheHit` 未测量」。
**严重度**：**P2**。

#### C8 — 三方版本分歧未记录

**核查结果（本轮硬数据）**：

| 位置 | 版本 |
| --- | --- |
| `package.json.version` | **0.1.1** |
| 正式安装版 EXE | **0.1.0**（`FileVersion=0.1.0`，`ProductVersion=0.1.0.0`） |
| `dist/win-unpacked` | **0.1.0** |
| `dist-011/win-unpacked` | **0.1.1** |

**V9 检索**：`grep -n "源码\|工作树\|版本不一致"` → **无任何记录**。台账 `PACK-19`/§12.1 均未声明「源码保留 0.1.1、安装版为 0.1.0」。

**判定**：**真实记录缺失**。这是负责人 D3 裁决（「源码树保留 0.1.1，不回退」）的**直接后果**，但台账未登记。
**影响**：
1. 读者无法从台账判断「当前装的是哪个版本」；
2. 若直接 `npm run dist:win`，会写入 `dist/` → **覆盖 `dist/win-unpacked`（0.1.0 → 0.1.1）**，且 **`KubeJS Recipe Studio Setup 0.1.0.exe` 会残留**与新包并存，形成发布歧义。
**建议改法**：在 §8 或 §10.1 增设「当前版本分布」小表，并注明「下次构建/发布前须先处理版本与 `dist/` 残留」。
**严重度**：**P1**（发布卫生，非验收判定）。

### 9.3 C1–C8 汇总

| 编号 | 性质 | 影响计数？ | 影响验收结论？ | 严重度 |
| --- | --- | --- | --- | --- |
| C1 | 真实矛盾（时效性） | 否 | 否 | P2 |
| C2 | 真实陈旧表述 | 否 | 否 | P2 |
| C3 | 表述遗留（非矛盾） | 否 | 否 | P3 |
| C4 | **真实矛盾（3 行全部失效）** | 否 | **是（对外表述）** | **P1** |
| C5 | **真实矛盾（自我否定）** | 否 | **是（对外表述）** | **P1** |
| C6 | 引用精度缺陷 | 否 | 否 | P2 |
| C7 | 歧义风险（非矛盾） | 否 | 否 | P2 |
| C8 | **记录缺失** | 否 | 否 | **P1** |

> **关系说明（沿用台账 §3.7-B B.4 的纪律）**：**C4/C5 的严重性来自「台账自己要求把 §10 连体引用」，而不是来自验收判定错误。** 验收判定（§3.7-B）本身有逐条证据支撑，本轮**未发现**其判定被推翻。

### 9.4 与「已关闭」相关的一致性抽查

| 检查点 | 结果 |
| --- | --- |
| §1 统计「已解决 5」与 §4 明细是否一致 | **一致** |
| §7.1 门禁「REL-PKG 已关闭」与 §3.7 正文 | **一致** |
| §3.7-B B.3 关闭结论与 §10.1 第 4 行「已验证」 | **一致** |
| §3.7-B B.3 与 §10.2 第 1/4/7 行、§10.3 第 1 条 | **矛盾（C4/C5）** |
| §3.7-B 与 §3.7-A A.5 尾段 | **矛盾（C1）** |
| §3.7-B 与 §3.7 调整表末行 | **矛盾（C2）** |
| 已关闭条件是否仍被列为未解决 | **无**（§4 未解决 32 项不含 REL-PKG/REL-ICON） |
| 未测量事项是否被写成已验证 | **无**（`cacheHit` 两处均标注未测量/或明示为另一次扫描） |
| 同一风险是否重复建项 | **无**（`P2-USERDATAARG` 与 `P2-DUALFORM` 有明确区分说明；`P2-POSIXPATH` 未并入 `C7-F2`，且有说明） |

---

## 10. 证据链与可复现性审计

### 10.1 关键证据可追溯性

| 结论 | 证据文件 | 存在性 | 可复现性 |
| --- | --- | --- | --- |
| 打包成功 | `PACK-03`/`PACK-16` | ✅ | 可（需 `npm run build` + electron-builder） |
| 安装成功 | `PACK-04` | ✅ | 可（需安装包 + 干净环境） |
| 295-jar 扫描五项计数 | `PACK-09` + `.cache/pack-06/d2-pc5/result.json` | ✅ | **需 295-jar 包**（`.cache/pc5-pack-1112`），不可在任意环境复现 |
| asar worker 可运行 | `PACK-07` §4.2 独立探针 | ✅ | 可（需打包产物） |
| 升级 + uiState 保留 | `PACK-17`/`PACK-18` | ✅ | 可（需两份安装包 + 克隆 userData） |
| 回滚 | `PACK-19` + 74 文件清单 | ✅ | 可 |
| 回滚后启动 | `.cache/pack-15/e1-launch.log` + 截图 | ✅ | 可 |
| IPC 全接线 | 源码 + `studio-2026-11-01.log`（0 命中 WARN） | ✅ | 可 |

### 10.2 本轮证据状态统计

| 状态 | 条目数 | 主要条目 |
| --- | --- | --- |
| **A** | **14** | 34 channel 全接线；无「未接线」WARN；`commitRecipe` 七步链；未知字段结构性保留；`backup` 永不覆盖；`SAFE_RECIPE_PATH`/`inside()`；`sanitizeScriptName`；`alternateDir` 无校验（缺陷）；`codegen` 覆盖写非回滚（缺陷）；IPC 无 sender 校验（缺陷）；`cache.ts` 不比对 `appVersion`；4 主题 + 默认 graphite/320；三方版本实测；E1 日志原文；台账计数 40/5/2/1/32 复算 |
| **B** | **9** | 打包、安装、卸载、核心扫描五项计数、asar worker、跨版本升级、uiState 保留、回滚 74 文件、621 测试通过 |
| **C** | **6** | `schema` 模块、`plugins/loader`、`renderer` 组件、`modpack` 条件跳过测试、测试断言体抽查、`jarPoolCore` 运行时行为 |
| **D** | **7** | UI 空状态/加载态/无障碍、虚拟化行为、正常 GPU 路径、双击启动、`P2-POSIXPATH`、`P2-DUALFORM`、`REL-VERIFY-4K` |

### 10.3 证据链中断点（3 处）

1. **`usedWorkers` 无外部出口** —— D-1 的「worker 分支真实运行」靠三段实测链**推导**，非字面取值。台账已如实声明，**本轮认可该声明**，但指出这是**证据链的固有弱点**。
2. **`cacheHit` 全链路未测量** —— 台账诚实标注「未测量」。本轮**确认不得**由 `cache.ts` 静态逻辑推断为 `true`。
3. **`PACK-07` D-2 实际失败** —— 台账在 §3.7-B/§10.1 并列引用 `PACK-07`/`PACK-09`，形成**引用层的中断**（结论对、引用错）→ C6。

---

## 11. 风险与缺陷分级

### 11.1 本轮新发现的缺陷（台账未登记）

| ID | 缺陷 | 位置 | 严重度 | 是否阻塞验收 | 影响用户数据 | 建议动作 |
| --- | --- | --- | --- | --- | --- | --- |
| **N-01** | `codegen:write` 的 `alternateDir` **无任何路径校验**，渲染层可指定任意目录为写盘根 | `codegenHandlers.ts:103` → `writer.ts:171/234` | **P2** | 否 | **是（可写到任意可写目录）** | 在主进程校验：必须来自 `app:pickDirectory` 的选择结果（或用一次性令牌），并限制不得是系统目录 |
| **N-02** | `codegen` 覆盖写**非原子且无回滚**：`backupExisting` 用 `rename` **移走**原文件，随后 `writeOne` 失败则原位置为空 | `writer.ts:149-159` / `167-188` | **P2** | 否 | **是（整合包缺文件，可从 `.backup/` 手工恢复）** | 改为 tmp+rename 原子写；或失败时把备份 `rename` 回原位 |
| **N-03** | **三方版本分歧未记录**（源码 0.1.1 / 安装 0.1.0 / `dist` 0.1.0 / `dist-011` 0.1.1） | 台账 §8/§10.1 缺失 | **P1** | 否 | 否 | 台账补「当前版本分布」表；并在下次构建前明确 `dist/` 清理/改用 `dist-011` 的策略 |
| **N-04** | `ipcRegistry` **无 `senderFrame`/sender 校验**（Electron 安全基线建议校验） | `ipcRegistry.ts` 全文 | **P3** | 否 | 否 | 单窗口 + `contextIsolation` 下风险低；建议后续显式校验 `event.senderFrame.url` |
| **N-05** | `uiState` 写入用 `writeFileSync`，**非原子**（崩溃可能留半截 JSON） | `uiStateStore.ts:3` | **P3** | 否 | 否（加载时 `clamp`+`normalizeTheme` 逐字段兜底，可恢复默认） | 可改 tmp+rename；优先级低 |
| **N-06** | `cache.writeJson` **无 `fsync`** | `cache.ts:130-136` | **P3** | 否 | 否（缓存可重建） | 可选 |
| **N-07** | `computeModsSignature` 逐 jar `statSync`（295 次同步 IO） | `cache.ts:47-61` | **P3** | 否 | 否 | 已有 P-OPT 优化，非新问题，仅记录 |

> **N-01/N-02 是本轮最有价值的发现**：它们说明工程内部**存在两套写盘标准**——`recipes:commit` 达到「可回滚 + 可验证」，而 `codegen:write` 只做到「写前备份 + 语法门」。台账把 `codegen` 的处理记为「§9-4 已由 `P0-R1` 覆盖」，但 `P0-R1` 覆盖的是 **handler 级 E2E**，**不含**原子性与根目录校验。

### 11.2 台账已登记、本轮确认仍存在的问题（不重复建项）

| ID | 内容 | 本轮核实 |
| --- | --- | --- |
| `P2-MKDIR` | `envPaths.applyUserDataDir` 的 `mkdirSync` 无 try/catch | **A**（源码实读确认） |
| `P2-USERDATAARG` | `--user-data-dir` 显式传入绕过 `-dev` | **A**（`envPaths` 优先级逻辑） |
| `P2-SYMLINK` | 词法判定不覆盖软链 | **C**（未构造软链实测） |
| `P2-RELPATH` | 相对路径 env 以 cwd 为基准 | **C** |
| `P2-CLOSEGUARD` | `'close'` 被 preventDefault 时守卫丢失 | **A**（`window.ts` 在 `'close'` 释放守卫） |
| `P2-CLOSEE2E` | 真实窗口关闭无自动化回归 | **C** |
| `P2-DOC4041` | 「40 通过」vs 静态 41 | **C** |
| `P2-AST` | 静态检查未升级 AST | **C** |
| `P2-DUALFORM` | 双形态未验证 | **D** |
| `P2-POSIXPATH` | POSIX 路径行为未实测 | **D** |
| `REL-VERIFY-DUAL` | 双击启动未验证 | **D** |
| `REL-VERIFY-4K` | 4K 显示未验证 | **D** |

---

## 12. 结论

### 12.1 工程健康度总评

| 维度 | 评价 |
| --- | --- |
| **架构** | 分层清晰、契约集中、preload 暴露面极小。**优秀** |
| **数据完整性（提交路径）** | 七步链 + 21 错误码 + 回滚 + 写后校验。**优秀** |
| **数据完整性（代码生成路径）** | 缺根目录校验、缺原子性、缺回滚。**明显弱于提交路径**（N-01/N-02） |
| **测试体系** | 64 文件 / 2,040 断言 / 弱断言 1.4% / 0 无条件 skip。**良好**；但有 6 处条件跳过导致**子集不可复现** |
| **构建发布** | 可产出、图标完整、安装/升级/回滚有实测。**良好**；**未签名**、**版本三方不一致**（N-03） |
| **台账自洽** | 计数 100% 自洽（本轮复算通过）。**优秀**；但 §10/§3.7-A/§3.7 调整表存在 **5 处陈旧表述**（C1/C2/C4/C5） |
| **可复现性** | 关键证据均有原始文件；3 处固有弱点已如实声明 |

### 12.2 对用户 6 个核心问题的直接回答

| 问题 | 回答 |
| --- | --- |
| **1. 当前真实状态？** | 功能完整、提交路径高度可靠、构建可产出；**源码 0.1.1 / 安装 0.1.0 不一致**；`codegen:write` 保护弱于 `recipes:commit`；台账计数自洽但有限制章节陈旧 |
| **2. 关键功能是否有实现/测试/验收证据？** | **有**。三层齐全：实现（源码实读）、测试（64 文件 / 2,040 断言 / handler 级真实 IO）、验收（`PACK-*` 报告 + 原始日志）。**唯一证据链弱点**是 `cacheHit` 未测量、`usedWorkers` 无外部出口——二者均已被台账如实标注 |
| **3. 台账是否与当前事实/历史证据相符？** | **计数与状态判定相符**（本轮复算通过）；**限制与风险声明章节（§10）与 §3.7-A 尾段不符**（C1/C2/C4/C5）。后者是**文档缺陷**，不是判定错误 |
| **4. 是否有未登记缺陷/证据断裂/陈旧结论/重复项/验收遗漏？** | **有**：未登记缺陷 **N-01/N-02/N-03/N-04/N-05/N-06/N-07**；引用层断裂 **C6**；陈旧结论 **C1/C2/C4/C5**；重复项**未发现**；验收遗漏**未发现**（40 条均有 ID，缺口 0） |
| **5. 已关闭条件证据是否充分？未解决分类是否准确？** | **已关闭 5 条证据充分**（`REL-PKG` 有 §3.7-B 逐条 + 运行时/字节双重证据；`UI-U1` 有源码 + 运行日志双重证据；`P1-C4` 有 8/8 图标命中）。**未解决 32 条分类准确**（含明确「关闭所需」说明，如 `P2-POSIXPATH` 要求「完成 POSIX 实机验证」） |
| **6. 能否最终归档？后续构建/发布前必须处理什么？** | **可以归档为本轮验收基线**，但**不能以「全部完成」的口径归档**。发布前必须处理：① N-03 版本一致性 + `dist/` 残留；② C4/C5 的 §10 陈旧表述（否则对外表述会出错）；③ 决定 N-01/N-02 是否在本次发布前修复（建议至少修 N-02） |

### 12.3 审计完成状态

> ## **全工程审计未完成 —— 已完成范围及剩余审计项见 §12.4。**

**理由（按任务书 §12 完成标准的自检）**：

| 标准项 | 状态 |
| --- | --- |
| 1. 四份交付文件已生成 | ✅ |
| 2. 源码与架构审计**完整**完成 | ❌ **部分**：`shared`/`main` 运行时/`recipes`/`codegen`/`scanner` 达 A/B；**`schema`(2,073 行)、`plugins/loader`(1,240 行)、`renderer` 组件(约 8,700 行) 仅 C** |
| 3. 数据完整性审计**完整**完成 | ✅（提交链路 + 草稿应用 + 规范化保留 + 备份 + 冲突，均 A） |
| 4. 测试体系审计**完整**完成 | ❌ **部分**：64 文件已映射、质量检查已做、`handlersWiring`/`writer` 用例已逐条核对；**其余 62 个文件的断言体未逐读** |
| 5. 性能与缓存审计完成 | ✅（`cache.ts` 全文 + 图标队列 + Worker 池 + ZIP 读取位置） |
| 6. UI/IPC/插件审计**完整**完成 | ❌ **部分**：IPC（34 channel）A 级完成；**UI 空状态/无障碍/虚拟化、插件 loader 未完成** |
| 7. 台账 40 条条件逐条审计完成 | ❌ **部分**：计数与分组**全部复算通过**；C1–C8 **逐条读原文完成**；但**未逐条重审 32 条未解决条件的关闭所需是否仍准确** |
| 8. C1–C8 完成 | ✅（8 项全部独立读原文核对，未复述前报告） |
| 9. 证据矩阵完成 | ✅（另见 `AUDIT-FULL-01-EVIDENCE-MATRIX.md`） |
| 10. 缺陷清单完成 | ✅（另见 `AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.md`） |
| 11. 执行日志完成 | ✅（另见 `AUDIT-FULL-01-EXECUTION-LOG.md`） |
| 12. 未修改任何原始文件 | ✅（见 §12.5） |

### 12.4 剩余审计项（未完成部分，逐项列明）

| # | 剩余审计项 | 规模 | 预计方法 | 为何本轮未完成 |
| --- | --- | --- | --- | --- |
| R1 | `src/main/schema/**` 逐文件审计（`classParser.ts` 450 行等 8 文件 / 2,073 行） | 中 | 逐文件通读 + 与 `schema-设计.md` 对照 | 上下文预算，优先保证了数据完整性链路 |
| R2 | `src/main/plugins/**` 逐文件审计（6 文件 / 1,240 行，含 `manifest.ts` 302 行） | 中 | 通读 + 插件覆盖优先级验证 | 同上 |
| R3 | `src/renderer/src/**` 组件与视图（约 8,700 行） | 大 | 逐组件审计空状态/加载态/错误态/可达性 | 规模过大，本轮只覆盖 IPC 桥接与冲突 UI |
| R4 | `tests/` 其余 62 个文件的断言体逐条审查 | 大 | 抽样扩至全量，识别假阳性 | 已做静态统计 + 2 文件逐条 |
| R5 | 32 条未解决条件的「关闭所需」是否仍准确 | 中 | 逐条比对当前源码能力 | 需结合 R1–R3 结论 |
| R6 | 正常 GPU 路径 / 双击启动 / 4K（`REL-VERIFY-*`） | 小 | **需在本机实机执行**（本轮禁止启动） | 规则禁止启动应用 |
| R7 | `P2-POSIXPATH` POSIX 实机验证 | 小 | 需 Linux/macOS 环境 | 本机为 Windows |
| R8 | 完整测试套件运行结果 | 小 | `npm test` | **规则明确禁止**运行完整测试套件 |

### 12.5 本轮是否修改原始文件

| 类别 | 结果 |
| --- | --- |
| 应用源码（`src/**`） | **未修改** |
| 依赖（`package.json` / `package-lock.json`） | **未修改**（`package.json` 本轮只读，确认 `version=0.1.1`） |
| 构建配置（`electron-builder.yml` / `electron.vite.config.ts` / tsconfig / vitest.config） | **未修改**（仅读取） |
| 测试代码（`tests/**`） | **未修改** |
| 正式台账（`docs/PROJECT-SEALING-LEDGER-REPORT.md`） | **未修改**（MD5 仍为 `7a7e52d9…`） |
| 历史验收报告 | **未修改** |
| `.cache/` 历史证据 | **未删除、未移动**；仅**新增** `.cache/audit-full-01-versions.txt`（1 个采集文件） |
| 新增文件 | `docs/AUDIT-FULL-01-*.md` **4 份** + `.cache/audit-full-01-versions.txt` |
| 构建/安装/卸载/启动/扫描 | **均未执行** |

### 12.6 三项最优先后续动作

1. **修正 §10 的陈旧表述（C4/C5）** —— 这是唯一会**主动产生错误对外表述**的缺陷。台账明确要求「引用 B3/REL-PKG 结论时必须连体引用 §10」，而 §10.2 第 1/4/7 行与 §10.3 第 1 条会让人说出与事实相反的话。**只加注、不改原文**即可解决（保留 v7/v8 历史）。
2. **处理版本一致性（N-03）** —— 源码 0.1.1 / 安装 0.1.0 / `dist` 0.1.0 / `dist-011` 0.1.1 四方不一致，且台账无记录。下次构建前必须明确「`dist/` 是否清理」「正式版本号定为多少」，否则会产出两个安装包并存的歧义状态。
3. **评估 N-02（codegen 覆盖写失败无回滚）是否在本次发布前修复** —— 它会让用户整合包在写失败后**缺文件**（虽可从 `.backup/` 恢复）。修复成本低（失败时 `rename` 回原位，或改 tmp+rename），收益是消除「用户数据状态降级」这一类不可接受结果。N-01（`alternateDir` 无校验）可同批处理。

---

**报告结束。**
**审计执行者结论：本轮完成了「数据完整性链路 + IPC 契约 + 台账计数与 C1–C8 + 构建产物实证」的 A 级审计，发现了 7 项未登记缺陷（2 项 P1 文档类、2 项 P2 数据类、3 项 P3）以及 8 项 C 系列一致性问题；未能完成 `schema`/`plugins`/`renderer` 全量与 62 个测试文件断言体的逐条审计。据此如实标记为「全工程审计未完成」。**
