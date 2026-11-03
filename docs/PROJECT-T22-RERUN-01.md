# T-22 · FIX-01/02/03 测试 **复验（2026-11-02 重跑）**

| 项 | 内容 |
|---|---|
| **任务名** | `T-22 · FIX-01/02 证据补档` |
| **报告标题口径** | **复验（2026-11-02 重跑）** —— **不是**「原始执行」 |
| **对应缺口** | **G-28** |
| **决策依据** | **D-20 = A**（重跑并落盘，标注为重跑） |
| **授权** | **A3**（跑测试）＋ **A1**（写本文件） |
| **执行时点** | 2026-11-02 06:08 GMT+8 |
| **性质** | 复验记录；**不补造** 2026-11-01 的历史输出 |

## 0. 边界（为什么标题必须写「复验」）

1. 本报告是 **2026-11-02 的重跑结果**。2026-11-01 修复当时的原始 stdout **已经丢失**（`FIX-01-02-EVIDENCE-AVAILABILITY.md` §4 E-1：该批未落盘，仅存在于对话记录，对话不是可复核的项目文件）。
2. 因此本报告**不能**替代原始执行证据，**只能**证明「在 2026-11-02 的代码状态下，这些用例全绿」。
3. 三层证据口径中，本报告属 **② 测试通过**；**不构成 ③ 真实环境已验证**（真实环境验证仍 **0/15**）。
4. 本报告**未修改任何测试文件**（只运行）。

---

## 1. 结论

| 项 | 结果 |
|---|---|
| 3 个测试文件 | **3 passed (3)** |
| 用例 | **22 passed ｜ 3 todo（合计 25）** |
| 失败 | **0** |
| 退出码 | **0** |
| 耗时 | 9.62 s（verbose 重跑 9.6 s 量级） |

**与历史摘要的对照**：历史称 FIX-01「修复后 7/7 通过」、FIX-02「绿 8 通过」。本轮实测为 **FIX-01 7 通过 + 4 待办中的 1 个 todo**、**FIX-02 8 通过 + 1 todo**、**FIX-03 7 通过 + 1 todo**。数量**不完全对应**，原因见 §4（用例已增补，且 `it.todo` 未计入 passed）。

---

## 2. 逐条命令（工作目录 `E:/mc kjs`）

```bash
# ① 默认 reporter（汇总）
./node_modules/.bin/vitest run \
  tests/main/pluginLayerFollowsModpack.test.ts \
  tests/main/pluginLoadFailurePreservesLayer.test.ts \
  tests/main/schemaPluginFailureSnapshot.test.ts

# ② verbose reporter（逐用例，用于本报告证据）
./node_modules/.bin/vitest run --reporter=verbose \
  tests/main/pluginLayerFollowsModpack.test.ts \
  tests/main/pluginLoadFailurePreservesLayer.test.ts \
  tests/main/schemaPluginFailureSnapshot.test.ts
```

**落盘位置**：

| 文件 | 内容 |
|---|---|
| `.cache/fix14/a3tmp/T22-rerun.out` | ① 的 stdout 全文 |
| `.cache/fix14/a3tmp/T22-rerun.err` | ① 的 stderr 全文（153 B，仅 Vite CJS 弃用提示） |
| `.cache/fix14/a3tmp/T22-verbose.out` | ② 的 stdout 全文（35 行） |
| `.cache/fix14/a3tmp/T22-verbose.err` | ② 的 stderr 全文 |

---

## 3. 完整输出（② verbose，已剥离 ANSI）

### 3.1 汇总

```
 Test Files  3 passed (3)
      Tests  22 passed | 3 todo (25)
   Duration  9.62s (transform 284ms, setup 0ms, collect 126ms, tests 8.18s, environment 0ms, prepare 254ms)
```

### 3.2 逐用例（22 条全 ✓）

**`tests/main/pluginLoadFailurePreservesLayer.test.ts` — FIX-02（9 tests ｜ 1 skipped）**

```
✓ T1：目录不存在 = 合法空（不是失败），且不抛异常
✓ T2：空目录 = 合法空，并清掉应当删除的旧插件（与失败明确区分）
✓ T3：读取失败时必须保留有效插件层，并明确记录失败
✓ T4：失败后恢复读取，必须能重新尝试并让新插件生效
✓ T5：A → B 且 B 读取失败：不得把 B 标记为成功，也不得清空 A 的有效数据
✓ T6：FIX-01 行为不回归（A↔B 切换、内置保留、虚拟通配跟随、稳态不重复加载）
✓ T7a：用户插件目录不可读时同样按失败处理（不静默变成空列表，也不清空层）
✓ T7b：单个插件文件解析失败只影响它自己，不清空其它可用插件
```

**`tests/main/schemaPluginFailureSnapshot.test.ts` — FIX-03（8 tests ｜ 1 skipped）**

```
✓ T1：插件加载成功时快照照常写入，稳态读取命中缓存
✓ T2：读取失败期间不得写入成功快照，每次读取都会重新装配
✓ T3：插件目录恢复后，一次正常读取即可自动重新加载（无需打开设置页/切包）
✓ T4：成功路径不因新增失败检查而重复加载插件
✓ T5：A→B（B 读取失败）不误标成功；B 恢复后用 B 的插件；B→A 回到 A 的插件
✓ T6a：失败发生在装配**过程中**（provider 调用期间）也不得留下成功戳
✓ T6b：失败发生在装配**之前**（独立加载调用）时与 T2 一致
```

**`tests/main/pluginLayerFollowsModpack.test.ts` — FIX-01（8 tests ｜ 1 skipped）**

```
✓ 前置：A 包冷启动时能在 schema:list 看到插件专属类型
✓ 前置：B 包冷启动时看不到该类型（证明差异来自包，而不是测试构造错误）
✓ T1：A → B（不进设置页、不调 plugins:list），A 专属插件类型不得再被使用
✓ T2：B → A（不进设置页），A 的插件 Schema 必须恢复且来源为 plugin
✓ T3：换包后内置试点 Schema 三个类型均不丢失
✓ T5：连续快速切换后，最终集合与最后选定的整合包一致
✓ T6：缓存有效时不重复读取插件目录，也不重复重建注册表
```

### 3.3 3 个 `it.todo`（未计入 passed）

| 位置 | 文本 |
|---|---|
| `pluginLayerFollowsModpack.test.ts:189` | T4：插件目录读取失败时不得清空仍然有效的插件层（本批不修，见 Q-02） |
| `pluginLoadFailurePreservesLayer.test.ts:333` | T7c：文件元数据（`statSync`）异常时的行为——需平台级条件，本轮无法稳定构造 |
| `schemaPluginFailureSnapshot.test.ts:323` | T6c：装配完成之后才发生插件读取失败的时序——需并发注入点，本轮无法稳定构造 |

> 三者**仍在原处**，本报告未改（T-10 会单独给结论，见 `PROJECT-T10-IMPLEMENTATION-01.md`）。

---

## 4. 与历史物证的对照（含一处**必须说明的哈希漂移**）

### 4.1 测试文件哈希

| 文件 | `EVIDENCE-AVAILABILITY` §2.2 记录 | **当前实测** | 说明 |
|---|---|---|---|
| `pluginLayerFollowsModpack.test.ts` | `5a3cfc44…` | **`83df51ef816ee44fab8106ec45bdc37e28834c13eb92a957441ab85ca412e7d0`** | **已变** |
| `pluginLoadFailurePreservesLayer.test.ts` | `8ebecd96…` | **`6cd20d8b3c313aa298af623fe507069aeda49d2fc5e6a381642dae45d744b051`** | **已变** |
| `schemaPluginFailureSnapshot.test.ts` | `e26450d2…` | **`5a82015a0cc22849ff71043f0aa70b3db3c8c38b516043e21d3e33010acaaf7d`** | **已变** |

**漂移原因（事实）**：第 28 批（续 3）为让全量测试在 safe-delete 宿主上跑通，把这 3 个文件里 6 处 `rmSync(H.userData, …)` 改为 `trashTmp(H.userData)`（移隔离区），并新增 `tests/helpers/cleanup.ts` 的 `trashTmp`。

**这不影响 T-22 的有效性**：

- 改动**只在 cleanup 行**，**零断言改动**（diff 已在第 28 批报告中逐行给出）；
- 22 个用例的标题、断言、被测量完全未变；
- 若只看「用例覆盖是否仍在」，本报告成立。

**但必须写明**：因此本次复验跑的**不是** 2026-11-01 当时的那份测试文件字节。任何「与历史逐字节一致」的说法都**不成立**。

### 4.2 用例数对照

| 项 | 历史摘要 | 本轮实测 | 差异原因 |
|---|---|---|---|
| FIX-01 | 7/7 通过 | 7 通过（+1 todo） | 一致；todo 不计入 passed |
| FIX-02 | 绿 8 通过 | 8 通过（+1 todo） | 一致 |
| FIX-03 | 6 通过（T1～T6） | 7 通过（T1、T2、T3、T4、T5、T6a、T6b） | **+1**：T6 被拆成 T6a/T6b 两条 |
| 套件 | 82 文件 / 767 用例 | 全量 86 文件 / **781 用例** | 后续批次新增用例；基线已漂移 |

---

## 5. 验收判据

| # | 判据 | 状态 |
|---|---|---|
| 1 | 按物证清单定位 3 个测试 | ✅（§2，路径与 `EVIDENCE-AVAILABILITY` §2.2 一致） |
| 2 | 重跑并落盘 stdout+stderr 全文 | ✅（4 个文件，§2） |
| 3 | 标题标「复验（2026-11-02 重跑）」 | ✅ |
| 4 | 不得标「原始执行」 | ✅（§0 明确否定） |
| 5 | 与历史结论对照 | ✅（§4） |
| 6 | 未修改任何测试文件 | ✅（只运行） |

## 6. 遗留

| # | 事项 | 归属 |
|---|---|---|
| L1 | 2026-11-01 的原始 stdout 永久缺失，**不可补造** | 已登记（G-28 的实质） |
| L2 | 测试文件哈希已因 cleanup 改造漂移，历史文档若引用旧哈希需加勘误 | 建议 A1 单独立项 |
| L3 | 本报告为 **② 测试通过** 层，非 ③ 真实环境 | 真实环境仍 0/15 |
