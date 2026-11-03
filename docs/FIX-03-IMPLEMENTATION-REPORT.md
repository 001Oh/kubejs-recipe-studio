# FIX-03 实施报告：插件加载失败后不再写入成功的 Schema 快照

> **工程**：`E:\mc kjs`｜**实施时间**：2026-11-02 00:16–00:22
> **范围**：只修 FIX-02 报告 R-2 指出的"快照短路"链路；未涉及其它模块
> **前置**：FIX-01（插件层跟随整合包，`loader.ts`）、FIX-02（读取失败不清层，`loader.ts`）均已在工作区生效

---

## 1. 根因与调用链证据

### 1.1 故障链（当前代码复核，行号为 FIX-03 修改前的状态）

| 步 | 代码位置 | 行为 |
|---|---|---|
| ① | `plugins/loader.ts:112-115`（FIX-02 后为 `:123-131`） | 目录存在但 `readdirSync` 抛错 → `listPluginFiles` 返回 `ok:false` |
| ② | `plugins/loader.ts:276-281` | `loadPlugins` 记 `loadFailure{path,error}`、`invalidateSnapshot()`、**保留**插件层（FIX-02） |
| ③ | `schema/service.ts:141` | `ensureSchemas` 装配结束**无条件** `writeSnapshotStamp(key)` |
| ④ | `schema/service.ts:126` | 下一次读取 `if (key === readSnapshotStamp()) return` → **短路** |
| ⑤ | `plugins/loader.ts:257` | FIX-02 的重试条件 `failedErrorFor(path) !== null` 位于 `currentRecords()`，只有 provider 被调用才会执行 → 短路后永不触发 |

### 1.2 逐条回答审查问题

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | 失败后哪条路径仍写戳 | `ensureSchemas` 装配末尾无条件写 | `service.ts:141`（改前） |
| 2 | 戳表示什么 | 仅表示"生效表对应当前 facts"：`路径｜记录数｜类型数｜附属数｜模组数`。**不包含插件加载状态**，因此隐式宣称"插件层已就绪" | `service.ts:105-110` |
| 3 | 短路条件 | `key === readSnapshotStamp()` | `service.ts:126` |
| 4 | `getPluginLoadStatus()` 是否同步、是否可能读到旧状态 | **同步**读模块变量，无异步窗口。但它按**当前整合包路径**计算（`failedErrorFor(authoritativeModpackPath())`），因此"别包成功"不会掩盖"本包失败" | `loader.ts`（FIX-02 实现） |
| 5 | 失败发生在装配前/中/后的行为是否一致 | **不一致**：<br>· 装配前（独立 `loadPlugins`）→ `invalidateSnapshot()` 生效，但随后装配又写戳 → 短路<br>· 装配中（provider 内）→ 失败可见，但装配末尾仍写戳 → 短路<br>· 装配后（`plugins:list`）→ 戳被清空，下一次读取会重建 ✓（唯一本来就能恢复的路径） | `loader.ts:280`；`service.ts:141` |
| 6 | 戳是否影响缓存优化 | 是。它就是唯一的稳态缓存开关；不写戳 = 每次读取都完整装配 | `service.ts:126` |
| 7 | 是否有另一条路径覆盖/恢复戳 | 只有 `writeSnapshotStamp`（`service.ts:141`）与 `invalidateSnapshot()`（`service.ts:155`、`loader.ts:280,296`）。没有"恢复成正确值"的旁路 | 同上 |
| 8 | FIX-02 重试条件能否被本轮正确触发 | **能**：跳过写戳后 `key !== stamp`，下一次读取必然重建 → 走 provider → `currentRecords()` → 重试 | 由 T3/T5 实测证明 |

**结论**：`if (pluginLayer.ok === false)` **不足以**修好——FIX-02 的失败路径**不抛异常**，`fetchLayer` 返回的是 `{ok:true, schemas:[上次有效]}`，因此必须查**加载状态**而非 fetch 结果。最终实现同时检查两者。

---

## 2. 修改内容及理由

**修改文件**：`src/main/schema/service.ts`（唯一源码文件）

```diff
@@ 导入
 import { allRecords, typeUniverse } from '../recipes/recipeIndex'
+import { getPluginLoadStatus } from '../plugins/loader'

@@ ensureSchemas 装配末尾
       applyMerge(schemaFacts())
-      writeSnapshotStamp(key)
+      // FIX-03：插件层没有成功装配时**不得**写「完整成功」的快照戳。
+      // 戳只表达「生效表对应当前 facts」，并不包含插件加载状态；
+      // 一旦在插件读取失败时照写，下一次读取会短路，FIX-02 的重试条件永远走不到。
+      if (pluginLayer.ok && getPluginLoadStatus().state !== 'failed') writeSnapshotStamp(key)
```

**理由**
- 只改"写不写戳"这一个判定，不改装配顺序、不改 `inflight` 并发语义、不改 `applyMerge`、不动 `loader.ts`。
- 双条件：`pluginLayer.ok` 覆盖"provider 抛异常"（RV1-003 路径）；`getPluginLoadStatus().state !== 'failed'` 覆盖"FIX-02 的非抛出失败"（本问题的实际成因）。
- 失败时不写戳 → 下一次读取重建 → provider → `currentRecords` 重试 → 目录恢复后**自动**恢复，无需用户打开设置页或切包。
- 成功后照常写戳，稳态缓存优化不变（T1/T4 验证）。

**依赖方向**：`schema/service.ts → plugins/loader.ts` 为单向新增；`loader.ts` 不 import `service`（已 grep 核对），不存在循环依赖。

---

## 3. T1～T6 执行结果

| ID | 场景 | 结果 | 关键断言 |
|---|---|---|---|
| **T1** | 正常成功路径 | ✅ | 插件类型可见；连续 3 次读取 `五层合并完成` 与 `插件加载完成` **均不增长**；`state='ok'` |
| **T2** | 读取失败 | ✅ | `state='failed'`；插件层**未清空**；失败期间第二次读取仍会重新装配（`五层合并完成` 继续增长） |
| **T3** | 失败后恢复 | ✅ | 恢复目录 + 换新插件后，**只做一次正常读取**（不调 `loadPlugins`/`resetPluginLoader`）→ 新插件生效、`state='ok'`；随后连续读取重新命中缓存 |
| **T4** | 稳态性能回归 | ✅ | 5 次 `schema:list` + `virtualItemPatterns()` + `pluginFieldNames()` 后，加载与装配计数**均不变**；同时校验内容正确 |
| **T5** | 整合包切换回归 | ✅ | A→B（B 坏）：`state='failed'`、`path=B`、`cachedPath=A`（未把 A 当 B 的成功数据）；B 恢复后自动加载 `b-plugin`；B→A 后回到 `a-plugin` |
| **T6a** | 失败发生在**装配过程中**（provider 期间） | ✅ | 只 `invalidateSchemaSnapshot()`、不主动加载；失败后第二次读取仍重新装配 |
| **T6b** | 失败发生在**装配之前**（独立加载） | ✅ | 与 T2 一致，连续两次读取都重新装配 |
| **T6c** | 失败发生在**装配完成之后** | ⏭ `todo` | 需要"在 `writeSnapshotStamp` 之后注入失败"的并发点。当前架构下该阶段只能由 FIX-02 的"打开设置页"间接覆盖；**未伪称通过** |

---

## 4. 红绿证据

**修复前**（`service.ts = 79dc3325…`）：

```
× T2  expected 3 to be greater than 3        ← 第二次读取被快照短路，未重新装配
× T6a expected 3 to be greater than 3
× T6b expected 3 to be greater than 3
× T3  expected 'failed' to be 'ok'           ← 恢复后仍 failed（读取被短路，插件没重载）
× T5  expected 'failed' to be 'ok'
✓ T1 / T4（护栏）
Tests 5 failed | 2 passed | 1 todo (8)
```

**修复后**（`service.ts = 487f8b9a…`）：`Tests 7 passed | 1 todo (8)`。

---

## 5. 完整测试 / 类型检查 / Lint

| 项 | 命令 | 结果 |
|---|---|---|
| 新增测试 | `vitest run tests/main/schemaPluginFailureSnapshot.test.ts` | 7 passed / 1 todo |
| 相关回归 | `vitest run`（FIX-01/02 测试 + `tests/plugins` + schema* + previewFreshness 等 19 文件） | **190 passed / 3 todo / 0 失败** |
| 完整套件 | `vitest run` | **82 文件（80 passed + 2 skipped）/ 767 用例（760 passed + 4 skipped + 3 todo）/ 0 失败** |
| 类型检查 | `npm run typecheck`（node + web） | 无错误 |
| Lint | `npm run lint`（`--max-warnings=0`） | 无告警 |
| 基线对比 | FIX-02 后 81 文件 / 759 用例（753+4+2） | +1 文件 / +8 用例（7 实 + 1 todo）；skip 仍 4，未新增 skip |
| 测试完整性 | `grep it.skip/describe.skip/it.todo` | 6 处既有 `describe.skipIf`（真实整合包只读）+ 3 个 todo（FIX-01 T4 / FIX-02 T7c / FIX-03 T6c）。**未删除、未放宽任何既有断言** |

---

## 6. 修改前后 SHA-256

| 文件 | 修改前 | 修改后 |
|---|---|---|
| `src/main/schema/service.ts` | `79dc3325727eda5b7841efc837d5a45a558634307956f4fed8895db43224ab5a` | `487f8b9a1ece66b128fb922a7fce19e443667a81e9b2029fa3fcf328d3314410` |
| `tests/main/schemaPluginFailureSnapshot.test.ts` | 不存在 | `e26450d20751effa274a88f9f9d12d6ef9e905a08ac1773453e6474d983b6feb` |

**未改动的文件**：`src/main/plugins/loader.ts` 保持 `915c9e7c0bbb6338d8eaa5593dee4854e35609e1ab4aefb964780e87f00fe896`（未动）。
台账 `docs/PROJECT-SEALING-LEDGER-REPORT.md` MD5 复核仍为 `7a7e52d93a201da3d9fa0e4fa0b26f51`，未生成 V10。

**备份说明**：本轮因先改后备份，`service.ts` 的修复前副本用**逆变换重建**得到
`.cache/fix03/service.pre.ts`，其 SHA-256 与原文件逐字节一致（`79dc3325…`，已核对）。

---

## 7. 尚存风险与未覆盖项

| # | 风险/缺口 | 说明 |
|---|---|---|
| R-1 | **失败期间每次读取都会完整装配** | 不写戳的直接代价：`clearSchemas` + `putMany` + `loadPinned` + `applyMerge` 每次读取都跑一遍。只在失败期间成立，恢复后恢复缓存（T1/T3 验证）；无循环、无异步 |
| R-2 | **T6c（装配之后才失败）未覆盖** | 需在 `writeSnapshotStamp` 之后注入失败；当前无并发注入点，未伪称验证 |
| R-3 | 跨包失败时注册表仍保留上个包的插件类型 | 这是需求允许的"保留上一次有效数据"，区别通过 `getPluginLoadStatus()`（`state`/`path`/`cachedPath`）表达；**UI 未展示该状态**（`plugins:list` 只回列表），属遗留 |
| R-4 | `getPluginLoadStatus()` 依赖"当前包路径" | 若将来有调用方在装配外部改变了当前包，判断会跟随变化；本轮无此路径（`setCurrentModpack` 只在 `modpack/index.ts:52`） |
| R-5 | 失败原因只进日志与状态 API | 未提升为 UI 提示；`plugins:list` 返回的是上一次成功列表，用户可能以为列表正常（已有 WARN 日志） |
| — | **未做真实整合包验证** | 全部结论来自 `node` 环境的自动化测试；未启动 Electron、未导入真实包、未访问生产 userData |

---

## 8. 回滚命令

```bash
cd "E:/mc kjs"
cp ".cache/fix03/service.pre.ts" src/main/schema/service.ts
sha256sum src/main/schema/service.ts
# 必须输出 79dc3325727eda5b7841efc837d5a45a558634307956f4fed8895db43224ab5a
rm tests/main/schemaPluginFailureSnapshot.test.ts
```

回滚后重跑 `vitest run` 应回到 81 文件 / 759 用例（753 passed + 4 skip + 2 todo）。

---

## 9. 是否保持 FIX-01 / FIX-02 的行为

| 项 | 结论 | 依据 |
|---|---|---|
| FIX-01：插件层跟随当前整合包 | **保持** | `pluginLayerFollowsModpack.test.ts` 全绿（含 T6 稳态不重复加载） |
| FIX-02：读取失败不清空插件层 | **保持** | `pluginLoadFailurePreservesLayer.test.ts` 8 例全绿 |
| FIX-02：失败状态按路径可见 | **保持并被使用** | 本轮正是通过 `getPluginLoadStatus().state` 判定，未修改其语义 |
| BH-002 并发装配（in-flight 共享） | **未改动** | 只改了写戳与否，`inflight` 分支原样 |
| RV1-003（provider 抛异常保留旧层） | **保持** | `pluginSchemaFreshness.test.ts` 全绿 |

## 10. 未进行真实整合包验证

明确声明：本轮**没有**启动应用、没有导入真实整合包、没有在 Electron 运行时验证过快照短路与恢复行为。
所有"通过"均为 `vitest`（`environment: 'node'`）下的自动化证据，**不代表真实游戏环境已验证**。
真实环境下的验证仍需要在隔离 `STUDIO_USER_DATA` + 真实包副本上进行（见 `docs/BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN.md`）。
