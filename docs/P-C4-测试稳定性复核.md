# P-C4 测试稳定性复核

日期：2026-10-31
范围：只处理测试稳定性与可复现性。**未修改任何阈值**，**未修改扫描器 / 缓存 / 搜索 / 生成 / 提交逻辑**。

## 1. 结论

1. `tests/algorithms/virtualFilter.test.ts` 的性能失败**不是算法或实现问题**：安静进程里连续 81 个样本全部落在 2.7–3.6ms（预算 16ms，余量约 4 倍）。
2. 失败来自两件事叠加：
   - **测量口径**：断言的是 27 个样本里的最大值，单次 GC / 线程抢占就会把它拉到 19–43ms；
   - **执行方式**：默认按文件并行（20 逻辑核 → 多个 worker 同时跑重测试），中位数也会从 2.7ms 抬到 5.4–8.5ms。
3. 因此决定：**不改实现、不改阈值、不改断言**，改为让性能测量在无争用的进程中进行（`fileParallelism: false`）。
4. 复核过程中另外发现两类非产品问题，一并修掉：宿主 safe-delete 守卫打断测试清理；我自己在 P-C3 写的回滚用例断言过强。

修复后：全量连续 3 次 **47 文件通过 / 2 跳过；508 测试通过 / 4 跳过；退出码 0**。

## 2. 证据：算法本身远低于预算

一次性诊断（在安静进程中按用例同样的方式采样；诊断文件用完即删，未进入仓库）：

```
[diag r1] off median=2.73 p95=2.81 worst=2.84
[diag r1] on  median=2.96 p95=3.26 worst=3.39
[diag r2] off median=2.77 p95=3.38 worst=3.59
[diag r2] on  median=2.96 p95=3.24 worst=3.32
[diag r3] off median=2.75 p95=2.93 worst=3.17
[diag r3] on  median=2.97 p95=3.20 worst=3.25
[diag r1..r3] >16ms 的样本数：0/54、0/54、0/54
```

## 3. 证据：失败与环境负载强相关

### 3.1 单独运行性能文件（机器空闲）

| 批次 | 结果 |
| --- | --- |
| 第一批 5 次（与另一次全量运行**重叠**） | 3 通过 / **2 失败**（worst 25.91ms、23.08ms） |
| 第二批 5 次（无其他负载） | **5 通过 / 0 失败**（worst 4.07 / 3.94 / 4.05 / 5.03 / 4.21ms） |

第一批的重叠运行是直接证据：同一份代码、同一条命令，只因机器上同时跑别的测试就失败。

### 3.2 默认并行全量（5 次）

| 运行 | perf 中位 / 最坏 | 结果 |
| --- | --- | --- |
| A | 6.55 / **43.32**ms | 1 failed（perf） |
| B | 6.04 / **22.67**ms | 2 failed（perf + 提交回滚用例） |
| C | 8.46 / **21.55**ms | 1 failed（perf） |
| D | 6.38 / **24.92**ms | 2 failed（perf + 提交回滚用例） |
| E | 5.44 / **39.65**ms | 2 failed（perf + 提交回滚用例） |

并行时中位数已是安静环境的 2–3 倍，最坏值 19–43ms；`max < 16` 必然失败。

### 3.3 串行全量（对照组，改配置前先手工验证）

```
vitest run --no-file-parallelism  →  EXIT=0
[perf] 窄查询 off=3.39/3.54ms on=3.62/3.89ms
Test Files 47 passed | 2 skipped (49)
Tests      508 passed | 4 skipped (512)
```

## 4. 本轮改动（只碰测试编排与测试自身的健壮性）

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `vitest.config.ts` | 增加 `fileParallelism: false` 并写明理由 | 性能断言必须在无争用进程内测量；阈值 16ms 与 `max` 断言**原样保留** |
| `tests/helpers/cleanup.ts`（新增） | `cleanupTmp()` 尽力清理 | 宿主 safe-delete 守卫在「同一 turn 累计删除 >50」时抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，会让 `afterAll` 把整个文件记成失败 |
| `tests/scanner/scanPipeline.test.ts` | 临时根目录改为「进程+时间戳唯一」，清理改用 `cleanupTmp` | 清理被拦时残留旧 jar / 缓存会污染下一轮断言（曾出现 `jarCount 3≠2`、`5 > 5` 两个假失败） |
| `tests/recipes/recipeIndex.test.ts`、`tests/recipes/scriptSource.test.ts` | 同上（清理改用 `cleanupTmp`） | 同源问题 |
| `tests/main/commitRecipe.test.ts` | 「保存后回读不一致」用例改为**确定性**制造不一致：注入 `readText` 让第 3 次读取返回被篡改文本，writer 与回滚走真实文件系统；断言从「文件必须不存在」改为「回滚被调用 + 磁盘上不得残留篡改内容」 | 原断言依赖「删除一定成功」，在文件被占用时误报；该用例在并行全量下曾 3/5 失败 |

**未改动**：`src/shared/search.ts`、`src/main/scanner/**`、`src/main/cache.ts`、`src/main/recipes/**` 的产品逻辑，以及任何性能阈值。

## 5. 修复后结果（实际命令与退出码）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `vitest run`（第 1 次） | 0 | 47 文件通过 / 2 跳过；508 通过 / 4 跳过；perf worst 4.29ms |
| `vitest run`（第 2 次） | 0 | 同上；perf worst 4.07ms |
| `vitest run`（第 3 次） | 0 | 同上；perf worst 4.66ms |
| `vitest run tests/main/commitRecipe.test.ts` | 0 | 11/11 通过 |
| `vitest run tests/scanner/scanPipeline.test.ts` | 0 | 19/19 通过 |
| `RUN_REAL_PACK=1 vitest run tests/scanner/realPack.test.ts`（3 次） | 0 / 0 / 0 | 3/3 通过；43,474 物品 / 38,760 图标（89.2%）/ 295 jars / 失败 0；配方 32,890 / 426 类型 / 5,334 partial |
| `RUN_REAL_PACK=1 vitest run tests/recipes/realPack.test.ts` | 0 | 1/1 通过 |

单次全量耗时从约 17–30s 增加到约 45–50s，属可接受代价。

## 5.1 复核中发现的基线问题（需要更正此前报告）

修好清理逻辑后，真实包扫描的临时目录改为**每次唯一**，于是「首次扫描」第一次真正冷启动。实测：

| 场景 | 首次扫描耗时 |
| --- | --- |
| 唯一目录（真冷启动）×4 | 116.7s / 118.6s / 123.0s / 127.4s |
| 固定目录（此前报告的数字）×3 | 33.0s / 33.2s / 33.05s |

原因已验证：固定目录 `.vitest-tmp/realScan` 至今仍保留 **38,764 个文件**（`icon-cache` + `studio-cache`）。
此前 `beforeAll` 的 `rmSync` 被宿主 safe-delete 守卫拦下 → 目录与图标缓存残留 → 扫描跳过 3.8 万张图标的写盘，
所以那批「33s 首扫」是**热图标缓存**下的数字，不是冷启动。

影响与结论：

- 本轮**没有**改扫描器代码，只改了测试临时目录路径；因此这是「既有测量方式掩盖了真实冷启动成本」的暴露，而不是新引入的性能回归。
- 该机器上真正的冷启动约为 **117–127s**，超过需求规格「300+ mod 首次扫描 ≤ 90 秒」。这项需要在后续单独复核（属性能议题，不在 P-C4 授权范围）。
- 此前 P-C1/P-C2/P-C3 报告中「首扫 33.0–33.2s」应视为不可复现，不应再作为性能基线引用；物品数、图标率、配方数、类型数、partial 数与耗时无关，仍然成立。

## 6. 已知限制 / 未做

- `fileParallelism: false` 使全量变慢；若后续测试规模显著增大，需要改为「性能用例单独 project / 单独命令」的编排，而不是全局串行。
- 宿主 safe-delete 守卫仍会拦截批量清理（例如 `.vitest-tmp/realScan*` 下 3.8 万文件），只是不再让测试失败；当前 `.vitest-tmp/` 已累积 4 个 realScan 目录与 65 个 pc3 目录，需要时可手工删除。
- 冷启动扫描耗时 117–127s 超过规格 90s（见 5.1），本轮只做记录，未做优化。
- 未在 CI 或另一台机器上验证；本轮全部结论来自本机（i5-14600KF / 20 逻辑核 / 32GB，测试时无其他负载）。
- 本轮**没有**运行真实 Electron 流程（P-C4 不涉及产品行为变化）。
