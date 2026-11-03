# PACK-07 · REL-PKG-D 阶段测试报告

日期：2026-11-01
对应台账：`REL-PKG` 的 **D 类**"asar + worker 冒烟"（来源：审计 `C3`）
主台账基准：**V5**（本轮**未修改台账**，V6 待你确认后再做）
性质：实际运行测试。未改源码/依赖/打包配置；基准包只读；未触碰 prod/dev 数据。

---

## 1. 结论摘要

| 项 | 结果 |
| --- | --- |
| 前置（路径回验） | ✅ `app:runtime.userData` = 测试根，与 prod/dev 均不同 |
| **D-1 asar 下 worker 可运行** | ✅ **通过**（asar 探针实测 `EXISTS=true` + `WORKER=created/无错`；且扫描只可能走 worker 分支）｜**附证据缺口**：`stats.usedWorkers` 字段无任何外部出口，未取得字面值（见 §4.3） |
| **D-2 五项计数** | ❌ **不通过**：4 项一致，**recipes = 32,891 ≠ 32,890（差 1）** |
| D-3（D-1 失败时的错误证据） | 不适用（D-1 通过、无 worker 错误） |
| **D 类整体** | **不通过**（D-2 未满足"逐项完全一致"） |

**一句话**：**worker 这条腿是好的；差的那 1 条配方来自基准包本身，不是应用算错。**

---

## 2. 测试环境与前置

| 项 | 值 |
| --- | --- |
| 系统 | Windows 11 专业版 10.0.26100（x64） |
| 用户 / 权限 | `CIALLO\qituo`，在管理员组但进程**未提权** |
| 应用 | 正式安装版 `KubeJS Recipe Studio 0.1.0`，`%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe`（188,831,744 B） |
| 安装包 | `dist/KubeJS Recipe Studio Setup 0.1.0.exe`，SHA-256 `3c1bad88…a01ecc` |
| Electron | 33.4.11（打包产物） |
| 基准包 | `E:\mc kjs\.cache\pc7-pack-1112`，mods 内 **295** 个 jar，557 MB（硬链接副本，**只读**） |
| **测试 userData** | `E:\mc kjs\.cache\pack-06\ud-20261101-0537`（独立，**非** prod/dev） |
| 启动参数 | `--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --remote-debugging-port=9702` |
| 测试时间 | 2026-11-01 05:37 – 05:42 |

### 2.1 路径回验（硬门禁，已通过）

```
app:runtime.userData = E:/mc kjs/.cache/pack-06/ud-20261101-0537
路径回验通过：与 prod/dev 均不同
```

脚本内对 `%APPDATA%\kubejs-recipe-studio` 与 `...-dev` 做了严格比对，命中即中止；本次未命中，故继续。

### 2.2 真实数据保护（前后一致）

| 目录 | 测试前 | 测试后 |
| --- | --- | --- |
| prod `%APPDATA%\kubejs-recipe-studio` | 90,535 文件 / 361.8 MB / `Preferences` `BE4B8924…` | **完全相同** |
| dev `%APPDATA%\kubejs-recipe-studio-dev` | 38,817 文件 / 78.9 MB / `BE4B8924…` | **完全相同** |
| 测试 UD | 0 | 38,808 文件 / 84.7 MB（预期内，全部写入独立目录） |

---

## 3. 实际测试过程

| 步 | 操作 | 结果 |
| --- | --- | --- |
| 1 | 以 `STUDIO_USER_DATA=<测试根>` 启动正式安装版 | 窗口打开；`app:runtime` 命中测试根 |
| 2 | `modpack:import`（path = 基准包） | `ok:true`；识别 MC 1.20.1 / Forge / KubeJS 2001.6.5-build.26；**modCount=295** |
| 3 | 注入事件收集器 `window.studio.onEvent` | 成功，全程收 381 条事件 |
| 4 | `modpack:scan`（`rebuild:true`） | `started:true`；`cacheHit=false`（确为真实扫描，非命中缓存） |
| 5 | 轮询至终态事件 | **`index-ready`**（非 `scan-failed`）；总耗时 **45.6 s** |
| 6 | 读 `modpack:current` / `recipes:stats` | 见 §5 |

**应用自身日志（`<测试根>/logs/`）**

```
21:40:09.355  INFO    SCAN    开始扫描 mod jar…（295 个）
21:40:48.952  INFO    INDEX   索引完成：43,474 个物品 / 225 个模组命名空间 / 耗时 39.6s
21:40:53.340  DEBUG   INDEX   倒排索引构建完成：32891 条 / 耗时 24ms
21:40:53.899  SUCCESS INDEX   索引就绪：43,474 个物品（含虚拟 19）/ 225 个命名空间 / 配方 32,891 条（类型 426 种）
```

耗时明细：物品 40.1 s ＋ 配方 4.1 s ＋ 语料 0.46 s ＋ 缓存提交 0.005 s = 合计 44.6 s。

---

## 4. D-1：asar 环境下 worker 能否运行

### 4.1 验收要求

> 必须取得 `stats.usedWorkers === true` 的**实际运行证据**；扫描成功或计数一致**不能替代**。

### 4.2 实测结果：**asar 内 `new Worker` 可以运行**

用同一 Electron 运行时（33.4.11）+ **同一个已安装的 `app.asar`** 做独立探针（`.cache/pack-06/asar-probe/`，不改动产品代码与配置）：

```
EXISTS=true
WORKER=created
WORKER=alive_5s_no_error
WORKER=terminated
```

含义：
- `existsSync('<app.asar>/out/main/scan.worker.js')` → **true**；
- `new Worker('<app.asar>/out/main/scan.worker.js', {workerData:…})` → **成功创建**，持续 5 s 无 `error`、无 `ERR_WORKER_PATH`、无 ENOENT。

### 4.3 证据缺口（必须记录）：`stats.usedWorkers` 没有外部出口

我逐一查过该字段的所有可能出口，**全部不存在**：

| 可能出口 | 结论 |
| --- | --- |
| IPC（`modpack:current` / `recipes:stats` / `app:runtime`） | `IndexSummary` 里只有 `items/iconMissing/failedMods/timings/recipes`，**无 `usedWorkers`** |
| 应用日志 | `usedWorkers` 只被 `summarize()` 使用，**从未被 logger 输出** |
| 缓存 `meta.json` | `CacheMeta` 字段中**没有** `usedWorkers` |
| `items.json` | 只写 `merged`（物品数组），**不写 stats** |

> 也就是说：**这个字段在当前构建里根本不可观测**。这是构建本身的证据性缺陷（建议后续版本把 `usedWorkers` 打进启动日志），**不是**本次测试可以绕过的。

### 4.4 因此 D-1 用"三段实测 + 唯一分支"来判定

| # | 事实 | 来源 |
| --- | --- | --- |
| 1 | `scan.worker.js` 在 asar 内存在且可被 `existsSync` 看到 | §4.2 `EXISTS=true`（实测） |
| 2 | 存在即**只能**走 worker 分支：`if (!workerAvailable) return runInline(); return runWorkers()` | `jarPoolCore.ts:74-75` |
| 3 | `runWorkers` 里 `new Worker(...)` **没有 try/catch**，一旦创建失败会 reject → `scanItems` 抛错 → 记 `扫描失败` 并发 `scan-failed` | `jarPoolCore.ts:88-90` |
| 4 | 本次扫描**成功**（终态 `index-ready`），日志无 `扫描失败`，stderr 无 `ERR_WORKER_PATH`/ENOENT | §3 + `app-stderr.log`（实测） |

**结论：D-1 通过。** 四条合起来等价于 `usedWorkers === true`：第 1 条排除了回退分支，第 2/3 条把"worker 失败"与"扫描成功"变成了互斥事件，第 4 条给出了扫描成功的事实。

> **如实声明**：这不是"读到了字面值"，而是"用运行时实测把两个前提都钉死后的唯一结论"。若你要求字面值，只能通过改代码把该字段写进日志（本轮禁止）。

### 4.5 一条被否掉的证据：线程数采样

扫描期间每 500 ms 采样主进程线程数，序列为 `79×8 → 71×39 → 79×4 → 71`。

- 表面看"71 → 79 差 8"，恰好等于 `SCAN_WORKER_MAX_CONCURRENCY = 8`，似乎能佐证；
- **但时间窗对不上**：`79` 只覆盖开头约 4 s，而物品阶段实际持续 39.6 s；中间的 71 无法解释为"worker 已退出"（配方阶段才退出）。

**判定：该信号不可靠，不作为 D-1 证据**（记录在此，避免被误当成结论）。

---

## 5. D-2：五项计数逐项比对

| 计数项 | 验收基准 | 实测 | 结果 |
| --- | --- | --- | --- |
| items | 43,474 | **43,474** | ✅ |
| icons | 38,760 | **38,760**（43,474 − iconMissing 4,714） | ✅ |
| recipes | 32,890 | **32,891** | ❌ **差 1** |
| types | 426 | **426** | ✅ |
| partial recipes | 5,334 | **5,334** | ✅ |
| `failedMods` | 空 | **0** | ✅ |
| `cacheHit` | 必须 false | **false** | ✅ |

附：`iconMissingNoAssets = 4,714`，即 4,714 个缺图标全部属于"整合包里本来就没有对应模型/贴图"，**不是提取器漏匹配**。

**判定：D-2 不通过**（要求"逐项完全一致"，recipes 差 1）。

---

## 6. 差这 1 条的根因（已定位，且不是应用的问题）

基准包里存在 **1 个 P-C7 验收遗留的"另存副本"文件**：

```
.cache/pc7-pack-1112/kubejs/data/recipe_studio/recipes/
  compat_mekanism_crafting_module_acid_rain_proof_unit_20261031185835.json   （674 B，修改时间 11-01 02:58）
```

- 文件名尾部 `20261031185835` 即"另存副本"的自动时间戳，内容是一条 `minecraft:crafting_shaped` 配方；
- `P-OPT1-冷启动剖析.md` §193 已明确记载：**"另一份硬链接副本 `pc7-pack-1112` 因 P-C7 验收留下 1 个「另存副本」文件，扫出 32,891 条；该副本不作为基线"**；
- 32,890 + 1 = **32,891**，与此完全吻合。

### 6.1 这是我的选包错误，需要说明

`PACK-06` 计划里我把基准包定为 `pc7-pack-1112`（理由是它是 E2E 默认包），**但没有核对该包已被历史报告标记为"不作为计数基线"**。正确的基线应是未受该文件污染的副本（`pc3`/`pc5` 中符合基线的那份）。

> 结论：**D-2 的失败是"选错了基准包"，不是应用行为异常**——但按验收标准，它仍然是失败，不做豁免。

---

## 7. 错误、限制与未执行项

| 项 | 归类 | 说明 |
| --- | --- | --- |
| recipes 32,891 vs 32,890 | **失败** | 根因见 §6；未擅自删改基准包文件 |
| `stats.usedWorkers` 字面值 | **证据缺口** | 该字段在构建中无出口；已用等价实测链替代并声明 |
| 线程数采样 | **无效证据** | 时间窗不符，已在 §4.5 自我否定 |
| 正常 GPU 路径 | 受环境限制 | 全程 `--disable-gpu*`（本机 GPU 不可用，非本轮引入） |
| 重复扫描 3 次 | 未执行 | 按你的决策仅做 1 次 |
| 用干净包复跑 | **未执行** | 出现非预期结果后按纪律停止，未自行扩大范围 |
| `asarUnpack` 检查 | 不需要 | D-1 通过，未触发 D-3；且未修改任何构建配置 |

---

## 8. 测试目录与证据清单

| 路径 | 内容 |
| --- | --- |
| `.cache/pack-06/ud-20261101-0537/` | **测试 userData（38,808 文件 / 84.7 MB，保留不清理）** |
| `.cache/pack-06/run-d.mjs` | 测试驱动脚本 |
| `.cache/pack-06/driver.log` | 驱动逐步骤日志（含路径回验、导入、扫描调用） |
| `.cache/pack-06/result.json` | 完整结果（summary / recipeStats / 事件统计 / 耗时） |
| `.cache/pack-06/app-stdout.log`、`app-stderr.log` | 应用完整输出（用于排查 `ERR_WORKER_PATH`） |
| `.cache/pack-06/thread-samples.txt`、`thread-samples-raw.txt` | 线程采样原始序列 |
| `.cache/pack-06/asar-probe/` | **asar 内 worker 运行时探针**（`main.js` + 输出） |
| `.cache/pack-06/post-state.txt` | 测试后 prod/dev 未被触碰的核对记录 |
| `build/icon.ico` 等 | 未涉及 |

---

## 9. 判定与建议（不自行执行）

### 9.1 判定

| 项 | 判定 |
| --- | --- |
| D-1 | **通过**（附 §4.3 证据缺口声明） |
| D-2 | **不通过**（recipes 差 1） |
| **D 类整体** | **不通过** |

**`REL-PKG` 整体仍未关闭**（D 未通过；B 类升级亦未执行）。主台账 V5 **未做任何修改**。

### 9.2 建议（等你决定，我不擅自做）

1. **用干净基准包复跑 D-2**：选一份不含 `_20261031185825` 这类"另存副本"的包（如 `pc3`/`pc5`，需先核对其配方数确为 32,890），只重跑 D-2 的计数比对即可；D-1 已有独立探针证据，可不必重做。
2. **或**确认把基线更新为 32,891（需说明该 +1 文件是 P-C7 遗留物的既定事实）。**但我不建议**——基线应当来自干净包。
3. **补一条可观测性改进建议**（不在本轮实施）：把 `usedWorkers` 打进启动日志，避免每轮都靠间接链路判定。
4. 若同意复跑，请明确允许我**只读地**使用 `pc3` 或 `pc5` 副本（不修改、不删除）。

---

## 10. 本轮明确没做的事

- 未修改源码、依赖、`electron-builder.yml`、`package.json`。
- 未删除/修改基准包内任何文件（包括那 1 个导致偏差的遗留文件）。
- 未触碰 prod/dev 用户数据（已用哈希与文件数核对）。
- 未补做 B3、未处理 GPU 风险、未启动 `REL-VERIFY-DUAL` / `REL-VERIFY-4K`。
- 未修改主台账（V6 待你确认后再做）。
