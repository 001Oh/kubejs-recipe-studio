# PACK-09 · D-2 复测报告（pc5 基准包）

日期：2026-11-01
授权范围：仅执行 `PACK-06` 的 **D-2 复测**（不重做 D-1）
基准包：**`E:\mc kjs\.cache\pc5-pack-1112`**（只读）
主台账基准：**V5**（本轮**未修改**；未生成 V6）
结论：**D-2 通过——五项计数逐项与基准完全一致，含 recipes = 32,890。**

---

## 1. 结论摘要

| 项 | 基准 | 实测 | 结果 |
| --- | --- | --- | --- |
| items | 43,474 | **43,474** | ✅ |
| icons | 38,760 | **38,760**（43,474 − iconMissing 4,714） | ✅ |
| **recipes** | **32,890** | **32,890** | ✅ |
| types | 426 | **426** | ✅ |
| partial recipes | 5,334 | **5,334** | ✅ |
| `cacheHit` | 必须 false | **false** | ✅ |
| `failedMods` | 空 | **0** | ✅ |
| 扫描终态 | 成功 | **`index-ready`** | ✅ |

**D-2：通过。** 与 `PACK-07`（pc7 基准，32,891）的差异被完全解释并消除：差额恰好是 pc7 里那个 P-C7 遗留的另存副本。

---

## 2. 执行环境与前置

| 项 | 值 |
| --- | --- |
| 应用 | 正式安装版 `KubeJS Recipe Studio 0.1.0`（Electron 33.4.11） |
| **基准包** | `E:\mc kjs\.cache\pc5-pack-1112`（1,658 个文件；295 个 jar） |
| **测试 userData** | `E:\mc kjs\.cache\pack-06\ud-pc5-20261101-0550`（独立新建） |
| 启动参数 | `--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --remote-debugging-port=9703` |
| 测试时间 | 2026-11-01 05:49:16 – 05:50:28 |

### 2.1 前置路径回验（硬门禁，已通过）

```
app:runtime.userData = E:/mc kjs/.cache/pack-06/ud-pc5-20261101-0550
路径回验通过：与 prod/dev 均不同
```

脚本对 `%APPDATA%\kubejs-recipe-studio` 与 `...-dev` 做严格比对，命中即中止；本次未命中。

### 2.2 导入结果

```
ok:true
path = E:\mc kjs\.cache\pc5-pack-1112
mcVersion = 1.20.1 ｜ loader = forge ｜ KubeJS = 2001.6.5-build.26 ｜ modCount = 295
```

---

## 3. 扫描实测

| 项 | 值 |
| --- | --- |
| 终态事件 | **`index-ready`**（非 `scan-failed` / `scan-canceled`） |
| **`cacheHit`** | **false**（真实扫描，未命中任何缓存） |
| `failedMods` | **0**（无 jar 解析失败） |
| 命名空间 | 225 ｜ 缺中文名 0 |
| 扫描总耗时 | **38.8 s**（`timings.totalMs = 38,815`） |
| 分阶段 | items **34.5 s** ＋ recipes **3.8 s** ＋ 语料 0.44 s ＋ 缓存提交 0.007 s |
| 事件条数 | 全程收集（含 progress / log），终态为 `index-ready` |

**应用自身日志（`<测试 UD>/logs/`）**

```
21:49:38.847  INFO    SCAN    开始扫描 mod jar…（295 个）
21:50:12.929  INFO    INDEX   索引完成：43,474 个物品 / 225 个模组命名空间 / 耗时 34.1s
21:50:17.638  SUCCESS INDEX   索引就绪：43,474 个物品（含虚拟 19）/ 225 个命名空间 / 配方 32,890 条（类型 426 种）
21:50:17.639  INFO    INDEX   耗时明细：物品 34.5s + 配方 3.8s + 语料 0.44s + 缓存提交 0.01s = 合计 38.8s
```

> 日志中的「配方 **32,890** 条」是应用自己写的，与 API 取值互相印证。

---

## 4. 与 PACK-07（pc7 基准）的对照

| 项 | pc7（PACK-07） | pc5（本轮） | 差异 |
| --- | --- | --- | --- |
| items | 43,474 | 43,474 | 0 |
| icons | 38,760 | 38,760 | 0 |
| **recipes** | **32,891** | **32,890** | **−1** |
| types | 426 | 426 | 0 |
| partial | 5,334 | 5,334 | 0 |
| cacheHit | false | false | — |
| 扫描耗时 | 45.6 s | 38.8 s | 环境波动 |

**差异归因已被证实**：`PACK-08` 的只读核验显示 `pc5` 的文件集 = `pc7` **减去**那条
`recipe_studio/recipes/compat_…_20261031185835.json`（P-C7 遗留的另存副本，1 条 `crafting_shaped`），其余（含 295 个 jar，同 inode）完全一致。

⇒ 实测差值 **正好 = 1**，与该推断**精确吻合**。D-2 的计数标准与 pc5 的包内容自洽。

---

## 5. 证据清单

| 路径 | 内容 |
| --- | --- |
| `.cache/pack-06/d2-pc5/driver.log` | 本轮驱动逐步骤日志（路径回验 / 导入 / 扫描 / 计数） |
| `.cache/pack-06/d2-pc5/result.json` | 完整结果：summary、recipeStats、终态事件、耗时 |
| `.cache/pack-06/d2-pc5/app-stdout.log`、`app-stderr.log` | 应用完整输出（无 worker 报错、无扫描失败） |
| `.cache/pack-06/d2-pc5/scan-started.flag`、`scan-done.flag` | 扫描起止时间戳 |
| `.cache/pack-06/ud-pc5-20261101-0550/` | **本轮测试 userData（38,807 文件，保留不清理）** |
| `.cache/pack-06/result-pc7-20261101-0541.json`、`driver-pc7-20261101-0541.log` | PACK-07 的 pc7 原始证据（已另存，未被覆盖） |
| `docs/PACK-08-BASELINE-PACK-VERIFY.md` | 选包依据（pc5 vs pc3 只读对比） |

---

## 6. 边界与保护核对

| 要求 | 执行情况 |
| --- | --- |
| 基准包只读 | ✅ `pc5-pack-1112` 仍为 **1,658** 个文件；被抽查的 `module_acid_rain_proof_unit.json` 修改时间仍是 **10-31 17:45**（非今日），未被触碰 |
| 独立 `STUDIO_USER_DATA` | ✅ `ud-pc5-20261101-0550`，且经 `app:runtime` 回验 |
| 不重做 D-1 | ✅ 未测、未改、未重新解释 D-1 证据 |
| 不改代码/配置/台账 | ✅ 源码、`electron-builder.yml`、`package.json`、主台账 V5 均未改；未生成 V6 |
| 不触碰 prod/dev 数据 | ✅ prod **90,535** 文件、dev **38,817** 文件，与本轮前一致 |
| 不清理历史证据 | ✅ `PACK-01~08` 全部保留；pc7 的 run 结果已另存防覆盖 |
| `ud-*` 目录保留 | ✅ 两份测试 UD 均保留：`ud-20261101-0537`（38,808 文件）、`ud-pc5-20261101-0550`（38,807 文件） |

---

## 7. D 类与 REL-PKG 状态判断（**不改台账，等确认**）

| 项 | 状态 |
| --- | --- |
| **D-1**（asar 下 worker 可运行） | ✅ 通过（`PACK-07` §4；**附证据缺口声明**：`stats.usedWorkers` 在该构建中无任何外部出口，判定基于"asar 探针实测 + worker 分支唯一性 + 无失败"三段实测链） |
| **D-2**（295-jar 冒烟 + 五项计数） | ✅ **通过（本轮）** |
| **D-3**（D-1 失败时的错误证据） | 不适用 |
| **D 类整体** | **两项验收项全部满足 → 建议关闭** |
| `REL-PKG` 整体 | **仍未关闭**：A ✅ / **B ⚠️ 部分通过（升级 B3 未执行）** / C ✅ / D ✅ |

> 按纪律：`REL-PKG` 的四类验收里 **B 类的"升级"一项仍无证据**，因此即便 D 类通过，**整个 `REL-PKG` 不能关闭**，也不能宣称可发布。

---

## 8. 本轮未做的事

- 未重做 D-1、未修改其证据与结论。
- 未修改源码、依赖、`electron-builder.yml`、`package.json`。
- 未修改主台账（仍 V5），未生成 V6。
- 未触碰 prod/dev 用户数据，未清理任何历史包或证据目录。
- 未处理 GPU / B3 / `REL-VERIFY-DUAL` / `REL-VERIFY-4K`。

---

## 9. 待你决定

1. 是否依据本报告**关闭 D 类**（并同步更新 `REL-PKG` 的四类进度注记，状态仍保持"未验证"）——需你确认后我再做 V6。
2. B 类"升级"一项如何处理（需要上一版本安装包；此前已判定为未执行）。
