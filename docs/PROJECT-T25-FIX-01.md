# T-25 冷启动状态恢复 · 修复实施记录

| 项 | 内容 |
|---|---|
| **状态** | **待验收**（功能已实测通过；一项 UI 提示降级为日志，见 §5） |
| **授权** | A2（校验方案 A 裁定 + `lastModpackPath` 入 uiState 确认） |
| **时点** | 2026-11-03 06:44–06:50 |

---

## 1. 改动清单（4 文件）

| 文件 | SH-256（前 20 位） | 改动 |
|---|---|---|
| `src/shared/types.ts` | `2498ea58e8eda008cb35` | `UiState` 增 `lastModpackPath?: string` / `lastModpackName?: string`（可选、向后兼容、无迁移） |
| `src/main/uiStateStore.ts` | `cb1d9929dcafaa621cca` | `loadUiState()` 读取两字段（非字符串/空串一律忽略，防脏值） |
| `src/main/modpack/index.ts` | `62f54c8131a86568ade2` | `importModpack()` 末尾写 `lastModpackPath` + `lastModpackName` 并 `saveUiState()`；失败仅 WARN 不影响导入 |
| `src/main/index.ts` | `7930a44781f00270ad8f` | 新增 `restoreLastModpack()`；`createWindow` 后 `void restoreLastModpack()`（不阻塞首屏） |

**产物**：`out/main/index.js` = `52da5327f295936f…`（原 `00c26748…`，已重建）

## 2. 恢复逻辑（校验方案 A）

```
读 uiState.lastModpackPath → 空则直接返回
  ├─ 目录不存在 或 mods/ 不存在   → WARN「上次使用的整合包不可用，请重新导入」+ 清空记录
  ├─ detectMetadata(path).name ≠ lastModpackName → 同上（防目录被换成别的包）
  └─ 通过 → setCurrentModpack(info)
             → syncPluginLayer() + ensureSchema s()
             → startScan(false)   ← 自带缓存命中（物品/配方/meta 校验）
```

**关键实现取舍**：**未另写缓存载入代码**。`startScan(false)` 本就内置"物品命中不重扫 / 配方命中只恢复 / meta 不全不提交"，直接复用即可，改动量比原计划小。

**硬约束遵守**：
- 只经 `uiStateFile()` / `cacheFile()`（envPaths 派生），**代码中无任何字面量路径**；
- 包身份经 `detectMetadata().name` 校验；
- 缓存目录由包路径派生 hash，天然隔离（未跨包错载）。

## 3. 功能验收（冷启动实测）

**第 1 次启动** → `modpack:import(t13-pack)` → `uiState.json` 写入：

```json
"lastModpackPath": "E:\mc kjs\.cache\t13-pack",
"lastModpackName": "t13-pack"
```

**正常关闭 → 第 2 次启动（未调用任何 import）**：

| 观测 | 结果 |
|---|---|
| `modpack:current` | **`E:\mc kjs\.cache\t13-pack`**（自动恢复） |
| `plugins:list` | **1**，path = `…\t13-pack\.recipe-studio\plugins\t13probe.json` |
| `items:query total` | **43,474** |
| 日志 | `已恢复上次的整合包：t13-pack` → `配方缓存命中：32891 条` → `物品 0.1s（缓存命中） + 配方 0.1s（缓存命中）` |

**→ 从「每次重开重扫 40–60 s」变为「0.1 s 缓存命中」，核心缺陷闭环。**

**probe 1,249 的持久性**：`total = 43,474`（未含 T-24 的 +1,249）→ 与既有结论一致：**探针补全不跨重建/重启**，仍属 T-24 已知限制，本次未改变。

## 4. 降级实测（包目录改名）

`t13-pack` → `t13-pack-moved` 后启动：

| 观测 | 结果 |
|---|---|
| 日志 | **WARN** `上次使用的整合包不可用，请重新导入`（含路径与原因） |
| `uiState` | `lastModpackPath` / `lastModpackName` 均被清为 `""`（不会每次启动反复失败） |
| 运行态 | modpack = null、plugins = 0（没有伪装成"正常空列表"） |

**→ 降级生效，非静默。** 目录已改回（`pack-restored=True`）。

## 5. 未达成的一项：UI 横幅提示

任务要求「UI 明确提示」。当前只做到**日志级 WARN**；渲染层横幅未接（需改 `SettingsView`/`App` 的提示通道，**超出「启动流程 / uiState / cache 载入」授权范围**）。

按任务书「改动若需超出范围 → 停，报告」处理：**未实现，如实登记**。日志里已有可查的 WARN 与路径，用户可从「设置与诊断 → 日志」看到。

## 6. 回归门禁结果

| 门禁 | 结果 |
|---|---|
| 冷启动恢复 | **通过**（§3） |
| 降级路径 | **通过**（§4） |
| `vitest` 全量 | **824 用例 / 816 passed / 1 失败**；失败项 `commitFailurePaths`「真实只读目标文件」为**已知 Windows 权限偶发**，隔离复跑 **2 次均 12/12 通过** → 判偶发，与本批改动无关 |
| `typecheck` | **0 错误** |
| `lint --max-warnings=0` | **0 问题**（一次 `no-inner-declarations` 已修：把函数移到模块顶层） |
| FIX-01 / FIX-02 / FIX-03 / RT-01 / RT-05 S2 | **未逐项复跑**（本次改动不触及这些路径；vitest 覆盖 FIX 相关用例全绿）→ **记录为"未复跑"，不冒充通过** |
| T-14 六条 | **未复跑**（同理由）；但恢复逻辑只读**本实例** userData，双实例隔离语义不变 |

## 7. 边界

生产 userData `2026-11-03 03:43:05`（本批全程 `STUDIO_USER_DATA` 隔离，**零触碰**）；`src` 185 / `tests` 101（**未新增用例**）；V9 `7a7e52d9…` 未变；应用已关闭（残留 0），QQ-agent 11 进程未受影响；备份见 `.cache/fix14/a3tmp/b46-pre/`。

## 8. 状态

**T-25 = 待验收。**
- 缺陷闭环：冷启动不再丢包/插件/索引（实测 0.1 s 缓存命中）
- 遗留：① UI 横幅提示未接（超授权范围）；② FIX/RT/T-14 未逐项复跑（建议下一批复验）
- 前端测试的区域 4/5 与 role 增强**现已解锁**（插件列表可正常出现）

---

## 9. 第 47 批复验（T-25 改动后）

| 项 | 结果 | 证据 |
|---|---|---|
| **恢复功能** | **通过** | 启动日志：`配方缓存命中：32891 条` → `索引就绪：43,474` → `物品 0.1s（缓存命中）+ 配方 0.2s（缓存命中）`；运行态 modpack=`…\t13-pack`、plugins=1 |
| **FIX-01**（合并计数） | **通过** | `schema:list` = **4** 项：`create:mixing`、`minecraft:crafting_shaped`、`minecraft:crafting_shapeless`、**`t13probe:only`** → N=4 ≥1 且可解释（3 内置 + 1 插件） |
| **FIX-02**（S2 层保留 + failed） | **通过** | `.recipe-studio/plugins` 替换为**同名文件**（ENOTDIR）后连调 3 次 `plugins:list`：**均 `ok:true, n=1`（层保留，未清空）**；`loadStatus.state="failed"`，`error="ENOTDIR: not a directory, scandir '…\plugins'"`；`schema:list` 仍 **4**（合并层未破） |
| **RT-05 S2** | **通过** | 与 FIX-02 同一证据（R-3 口径一致），互引成立 |
| **FIX-03**（失败不写戳） | **未证** | 冷却目录内**未找到**戳文件（`find *stamp*` / `*snapshot*` 均空）；before/after 为空对空，**不构成证据**。需先定位快照戳的真实文件名与位置 |
| **RT-01**（步骤 0 跟随性） | **部分** | 插件层 path 指向当前包、schema 含插件类型 ✅；**A→B→A 切换后的 N 计数未做** |
| **T-14 六条** | **未执行** | 预算耗尽 |

**结论：已完成项**（恢复 / FIX-01 / FIX-02 / RT-05 S2）**全部通过，未发现 T-25 引入的回归**；但覆盖不完整（FIX-03 未证、RT-01 仅步骤 0、T-14 未跑）。

### 9.1 现场已还原

- `.recipe-studio/plugins/t13probe.json` 已恢复（`plugin-file-restored=True`）
- 挂起的 CDP 脚本已终止（`killed-node=1`）
- 应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**
- 生产 userData 未触碰（全程 `STUDIO_USER_DATA`）

## 10. 第 47 批：区域 5 再次阻塞（CDP 挂起）

`scrollIntoView({block:'center'})` + 视口断言 + 点击的脚本**运行 5 分钟无输出**，被强制终止。

**已知事实**：脚本卡在 CDP 调用序列中（无任何 stdout，连 `vis` 都未打印）→ 说明卡在**第一个 `Runtime.evaluate`** 或 `Page.enable` 之后，而非业务逻辑。

**与上批对比**：上批同样的连接方式可用，差异在**本次刚做过 ENOTDIR 注入**（插件层 failed）。**首要怀疑**：插件加载失败后主进程进入某种阻塞/重试，导致 CDP 响应挂起；也可能是 `logger` 大量写入阻塞。**下一批第一步**：ENOTDIR 还原后**重启应用**再连 CDP（本次未重启即继续测试，属我的操作顺序问题）。

**区域 5 状态：仍「部分」，前端仍 4/6，未收官。**

---

## 11. 第 48 批：复验发现回归 —— **已全停**

### 11.1 FIX-03 补验（日志计数法）—— **通过**

| 观测 | 值 |
|---|---|
| 基线「五层合并完成」行数 | **37** |
| ENOTDIR 注入后连调 3 次 `schema:list` | **40** |
| **增量** | **+3**（每次调用各触发一次重建，无去重跳过） |
| 同轮 `plugins:list` 日志 | 每次 2 条 WARN：`插件目录读取失败…（保留上一次成功加载的插件列表与插件层）` + `插件加载失败：已保留…（不会清空）` |

**→ 失败态下确实每次重跑合并（未写戳跳过），FIX-03 成立。**

### 11.2 ❗回归：插件类型不再进注册表（N=3）

同一会话、插件文件已还原（510 B、内容正确）后：

| 观测 | 值 |
|---|---|
| `plugins:list` | **1** |
| `plugins:loadStatus` | `state:"ok"`、`path` 正确、`error:null` |
| **`schema:list`** | **3**（`create:mixing`、`crafting_shaped`、`crafting_shapeless`）——**缺 `t13probe:only`** |
| RT-01 A→B→A 的 N | start=**3**、B=**3**、A=**3**（应 3/3/4） |

**即：插件被"成功加载"，但它的配方类型没有进入 schema 注册表。** 第 47 批同一构建首次启动时 N=**4**，说明这是**状态相关**（注入失败后留下某种状态）而非代码路径恒定错误。

**高度可疑根因（待验证，未定论）**：
1. T-25 的恢复序列 `syncPluginLayer() → ensureSchemas()` 的**时序**：`ensureSchemas` 内部会 `snapshotLayer('plugin')` 再重建；若 provider 快照早于层写入，会拿到空层并被 `factsKey` 认定为"已就绪"而跳过后续重建；
2. 失败态期间写入了**空的插件层快照**，重启后被当作有效快照复用（与 FIX-03 的"失败不写戳"直接相关——本次只验了"合并行数+3"，**没有验戳本身**）。

### 11.3 判定

| 项 | 结果 |
|---|---|
| 恢复功能（包/索引） | **通过**（缓存命中 0.1 s） |
| FIX-01（首次启动 N=4） | **通过**（第 47 批） |
| FIX-02（层保留 + failed） | **通过**（日志双 WARN ×3 确认） |
| FIX-03（失败态重跑） | **通过**（+3） |
| **RT-01（A→B→A N 计数）** | **不通过**（N 恒为 3，插件类型缺失） |
| T-14 六条 | **未执行**（全停） |
| 区域 5 / 区域 4 | **未执行**（全停） |

**T-25 复验结论：不通过。发现回归（插件类型不进注册表），按 §五「复验发现回归 → 全停」处理。**

### 11.4 边界与现场

生产 userData 零触碰（全程隔离）；插件文件已还原（`plugin-file=True`）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**；`src` 本批**零改动**。

**下一批建议**：先只做一件事——在**干净 userData**（新建隔离目录，不经过任何 ENOTDIR 注入）下启动并导入 t13-pack，看 N 是否回到 4：
- 若 N=4 → 证明是"失败态遗留状态"导致，需查失败路径是否写了空层快照（即 FIX-03 的戳）；
- 若 N=3 → T-25 的恢复序列本身有问题，回修复线查 `syncPluginLayer/ensureSchemas` 时序。

---

## 12. 第 49 批：RT-01 回归根因与修复（完整闭环）

### 12.1 二分实测（确认方向）

全新隔离 userData `t25-fresh`（无任何注入）：

| 步骤 | N |
|---|---|
| 启动（无包） | 3 |
| **`modpack:import(t13-pack)` 后（未调 plugins:list）** | **4** |
| `plugins:list` 后 | 4 |

**→ 干净环境下「导入路径」直接得 4，只有「冷启动恢复路径」得 3 → 恢复序列 bug 实锤（假设 2）。**

### 12.2 根因（代码级，非竞态）

`restoreLastModpack()` 调了 `syncPluginLayer()` + `ensureSchemas()`，**但从未调用 `loadPlugins(path)`**。

`syncPluginLayer()` 只从 `currentRecords()`（内存里"已加载"的记录）重建层；恢复流程里没有任何一步把包里的插件读进内存 → 记录为空 → 插件层为空 → 注册表只剩 3 个内置类型。

**为什么首次启动（第 47 批）N=4**：那次启动后我先调了 `plugins:list`，它触发 `ensureLoaded → loadPlugins`，把层补上了——**所以是"谁先触发懒加载"的偶然性掩盖了缺陷**，与协调方推测的"UI 首查早于恢复"方向一致，但落点是**恢复序列缺少显式加载**，而不是竞态时序本身。

### 12.3 修复（方案 A，最小改动）

`src/main/index.ts` 恢复序列中，在 `setCurrentModpack(info)` 之后、`syncPluginLayer()` 之前插入：

```ts
const loaded = loadPlugins(info.path, { modpack: info })
logger.info('PLUGIN', `恢复插件层：${loaded.length} 个插件`)
```

`import` 相应补 `loadPlugins`。**未改 ensureLoaded 条件、未加"恢复中"标记、未阻塞首屏。**

| 项 | 值 |
|---|---|
| `src/main/index.ts` | **`7ef0482e5936ab84…`** |
| `out/main/index.js` | `5abdc04313566754…`（原 `52da5327…`） |
| typecheck / lint | **0 / 0** |

### 12.4 修复后验证

同一 `t25-fresh` 冷启动（走恢复路径）：

| 观测 | 值 |
|---|---|
| 恢复日志 | `已恢复上次的整合包：t13-pack` → **`恢复插件层：1 个插件`** |
| 恢复后 `schema:list` | **4**，ids = `create:mixing`、`crafting_shaped`、`crafting_shapeless`、**`t13probe:only`** |
| **RT-01 A→B→A**（probe 含 `plugins:list`） | **4 / 3 / 4** ✅ |

> 方法学备注：单独调 `schema:list` 不做 `plugins:list` 会读到旧层（我第一轮量到 4/4/4 就是漏了刷新），与第 41 批 RT-07 的既有口径一致——**换包探针必须先 `plugins:list`**。

### 12.5 回归门禁

| 门禁 | 结果 |
|---|---|
| 二分场景（干净 userData → 导入 → N） | **4** ✅ |
| 冷启动恢复（干净 userData → 导入 → 重启 → N） | **4**，含 `t13probe:only` ✅ |
| RT-01 全步 | **4/3/4** ✅ |
| FIX-01 / FIX-02 / FIX-03 / RT-05 S2 | 第 47–48 批已过（FIX-02 有双 WARN ×3 日志、FIX-03 有 +3 计数） |
| **vitest 全量** | **828 用例：821 passed / 4 skipped / 3 todo / 0 失败**（94 文件，92 passed 2 skipped）✅ |
| typecheck / lint | **0 / 0** ✅ |
| T-14 六条 + 双实例隔离观测 | **未执行**（预算耗尽，如实登记） |

### 12.6 边界与现场

生产 userData 零触碰（全程 `t25-fresh` / `t13-ud` 隔离）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**；`src` 改动**仅 `restoreLastModpack` 的加载序列 + 一行 import**。

## 13. T-25 状态（含回归闭环）

**T-25 = 待验收（含回归修复）**
- 原缺陷：冷启动丢包/插件/索引 → **已修**（缓存命中 0.1 s）
- 回归：恢复路径缺 `loadPlugins` → 插件类型不入注册表 → **已修并验证 4/3/4**
- 遗留：T-14 双实例复验未做；UI 横幅提示未接（超授权范围）

---

## 14. 第 50 批：T-14 六条复验（含 T-25 双实例隔离观测）

### 14.1 双实例并行与隔离观测

| 实例 | 版本 | userData | 进程 | 主窗口 | 恢复情况 |
|---|---|---|---|---|---|
| **B dev** | 0.1.1（含 T-25） | `kubejs-recipe-studio-dev` | **4** | **1**（`KubeJS Recipe Studio`） | **恢复 t13-pack + 插件层** |
| **A 安装版** | 0.1.0（无 T-25） | `kubejs-recipe-studio` | **4** | **1**（同标题） | **无恢复动作**（该版本无此功能） |
| QQ-agent | — | — | **11** | — | 全程未触碰 |

**B 的恢复日志（`-dev/logs/studio-2026-11-03.log`）**：

```
2026-11-03T05:10:50.377Z  INFO  MODPACK  已恢复上次的整合包：t13-pack
2026-11-03T05:10:50.382Z  INFO  PLUGIN   恢复插件层：1 个插件
```

**B 的运行态**：`schema:list` = 4，ids = `create:mixing`、`crafting_shaped`、`crafting_shapeless`、**`t13probe:only`**；`modpack:current` = `E:\mc kjs\.cache\t13-pack`。

**A 的恢复日志条数**：**0**（`grep -c` = 0）。

**隔离结论**：B 读自己的 `-dev/uiState.json` 恢复自己的包；A 的 userData 里根本没有 `lastModpackPath` 字段，且 A 的版本不执行恢复 → **两者互不干扰、互不串包**。这是 T-25 恢复逻辑在双实例下的首次实测。

### 14.2 六条逐项（V9 §7.2）

| # | 判据 | 结果 | 证据 |
|---|---|---|---|
| 1 | 安装版与开发版同时运行 | **通过** | B pid 31696 `alive=True` + A 同时存活 |
| 2 | 两者均存活 | **通过** | 各 **4 进程** |
| 3 | 各自只有 1 个主窗口 | **通过** | **1 / 1**，标题均 `KubeJS Recipe Studio` |
| 4 | 同数据目录第二实例被拒 | **通过（引用 + 未复验）** | 引用第 38 批强证据：第二实例 `exited=True, exitcode=0`，127,425 文件中仅 1 个（A 自身日志）变化、目录 mtime 未变。**本轮未重跑该条** |
| 5 | 关闭正常退出 | **通过** | `CloseMainWindow` 对 A、B 均返回 **True**；关闭后残留 **dev=0 / app=0** |
| 6 | 数据目录/缓存/备份/锁无跨环境干扰 | **通过** | 两 userData 各自独立写入；A 零恢复日志、B 只恢复自己的包 |

**T-14 = 6/6 通过**（第 4 条为引用既有强证据，本轮未复测，已注明）。

### 14.3 T-25 三层闭环

| 层 | 内容 | 状态 |
|---|---|---|
| **原缺陷** | 冷启动丢包 / 插件 / 索引（46 MB 缓存零读者） | **已修**：0.1 s 缓存命中 |
| **回归** | 恢复路径缺 `loadPlugins` → 插件类型不入注册表（N=3） | **已修**：RT-01 4/3/4 |
| **双实例** | 恢复逻辑在 A/B 并行下的隔离 | **已验**：互不串包 |

### 14.4 边界

`src` 185 / `tests` 101 / `package.json` `4e0c261a…` **未变**；应用全部关闭（dev=0 / app=0）；**QQ-agent 11 进程未受影响**。

**披露**：本轮为验收 T-14，**实例 A（0.1.0）被启动过一次**，其生产 userData 的 mtime 因此更新（启动写日志属必然行为，与第 37 批口径一致）；A 内**未做任何修改类操作**。
