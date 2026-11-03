# P-C5 提交后的索引与缓存一致性

日期：2026-10-31
范围：只处理「提交成功之后，内存索引 / 查询 / 缓存 / 重启」的一致性与状态回报。
未改扫描算法、未调阈值、未重构缓存系统、未清空任何缓存、未动 schema 与代码生成。

## 1. 实施前审查：真实调用链

```
渲染端 提交按钮
  → commitBridge.submitDraft()
  → IPC 'recipes:commit'
  → commitRecipe()                     ← 主进程，独立复核基线/安全/写盘/回读
       readFullRecipe(当前原始) → rawHash 比对 → schema 复核 → 反向序列化
       writeAtomic(临时文件 + fsync + rename)
       回读 + JSON.parse + canonical 比对（失败回滚并抛 SAVE_VERIFY_FAILED）
       ↓ 写盘成功后
       replaceRecipeByRecipeId(recipeId, savedRecord)   // 覆盖：替换生效项
         └ buildIndex(records)                          // 倒排表 byOutput/byInput 全量重建
       addRecipeRecord(savedRecord)                     // 另存副本：追加
       → 返回 CommitRecipeResult（含从磁盘回读的 opened）
  → applyCommitted()：用 opened 重建草稿，dirty=0
```

查询与重开分别走哪里：

| 入口 | 数据来源 | 提交后表现 |
| --- | --- | --- |
| `recipes:byOutput` / `byInput` | 内存倒排索引（`recipeIndex`） | 重建后立即返回新记录（新 uid = `file:<绝对路径>`） |
| `recipes:full` | `lookup(uid)` → `readFullRecipe` → **磁盘** | 新 uid 读到的就是刚写入的文件 |
| 工作台重新打开 | `recipes:open` → `readFullRecipe` → `normalizeRecipe` | 同上，预览等于磁盘内容 |
| 顶栏 / 设置页统计 | `modpack/state.getCurrentSummary().recipes` | **原本不会更新**（见 2.1） |
| 重启 | `loadFromCache`（读 `recipes.json`）或 `scanRecipes` 重扫 | 由缓存签名决定（见 2.2） |

缓存签名与失效（既有实现，本轮只核对不改）：

- `computeModsSignature(modsDir)`：jar 数量 + 总字节 + 最大 mtime。
- `computeExtrasSignature(modpackPath)`：`kubejs/server_scripts`、**`kubejs/data`**、`config/openloader/data`、`datapacks` 四处的「文件数 + 总字节 + 最大 mtime」。
- `isCacheValid(..., { requiredPhases, extras })`：只有 `requiredPhases` 含 `recipes` 时才比对 `extras`；物品阶段只依赖 mods 签名。

## 2. 已确认的问题与根因

### 2.1 摘要统计不刷新（确认，A 类）

`scanOrchestrator` 在扫描结束时 `setCurrentSummary(...)` 写入配方总数/类型数/partial。
提交只替换了索引，**没有回写摘要**，于是顶栏与设置页继续显示提交前的配方统计（另存副本时条数也不 +1）。这是「UI 成功 ≠ 数据一致」的具体表现。

### 2.2 索引更新失败被静默吞掉（确认，A 类）

原实现对索引更新只有 `try { ... } catch { logger.error(...) }`，IPC 仍返回成功、渲染端仍显示「已保存」。
若索引恰好处于不可写状态（例如重建时抛错），用户会得到「保存成功」但查询仍是旧数据，且没有任何提示。

### 2.3 重启策略：本来就只需重扫配方阶段（核对结论，非缺陷）

提交写入的是 `kubejs/data/**`，它参与 `computeExtrasSignature`，因此：

- 物品缓存判定只要求 `['items']` → **仍然命中**（不重扫 4 万物品）；
- 完整缓存判定要求 `['items','recipes']` + extras → **失效**，配方阶段重扫。

也就是说既有设计已经做到了「最小范围失效」，**不需要清空缓存、也不需要改缓存系统**；代价是每次提交后首次启动要重扫配方（实测 6.7s）。本轮把这个行为用真实测试固定下来，而不是靠推测。

## 3. 最小修复（只改 4 个文件）

| 文件 | 改动 |
| --- | --- |
| `src/main/modpack/state.ts` | 新增 `patchSummaryRecipes(recipes)`：只替换摘要里的 `recipes`，物品数/图标率/耗时原样保留 |
| `src/main/recipes/commitRecipe.ts` | 写盘成功后：① 更新索引；② 用 `stats()` 刷新摘要；③ 全过程用 `indexUpdated` / `indexWarning` 显式回报，失败不再静默 |
| `src/shared/ipc.ts` | `CommitRecipeResult` 增加 `indexUpdated: boolean`、可选 `indexWarning?: string` |
| `src/renderer/src/store/commitBridge.ts` | `indexUpdated=false` 时：toast 警告 + 日志 + 草稿面板持久 warn banner（提示重新扫描）；成功时不显示该 banner |

没有新增缓存写入路径（不重写 `recipes.json`、不动 `meta`），也没有任何「兜底清空缓存」。

## 4. 测试矩阵（按测试类型分开）

| 类型 | 文件 | 覆盖 |
| --- | --- | --- |
| 纯函数/单元 | `tests/renderer/commitBridge.test.ts`（6） | 提交编排：成功重建干净草稿；`SAVE_FAILED` 保留 dirty；冲突挂起；`indexUpdated=false` 时出现 warn banner；unsafe/无修改/重复提交前置拒绝 |
| 集成（真实文件系统 + 真实 index/cache/scan 模块） | `tests/main/commitIndexCache.test.ts`（5） | ①覆盖提交后索引替换、按产物查询、`recipes:full`、`recipes:open` 都读到新内容、摘要同步；②另存副本 `total+1`；③索引更新失败显式回报且文件仍在；④摘要刷新只动 recipes；⑤重启策略：extras 变化→items 仍命中、整份失效；重扫结果包含已提交内容 |
| 真实 Electron（两阶段跨进程） | `.cache/e2e-pc5.mjs` PHASE=commit / PHASE=verify | 冷启动提交、**连续两次提交**、提交后立即查询/重开、进程退出后重启、重启后重开与查询、重启后冲突检测 |

真实文件系统这一点需要说明：集成测试里 `commitRecipe` 的写盘、回读、索引、`meta.json`/`items.json`/`recipes.json` 全部落在临时整合包目录的**真实文件**上；只有「原始 JSON 来源」与「schema 选择」两处按需注入，避免依赖真实 jar。

## 5. 证据

### 5.1 提交后立即生效（真实 Electron，1112 副本）

```
[step] bootstrap done {"cacheHit":true,"itemsMs":101,"recipesMs":136}
"firstSavedPattern": ["I#I","IBI","PPP"]        ← grid[4]=emerald
"firstSavedB": {"item":"minecraft:emerald","count":1}
"queryIncludesCommitted": true
"querySources": ["minecraft:crafting_shaped ← module_acid_rain_proof_unit.json"]
"fullPattern": ["I#I","IBI","PPP"]              ← recipes:full 读磁盘
```

连续两次提交同一配方（先改中心格，再改左上格）：

```
"secondSavedPattern": ["A#I","IBI","PPP"]
"secondHasBothEdits": true                      ← 两次编辑都在
"conditionsKept": true                          ← 未建模字段逐值保留
"uiErrors": []
```

### 5.2 重启后（新进程，同一缓存目录）

```
"scanWallMs": 7311
"itemsCacheHit": true, "itemsMs": 85            ← 物品不重扫
"recipesMs": 6705                               ← 配方阶段重扫（extras 变化）
"recipeTotal": 32890, "recipeTypes": 426, "recipePartial": 5334
"fileOnDiskMatchesSaved": true
"reopenedMatchesFile": true, "reopenedDirtyZero": true
"patternAfterRestart": ["A#I","IBI","PPP"]      ← 重启后打开就是提交版本
"queryAfterRestartIncludesCommitted": true
```

### 5.3 重启后冲突检测仍然有效

```
"conflictAfterRestart": true        ← 外部改写文件后提交被拒
"externalFileKept": true            ← 外部版本未被覆盖
"cancelKeptExternal": true          ← 取消不写盘
```

### 5.4 写入失败：保留草稿、不误报

由 `commitBridge.test.ts`（`SAVE_FAILED` 保留 dirty / 不写 lastCommit）与 `commitRecipe.test.ts`（`SAVE_FAILED` / `SAVE_VERIFY_FAILED` 回滚、不更新索引）覆盖；本轮改动后仍然全绿。

## 6. 命令与真实退出码

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `vitest run` | 0 | **48 文件通过 / 2 跳过；514 通过 / 4 跳过** |
| `vitest run tests/main/commitIndexCache.test.ts` | 0 | 5/5 |
| `vitest run tests/renderer/commitBridge.test.ts` | 0 | 6/6 |
| `PHASE=commit node .cache/e2e-pc5.mjs` | 0 | 见 5.1；`uiErrors: []` |
| `PHASE=verify node .cache/e2e-pc5.mjs` | 0 | 见 5.2/5.3；`uiErrors: []` |
| `electron-vite build` | 0 | — |

## 7. 是否仍需重新扫描（结论与代价）

- 提交后**同一会话**：不需要重扫，索引与查询立刻一致。
- 提交后**重启**：物品阶段命中缓存（实测 85ms），配方阶段需要重扫（实测 6.7s），原因是 `kubejs/data` 参与 extras 签名。
- 若将来要消掉这 6.7s，可以只做「增量更新 recipes.json + 同步 meta.extras」，但这会新增一条缓存写入路径，本轮按「最小失效」原则**未做**，等有明确需求再评估。

## 8. 基线回归

| 指标 | 提交前（同一副本扫描） | 提交+重启后 |
| --- | --- | --- |
| 物品 | 43,474 | 43,474（不重扫） |
| 图标 | 38,760（89.2%） | 38,760（89.2%） |
| 配方 | 32,890 | **32,890** |
| 类型 | 426 | **426** |
| partial | 5,334 | **5,334** |

覆盖提交不改变计数；另存副本使 `total +1`（集成测试断言）。

## 9. 已知限制 / 未运行

- 索引更新失败路径用**注入异常**模拟（`upsertIndex` 抛错），未在真实磁盘只读条件下触发；真实只读失败属 P-C6 范围。
- 未验证「提交后立刻强制重建索引（rebuild=true）」与提交并发的情形（当前没有并发入口）。
- `recipes:full` 对**旧 uid**（被覆盖前的 `jar:...`）会报「配方不在索引中」，这是覆盖语义的结果，未额外保留别名；已在集成测试中记录该行为。
- 另存副本的**真实 UI 点击**在本阶段仍未运行（与 P-C3 相同限制），其索引/摘要一致性由集成测试覆盖。
- 未在第二台机器/CI 上验证；本轮机器同 P-C4。
