# 项目基线报告（PROJECT BASELINE REPORT）

> **批次**：第 01 批（全项目计划执行）｜**时间**：2026-11-02 00:32–00:45
> **性质**：只读核查 + 文档编制。**未修改任何源码 / 测试 / 配置 / 正式台账**。
> **配套文档**：`PROJECT-MASTER-LEDGER-MAP.md`（映射）｜`PROJECT-PLAN-GAP-ANALYSIS.md`（漏洞）｜`PROJECT-MASTER-PLAN.md`（总计划）｜`PROJECT-MASTER-PLAN-CHANGELOG.md`｜`PROJECT-PLAN-SELF-CHECK.md`｜`PROJECT-PLAN-EXECUTION-REPORT-01.md`

---

## 1. 本次实际核查范围

### 1.1 读取的文档（逐份确认存在，附字节数）

| 文件 | 大小 | 用途 |
|---|---|---|
| `docs/PROJECT-SEALING-LEDGER-REPORT.md` | 90,749 B | 正式台账 V9（**只读**），§1/§3/§4/§7/§8/§9 全量读取 |
| `docs/PROJECT-FINAL-CLOSEOUT-REPORT.md` | 29,294 B | 收尾结论（32/2/1 汇总的来源） |
| `docs/PROJECT-NEXT-SESSION-HANDOFF.md` | 8,230 B | 交接说明 |
| `docs/AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.md` | 27,802 B | 审计遗留清单 |
| `docs/AUDIT-FULL-01-R1-REPORT.md` | 41,419 B | 审计统计纠错与 C1–C8 复核 |
| `docs/BUG-HUNT-01-FINDINGS.md` | 48,233 B | BH-001～014 |
| `docs/BUG-HUNT-02-FINDINGS.md` | 15,144 B | BH2-001～007 |
| `docs/BUG-HUNT-02-RV1-INDEPENDENT-REVIEW.md` | 32,419 B | RV1-001～009 |
| `docs/BUG-HUNT-03-FIX-REPORT.md` / `-TEST-REPORT.md` / `-REMAINING.md` | 15,438 / 13,373 / 11,000 B | REM-01～04、P-01～P-09 |
| `docs/BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN.md` | 76,209 B | RT-01～10、Q-01～07 |
| `docs/FIX-03-IMPLEMENTATION-REPORT.md` | 11,562 B | FIX-03 实施与证据 |

> 另有 `docs/` 目录共 **97 个 .md** 已列举（`ls docs/`），其中包含 PACK-01～19、LEDGER-V7/V8/V9 修订、P-C1～P-C7、P-OPT1～P-OPT4、CLEANUP-01/02 等历史阶段报告。**未逐字通读全部 97 份**——本轮按"与本批判断相关"选取，未读部分在下文 §6 标注为「未核实」。

### 1.2 只读核查手段

`md5sum` / `sha256sum` / `wc` / `ls` / `find` / `grep`（只读）；**源码文件逐个只读打开**核对 FIX-01/02/03 的实际改动点。

### 1.3 本轮**运行**的校验动作（仅此三项，均不修改仓库文件）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `./node_modules/.bin/vitest run` | 0 | **82 文件（80 passed + 2 skipped）/ 767 用例（760 passed + 4 skipped + 3 todo）/ 0 失败** |
| `npm run typecheck`（node + web） | 0 | 无错误 |
| `npm run lint`（`--max-warnings=0`） | 0 | 无告警 |

> 说明：这三项属于"只读校验"，不修改源码/测试/配置；副作用仅 `.vitest-tmp/` 临时目录（项目既有机制）。
> **未执行**：Electron 启动、真实整合包测试、构建、打包、安装、依赖变更、Git 操作。

---

## 2. 保护边界核对（全部通过）

| 对象 | 要求 | 实测 | 结论 |
|---|---|---|---|
| 正式台账 V9 | MD5 = `7a7e52d93a201da3d9fa0e4fa0b26f51` | 同值；868 行 / 90,749 B | ✅ 未改动，未生成 V10 |
| 生产 `userData` | 不得访问/读取/哈希/修改 | 未执行任何 `%APPDATA%` 相关命令 | ✅ |
| `dist/` | 不得清理/覆盖 | 仅 `ls` 看到 `KubeJS Recipe Studio Setup 0.1.0.exe` | ✅ 未改 |
| `dist-011/` | 同上 | 仅 `ls` 看到 `KubeJS Recipe Studio Setup 0.1.1.exe` | ✅ 未改 |
| `E:/_trash_20261101_recipe-studio` | 不得清理 | 未访问 | ✅ |
| npm cache | 不得清理 | 未执行任何 cache 命令 | ✅ |
| 源码 / 测试 / 配置 | 本次不得修改 | `find src tests -newermt` 与哈希均无变化 | ✅ |
| Git 仓库 | 不得创建 | `git rev-parse` → `not a git repository`；无 `.git` 目录 | ✅ 仍无仓库 |

---

## 3. 当前项目状态快照

| 项 | 值 | 来源 |
|---|---|---|
| 版本（源码） | **0.1.1** | `package.json.version` |
| `productName` | **不存在**（符合"绝不可加"约束） | `package.json` |
| 源码规模 | **177** 个 `.ts/.tsx` | `find src` |
| 测试规模 | **82** 个 `*.test.ts` | `find tests` |
| 测试结果 | 760 passed / 4 skipped / 3 todo / **0 failed** | 本轮 `vitest run` |
| 类型检查 / Lint | 均 exit 0 | 本轮 |
| 安装包 | `dist/…0.1.0.exe`、`dist-011/…0.1.1.exe` 均存在 | `ls` |
| 最近一次构建产物 | `dist-011`（0.1.1） | 目录时间 2026-11-01 07:05 |

### 3.1 三层证据现状（沿用 BUG-HUNT 口径）

| 层 | 含义 | 现状 |
|---|---|---|
| ① 代码已修改 | 源码中确有对应改动 | FIX-01/02/03 与 BUG-HUNT-02/03 的改动**均已核对到当前文件**（见 §4） |
| ② 自动化测试通过 | `node` 环境用例 | **767 用例 0 失败**（本轮实测） |
| ③ 真实环境已验证 | 启动应用 + 真实整合包 + 真实交互 | **0 项**（BUG-HUNT-04 计划 §10 明确"全部未执行"） |

> **本轮不把 ② 当作 ③**。§4 与映射表中"当前核实"一栏只表示 ①/②。

---

## 4. 历史声明 → 当前源码对应关系

### 4.1 可对应（哈希一致，**已核实**）

| 报告声明 | 文件 | 报告记载前缀 | 当前 SHA-256 前缀 | 结论 |
|---|---|---|---|---|
| BUG-HUNT-03 / REM-01 | `src/main/codegen/preview.ts` | `0ba2a034…` | `0ba2a034…` | ✅ 一致 |
| BUG-HUNT-03 / REM-01 | `src/main/handlers/recipeHandlers.ts` | `73adb328…` | `73adb328…` | ✅ 一致 |
| BUG-HUNT-03 / REM-02 | `src/shared/search.ts` | `20f1aeb3…` | `20f1aeb3…` | ✅ 一致 |
| BUG-HUNT-03 / REM-02 | `src/main/scanner/itemIndex.ts` | `0ef4b643…` | `0ef4b643…` | ✅ 一致 |
| BUG-HUNT-02-RV1 | `src/main/schema/registry.ts` | RV1 报告记 `5e2605ef…`（中间态） | `87695eb6…` | ✅ 可解释（后续轮次继续改动，见 §5-C3） |
| FIX-02 | `src/main/plugins/loader.ts` | `915c9e7c…` | `915c9e7c…` | ✅ 一致 |
| FIX-03 | `src/main/schema/service.ts` | `487f8b9a…` | `487f8b9a…` | ✅ 一致 |
| FIX-01 | `src/main/plugins/loader.ts` | `9d4ec283…`（当时终值） | — | ⚠️ 已被 FIX-02 覆盖为 `915c9e7c…`，**属演进非矛盾** |

### 4.2 有历史证据但当前状态未核实

| 项 | 说明 |
|---|---|
| BUG-HUNT-01 的 BH-001～014 全部修复 | 报告与闭包审计有记录，本轮**未逐条重跑对应用例并核对行为**（仅确认整体 767 用例全绿） |
| BUG-HUNT-02/02-RV1 的 8 项修复 | 同上 |
| PACK-16/18 的构建与升级证据 | 仅有报告，未复核 `dist/` 产物哈希（本轮按边界不做产物哈希） |
| 7 个"仅有台账、无独立阶段报告"的阶段 | 台账 §2 表 B 标 `[无法核实]`，本轮同样无法核实 |

### 4.3 当前无法核实

- 真实整合包下的插件层跟随、失败恢复、语料重建行为（需启动应用）。
- 安装版与 dev 并行（REL-VERIFY-DUAL）、4K 视口（REL-VERIFY-4K）。
- POSIX 行为（C7-F2a/F2b、P2-POSIXPATH）。
- 安装包签名状态（本轮不对产物做哈希/签名校验）。
- BUG-HUNT-01-COVERAGE 声称的"全覆盖"是否成立（未逐文件比对）。

---

## 5. 发现的矛盾（必须进入计划，不得搁置）

| # | 矛盾 | 证据 | 影响 |
|---|---|---|---|
| **C1** | **V9 的 40 条完全不覆盖 BUG-HUNT 系列**。BUG-HUNT-01/02/02-RV1/03 产生 34 个缺陷编号（BH 14 + BH2 7 + RV1 9 + REM 4），V9 计数仍为 40 | V9 §4 矩阵 vs `BUG-HUNT-*-FINDINGS.md` 编号清单 | 若以 V9 为唯一台账，会**漏掉全部 34 项**；修复状态无法在台账中体现 |
| **C2** | **BUG-HUNT-04 的 RT-01/RT-02 判据已被证明无效**（R1 审查结论 C），但计划文件仍是 R1 版 | `BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN.md` §4 RT-01/02 vs 审查轮结论 | 按现计划执行会得到**假失败/假通过**（`lastModpackPath` 陈旧 + 进设置页副作用） |
| **C3** | `registry.ts` 的 RV1 报告哈希为中间态，与当前值不同 | RV1 FIX-REPORT 记 `5e2605ef…`；当前 `87695eb6…`；`BUG-HUNT-01-02-CLOSURE-AUDIT.md` 已标注 | 引用时若不加"中间态"会误判为"源码被篡改" |
| **C4** | **Q-02 的描述已过时**：计划称"`listPluginFiles` 捕获 `readdir` 失败返回 `[]` → 层被清空"，FIX-02 已改为失败不清层 | 计划 §7 Q-02 vs `loader.ts` 现状 | 待裁决问题的选项集需重写（部分已实现） |
| **C5** | **版本三元不一致**：源码 0.1.1 / 已安装 0.1.0（回滚后）/ `dist-011` 0.1.1 | 台账 §10.2 与交接文档；`ls dist`/`dist-011` | 重新构建前必须先定基准版本 |
| **C6** | **V9 内含 5 处"旧话没改"（C1–C5，见台账内部编号）**，如 §10.2 第 1/4/7 行仍写"跨版本升级未验证" | `AUDIT-FULL-01-R1-REPORT.md`；台账 §10.2/§10.3 | 台账只读 → **不得就地修**，只能另立勘误文件 |
| **C7** | **测试计数口径差 2**（701 声称 vs 699 静态推算），闭包审计已记录但未解决 | `BUG-HUNT-01-02-CLOSURE-AUDIT.md` | 引用"用例数"时不可作为精确证据；本轮实测为 767，属新基线 |
| **C8** | **FIX-01 削弱了 BUG-HUNT-04 RT-01 的一条判据**：修复后一次重建可能产生 **2 条** `五层合并完成`（provider 内 `syncPluginLayer` + `ensureSchemas` 各一次），而计划要求"恰好 1 条" | FIX-01 报告 §8 R-3；`loader.ts` `syncPluginLayer` 调用点 | RT-01 步骤 7 会把正常情况判为"证据作废" |
| **C9** | **V9 称"硬性发布阻塞清零"，但同时登记 `REL-VERIFY-DUAL`/`REL-VERIFY-4K` 未验证** | V9 §7.1 与 §1 摘要 | 对外表述若只引"清零"会误导；必须连体引用 |

---

## 6. 未核实 / 未读清单（如实登记）

| 项 | 原因 |
|---|---|
| `docs/` 中 P-C1～P-C7、P-OPT1～P-OPT4、PACK-01～19、CLEANUP-01/02 等约 60 份阶段报告 | 本轮按需检索，未逐字通读；其结论通过 V9 台账与闭包审计间接引用 |
| BUG-HUNT-01-COVERAGE / BUG-HUNT-02-COVERAGE 的"文件覆盖清单" | 未逐文件比对，无法确认覆盖率声称 |
| 台账 §2 表 B 的 7 个阶段 | 台账本身标 `[无法核实]` |
| `build/` 目录内容 | 未检查（与签名/图标相关，属发布阶段） |
| `plugins/` 目录（仓库根） | 未检查用途，疑为示例插件，待后续确认 |

---

## 7. 受保护、不得操作的对象（本批与后续均适用）

1. `docs/PROJECT-SEALING-LEDGER-REPORT.md`（V9）——只读；**不得**改写、不得生成 V10。
2. 生产 `userData`（`%APPDATA%/<productName>` 或 `-dev` 变体）——未经单独授权不得读取/哈希。
3. `dist/`、`dist-011/`、`E:/_trash_20261101_recipe-studio`、npm cache——不得清理/覆盖。
4. `.cache/pc7-pack-1112` 等硬链接测试包——不得就地改写（`nlink=4`，需 `cp -r`）。
5. `.cache/fix01|fix02|fix03` 的回滚副本——**不得删除**（当前是唯一回滚依据，项目无 Git）。

---

## 8. 基线结论

- **可继续进入映射与计划编制**：源码 / 测试 / 门禁均为绿色（①+②），边界未破。
- **不可声称"项目已验证"**：③ 真实环境证据仍为 0。
- **必须优先处理的结构性问题**：C1（34 个 BUG-HUNT 编号未入台账）与 C2（RT 判据失效）——二者决定后续阶段能否被正确验收。
