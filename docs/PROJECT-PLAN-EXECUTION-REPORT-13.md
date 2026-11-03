# 第 13 批执行报告（PROJECT PLAN EXECUTION REPORT 13）

> **计划名（权威）**：`PROJECT-PLAN-EXECUTION-REPORT-13.md`
> **任务书名（别名）**：C-6/C-7 影子目录与目录级切换方案设计
> **批次**：第 13 批 — T-02 严格方案 A 的**可行性论证与方案设计**
> **时间**：2026-11-02 02:14–02:26｜**授权**：A0 只读 + A1 写文档 + A2/A3（仅限探针脚本与影子目录，**不含真实 src/tests 覆盖**）
> **本批定性**：**只做只读核查 + 平台实测 + 方案设计。真实 src/tests 一次都没有被覆盖、移动或删除。**

---

## 0. 四阶段口径（本批结论必须先读这一节）

用户明确要求区分四个阶段，且不得互相冒充。本批的实际到达点：

| 阶段 | 本批状态 | 证据 / 说明 |
|---|---|---|
| **① 方案设计完成** | ✅ **达成** | 本文 §5 给出了完整的状态机、日志格式、恢复规则与执行序列 |
| **② 静态审查通过** | ✅ **达成**（限于本批新增的探针与变体实测） | 43 项平台探针（§3）+ 8 次 tsc 变体实测（§2.3）；台账 MD5 未变 |
| **③ 实际演练完成** | ❌ **未执行** | 真实 `src/` 与 `tests/` 未被覆盖；`git`-less 工作区未做任何搬移 |
| **④ 恢复验证通过** | ❌ **未执行** | 没有演练就没有恢复，不存在"已恢复"这回事 |

> **额外重要结论（改变了 ③ 的可达性）**：本批实测证明 **C-6 在任何文件组合下都无法构成可编译的旧世代**（§2.3 变体 V1/V2/V3/V6/V7 全部非零错误）。
> 因此 **C-6 的"行为验证"在原理上不可达**，只能验证"切换与还原动作本身的完整性"。
> **C-7 则可以**（变体 V5 达到 0 错误）——但需要一处**世代定义修正**，见 §2.4。

---

## 1. 只读核查：C-6 / C-7 全部文件与哈希（与第 12 批逐字节一致）

### 1.1 C-6 = `.cache/bh03-backup-1532`（5 个文件）

来源：BUG-HUNT-03 修复前的快照（2026-11-01 15:33）。**只含 5 个文件，不是完整 `src` 快照。**

| # | 文件 | 备份 SHA-256 | 备份字节 | 当前 SHA-256 | 当前字节 | 关系 |
|---|---|---|---|---|---|---|
| 1 | `src/main/codegen/preview.ts` | `eb460f12a3f3996e370154c353fa5bfa22c526e2886f757e3d7825306891b507` | 11,269 | `0ba2a03468bc135c9827d6f46017bd2c45c4637e377e085adb6f7d0bb7d3b0a1` | 11,696 | 不同 |
| 2 | `src/main/handlers/recipeHandlers.ts` | `63d0bc837fc3dadbf69d28d334e51503aab2545d1e83c6c3b2d326a279b6c730` | 2,119 | `73adb328f01f2b42383ee63e75f2764159b36b27aef48af06ec4678cf05bf143` | 2,457 | 不同 |
| 3 | `src/main/plugins/loader.ts` | `387fd44529e72f66503e842fb653f482bb713ebae5ac933caed97a5df01b7767` | 20,273 | `915c9e7c0bbb6338d8eaa5593dee4854e35609e1ab4aefb964780e87f00fe896` | 25,613 | 不同 |
| 4 | `src/main/scanner/itemIndex.ts` | `c45a8a938ab12ff47aaf6d877d762c911e026265de407c6877383928a9f18fd6` | 1,563 | `0ef4b64357120c79d91467669f529ce12eea1314c24f4d088634c168ead4e62c` | 2,491 | 不同 |
| 5 | `src/shared/search.ts` | `2b3e2b2b918a4a60d0034b6e7de67d5fad777f6c9fabb37efb711ad2886c1bb0` | 15,026 | `20f1aeb326dda95468249755ad6eab77a6a1bcd93eca2bdfec9c8d56b65c9ab1` | 16,104 | 不同 |

### 1.2 C-7 = `.cache/bh02-rv1-fix-backup-0911`（10 个文件）

来源：BUG-HUNT-02-RV1 修复前的快照（2026-11-01 09:11）。含 `src` 8 个 + `tests` 2 个。

| # | 文件 | 备份 SHA-256 | 备份字节 | 当前 SHA-256 | 当前字节 | 关系 |
|---|---|---|---|---|---|---|
| 1 | `src/main/codegen/preview.ts` | `8c634141e5a6caaeb15711c052d658f44d45512ffc6f5416a2136a749d29cebd` | 10,843 | `0ba2a03468bc135c9827d6f46017bd2c45c4637e377e085adb6f7d0bb7d3b0a1` | 11,696 | 不同 |
| 2 | `src/main/handlers/itemsHandlers.ts` | `9a0d120bf102b0fa9efed971a1a3a138be2e9e5ca2a109f3f1e591aa66d70143` | 2,137 | 同左 | 2,137 | **相同** |
| 3 | `src/main/plugins/hookSandbox.ts` | `558b922d6b62d569751e63f1b3313f15a63746782f5c74f60d3c33f23b5994cd` | 10,874 | `3924313a71fda33c6b0227e6a5ab2e2dac5bc17bc268d82718513faba628f16d` | 13,131 | 不同 |
| 4 | `src/main/plugins/loader.ts` | `02c9727678202b3ed853595ba45ddcd9ddab18474296b4053d4c9c25c8aa1907` | 18,569 | `915c9e7c0bbb6338d8eaa5593dee4854e35609e1ab4aefb964780e87f00fe896` | 25,613 | 不同 |
| 5 | `src/main/recipes/selectSchema.ts` | `715cce40521e567bacf26607a57defdea651980ebc9062ccfffc3f49c1f08c4c` | 2,907 | 同左 | 2,907 | **相同** |
| 6 | `src/main/scanner/itemIndex.ts` | `c45a8a938ab12ff47aaf6d877d762c911e026265de407c6877383928a9f18fd6` | 1,563 | `0ef4b64357120c79d91467669f529ce12eea1314c24f4d088634c168ead4e62c` | 2,491 | 不同 |
| 7 | `src/main/schema/registry.ts` | `8c0806d759887f7f238acea21db36e8259bdd0e96fb8a96b21e54755c43e92c6` | 13,815 | `87695eb6837d9ae51ac2a7621e3638b9ad3dd8815fb6dc4799f67cf9c3f2f6ad` | 18,091 | 不同 |
| 8 | `src/main/schema/service.ts` | `1c4f290cf8b7f5f6a0d15f5943a1c2f63ea0f629bd1323117d81cde240f7cecb` | 7,545 | `1e0e788f24a8daf14f095987afa6b04f241096c8205cde7ab22a5275e3b5028d` | 9,505 | 不同 |
| 9 | `tests/main/schemaMerge.test.ts` | `c81b31a8e56ec63286229f9f24f9cb37c0c9c46c16847be1fd3c39675aa50e6d` | 7,053 | `acd23dc360c904d722d4b333a349d09eab8ec77ab2b8b2fec90ee47b62d2c552` | 8,240 | 不同 |
| 10 | `tests/plugins/hookBlacklist.test.ts` | `6a1bfda779109daeafa4c95eddc51d895c413afec8e4c610b45740a19b9677b2` | 3,800 | `e53db07acf6d62ba24b512b341b5faa066dbcda2d9c6073b296106d5d989b84c` | 5,218 | 不同 |

> **10 项中 2 项无需覆盖**（`itemsHandlers.ts`、`selectSchema.ts` 与当前逐字节相同）。
> 这既是"备份完整性"的正面证据，也说明 **C-7 的有效覆盖集是 8 个文件**（原第 12 批结论在此复核成立）。

### 1.3 loader.ts 的真实世代谱系（5 代，本批补齐）

第 12 批只列了 C-6/C-7 两端；本批把 `.cache` 下所有源码副本一并归档，得到完整链条：

| 代 | 来源文件 | SHA-256 | 字节 |
|---|---|---|---|
| G0（最旧） | `.cache/bh02-rv1-fix-backup-0911/src/main/plugins/loader.ts` | `02c9727678202b3ed853595ba45ddcd9ddab18474296b4053d4c9c25c8aa1907` | 18,569 |
| G1 | `.cache/bh03-backup-1532/src/main/plugins/loader.ts` | `387fd44529e72f66503e842fb653f482bb713ebae5ac933caed97a5df01b7767` | 20,273 |
| G2 | `.cache/fix01/loader.pre-20261101-233919.ts` | `cb7d3c85944714926471cf8fd8115fd8c84eba1b18692052aa28ac3c2ecc6151` | 20,433 |
| G3 | `.cache/fix02/loader.pre-20261101-235657.ts` | `9d4ec283d8d7b4f3ee97f7a5221aeae3dd0693f10438224d538c7cf1992400e4` | 21,608 |
| **G4（当前）** | `src/main/plugins/loader.ts` | `915c9e7c0bbb6338d8eaa5593dee4854e35609e1ab4aefb964780e87f00fe896` | 25,613 |

`.cache/fix09-drill/loader.before-C1.ts` 与 `loader.before-C2.ts` 均为 G4（`915c9e7c…`），与当前逐字节相同。

**其余文件的世代数与要点**

| 文件 | 世代数 | 链条（旧 → 新） |
|---|---|---|
| `src/main/schema/service.ts` | 4 | `1c4f290c`(C-7) → `79dc3325`(`.cache/fix03/service.pre.ts`，**重建值**) → `487f8b9a`(`.cache/fix03/service.current.ts`) → `1e0e788f`(当前) |
| `src/main/codegen/preview.ts` | 3 | `8c634141`(C-7) → `eb460f12`(C-6) → `0ba2a034`(当前，= `.cache/bh03-preview-fixed.ts`) |
| `src/main/scanner/itemIndex.ts` | 2 | `c45a8a93`(C-6 与 C-7 同值) → `0ef4b643`(当前，= `.cache/bh03-itemIndex-fixed.ts`) |
| `src/main/plugins/hookSandbox.ts` | 2 | `558b922d`(C-7) → `3924313a`(当前) |
| `src/main/schema/registry.ts` | 2 | `8c0806d7`(C-7) → `87695eb6`(当前) |
| `src/main/handlers/recipeHandlers.ts` | 2 | `63d0bc83`(C-6) → `73adb328`(当前) |
| `src/shared/search.ts` | 2 | `2b3e2b2b`(C-6) → `20f1aeb3`(当前) |
| `tests/main/schemaMerge.test.ts` | 2 | `c81b31a8`(C-7) → `acd23dc3`(当前) |
| `tests/plugins/hookBlacklist.test.ts` | 2 | `6a1bfda7`(C-7) → `e53db07a`(当前) |

> **注意 C-6 与 C-7 的时间关系是交叉的**：`preview.ts` 在 C-6 里是**中间代**（`eb460f12`）、在 C-7 里是最旧代；`loader.ts` 在 C-6 里是 G1、在 C-7 里是 G0。
> 即 **C-6 比 C-7 新，但两者都只备份了"当时被改的文件"**。这一点直接导致 §2 的根本问题。

---

## 2. 关键发现（本批最重要的两件事）

### 2.1 发现一：C-6 / C-7 是"文件选集"，不是"世代快照"

| 项 | C-6 | C-7 |
|---|---|---|
| 备份内文件数 | 5 | 10（有效 8） |
| 是否为完整 `src` | **否**（当前 `src` 有 184 个文件） | **否** |
| 是否自洽 | **否**（见 2.3） | **是**（需一处修正，见 2.4） |

**"目录级切换"要求一个完整的世代**。要用现有备份构造完整世代，只能"当前全量 + 用备份覆盖那几个文件"——
这会生成一棵**从未在任何时刻真实存在过的合成树**，其自洽性必须实测，不能假定。

### 2.2 发现二：Windows 上不存在原子目录切换

这是本批用实测推翻的假设（第 12 批 §2.3 末段把"影子目录 + 目录级切换"当作"能给中断自动回滚"的方案，实测表明它**不能**）：

| 探针 | 行为 | 结论 |
|---|---|---|
| **P-1** | `renameSync(dirA, dirB)`，`dirB` 已存在且非空 → `EPERM` | **目录不能覆盖目录** |
| **P-1b** | `dirB` 为空目录 → 仍然 `EPERM` | **连空目录也不能覆盖** |
| **P-3** | `renameSync(junctionNew, junctionOld)` → `EPERM` | **junction 也不能被 rename 覆盖** → 无法"原子换指针" |
| **P-2** | 目标不存在（同卷）→ 成功，内容完整 | 唯一可用的 rename 形态 |
| **R-6** | 目标名已存在时 rename → `EPERM` | **不会静默吞掉旧世代**（安全性有保障） |

> **因此目录级切换必然是"两段 rename"**：`rename(live → 旧世代名)` 然后 `rename(新世代 → live)`。
> 中间存在一个 **`live` 完全不存在的缺口窗口**。这是平台硬限制，不是实现选择。

**缺口窗口的定量（Q-5，20 次采样）**：

| 指标 | 值 |
|---|---|
| 两次 rename 之间的 JS 间隔（中位数） | **1.015 ms** |
| 同上（最大值） | **1.204 ms** |
| 完整"切换"（2 次 rename，Q-4） | **2.25 ms** |
| 完整"还原"（2 次 rename，Q-4） | **2.20 ms** |

**为什么不采用 junction 间接层（Q-6）**：

| 方案 | 单次切换成本 | 是否需要改动工作区结构 | 是否解决缺口 |
|---|---|---|---|
| 双 rename（推荐） | **2.25 ms** | 否 | 否（缺口 ≈1 ms） |
| junction：`rmdir` + `symlink` | **33.53 ms**（中位）/ 54.72 ms（最大） | **是**（`src` 会长期变成 reparse point） | 否（P-3 已排除原子替换） |

junction 方案**慢 15 倍、且必须持久改变工作区结构，却换不到任何额外的原子性** → **不采用**。这是数据支撑的取舍，不是偏好。

### 2.3 世代自洽性实测（8 次 tsc，影子树内完成，不触碰真实 `src`）

做法：`cp -r src` + `cp -r tests` 到 `.cache/fix13/<变体>/`，写同构 `tsconfig`（`baseUrl` 指向变体根，`paths` 与 `tsconfig.node.json` 一致），再 `tsc --noEmit`。

| 变体 | 定义 | 错误数 | src 侧错误 | 判定 |
|---|---|---|---|---|
| **ctl** | 未改动的影子副本（**控制组**） | **0** | — | 构造方式无副作用 ✅ |
| **V1** | C-6 原样（5 文件） | **18** | 1（`service.ts` 缺 `getPluginLoadStatus`） | ❌ 不可编译 |
| **V2** | V1 + 换入 C-7 的旧 `service.ts` | **18** | 1（旧 `service.ts` 缺 `registry.providedSchemas`） | ❌ |
| **V3** | V2 + 临时移出 2 个新测试文件 | **1** | 1（同上） | ❌ |
| **V4** | C-7 原样（10 文件） | **17** | **0** | src 自洽 ✅；测试侧 17 处 |
| **V5** | V4 + 临时移出 2 个新测试文件 | **0** | — | ✅ **完全自洽** |
| **V6** | C-7 为底 + C-6 的 5 文件覆盖 + 移出 2 测试 | **2** | 2（C-6 的 `loader.ts` 要 `registry.refreshEffective` / `snapshotLayer`，旧 `registry` 没有） | ❌ |
| **V7** | 当前 `src` + C-6 的 5 文件 + 移出 2 测试 | **1** | 1（`service.ts` 缺 `getPluginLoadStatus`） | ❌ **无法隔离掉** |

**根因（可核对到行）**

1. `src/main/schema/service.ts:26` → `import { getPluginLoadStatus } from '../plugins/loader'`；该导出是 **FIX-02（2026-11-01 23:56 之后）** 才加入的。
2. C-6 备份拍于 **15:33**，其 `loader.ts`（`387fd445`，G1）**没有** `getPluginLoadStatus`，也没有 2 个新导出（`getPluginLoadStatus` + `PluginLoadStatus` 接口，共 18 个导出 vs 16 个）。
3. 所以把 C-6 的 `loader.ts` 放到"今天的工作区"里，**必然**与今天新增的调用方冲突 —— 这是时间旅行错配，不是方案缺陷。
4. 把 C-6 叠在 C-7 上（V6）也不行：C-6 的 `loader.ts` 又需要 `registry.refreshEffective` / `snapshotLayer`，而 C-7 的旧 `registry.ts` 里没有这两个导出（旧 registry 有 `providedSchemas`，新 registry 反而没有）。
   → **C-6 与 C-7 之间是"互相都不满足"的错配，不存在把两者拼成自洽树的组合。**

**结论**：
- **C-6 的行为验证在原理上不可达。** 无论伙伴文件取旧（V2/V3/V6）还是取新（V1/V7），`src` 侧都至少残留 1 处编译错误。
- **C-7 可以达到完全自洽**（V5 = 0 错误），前提是**移出 2 个"后于备份新增"的测试文件**。

### 2.4 C-7 的世代定义修正（需负责人批准）

| 项 | 内容 |
|---|---|
| 冲突测试文件 | `tests/main/pluginLoadFailurePreservesLayer.test.ts`（9 处）、`tests/main/schemaPluginFailureSnapshot.test.ts`（8 处） |
| 原因 | 二者都引用 `getPluginLoadStatus`，而 C-7 的 `loader.ts` 没有该导出（它们晚于 C-7 备份才存在） |
| 建议处置 | **演练期临时移出**（不是删除）到 `.cache/fix13/<gen>/parked/`，**还原时原样放回并用哈希验证** |
| 与"不删/不跳/弱化测试"纪律的关系 | **不冲突**：移出是"回退到该世代本不存在这些文件"的忠实还原；还原后逐字节一致，且还原后用例总数必须回到 86 文件 / 781 用例（见 §7 V-5） |
| 若负责人不同意移出 | 只能退化为"仅验证动作完整性"（同 C-6 口径），得不到行为证据 |

---

## 3. 影子目录与工作区的隔离方式

### 3.1 位置选择：`.cache/fix13/gen-<id>/`

| 候选 | 同卷 | 被门禁拾取 | 结论 |
|---|---|---|---|
| `.cache/fix13/gen-<id>/` | ✅ `dev=3391596976`（与项目根、`src`、`tests`、`docs` 全部相同） | **不会**（见 3.2） | **采用** |
| 工作区外（如 `E:/_mc-kjs-drill_<ts>/`） | ✅ 同卷 | 不会 | 不必要地污染盘根目录，且与既有 `.cache/*` 惯例冲突 → 不用 |
| `src/` 内部 | ✅ | **会**被 tsc/eslint/vitest 扫到 | **禁止** |

### 3.2 隔离性的四项配置证据（逐条核对，不是推断）

| 门禁 | 配置位置 | 原文 | 对 `.cache/fix13/**` 的效果 |
|---|---|---|---|
| `vitest` | `vitest.config.ts:13` | `include: ['tests/**/*.test.ts']` | 模式以 `tests/` 开头锚定 → `.cache/fix13/x/tests/...` **不匹配**（Q-8 实测 `match=false`） |
| `tsc`（node） | `tsconfig.node.json:28-36` | `include: ["src/main/**","src/preload/**","src/shared/**","tests/**"]`，`baseUrl: "."` | 同理锚定 → **不匹配** |
| `tsc`（web） | `tsconfig.web.json` `include` | `["src/renderer/src/**","src/preload/index.d.ts","src/shared/**","tests/renderer/**"]` | 同理 → **不匹配** |
| `eslint` | `.eslintrc.cjs:13` | `ignorePatterns: ['out/','dist/','node_modules/','.cache/']` | **显式忽略 `.cache/`** → 不扫 |
| `git` | 非 Git 仓库 | — | 无 `.gitignore` 生效问题（`.gitignore` 里也列了 `.cache/`） |

**实测佐证**：`ctl` 变体（`.cache/fix13/ctl/` 整棵 `src`+`tests` 副本）在**未被任何门禁拾取**的前提下，用**独立的 tsconfig** 编译出 0 错误 —— 既证明副本可用，也证明它没有污染主门禁。

### 3.3 残留的隔离风险（必须记录）

| # | 风险 | 说明 | 缓解 |
|---|---|---|---|
| I-1 | `vitest run <显式路径>` **不受 `include` 限制** | 若有人误传 `.cache/fix13/**/*.test.ts`，影子测试会真的跑起来 | 演练脚本禁止对影子目录跑 vitest；报告中记录 |
| I-2 | `.cache` 内有 **硬链接副本**（`pc3/pc5/pc7-pack-1112`，`nlink=4`） | 新增 `.cache/fix13/` 不触碰它们，但清理脚本若用通配符会误伤 | 只允许按 `.cache/fix13` 精确路径操作 |
| I-3 | 磁盘占用 | 影子树 = 278 文件 / 1,774,134 B（`src` 184 / 1,161,209 B + `tests` 94 / 612,925 B）；冷备再一份 → 约 **3.5 MB** | 当前剩余 **739 GB**（Q-7：`freeBytes=792,742,608,896`），无压力 |

---

## 4. 切换与还原的实测行为（Q-4 / R-1～R-5）

### 4.1 正向：在影子副本上完整走通"切换 → 还原"

| 指标 | 值 |
|---|---|
| 切换（2 次 rename）耗时 | **2.25 ms** |
| 切换后逐个文件哈希 == 新世代 | **是**（`fwdHashEq=true`，184 文件） |
| 还原（2 次 rename）耗时 | **2.20 ms** |
| 还原后逐个文件哈希 == 演练前 | **是**（`backHashEq=true`） |
| rename 是否零拷贝 | **是**（R-5：目录 rename 前后 `ino` 完全相同 `281474979790812`） |

### 4.2 反向：故障与恢复（这是方案能不能成立的关键）

| 探针 | 场景 | 实测结果 | 意义 |
|---|---|---|---|
| **R-1** | 目录内有打开的文件句柄时 rename 第 1 段 | `EPERM`；`live` 仍在、**逐文件哈希不变**、无 `old` 残留 | **fail-closed：失败即零损伤** |
| **P-7 / P-7b** | 同上，但对比"改文件"与"改目录" | **目录 rename 被句柄阻塞（EPERM）；单个文件 rename 不被阻塞（SUCCESS）** | 目录级切换比文件级**更脆**（这是它的代价） |
| **R-2** | 另一进程持有句柄 → 释放后重试 | 持有期 `EPERM`；杀掉子进程后**重试成功** | **重试模型有效**，必须内置退避重试 |
| **R-3** | 最坏中间态（`live` 缺失 + 新世代不可用） | 前滚 `EPERM`；**回滚 rename 成功且哈希一致**（20 文件） | **最坏态可确定性恢复** |
| **R-4** | `live` 缺失 → 前滚 | **成功**，内容 == 新世代 | 前滚与回滚**都可行** |
| **R-6** | 世代目标名已被占用 | `EPERM` | **不会静默覆盖旧世代** |
| **R-7** | 用全量哈希识别当前 `live` 是哪一代 | 正确识别为 `A(旧)` | 恢复判据可**不依赖 phase 计数**（更鲁棒） |

### 4.3 文件时间戳保真（关系到项目"用时间戳判断并行改动"的约定）

| 探针 | 结论 |
|---|---|
| **S-2** | `cpSync` **默认参数**：278 文件 `mtime` 与原文件**全部逐位相同**（`0/278`）—— Win32 `CopyFileW` 本身保留最后写入时间 |
| **S-3 / S-4** | **显式加 `preserveTimestamps: true` 反而引入漂移**：`238/278` 不同，样本原始 `1793393133018.1257` vs 副本 `1793393133018.1265`（误差 ~0.0008 ms，属 `utimes` 精度路径的副作用） |
| **S-5（更正后）** | 默认 `cpSync` + 目录 `rename` 搬移后：`copyMtimeDiff=0`、`afterRenameDiff=0`、`afterRenameBackDiff=0`（`probe5.mjs` 独立重测，184 文件逐位相同） |

> **探针自身缺陷声明（S-1 纪律）**：`probe4.mjs` 的 **S-5 结论无效** —— 它错误地在"已用 `preserveTimestamps` 拷贝出来的树"上测 rename，测到的是 `utimes` 漂移而非 rename 行为。
> 已用独立脚本 `probe5.mjs` 在**默认参数**的副本上重测并更正：**rename 不影响 `mtime`，默认 `cpSync` 也不影响**。
> **工程结论：演练脚本必须使用默认参数的 `cpSync`，绝不加 `preserveTimestamps`。**
> 同一脚本的 **P-10** 因在 ESM 中误用 `require('node:crypto')` 而失败（`ReferenceError`），**未重跑** —— 该指标（全量哈希耗时）已由 **Q-3** 以 `109 ms / 278 文件` 独立测得，不影响结论。

---

## 5. 方案设计（T-02 / 方案 A 修正版）

> 本节是**设计**。§7 会逐条说明哪些条件只能由"实际演练"满足。

### 5.1 世代定义

```
.cache/fix13/
├─ cold-<ts>/                 冷备（唯一真相，先于一切操作，且不参与切换）
│   ├─ src/  tests/           全量 278 文件
│   └─ manifest-cold.json     {path: {sha256, bytes, mtimeMs}}
├─ gen-<id>/                  世代根
│   ├─ live/                  ← 切换时 rename 到项目根的候选
│   │   ├─ src/  tests/
│   │   └─ manifest-live.json
│   ├─ prev/                  切换后"旧世代"落到这里（内容 = cold）
│   └─ parked/                演练期临时移出的测试文件（含 manifest-parked.json）
└─ journal.jsonl              只追加的意图/完成日志（每行 fsync）
```

### 5.2 每个目录的状态空间（`D ∈ {src, tests}`，两目录独立判定）

| 状态 | `live` | 旧世代目录 | 新世代目录 | 恢复动作 |
|---|---|---|---|---|
| **D0** | 存在=旧 | 不存在 | 存在 | 无需动作（未切换） |
| **D1** | **缺失** | 存在 | 存在 | **前滚** `rename(new→live)` 或 **回滚** `rename(old→live)`，二者皆确定 |
| **D2** | 存在=新 | 存在 | 不存在 | 已完成；回滚需 `rename(live→tmp)` + `rename(old→live)` |
| **D3** | 存在=旧 | 不存在 | 存在 | 已回滚完成 |

> **不用 phase 计数作判据**，用 §4.2 的 **R-7 方法**：对 `live` 求全量 manifest（278 文件 / 109 ms），与 `manifest-cold.json`、`manifest-live.json` 比对，判定它到底是哪一代。这比"读到 phase=3 所以应该……"更鲁棒（日志可能因崩溃丢最后一行，哈希不会说谎）。
> **哈希都不匹配** → 进入 §6.4「哈希不一致」流程，**停止并上报**。

### 5.3 执行序列（C-7 为例；C-6 见 §5.5）

**阶段 1 · 冷备（任何写操作之前）**
1. 校验 §1.2 的 8 个备份文件哈希，任一不符 → **中止**。
2. `fs.cpSync` 默认参数把 `src`、`tests` 复制到 `cold-<ts>/`；`cpSync` 后再逐文件算 `manifest-cold.json`。
3. **回读校验**：`manifest-cold.json` 的 278 条哈希与真实 `src/tests` 逐条比对，必须全等 → 否则**中止**（此时源码未动）。
4. `journal.jsonl` 追加 `{ev:'cold-ok', manifest, ts}` 并 `fsync`。
5. 断言冷备目录的文件数 = 278 且逻辑字节 = 1,774,134 B。

**阶段 2 · 构造新（=旧）世代**
6. `cpSync(cold/src → gen-<id>/live/src)`、`cpSync(cold/tests → gen-<id>/live/tests)`。
7. 用 C-7 备份覆盖 `gen-<id>/live/` 中 8 个有效文件；**跳过** 2 个"与当前相同"的项（`itemsHandlers.ts`、`selectSchema.ts`）并显式记录"跳过原因"。
8. 把 2 个冲突测试文件**移动**到 `parked/`，写 `manifest-parked.json`。
9. `manifest-live.json` = 覆盖完成后的全量哈希。
10. **编译门禁（关键，新增于本批）**：对 `gen-<id>/live` 用同构 tsconfig 跑 `tsc --noEmit`，**必须 0 错误**。
    - 这是 §2.3 V5 的可复现化：**把"世代自洽"变成前置条件，而不是演练的意外**。
    - 非 0 → **中止**（源码仍未动），报告错误清单。

**阶段 3 · 切换（每目录 2 次 rename，逐次 fsync 日志）**
11. `journal` 写 `{ev:'switch-intent', dir:'tests', newManifestHash, oldManifestHash}` → fsync。
12. `rename(live/tests → prev/tests)`（第 1 段）；日志 `{ev:'sw1-ok'}`。
13. `rename(gen/live/tests → <root>/tests)`（第 2 段）；日志 `{ev:'sw2-ok'}`。
14. 对 `<root>/tests` 求 manifest，与 `manifest-live.json` 比对 → 不等 → **紧急回滚**。
15. `src` 重复 11–14。
16. 观察点：跑定向测试，记录失败形态（见 §7 V-2 的**重新定义**）。

**阶段 4 · 还原（对称，逐目录 2 次 rename）**
17. `rename(<root>/src → gen/new/src)`；`rename(prev/src → <root>/src)`；manifest 复核。
18. `tests` 重复。
19. 从 `parked/` 移回 2 个测试文件，逐文件哈希与 `manifest-parked.json` 比对。
20. **终态校验**：全量 manifest == `manifest-cold.json`（278 条全等）+ `mtimeMs` 逐条相等。
21. 跑完整门禁：`vitest run` / `typecheck` / `lint`，期望 **86 文件 / 781 用例 / 0 失败**、typecheck 0、lint 0。
22. `journal` 写 `{ev:'restored-ok'}`。

### 5.4 每步的重试与中止策略

| 情形 | 处理 |
|---|---|
| rename 返回 `EPERM`/`EBUSY` | 退避重试 5 次（50 / 100 / 200 / 400 / 800 ms）。第 1 段重试耗尽 → **中止且零损伤**（R-1 已证）；第 2 段重试耗尽 → **立刻执行回滚**（R-3 已证可行） |
| 单步 > 300 s | 中止 |
| 磁盘剩余 < 200 MB | 中止（当前 739 GB，风险为零但保留检查） |
| manifest 任一处不等 | 中止，**不做"猜着修"**，按 §6.4 上报 |

### 5.5 C-6 的处置（与 C-7 不同）

C-6 **无法**达成自洽世代（§2.3）。因此有两选，**需负责人决定**（§9 D-25）：

| 选项 | 内容 | 能得到什么 | 代价 |
|---|---|---|---|
| **C-6a** | 只做"动作完整性"演练：换入 C-6 的 5 文件 → **不跑测试**，只验证 `live` manifest == 构造时 manifest、还原后 manifest == 冷备、门禁回到全绿 | 证明"多文件换入/还原动作完整可恢复" | **得不到任何"旧行为"证据**；换入期间树不可编译 |
| **C-6b** | 放弃 C-6 单独演练，把它并入 C-7（两者目标文件已有 3 项重叠） | 省一次风险暴露 | **丢失"BUG-HUNT-03 之前"这一历史断面的验证意义**；不建议 |
| **C-6c** | 承认 C-6 的回滚目标**不可达**，在台账/计划中把 C-6 从"待演练"改为"**备份粒度不足，需重新取快照**" | 诚实；并指向真正解法：**任何未来的多文件改动，备份必须是完整 `src`+`tests` 快照** | 需要负责人改状态 |

> 我倾向 **C-6a + C-6c 并行**：本批先把 C-6a 作为"动作验证"跑通（低风险），同时把 C-6c 的定性写进计划（因为它是**根因层面的结论**，比跑一次演练更有价值）。
> 但这是建议，**不代负责人决定**。

---

## 6. 故障场景分析（逐场景给触发条件、后果、可观测性、恢复）

### 6.1 中途强制终止（进程被杀 / 断电）

| 终止点 | 留存的 `live` | 状态 | 恢复动作 | 已实测 |
|---|---|---|---|---|
| 冷备完成前 | 原样 | — | 无（源码未动） | — |
| 构造新世代中 | 原样 | — | 删 `gen-<id>` 重来 | — |
| 第 1 段 rename 之前 | 原样 | D0 | 无 | — |
| **第 1 段之后、第 2 段之前** | **缺失** | **D1** | `rename(new→live)` 或 `rename(old→live)` | **R-3 / R-4 实测均可行** |
| 第 2 段之后 | 新世代 | D2 | 还原流程 | Q-4 实测可行 |
| 还原第 1 段之后 | 缺失 | D1′ | 同上（方向相反） | R-3 实测 |
| 还原第 2 段之后 | 旧世代 | D3 | 无 | — |

**诚实边界**：缺口窗口 ≈ **1.0–1.2 ms**（Q-5）。**不是原子操作**。
但相比第 12 批的文件级方案，它把"混合世代内容"这一**最难判定的状态彻底消除了**——`live` 要么整代旧、要么整代新、要么**整个不存在**。三者都可由"一次哈希 + 一次 `existsSync`"唯一确定。

### 6.2 切换失败（rename 报错）

| 失败点 | 后果 | 处置 |
|---|---|---|
| 第 1 段 `EPERM` | **零损伤**（R-1：`live` 完好、哈希不变、无 `old` 残留） | 重试→仍失败则**中止**，删 `gen`，源码不动 |
| 第 2 段 `EPERM` | `live` 缺失（D1） | **立刻回滚**（R-3 实测可行且哈希一致） |
| 目标名已存在（R-6） | `EPERM` | 说明上一次演练未清干净 → 中止并人工核对（**不会**静默吞掉旧世代） |

**为什么第 2 段会失败**：新世代目录内有进程持有的句柄（P-7 已证）。**缓解**：第 2 段执行前，对 `gen/live` 做一次"可 rename 探测"（对它的一个**临时同层副本**尝试 rename，成功即说明该子树无阻塞）；探测本身不改动 `gen/live`。

### 6.3 恢复失败

| 原因 | 触发 | 后果 | 兜底 |
|---|---|---|---|
| 冷备缺失/损坏 | `cold-<ts>` 被误删 | **无本地可恢复源** | 三重冗余：`cold/` + `gen-<id>/prev/`（切换后内容 == cold）+ `parked/`；三处都坏才真的失败 |
| 置换链断裂（`prev/` 与新世代都不可用） | 极罕见（两者同时不可用需人为误删） | 同上 | 同上 |
| 权限拒绝（文件只读） | P-11 实测：`readOnly` **不阻塞**目录 rename | 无 | — |
| 磁盘写满 | 739 GB 剩余 | 实际不会发生 | 前置检查 |

> **"恢复失败"的唯一现实成因是"人删了备份"，而不是技术故障。** 因此设计上要求 `cold/` 在演练开始时**立即**建立、并**在演练结束后保留**（不自动清理，需负责人同意才删）。

### 6.4 哈希不一致

| 表现 | 可能原因 | 处置（**禁止猜着修**） |
|---|---|---|
| 还原后某文件哈希 ≠ 冷备 | 冷备该文件损坏 / 还原时被并发改写 / 行尾或编码被编辑器改动 | ① 从 `prev/` 再取一份比对；② 两份都不同 → **停止**，把该文件的三份哈希写入报告，等负责人裁决；③ 禁止"用另一个副本覆盖过去让它通过" |
| `live` 哈希既不等于旧世代也不等于新世代 | 切换期间有外部进程改写 | 同上 |
| `mtimeMs` 不一致但哈希一致 | 复制路径选错（用了 `preserveTimestamps`） | 按 §4.3 更正：改用默认 `cpSync`；`mtime` 只作**辅助**判据，**哈希是主判据** |

**判据优先级（本批确定）**：**内容哈希 > 文件数 > 逻辑字节数 > mtime**。
`mtime` 只用于"是否有人在我之后动过文件"的辅助提示，**不作为通过条件**（因为 §4.3 已证明它可被工具参数无意改变）。

---

## 7. 验证标准（V 系列，重新定义）

> 第 12 批的 V-1～V-7 建立在"换入后测试会失败 = 旧行为证据"这一假设上。§2.3 已推翻该假设（失败形态是**编译/链接错误**，不含行为信息）。
> 因此本批**重新定义**，并把"能证明什么"写清楚。

| # | 条件 | 能证明什么 | 本批状态 |
|---|---|---|---|
| **V-1** | 换入后 `live` 全量 manifest == `manifest-live.json`（当前 278 条；C-7 为 276 条 + 2 条 moved） | 换入**内容**完全正确 | 设计完成，未验证 |
| **V-2**（修正） | 换入后 `tsc --noEmit` **0 错误**（前置门禁已在阶段 2 步骤 10 拦过，此处复核） | 旧世代**自洽** | 设计完成，未验证 |
| **V-3**（修正） | 换入后定向测试的**失败形态**必须被记录为「编译/链接失败」而非「断言失败」；**不得**用它论证旧行为 | 防止把"树不自洽"误读成"旧代码有问题" | 设计完成；**C-6 天然无法满足**（§2.3） |
| **V-4** | 还原后每个文件哈希 == `manifest-cold.json` | 还原**逐字节**完整 | 设计完成，未验证 |
| **V-5** | 还原后 `vitest run` = **86 文件 / 781 用例（774 passed + 4 skipped + 3 todo）/ 0 失败** | 无回归 | 设计完成，未验证 |
| **V-6** | 还原后 `typecheck` / `lint` 退出码 0 | 无回归 | 设计完成，未验证 |
| **V-7** | `mtimeMs` 逐条相等（默认 `cpSync` 路径下可达，§4.3） | 未破坏"时间戳判改动"的约定 | 设计完成；**机制已实测**（probe5：0 差异） |
| **V-8**（新增） | `journal.jsonl` 行数与阶段步数一致，且最后一行是 `restored-ok` | 恢复过程可审计 | 设计完成，未验证 |

---

## 8. 阶段结论与未达成事项

### 8.1 本批达成的（可复核）

| 项 | 证据 |
|---|---|
| 15 个文件哈希复核，与第 12 批逐字节一致 | §1.1 / §1.2（含 2 项"无需覆盖"复核成立） |
| 补齐 loader.ts 5 代、service.ts 4 代谱系 | §1.3 |
| 43 项平台探针（42 项可用，1 项因脚本缺陷失败） | `.cache/fix13/probe*-result.json` |
| 8 次 tsc 变体实测，含控制组 | §2.3（`ctl` 0 错 / V5 0 错 / 其余 1–18 错） |
| 证明"Windows 无原子目录切换"，并排除 junction 方案 | §2.2（P-1/P-1b/P-3/P-6/Q-6） |
| 证明"缺口窗口 ≈1 ms 且最坏态可确定性恢复" | Q-5 / R-3 / R-4 |
| 证明"目录级切换 fail-closed，失败零损伤" | R-1 |
| 证明"默认 `cpSync` 保 `mtime`，`preserveTimestamps` 反而漂移" | S-2 / S-3 / S-4 / probe5 |
| 证明"C-6 无法构成自洽世代"（双向错配） | V1/V2/V3/V6/V7 |
| **证明"真实源码零改动"** | 收尾把真实 `src`(184) / `tests`(94) 的全量 manifest 与 `ctl` 副本逐条比对：**`src` 全等、`tests` 全等**；`loader.ts`=`915c9e7c…`、`service.ts`=`1e0e788f…`、`registry.ts`=`87695eb6…`，与 §1 的"当前哈希"一致 |

### 8.2 本批**没有**达成的（不得含糊）

| 项 | 状态 |
|---|---|
| 真实 `src/` / `tests/` 的任何覆盖、移动、删除 | **0 次** |
| C-6 / C-7 实际演练 | **未执行** |
| 恢复验证 | **未执行** |
| 完整门禁（vitest / typecheck / lint）在真实工作区重跑 | **未执行**（本批不产生源码改动，无重跑必要） |
| C-7 换入后的**运行时**失败形态 | **未实测**（编译期 17 处已确定；运行期为 ESM 命名导出缺失，属推断） |

### 8.3 保护条件核对

| 条件 | 结果 |
|---|---|
| V9 台账只读 | ✅ MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51` 未变（`md5sum` 实测） |
| 不建 V10 / 不建计划 V1.2 | ✅ |
| 不碰生产 userData | ✅（本批全部操作在 `E:/mc kjs/.cache/fix13/`） |
| 不动 `dist/`、`dist-011/`、`E:/_trash_20261101_recipe-studio`、npm cache | ✅ 0 次 |
| 不构建 / 不装依赖 / 不启动应用 | ✅ 0 次（**只跑了 `tsc --noEmit`，属 A3 门禁**） |
| 不做真实整合包验证 | ✅ |
| 不初始化 Git | ✅ |
| 不删 / 不跳 / 弱化测试 | ✅ 未改任何测试文件 |
| 不执行多文件覆盖 | ✅ **本次指令的核心约束，已遵守** |
| 独立区分四个阶段 | ✅ §0 |

---

## 9. 需要负责人决定的事项

| # | 事项 | 选项 | 影响 |
|---|---|---|---|
| **D-25** | **C-6 的演练口径** | **C-6a** 只验动作完整性（推荐）/ **C-6b** 并入 C-7 / **C-6c** 改判"备份粒度不足，需重新取快照"（建议与 C-6a 并行） | 决定 T-02 的 C-6 分支能否关闭 |
| **D-26** | **C-7 是否允许"演练期临时移出 2 个测试文件"** | 允许（可得到行为证据）/ 不允许（退化为只验动作） | 决定 C-7 是否有行为验证价值 |
| **D-27** | **冷备目录演练后是否保留** | 保留（推荐，占 1.8 MB）/ 删除 | 影响"恢复失败"的兜底能力 |
| **D-28** | **是否把"多文件改动必须做完整 `src`+`tests` 快照"写成项目纪律** | 是（推荐）/ 否 | 从根上避免再次出现 C-6 这种"文件选集"备份 |

---

## 10. 附带发现（超出本批范围，仅登记不改动）

| # | 发现 | 证据 | 影响 |
|---|---|---|---|
| **F-1（G-35 候选）** | `src/main/plugins/hookSandbox.ts` 的导出**在生产代码中零调用方**，只被 3 个测试文件引用 | `grep -rn "inspectHookSource\|runHookSource\|runEmitHook\|HOOK_TIMEOUT_MS" src/` 只命中该文件自身；`hookSandbox` 在 `src/` 内无 import | 插件钩子**被解析但从不执行**；与 `P0-PL2`（渲染层无 `plugins:setEnabled`）同族，属功能性缺口，非本批可修 |
| **F-2** | 项目记忆里"层数据用 `setLayerProvider` / `providedSchemas` 注入"的说法**已过时** | 当前 `registry.ts` 导出中**没有** `providedSchemas`（`grep -rn providedSchemas src/` 零命中）；旧版（C-7）有；新增 `LayerFetch` / `snapshotLayer` / `fetchLayer` / `setFactsProvider` / `refreshEffective` | 已据此修正 `.workbuddy/memory/MEMORY.md`；后续引用以代码为准 |
| **F-3** | `src/main/plugins/loader.ts` 当前 18 个导出，C-6/C-7 世代均 16 个；差的 2 个是 `getPluginLoadStatus` + `PluginLoadStatus`（FIX-02 引入） | `grep -oE '^export …'` 三代对比 | 这是 §2.3 冲突的**唯一根因**，也是未来回退到 23:56 之前任何快照的**通用障碍** |

---

## 11. 下一步

| 需要 | 解锁 |
|---|---|
| **D-25 / D-26 答复** | 第 14 批可执行 C-6a 动作演练与 C-7 完整演练 |
| 若批复执行，需再次明确 A2/A3 覆盖范围 | 真实 `src/` / `tests/` 的目录级切换属**高危写操作**，需单独授权 |
| D-24（jsdom） | T-05、T-07-UI、P0-R3、T-10① |
| C7-F6 / C7-F1 的策略方向 | C7-F6、C7-F7 |

> **第 15 批补记（2026-11-02 02:41）**：负责人对"是否执行真实 C-6/C-7 覆盖演练"答复 **HOLD（暂不执行）**，记 `PROJECT-DECISIONS.md` §7 **D-29**。
> 本报告的性质不变：**方案设计完成 + 静态审查通过；实际演练未执行；恢复验证未执行**（见 §0）。
> 本报告中的 43 项探针与 8 次 `tsc` 变体实测**全部在 `.cache/fix13/` 的影子树上完成**，
> **不构成任何"真实工作区"结论**——该边界在 `PROJECT-PLAN-EXECUTION-REPORT-14.md` §0.1 单列成表。

---

## 12. 本批产物清单

| 路径 | 性质 |
|---|---|
| `docs/PROJECT-PLAN-EXECUTION-REPORT-13.md` | 本报告（新增） |
| `.cache/fix13/probe-swap.mjs` + `probe-result.json` | 平台行为探针（16 项）与结果 |
| `.cache/fix13/probe2.mjs` + `probe2-result.json` | 隔离/保真/成本探针（9 项）与结果 |
| `.cache/fix13/probe3.mjs` + `probe3-result.json` | 故障与恢复探针（7 项）与结果 |
| `.cache/fix13/probe4.mjs` + `probe4-result.json` | 时间戳探针（8 项，含 1 项已更正）与结果 |
| `.cache/fix13/probe5.mjs` | 时间戳更正重测 |
| `.cache/fix13/gen-consistency.sh`、`gen-variants.sh` + `tsc-*.log` | 8 次变体 tsc 实测脚本与日志 |
| `.cache/fix13/ctl/`、`c6/`、`c7/`、`v1..v7/` | 影子变体树（**由 `src`/`tests` 的 `cpSync` 副本构成，非真实源码**） |
| `.workbuddy/memory/MEMORY.md` | 精简整理（22,070 B → 15,923 B）；同步 F-2 |

> `.cache/fix13/` 总计 **39 MB / 4,810 个文件**（大部分是 8 棵变体树与探针临时树）。
> 保留原因：本报告 §2.3 / §3 的数字必须可复跑复算（S-2 纪律）。若需清理，**只允许**精确删除 `.cache/fix13` 整目录，
> 不得用通配符（同层有 `pc3/pc5/pc7-pack-1112` 等 `nlink=4` 硬链接副本）。
