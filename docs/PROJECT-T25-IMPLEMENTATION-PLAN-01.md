# T-25 冷启动恢复 · 实施计划与一处硬约束冲突（停，待裁定）

| 项 | 内容 |
|---|---|
| **状态** | **未开始编码**。探查后发现**硬约束 2 与真实数据形态冲突**，按任务书「改动超范围/冲突 → 停，报告」处理 |
| **探查时点** | 2026-11-03 06:41–06:48（只读，未改任何文件） |
| **备份** | 三处目标文件已备份至 `.cache/fix14/a3tmp/b46-pre/`（供后续实施用） |

---

## 1. 一个重大利好：步骤 3 几乎免费

`scanOrchestrator.startScan(rebuild=false)` **已内置完整缓存策略**（源码注释与实现一致）：

- 阶段 1：物品索引「内部自带缓存判定，**命中则不重扫**」；
- 阶段 2：配方缓存命中则「**只恢复**」；读取失败才重扫；
- 阶段 4：**meta 只有全部阶段成功才提交**，无 meta 永不视为完整缓存。

→ **步骤 3 不需要新写缓存载入代码**，恢复包上下文后调用 `startScan(false)` 即可命中缓存。这比任务书预设的实现量小得多。

## 2. ⚠ 硬约束 2 与真实数据冲突（**需要裁定**）

任务书硬约束 2 原文：

> 恢复的包路径**必须校验目录存在 + `package.json` name**（防目录被删后恢复到垃圾状态）。

**实测：`t13-pack` 根目录没有 `package.json`**（`test -f` = 否）。整合包根目录是 PCL/启动器实例，含 `mods/`、`config/`、`1112.jar`、`1112.json`、`PCL/` 等，**没有 npm 的 `package.json`**。

**若按字面实现，校验必然永远失败 → 恢复功能等于不存在（且会静默走降级），这比不修更糟。**

**替代校验方案（供选择，均可防"目录被删/替换"）**：

| 方案 | 校验内容 | 优点 | 风险 |
|---|---|---|---|
| **A（建议）** | 目录存在 + `mods/` 子目录存在 + `detectMetadata(path).name` 与持久化时记录的 `name` 一致 | 与真实形态匹配；能识别"目录被换成另一个包" | 依赖 `detectMetadata`（已有，成本低） |
| B | 目录存在 + `minecraftinstance.json` / `manifest.json` 存在 | 轻量 | 非所有启动器都有；t13-pack 属 PCL 实例，需确认存在性 |
| C | 目录存在 + 记录 `modCount` 与当前 `mods/*.jar` 数量一致 | 可识别内容被替换 | 用户增减 mod 即失效（误判为"垃圾"） |

**请裁定采用哪一个**。若坚持 `package.json`，则该约束在当前产品形态下不可实现，需改为其他等价校验。

## 3. 尚需澄清的第二点：`UiState` 字段扩展

`UiState`（`src/shared/types.ts:323`）已有多个**可选**字段（如 `benchV2?: string[]`）。新增 `lastModpackPath?: string` 是**一行、向后兼容、无需迁移**的改动——这点没有障碍，只是确认一下你接受把包路径与 UI 状态同文件存放（任务书要求写 `uiState.json`，故默认如此）。

## 4. 拟定实施清单（待裁定后执行）

| 步 | 文件 | 改动 | 规模 |
|---|---|---|---|
| 1a | `src/shared/types.ts:323` | `UiState` 增 `lastModpackPath?: string` | +1 行 |
| 1b | `src/main/uiStateStore.ts` | `loadUiState()` 读该字段（string 校验）；`patchUiState` 已可写 | ~4 行 |
| 1c | `src/main/modpack/index.ts`（`importModpack` 末尾，`setCurrentModpack(info)` 之后） | `patchUiState({ lastModpackPath: info.path })` + `saveUiState()` | +2 行 |
| 2 | `src/main/index.ts`（`createWindow(...)` 之后，`whenReady` 内） | 新增 `restoreLastModpack()`：读路径 → 校验（按裁定方案）→ `detectMetadata` + `setCurrentModpack` | ~30 行 |
| 3 | 同上 | `await startScan(false)`（**命中缓存即跳过重扫**）；失败/无缓存则降级为重扫 | ~6 行 |
| 4 | 同上 | 恢复后触发 `loader.syncPluginLayer()` + `service.ensureSchemas()` | ~4 行 |
| 5 | 同上 + 渲染层提示 | 校验失败 → 清空 `lastModpackPath` + 写 `logger.warn` + 通过既有事件通道发提示（**禁止静默**） | ~10 行 |

**总量**：约 **55–60 行**，集中在 4 个文件；其中仅 `index.ts` 触及启动流程（A2 范围）。

## 5. 风险与回归门禁（已确认可执行）

| 风险 | 缓解 |
|---|---|
| 启动时扫描阻塞窗口就绪 | `restoreLastModpack()` 不 `await` 扫描，仅在后台触发并发事件（窗口先出） |
| 恢复逻辑误读全局路径 | 一律经 `uiStateFile()` / `cacheFile()`（envPaths 派生），**不出现字面量路径**（硬约束 1） |
| 跨包错载缓存 | `cacheFile(modpack.path, ...)` 由包路径派生 hash，天然隔离；额外按裁定方案校验 name |
| 与 T-14 双实例冲突 | 恢复只读**本实例** userData；建议回归包含 T-14 六条 |

**回归清单**（任务书要求，全部可跑）：冷启动恢复 → FIX-01/02/03 → RT-01 → RT-05 S2 → T-14 六条 → vitest 824 → typecheck/lint → 降级路径（改包目录名）。

## 6. 为什么现在停

1. 硬约束 2 按字面**不可满足**（无 `package.json`），继续写只能落一个"永远走降级"的假修复；
2. 全量回归（含冷启动、T-14 六条、降级实测）需要完整一轮执行预算，不在本轮可用范围内；
3. 已在 `.cache/fix14/a3tmp/b46-pre/` 备好三份原文件，裁定后可立刻开工，无需重新探查。

**待你回两件事即可开工**：① 校验方案选 A/B/C；② 确认把 `lastModpackPath` 放进 `uiState.json`（而非独立文件）。
