# PROJECT-WIDE AUDIT REPORT

日期：2026-10-31
项目：KubeJS Recipe Studio（`E:/mc kjs`）
性质：**只读审计**。未修改任何源码、配置、测试、依赖或产物；未删除/移动/压缩任何文件；未执行打包。
基线保护：P-C5 / P-C6 / P-C7 / P-OPT4 / UI-REDESIGN-1 视为已封板，本报告只提出问题与证据，不实施修复。

---

## 1. 项目整体健康状况

| 维度 | 评价 | 依据 |
| --- | --- | --- |
| 架构分层 | 良好 | main / preload / renderer / shared 边界清晰，preload 只暴露单一类型化桥（`src/preload/index.ts`），渲染端无 `require`/`fs` |
| 已交付核心链路 | 良好（有验收） | 导入 → 扫描 → 浏览 → 编辑 → 提交/冲突/备份，P-C5/C6/C7/UI-REDESIGN-1 均有真实 Electron 证据 |
| 静态门禁 | 通过 | 本次复跑 tsc node/web、eslint、build 均 0；全量 Vitest 546 通过 / 4 跳过 |
| 功能完整度 | **不完整** | 7 个 IPC 通道「实现了但未注册」，2 个「只有类型声明、无实现」，UI 有 5 处调用它们 |
| 发布准备 | **未就绪** | 缺 `build/`（图标与 buildResources）；asar + worker_threads 组合未验证；从未执行过打包 |
| 仓库卫生 | 偏差 | 磁盘 6.07GB / 171 万文件，85% 是测试与基准产物；根目录有残留编译配置文件 |
| 文档一致性 | 有缺口 | UI-REDESIGN-1 报告声称新增 2 个测试文件（14 条），工作区只有 1 个（5 条），总数差 14 |

一句话结论：**核心编辑链路健康且可交付，但「对外宣称的功能集」与「实际可用的通道」不一致，发布前必须先解决 IPC 接线与打包可行性两件事。**

---

## 2. 架构与模块关系

```
src/main (75 文件 / 11,941 行)
├── index.ts              启动：协议特权 → ensureBaseDirs → pruneOldLogs → installIpc → registerHandlers → createWindow
├── window.ts             BrowserWindow（contextIsolation:true, nodeIntegration:false, sandbox:false）
├── ipcRegistry.ts        单一 invoke 通道 + 统一错误封装（未注册 → { ok:false }）
├── handlers/             9 个领域文件；index.ts 只注册其中 6 个（见 §9-C1）
├── modpack/              detect / modList / state / pathFix
├── scanner/              scanService, jarScan, iconPass, iconWriter(P-OPT2), pool, jarPoolCore, zip(P-OPT4), scan.worker
├── recipes/              jsonSource, jarRecipes, scriptSource, scanRecipes, recipeIndex, commitRecipe(P-C5/C6), backup
├── schema/               classParser, migrate, normalize(?)
├── plugins/              loader / manifest / merge / report / sandbox
├── codegen/              emitScript, emitDatapack, preview, writer, validate, channel, dedupe, shapeTrim
└── logger / paths / uiStateStore / scanControl / iconProtocol

src/preload (2 文件 / 43 行)   contextBridge → window.studio = { invoke, onEvent, iconUrl }
src/renderer (77 文件 / 14,195 行)  App → BrowseView / BenchView / SettingsView + components + store(zustand)
src/shared (18 文件 / 3,212 行)     类型、IPC 契约、常量、主题、规范化、搜索、拼音
tests (55 个 *.test.ts / 550 条)    按 main / renderer / scanner / recipes / schema / codegen / plugins / modpack / algorithms 分域
```

依赖方向：`renderer → (IPC) → handlers → 各领域 → shared`；`shared` 不依赖 main/renderer。未发现循环依赖（按 import 图人工核对，未做自动化环形检测）。

**IPC 边界**：只有一条 `studio:invoke` 通道，`handlers` 用 `Map<name, handler>` 白名单；未知通道返回 `{ ok:false, error:'未注册的 IPC channel：…' }` 并记 WARN，不抛异常（`src/main/ipcRegistry.ts:29-33`）。

---

## 3. 文件数量与磁盘占用（本次实测）

统计方式：Node 迭代遍历（不跟随符号链接），逐顶层目录统计，再对 `.cache/.vitest-tmp/node_modules/out/docs/tests/src` 展开一层。**未删除任何文件。**

| 顶层目录 | 文件数 | 目录数 | 逻辑大小 | 用途 | 可重新生成 |
| --- | --- | --- | --- | --- | --- |
| `.cache` | 1,345,329 | 4,953 | **4,953.0 MB** | 基准/验收用整合包副本、图标目录、bench 脚本与日志、npm 缓存 | 是（副本可重拷，图标可由扫描重建） |
| `.vitest-tmp` | 350,745 | ~700 | **644.0 MB** | 每次测试运行的临时 userData（含 38,760 图标 ×4 份） | 是（测试自动生成，可删） |
| `node_modules` | 14,856 | 452+ | **617.9 MB** | 依赖（electron 269MB、builder-util 207MB…） | 是（`npm ci`） |
| `out` | 16 | 3 | 1.9 MB | electron-vite 构建产物 | 是（`npm run build`） |
| `src` | 179 | 14 | 1.1 MB | 源码 | 否（唯一真源） |
| `tests` | 63 | 9 | 0.4 MB | 测试 | 否 |
| `docs` | 19 | 2 | 0.4 MB | 设计与验收文档（含本报告） | 否（历史证据） |
| `plugins/examples` | 1 | 1 | <0.1 MB | 插件示例 JSON | 否 |
| `.workbuddy` | 2 | 1 | <0.1 MB | 工作区记忆与约定 | 否 |
| 根目录散文件 | 12 | 0 | ~0.4 MB | package/tsconfig/eslint/README/交接文档/**残留编译配置** | 见 §9-C8 |
| **合计** | **1,711,224** | **11,032** | **6,520,933,537 B ≈ 6.07 GB** | — | — |

与历史口径（171 万文件 / 10,758 目录 / ~6GB）基本一致：**文件数 1,711,224，目录 11,032（+274），6.07GB**。

### 3.1 重点放大项

| 路径 | 文件 | 大小 | 说明 |
| --- | --- | --- | --- |
| `.cache/pc3-pack-construct` | 21,375 | 1,158 MB | 旧基准整合包副本（P-C3） |
| `.cache/pc3/pc5/pc7-pack-1112` | 各 ~1,660 | 各 552 MB | 验收副本；**jar 的 nlink=4 → 与源包共享磁盘块，逻辑 2.2GB 实际几乎不额外占盘** |
| `.cache/npm` | 2,621 | 481 MB | npm 缓存（可 `npm cache clean` 回收，需批准） |
| `.cache/opt1` | 265,118 | 221 MB | P-OPT1 图标落盘目录（多次 bench 各 38k 图标） |
| `.cache/opt2` | 386,899 | 115 MB | P-OPT2 写入基准目录 |
| `.cache/opt1-userdata`、`opt2-ud5..10` | 各 ~38,806 | 各 ~79 MB | 应用级冷启动用的独立 userData |
| `.vitest-tmp/opt1-55912` | 155,055 | 306 MB | 进程级剖析的临时 userData |
| `.vitest-tmp/realScan*` ×4 | 各 38,764 | 各 76 MB | 真实包扫描测试的临时目录 |

> 结论：**99.1% 的文件与 85.8% 的字节都在测试/基准产物里**，源码 + 测试 + 文档合计仅 ~1.9 MB。
> 硬链接使「逻辑大小」高估了物理占用：三份 pack 副本与源包共享 451MB 数据块。

---

## 4. 性能现状与瓶颈

本节数字均为**历史实测**（P-OPT1/2/3/4 报告），本次未重跑基准（避免缓存状态混淆）；标注来源以示区分。

| 项 | 实测 | 来源 |
| --- | --- | --- |
| 冷启动完整扫描（295 jar / 430.5MB） | 59.2–72.4s（P-OPT4-S2 新实现）；78.1–106.3s（旧实现） | S2 A/B |
| items 阶段 | 53.8–66.6s（新）；65.1–96.1s（旧） | S2 A/B |
| recipes 阶段 | **4.2–5.3s**（新）；9.8–12.4s（旧） | S2 A/B |
| 热启动（缓存有效） | 扫描 0.54–0.94s；含启动+导入 9.3–9.6s | P-OPT1 |
| 启动到可操作 | 2.5–2.6s（boot）+ 6.3–9.2s（detect/导入） | P-OPT1 |
| 归档遍历次数 | 1,055 次/冷启动（S2 后，原 1,489） | S2 推算（基于 P-OPT1 计数） |

**仍存在的结构性开销（不建议擅自改动，属封板范围外）**：

1. `detectMetadata → scanModMetadata` 每次启动读 295 个 jar 的 `mods.toml`（P-OPT1 实测 2.6–5.4s），且与后续 `jarScan` 的遍历不共享 —— 这是 P-OPT1 的 P2 候选，未实施。
2. iconPass 仍有 3 轮模型读取（170 次 `readMany` / 8.4–9.1s）；P-OPT3 已证明合并轮次为净负收益，**保持现状**。
3. 大包 items 阶段受磁盘 I/O 支配（`parallelFactor` 2.3–3.2，20 逻辑核），并发调参无稳定收益（P-OPT1 A/B 已证）。

**内存**：未见测量数据（本轮未做堆采样）→ 列为**未验证**。43,474 物品 + 15.3MB `items.json` + 31.5MB `recipes.json` 常驻索引的具体峰值未知。

---

## 5. 功能完成度清单

| 功能 | 状态 | 证据 |
| --- | --- | --- |
| 整合包导入与识别 | ✅ 已实现且已验证 | P-C7 E2E S1–S8；`detect.test.ts`(23)、`pathFix.test.ts`(10) |
| 物品索引与图标 | ✅ 已实现且已验证 | P-OPT2（38,760 图标 / 4,714 缺失）；`scanPipeline`(19)、`iconWriter`(6) |
| 配方扫描与浏览 | ✅ 已实现且已验证 | P-C7 S2（32,890 / 426 / 5,334）；`sources`(4)、`recipeIndex`(5) |
| 配方详情（正文） | ✅ 已实现且已验证 | P-C7 S2 重开一致 |
| 配方详情（**代码 tab**） | ❌ **不可用** | `DetailPanel.tsx:58` → `CodePane` → `codegen:preview`（未注册）；只会拿到 `null` |
| 工作台（试点路径） | ✅ 已实现且已验证 | P-C7 八场景全部走 `.pilot-panel` |
| 工作台（**经典路径 / 类型选择**） | ⚠️ **部分不可用** | `benchUiStore.ts:118`、`BenchView.tsx:45` 调 `schema:list`，main 无实现 → 类型列表为空 |
| 提交 / 备份 / 冲突 / 回滚 | ✅ 已实现且已验证 | P-C5（5）、P-C6（12）、P-C7 八场景 |
| Schema（规范化/校验/迁移） | ✅ 已实现，部分缺验证 | `normalize`(14)、`structural`(7)、`validate`(9)、`migrate`(5)；`schema:list/coverage` 无 handler |
| 插件（加载/清单/沙箱/合并） | ✅ 模块已实现，❌ UI 不可用 | `loader`(19)、`manifest`(17)、`sandbox`(11)、`merge`(8)、`report`(7)；`pluginHandlers.ts` **未注册** |
| 脚本管理 | ⚠️ 后端有实现，UI 不可用 | `scripts:list/rename` 在 `codegenHandlers.ts:109+`，**未注册**；`scriptSource`(13) 仅覆盖扫描 |
| 代码生成与预览 | ⚠️ 后端有实现，UI 不可用 | `codegen/*` 7 个测试文件全绿；`codegen:preview/checkTarget/write` **未注册** |
| 设置与主题 | ✅ 已实现且已验证（覆盖度页除外） | UI-REDESIGN-1 §4.4 四主题；`themeTokens`(5) |
| 设置 - **Schema 覆盖度** | ❌ 不可用 | `SettingsView.tsx:28` 调 `schema:coverage`，无实现 |
| 日志控制台 | ✅ 已实现且已验证 | UI-REDESIGN-1；`logs:export` 已注册 |
| 快捷键与交互 | ✅ 已实现且已验证 | UI-REDESIGN-1（←/→ 翻页）；P-C7 场景交互 |

> 「不可用」的判定是**静态接线核查**（channel 未注册 + 渲染端确有调用 + `api.ts` 降级为 `null` + WARN 日志）。未逐个点开 UI 复现（本轮只读，未启动应用做点击验证）。

---

## 6. 数据安全审查

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 文件写入边界 | 良好 | 提交前 `inside(modpack.path, target)` 校验；图标只写 `userData/icon-cache` |
| 路径校验 | 良好 | `recipePath` 用严格正则 + 拒绝 `..`；`iconProtocol` 只接受 40 位 hex，杜绝穿越 |
| IPC 权限边界 | 中等 | 单一通道 + 白名单，但**未注册的通道静默降级**，用户看到的是「空功能」而非明确错误 |
| 用户数据 / 项目数据隔离 | 良好 | 缓存、日志、备份均在 `userData`；整合包只读（除显式提交） |
| 备份机制 | 良好（P-C6 已验证） | 覆盖前备份 + `.meta.json`；备份失败即中止覆盖 |
| 原子写入 | 良好 | tmp + fsync + rename；图标 `wx` 独占创建 |
| 冲突检测 | 良好 | rawHash + rename 前二次校验（TARGET_CHANGED） |
| 回滚 | 良好，含「状态不确定」升级 | SAVE_ROLLBACK_FAILED |
| 异常处理 | 良好 | `ipcRegistry` 统一捕获；启动失败落盘日志；pool 单 jar 失败隔离 |
| 异常退出数据安全 | 部分 | 提交有原子写；但**无单实例锁**，双开时两个进程可同时写同一 wrapper/缓存 |
| 可能破坏用户文件的路径 | 未发现 | 所有写路径均受 `inside()` 或固定 userData 目录约束 |

---

## 7. 测试体系评估

- 规模：**55 个测试文件 / 550 条用例**（本次运行：546 通过 / 4 跳过；2 个文件整体跳过）。源码 179 文件 / 29,348 行 → 测试 63 文件 / 10,380 行，比例合理。
- 覆盖分布：codegen 82 条、plugins 62 条、scanner 61 条、renderer 70 条、recipes 33 条、schema 42 条、modpack 33 条、algorithms 41 条、shared 28 条、main 28 条。
- 真实 Electron 验证：仅 `P-C7` 八场景（`.cache/e2e-pc7.mjs`）+ 各阶段 E2E 脚本；这些脚本**不在仓库内**（`.cache`），属可再生但未纳入版本管理的证据。
- 环境依赖：`realPack.test.ts`、`detect.test.ts`（ae/baka 包）、`pathFix.test.ts` 依赖本机磁盘上的真实整合包；缺包时整文件跳过（本次 2 个文件跳过即此类）。
- 脆弱点：`fileParallelism: false` 是为规避性能断言的 CPU 争用（`vitest.config.ts` 注释），意味着全量测试无法并行，单次约 75–90s。

**关键缺口（新增建议，不改既有断言）**：

1. **IPC 注册完整性测试**：断言 `INVOKE_NAMES` 中每个通道都有 handler（或显式列入「未接线白名单」）。这类测试本可拦住 §9-C1。
2. 打包后冒烟：在 `asar` 产物中验证 `new Worker(...)` 能否加载（见 C3）。
3. 同一 JAR 并发 `listAndRead` 用例（P-OPT4 遗留）。
4. 渲染端对 `null` 降级的可见性测试（避免「通道挂了但界面只是空白」）。
5. 真机冷启动 A/B 未进 CI（OS 缓存不可控，只能人工）。

---

## 8. Windows 发布准备

| 检查项 | 现状 | 判定 |
| --- | --- | --- |
| electron-builder 配置 | `electron-builder.yml` 存在，`appId/productName/nsis` 齐备 | 基本可用 |
| `dist:win` | `npm run build && electron-builder --win nsis` | 命令存在 |
| NSIS | `oneClick:false, perMachine:false, allowToChangeInstallationDirectory:true, createDesktopShortcut:true` | 合理 |
| 应用图标 | `win.icon: build/icon.ico`，`buildResources: build` —— **`build/` 目录不存在** | ❌ 阻塞（见 C4） |
| 版本信息 | `version: 0.1.0`，无 `copyright`/`companyName`/`fileDescription` | 需补 |
| 资源路径 | `files: out/**, package.json` + 显式 node_modules 白名单（acorn/yauzl/fd-slicer/pend/**yauzl-promise**) | ⚠️ `yauzl-promise` 未安装（C5） |
| asar | `asar: true`；worker 通过 `new Worker(join(__dirname,'scan.worker.js'))` 加载 | ⚠️ **未验证**（C3） |
| 用户数据路径 | 默认 `app.getPath('userData')` → `%APPDATA%/kubejs-recipe-studio` | 合理 |
| 安装/升级/卸载 | 从未执行过打包，行为未知 | **未验证** |
| 打包后运行时依赖 | 依赖白名单只列 4 个真实依赖中的 3 个（acorn/yauzl/fd-slicer/pend）；`electron` 为 dev 依赖 | 需实包验证 |
| 开发正常/打包失效风险 | 高（asar + worker、图标缺失、依赖白名单） | 见 C3/C4/C5 |

---

## 9. 已确认的问题

> 每条都给出代码位置与证据；「是否需批准」指修复动作是否需要项目负责人授权。

### C1 · IPC 通道大面积未接线（High，已确认）

- **位置**：`src/main/handlers/index.ts:12-19`（只调用 6 个 register 函数）；`codegenHandlers.ts:65`、`pluginHandlers.ts:14` 从未被调用；`schema:list`/`schema:coverage` 仅在 `src/shared/ipc.ts:225,230` 有类型声明，**main 无任何实现**。
- **受影响通道**：`codegen:preview`、`codegen:checkTarget`、`codegen:write`、`scripts:list`、`scripts:rename`、`plugins:list`、`plugins:setEnabled`（实现了但未注册）+ `schema:list`、`schema:coverage`（无实现）。
- **渲染端调用点**：`views/bench/benchUiStore.ts:118`、`views/BenchView.tsx:45`（schema:list）、`views/SettingsView.tsx:28`（schema:coverage）、`views/CodePane.tsx:63`（codegen:preview）、`views/bench/panels/WriteDialog.tsx:50,56,71`（scripts:list / codegen:checkTarget / codegen:write）。
- **影响**：经典工作台的类型选择为空；详情面板「代码」页空白；写盘对话框脚本列表为空、写前检查/写入按钮链路不可用；设置页覆盖度空；插件页不可用。UI 侧按 `api.ts:19-22` 把「未注册」降为 WARN + `null`，用户看不到明确错误。
- **处理建议**：注册 codegen/plugin 两组 handler；为 `schema:list/coverage` 补实现（工作量：schema 注册表已有，主要是汇总与覆盖统计，估 1–2 天）；或从 UI 移除入口并标注「未实现」。
- **需批准**：**是**（涉及功能实现，非审计修复）。

### C2 · 无单实例锁（Medium，已确认）

- **位置**：`src/main/index.ts` 全文无 `requestSingleInstanceLock`/`second-instance` 处理。
- **影响**：双开时两个进程共享同一 `userData`（缓存、日志、uiState、备份目录）与同一整合包，可能互相覆盖缓存文件；P-C7 报告已把「多实例并发提交」列为未验证风险，此处确认其**根因**。
- **建议**：启动时 `requestSingleInstanceLock()`，第二个实例聚焦已有窗口后退出。
- **需批准**：是（行为变更）。

### C3 · asar 内 worker_threads 未验证（High，潜在阻塞，未确认）

- **位置**：`electron-builder.yml:15`（`asar: true`，无 `asarUnpack`）；`src/main/scanner/pool.ts:33`「`new Worker(join(__dirname,'scan.worker.js'))`」；`src/main/recipes/jsonSource.ts` 同样走 worker。
- **风险**：打包后 `__dirname` 位于 `app.asar` 内，Node 的 `worker_threads` 需要真实文件路径，可能 `ERR_WORKER_PATH`/ENOENT；一旦抛错，`runJarPoolCore` 的 `create()` 在 `spawn()` 内同步抛（`jarPoolCore.ts:90,109`），会让整个扫描失败而非降级 inline。
- **当前状态**：**未实测**（本轮禁止打包），因此列为「潜在发布阻塞」而非确认缺陷。
- **建议**：打包后跑一次 295-jar 扫描冒烟；如失败，给 worker 文件加 `asarUnpack` 或改为 `process.resourcesPath` 定位。
- **需批准**：是（需要执行打包）。

### C4 · 打包图标与 buildResources 缺失（Medium，已确认）

- **位置**：`electron-builder.yml:5`（`buildResources: build`）、`:13`（`icon: build/icon.ico`）；仓库根目录**无 `build/`**（`ls build` → 不存在）。
- **影响**：`electron-builder` 找不到图标，通常回退默认 Electron 图标并给警告，部分版本会直接报错；安装包缺少产品图标会直接影响发布质量。
- **建议**：补 `build/icon.ico`（≥256×256）与可选 `installerIcon`/`uninstallerIcon`。
- **需批准**：是（新增二进制资源）。

### C5 · 依赖白名单与实际依赖不一致（Low，已确认）

- **位置**：`electron-builder.yml:9-12` 列出 `yauzl-promise`；`package.json` 的 dependencies 只有 `acorn`、`yauzl`（`node_modules/yauzl-promise` 不存在）。
- **影响**：无运行影响（模式匹配不到即忽略），但会误导后续维护者以为运行时依赖 4 个包。
- **建议**：删除该行，或改为实际依赖清单。
- **需批准**：否（文档/配置清理，建议随打包修复一并做）。

### C6 · 文档与工作区不一致（Medium，已确认）

- **证据**：`docs/UI-REDESIGN-1-验收报告.md:196-197` 声称新增 `tests/shared/theme.test.ts`（9 条）与 `tests/renderer/themeTokens.test.ts`（5 条），`:293` 记录全量「53 文件通过 / 2 跳过；560 用例通过 / 4 跳过」。
- **实际**：`tests/shared/` 下无 `theme.test.ts`（只有 canonicalJson/ipc/version）；`themeTokens.test.ts` 存在（5 条）；本次全量 **546 通过 / 4 跳过**（550 总数）。差 **14 条**（恰为 9+5）。
- **影响**：验收数字无法复现；主题注册表（迁移/循环切换）目前只有 `src/shared/theme.ts` 代码、没有对应测试。
- **可能原因**（未确认）：该文件未合并进本工作区，或报告把「计划新增」写成了「已新增」。
- **建议**：由负责人确认；若确为遗漏，补 `tests/shared/theme.test.ts`（9 条），而不是修改报告数字。
- **需批准**：是（新增测试文件）。

### C7 · 测试与基准产物占满工程目录（Medium，已确认）

- **证据**：§3 统计——`.cache` 1,345,329 文件 / 4,953MB，`.vitest-tmp` 350,745 文件 / 644MB，合计占文件数 99.1%、字节 85.8%。
- **影响**：文件系统遍历慢（本次统计耗时 33s）、备份/杀软扫描成本高、`npm ci` 之外的目录体积失控；不影响运行。
- **建议**：见 §11 清理建议（需批准后分批执行）。
- **需批准**：是。

### C8 · 根目录残留编译配置文件（Low，已确认）

- **位置**：`electron.vite.config.1793454160022.mjs`（内容为编译后的配置，`__electron_vite_injected_dirname = "E:\\mc kjs"`，与 `electron.vite.config.ts` 内容不同）。
- **影响**：不会被 electron-vite 读取（它只找 `electron.vite.config.ts`），属垃圾文件；但会误导排查，且 `.gitignore` 未覆盖该模式（见 C9 备注）。
- **建议**：确认后删除（需批准）。
- **需批准**：是（删除文件）。

### C9 · 未拦截渲染进程导航（Low，已确认）

- **位置**：`src/main/window.ts:61` 只处理 `setWindowOpenHandler`（新窗口），无 `will-navigate` 监听。
- **影响**：渲染进程若被注入/误点，可让主窗口导航到任意外部 URL（本地应用、无远程内容，风险低但不合最佳实践）。
- **建议**：加 `will-navigate` 白名单（仅允许 dev server 与 `file://` 自身）。
- **需批准**：是（行为变更）。

### C10 · 构建偶发失败（Info，环境问题，非产品缺陷）

- **证据**：本次门禁 G5 首次退出码 1，日志为 `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":52,"threshold":50,...,"targets":["E:\\mc kjs\\out\\main\\chunks"]}`——宿主 CLI 的批量删除保护拦截了 vite 的清空 `out/` 步骤。
- **影响**：仅影响自动化脚本的连续构建；换执行轮次后 7/7 成功。
- **建议**：CI/脚本里把「构建」放在独立步骤，失败重试一次。

---

## 10. 潜在风险（未确认）

| # | 风险 | 依据 | 严重度 |
| --- | --- | --- | --- |
| R1 | 打包后 worker 无法加载导致扫描直接失败（C3） | 配置与代码路径，未实包验证 | High（未确认） |
| R2 | NSIS 升级/卸载对 `%APPDATA%` 用户数据的影响未验证 | 从未打包 | Medium |
| R3 | 大包内存峰值未知（43k 物品 + 31.5MB 配方索引） | 未做堆采样 | Medium |
| R4 | `sandbox: false` 的取舍未记录理由 | `window.ts:31` | Low |
| R5 | 图标缓存目录无上限（P-OPT2/P-C6 已记录） | `.cache` 里就有 65 万个图标文件作证 | Medium |
| R6 | 经典 BenchView 在 schema:list 为空时的降级体验（空白/报错）未做 UI 验证 | 静态推断 | Medium |
| R7 | `detect` 每次启动重读 295 jar（2.6–5.4s）未优化 | P-OPT1 实测 | Low（体验） |

---

## 11. 优化与清理建议（**均未执行，等待批准**）

### 11.1 磁盘清理建议（按风险从低到高）

| 顺序 | 目标 | 文件数 / 占用 | 用途 | 可重建 | 删除风险 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.vitest-tmp/*`（除最近一次） | 350,745 / 644MB | 测试临时 userData | 是 | 极低（测试会重建） |
| 2 | `.cache/opt1`、`.cache/opt2`、`.cache/opt*` 图标与 userData | ~700k / ~500MB | 基准图标目录 | 是 | 极低（仅基准用） |
| 3 | `.cache/pc3/pc5/pc7-pack-*` | ~5k / 逻辑 2.2GB（**物理接近 0，硬链接**） | 验收包副本 | 是（`cp -al` 秒级） | 低（删除后需重拷才能复跑 E2E） |
| 4 | `.cache/pc3-pack-construct` | 21,375 / 1,158MB | 旧基准包（P-C3） | 需源包 | 中（源包可能已不在本机，需确认） |
| 5 | `.cache/npm` | 2,621 / 481MB | npm 缓存 | 是（重新下载） | 低（离线安装会变慢） |
| 6 | 根目录 `electron.vite.config.1793454160022.mjs` | 1 / <1MB | 残留编译配置 | 是 | 极低 |
| — | `node_modules` | 14,856 / 618MB | 依赖 | 是（`npm ci`） | **不建议现在删**（重装需网络与时间） |
| — | `out` | 16 / 1.9MB | 构建产物 | 是 | 不建议（封板基线产物） |
| — | `docs/`、`.workbuddy/`、`src/`、`tests/`、`plugins/` | ~250 / ~2MB | 真源与证据 | 否 | **禁止删除** |

预计可回收：约 **2.1–2.5GB 物理空间 + 106 万文件**（不含 node_modules 与硬链接副本）。分批执行，每批后校验 `npm test` 仍绿。

### 11.2 代码与发布建议（按优先级）

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P0 | 修复 C1（注册 codegen/plugins，补 schema:list/coverage 或下掉入口） | 否则「代码生成/插件/设置覆盖度」在发布版里是死功能 |
| P0 | 验证 C3（打包后 worker）并补 `asarUnpack` 或路径方案 | 否则大包扫描可能整体失败 |
| P1 | 补 `build/icon.ico` 与版本元信息（C4） | 发布门面 |
| P1 | 加单实例锁（C2） | 数据安全 |
| P2 | 新增「IPC 注册完整性」测试（§7-1） | 防止再次漏接线 |
| P2 | 清理测试产物（§11.1 第 1–3 批） | 工程卫生 |
| P3 | 补 `tests/shared/theme.test.ts` 或修正报告（C6） | 文档可信度 |
| P3 | `will-navigate` 白名单（C9） | 纵深防御 |
| — | **不要动**：P-C5/C6/C7 提交链路、P-OPT4 `listAndRead`、P-OPT2 写入队列与并发参数、UI 主题令牌 | 已封板 |

---

## 12. 后续阶段建议与优先级

1. **阶段 A（发布阻塞，1–2 天）**：C1 接线 + C4 图标 → 再试打包 → 用打包产物跑 295-jar 扫描冒烟（验证 C3）。
2. **阶段 B（稳定性，0.5–1 天）**：单实例锁、`will-navigate`、IPC 注册完整性测试。
3. **阶段 C（工程卫生，0.5 天）**：按 §11.1 分批清理（每批后跑全量测试），删残留配置文件。
4. **阶段 D（可选，需单独评估）**：detect 元数据缓存（P-OPT1 P2 候选，5–6s/次启动）；图标缓存上限策略。

---

## 13. 本次实际执行的检查（可复核）

| 类型 | 内容 |
| --- | --- |
| 只读命令 | `ls -a`、`cat electron-builder.yml`、`cat electron.vite.config.ts`、`cat vitest.config.ts`、`cat src/preload/index.ts`、`cat src/main/ipcRegistry.ts`、`sed -n` 读取 window/index/jarPoolCore/iconProtocol |
| 全仓搜索 | `grep -rn "registerHandler('"`、`grep -rn "schema:list\|plugins:list\|scripts:list\|codegen:preview"`、`grep -rn "requestSingleInstanceLock"`、`grep -rn "describe.skip\|it.skip"` |
| 规模统计 | `node /tmp/audit2.cjs`（迭代遍历，34s）：1,711,224 文件 / 11,032 目录 / 6,520,933,537 B，结果存 `%TEMP%/audit-size.json`（**在系统临时目录，不在工程内**） |
| 硬链接核查 | `fs.statSync(...).nlink` → pack 副本 jar `nlink=4` |
| 静态计数 | `it(` 出现次数 544（运行时 550，差异为数据驱动用例） |
| 门禁复跑 | 本次会话中 P-OPT4 收尾已复跑：定向 76/76、tsc node/web、eslint、build、全量 546 通过、P-C5/C6 35/35、P-C7 八场景（首次 CDP 无响应，重跑通过）；本审计阶段**未再重复跑**这些门禁（避免与审计无关的负载），结论沿用同一工作区、同一构建、相隔 1 小时内 |

**未执行的检查及原因**：

- 未执行 `electron-builder` 打包（任务明确禁止）→ C3/C4/R1/R2 只能标记为未验证。
- 未做内存堆采样 / CPU profile（会引入额外运行负载，且需启动应用跑真实包；本轮只读优先）。
- 未启动应用点开「代码/插件/覆盖度」页面复现（仅静态接线核查 + `api.ts` 降级路径）。
- 未做自动化循环依赖检测（仅人工核对 import 方向）。
- 未在第二台机器/非 Windows 环境验证。

---

## 14. 建议保持不动的部分

- `src/main/recipes/commitRecipe.ts`、`backup.ts`（P-C5/P-C6 已验证的提交、备份、回滚、冲突语义）。
- `src/main/scanner/zip.ts` 的 `listAndRead` 与三个已替换调用方（P-OPT4 封板成果）。
- `src/main/scanner/iconWriter.ts` 及 `ICON_WRITE_CONCURRENCY_TOTAL=24`、`ICON_WRITE_BATCH=64`（P-OPT2 实测选定）。
- `src/renderer/src/styles/tokens.css` 与 `src/shared/theme.ts`（UI-REDESIGN-1 四主题基线）。
- `tests/**` 既有断言（本轮只读，未改一条）。
