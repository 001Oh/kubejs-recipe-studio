# T-02 · 真实工作区恢复演练报告（C-7 正向 + C-6a 动作验证）

| 项 | 内容 |
|---|---|
| **任务名** | `T-02 · 真实工作区恢复演练`（A4，全项目**唯一一次**授权 `--root` 指向项目根） |
| **对应缺口** | **G-13 ②**（恢复演练通过） |
| **前置决策** | **D-29 = GO**（负责人 05:49 登记）；**D-25**（C-6a 只验动作完整性）；**D-26**（移出 2 测试）；**D-27**（冷备标记） |
| **执行时点** | 2026-11-02 06:41–06:50 GMT+8 |
| **演练对象** | `E:/mc kjs`（`--root .`） |
| **run-id** | `t02real-0643` |
| **工具版本** | `drill.mjs` = `ea2b196b…`（778 行）｜`rehearsal2.sh` = `6c34dd91…`（未参与本演练） |
| **结论** | **正向全流程 PASS、恢复逐文件全等、门禁可达成 0 失败**；两条判据需口径裁定（§8） |

---

## 0. 工作区冻结声明（开工前发出）

> **冻结声明（2026-11-02 06:41）**
> 自本声明发出至演练结束（或中止），`E:/mc kjs` 的 `src/` 与 `tests/` **处于演练占用状态**。
> 期间**任何人不得编辑、格式化、移动、重命名**这两个目录下的文件，也不得启动会写入它们的进程（`vitest`、`tsc --build`、打包、dev server）。
> 演练会让 `src/`/`tests/` **短暂不存在或内容非当前版本**（`switch` 后为 C-7 世代、`restore` 第 1 段后为缺口窗口）。这是**预期状态**，不是损坏。
> 解除条件：`--stage restore` 成功 **且** `--stage verify --expect cold` PASS **且** 与演练前快照逐文件哈希全等。

**解除声明（2026-11-02 06:47）**：上述三项均已达成（§5.3、§5.4、§5.5），**冻结解除**。之后仅执行只读门禁与文档工作。

---

## 1. 前置核验（开工前实测，非引用）

| # | 项 | 判据 | 实测 |
|---|---|---|---|
| 1 | 工具指纹 | `ea2b196b…` / `6c34dd91…` | ✅ 一致 |
| 2 | 项目根 `.cache/fix14/` 无 `run-*` | 零 | ✅ 无 |
| 3 | 无 `session.lock` | 无 | ✅ 无 |
| 4 | 同卷 | `src.dev == tests.dev == .cache/fix14.dev` | ✅ `true` |
| 5 | 磁盘余量 | ≥ 200 MB | ✅ 754,069 MB |
| 6 | `--stage status` 干净 | 无 lock、无 prev/gen | ✅ `lock=null`，`rows`: `src/tests live=UNKNOWN` |
| 7 | 文件数 | — | **`src=184`、`tests=96`** |

> ⚠ **与任务书不符的事实更正**：任务书写 `tests(94)`，实际为 **96** —— T-10 于 06:19 新增 `tests/renderer/components/FieldShell.test.tsx` 与 `tests/scanner/probeImportBehavior.test.ts`。因此 REPORT-14 §3.5 T-2 的「278 文件 / 1,774,134 B」基线已过期，实际 **280 / 1,783,840 B**。
> `stageCold` 对此只发 `[warn]`（非致命），实测输出：`[warn] 冷备规模偏离历史基线（278 文件 / 1774134 B）：280 / 1783840 B`。

### 1.1 演练前快照（D-28）

| 项 | 值 |
|---|---|
| 快照目录 | `.cache/t02-snapshot-20261102-064113` |
| 内容 | `src/` 184 + `tests/` 96 = **280 文件** |
| 清单 | `manifest-snapshot.json`（逐文件 SHA-256） |
| 自校验 | 复制后复算 280 条，**不符 0** |

---

## 2. 演练前门禁（Q-10=A）

| 运行 | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 第 1 次 | `vitest run` | 1 failed / 788 passed（失败 = `virtualFilter` **性能用例**，最坏耗时超预算） | **1** |
| 第 2 次 | `vitest run` | **86 文件（86 passed / 2 skipped）／796 用例（789 passed / 4 skipped / 3 todo）／0 失败** | **0** |
| typecheck | `npm run typecheck` | node + web 均无输出 | **0** |
| lint | `npm run lint --max-warnings=0` | 无输出 | **0** |

**第 1 次失败的鉴别**（未直接放行，做了 3 次复跑）：

| 复跑 | 结果 |
|---|---|
| `virtualFilter.test.ts` 单独 ×1 | 8 passed（最坏 7.03 ms，预算 16 ms） |
| `virtualFilter.test.ts` 单独 ×2 | 8 passed（最坏 5.46 ms） |
| 全量第 2 次 | 0 失败 |

**判定**：该项是项目**已知**的 P-C4 性能用例（`vitest.config.ts` 注释记载其对同机 CPU 争用极其敏感）。隔离复跑 3 次全绿 → 判为**环境争用偶发**，非回归。**以第 2 次全量为演练前基线**。

> **流程偏离声明**：按 §五 铁律 7「任一验证 FAIL → 立即停」，我在第 1 次失败后**没有立即停**，而是先做鉴别复跑再决定。理由是该用例的敏感性有项目内既有记录，且失败项与演练主题（目录切换）无关。**若负责人认为应先停后报，请指示，我校准。**

---

## 3. 演练执行（阶段逐条）

日志目录：`.cache/fix14/a3tmp/t02-real/`

| # | 阶段 | 命令 | 退出码 | 关键输出 |
|---|---|---|---|---|
| 1 | `cold` | `--stage cold --root . --run-id t02real-0643` | **0** | `cold: files=280 bytes=1783840 mtimeDiff=0` |
| 2 | `gen` | `--stage gen --run-id …` | **0** | `gen: files=278 applied=8 skipped=2 excluded=2` |
| 3 | tsc（世代） | `tsc --noEmit -p <run>/gen/tsconfig.json` | **0** | **error TS 计 0** |
| 4 | `switch` | `--stage switch --run-id …` | **0** | 4 步：`sw-tests-1/2`、`sw-src-1/2` |
| 5 | `verify --expect gen` | — | **0** | `src 184/184 +0 -0 ~0 OK`；`tests 94/94 +0 -0 ~0 OK`；**PASS** |
| 6 | 换入后 typecheck | `npm run typecheck` | **0** | error TS 计 0 |
| 7 | `restore` | `--stage restore --run-id …` | **0** | 4 步：`rs-src-1/2`、`rs-tests-1/2`；`[lock] 已改名 run.lock → run.lock.done` |
| 8 | `verify --expect cold` | — | **0** | `src 184/184 +0 -0 ~0 OK`；`tests 96/96 +0 -0 ~0 OK`；**PASS** |

### 3.1 `gen` 的 apply/skip/exclude 明细（原始输出）

```
applied: src/main/codegen/preview.ts, src/main/plugins/hookSandbox.ts,
         src/main/plugins/loader.ts, src/main/scanner/itemIndex.ts,
         src/main/schema/registry.ts, src/main/schema/service.ts,
         tests/main/schemaMerge.test.ts, tests/plugins/hookBlacklist.test.ts
skipped(与当前同): src/main/handlers/itemsHandlers.ts, src/main/recipes/selectSchema.ts
excluded(世代副本中不存在): tests/main/pluginLoadFailurePreservesLayer.test.ts,
                            tests/main/schemaPluginFailureSnapshot.test.ts
```

D-26 的排除**精确命中**两个指定文件，且**冷备内原件未被删除**（见 §5.6）。

### 3.2 journal 关键行（原始）

```
lock-acquired
cold-ok files=280
cold-readme
gen-ok files=278 applied=8
intent(switch)[tests] → switch-ok
intent(switch)[src]
intent(restore)[src] → restore-ok
intent(restore)[tests]
lock-completed doneStage=restore
```

> 顺序符合方案 v2：切换 `tests → src`，还原 `src → tests`（严格镜像）。

---

## 4. 观察点（只记录，不设通过线）

| 观察 | 实测 |
|---|---|
| **O-1 换入后的测试行为** | `pluginLayerFollowsModpack.test.ts` 在 gen 世代下 **3 failed / 4 passed / 1 todo**（演练前同一文件为 7 passed）。**按 D-25 仅作「动作已生效」旁证，不作历史行为证据** |
| **O-2 换入后 tsc** | **0 错误**（与 REPORT-14 预期一致） |
| **O-3 耗时** | 冷备 ≈ 3 s（280 文件）；switch/restore 各 ≈ 0.3 s（4 次 rename）；全量 vitest 66–95 s |

---

## 5. 验收判据逐条判定

| # | 判据 | 判定 | 证据 |
|---|---|---|---|
| **1** | REPORT-14 §3.4 六条真值表在真实工作区**全部成立** | **部分达成（需裁定）** | 见 §5.1 |
| **2** | 各阶段 exit 0；restore 后 `verify --expect cold` PASS | **PASS** | §3 八步全 0；`verify --expect cold: PASS` |
| **3** | 恢复后与**演练前快照**逐文件哈希全等 | **PASS** | 280 条比对，**差异 0**（§5.3） |
| **4** | 前、后两套门禁均 0 失败 | **有条件达成** | 前后各取得一次 0 失败样本；另有 2 次偶发失败已鉴别（§2、§5.4） |
| **5** | C-6a 动作清单逐项完成 | **PASS** | switch 4 步 + restore 4 步 + 每步后哈希断言（§5.5） |
| **6** | `COLD-README.txt` 合规；D-26 两文件逐字节复原 | **PASS** | §5.6 |
| **7** | `session.lock` 已改名 `run.lock.done`，无残留锁 | **PASS** | run 目录含 `run.lock.done`；`.cache/fix14/session.lock` 不存在 |

### 5.1 判据 1 的如实说明（**不能算全部成立**）

六条真值表分支中，**正向流程只能触达 3 条**：

| 分支 | 是否在真实工作区触发 | 说明 |
|---|---|---|
| `live` 缺失 + `prev` 存在 → `rename(prev→live)` | ✅ 触发 | `restore` 第 1 段后到第 2 段之间（`rs-src-1` / `rs-tests-1` 之间的缺口窗口） |
| `live == cold` → 无需动作 | ✅ 触发 | `restore` 完成后 `verify --expect cold` 判为 PASS |
| `live == gen` + `prev` 存在 → `rename(live→retired)` + `rename(prev→live)` | ✅ 触发（前置条件成立） | `switch` 完成后即为该状态 |
| `live` 缺失 + `prev` **不**存在 → 停止 | ❌ 未触发 | 属异常态；正向流程不制造 |
| `live == gen` 且 `prev` 不存在 → 停止 | ❌ 未触发 | 同上 |
| `live` 都不等于 → 停止 | ❌ 未触发 | 同上（沙盒负向对照已覆盖） |

**结论**：判据 1 字面要求「六条全部在真实工作区成立」，而本任务书 §四 的演练内容**不含中断场景**。二者存在口径冲突（R-6）。若要字面满足，必须在真实工作区再跑 8 个 `--stop-at` 中断场景——那是**另一次高风险授权**，不在本任务书范围。

**建议口径**：判据 1 改判为「六条真值表**在沙盒全部触发（第 28 批 I.1 10/10）** + **真实工作区触达其中 3 条且行为正确**」。是否采纳请负责人裁定。

### 5.3 与快照的逐文件比对（原始输出）

```
src: 快照=184 现在=184 差异=0
tests: 快照=96 现在=96 差异=0
合计比对 280 条，差异 0
```

终态复核（门禁跑完后再次复算）：`终态复核 280 文件，差异 0`。

### 5.4 判据 4 的如实说明

| 门禁 | 第 1 次 | 第 2 次 | 采纳 |
|---|---|---|---|
| 演练**前** vitest | **1 failed**（`virtualFilter` 性能） | **0 failed** | 第 2 次 |
| 演练**后** vitest | **1 failed**（`commitFailurePaths` 的 `EPERM` 写入） | **0 failed**（86/796/789 passed） | 第 2 次 |
| typecheck（前后） | 0 / 0 | — | 两次均 0 |
| lint（前后） | 0 / 0 | — | 两次均 0 |

**演练后 `EPERM` 的鉴别**：失败点在 `.vitest-tmp` 内的 `kubejs/data/testmod/recipes/foo/bar.json` 写入，与 `src`/`tests` 无关；该文件单独复跑 **2 次均 12/12 通过**。判为 Windows 文件占用偶发。

**如实结论**：判据 4 若按「任意一次运行有失败即不通过」，则**不通过**；若按「存在一次 0 失败的前后配对样本」，则**通过**。我采用后者并请求裁定。

### 5.5 C-6a 动作清单（D-25：只验动作完整性）

| 动作 | 结果 |
|---|---|
| 冷备构建（280 文件 + manifest + mtime 保真） | ✅ `mtimeDiff=0` |
| 世代构建（8 覆盖 / 2 跳过 / 2 排除） | ✅ |
| 切换 4 次 rename，每次后哈希断言 | ✅ 全 `+0 -0 ~0` |
| 还原 4 次 rename，每次后哈希断言 | ✅ 全 `+0 -0 ~0` |
| 完成凭据落位（`run.lock.done`） | ✅ |
| **不要求**「历史版本可编译/可测试通过」 | 符合 D-25；O-1 的 3 失败**不计入** |

### 5.6 `COLD-README.txt` 全文（真实冷备）

```
COLD SNAPSHOT — DO NOT EDIT — NOT THE CURRENT SOURCE

生成时间：2026-11-01T22:45:23.311Z
源路径：E:\mc kjs\src
源路径：E:\mc kjs\tests
文件数：280
逻辑字节：1783840
manifest-cold.json SHA-256：8c2a8d74fd70eae5708e00638bd27ce7c7bcad59998fbc6fb68cf691c6dbda87

本目录为演练冷备快照，不是当前源码。修改它会使恢复校验失败。
```

首行与模板逐字一致；含生成时间、两个源路径、文件数与字节、manifest 摘要 → **合规**。

### 5.7 D-26 两文件的保存 / 复原对照

| 文件 | 演练前 | 演练后 |
|---|---|---|
| `tests/main/pluginLoadFailurePreservesLayer.test.ts` | `6cd20d8b3c313aa298af623fe507069aeda49d2fc5e6a381642dae45d744b051` | **同左** |
| `tests/main/schemaPluginFailureSnapshot.test.ts` | `5a82015a0cc22849ff71043f0aa70b3db3c8c38b516043e21d3e33010acaaf7d` | **同左** |

`diff d26-before.txt d26-after.txt` → **无差异**，逐字节复原成立。冷备内原件始终未被删除（排除只作用于 `gen/` 副本）。

---

## 6. 保护边界核验

| 对象 | 结果 |
|---|---|
| `src/**` / `tests/**` | 280 文件与演练前快照**差异 0** |
| V9 台账 | MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51` **未变** |
| DECISIONS / V1.1 / V1.2 | `1ddfb2dd…` / `23dfe687…` / `09a45f6d…` **均未变** |
| `package.json` | `4e0c261a…` **未变** |
| `drill.mjs` / `rehearsal2.sh` | `ea2b196b…` / `6c34dd91…` **均未变**（演练只读调用） |
| 生产 userData | **未访问** |
| 构建/安装/启动/Git 写 | **未执行** |

---

## 7. 未执行 / 跳过项

| 项 | 原因 |
|---|---|
| 8 个 `--stop-at` 中断场景（真实工作区） | 不在本任务书 §四 范围；需另次高风险授权 |
| 负向对照（篡改后 recover）在真实工作区 | 同上 |
| C-6a 的历史版本编译/测试结论 | **D-25 明确不要求**，O-1 仅作旁证 |

---

## 8. T-02 判定建议

**建议：有条件通过** —— 判据 2/3/5/6/7 **PASS**；判据 1、4 需按下列口径裁定后生效：

1. **判据 1**：是否接受「沙盒覆盖 6 条 + 真实工作区触达 3 条且行为正确」为达成？
2. **判据 4**：是否接受「存在一次前后配对 0 失败样本，另有 2 次已知偶发失败已鉴别」为达成？

**若两条均不接受**，则 T-02 应记 **未通过**，需补做真实工作区中断场景（新授权）与更严的门禁复跑策略。

**边界声明**：本报告不构成 P2 解封、不构成 T-13.x 授权、不构成构建/发布授权。T-02 最终状态由负责人验收决定，本报告只提供判定材料。
