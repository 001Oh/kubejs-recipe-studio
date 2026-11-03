# 回滚材料清单与可恢复性核查（PROJECT ROLLBACK MANIFEST）

> **任务**：T-02｜**批次**：第 02 批｜**时间**：2026-11-02 00:44
> **本批任务书预期文件名**：`PROJECT-ROLLBACK-INVENTORY.md`。**实际采用总计划 §7.1 命名**（计划为唯一依据），别名对照见 §0。
> **边界**：全程只读。**未清理、未覆盖、未移动任何备份；未执行任何恢复动作**（覆盖源码需单独授权）。

---

## 0. 命名对照（计划 vs 本批任务书）

| 任务 | 总计划 §7.1 命名（**采用**） | 本批任务书预期名 |
|---|---|---|
| T-02 | `docs/PROJECT-ROLLBACK-MANIFEST.md` | `docs/PROJECT-ROLLBACK-INVENTORY.md` |
| T-04 | `docs/LEDGER-V9-ERRATA.md` | `docs/PROJECT-V9-ERRATA.md` |
| T-04b | `docs/DOCS-INDEX.md` | `docs/PROJECT-DOCUMENT-INDEX.md` |
| T-12 | `docs/PROJECT-DECISIONS.md` | `docs/PROJECT-DECISIONS.md`（一致） |

> 依据：本批任务书 §5「实际路径和命名以总计划为准」。已核对 8 个候选名均**不存在同名文件**（无覆盖风险）。

---

## 1. 方法与判据（先定口径）

| 判据 | 本文件如何满足 |
|---|---|
| 路径存在 ≠ 备份完整 | 每项都给出**大小 + SHA-256 + 对应原文件**，并注明"是否与已知状态哈希一致" |
| 哈希相同 ≠ 恢复已验证 | 单列 §5「恢复演练状态」，明确标注**均未在本批执行** |
| 不得为验证而覆盖文件 | 本批**未执行任何 `cp` 回源码** |

**校验命令（只读）**：`sha256sum <备份>` 与 `stat -c%s`、`ls -la`。

---

## 2. 代码类回滚材料

### 2.1 三批 FIX 的专用备份（**首选回滚依据**）

| # | 备份路径 | 大小 | SHA-256 | 对应原文件 | 代表的状态 | 与已知哈希的一致性 |
|---|---|---|---|---|---|---|
| C-1 | `.cache/fix01/loader.pre-20261101-233919.ts` | 20,433 B | `cb7d3c85944714926471cf8fd8115fd8c84eba1b18692052aa28ac3c2ecc6151` | `src/main/plugins/loader.ts` | **FIX-01 之前** | ✅ 与 FIX-01 报告记载的基线哈希**完全一致** |
| C-2 | `.cache/fix02/loader.pre-20261101-235657.ts` | 21,608 B | `9d4ec283d8d7b4f3ee97f7a5221aeae3dd0693f10438224d538c7cf1992400e4` | `src/main/plugins/loader.ts` | **FIX-02 之前**（= FIX-01 之后） | ✅ 与 FIX-02 报告记载的修改前哈希**完全一致** |
| C-3 | `.cache/fix02/loader.fixed.ts` | 25,613 B | `915c9e7c0bbb6338d8eaa5593dee4854e35609e1ab4aefb964780e87f00fe896` | `src/main/plugins/loader.ts` | FIX-02 之后 = **当前状态** | ✅ 与**当前** `loader.ts` 哈希一致 |
| C-4 | `.cache/fix03/service.pre.ts` | 8,700 B | `79dc3325727eda5b7841efc837d5a45a558634307956f4fed8895db43224ab5a` | `src/main/schema/service.ts` | **FIX-03 之前** | ✅ 与 FIX-03 报告记载的修改前哈希一致（该副本由**逆变换重建**并经哈希比对证明等价） |
| C-5 | `.cache/fix03/service.current.ts` | 9,334 B | `487f8b9a1ece66b128fb922a7fce19e443667a81e9b2029fa3fcf328d3314410` | `src/main/schema/service.ts` | FIX-03 之后 = **当前状态** | ✅ 与**当前** `service.ts` 哈希一致 |

> **重要**：同一文件存在多代备份时，**较新的较旧**。若要回滚 `loader.ts`：
> - 回到"FIX-01 之前"→ 用 **C-1**；
> - 回到"FIX-02 之前（即保留 FIX-01）"→ 用 **C-2**（**最常用**，因为 FIX-01 已验证有价值）；
> - 回到"FIX-03 之前"→ 用 **C-4**。

### 2.2 历史批次的整目录备份（次选 / 仅作追溯）

| # | 备份路径 | 文件数 | 覆盖文件 | 代表的状态 | 注意 |
|---|---|---|---|---|---|
| C-6 | `.cache/bh03-backup-1532/src/**` | 5 | `main/codegen/preview.ts`(`eb460f12…`)、`main/handlers/recipeHandlers.ts`(`63d0bc83…`)、`main/plugins/loader.ts`(`387fd445…`)、`main/scanner/itemIndex.ts`(`c45a8a93…`)、`shared/search.ts`(`2b3e2b2b…`) | **BUG-HUNT-03 修复之前**（远早于 FIX 系列） | ⚠️ 用它恢复 `loader.ts` 会**同时回退 FIX-01/FIX-02**；仅作追溯，不作首选 |
| C-7 | `.cache/bh02-rv1-fix-backup-0911/**` | 10（8 源 + 2 测试） | `preview.ts`、`itemsHandlers.ts`、`hookSandbox.ts`、`loader.ts`、`selectSchema.ts`、`itemIndex.ts`、`schema/registry.ts`、`schema/service.ts`、`tests/main/schemaMerge.test.ts`、`tests/plugins/hookBlacklist.test.ts` | **BUG-HUNT-02-RV1 修复之前** | 同上，属更早世代 |
| C-8 | `.cache/bh03-preview-fixed.ts` / `.cache/bh03-itemIndex-fixed.ts` | 2 | `preview.ts` / `itemIndex.ts`（**修复版**，非原始版） | BUG-HUNT-03 修复后 | 用于"受控回退取证"时还原修复版；现在已被后续轮次覆盖 |

### 2.3 代码备份的覆盖完整性

| 受改动过的源码（BUG-HUNT/FIX 系列） | 是否有备份 | 备份位置 |
|---|---|---|
| `plugins/loader.ts` | ✅ 三代 | C-1、C-2、C-3（+ C-6/C-7 更早） |
| `schema/service.ts` | ✅ 两代 | C-4、C-5（+ C-7 更早） |
| `schema/registry.ts` | ✅ 早期一份 | C-7 |
| `codegen/preview.ts` | ✅ | C-6、C-7 |
| `handlers/recipeHandlers.ts` | ✅ | C-6 |
| `shared/search.ts` | ✅ | C-6 |
| `scanner/itemIndex.ts` | ✅ | C-6、C-7 |
| `handlers/itemsHandlers.ts`、`plugins/hookSandbox.ts`、`recipes/selectSchema.ts` | ✅ | C-7 |
| 新增测试文件（`tests/main/pluginLayerFollowsModpack.test.ts` 等） | **无需备份**（新增，回滚 = 删除） | — |

> **未覆盖**：`FIX-01/02/03` 之外若有其它源码改动（如 UI-REDESIGN-1、P-C 系列），本清单**未盘点**其备份——那些阶段是否有备份需另查，本文件不推断。

---

## 3. 文档类回滚材料（只列，不评估内容正确性）

| # | 路径模式 | 数量 | 说明 |
|---|---|---|---|
| D-1 | `docs/PROJECT-SEALING-LEDGER-REPORT.pre-*.md` | 9 | 台账 v2→v9 的历史版本（`.pre-revision-0342` 22,568 B … `.pre-v9-0802` 75,415 B） |
| D-2 | `docs/PROJECT-SEALING-COUNT-RECHECK-REPORT.pre-*.md` | 2 | 计数复核报告的历史版本 |
| D-3 | `docs/AUDIT-FULL-01-*.pre-r1-*.md` | 3 | 审计三份在 R1 修订前的版本 |
| D-4 | `.cache/BUG-HUNT-04-PLAN.pre-r1-20261101-162126.md` | 1 | 验证计划 R1 修订前版本（40,001 B，SHA-256 `c7f9f4c1…`） |

> 这些是**文档历史版本**，不参与源码回滚；保留用于"结论可追溯"。

---

## 4. 恢复操作步骤（**未执行**，供后续授权后使用）

### 4.1 通用步骤（无 Git，必须按此顺序）

```bash
cd "E:/mc kjs"
# ① 先确认目标文件当前哈希（防止在错误状态下覆盖）
sha256sum src/main/plugins/loader.ts
# ② 若"当前版本本身有价值"，先另存一份（避免重演 FIX-02 期间"修复版无副本"的风险）
cp src/main/plugins/loader.ts .cache/fix0x/loader.before-rollback-<时间戳>.ts
# ③ 覆盖恢复
cp .cache/fix02/loader.pre-20261101-235657.ts src/main/plugins/loader.ts
# ④ 哈希核对（必须等于备份哈希）
sha256sum src/main/plugins/loader.ts   # 期望 9d4ec283…00e4
```

### 4.2 逐项恢复命令

| 目标 | 命令 | 恢复后期望哈希 |
|---|---|---|
| loader → FIX-01 之前 | `cp .cache/fix01/loader.pre-20261101-233919.ts src/main/plugins/loader.ts` | `cb7d3c85…6151` |
| loader → FIX-02 之前 | `cp .cache/fix02/loader.pre-20261101-235657.ts src/main/plugins/loader.ts` | `9d4ec283…00e4` |
| loader → FIX-02 之后 | `cp .cache/fix02/loader.fixed.ts src/main/plugins/loader.ts` | `915c9e7c…e896` |
| service → FIX-03 之前 | `cp .cache/fix03/service.pre.ts src/main/schema/service.ts` | `79dc3325…ab5a` |
| service → FIX-03 之后 | `cp .cache/fix03/service.current.ts src/main/schema/service.ts` | `487f8b9a…4410` |

> 回滚源码后**必须重跑** `vitest run` + `typecheck` + `lint` 才能确认可用——本批**未做**（禁止运行测试）。

---

## 5. 恢复演练状态（本批诚实结论）

| 项 | 状态 | 说明 |
|---|---|---|
| 备份**存在性** | ✅ 全部确认（逐文件 `ls` + `stat`） | 5 个 fix 文件 + 2 个目录 + 14 个文档历史版本 |
| 备份**哈希可取得** | ✅ 全部取得 | 见 §2/§3 |
| 备份与**原始状态**的对应证据 | ✅ 5 个 fix 文件的哈希均与对应报告记载的"修改前/后"值一致 | C-1～C-5 |
| **恢复动作**是否被执行验证 | ❌ **未执行** | 覆盖源码需单独授权；本批边界禁止 |
| 恢复后是否可运行 | ❌ **未验证** | 需测试（本批禁止运行测试） |
| 备份是否被清理/覆盖 | ✅ 未发生 | 只读盘点 |

**历史证据（非本批）**：FIX-02 期间曾做过一次受控换回（把 C-2 覆盖到源码）并核对哈希为 `9d4ec283…`，随后从 `loader.fixed.ts` 还原并核对 `ced37377…`；FIX-03 期间用逆变换重建 `service.pre.ts` 并证明哈希与原始一致。**这些是历史执行记录，不构成本批的演练证据。**

---

## 6. 缺项、风险与阻塞

| # | 缺项/风险 | 影响 | 处置 |
|---|---|---|---|
| M-1 | **无异地/离线副本**：所有备份都在 `.cache/` 同一磁盘 | 磁盘损坏即全部丢失 | 建议在获得授权后导出到项目外（需用户决定，见 D 项新增建议） |
| M-2 | **无自动校验**：无脚本一次性核对全部备份哈希 | 备份可能静默损坏 | 本文件已给出期望哈希；可后续加 `docs` 内脚本（属代码/脚本改动，未做） |
| M-3 | **备份世代多、易混用**（同一文件 3 代） | 用错备份会回退过多 | §2.1 已给出"选哪个"的判定表 |
| M-4 | 更早阶段（UI-REDESIGN-1、P-C 系列）的源码备份**未盘点** | 若需回退那些改动则无依据 | 标记**未核实**，不在本批推断 |
| M-5 | 恢复后未跑测试 | 恢复可能引入不可运行状态 | 恢复必须与测试同批执行（需 A2+A3 授权） |
| M-6 | `.cache/npm`、`.cache/electron-dist` 等大目录未纳入 | 与源码回滚无关 | 明确排除，避免误删 |

---

## 7. T-02 验收判定

| 计划验收条件（`PROJECT-MASTER-PLAN.md` T-02） | 结果 |
|---|---|
| 产出 `docs/PROJECT-ROLLBACK-MANIFEST.md` | ✅ 本文件 |
| 列出 `.cache/fix0*` 文件 | ✅ C-1～C-5 |
| 列出哈希 | ✅ SHA-256 全量 |
| 列出恢复命令 | ✅ §4 |
| **不改源码** | ✅ 未改（`find src -newermt` 为 0） |

**结论**：T-02 **文档验收已满足**，状态记 **`已通过`（文档层）**；
但本批任务书 §3 要求的"恢复方法是否已验证"一栏必须如实填 **`未验证（需单独授权）`**，
因此**「回滚能力已在执行层建立」这一说法不成立**——只能说"回滚**材料与步骤**已就绪"。

> 若负责人要求"必须演练通过才算 T-02 完成"，则本任务应改判 **`待验收`**，缺口为 M-5（恢复后未跑测试）。
> 该判定权不在本批，已在 `PROJECT-DECISIONS.md` 记为 D-16（新增决策项）。

---

## 8. 多文件备份纪律（**D-28 已采纳，2026-11-02 起生效**）

> **来源**：负责人第 14 批答复（`PROJECT-DECISIONS.md` §6 D-28）。
> **本节的地位**：**项目纪律**。与 §4.1 的三步恢复法并存 —— §4.1 管"单文件怎么换"，本节管"备份单位是什么"。

### 8.1 规则

| # | 规则 |
|---|---|
| **R-8.1** | 一次改动涉及**多个源文件和/或测试文件**时，**修改前**必须建立**完整的 `src` + `tests` 快照**（不是只备份"将要改的那几个文件"）。 |
| **R-8.2** | 快照必须同时生成**文件清单 + 逐文件 SHA-256**（`manifest.json`），并在建立后**回读校验**（快照哈希 == 改动前活体哈希）。 |
| **R-8.3** | 恢复时**以同一份快照为单位**整体还原，**不得**把不同时间点的备份拼在一起使用。 |
| **R-8.4** | 快照目录必须**自带标识**（`COLD-README.txt`：路径、生成时间、文件数、逻辑字节、清单哈希），**明确标记为冷备**，防止与当前版本混淆（D-27）。 |
| **R-8.5** | 若只能取得"文件选集"式备份（如历史遗留的 `bh02/bh03` 备份），该备份**只能用于动作层回滚**，**不得**用于"历史行为"类结论 —— 因其**不构成可编译世代**（C-6 的实测结论，见 `REPORT-13` §2.3）。 |

### 8.2 为什么需要这条纪律（一次性证据）

`REPORT-13` §2.3 的 8 次 `tsc` 变体实测表明：C-6 的 5 文件备份**在任何组合下都无法编译**
（V1=18 / V2=18 / V3=1 / V6=2 / V7=1 处错误，只有 C-7 的 10 文件集可以达到 0）。
根因是"文件选集"与"世代快照"不是一回事：未列入备份清单的伙伴文件仍是新世代，形成**双向版本错配**。

### 8.3 与既有纪律的关系

| 既有纪律 | 与 R-8.x 的关系 |
|---|---|
| §4.1 ① 先确认当前哈希 | 保留；R-8.2 把它扩展到"全量清单" |
| §4.1 ② 先另存修复版再覆盖 | 保留；R-8.1 把它上升为"整快照" |
| `MEMORY.md` §18"无 Git 的受控回退取证"五步 | 保留；R-8.3 补充"不得跨快照拼接" |
| 统计纪律 S-4（历史错误不改原报告） | 不冲突；本节为**新增**纪律，不改 §1～§7 |
