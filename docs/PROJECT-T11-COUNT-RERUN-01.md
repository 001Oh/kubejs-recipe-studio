# T-11 · 数字口径重跑报告（P2 五文件定向实测）

| 项 | 内容 |
|---|---|
| **任务名** | `T-11 · 数字口径重跑` |
| **对应** | `P2-DOC4041`（「40 通过」vs 静态 41）、**G-15**（测试计数口径差 2） |
| **授权** | **A3**（跑测试）；本稿为 A1 产出 |
| **执行时点** | 2026-11-02 05:06:19 GMT+8（`Start at`） |
| **性质** | 实测记录（不是提案，但**不关闭** G-15 的全部口径问题） |

## 0. 边界

1. 本稿只跑**测试**，未改任何源码/测试/配置。
2. 本稿的「全量基线」数字来自**同机、同轮**的另一次运行（§4），两次运行的**致因不同**，不可混算。
3. 历史「40 通过」**不删改**；按 S-4，历史错误另立登记，本稿只并列新数。

---

## 1. 结论

| 口径 | 数值 | 来源 | 状态 |
|---|---|---|---|
| 历史文档声称 | **40 通过** | `P2-封板前只读审查报告.md` §9 第 1 行 | 历史值，**不可复算** |
| 静态计数（旧） | **41** | 同上 §（`singleInstance 6 + navigation 9 + boundary 13 + windowGuards 3 + envPaths 10`） | 静态值 |
| **本轮实测** | **41 通过 / 0 失败** | 本稿 §2 命令与输出 | **新证据** |
| 全量套件（本轮） | **86 文件 / 781 用例**（758 passed + 16 failed + 4 skipped + 3 todo） | §4 | **16 失败为环境致因** |
| 全量套件（历史） | 82 文件 / 767 用例 → 83 文件 / 773 用例 | 当日日志 00:34 / 第 12 批 | 已漂移，**废止单一基线说法** |

**判定**：`P2-DOC4041` 的「40 vs 41」争议**以 41 为准**，且**已被本轮实测复现**（41 passed）。差异来源见 §3。

---

## 2. 执行记录

| 项 | 内容 |
|---|---|
| 工作目录 | `E:/mc kjs` |
| 命令 | `./node_modules/.bin/vitest run tests/main/singleInstance.test.ts tests/main/navigation.test.ts tests/main/navigationBoundary.test.ts tests/main/windowGuards.test.ts tests/main/envPaths.test.ts` |
| 退出码 | **0** |
| 原始输出 | `.cache/fix14/a3tmp/T11-five.out` |

**实际输出（逐文件）**

```
 ✓ tests/main/navigationBoundary.test.ts (13 tests) 5ms
 ✓ tests/main/envPaths.test.ts (10 tests) 8ms
 ✓ tests/main/navigation.test.ts (9 tests) 5ms
 ✓ tests/main/singleInstance.test.ts (6 tests) 3ms
 ✓ tests/main/windowGuards.test.ts (3 tests) 89ms

 Test Files  5 passed (5)
      Tests  41 passed (41)
   Duration  2.00s
```

| 文件 | 用例数 | 静态预期 | 一致 |
|---|---|---|---|
| `singleInstance.test.ts` | 6 | 6 | ✅ |
| `navigation.test.ts` | 9 | 9 | ✅ |
| `navigationBoundary.test.ts` | 13 | 13 | ✅ |
| `windowGuards.test.ts` | 3 | 3 | ✅ |
| `envPaths.test.ts` | 10 | 10 | ✅ |
| **合计** | **41** | **41** | ✅ |

---

## 3. 「40」的成因（分析推断，有文档支撑）

`P2-封板前只读审查报告.md` 已写明：该 40 是在 `navigationBoundary` **只有 12 条**时测得的；随后补了第 13 条回归用例（§6.3「销毁安全」）但**未重跑该批次**。

因此：

- 40 = 12 + 6 + 9 + 3 + 10（旧状态）
- 41 = 13 + 6 + 9 + 3 + 10（补了第 13 条之后）

**这不是「少算 1」，而是「测完之后又加了一条用例却没重跑」**。两类错误的处置不同：前者是计数错误，后者是证据时效问题。

---

## 4. 与全量基线的并列（**必须分开读**）

| 运行 | 命令 | 文件 | 用例 | 结果 | 退出码 |
|---|---|---|---|---|---|
| 定向 5 文件 | 见 §2 | 5 | **41** | 41 passed | 0 |
| 全量 | `./node_modules/.bin/vitest run` | 86 | **781** | 758 passed / **16 failed** / 4 skipped / 3 todo | 非 0 |

**16 项失败的唯一根因**（事实）：宿主 `safe-delete` 策略钩子抛出

```
Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]
{"count":50,"threshold":50,"scope":"turn","targets":["E:\\mc kjs\\.vitest-tmp\\fix02-plugin-66252"],...}
```

抛出点全部在测试的 `boot()` 清理步骤（`rmSync(H.userData, ...)`），**不在被测逻辑内**。全量输出中该标记出现 **35 次**，涉及 3 个测试文件（`pluginLayerFollowsModpack` / `pluginLoadFailurePreservesLayer` / `schemaPluginFailureSnapshot`）。

**判断**：这是**环境致因**，不是代码回归。按项目口径应记 **BLOCKED（环境）**，不得记为「测试失败＝产品缺陷」。

**基线漂移提醒**：历史「767」与「773」两个数字都真实存在过（不同时点），本轮为 **781**。今后引用必须带时点，不得写成「基线 767」单一说法。

---

## 5. 验收判据

| # | 判据 | 状态 |
|---|---|---|
| 1 | 定向重跑 5 文件并记录实际数 | ✅ 41 |
| 2 | 与 767 基线并列 | ✅（§4 并列 767/773/781 三者，并标时点） |
| 3 | 退出码与原始输出留档 | ✅ `.cache/fix14/a3tmp/T11-five.out`，exit 0 |
| 4 | 不删改历史「40」 | ✅ 保留并解释成因 |

## 6. 遗留

| # | 事项 | 归属 |
|---|---|---|
| L1 | `P2-封板前只读审查报告.md` 的「40」是否加勘误批注 | 需 A1 单独立项（本稿未改该文件） |
| L2 | 全量 16 失败是否可在**非受限终端**复跑取证 | 需换执行环境；本机受限 |
| L3 | 全量基线今后统一记「86 文件 / 781 用例 @2026-11-02 05:04」 | 建议写入统计基线（需授权） |
| L4 | 本稿未登记 `DOCS-INDEX.md` | 需单独授权 |
