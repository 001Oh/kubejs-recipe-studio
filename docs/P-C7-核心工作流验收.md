# P-C7 核心编辑工作流最终验收

日期：2026-10-31
范围：只验证 P-C1～P-C6 的协同，修复确实影响 MVP 使用的缺陷。未改 Schema、缓存系统、扫描算法、文件写入架构；未做冷启动优化；未实现备份清理。

## 0. 开工前状态

- 工作区**不是 Git 仓库**（无 `.git`），未做任何 Git 操作；改用文件时间戳：`src/`、`tests/` 在 17:50 后无改动，确认无其他 Agent 并行写入。
- 本轮**没有修改产品代码**（见第 4 节）：所有验收项均已在既有实现上跑通，未新增功能。

## 1. 核心工作流验收矩阵

| # | 验收项 | 判定 | 证据（类型） |
| --- | --- | --- | --- |
| A1 | 从索引打开配方 | ✅ | Electron S1/S2；`tests/main/openRecipe.test.ts`(12) |
| A2 | 原始 / 规范化 / 草稿关系正确 | ✅ | `tests/renderer/pc1PathParity.test.ts`(6)、`draftBridge.test.ts`(10)、`pc2DraftBridge.test.ts`(10) |
| A3 | 编辑后 dirty 准确 | ✅ | Electron：编辑后 `脏字段 1`，提交后 `脏字段 0`；`commitBridge.test.ts`(7) |
| A4 | 未建模/未知字段、conditions 保留 | ✅ | Electron S2 `conditionsKept=true`；`tests/schema/structural.test.ts`(7)、`pc2Normalize.test.ts`(7)、`commitIndexCache.test.ts`(5) |
| A5 | 不能完整建模时不静默丢弃 | ✅ | `openRecipe` 的 `UNKNOWN_FIELD_PRESERVED` / `PARTIAL_RECIPE` 诊断（`openRecipe.test.ts`） |
| A6 | 取消不写盘 | ✅ | Electron S1：`panelGone=true`、`fileExistsAfterCancel=false` |
| B1 | `ui.benchV2` 白名单生效 | ✅ | Electron S8：关闭后 `pilotPanelAbsent=true` |
| B2 | 非白名单类型走回退路径 | ✅ | Electron S8 `legacyBenchCols=1`；P-C2/P-C3 的 shapeless / mixing 关闭后同验证 |
| B3 | 新旧路径差异有说明 | ✅ | `docs/P-C-接入设计.md` §12（旧路径拍平丢空格/3×2、无预览无写盘） |
| B4 | 不以旧路径输出为正确性标准 | ✅ | 同上 §12：新路径以原始 JSON + 数据保留为基准 |
| C1 | 正常提交 | ✅ | Electron S2：`pattern=I#I/IBI/PPP`、`keyB=emerald` |
| C2 | 连续提交同一配方 | ✅ | P-C5 commit 阶段两次提交；`commitIndexCache.test.ts` |
| C3 | 外部修改后提交 | ✅ | Electron S3/S4/S5（三种处理）；`commitFailurePaths` CONFLICT |
| C4 | 外部删除后提交 | ✅ | Electron S7：`无法读取当前原始配方：源文件已失效`，`fileNotResurrected=true` |
| C5 | 重新载入最新内容 | ✅ | Electron S3：`draftNowFromExternal=true`、`dirtyZero=true`、外部文件未被改写 |
| C6 | 保留我的修改 | ✅ | Electron S4：`conflictResolved`、`myEditSaved`、`externalFieldPreserved` 全 true |
| C7 | 另存副本不覆盖原配方 | ✅ | Electron S5：按钮变为「保存副本」，`copyFileCreated`、`copyHasRedstone`、`originalUntouched=true` |
| C8 | 提交后索引与摘要一致 | ✅ | Electron S2 `queryIncludesCommitted=true`；`commitIndexCache.test.ts`(5) |
| C9 | 重启后打开与磁盘一致 | ✅ | P-C5 verify：`reopenedMatchesFile`、`patternAfterRestart=A#I/IBI/PPP` |
| D1 | 覆盖前先备份 | ✅ | `commitFailurePaths`(12)；真实 userData 下产生 1 份备份（首提交为新建） |
| D2 | 备份失败不覆盖 | ✅ | `BACKUP_FAILED`：`writeAtomic` 未被调用、原文不变 |
| D3 | 写入/替换失败草稿可恢复 | ✅ | **Electron S6（真实只读文件）**：toast「写入失败…EPERM（未写入目标文件；草稿已保留）」、`dirtyKept=true`、`fileUnchanged=true` |
| D4 | 回读不一致回滚 | ✅ | `SAVE_VERIFY_FAILED`：目标恢复原文 |
| D5 | 回滚失败告警状态不确定 | ✅ | `SAVE_ROLLBACK_FAILED` + 前端 hint 测试 |
| D6 | `TARGET_CHANGED`/`TARGET_VANISHED` 不覆盖/不复活 | ✅ | `commitFailurePaths`（外部改写保留、外部删除不复活） |
| D7 | 失败不更新 lastCommit/索引/摘要 | ✅ | 单测断言 `upsertIndex` 未调用；前端断言 `lastCommit=null` |
| E1 | 同会话查询立即反映修改 | ✅ | Electron S2 + `commitIndexCache` |
| E2 | 重启缓存行为符合签名设计 | ✅ | P-C5 verify：items 命中 161ms、recipes 重扫 7,758ms |
| E3 | 不把配方阶段重扫误判为不一致 | ✅ | `docs/P-C5…md` §7；verify 场景本身即证据 |
| E4 | 重扫后统计正确 | ✅ | 32,890 条 / 426 类型 / 5,334 partial（提交与重启后不变） |
| E5 | 未新增缓存写入路径 | ✅ | 本轮无缓存代码改动（仅验证） |

## 2. 本轮 Electron 验收（单会话 8 场景，`.cache/e2e-pc7.mjs`）

命令：`PACK="E:/mc kjs/.cache/pc7-pack-1112" E2E_PORT=9385 node .cache/e2e-pc7.mjs` → **退出码 0**

| 场景 | 结果 |
| --- | --- |
| S1 取消 | `panelGone=true`、`fileExistsAfterCancel=false` |
| S2 提交 + 查询 + 重开 | `pattern ["I#I","IBI","PPP"]`、`keyB={emerald,1}`、`queryIncludesCommitted=true`、`conditionsKept=true`、`reopenedMatchesFile=true` |
| S3 冲突→重新载入 | `conflictShown`、`draftNowFromExternal`、`fileStillExternal`、`dirtyZero` 全 true |
| S4 冲突→保留我的→提交 | `myEditSaved=true`、`externalFieldPreserved=true` |
| S5 冲突→另存为副本 | `buttonShowsSaveCopy=true`、`copyFileCreated=true`、`copyHasRedstone=true`、`originalUntouched=true` |
| S6 真实只读失败 | 新增 toast：「写入失败（…相对路径…）：EPERM（未写入目标文件；草稿已保留，可重试）」；`dirtyKept=true`、`fileUnchanged=true` |
| S7 外部删除后提交 | toast：「无法读取当前原始配方：源文件已失效…」；`dirtyKept=true`、`fileNotResurrected=true` |
| S8 关闭白名单 | `pilotPanelAbsent=true`、`legacyBenchCols=1` |

其他：`uiErrors=[]`；基线在会话开始时 43,474 物品 / 32,890 配方 / 426 类型 / 5,334 partial。

生成物（工作区副本内）：`kubejs/data/ad_astra_giselle_addon/recipes/compat/mekanism/crafting/module_acid_rain_proof_unit.json`（覆盖提交）、`kubejs/data/recipe_studio/recipes/compat_mekanism_crafting_module_acid_rain_proof_unit_20261031101801.json`（另存副本）。原始只读包 `E:/PCL/.minecraft/versions/1112` 未被写入（已核对目标文件不存在）。

## 3. 发现的缺陷

| # | 描述 | 严重程度 | 处理 |
| --- | --- | --- | --- |
| — | 本轮未发现影响核心工作流的缺陷（8 场景 + 527 条测试全绿） | — | — |
| O1 | `RAW_UNREADABLE` 的 toast 含绝对路径，而 `SAVE_FAILED` 已改相对路径（P-C6），提示风格不一致 | 轻微（不影响正确性） | **只记录不修**：路径对定位源文件有诊断价值；若要统一属独立小任务 |
| O2 | 备份目录只增不减 | 轻微（磁盘占用） | P-C6 已列为后续独立任务，本轮按约束不实现清理 |
| O3 | 「另存为副本」文件名由 recipeId + 时间戳派生，连续多次副本会在目录里累积 | 轻微 | 观察项，未改 |

## 4. 修改的文件

**无产品代码改动。** 仅新增验收脚本与文档：

- `.cache/e2e-pc7.mjs`（验收脚本，非仓库代码）
- `docs/P-C7-核心工作流验收.md`（本文）

## 5. 命令与真实结果

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `electron-vite build` | 0 | — |
| `vitest run`（全量） | 0 | **49 文件通过 / 2 跳过；527 通过 / 4 跳过** |
| `node .cache/e2e-pc7.mjs`（8 场景） | 0 | 见第 2 节，`uiErrors=[]` |
| `PHASE=commit node .cache/e2e-pc5.mjs`（P-C5 回归，P-C6 时已跑） | 0 | 两次提交 + 查询/重开一致 |
| `PHASE=verify node .cache/e2e-pc5.mjs`（P-C5 重启回归） | 0 | items 161ms + recipes 7,758ms；重开/查询/冲突正常 |

## 6. P-C5 / P-C6 回归

- P-C5：`commitIndexCache.test.ts` 5/5、`commitRecipe.test.ts` 11/11；索引替换、`recipes:full`、摘要刷新、副本 +1、`indexUpdated` 语义均通过。
- P-C6：`commitFailurePaths.test.ts` 12/12（含真实只读磁盘用例）；备份内容/meta/位置、`BACKUP_FAILED`、`SAVE_ROLLBACK_FAILED`、`TARGET_CHANGED`、`TARGET_VANISHED` 全部通过。
- 前后端契约：`CommitRecipeResult` 的 `backupCreated`、`indexUpdated`、`indexWarning` 均有测试覆盖。

## 7. 未验证 / 剩余风险

1. **跨平台文件系统**：只验证 Windows/NTFS；POSIX 的 rename/权限语义未验证。
2. **文件锁 / TOCTOU**：rename 前的 `guard` 已收窄窗口，但「校验→rename」仍非原子；未实现文件锁。
3. **真实 ACL 拒绝**：只验证「只读属性」（`chmod 0444`），未构造「目录无写权限」。
4. **备份清理**：未实现（按约束），目录会持续增长。
5. **冷启动 117–127s 超规格**：P-C4 已记录，属独立性能任务，本轮未处理。
6. **多实例并发**：同一配方被两个应用实例同时提交未验证（无单实例锁验证记录）。
7. **`openRecipe` 错误文案含绝对路径**（O1）。

## 8. MVP-ready 判定

**建议判定为 MVP-ready（限 3 种试点类型 + 白名单开启）。** 依据：

- 核心链路「打开 → 编辑 → 预览 → 取消/提交 → 重开」在真实 Electron 中全部通过，且提交内容与磁盘一致。
- 冲突三种处理路径均有真实 UI 证据，外部删除/外部改写不会被静默覆盖或复活。
- 写入失败（含真实只读磁盘）保留草稿、不误报成功、不污染索引。
- 未建模字段与 conditions 在编辑后逐值保留。
- 白名单关闭可完全回退旧路径。
- 全量 527 条测试、类型检查、Lint、构建均通过。

保留意见：备份清理、跨平台、冷启动性能、并发多实例为已知未覆盖项，不阻塞 MVP，但需在更大范围推广前处理。

## 9. 后续事项清单（不建议自动开始）

| 编号 | 事项 | 依赖 |
| --- | --- | --- |
| F1 | 备份清理策略（最近 N 份 / N 天，含 meta 同步清理） | 无 |
| F2 | 跨平台文件系统验证（Linux/macOS：rename、权限、行分隔） | 需 CI 或第二台机器 |
| F3 | 冷启动扫描 117–127s → 目标 ≤90s | 独立性能任务 |
| F4 | 提交期间的文件锁 / TOCTOU 彻底解决 | 设计变更，需评审 |
| F5 | 多实例并发提交保护 | 设计变更，需评审 |
| F6 | 统一错误文案的路径展示策略（绝对 vs 相对） | 小改动 |
| F7 | 「另存副本」的文件命名与清理策略 | 小改动 |
