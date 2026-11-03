# P-C6 写入失败、备份与回滚可靠性

日期：2026-10-31
范围：只加固提交的异常路径（备份 / 替换 / 回滚 / 错误语义）。未改 schema、规范化、未知字段策略、代码生成、扫描与缓存写入路径。

## 0. 开工前核对

- 本工作区**不是 Git 仓库**（无 `.git`），无法用 `git diff` 核对；改用文件时间戳核对：`src/`、`tests/` 下 16:00 之后没有任何改动，确认没有其他 Agent 的未提交修改。
- 未执行任何 Git 操作。
- 已保留：rawHash/schema 冲突保护、临时文件 + rename、回读校验、dirty 草稿保护、未知字段保留。

## 1. 现状流程与错误路径（实施前）

```
target 已存在? ──否──> 直接 tmp 写入 + rename
      │
      是
      ▼
previous = readText(target)          （原内容只存在内存里，没有落盘备份）
hash(previous) == 基线? ──否──> CONFLICT（不动文件）
      │是
      ▼
writeAtomic: tmp(wx) → write → fsync → close → rename
      │失败
      ▼
SAVE_FAILED（未区分「临时文件创建/写入/rename」）
      │成功
      ▼
readBack = readText(target) → parse → canonical 比较
      │不一致
      ▼
rollback(): 有 previous 则写回，否则删除
      │rollback 失败
      ▼
仅 logger.error，对外仍抛 SAVE_VERIFY_FAILED   ← 状态不确定却与「已回滚」同码
```

## 2. 确认的缺陷（改代码前）

| # | 缺陷 | 后果 |
| --- | --- | --- |
| D1 | 覆盖已有文件**没有任何落盘备份**，原内容只在内存 | 进程崩溃 / 回滚失败 / 用户误操作后无法恢复原文 |
| D2 | 没有「备份失败 → 中止覆盖」的路径 | 无法保证「先有退路再覆盖」 |
| D3 | 回滚失败与回滚成功共用 `SAVE_VERIFY_FAILED` | 前端无法区分「已回到原状」与「状态不确定」 |
| D4 | `SAVE_FAILED` 消息直接拼 `err.message`（含绝对路径） | UI/日志暴露本地绝对路径 |
| D5 | 回读时目标被外部删除 → 走 rollback → 用 previous **重建**文件 | 外部删除被失败恢复流程「复活」 |
| D6 | rename 之前没有二次确认 | 读原文件与 rename 之间被外部改写时，外部内容被静默覆盖 |

## 3. 本轮改动

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/main/recipes/backup.ts`（新增） | `backupOriginalFile()`：内容 + `.meta.json`（target/sha256/bytes/at/modpackPath），两者都走 tmp+rename，`wx` 占位不覆盖旧备份 | 解决 D1/D2 |
| `src/main/paths.ts` | 新增 `recipeBackupDir` / `ensureRecipeBackupDir` → `<userData>/recipe-backups/<modpackHash>` | 备份**不能**放 `kubejs/data/**`（会被扫描当成新配方） |
| `src/main/recipes/commitRecipe.ts` | ① 覆盖前备份，失败即 `BACKUP_FAILED` 且不写盘；② `writeAtomic` 增加 `guard`，rename 前重读目标校验（`TARGET_CHANGED`）；③ 回滚返回结果，失败升级为 `SAVE_ROLLBACK_FAILED`；④ 回读时目标消失且原本存在 → `TARGET_VANISHED`（不复活）；⑤ 错误消息只带 modpack 相对路径与错误码 | D2–D6 |
| `src/shared/ipc.ts` | `CommitRecipeResult` 增加 `backupCreated: boolean` | 让前端/日志能判断本次是否产生备份 |
| `src/renderer/src/store/commitBridge.ts` | 新增 `FAILURE_HINTS`：`BACKUP_FAILED` / `SAVE_ROLLBACK_FAILED` / `TARGET_VANISHED` / `TARGET_CHANGED` / `SAVE_FAILED` / `SAVE_VERIFY_FAILED` 各自给出「下一步该做什么」；日志带 `[code]`；草稿与 dirty 一律保留 | 错误语义可区分、可操作 |

新增错误码（IPC 原样透传）：

| 码 | 含义 | 文件状态 |
| --- | --- | --- |
| `BACKUP_FAILED` | 覆盖前备份失败 | 未写盘，原文件完好 |
| `TARGET_CHANGED` | rename 前发现目标被外部改动 | 未覆盖，外部内容保留 |
| `TARGET_VANISHED` | 回读时目标已被外部删除 | 保持删除，不复活 |
| `SAVE_ROLLBACK_FAILED` | 回读失败且回滚失败 | **不确定**，消息给出相对路径与备份名 |

## 4. 故障注入矩阵（预期 vs 实际）

| 故障点 | 注入方式 | 预期 | 实际（测试） |
| --- | --- | --- | --- |
| 备份失败 | `backup` 抛 EACCES | `BACKUP_FAILED`、不写盘、原文不变、索引不动 | ✅ |
| 同一秒重复备份 | 固定 `now` 调 2 次 | 两个不同文件、内容都等于原文 | ✅ |
| 临时文件写入/rename 失败 | `writeAtomic` 抛 EPERM | `SAVE_FAILED`、原文不变、无索引更新、消息无绝对路径 | ✅ |
| 真实只读目标（磁盘行为） | `chmod 0444` 后提交 | `SAVE_FAILED`（本机实测 rename EPERM）、原文不变、无 `.tmp` 残留 | ✅ |
| 回读不一致 + 回滚成功 | 篡改第 3 次读取 | `SAVE_VERIFY_FAILED`、目标恢复原文 | ✅ |
| 回读不一致 + 回滚失败 | 篡改读取 + 第二次写入抛 EBUSY | `SAVE_ROLLBACK_FAILED`、消息含「状态不确定」/相对路径/备份名 | ✅ |
| 写入过程中外部改写 | 第 2 次读取写入外部内容并返回 | `TARGET_CHANGED`、外部内容保留 | ✅ |
| 回读时外部删除 | 第 3 次读取前删除目标 | `TARGET_VANISHED`、不调用 remove、文件保持不存在 | ✅ |
| 提交前基线已变 | 先改文件再提交 | `CONFLICT`、不写盘 | ✅ |
| 新建文件 | jar 源（目标不存在） | 成功、`backupCreated=false`、不产生备份目录 | ✅ |

## 5. 数据保护证据

- 备份内容：与原文逐字节相同；`.meta.json` 的 `target` 等于目标绝对路径，`bytes` 与实际文件长度一致。
- 备份位置：`<userData>/recipe-backups/<modpackHash>/`；测试断言其路径**不以整合包目录开头**，因此不会被 `kubejs/data` 扫描当成配方。
- 真实 Electron 运行（1112 副本）：第一次提交是新建文件（无备份），第二次覆盖产生 1 份备份：
  ```
  recipe-backups/d412cc3ebb7a5ce0/module_acid_rain_proof_unit.json.20261031-174413.e8e878
  .../module_acid_rain_proof_unit.json.20261031-174413.e8e878.meta.json
  meta.target = E:\mc kjs\.cache\pc5-pack-1112\kubejs\data\...\module_acid_rain_proof_unit.json
  ```
- 草稿与 dirty：所有失败码在渲染端都保留 `dirtyFields`、不写 `lastCommit`（`commitBridge.test.ts`）。
- 索引：任何失败路径都不调用 `upsertIndex`、不改摘要。

## 6. 前端提示（新增）

| 码 | 提示要点 |
| --- | --- |
| `BACKUP_FAILED` | 未写入任何内容，原文件未被改动；可重试或取消 |
| `SAVE_ROLLBACK_FAILED` | 目标状态不确定，先检查该配方文件再决定是否重试（有备份） |
| `TARGET_VANISHED` | 被外部删除，已保持删除状态；重新打开配方 |
| `TARGET_CHANGED` | 写入前被外部修改，已放弃覆盖；重新打开后再改 |
| `SAVE_FAILED` | 未写入目标文件；草稿保留，可重试 |
| `SAVE_VERIFY_FAILED` | 已回滚到提交前内容；草稿保留 |

## 7. 命令与真实结果

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `electron-vite build` | 0 | — |
| `vitest run tests/main/commitFailurePaths.test.ts` | 0 | **12/12**（含真实只读磁盘用例） |
| `vitest run tests/main/commitRecipe.test.ts` | 0 | 11/11（已补 electron mock 与读取计数） |
| `vitest run tests/renderer/commitBridge.test.ts` | 0 | 7/7 |
| `vitest run`（全量） | 0 | **49 文件通过 / 2 跳过；527 通过 / 4 跳过** |
| `PHASE=commit node .cache/e2e-pc5.mjs` | 0 | 两次提交、查询/重开一致、`uiErrors: []` |
| `PHASE=verify node .cache/e2e-pc5.mjs` | 0 | items 缓存命中 161ms + recipes 重扫 7,758ms；重开/查询一致；`conflictAfterRestart: true`；外部改动未被覆盖 |

## 8. 未验证 / 限制

1. **备份无清理策略**：每次覆盖产生一份备份（含 meta），只增不减。清理策略属新范围，本轮按约束未做；建议后续单列任务（按数量/天数保留最近 N 份）。
2. **真实 ACL 拒绝未验证**：只读属性（Windows `chmod 0444`）已真实复现 rename EPERM；「目录无写权限 / 没有管理员权限」的 ACL 场景未构造。
3. **备份目录可写性未做真实只读验证**：`BACKUP_FAILED` 用注入异常验证。
4. **跨平台**：rename 覆盖语义只在 Windows/NTFS 实测（可覆盖普通文件、只读文件 EPERM）；POSIX 未验证，语义假设「同目录 rename 原子替换」。
5. **外部修改的 TOCTOU 窗口**：已把校验挪到 rename 之前，但 rename 本身与其前一刻仍非原子；极端情况下外部写入仍可能被覆盖（窗口为一个 rename 调用）。这是平台限制，未做文件锁。
6. **`TARGET_VANISHED` 语义**：目标被外部删除时不恢复旧文件；若用户希望「外部删除也不影响我的提交」，需另议策略。
7. 备份文件所在 userData 由 `app.getPath('userData')` 决定，迁移/便携模式未验证。
