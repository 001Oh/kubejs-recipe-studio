# 项目文档索引（DOCS INDEX）

> **任务**：T-04b｜**批次**：第 02 批｜**时间**：2026-11-02 00:48
> **本批任务书预期文件名**：`PROJECT-DOCUMENT-INDEX.md`；**实际采用总计划 §7.1 命名**。
> **用途**：给后续批次一个**权威入口**——先看本文件再决定读哪份，避免"97 份文档里凭感觉找"。
> **索引范围**：`docs/*.md` 全部文件（见 §11 覆盖率自检）+ `.cache/` 中具文档性质的 1 份备份。

---

## 0. 权威级别定义（先定级，再索引）

| 级别 | 含义 | 冲突时如何处理 |
|---|---|---|
| **A** | **唯一口径**：正式台账、总计划、勘误 | A 级之间冲突 → 转人工决策，不得自行取舍 |
| **B** | 结论性证据：阶段验收、打包/安装报告、裁决报告 | 与 A 冲突 → 以 A 为准，并登记到 `LEDGER-V9-ERRATA.md` |
| **C** | 过程/佐证：审计过程记录、覆盖清单、调查稿 | 仅作参考，不作判定依据 |
| **D** | 历史版本/备份/旧稿：`.pre-*`、被取代的修订报告 | **不得**作为当前状态引用 |

## 0.1 审阅程度定义（关键：不得用文件名冒充已读）

| 标记 | 含义 |
|---|---|
| **全文** | 本轮或前序批次**完整读过**（可复述结论与关键数字） |
| **部分** | 只读过**指定章节**（已在"审阅"列注明章节） |
| **未审** | **未完整审阅**，仅依据文件名/标题判断用途；结论不可直接引用 |

---

## 1. 正式台账（A 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `PROJECT-SEALING-LEDGER-REPORT.md` | **正式台账 V9**（40 条条件 + 5 门禁 + 8 决策）MD5 `7a7e52d9…` | **A** | **封存·只读** | 全部 | **部分**（§1、§3.1–§3.7、§4、§7、§8、§9、§10.1–§10.3） |

### 1.1 台账历史版本（D 级，仅追溯）

| 文件 | 对应版本 | 大小 | 审阅 |
|---|---|---|---|
| `PROJECT-SEALING-LEDGER-REPORT.pre-revision-20261101-0342.md` | v2 前 | 22,568 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v3-20261101-0414.md` | v3 前 | 22,045 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v4-20261101-0507.md` | v4 前 | 35,780 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v5-20261101-0528.md` | v5 前 | 38,909 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v6-20261101-0553.md` | v6 前 | 41,648 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v7-20261101-0609.md` | v7 前 | 45,022 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v7-20261101-0619.md` | v7 前（第二次） | 45,022 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v8-20261101-0634.md` | v8 前 | 61,832 B | 未审 |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v9-20261101-0802.md` | v9 前（= V8） | 75,415 B | 未审 |

---

## 2. 台账派生：计数 / 一致性 / 裁决（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `PROJECT-SEALING-COUNT-RECHECK-REPORT.md` | 40 条的计数推导（71→45→40） | B | 有效（口径参考） | T-11 | 未审（仅经 V9 §1.1 转引） |
| `PROJECT-SEALING-COUNT-RECHECK-REPORT.pre-v3-20261101-0408.md` | 计数复核历史版本 | D | 历史 | — | 未审 |
| `PROJECT-SEALING-COUNT-RECHECK-REPORT.pre-revision-20261101-0405.md` | 计数复核历史版本 | D | 历史 | — | 未审 |
| `PROJECT-SEALING-LEDGER-CONSISTENCY-AUDIT-REPORT.md` | 台账一致性审计 | B | 历史结论 | T-04 | 未审 |
| `PROJECT-SEALING-LEDGER-FINAL-ADJUDICATION-REPORT.md` | 台账终审裁决 | B | 历史结论 | T-04 | 未审 |
| `PROJECT-SEALING-FINAL-CHECK-REPORT.md` | 封板前最终检查（F-06 等） | B | 有效 | T-04 | 未审 |
| `PROJECT-SEALING-LEDGER-REVISION-REPORT.md` | v2→v3 修订报告 | D | 历史 | — | 未审 |
| `PROJECT-SEALING-LEDGER-V3-REVISION-REPORT.md` | v3 修订报告 | D | 历史 | — | 未审 |
| `LEDGER-V7-UPDATE-REPORT.md` | v7 修订（B3 标准调整） | D | 历史 | T-04 | 未审 |
| `LEDGER-V8-CORRECTION-REPORT.md` | v8 更正「核心扫描」判据 | B | 有效（判据纪律来源） | T-04 | 未审 |
| `LEDGER-V9-CLOSE-REL-PKG-REPORT.md` | v9 关闭 `REL-PKG` 的判定明细 | B | 有效 | T-04/T-20 | 未审 |
| `LEDGER-B3-ACCEPTANCE-CHANGE-REPORT.md` | B3 验收标准调整审查 | B | 有效 | T-04 | 未审 |
| `LEDGER-REL-ICON-CLOSE-REPORT.md` | 关闭 `REL-ICON` | B | 有效 | — | 未审 |
| `LEDGER-REL-PKG-C-CLOSE-REPORT.md` | 关闭 `REL-PKG` C 类 | B | 有效 | — | 未审 |
| `LEDGER-REL-PKG-D-CLOSE-REPORT.md` | 关闭 `REL-PKG` D 类 | B | 有效 | — | 未审 |

---

## 3. 项目总体计划系列（A 级，本系列为后续执行依据）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `PROJECT-MASTER-PLAN.md` | **总计划 v1.0**（27 任务 / P0–P6 / 八态 / 三层证据）——**已被 v1.1 取代，转历史只读** | **A（历史）** | **历史版本** | 追溯 | **全文**（本人编制） |
| **`PROJECT-MASTER-PLAN-V1.2.md`** | **总计划 v1.2（当前唯一执行依据）**：**30 任务**（新增 **T-23** 回滚工具维护）/ 31 决策（11 已答·20 待决）/ 31 缺口 / **新增 P0.5 阶段解 C-1 死锁** / **修订硬约束①并写死唯一边界** / 修正 G-31 错计 / 纳入 R-01～R-10 与 F-1～F-4 / 新增 R-6（04:06 创建，04:17 修订 C-41/C-42） | **A** | **生效**（2026-11-02 04:17） | 全部 | **全文** |
| **`PROJECT-MASTER-PLAN-V1.1.md`** | 总计划 v1.1（29 任务 / 20 决策 / 31 缺口）——**已被 v1.2 取代，转历史只读** | **A（历史）** | **历史版本** | 追溯 | **全文** |
| **`PROJECT-GAP-CLOSURE-STATUS.md`** | 计划缺口关闭状态（31 条：12 关闭 / 3 部分 / 15 未关闭 / 1 新增） | **A** | 生效 | T-21 | **全文** |
| **`PROJECT-STATISTICS-BASELINE.md`** | 项目统计口径与来源（每个数字可追溯） | **A** | 生效 | T-21 | **全文** |
| **`FIX-01-02-EVIDENCE-AVAILABILITY.md`** | FIX-01/02 证据可用性（物证清单 + 缺口 E-1～E-4） | **A** | 生效 | T-22、T-20 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-03.md`** | 第 03 批执行报告 | **A** | 见报告 | — | **全文** |
| **`BUG-HUNT-CLOSURE-MATRIX.md`** | **34 个外部缺陷编号逐条复核矩阵（第 04 批，T-09）** | **A** | 生效 | T-09 | **全文** |
| **`RT-REVISION-PROPOSAL.md`** | BUG-HUNT-04 验证计划修订**提案**（G-04/G-05，未改原计划） | **A** | 提案（待 T-13.0 应用） | T-13.0 | **全文** |
| **`RELEASE-NOTES-DRAFT.md`** | 发布说明与检查表**草案**（G-24 文档部分，受 D-08 阻塞） | **A** | 草案 | T-19 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-04.md`** | 第 04 批执行报告 | **A** | 见报告 | — | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-05.md`** | 第 05 批执行报告（T-10 只读：BH2-004/006、RV1-005/006） | **A** | 见报告 | T-10 | **全文** |
| **`PROJECT-TASK-STATUS-RECONCILIATION.md`** | **29 个 T 的任务状态对账（第 06 批）** | **A** | 生效 | T-20（进度口径） | **全文** |
| **`PROJECT-DOC-ERRATA-01.md`** | **项目文档勘误 01**（E-01 D-21 更正；E-02 G-31 记录）（第 07 批） | **A** | 生效 | T-09、v1.2 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-07.md`** | 第 07 批执行报告（勘误 / T-10 判定 / R-1 差异 / 发布草案完善） | **A** | 见报告 | T-09/T-10/T-13.0/T-19 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-08.md`** | 第 08 批执行报告（T-10 剩余核查 / T-09 验收准备 / **P2 启动判定 C**） | **A** | 见报告 | P2 启动 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-09.md`** | 第 09 批执行报告（T-09 提交验收准备 / G-32·G-33 登记 / P2 条件表） | **A** | 见报告 | T-09、P2 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-10.md`** | 第 10 批执行报告（**T-02 恢复演练**、T-06 语义校验、T-07 注释；含首次 A2+A3 实测门禁） | **A** | 见报告 | T-02/T-06/T-07 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-11.md`** | 第 11 批执行报告（T-10⑤ 回退用例、P2-MKDIR、T-02 的 C-1/C-2 演练） | **A** | 见报告 | T-02/T-08b/T-10 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-12.md`** | 第 12 批执行报告（**C-6/C-7 演练方案（未执行）**、T-06 证据核对、P2-SYMLINK） | **A** | 见报告 | T-02/T-06/T-08b | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-13.md`** | 第 13 批执行报告（**C-6/C-7 影子目录与目录级切换方案设计；43 项平台探针 + 8 次 tsc 变体实测；证明 C-6 无法构成自洽世代、Windows 无原子目录切换**） | **A** | 见报告（**方案完成，演练未执行**） | T-02 | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-14.md`** | 第 14 批执行报告（**D-25～D-28 登记；方案 v2 修正切换顺序 tests→src；全尺寸沙盒 10 项判定全 PASS；含负向对照**）。**第 15 批补记：§0.1 单列"沙盒 vs 真实"证据边界；§10.4 D-29 = HOLD** | **A** | 见报告（**方案已实证可跑；真实演练 HOLD 未执行**） | T-02 | **全文** |
| **`PROJECT-IMPL-CHECKLIST-01.md`** | **实施前核查清单 01**（第 18 批）：D-24 四依赖+三配置五处改动、C7-F1 保留/配对/隔离区/并发、T-08b 子项依赖对照、T-19 的 SHA-256 需求。**全部为"已批准未实施"，含逐文件回滚方案** | **A** | 生效（**未执行任何一项**） | D-24、C7-F1、T-08b、T-19 | **全文** |
| **`PROJECT-ROLLBACK-RISK-REVIEW-01.md`** | **C-6/C-7 回滚工具风险审查记录 01**（第 24 批归档）：R-01～R-10 十项风险（每项证据/事实/判断/等级与阻断性/建议控制/待决/阶段）+ 规则死锁 C-1 + 门禁冲突 P-1～P-4 + Q-1～Q-10。**含 E-文件／E-对话／E-推断 三级证据标注** | **A** | **已归档**（**不构成工具修复授权**；**T-02／D-29 未解除**；未执行任何修复） | T-02（关联 D-29、G-13） | **全文** |
| **`PROJECT-ROLLBACK-TOOL-FIX-PLAN-01.md`** | **回滚工具修复方案 01**（第 26 批）：R-01/02/03/04/07 逐项改法 + 行号 + 期望 diff + 验证方式；**§12A** 记录锁语义 / C-6 动态断言 / 超时边界 / F-1 修复 / F-2 取舍。**方案已实施至代码，A3 未验证** | **A** | **生效**（**T-23 的方案依据**；不构成演练授权） | **T-23** | **全文** |
| **`PROJECT-REPORTING-STANDARD-01.md`** | **项目回复与报告规范 01**（**不占批次号**，负责人 04:27 批准）：7 段回复结构 / 验收五态 / 事实与推断分离 / 执行报告强制项（含「回滚须实测」）/ 三处行为收紧。**性质：格式规范，非操作授权** | **A** | **生效**（2026-11-02 04:28） | 全部批次 | **全文** |
| `PROJECT-BASELINE-REPORT.md` | 第 01 批基线（已核实/未核实/矛盾/受保护） | A | 生效 | T-01 | **全文** |
| `PROJECT-MASTER-LEDGER-MAP.md` | 40 条映射 + 60 外部编号 + 15 决策 | A | 生效 | T-03 | **全文** |
| `PROJECT-PLAN-GAP-ANALYSIS.md` | A–F 六类覆盖判断 + 22 缺口 | A | 生效 | T-03b | **全文** |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | C-01～C-18 修订记录 | A | 生效 | 全部 | **全文** |
| `PROJECT-PLAN-SELF-CHECK.md` | 15 问自检 + S-1～S-3 | A | 生效 | 每批 | **全文** |
| `PROJECT-PLAN-EXECUTION-REPORT-01.md` | 第 01 批执行报告 | A | 已通过 | — | **全文** |
| **`PROJECT-ROLLBACK-MANIFEST.md`** | **回滚材料清单（本批新建）** | **A** | 生效 | **T-02** | **全文** |
| **`LEDGER-V9-ERRATA.md`** | **V9 勘误 C-01～C-09（本批新建）** | **A** | 生效 | **T-04** | **全文** |
| **`DOCS-INDEX.md`** | **本文件（本批新建）** | **A** | 生效 | **T-04b** | **全文** |
| **`PROJECT-DECISIONS.md`** | **15 项决策收集（本批新建）** | **A** | 待决策 | **T-12** | **全文** |
| **`PROJECT-PLAN-EXECUTION-REPORT-02.md`** | **第 02 批执行报告（本批新建）** | **A** | 已通过（文档类） | — | **全文** |
| **`PROJECT-T11-COUNT-RERUN-01.md`** | **T-11 数字口径重跑**（第 28 批）：P2 五文件定向跑 41 用例全绿；记录基线漂移 767→781 | **A** | **材料**（待 A3 认可） | T-11 | **未审** |
| **`PROJECT-T09-REVIEW-ACCEPTANCE-01.md`** | **T-09 验收材料**（第 28 批）：34 编号复核最终口径，供负责人验收 | **A** | **材料**（待验收） | T-09 | **未审** |
| **`PROJECT-T10-COVERAGE-PLAN-01.md`** | **T-10 覆盖补齐提案**（第 28 批）：G-12/G-21 的依赖、用例、`it.todo` 结论 | **A** | **提案**（待 A2） | T-10 | **未审** |
| **`PROJECT-T19-RELEASE-PLAN-01.md`** | **T-19 发布说明模板 + 检查表**（第 28 批）：版本/签名占位留空（待 D-32） | **A** | **草案**（待 D-32） | T-19 | **未审** |
| **`PROJECT-T13-0-R1-REVISION-01.md`** | **T-13.0 的 R-1 修订差异说明**（第 28 批）：判据「恰好 1 条」→「≥1 且可解释」 | **A** | **提案**（待 D-19） | T-13.0 | **未审** |
| **`PROJECT-T22-RERUN-01.md`** | **T-22 FIX-01/02/03 复验（2026-11-02 重跑）**（第 29 批）：3 文件 22 通过 + 3 todo，含测试文件哈希漂移说明 | **A** | **复验记录**（待验收） | T-22 | **全文** |
| **`PROJECT-T10-IMPLEMENTATION-01.md`** | **T-10 覆盖补齐实施**（第 29 批）：4 依赖 + 3 配置 + 15 新用例 + 3 个 `it.todo` 结论；含两处偏离声明 | **A** | **实施记录**（待验收） | T-10 | **全文** |
| **`PROJECT-T02-REAL-DRILL-01.md`** | **T-02 真实工作区恢复演练**（A4，唯一一次 `--root` 项目根）：正向全流程 PASS、280 文件恢复零差异；判据 1/4 需口径裁定 | **A** | **演练报告**（待负责人验收） | T-02 | **全文** |
| **`PROJECT-T02-VERDICT-REGISTRY-01.md`** | **T-02 判定登记**：判定「已通过」+ 四项联动（硬约束①解除/P2 解封、G-13 关闭、铁律 7 精化、基线漂移）；含与既有禁令的 R-6 冲突声明 | **A** | **判定登记**（权威） | T-02 | **全文** |
| **`PROJECT-T13-PHASE1-01.md`** | **T-13.1 隔离核实 + T-13.2 受阻报告**（P4 首包）：隔离三判据全过；T-13.2 因运行产物 `out/` 早于 FIX-01/02/03 判「无法」 | **A** | **验证报告**（待验收） | T-13.1/T-13.2 | **全文** |
| **`PROJECT-T13-PHASE2-01.md`** | **T-13.2 FIX-01/02/03 真实验证**（P4 第二包）：重建 out/ 后三项四态均「通过」；含差异源性质声明与 FIX-03 量化测量 | **A** | **验证报告**（待验收） | T-13.2 | **全文** |
| **`PROJECT-T32-P2LINE-AND-BUILD-01.md`** | **第 32 批：P2 收尾四件实现 + R4 降级登记 + 重建**；T-13.3 未执行（如实登记） | **A** | **实施记录**（待验收） | T-08b 子项 | **全文** |
| **`PROJECT-T13-PHASE3-01.md`** | **T-13.3 大巡检（收官）**：RT-06 实测通过（RV1-001 未回归）；RT-01/RT-05 引用 PHASE2；**十项全落四态（10/10 通过）+ T-13.4 通过 → P4 收官** | **A** | **巡检报告**（部分，待续） | T-13.3 | **全文** |
| **`PROJECT-T24-AND-PHASE3-02.md`** | **T-24 数据源补全（受阻）+ 第 33 批边界**：4 个下载源全 404；按 §八 降级为前提报告，未启动 MC；3-b/3-c 未执行并给解耦建议 | **A** | **受阻报告** | T-24 / T-13.3 | **全文** |
| **`PROJECT-T17-T14-PHASE1-01.md`** | **T-17 版本登记 + NSIS 0.1.1 构建（未签名，输出 dist-t17）+ T-14 双实例（部分）** | **A** | **实施记录**（待验收） | T-17 / T-14 | **全文** |
| **`PROJECT-T25-FIX-01.md`** | **T-25 冷启动恢复（含回归修复 + 双实例验收）**：缓存命中 0.1s、`loadPlugins` 缺失回归已修（RT-01 4/3/4）、T-14 6/6 | **A** | **实施记录**（待验收） | T-25 / T-14 | **全文** |
| **`PROJECT-FINAL-VERDICT-REGISTRY-01.md`** | **最终裁决登记**：T-15 已知限制 / T-16 未验证 / T-18 延后 / T-24 已通过 / T-20 暂缓；TASK-STATUS 重算 30 | **A** | **裁决登记** | T-15/16/18/20/24 | **全文** |
| **`PROJECT-T18-GPU-VERIFY-01.md`** | **T-18 GPU 加速模式验证**：零禁用参数启动、ANGLE_D3D11/RTX 5060、5.4min 零崩溃 → **通过**；含第 41 批文档损伤登记 | **A** | **验证报告** | T-18 | **全文** |
| **`PROJECT-T20-FINAL-ACCEPTANCE-01.md`** | **T-20 最终验收报告**：项目收口、**100 编号终态表**（40 台账 + 60 外部：34 缺陷/9 P/7 Q/10 RT）、已知限制清单、合并对规则 | **A** | **验收报告** | T-20 | **全文** |
| **`PROJECT-UI-AVAILABILITY-01.md`** | **前端可用性鼠标测试**（CDP/GPU 模式）：6 区域 4 通过 2 部分 0 失败；UI-U2 焦点解耦交互级验证；12 张截图；JS 错误 0 | **A** | **验证报告** | T-18/UI-U2 | **全文** |
| **`PROJECT-DEFECT-COLDSTART-01.md`** | **缺陷报告 · 冷启动不恢复包/插件/索引**：六项取证实锤（path=null / 无 lastModpackPath / 缓存 46MB 不加载）；修复需 A2 | **A** | **缺陷报告** | 待分配 BH3-001 | **全文** |
| **`PROJECT-T25-IMPLEMENTATION-PLAN-01.md`** | **T-25 实施计划（停：硬约束冲突）**：`startScan(false)` 自带缓存命中（步骤3近乎免费）；`t13-pack` 无 `package.json`→硬约束2需改判；含 60 行改动清单 | **A** | **实施计划** | T-25 | **全文** |
| **`PROJECT-T25-FIX-01.md`** | **T-25 冷启动恢复修复**：4 文件改动、校验方案 A、缓存命中 0.1s、降级实测；UI 横幅未接（超授权） | **A** | **实施记录**（待验收） | T-25 | **全文** |

---

## 4. 需求与设计（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `KubeJS配方工坊-需求规格-完整版.md` | 需求规格（最大文档 152 KB） | B | 依据 | 全局 | 未审 |
| `schema-设计.md` | Schema 体系设计 | B | 依据 | T-05/T-07 | 未审 |
| `架构决策.md` | 架构决策记录 | B | 依据 | 全局 | 未审 |
| `P-C-接入设计.md` | P-C 阶段接入设计 | C | 历史 | — | 未审 |

---

## 5. 阶段验收报告（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `P-C2-接入评审.md` | P-C2 评审 | B | 历史 | — | 未审 |
| `P-C3-提交与冲突评审.md` | P-C3 提交/冲突评审 | B | 历史 | T-08 | 未审 |
| `P-C4-测试稳定性复核.md` | P-C4 测试稳定性 | B | 历史 | T-11 | 未审 |
| `P-C5-索引与缓存一致性.md` | P-C5 索引/缓存 | B | 历史 | T-13.4 | 未审 |
| `P-C6-写入失败与备份.md` | P-C6 写入失败与备份（已知限制 4 条） | B | 历史 | T-08 | 未审 |
| `P-C7-核心工作流验收.md` | P-C7 八场景验收（C7-F1～F7 来源） | B | 历史 | 映射 §1 | 未审 |
| `P-OPT1-冷启动剖析.md` | 冷启动剖析（C7-F3 依据） | C | 历史 | T-16 | 未审 |
| `P-OPT2-图标写入批量化.md` | 图标批量化 | C | 历史 | — | 未审 |
| `P-OPT3-iconPass调查.md` | iconPass 调查 | C | 历史 | — | 未审 |
| `P-OPT4-S1-listAndRead.md` | listAndRead 单点验证 | B | 历史 | T-16 | 未审 |
| `P-OPT4-S2-四调用方替换与A-B结果.md` | 四调用方替换 A/B 结果 | B | 历史 | T-16 | 未审 |
| `P-OPT4-ZIP读取架构评审.md` | ZIP 读取架构评审 | B | 历史 | — | 未审 |
| `P-OPT4-最终验收与封板.md` | P-OPT4 封板（OPT4-R2～R8 来源） | B | 历史 | 映射 §2 | 未审 |
| `P0-IPC-修复与验收报告.md` | P0（P0-R1/L1/PL1/PL2/R2/R3/R5 来源） | B | 历史 | 映射 §4 | 未审 |
| `P1-基础工程加固验收报告.md` | P1（P1-C4/DEVPROD/FD/GUARD 来源） | B | 历史 | 映射 §5 | 未审 |
| `P2-封板前只读审查报告.md` | P2 审查（P2-* 九项来源） | B | 历史 | 映射 §6 | 未审 |
| `P2-运行环境隔离与导航安全验收报告.md` | P2 运行隔离与导航 | B | 历史 | T-13.1 | 未审 |
| `UI-REDESIGN-1-验收报告.md` | UI 重设计验收（UI-U1～U6 来源） | B | 历史 | 映射 §3 | 未审 |

---

## 6. 打包 / 安装 / 发布（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `PACK-01-WINDOWS-DIST-REPORT.md` | 首次 dist:win（失败） | C | 历史 | — | 未审 |
| `PACK-02-WINDOWS-DIST-REPORT.md` | 二次 dist:win | C | 历史 | — | 未审 |
| `PACK-03-WINDOWS-DIST-REPORT.md` | dist:win 成功（`REL-ICON`/`P1-C4` 依据） | B | 有效 | T-17 | 未审 |
| `PACK-04-WINDOWS-INSTALL-REPORT.md` | 安装/启动/卸载（B3 N1–N4） | B | 有效 | T-14 | 未审 |
| `PACK-05-USERDATA-ISOLATION-REPORT.md` | 打包后 userData 隔离（`REL-VERIFY-PKGDIR`） | B | 有效 | — | 未审 |
| `PACK-06-REL-PKG-D-PLAN.md` | D 类验收计划 | C | 历史 | — | 未审 |
| `PACK-07-REL-PKG-D-REPORT.md` | D 类执行（295 jar 扫描） | B | 有效 | — | 未审 |
| `PACK-08-BASELINE-PACK-VERIFY.md` | 基准包校验 | C | 历史 | T-13 | 未审 |
| `PACK-09-D2-RERUN-REPORT.md` | D-2 重跑（通过证据） | B | 有效 | — | 未审 |
| `PACK-10-B3-OLD-INSTALLER-INVENTORY.md` | 旧安装包全机核查 | B | 有效 | T-17 | 未审 |
| `PACK-11-B3-N5-SUPPLEMENT-REPORT.md` | N5 补测 | B | 有效 | — | 未审 |
| `PACK-12-CORE-SCAN-TEST-PREP.md` | 核心扫描测试准备 | C | 历史 | — | 未审 |
| `PACK-13-B1-VERSION-BUMP-PREP.md` | 版本升级准备 | B | 有效 | T-17 | 未审 |
| `PACK-14-INSTALL-ISOLATION-ASSESSMENT.md` | 安装隔离评估（NSIS 硬限制） | B | 有效 | T-14 | 未审 |
| `PACK-15-A-PRECHECK-ROLLBACK-REPORT.md` | A 类预检与回滚 | B | 有效 | T-02 | 未审 |
| `PACK-16-B2-BUILD-REPORT.md` | 0.1.1 构建 | B | 有效 | T-17 | 未审 |
| `PACK-17-B3A-CLONE-BASELINE-REPORT.md` | 克隆基线 | B | 有效 | — | 未审 |
| `PACK-18-B3B-UPGRADE-REPORT.md` | **真实跨版本升级 0.1.0→0.1.1** | B | 有效 | T-04/T-17 | 未审 |
| `PACK-19-ROLLBACK-REPORT.md` | 回滚验证（74 文件哈希） | B | 有效 | T-02 | 未审 |
| `ICON-01-应用图标与REL-ICON核验.md` | 图标核验 | B | 有效 | — | 未审 |

---

## 7. 审计（B/C 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `PROJECT-WIDE-AUDIT-REPORT.md` | 全项目审计 | B | 历史结论 | T-09 | 未审 |
| `AUDIT-FULL-01-ENGINEERING-AUDIT.md` | 全工程审计主体 | B | 历史结论 | T-08 | 未审 |
| `AUDIT-FULL-01-ENGINEERING-AUDIT.pre-r1-20261101-0835.md` | 同上 R1 前版本 | D | 历史 | — | 未审 |
| `AUDIT-FULL-01-EVIDENCE-MATRIX.md` | 证据矩阵 | C | 历史 | — | 未审 |
| `AUDIT-FULL-01-EVIDENCE-MATRIX.pre-r1-20261101-0835.md` | 同上 R1 前版本 | D | 历史 | — | 未审 |
| `AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.md` | 缺陷与遗留（N-01～N-07 来源） | B | 有效 | T-08 | 未审 |
| `AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.pre-r1-20261101-0835.md` | 同上 R1 前版本 | D | 历史 | — | 未审 |
| `AUDIT-FULL-01-R1-REPORT.md` | 统计纠错 + C1–C8 复核 | B | 有效 | T-04 | 部分（结论段） |
| `AUDIT-FULL-01-EXECUTION-LOG.md` | 审计执行日志 | C | 历史 | — | 未审 |

---

## 8. 缺陷发现 / 维修实施（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `BUG-HUNT-01-FINDINGS.md` | BH-001～014 全量发现 | B | 有效 | **T-09** | 部分（编号与结构） |
| `BUG-HUNT-01-COVERAGE.md` | 覆盖清单（声称全覆盖） | C | **未核实** | T-09 | 未审 |
| `BUG-HUNT-01-SUMMARY.md` | 汇总 | C | 历史 | T-09 | 未审 |
| `BUG-HUNT-02-FINDINGS.md` | BH2-001～007 | B | 有效 | T-09 | 部分（编号） |
| `BUG-HUNT-02-COVERAGE.md` | 覆盖清单 | C | 未核实 | T-09 | 未审 |
| `BUG-HUNT-02-REPAIR-PLAN.md` | 修复计划 | C | 历史 | T-09 | 未审 |
| `BUG-HUNT-02-REPAIR-REPORT.md` | 修复报告 | B | 历史 | T-09 | 未审 |
| `BUG-HUNT-02-RV1-INDEPENDENT-REVIEW.md` | RV1-001～009 独立复核 | B | 有效 | T-09 | 部分（编号） |
| `BUG-HUNT-02-RV1-FIX-REPORT.md` | RV1 修复（含 registry 中间态哈希） | B | 有效 | T-09 | 部分（改动表） |
| `BUG-HUNT-02-RV1-FIX-TEST-REPORT.md` | RV1 测试 | B | 有效 | T-09 | 未审 |
| `BUG-HUNT-02-RV1-FIX-REMAINING.md` | RV1 遗留 | B | 有效 | T-09 | 未审 |
| `BUG-HUNT-03-FIX-REPORT.md` | REM-01～04 修复（含文件哈希表） | B | 有效 | T-09 | 部分（§1 哈希表） |
| `BUG-HUNT-03-TEST-REPORT.md` | REM 测试 | B | 有效 | T-09 | 未审 |
| `BUG-HUNT-03-REMAINING.md` | P-01～P-09 统一待决 | B | 有效 | T-12/T-13 | 部分（§表格） |
| `BUG-HUNT-01-02-CLOSURE-AUDIT.md` | 30 编号闭环审计 | B | 有效 | T-09 | 部分（§123-125、§157） |
| `FIX-03-IMPLEMENTATION-REPORT.md` | FIX-03 实施报告 | B | 有效 | T-06 | 全文（本人编制） |

> **FIX-01 / FIX-02 没有独立的报告文件**：其证据在各自批次的对话报告与 `FIX-03-IMPLEMENTATION-REPORT.md` 的引用中；文件哈希由 `PROJECT-ROLLBACK-MANIFEST.md` C-1～C-3 承载。这是**文档缺口**，已登记（见执行报告 §7）。

---

## 9. 真实环境验证（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN.md` | RT-01～10 执行卡 + Q-01～07（R1 版；**已被 V1.1 取代**） | **B（历史版本）** | **历史版本**（勿作现行计划引用） | T-13.0 | 部分（§1–§7、§9–§12） |
| **`BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN-V1.1.md`** | **BUG-HUNT-04 真实环境验证计划 V1.1**（T-13.0 应用）：R-1 判据「恰好1条」→「≥1 且可解释」；R-2 差异源 D-19=B + 新增「插件层跟随性确认」步骤 0；R-3 RT-05 S2 = 保留+failed、A/C 不判定 | **B** | **现行计划** | T-13.0 | **全文**（本次新建） |
| `.cache/BUG-HUNT-04-PLAN.pre-r1-20261101-162126.md` | 上述计划的 R1 前版本（40,001 B） | D | 历史 | T-13.0 | 未审 |

---

## 10. 清理 / 交接（B 级）

| 文件 | 用途 | 级别 | 状态 | 关联任务 | 审阅 |
|---|---|---|---|---|---|
| `CLEANUP-01-CACHE-INVENTORY.md` | 缓存清单（硬链接口径） | C | 历史 | T-02 | 未审 |
| `CLEANUP-02-CLEANUP-RESULT.md` | 清理结果 | C | 历史 | T-02 | 未审 |
| `PROJECT-FINAL-CLOSEOUT-REPORT.md` | 收尾报告（32/2/1 汇总来源） | B | 有效 | T-20 | 部分（汇总段） |
| `PROJECT-NEXT-SESSION-HANDOFF.md` | 交接（版本三元、避坑清单） | B | 有效 | 全部 | 部分（版本段） |

---

## 11. 待产出文档（**计划待创建**，非缺失）

> 与"意外缺失"严格区分：以下是**总计划明确排期但尚未开始**的产出物。

| 文件 | 计划任务 | 状态 |
|---|---|---|
| `BUG-HUNT-CLOSURE-MATRIX.md` | T-09 | **计划待创建**（P3） |
| `PROJECT-FINAL-ACCEPTANCE.md` | T-20 | **计划待创建**（P6） |

> 已在本批创建、从"待产出"移出：`PROJECT-ROLLBACK-MANIFEST.md`、`LEDGER-V9-ERRATA.md`、`DOCS-INDEX.md`、`PROJECT-DECISIONS.md`。

---

## 12. 索引覆盖率自检

| 项 | 数值 |
|---|---|
| `docs/*.md` 实际文件数 | **157**（`ls docs/*.md \| wc -l` 实测，2026-11-03 05:50）；另有点文件备份不计入（D 级） |
| 未在本索引中出现的文件 | **0**（本批新增 T-22 / T-10 / T-02 演练报告 / T-02 判定登记 共四份，均已登记） |
| 审阅程度分布 | **全文 47 份**｜**部分 13 份**｜**未审 89 份**（47 + 13 + 89 = 149 ✓） |
| 历史版本（D 级） | 17 份（台账 9 + 计数复核 2 + 审计 3 + 验证计划 1 + 计划 v1.0 1 + **计划 v1.1 1**） |

> **纪律**：标"未审"的文档，其结论**不得**在本项目任何新报告中作为事实引用；需要引用时先把该文档加入"部分/全文"并更新本索引。
> **口径演进**：97 → 109 → 114 → 118 → 119 → 120 → 122 → 123 → 124 → 125 → 126 → 127 → 128 → 129 → 130 → 131 → 132 → 133 → 134 → 139（第 28 批五份）→ 141（第 29 批两份）→ 142（T-02 演练报告）→ 143（T-02 判定登记）→ 144（BUG-HUNT-04 计划 V1.1）→ 145（T-13.1/T-13.2 报告）→ 146（T-13.2 重跑）→ 147（P2 收尾+重建）→ 148（T-13.3 部分）→ **149**（T-24 受阻）。每次新增都必须在此登记（规则 R-4）。

## 第 97 批登记（0.1.3 收尾）

| 文档 | 变更 | 哈希（SHA-256 前 16） |
|---|---|---|
| `PROJECT-T20-FINAL-ACCEPTANCE-01.md` | **新增「附录 Z · T-20 后增补」**：新增缺陷 9 条终态、新增任务 5 项、UI-ISSUES 10/10、0.1.3 版本与哈希、已知限制更新 | `15a5ed3732552cc1` |
| `PROJECT-T19-RELEASE-PLAN-01.md` | **新增「附录 0.1.3」**：版本 0.1.3、安装包 82,372,678 B、SHA-256 `c4134a15…`、校验命令、门禁实测、发布注意 | `52c8c4cc7a43f3af` |
| `PROJECT-T17-T14-PHASE1-01.md` | **新增「三处版本登记」**：源码 0.1.3 / dist-013 0.1.3 / 已装 0.1.0（D-32 a 书面接受） | `e310a4cf15c921af` |
| `PROJECT-UI-AVAILABILITY-01.md` | 第 73–97 批全过程记录（UI 10 条 + T-25/T-26/T-27/T-08/OPT4-R4） | 见各批 |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | 新增 C-58 终章 | 见文件 |

**当前发布基准：0.1.3 / `c4134a15507cef701f3c3c236740d4558168d8c5d7c98e74a688cc105df532b0`**

## 第 101 批登记（0.1.6 收口，项目完成）

| 文档 | 变更 | 哈希（前 16） |
|---|---|---|
| `PROJECT-T20-FINAL-ACCEPTANCE-01.md` | 附录 Z **新增 Z.6**：U-16 / U-17 / U-17-PLUGIN-RESIDUE 三条终态 + 版本推进（0.1.4/0.1.5 作废 → **0.1.6**）+ 已知限制追加 | `240f7541738ad9c0` |
| `PROJECT-T19-RELEASE-PLAN-01.md` | **附录 0.1.6**：82,373,184 B / SHA-256 `bb84e247…` / 校验命令 / **覆盖安装指引（含 `/D` 坑）** / 发布注意 | `00d042c2a49e135a` |
| `PROJECT-T17-T14-PHASE1-01.md` | **附录 3**：源码 0.1.6 / dist-016 0.1.6 / 已装 0.1.0（D-32 a） | `542dbf381d542fd5` |
| `PROJECT-UI-AVAILABILITY-01.md` | 第 73–101 批全过程（UI 10 条 + T-25/26/27 + T-08 + OPT4-R4 + U-16/U-17/残留） | 见各批 |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | **C-60 终章** | 见文件 |

**当前发布基准：0.1.6 / `bb84e247bd2b97765fa514759ab0562e7f7d0a699c48a310ddf1ea333568e180`**

## 第 107 批登记（0.1.7 最终收口，**项目完成**）

| 文档 | 变更 | 哈希（前 16） |
|---|---|---|
| `PROJECT-T20-FINAL-ACCEPTANCE-01.md` | 附录 Z **新增 Z.7**：U-16 / U-17 / U-17-PLUGIN-RESIDUE / T-28 / U-18 五条终态 + 0.1.7 哈希 + 已知限制 + **T-28 两个坑的记录** | `3e5bd27631d0a63c` |
| `PROJECT-T19-RELEASE-PLAN-01.md` | **附录 0.1.7（最终发布基准）**：82,374,606 B / `4ba13908…` / 校验命令 / 本版新增 / 覆盖安装指引 / 已知限制 | `95ed6ac8b9d8104c` |
| `PROJECT-T17-T14-PHASE1-01.md` | **附录 5**：源码 0.1.7 / dist-017 0.1.7 / 已装 0.1.0（D-32 a） | `91b1d4e754a11b67` |
| `PROJECT-UI-AVAILABILITY-01.md` | 第 73–106 批全过程（UI 10 条 + T-25/26/27/28 + T-08 + OPT4-R4 + U-16/17/18） | 见各批 |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | **C-61 终章** | 见文件 |

**最终发布基准：0.1.7 / `4ba139084c7dcba5cea30d4bee674bab27f9c8669ef4c01ea80949ebb999d9f4`**

## 第 108 批登记（0.1.8）

| 文档 | 变更 | 哈希（前 16） |
|---|---|---|
| `PROJECT-T20-FINAL-ACCEPTANCE-01.md` | 附录 Z **新增 Z.8**：U-19 / U-20 / U-21 + 0.1.8 哈希 + 已知限制 | `b9aaf76f3bd5127e` |
| `PROJECT-T19-RELEASE-PLAN-01.md` | **附录 0.1.8**（取代 0.1.7） | 见文件 |
| `PROJECT-T17-T14-PHASE1-01.md` | **附录 7**：0.1.8 / 0.1.8 / 已装 0.1.7 | 见文件 |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | **C-62** | 见文件 |

**当前发布基准：0.1.8 / `5d3136b38e7d2416fd989b1e1c0013c6f0ff1a63a0b6c91feb905cf1896c6a44`**

## 第 110 批登记（0.1.9）

| 文档 | 变更 |
|---|---|
| `PROJECT-UI-AVAILABILITY-01.md` | §六十九：U-22 实现 + 6 条验证 + **U-23 新缺口** |
| `PROJECT-T19-RELEASE-PLAN-01.md` | 附录 0.1.9（含 U-23 已知缺口） |
| `PROJECT-T17-T14-PHASE1-01.md` | 附录 8（源码/产物 0.1.9，已装 0.1.7） |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | **C-63** |

**当前基准：0.1.9 / `b5dbb6427b5b108f247a72514345690de12b7b7b7fc4a108fd54aeec690189aa`**

## 第 111 批登记（0.1.10）

| 文档 | 变更 |
|---|---|
| `PROJECT-UI-AVAILABILITY-01.md` | §七十：U-23 修复 + 实机验证 |
| `PROJECT-T19-RELEASE-PLAN-01.md` | 附录 0.1.10 |
| `PROJECT-T17-T14-PHASE1-01.md` | 附录 9 |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | **C-64** |
| `PROJECT-T20-FINAL-ACCEPTANCE-01.md` | 附录 Z.9：0.1.9/0.1.10 补录（U-22/U-23） |

**当前基准：0.1.10 / `f94900cecaeaa54650e5d28dce3f5d3bc6840fd445c878aeb2dd51b382df3816`**（第 112 批确认）
