# PACK-12 · REL-PKG「已安装版本核心扫描」验证准备报告

- 日期：2026-11-01
- 性质：**仅测试准备**。本轮**未启动应用、未导入整合包、未执行扫描**；未修改代码/配置/安装包/V7 台账；未触碰生产 userData；未覆盖/删除/移动任何整合包；未清理历史证据。
- 台账基准：`docs/PROJECT-SEALING-LEDGER-REPORT.md` **V7**（本轮未修改）
- 关联：`PACK-07-REL-PKG-D-REPORT.md`、`PACK-09-D2-RERUN-REPORT.md`、`.cache/pack-06/`（D 阶段原始证据）

---

## 0. 先说结论：V7 台账对该缺口的判据有误，缺口可能并不存在

V7 §3.7「B 类的逐项状态」把「核心扫描」判为 **❌ 未执行**，理由写着：

> "`PACK-07`/`PACK-09` 的 295-jar 扫描运行于 `dist/win-unpacked` 与 asar 独立探针，**不是已安装版本**，不能计入本项"

**这句话的后半段是错的。** 逐项取证后确认：`PACK-07` 与 `PACK-09` 的 295-jar 扫描，**执行主体就是正式安装版**（`%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe`），只是用 `STUDIO_USER_DATA` 指向了独立测试目录。asar 探针是**另做的辅助子测试**，不是那次扫描本身——我把两者混为一谈了。

按你本轮设定的规则"不将开发版、win-unpacked 或 asar 探针结果当作已安装版本扫描证据"——这条规则恰恰**被 PACK-07/09 满足了**，而不是被它违反。

因此：**「已安装版本核心扫描」在事实上已有证据**。本报告仍按你的要求给出完整最小验证方案（§4–§9），但把"是否还需要跑"作为一个需要你裁决的问题放在 §3 与 §10。

---

## 1. 更正用的证据链（四条，互相独立）

### 1.1 驱动脚本硬编码的是**已安装版**路径

`.cache/pack-06/run-d.mjs` 第 12 行：

```js
const EXE = process.env.LOCALAPPDATA + '\\Programs\\KubeJS Recipe Studio\\KubeJS Recipe Studio.exe'
```

第 61–63 行启动方式：

```js
const child = spawn(EXE, [...GPU, `--remote-debugging-port=${PORT}`], {
  cwd: ROOT,
  env: { ...process.env, STUDIO_USER_DATA: UD, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined },
  detached: true, ...
})
```

→ 执行文件是**已安装版**；测试隔离靠 `STUDIO_USER_DATA`，不是靠换 exe。

### 1.2 D-2 复测（PACK-09）的驱动日志

`.cache/pack-06/d2-pc5/driver.log` 全文关键行：

```
launched pid=66976 UD=E:/mc kjs/.cache/pack-06/ud-pc5-20261101-0550
CDP ready
app:runtime.userData = E:/mc kjs/.cache/pack-06/ud-pc5-20261101-0550
路径回验通过：与 prod/dev 均不同
import = {"ok":true,...,"path":"E:\\mc kjs\\.cache\\pc5-pack-1112",...,"modCount":295,...}
事件收集器已注入
scan = {"ok":true,"data":{"started":true}}
扫描结束 kind=index-ready 耗时=39.8s
--- 计数 ---
items      = 43474
icons      = 38760 (iconMissing=4714)
recipes    = 32890
types      = 426
partial    = 5334
cacheHit   = false
failedMods = 0
DONE
```

### 1.3 该次测试 userData 内的**应用自身日志**（最硬的现场证据）

`.cache/pack-06/ud-pc5-20261101-0550/logs/studio-2026-11-01.log`：

```
3:  2026-10-31T21:49:32.615Z  INFO  IO   数据目录（env）：E:/mc kjs/.cache/pack-06/ud-pc5-20261101-0550
12: 21:49:38.844  DEBUG  INDEX  缓存目录：…\studio-cache\d412cc3ebb7a5ce0（meta 存在：false，items 存在：false）
13: 21:49:38.845  INFO   INDEX  用户触发重建：忽略物品缓存
14: 21:49:38.847  INFO   SCAN   开始扫描 mod jar…（295 个）
20: 21:49:55.647  DEBUG  SCAN   已解析 295/295：TConstruct-1.20.1-3.11.2.166.jar（累计 43640 个物品）
24: 21:50:12.929  INFO   INDEX  索引完成：43,474 个物品 / 225 个模组命名空间 / 耗时 34.1s
27: 21:50:17.081  INFO   INDEX  配方库构建完成：32,890 条（原版 13,938 / 模组 18,804 / KubeJS 148）/ 耗时 3.7s
28: 21:50:17.082  WARN   INDEX   5,334 条配方解析不完整，已标记 partial
29: 21:50:17.083  DEBUG  INDEX   可用配方类型全集：426 种
```

— 一个真实运行的应用进程，在 40 秒里扫完全部 295 个 jar 并写出了完整索引。

### 1.4 应用报告的自述

- `PACK-07` §2：「应用 | **正式安装版** `KubeJS Recipe Studio 0.1.0`，`%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe`（188,831,744 B）」
- `PACK-09` §2：「应用 | **正式安装版** `KubeJS Recipe Studio 0.1.0`（Electron 33.4.11）」

### 1.5 我错在哪里

写 V7 时我依据的是 **`PACK-07` §4.2**（那一段讲的是 `asar-probe/` 里的独立 `new Worker` 探针，代码在 `.cache/pack-06/asar-probe/`），把**"探针不是已安装版"**错误地扩写成了**"扫描不是已安装版"**。没有回去看 `run-d.mjs` 的 `EXE` 常量。这是**推断替代核查**，与本项目一贯的判据纪律相违背。

---

## 2. 更正后的 B 类逐项状态（事实口径）

| B 类子项 / 通过要求 | V7 现记 | **更正后** | 依据 |
| --- | --- | --- | --- |
| 安装 | ✅ | ✅ 通过 | `PACK-04` B1 |
| 启动 | ✅ | ✅ 通过（附 GPU 限制） | `PACK-04` B2 + `PACK-11` N5 |
| **核心扫描** | ❌ 未执行 | **✅ 已有记录**（应改为通过） | `PACK-07`/`PACK-09`：已安装版 + 独立 userData + 295 jar + `index-ready` + 五项计数全中（见 §1） |
| 升级（数据保留）→ 同版本覆盖安装 | ✅（替代标准） | ✅ 满足（替代标准 N1–N6） | `PACK-04` §6 + `PACK-11` |
| 卸载 | ✅ | ✅ 通过 | `PACK-04` B4 |
| 通过标准「升级后**缓存/备份**仍在」 | ✅ | ✅ 满足 | `PACK-11` §7 |
| 通过标准「升级后 **`uiState`** 仍在」 | ❌ 未验证 | **❌ 仍未验证**（不受本次更正影响） | `PACK-11` §11；`uiState.json` 被应用覆写、未做前后哈希 |

**更正后的推论**：B 类的**唯一**未满足项，只剩**「`uiState` 保留」**这一条。`REL-PKG` 仍然**不能关闭**，但阻塞理由由「两项」收窄为「一项」。

> ⚠️ 本轮**未修改 V7**（授权禁止）。是否修正、如何修正，见 §10 决策项 D1。

---

## 3. 那"缺口"到底还在不在：两种口径分开说

| 口径 | 是否仍有缺口 | 说明 |
| --- | --- | --- |
| **事实口径**（已安装版能否完成核心扫描并出正确索引） | **无缺口** | `PACK-07`/`PACK-09` 已实测：已安装版扫完 295 jar，`index-ready`，五项计数与基线完全一致 |
| **形式口径**（是否必须在"B 类连续序列内、用默认 userData"执行） | 有形式差异，但**不可执行** | 若坚持用默认 userData，那正是**生产 userData**，与本轮"不修改真实生产 userData"的禁令直接冲突。**唯一合法的扫描方式只能是独立 userData——也就是 PACK-07/09 的做法** |
| **时效口径**（证据是否仍对应当前安装） | 无缺口 | 当前安装 exe SHA `193E131D…66F28` 与 `PACK-04`/`PACK-11` 一致；`PACK-09` 所用安装即同一版本（05:20 重装，同一安装包 SHA `3c1bad88…`） |

**我的判断**：这个"缺口"是**台账表述错误**造成的，不是真实技术缺口。**再跑一次扫描不会带来新的验收信息**，只能算"重复验证"。

> 但如果你希望留一份**当前时点、专为 B 类、含整包只读校验**的连续复测记录（作为一种加固，而非补缺口），§4–§9 的方案可直接执行。

---

## 4. 测试环境与目录规划

### 4.1 当前环境（本轮实测，只读）

| 项 | 值 |
| --- | --- |
| 正式安装版 | `C:\Users\qituo\AppData\Local\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe` |
| 版本 | `app.asar/package.json` → **0.1.0** |
| 主程序 | 188,831,744 B / SHA-256 `193E131D0C39590BB4651414824F91538D4059A0A9FD63154F03398BE0466F28` |
| 安装目录 | 74 文件 / 270.9 MB |
| **生产 userData（禁区）** | `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio`（90,535 文件 / 361.8 MB） |
| dev userData（同样禁用作测试目录） | `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio-dev` |
| 基准整合包（**只读**） | `E:\mc kjs\.cache\pc5-pack-1112`（1,658 文件；`mods/` 下 **295** 个 jar；全包共 308 个 jar，另 13 个在 `essential/`、`1112.jar`、modlauncher 中，**不在扫描范围**） |
| 磁盘可用 | `E:` 剩余 **757 GB**（本次预计占用 ~150 MB） |
| 应用进程 | 无残留（已核对） |

### 4.2 生产 userData 的"不得变动"基线（本轮实测）

| 项 | 值 |
| --- | --- |
| 文件数 / 大小 | **90,535 / 361.8 MB** |
| 哨兵 `recipe-backups\94edb64c700da612\…f08a4e` | `F08A4E6103F1C905B8113427A46967FFD98C22BF3DF72E2F19A5FD721980DA85` |
| `Preferences` | `BE4B8924AB38E8ACF350E6E3B9F1F63A1A94952D8002759ACD6946C4D5D0B5DE` |

> 三项在测试前后必须**完全一致**；任一变化即判定测试污染，立即停止。

### 4.3 目录规划

```
E:\mc kjs\.cache\pack-12\
├── ud-<YYYYMMDD-HHMM>\        ← 全新空目录，作为 STUDIO_USER_DATA（唯一写入目标）
├── out\                        ← 驱动输出
│   ├── driver.log
│   ├── app-stdout.log
│   ├── app-stderr.log
│   ├── events.jsonl           ← CDP 事件全量落盘
│   ├── result.json            ← 计数 + 环境 + 判定
│   ├── scan-window.png        ← 扫描完成后截图
│   ├── pack-manifest-before.json
│   ├── pack-manifest-after.json
│   └── prod-ud-before.json / prod-ud-after.json
└── run-scan.mjs               ← 驱动脚本（新建，复用 run-d.mjs 已被验证的 CDP 用法）
```

**隔离硬门禁**：`ud-*` 必须在 `.cache\pack-12\` 下**新建空目录**；启动后第一件事校验 `app:runtime.userData` 严格等于该目录，且**不等于** prod / dev，否则**立即中止，不导入、不扫描**。

---

## 5. 具体执行步骤（共 12 步，含 5 个中止点）

| # | 步骤 | 判定 / 中止条件 |
| --- | --- | --- |
| 0 | **只读前置**：确认无残留进程；核对安装 exe 的 SHA-256；记录生产 userData 三项基线；生成基准包清单 `pack-manifest-before.json`（相对路径 + 大小 + mtime，1,658 条） | exe SHA ≠ `193E131D…` → 中止（安装已被改动） |
| 1 | 新建 `pack-12\ud-<ts>\`（空目录） | 目录非空 → 换名重建 |
| 2 | 以**已安装 exe** 启动：`STUDIO_USER_DATA=<ud>` + 与项目 E2E 一致的 `--disable-gpu*` 参数组 + `--remote-debugging-port=9711` | 30 s 内 CDP 未就绪 → **中止** |
| 3 | **【硬门禁】** 取 `app:runtime` | `userData` ≠ 测试目录，或 == prod/dev → **立即中止**（不再执行 4–9） |
| 4 | `modpack:import { path: 'E:\\mc kjs\\.cache\\pc5-pack-1112' }` | `ok≠true` 或 `modCount≠295` → 中止 |
| 5 | 复算基准包清单，与 `before` 比对 | 有任何差异 → **立即中止**（证明导入会写包，与既有结论冲突，需上报） |
| 6 | `modpack:scan { rebuild: true }` → 订阅事件直到 `index-ready` / `scan-failed` / `scan-canceled`；超时 300 s | 非 `index-ready` → 记录并中止；超时 → 中止 |
| 7 | 取 `modpack:current` + `recipes:stats`，记录 items / icons / recipes / types / partial / failedMods / cacheHit / timings | — |
| 8 | 截图（`Page.captureScreenshot`） | 截图失败仅记录，不中止 |
| 9 | `Browser.close` 优雅关闭，确认无残留进程 | 关不掉 → 记录，用 `taskkill /PID /T /F` 收尾并注明 |
| 10 | 复算基准包清单 → `after`，与 `before` **逐条比对** | 有任何差异 → **判定测试失败并上报**（不做修复） |
| 11 | 复算生产 userData 三项基线 | 任一变化 → **判定污染并上报** |
| 12 | 汇总 `result.json` + 报告 | — |

**超时与并发**：单次扫描 40 s 量级，整体流程预计 **3–5 分钟**（含启动与收尾）。测试期间**不得**同时跑构建/打包/其他扫描，避免争抢磁盘与 CPU 影响计时。

---

## 6. 数据写入范围及风险

### 6.1 会写入什么（全部落在测试 userData 内）

依据上一轮实测（`.cache/pack-06/ud-pc5-20261101-0550`）与代码核查：

| 目标 | 预计规模 | 来源 |
| --- | --- | --- |
| `<ud>\icon-cache\` | **38,760 个文件 / 77 MB** | 图标抽取 |
| `<ud>\studio-cache\<packHash>\{items.json, meta.json, recipes.json}` | **3 个文件 / 45 MB** | 索引落盘（tmp + rename 原子替换） |
| `<ud>\cache\` | 6 个文件 / 7 MB | 语料等 |
| `<ud>\logs\studio-2026-11-01.log` | ~1 MB | 应用日志（含扫描逐条进度） |
| `<ud>\uiState.json`、`Preferences`、`Local State` | <1 KB | 应用自身状态 |
| `<ud>` 下 Chromium 档案目录（`Cache`/`Code Cache`/`GPUCache`/`Local Storage`…） | 数十 MB | Electron 默认行为 |
| **合计** | **约 130–150 MB** | — |

### 6.2 **不会**写入什么（需要在实测中核对，不能只靠代码结论）

| 对象 | 依据 | 核对方式 |
| --- | --- | --- |
| **基准整合包 `pc5-pack-1112`** | `src/main/scanner/**` 内**无任何写调用**；`src/main/modpack/**` 仅一处 `writeFileSync`，目标是 `favoritesFile()`（在 userData 内）；`scanService.ts:184` 只把 `modpackPath` 当**元数据**传递 | 步骤 5 / 10 的**清单比对**（1,658 条，逐条 size+mtime） |
| 生产 / dev userData | 从未把默认路径注入 `STUDIO_USER_DATA`；且步骤 3 有硬门禁 | 步骤 11 三项基线复算 |
| 安装目录 | 扫描不触碰 `Programs` | 步骤 0/11 的 exe SHA 比对 |

### 6.3 风险清单

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | `STUDIO_USER_DATA` 未被采纳 → 写入**生产** userData | 高（污染真实数据） | 步骤 3 硬门禁：路径不等即中止；步骤 11 反向核对 |
| R2 | 误把 `/S` 安装或重装当成前置 | 中（改变安装态） | 本方案**不安装、不卸载**，只用现有安装 |
| R3 | 扫描异常写包（如缓存路径算错） | 高（污染基准包） | 步骤 5/10 清单比对；一旦变化立即上报，**不自行回滚** |
| R4 | 本机 GPU 崩溃 | 中（启动失败） | 全程 `--disable-gpu*`（`PACK-04` §5 已知限制） |
| R5 | 单实例锁：已有实例存在会被拒绝 | 低 | 步骤 0 先确认无进程 |
| R6 | 磁盘占用 150 MB | 低 | E: 余 757 GB |
| R7 | 扫描耗时受杀软/磁盘影响，计时不可比 | 低 | 耗时**只记录不判定**（见 §7） |
| R8 | 图标数与基线不符 | 中 | 见 §7 的"精确度分级" |

---

## 7. 与 PACK-09 基线的对照表（含精确度分级）

**基线来源**：`PACK-09`（`pc5-pack-1112`，`cacheHit=false`，`index-ready`，`failedMods=0`）。

| 指标 | 基线 | 精确度要求 | 判定理由 |
| --- | --- | --- | --- |
| **JAR（mods/ 下）** | **295** | **必须精确一致** | 纯文件计数；`mods/` 有 295 个 `.jar`（全包另 13 个不在 `mods/`，不参与）。若不符说明导入了错包或包被改动 |
| **Items** | **43,474** | **必须精确一致** | 纯解析结果，与缓存/环境无关（前提 `cacheHit=false`） |
| **Recipes** | **32,890** | **必须精确一致** | 三源解析结果（原版 13,938 + 模组 18,804 + KubeJS 148） |
| **Types** | **426** | **必须精确一致** | 配方类型全集，由包内容决定 |
| **Partial** | **5,334** | **必须精确一致** | "解析不完整"的配方条数，纯解析标记 |
| **Failed mods** | **0** | **必须精确一致** | 任何 >0 都意味着有 jar 解析失败，属实质差异 |
| **Icons** | **38,760** | **必须精确一致，但有前提** | 该值 = Items 43,474 − iconMissing 4,714。iconMissing 由包内贴图是否存在决定，理论上与缓存无关；**但若复用旧 userData 的 `icon-cache`，"写入/命中"的统计口径可能变化**。本方案用**全新空 userData**，消除该变量，故要求精确一致 |
| **`cacheHit`** | **false** | **必须为 false** | 若为 `true` 则读的是缓存、**不是真实扫描**，整次测试无效 |
| **扫描终态** | **`index-ready`** | **必须是它** | `scan-failed`/`scan-canceled` 直接判失败 |
| **命名空间数** | 225 | 建议精确一致 | 由包内 mod 决定，非硬性门禁 |
| **`timings.totalMs` / 墙钟耗时** | 38.8 s（报告内 `timings`）/ 39.8 s（驱动墙钟） | **只记录，不判定** | 受磁盘、CPU、杀软扫描影响，环境相关；两次实测已差 1 s |
| **各阶段耗时**（items 34.5 s / recipes 3.8 s / 语料 0.44 s / 缓存提交 0.007 s） | 同上 | **只记录，不判定** | 同上 |

### 7.1 判定规则（合取，缺一即失败）

```
通过 ⟺ JAR=295 ∧ Items=43474 ∧ Recipes=32890 ∧ Types=426 ∧ Partial=5334
       ∧ Icons=38760 ∧ failedMods=0 ∧ cacheHit=false ∧ 终态=index-ready
```

**注意**：即使全部数字一致，本测试**也不能**用来替代「`uiState` 保留」的验证——那是另一条未满足项。

---

## 8. 失败回滚与证据保留方案

### 8.1 中止即停（不自行修复）

出现下列任一情况，**立即停止后续步骤并上报**，不尝试"修一下再跑"：

| 触发 | 处理 |
| --- | --- |
| 步骤 3 路径门禁不过 | 立即关应用；不导入、不扫描；上报 |
| 步骤 4 导入失败 / modCount≠295 | 记录返回值；不扫描；上报 |
| 步骤 5 或 10 包清单有差异 | 记录 diff；**不还原、不删除**；上报（还原动作须另行授权） |
| 步骤 6 非 `index-ready` | 保存事件流与应用日志；上报 |
| 步骤 11 生产 userData 有变化 | 记录三项差异；上报（**不做任何"补救"写入**） |
| 应用崩溃 / 端口不通 | 保存 stdout/stderr；上报 |

### 8.2 证据保留（一律不删）

| 类别 | 保留内容 |
| --- | --- |
| 驱动侧 | `driver.log`（逐步骤）、`events.jsonl`（CDP 全量事件）、`result.json` |
| 应用侧 | `app-stdout.log`、`app-stderr.log`、`<ud>\logs\studio-*.log`（含逐 jar 进度） |
| 快照 | `pack-manifest-before/after.json`、`prod-ud-before/after.json`、`scan-window.png` |
| 现场 | 整个 `ud-<ts>\` **原样保留**（约 150 MB），作为可复核物证 |

### 8.3 回滚策略

- **无需回滚**：测试只新增 `.cache\pack-12\` 下的内容；包与生产数据由清单证明未被触碰。
- **如需清理**（默认**不清理**）：只能对 `ud-<ts>\` 使用**移动到隔离区**（`Move-Item` 至 `E:/_trash_<日期>/`），**禁止 `rm -rf`**；且必须另行获得授权。
- 生产 userData **任何情况下不写入、不回滚**。

---

## 9. 需要用户授权的具体操作

| # | 操作 | 是否触碰生产数据 | 是否可逆 |
| --- | --- | --- | --- |
| A1 | 以**已安装版**启动应用（带 `STUDIO_USER_DATA` 指向新测试目录 + `--disable-gpu*` + 调试端口 9711） | 否 | 是（关掉即可） |
| A2 | 通过 IPC **导入** `E:\mc kjs\.cache\pc5-pack-1112`（只读） | 否 | 是 |
| A3 | 执行**一次完整核心扫描**（`rebuild:true`，约 40 s，CPU/磁盘密集） | 否 | 是 |
| A4 | 在 `.cache\pack-12\` 下写入约 **130–150 MB** 测试数据 | 否 | 是 |
| A5 | 生成基准包 1,658 文件的只读清单（前后各一次） | 否 | 是 |
| A6 | 优雅关闭应用；如有残留进程则 `taskkill /T` 收尾 | 否 | 是 |

**不需要授权也不会做**：安装/卸载、改代码或配置、改 `package.json`、重新打包、改 V7 台账、删除任何历史证据、动 `REL-VERIFY-DUAL` / `REL-VERIFY-4K`。

---

## 10. 待你裁决（三选一）

| 选项 | 内容 | 后果 |
| --- | --- | --- |
| **D1（建议）** | **承认 §1 的更正：核心扫描已有证据**，授权我把 V7 的「核心扫描」由 ❌ 改为 ✅ 并写入更正记录 | B 类未满足项收窄为「`uiState` 保留」1 项；`REL-PKG` 仍不关闭，但阻塞理由更准确。**无需跑任何扫描** |
| **D2** | D1 + 仍按 §4–§9 跑一次**加固复测**（不称"补缺口"，称"当前时点连续复测"） | 多一份当轮证据（含整包只读校验），耗时约 5 分钟、占盘 150 MB；**不改变**任何验收结论 |
| **D3** | 维持 V7 现状不动，也不跑扫描 | 台账保留一处**已知错误判据**；后续若复审会再次触发同一问题。**不建议** |

> 无论选哪个，**「`uiState` 保留」仍是唯一真正的未满足项**，且它无法通过扫描解决——需要升级前后对 `uiState.json` 取 SHA-256 比对（或经批准的等价场景）。

---

## 11. 自检（对照本轮禁止事项）

| 禁止项 | 是否符合 |
| --- | --- |
| 不启动扫描 | ✅ 未启动应用、未导入、未扫描（本轮仅读取文件与目录） |
| 不修改真实生产 userData | ✅ 只读测量（计数 + 两哈希），未写入 |
| 不覆盖、删除或移动任何现有整合包 | ✅ `pc5-pack-1112` 仅 `ls`/`find` 读取 |
| 不修改代码、配置、安装包或 V7 台账 | ✅ V7 MD5 保持 `86842e0a705531a248060e9bd94e1da5` |
| 不清理历史证据 | ✅ `.cache/pack-01`–`pack-06`、`pack-10*`、`pack-11` 全部保留 |
| 不把开发版 / win-unpacked / asar 探针当作已安装版扫描证据 | ✅ 本轮不仅未这样做，还**用同一标准反查出 V7 的一处误判**（§1） |
| 完成后暂停、不自行开始扫描 | ✅ 已暂停，等 D1/D2/D3 裁决 |

---

## 12. 本轮产出

| 文件 | 说明 |
| --- | --- |
| `docs/PACK-12-CORE-SCAN-TEST-PREP.md` | 本报告 |
| `.cache/pack-12/00-env-baseline.txt` | 准备阶段环境基线（安装目录 / 生产 userData / 两哈希，只读测得） |

**未创建**：测试 userData、驱动脚本、任何扫描产物（等你授权后再生）。
