# P-OPT4-S2：四个调用方替换与 A/B 结果

日期：2026-10-31
范围：把「先 `listEntries` 再 `readMany`」的调用方改用 `listAndRead`（单次遍历）。未改 `iconPass`、未引入句柄缓存、未改 worker/调度/图标写入参数、未删旧 API。

## 1. 四个调用方的核实结果

| 调用方 | 实际路径 | 原有遍历 | 是否可合并 | 处理 |
| --- | --- | --- | --- | --- |
| 物品首轮 | `src/main/scanner/jarScan.ts` | `listEntries` + `readMany` = **2 次** | 是 | **已替换** |
| 配方（jar） | `src/main/recipes/jarRecipes.ts` | `listEntries` + `readMany` = **2 次** | 是 | **已替换** |
| 配方（datapack zip） | `src/main/recipes/jsonSource.ts` → `scanZipPacks` | `listEntries` + `readMany` = **2 次** | 是 | **已替换** |
| 模组元数据 | `src/main/modpack/modList.ts`（被 `detect.ts` 调用） | 只有 `readMany` = **1 次**，没有前置列举 | **否** | **保持原样** |

`modList` 不替换的原因：它只读 `mods.toml` / `fabric.mod.json`，从未先列目录。换成 `listAndRead` 不会减少遍历，反而要把全部条目装进 `entries` 数组（多约 30 万条对象），属于净负担。已在报告中标注，不改。

其余调用方（`schema/classParser`、`codegen/emitDatapack`）不在本阶段授权范围，未动。

## 2. 每个替换点的前后逻辑

### 2.1 `jarScan.ts`

```ts
// 前
const listed = await listEntries(jarPath)            // 遍历 1
if (listed.error) throw new Error(listed.error)
const wanted = listed.entries.map(e => e.fileName).filter(LANG|MODEL|TEXTURE)
const buffers = await readMany(jarPath, new Set(wanted))   // 遍历 2
const scanned = scanJarEntries(listed.entries, readEntry)

// 后
const wanted: string[] = []
const { entries: listedEntries, buffers } = await listAndRead(jarPath, {
  matcher: (name) => {
    if (!LANG_RE.test(name) && !MODEL_RE.test(name) && !TEXTURE_RE.test(name)) return false
    wanted.push(name)                                 // 顺序 == 原先 filter 后的顺序
    return true
  }
})
const scanned = scanJarEntries(listedEntries, readEntry)
```

- `wanted` 仍按「条目出现顺序」收集，`assetEntries`（供 iconPass 建索引）内容与顺序不变。
- `entries` 由 `listAndRead` 返回，与 `listEntries` 逐项一致（已由单测断言）。
- 错误语义：原先 listing 失败抛 `new Error(listed.error)`；现在抛 `打开 jar 失败 <path>：…`。**都是 Error、都由 pool 记为「该 jar 失败」**，仅日志文案变化。

### 2.2 `jarRecipes.ts`

```ts
// 前：listEntries → 过滤 → readMany
// 后：
const wanted: string[] = []
const { buffers } = await listAndRead(jarPath, {
  matcher: (name) => { if (!RECIPE_ENTRY_RE.test(name)) return false; wanted.push(name); return true }
})
if (wanted.length === 0) return []
```

- 未命中任何配方条目时不再读取任何字节（与原先 `wanted.length === 0` 提前返回等价）。
- 失败仍抛 Error（worker/pool 按 jar 隔离）。

### 2.3 `jsonSource.ts`（datapack zip）

```ts
// 前：listEntries → 失败则 log「解析失败」并 continue；readMany → 失败则 log「读取失败」+ onFailed
// 后：一次 listAndRead，按错误来源分流
try { buffers = (await listAndRead(abs, { matcher: ... })).buffers }
catch (err) {
  if (/^(打开|遍历) jar 失败/.test(msg)) { log「解析失败」; continue }
  log「配方条目读取失败」; hooks.onFailed?.(zip, msg); continue
}
if (wanted.length === 0) continue
```

- 保持原有两条日志/上报路径（列举失败不上报 `onFailed`，读取失败才上报）。
- **未传 `signal`**：原实现也只在「数据包之间」检查取消；传信号会让取消以 `AbortError` 落到 catch 里被当成读取失败处理，属于语义变化，故不加。

## 3. 遍历次数与条目回调的变化（按 P-OPT1 实测计数推算）

| 阶段 | 替换前 | 替换后 | 变化 |
| --- | --- | --- | --- |
| 物品（295 jar） | 295 list + 295 readMany = **590 次打开 / 615,498 条目回调** | 295 次打开 / **307,749** | −295 次打开、−307,749 条目 |
| 配方（jar 295 + datapack zip） | 295 list + 139 readMany = **434 次打开 / 570,342 条目** | 295 次打开 / **307,749** | −139 次打开、−262,593 条目 |
| 模组元数据 | 295 readMany（未变） | 295 | 0 |
| iconPass | 170 readMany（未变） | 170 | 0 |
| **合计** | **1,489 次** | **1,055 次** | **−434 次打开、−570,342 条目回调** |

（条目数为 P-OPT1 的 zip 层统计口径：每次打开都会顺序回调该归档的全部条目。）

## 4. 行为一致性验证

| 检查项 | 结果 |
| --- | --- |
| 清单条目/顺序 | `listAndRead` 与 `listEntries` 逐项相等（单测）；`scanJarEntries` 使用同一份 entries |
| 命中集合 | matcher = 原 `filter` 谓词（正则完全相同），`wanted` 收集顺序一致 |
| 字节内容 | 单测 `Buffer.equals` 全等；整包扫描的配方数、物品数一致 |
| 缺失/重复/目录条目 | 单测覆盖：缺失不抛错、重名取最后一次、目录条目被排除 |
| 取消 | `jarScan` 仍由 pool 在 jar 之间检查；`jarRecipes` 由 recipe 池检查；datapack 分支保持「只在 zip 之间检查」。**未新增/减少取消点** |
| 错误传播 | 三个调用方仍抛/记录 Error，未被吞掉；datapack 分支按来源区分日志与 `onFailed` |
| 扫描结果 | 见 §6：43,474 / 38,760 / 4,714 / 32,890 / 426 / 5,334 / 0 失败，五次运行完全一致 |
| 旧 API | `listEntries` / `readMany` / `readEntryBuffer` / `readEntryText` 未改动，其他调用方零影响 |

## 5. 测试与门禁（真实退出码）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `vitest run`（zip + scanPipeline + itemExtraction + sources + recipeIndex + scriptSource + jarPoolCore） | 0 | **7 文件 / 70 通过** |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `electron-vite build` | 0 | — |
| `vitest run`（全量） | 0 | **51 文件通过 / 2 跳过；546 通过 / 4 跳过** |
| P-C5/P-C6 定向（`commitIndexCache` + `commitFailurePaths` + `commitBridge`） | 0 | 24/24 |
| P-C7 真实 Electron 八场景 | 0 | 全部通过，`uiErrors: []` |

## 6. 整包 A/B（真实包 `E:/PCL/.minecraft/versions/1112`）

### 6.1 条件

- 包内容先核对：**295 个 jar / 451,422,994 字节（430.5MB）**，与历史记录一致，未改动。
- 每次运行使用**独立 userData**（`--user-data-dir`），脚本记录起始状态：**iconFiles=0、cacheFiles=0**（图标与扫描缓存均为空）。
- A/B 交替执行并各自重新构建（`electron-vite build`，退出码已校验）；两次切换曾因上一次 Electron 未完全释放 `out/` 导致构建失败（`BUILD=1`），该轮（a2）**作废**，改为加延迟重试后重跑（a3）。
- OS 页缓存**无法清空**，只在同一时间段内交替降低偏差；所有数字都带此前提，不称「绝对冷盘」。

### 6.2 逐轮原始数据

| 轮 | 变体 | 起始图标/缓存 | items | recipes | corpus | 完整扫描 | 端到端 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a1 | 旧 | 0 / 0 | 65.11s | 12.40s | 0.55s | 78.09s | 86.57s |
| b1 | 新 | 0 / 0 | 58.48s | 4.17s | 0.44s | 63.11s | 71.59s |
| a3 | 旧 | 0 / 0 | 96.09s | 9.78s | 0.47s | 106.34s | 117.65s |
| b3 | 新 | 0 / 0 | 53.77s | 4.97s | 0.46s | 59.19s | 67.61s |
| b2 | 新 | 0 / 0 | 66.63s | 5.25s | 0.46s | 72.37s | 81.66s |
| ~~a2~~ | ~~旧~~ | 0 / 0 | 71.22s | 6.71s | 0.47s | 78.41s | 87.95s |

> a2 那轮构建失败（`BUILD=1`），实际跑的是上一份新构建产物，**不作为旧实现证据**，仅留档。

扫描结果计数（五次运行全部相同）：
43,474 items / 38,760 icons / 4,714 missing / 32,890 recipes / 426 types / 5,334 partial / 0 jar failures。

### 6.3 汇总

| 指标 | 旧（a1、a3） | 新（b1、b2、b3） | 变化 |
| --- | --- | --- | --- |
| items | 65.11s / 96.09s | 58.48 / 66.63 / 53.77s | 中位 65.1 → 58.5 |
| recipes | 12.40s / 9.78s | 4.17 / 5.25 / 4.97s | **一致下降 50%+** |
| 完整扫描 | 78.09s / 106.34s | 63.11 / 72.37 / 59.19s | 平均 92.2 → 64.9s（−27.3s） |
| 端到端 | 86.57s / 117.65s | 71.59 / 81.66 / 67.61s | 平均 102.1 → 73.6s |

### 6.4 结论的强度

- **配方阶段最可信**：旧 9.78–12.40s → 新 4.17–5.25s，三新两旧无重叠，机制上也正好对应「jar 配方从 2 次遍历变 1 次」。
- **items 阶段方向一致但波动大**（旧 65–96s，新 54–67s），受磁盘状态影响明显，不宜给点估计。
- 样本量小（旧 2、新 3），且 OS 缓存不可控，因此**只能说「有可重复的方向性收益」，不足以给出统计显著的百分点**。

## 7. 90 秒目标

- 完整扫描：新实现 59.2–72.4s（本轮三次），**已进入 90s 以内**。
- 端到端（启动+导入+扫描）：67.6–81.7s，**本轮三次也都在 90s 以内**。
- 但历史数据显示同一份代码在不同时段可波动 ±30%（P-OPT3 曾测到 items 99–123s），因此**不宣称已稳定达标**；只能说「在本轮条件下达到 90s 以内」。

## 8. 风险、未验证与建议

| 项 | 说明 |
| --- | --- |
| 错误文案变化 | `jarScan`/`jarRecipes` 打开失败的消息从 yauzl 原文变为「打开 jar 失败 <path>：…」，会出现在日志与 `summary.failedMods`。行为（计为该 jar 失败）不变 |
| datapack 分支取消 | 仍只在 zip 之间检查取消，未新增信号；与替换前一致 |
| 仅 Windows 验证 | 未在 POSIX 验证；`listAndRead` 的 `rename` 断言在 POSIX 下恒真 |
| 未验证 | 同一 jar 被并发 `listAndRead`（各自独立句柄，理论安全但无用例） |
| 样本量 | 旧实现仅 2 次有效运行，且窗口内磁盘状态波动大 |
| 建议 | **建议保留本次改动**：配方阶段收益稳定且可解释，计数与回归门禁全绿；后续若继续优化，应优先动 iconPass 的多轮遍历（需 S3 授权） |

## 9. 文件清单

| 文件 | 改动 |
| --- | --- |
| `src/main/scanner/jarScan.ts` | 合并 list+read 为 `listAndRead`，`wanted` 在 matcher 内收集 |
| `src/main/recipes/jarRecipes.ts` | 同上 |
| `src/main/recipes/jsonSource.ts` | datapack zip 分支合并，按错误来源分流日志与 `onFailed` |
| `src/main/scanner/zip.ts` | S1 已加入 `listAndRead`，本轮未改 |
| `src/main/modpack/modList.ts` | **未改**（无可合并的重复遍历） |

A/B 用的旧实现快照与切换脚本位于 `.cache/opt4s2/`（临时目录，不进入仓库）；最终源码为「新」版本，已完成构建与全量回归。
