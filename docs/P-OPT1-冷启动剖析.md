# P-OPT1 冷启动扫描性能剖析与优化方案

日期：2026-10-31
范围：测量与归因。**未修改任何产品代码**，未改扫描器、缓存协议、Worker 架构、Schema 与备份策略。

## 1. 扫描链路与代码入口

```
modpack:import  → detectMetadata()                       src/main/modpack/detect.ts
                    ├─ listJarNames / detectFromJarNames（文件名）
                    └─ scanModMetadata()                   src/main/modpack/modList.ts
                         └─ 每个 jar 一次 readMany(mods.toml / fabric.mod.json)

modpack:scan    → startScan()                            src/main/scanOrchestrator.ts
                    ├─ 阶段1 scanItems()                   src/main/scanner/scanService.ts
                    │    ├─ computeModsSignature / computeExtrasSignature   src/main/cache.ts
                    │    ├─ 缓存判定 isCacheValid（items 阶段只看 mods 签名）
                    │    ├─ listJars → runJarPool           src/main/scanner/pool.ts → jarPoolCore.ts
                    │    │    └─ 每 jar: scanJar()          src/main/scanner/jarScan.ts
                    │    │         listEntries → readMany → scanJarEntries → 逐张写图标
                    │    ├─ resolveMissingIcons()（跨 jar 二次解析）  src/main/scanner/iconPass.ts
                    │    ├─ mergeItems() → writeJson(items.json)
                    ├─ 阶段2 配方库
                    │    ├─ isCacheValid(requiredPhases:['items','recipes'], extras)
                    │    ├─ 未命中 → scanRecipes()          src/main/recipes/scanRecipes.ts
                    │    │    ├─ scanJsonRecipes()          src/main/recipes/jsonSource.ts（jar/datapack 池）
                    │    │    ├─ scanScriptRecipes()        src/main/recipes/scriptSource.ts
                    │    │    ├─ mergeChains → buildIndex → persist(recipes.json)
                    ├─ 阶段3 buildSearchCorpus()            src/shared/search.ts
                    └─ 阶段4 saveCacheMeta()
```

## 2. 测量方法与缓存状态证明

| 项 | 做法 |
| --- | --- |
| 冷启动（应用级） | Electron 以 `--user-data-dir=<独立目录>` 启动；启动前该目录下 `icon-cache`、`studio-cache` 均为 **0 个文件**（脚本记录 `before`） |
| 热启动（应用级） | 同一 `--user-data-dir` 再启动一次（缓存 3 个文件 + 38,760 个 PNG 已就绪） |
| 冷启动（进程级） | vitest 内 mock `app.getPath('userData')`，每次 `vi.resetModules()` + 全新目录；`iconCacheBefore=0` |
| 正确性口径 | 每次都记录物品数、图标数、`iconMissingNoAssets`、配方数、类型数、partial |
| 打包包体 | `E:/PCL/.minecraft/versions/1112`（只读，295 jar / 451,422,994 字节），本轮未写入 |

缓存状态证据（应用级 run1）：

```
before: { iconFiles: 0, cacheFiles: 0 }
after : { iconFiles: 38760, cacheFiles: 3 }   // items.json / recipes.json / meta.json
```

## 3. 冷启动与热启动实测

### 3.1 应用级（真实 Electron，隔离 userData，只读真实整合包）

| # | 状态 | 扫描墙钟 | items | recipes | corpus | 含启动+导入总时长 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 冷（磁盘空闲后首次） | **123.79s** | 114.95s | 8.19s | 0.63s | 133.17s |
| 3 | 冷（紧随其后，磁盘热） | **53.85s** | 46.94s | 6.44s | 0.44s | 57.87s + 启动 |
| 4 | 冷（磁盘热） | **57.87s** | 50.93s | 6.48s | 0.45s | 66.39s |
| 热 | 同一 userData 二次启动 | **0.78s** | 0.15s | 0.13s | 0.47s | 9.63s（其中导入 6.29s） |

> 说明：另有一次 run2 因临时目录删除被宿主 safe-delete 守卫拦截，缓存未清空，**该次不是冷启动，已作废不计入**。

计数（三次冷启动一致）：物品 43,474 / 图标 38,760（89.2%）/ `iconMissing` 4,714（其中无资源 4,714）/
配方 32,890 / 类型 426 / partial 5,334 / 扫描失败 0。

### 3.2 进程级（无 UI/IPC，全新 userData）

| # | 总时长 | detect | items | recipes | corpus | items CPU |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 79.63s | 5.35s | 59.24s | 13.18s | 0.89s | 114.6s |
| 2 | 75.59s | 5.24s | 58.56s | 10.40s | 0.67s | 119.7s |
| 3 | 76.35s | 4.83s | 58.78s | 11.30s | 0.68s | 124.9s |
| 热 | 18.94s | 5.40s | 0.11s | 11.96s* | 0.71s | — |

\* 进程级「热」仍重扫配方，是因为测量直接调用 `scanRecipes`；真实应用热启动走 `loadFromCache`，实测见 3.1（0.13s）。

## 4. 阶段耗时与占比（以应用级冷启动 run1 为基准）

| 阶段 | 耗时 | 占比 |
| --- | --- | --- |
| 应用启动到可调用 IPC | 2.62s | 2.0% |
| 导入（detectMetadata + 元数据扫描） | 6.76s | 5.1% |
| 物品扫描（含 jar 池 + 图标写盘 + 跨 jar 二次解析） | **114.95s** | **86.3%** |
| 配方库（三源 + 合并 + 建索引 + 持久化） | 8.19s | 6.1% |
| 搜索语料 | 0.63s | 0.5% |
| 缓存 meta | 0.012s | ~0% |
| 合计 | 133.17s | 100% |

物品阶段内部（进程级分解轮 + 单 jar 微基准）：

| 子阶段 | 实测 | 说明 |
| --- | --- | --- |
| jar 池（list + read + 解析 + 首轮图标写） | 38.2s（热盘）/ 97–106s（冷盘，交替 A/B） | 主导项 |
| 跨 jar 图标二次解析 | 8.5s（热盘）/ 22.0s（冷盘） | 5,767 misses → 仅 887 命中 |
| mergeItems | 0.024s | 可忽略 |
| writeJson(items.json, 15.3MB) | 0.146s | 可忽略 |

## 5. 已确认瓶颈（附证据）

### B1 图标冷写是单 jar 时间的主要构成（确认）

单线程逐 jar 分解（热盘，与 `jarScan` 相同的串行写）：

| jar | 条目 | 需读条目 | 读取字节 | 物品 | 图标 | list | read | parse | **写图标** | 合计 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chipped | 36,832 | 29,120 | 6.6MB | 7,240 | 7,201 | 1.98s | 4.50s | 0.08s | **8.57s** | 15.13s |
| TConstruct | 27,493 | 13,113 | 6.9MB | 11,983 | 11,726 | 1.34s | 2.54s | 0.11s | **15.19s** | 19.17s |
| rechiseled | 22,843 | 14,514 | 25.0MB | 3,628 | 3,628 | 1.03s | 2.63s | 0.06s | 4.89s | 8.61s |
| chisel | 17,431 | 8,741 | 2.6MB | 1,261 | 1,261 | 0.86s | 1.89s | 0.02s | 1.80s | 4.57s |

代码位置：`src/main/scanner/jarScan.ts` 内 `for (const draft of scanned.items) { … if (!existsSync(target)) await writeFile(target, png) }`
—— **每张图标一次 `existsSync` + 一次串行 `await writeFile`**，单张约 1.2–1.3ms；TConstruct 11,726 张即 15.2s，占该 jar 79%。

### B2 并发下写竞争放大尾延迟（确认，见 6.2）

8 路并发时同一 jar 明显变慢（TConstruct 19.2s 单线程 → 55.4s 并发内），整个池 106s，
其中最长 jar（chipped）80.3s 构成关键路径；p95 8.4s vs 中位 0.25s。

### B3 归档被反复整表枚举（确认）

一次完整冷启动的 zip 层统计：

| 阶段 | listEntries | readMany | 扫描条目数 | 读取字节 | 耗时 |
| --- | --- | --- | --- | --- | --- |
| detect | 0 | 295 | 307,749 | 0.36MB | 2.6s |
| 物品池 | 295 | 295 | 615,498 | 123.2MB | 38.2s |
| 图标二次解析 | 0 | 170 | **567,992** | **3.26MB** | 8.5s |
| 配方 | 295 | 139 | 570,342 | 12.1MB | 6.7s |
| **合计** | **590** | **899** | **1,447,083** | 138.9MB | — |

`readMany`（`src/main/scanner/zip.ts:112`）每次都会顺序回调归档里的**全部条目**再挑需要的读，
所以「1,489 次归档遍历、144 万次 entry 回调」是结构性成本；图标二次解析为 3.26MB 数据扫了 568k 条目。

### B4 每次启动都要重新读 295 个 jar 的元数据（确认）

`detectMetadata → scanModMetadata` 对每个 jar 做一次 `readMany`（只取 mods.toml），
实测 2.6–5.4s；热启动的「导入」仍要 6.29s，这是固定开销。

### B5 配方阶段 6.4–8.2s（确认，但非主要瓶颈）

570k 条目遍历 + 32.7k JSON 解析 + 归一化 + 持久化 31.5MB。

## 6. 尚未确认的假设 / 已证伪

### 6.1 已证伪：Worker 池比同线程慢 3 倍

首次交叉对比（inline 28.2s vs worker 86.3s）后做了**交替 A/B**（同一缓存状态，2 轮）：

| 轮次 | inline8 | worker8 |
| --- | --- | --- |
| 1 | 97.3s | 101.3s |
| 2 | 113.7s | 105.8s |

结论：**两种模式墙钟基本持平**（worker CPU 高约 25%）。先前的 28.2s 是操作系统的页缓存热态离群值，
不能作为「Worker 慢 3 倍」的证据。并发度 4/16/24 也无稳定收益（89.6 / 96.1 / 80.5s）。

### 6.2 未确认：libuv 线程池竞争、Worker 序列化开销

未能单独隔离测量。当前数据只能说明「并发下写放大」，不能归因到具体机制。

### 6.3 未消除的测量干扰：操作系统页缓存

同一台机器、同一份 451MB 包，冷启动在 **53.85s ~ 123.79s** 之间波动，唯一变量是 OS 文件缓存状态；
本轮无管理员权限，无法可靠清空系统缓存，因此**所有绝对值都必须标注缓存状态**。

## 7. 优化候选（按 收益/成本/风险 排序）

| 编号 | 方案 | 证据 | 预期收益 | 风险 / 影响 | 回滚 |
| --- | --- | --- | --- | --- | --- |
| **P1** | `jarScan` 图标写入改为「收集后批量写 + 全局写入限流（如 32）」，不再逐张串行 | 单 jar 写图标 8.6–15.2s，占 57–79% | **10–25s**（大 jar 受益最大） | 低：文件集合、图标 key、`hasIcon` 判定完全不变；需确认限流后不会与 iconPass 的 32 并发叠加打爆磁盘 | 恢复串行写即可 |
| P2 | `detectMetadata` 结果按 mods 签名缓存（items 缓存里已存签名） | 每次启动 2.6–5.4s，热启动导入 6.3s | **5–6s/每次启动** | 低：读不到缓存时回退现逻辑；需处理「只改配置不改 mods」 | 删缓存键或关开关 |
| P3 | zip 层「列一次 + 随机读」，并合并 iconPass 的 4 轮 depth 读取 | 1,489 次遍历 / 144 万 entry；iconPass 568k entries 只读 3.26MB | **10–20s** | 中：触及 `zip.ts` 读取语义与句柄生命周期（现有注释明确要求不复用句柄） | 保留旧 `readMany` 路径，开关切换 |
| P4 | 配方阶段复用 `entriesByJar`、按 jar 合并读取，减少 139 次 readMany | 配方 6.4–8.2s、570k entries | 3–6s | 中：影响配方来源判定与覆盖链 | 独立函数，可回切 |
| P5 | 图标改为单文件归档（index + blob），不再写 3.8 万个小文件 | 38,760 次小文件写 | 20–40s | **高**：`icon://` 协议与缓存清理策略都要改，P-C7 已验收的 UI 依赖路径 | 需保留旧目录回退 |
| P6 | jar 调度按大小降序（LPT），缩小尾部空转 | 池 106s，关键路径 80.3s，p95 8.4s | 1–3s | 极低：只改派发顺序 | 改回自然顺序 |

组合预期（不含 P5）：P1+P2+P6 ≈ 16–34s，P3 ≈ 10–20s。
以冷盘 123.8s 计，**P1+P2+P6 后约 90–108s，仍不能保证 ≤90s**；要稳定达标需要 P3（或 P5）。
因此**本轮不宣称已达到 90 秒目标**。

## 8. 正确性基线对照

| 指标 | 本轮实测（应用级冷启动） | P-C4 / P-C7 记录 | 判定 |
| --- | --- | --- | --- |
| 物品 | 43,474 | 43,474 | 一致 |
| 图标 | 38,760（89.2%） | 38,760 | 一致 |
| 缺图标 | 4,714（全部为包内无资源） | 4,714 | 一致 |
| 配方 | 32,890 | 32,890 | 一致 |
| 类型 | 426 | 426 | 一致 |
| partial | 5,334 | 5,334 | 一致 |
| 扫描失败 | 0 | 0 | 一致 |

> 注：另一份硬链接副本 `pc7-pack-1112` 因 P-C7 验收留下 1 个「另存副本」文件，扫出 32,891 条；该副本不作为基线，已在测量中排除。

## 9. 命令、退出码与环境

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `USER_DATA=… PACK=… node .cache/e2e-opt1.mjs`（run1） | 0 | 冷 123.79s / 热 0.78s |
| 同上（run3 / run4） | 0 / 0 | 冷 53.85s / 57.87s |
| `STUDIO_OPT1=1 vitest run tests/.diag/opt1.profile.test.ts` | 0 | 3 次冷启动 79.63/75.59/76.35s |
| `STUDIO_OPT1=1 vitest run tests/.diag/opt1-io.test.ts` | 0 | zip 层计数（见 B3） |
| `node .cache/opt1/pool-bench.cjs {inline\|worker} 8` | 0 | A/B 2 轮（见 6.1） |
| `node .cache/opt1/jar-bench.cjs` | 0 | 单 jar 分解（见 B1） |
| `tsc --noEmit -p tsconfig.node.json` / `tsconfig.web.json` | 0 / 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `vitest run`（全量） | 0 | 49 文件通过 / 2 跳过；527 通过 / 4 跳过 |

环境：Windows 10/11，i5-14600KF（20 逻辑核），32GB RAM，E: 盘（SATA/NVMe 型号未记录），
Node 20.18.3（Electron 内置）/ 22.14（脚本），Electron 22，应用以 `--in-process-gpu` 等参数运行（本机 GPU 崩溃绕过）。

测量限制：
1. 无法清空 OS 页缓存 → 冷/热盘状态只能靠「空闲后首跑」近似，绝对值波动 2.3 倍。
2. Worker 线程 CPU 计入 `process.cpuUsage`，但无法按线程拆分。
3. `electron-vite` 构建产物与源码行为一致性未单独验证（测量走真实构建产物）。
4. 未测 CI 或第二台机器。

## 10. 建议下一步（单个任务）

**P1：`jarScan` 图标写入批量化 + 全局限流。**

- 改动范围：仅 `src/main/scanner/jarScan.ts` 的写图标循环，外加一个可复用的写入队列（并发上限与 iconPass 共用同一常量）。
- 不改：图标 key 计算、`hasIcon` 语义、文件命名、目录结构、统计口径。
- 预期：大 jar 单线程从 15.2s → 1–3s；冷启动整体 10–25s。
- 验证：`jar-bench`/`pool-bench` A/B + 应用级冷启动 3 次 + 物品/图标/配方计数对照（必须仍是 43,474 / 38,760 / 32,890 / 426 / 5,334）。
- 回滚：恢复串行写（单文件 diff）。

P2（detect 缓存）可作为第二个独立小任务；P3 需要先评审 zip 层句柄策略。
