# P-OPT2 图标写入批量化与全局限流

日期：2026-10-31
范围：只实施 P-OPT1 报告中的 P1。未改 zip 层枚举架构、缓存协议、扫描统计口径、Schema、提交/备份/编辑器逻辑。

## 1. 改动文件与代码路径

| 文件 | 改动 |
| --- | --- |
| `src/main/scanner/iconWriter.ts`（新增） | 进程内共享的图标写入队列：去重、全局限流、背压、取消与错误传播、统计 |
| `src/main/scanner/jarScan.ts` | 写图标从「每张 `existsSync` + 串行 `await writeFile`」改为「批 64 提交队列 + 批间等待」；新增可选 `signal` |
| `src/main/scanner/iconPass.ts` | 第三阶段写图标改用同一队列（删除本地 32 并发实现）；新增可选 `signal` |
| `src/main/scanner/pool.ts` | 按 lane 分配写入预算（`ceil(24 / lanes)`），worker 启动时下发；每次扫描 `forgetKnownIcons()` |
| `src/main/scanner/scan.worker.ts` | 读取 `workerData.writeConcurrency` 并配置本 lane 的队列 |
| `src/main/scanner/scanService.ts` | 把扫描 `signal` 传入 `resolveMissingIcons` |
| `src/shared/constants.ts` | 新增 `ICON_WRITE_CONCURRENCY_TOTAL = 24` |
| `tests/scanner/iconWriter.test.ts`（新增） | 6 条：并发上限、去重、EEXIST 跳过、失败冒泡、取消（提交前/排队中） |

## 2. 写入流程差异

```
原（每个 jar，串行）
for item: if (!existsSync(target)) await writeFile(target, png)   // 单张 ~1.2–3.8ms
         ← 8 个 jar 并发 → 任意时刻最多 8 个写入在飞

新（每个 jar，分批 → 全局队列）
for item(批 64):
   writeIcon(target, png, signal)   // 立即返回 Promise
   if (批满) await Promise.all(批)  // 背压：排队数不超过 64×lane
队列内部：
   active < 24 ? 立即 await writeFile(target, png, { flag: 'wx' })
                : 入队，空闲时取出
   EEXIST → 视为「已存在」跳过（等价旧 existsSync 分支，但省掉一次 stat）
```

单进程写入并发上限 24；worker 模式 8 lane × 3 = 24，inline 模式直接 24。

## 3. 队列生命周期、去重、取消与失败

| 关注点 | 处理 |
| --- | --- |
| 生命周期 | 模块级单例；`forgetKnownIcons()` 在每次 `runJarPool` 开始时清「已确认存在」集合，避免跨扫描误跳过 |
| 去重（并发） | `inflight: Map<target, Promise>` —— 同一路径的并发提交共享同一 Promise，物理只写一次 |
| 去重（已存在） | `known: Set<target>` —— 本次已写过/已跳过的路径直接返回 `false`，不再开文件 |
| 已存在文件 | `wx` 独占创建；`EEXIST` → 不覆盖、不报错、计为 skipped（与原 `existsSync` 分支等价） |
| 写入失败 | 该任务 Promise reject；调用方 `Promise.all` 抛出 → 该 jar 计为失败（与原行为一致，不静默） |
| 取消 | `submit` 时若 signal 已 abort → 立即 reject `IconAbortError`；排队任务在真正写之前再检查一次 → 不落盘；已开始的写入任其完成（不产生临时文件） |
| 队列压力 | 队列长度由「批 64 × lane 数」约束，实测 peakPending=64，不会无限增长 |
| 统计 | `submitted/written/skipped/failed/peakPending/queued/active/concurrency`，仅诊断用，不参与扫描统计 |

## 4. 微基准（write-bench：只测写盘，24,181 张 / 7.5MB，两轮交替）

| 轮 | 模式 | 总耗时 | ms/icon | 文件数 | 失败 | peak |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 原串行 | 67.0s | 2.77 | 24,181 | 0 | — |
| 1 | 队列 12 | 25.5s | 1.05 | 24,181 | 0 | 64 |
| 1 | 队列 24 | 22.5s | 0.93 | 24,181 | 0 | 64 |
| 1 | 队列 48 | 25.4s | 1.05 | 24,181 | 0 | 64 |
| 2 | 原串行 | 92.8s | 3.84 | 24,181 | 0 | — |
| 2 | 队列 12 | 22.1s | 0.92 | 24,181 | 0 | 64 |
| 2 | 队列 24 | 25.8s | 1.07 | 24,181 | 0 | 64 |
| 2 | 队列 48 | 22.2s | 0.92 | 24,181 | 0 | 64 |

结论：**写入阶段 2.7–3.4× 提升**；12/24/48 三档差异在噪声内（48 以上未测），因此取 24 作为全局预算。
文件数与字节完全一致，失败 0。

## 5. 池级 A/B（295 jar，交替）

| 场景 | 旧实现 | 新实现 |
| --- | --- | --- |
| worker8（8 lane） | 101.3s / 105.8s | **47.6s / 55.5s** |
| 最长 jar | 80.3s（chipped） | 35.6s / 41.1s（TConstruct） |
| inline8，写并发 1（≈旧串行） | 78.4s / 75.0s | — |
| inline8，写并发 24 | — | **48.2s / 61.1s** |

worker 路径约 **2×**；`iconsWritten` 两次均为 37,873，`items` 均为 43,640（合并前片段数），与旧实现完全一致。

## 6. 应用级冷启动（隔离 userData，只读真实包，3 次）

每次启动前 `iconFiles=0 / cacheFiles=0`，结束后 `iconFiles=38,760 / cacheFiles=3`；均未复用旧图标。

| # | 扫描 | items | recipes | corpus | 含启动+导入 | 物品 | 配方/类型/partial |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 98.76s | 86.61s | 11.66s | 0.47s | 110.83s | 43,474 | 32,890 / 426 / 5,334 |
| 9 | 98.17s | 91.03s | 6.68s | 0.44s | 106.69s | 43,474 | 32,890 / 426 / 5,334 |
| 10 | **89.42s** | 81.18s | 7.76s | 0.46s | 98.11s | 43,474 | 32,890 / 426 / 5,334 |

对照 P-OPT1 基线（同包、同口径、独立 userData）：items 114.95s / scan 123.79s / 含启动+导入 133.17s。
即 items **-20%~-29%**，scan **-20%~-28%**，端到端 **-16%~-26%**。

> 缓存状态说明：三次均在空闲后顺序执行，属「应用缓存全新」；操作系统页缓存无法清空，故仍标注为「OS 缓存状态未受控」，不与 P-OPT1 的冷盘/热盘结论混用。

## 7. 正确性基线对照

| 指标 | 基线 | 本轮 3 次冷启动 | 判定 |
| --- | --- | --- | --- |
| 物品 | 43,474 | 43,474 / 43,474 / 43,474 | 一致 |
| 图标文件 | 38,760 | 38,760 ×3 | 一致 |
| 缺失图标 | 4,714 | 4,714 ×3 | 一致 |
| 配方 | 32,890 | 32,890 ×3 | 一致 |
| 配方类型 | 426 | 426 ×3 | 一致 |
| Partial | 5,334 | 5,334 ×3 | 一致 |
| jar 失败 | 0 | 0 | 一致 |

其它验证：

- 重复扫描一致：worker8 两次 `items=43,640`、`iconsWritten=37,873` 完全相同。
- 取消：单测覆盖「提交前已取消」与「排队中取消」，后者确认部分文件未落盘。
- 写入失败：`ENOENT` 场景 reject 且 `failed` 计数 +1，不会返回成功。
- P-C5/P-C6/P-C7：见第 8 节。

## 8. 门禁与回归

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `electron-vite build` | 0 | — |
| `vitest run`（全量） | 0 | **50 文件通过 / 2 跳过；533 通过 / 4 跳过** |
| P-C7 真实 Electron（8 场景） | 0 | 全部通过，`uiErrors: []`（取消/提交/冲突三选一/只读失败/外部删除/白名单回退） |

P-C5（索引与缓存一致性）与 P-C6（备份/回滚）由全量套件覆盖并通过：
> 说明：有一轮全量在磁盘高负载（同时跑基准与应用级冷启动）时出现 3 条已知对文件锁/时序敏感的用例失败
> （`TARGET_VANISHED`、真实只读 rename、回读不一致），单独重跑该两个文件连续 2 次均 23/23 通过，
> 随后全量重跑 533/533 通过；未改任何相关代码。
`commitIndexCache.test.ts`、`commitRecipe.test.ts`、`commitFailurePaths.test.ts`、`commitBridge.test.ts` 均绿；
本轮未触碰提交、索引、备份与缓存写入路径。

## 9. 90 秒判定

- 扫描阶段：3 次为 98.8 / 98.2 / **89.4s**，**未稳定 ≤90s**。
- 含启动+导入：98.1–110.8s，**未达标**。
- 结论：P1 达成预期收益（写入阶段 2.7–3.4×、池级 2×、items -20%~-29%），但**不足以稳定达成 90s 目标**，不作达标宣称。

## 10. 下一项最值得实施的优化

按新数据，池级已降至 47–56s，items 仍有 81–91s，说明成本重心转向：
跨 jar 图标二次解析（P-OPT1 测 8.5–22s，为 3.26MB 数据扫了 56.8 万条目）+ 归档重复枚举。

**建议下一项：P3 的收窄版——iconPass 复用已有 `listEntries` 结果、把 4 轮 depth 读取合并为 1–2 轮（不碰 zip 句柄生命周期）。**
预计收益 5–12s，风险中低，可独立回滚；随后再评估「每 jar 列一次 + 随机读」的完整 P3 与 P2（detect 缓存 5–6s/次启动）。

## 11. 已知限制

1. OS 页缓存不可控，绝对值仍受磁盘状态影响（同 P-OPT1）。
2. `peakPending` 受批大小 64 限制，不能直接反映并发上限；并发上限通过 `active`/实测耗时判断。
3. 未在 CI 或第二台机器验证；未测 NVMe 与机械盘差异。
4. `iconsWritten` 在「同一物品出现在两个 jar」时按提交次数计（与旧实现一致），仅诊断用。
5. 未改动 `detectMetadata`、配方扫描与缓存协议。
