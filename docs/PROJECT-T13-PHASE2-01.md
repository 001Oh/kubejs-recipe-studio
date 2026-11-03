# T-13.2 · FIX-01/02/03 真实验证（P4 第二包 · 重跑）

| 项 | 内容 |
|---|---|
| **任务** | 重建 `out/` → T-13.2 三项 FIX ③ 层真实验证 |
| **授权** | **A5（限定开发构建）** + A4（再次启动）+ A1（本文档） |
| **执行时点** | 2026-11-02 07:41–07:47 GMT+8 |
| **隔离路径** | `E:\mc kjs\.cache\t13-ud`（沿用，启动前已清 `Cache`/`Code Cache`/`GPUCache`） |
| **差异源** | A = `E:\mc kjs\.cache\t13-pack`（含插件）｜B = `E:\mc kjs\.cache\t13-pack-b`（无 `.recipe-studio`） |
| **结果** | **FIX-01 通过 ｜ FIX-02 通过 ｜ FIX-03 通过**（三项四态均为「通过」） |

---

## 1. 重建（A5）

### 1.1 命令与结果

```
npm run build          # = npm run typecheck && electron-vite build
BUILD EXIT=0           # 170 modules transformed，built in 1.30s，总耗时 ~10s
```

### 1.2 重建前后对照（判据：E-2 反向复核）

| 项 | 重建前 | 重建后 |
|---|---|---|
| `out/main/index.js` SHA-256 | `b0c339589483f2c0f343f01b3ca647bc3223f6eb2bbb964f7bfad3e750785f74` | **`45e4722fce32cc8432db3ef1aa8d9a8dfc459c57eac784131294210b7264bb44`** |
| mtime | 2026-11-01 07:04:30 | **2026-11-02 07:41:22** |
| `getPluginLoadStatus` | 0 | **3** |
| `loadFailure` | 0 | **5** |
| `plugin-disabled` | 0 | **1** |
| `plugins:loadStatus` | 0 | **1** |
| 渲染层含「插件读取失败」横幅 | 无 | **有**（`out/renderer/assets/index-CH18bemv.js`） |

**→ 重建有效**：四项修复特征由全 0 变为全部 > 0。

### 1.3 门禁

| 项 | 结果 |
|---|---|
| `vitest run` | **93 文件（91 passed / 2 skipped）／824 用例（817 passed / 4 skipped / 3 todo）／0 失败**，45.70 s，exit 0 |
| `typecheck` | exit **0** |
| `lint` | exit **0** |

> **一处偶发（如实记录）**：重建后首次全量出现 **1 例失败** —— `commitFailurePaths` 的「回读不一致且回滚成功」得到 `BACKUP_FAILED` 而非预期 `SAVE_VERIFY_FAILED`。隔离复跑该文件 **2 次均 12/12 通过**，随后全量复跑 **0 失败**。按铁律 7 精化：单点失败、隔离复跑不复现 → 判**偶发**（Windows 文件占用，与本批改动无关；`src` 自第 31 批起零改动）。

---

## 2. 差异源搭建（性质声明）

### 2.1 7 个 jar 检查结论 —— **无本应用格式的真实插件声明**

| jar | 命中项 | 判定 |
|---|---|---|
| `applied_kjs-1.0.0.jar` | `kubejs.plugins.txt`（51 B）+ `AppliedKJSPlugin.class` | **Java 侧** KubeJS 插件，非本应用清单 |
| `kubejs-create-forge-…jar` | `dev\latvian\mods\kubejs\create\*.class` | 同上 |
| `kubejs-immersive-engineering-…jar` | `ImmersiveEngineeringKubeJSPlugin.class` | 同上 |
| `kubejs-thermal-…jar` | `InsolatorRecipeJS.class` | 同上 |
| `kubejsarsnouveau-1.2.2.jar` | `KubeJSArsNouveauPlugin.class` | 同上 |
| `kubejspowah-1.3.4.jar` | `KubeJSPowah.class` | 同上 |
| `occultism_kubejs-…jar` | `KubeJSOccultismPlugin.class` | 同上 |

**结论**：7 个 jar 全部是 **KubeJS（Java 侧）插件**，没有任何一个包含本应用所需的 `.recipe-studio/plugins/*.json` 清单格式。故按授权走**最小合法清单**。

### 2.2 差异源性质声明

> **⚠ 性质：差异源搭建物（非真实用户插件）。**
> 文件：`.cache/t13-pack/.recipe-studio/plugins/t13probe.json`（510 B）
> 内容：id `t13probe:plugin`，声明 1 个 recipeType `t13probe:only`（`layoutKind: single_io`，2 个槽位）。
> 用途：仅作 A（有插件）/ B（无插件）的**差异源**，用于验证 FIX-01 的「插件层跟随当前整合包」。
> **不得**据此推断真实第三方插件的解析能力。

**A/B 构成**：A = 1660 文件（1659 + 清单）；B = 1659 文件（同源副本、无 `.recipe-studio`）。
**jar 未放入 `mods/`**：因 7 个 jar 均为 Java 侧插件，放入 `mods/` 只会改变模组清单（`modCount`），对本次三项 FIX 无观测价值，故按"可选"未纳入。

---

## 3. FIX-01（RT-01）—— **通过**

### 3.1 步骤 0「插件层跟随性确认」（V1.1 核心，不可跳过）

| 状态 | 证据 |
|---|---|
| **A 态** | 日志 `插件加载完成：生效 1 个 / 列表共 1 项`，其明细行：`modpack → E:\mc kjs\.cache\t13-pack\.recipe-studio\plugins\t13probe.json` → **指向当前包** ✅ |
| **B 态** | 切包后 `插件加载完成：生效 0 个 / 列表共 0 项`（0 条故无路径明细）；API 级：`plugins:loadStatus` → `path = E:\mc kjs\.cache\t13-pack-b`、`cachedPath` 同值、`state = ok` → **跟随当前包** ✅ |

**步骤 0 判定：PASS** —— 若仍指向上一包，本次结果不得归因 REM-01；实测两态均指向当前包。

### 3.2 判据 ①：B 下该类型不可得，阴性对照正常

| 查询 | A 态 | B 态 |
|---|---|---|
| `schema:get('t13probe:only')` | 存在（`source = plugin`） | **`null`** ✅ |
| `schema:get('minecraft:crafting_shaped')` | 存在 | **存在** ✅（阴性对照：预览通路未坏） |
| `schema:list` 计数 | **4**（builtin 3 + plugin 1） | **3**（仅 builtin），`probe` 消失 ✅ |

### 3.3 判据 ②：合并计数 N ≥ 1 且可解释

| 场景 | `五层合并完成` 条数 | 取值 |
|---|---|---|
| 导入 A（单次切包） | **N = 3** | 全部 `生效 4 个配方类型` |
| 切到 B | N = 1 | `生效 3 个配方类型` |
| 全量日志分布 | 1×「1 个」、3×「3 个」、9×「4 个」 | — |

**可解释性**：A 态单次导入出现 **N=3**，正是 V1.1 R-1 预见的现象——`ensureSchemas` 重建期间 provider 内的 `syncPluginLayer()` 会先触发 `applyMerge`，随后 `ensureSchemas` 自身再合并。**按旧判据「恰好 1 条」，本次会被判「>1 条 → 证据作废，需重跑」；按 V1.1「N≥1 且可解释」判 PASS。**

> 这是 R-1 修订在真实环境中的**第一次实证**：旧判据在真实环境下会稳定误杀。

### 3.4 FIX-01 四态判定

**通过** —— 步骤 0 PASS + A/B 差异可复现且可逆（A→B→A 三态往返均正确）+ 合并计数 N≥1 有解释。

---

## 4. FIX-02（RT-05 S2）—— **通过**

### 4.1 手段（计划执行条件 13 未指定具体手段，此处自行探索并声明）

把 `A/.recipe-studio/plugins` **目录改名为 `plugins.locked`，再建一个同名普通文件** `plugins`，使 `readdirSync` 抛 `ENOTDIR` —— 等价于「目录存在但读不出」的 IO 错误类（ACL 剥离需管理员权限，故采用此法）。

### 4.2 实测结果

| 观测点 | 期望 | 实测 |
|---|---|---|
| `plugins:list` | **不得清空**，保留上一次成功 | **仍返回 1 个插件**（`t13probe:plugin`，status `loaded`）✅ |
| `plugins:loadStatus` | `state === 'failed'` + 原因 | `state: 'failed'`，`error: ENOTDIR: not a directory, scandir '…\.recipe-studio\plugins'`，`path`/`cachedPath` 均为 A ✅ |
| `schema:list` | **层保留 4 个** | **4 个**，`probe = true`（插件类型仍在）✅ |
| 日志 | 明确写「保留…不会清空」 | 两条 WARN：`插件目录读取失败：…（保留上一次成功加载的插件列表与插件层）` + `插件加载失败：已保留上一次成功加载的插件列表与插件层（不会清空）` ✅ |

### 4.3 恢复（可重试）

目录还原后**一次** `plugins:list` 即恢复：`state: ok`、`error: null`、仍 4 类型。**无需重启、无需切包。**

### 4.4 FIX-02 四态判定

**通过**。

> **按 V1.1 R-3，A/C 两态（①目录不存在 / ③读成功但为空）只记录不判定**（D-10 暂缓）。本轮未对 A/C 下结论。

---

## 5. FIX-03（失败不写快照戳）—— **通过（量化）**

### 5.1 受控测量

在**失败态**下连续调用 `schema:list` **3 次**（日志锚点 99 → 129）：

| 观测 | 次数 | 说明 |
|---|---|---|
| `schema:list →` | **3** | 3 次请求 |
| `五层合并完成` | **3** | **每次请求都完整重建** |
| `插件加载失败`（WARN） | **6** | 每次请求 **2 条**（目录读取失败 + 加载失败），即每次都重新尝试加载插件 |

**判定逻辑**：若失败期写入了快照戳，第 2/3 次请求会命中戳而**跳过重建**，既不产生 `五层合并完成`、也不再尝试读插件目录。实测 3 次全部重建、全部重试 → **失败路径确实没有写快照戳**。

### 5.2 FIX-03 四态判定

**通过**。

---

## 6. 四项判定汇总

| FIX | 对应 RT | 四态 | 关键证据 |
|---|---|---|---|
| **FIX-01** | RT-01 | **通过** | 步骤 0 PASS（两态 path 均指向当前包）；A 4 类型 / B 3 类型可逆；`schema:get` null vs 阴性对照正常；N=3 可解释 |
| **FIX-02** | RT-05 S2 | **通过** | 列表不清空 + `state=failed` + 层保留 4 + 两条 WARN；一次读取即恢复 |
| **FIX-03** | RT-05 S2 | **通过** | 失败态 3 次读取 → 3 次重建 + 6 条失败 WARN（无戳命中） |

**原始日志**：`E:\mc kjs\.cache\t13-ud\logs\studio-2026-11-02.log`（129 行）。
**执行记录**：`.cache/fix14/a3tmp/t13-p2/`（build.log、import-A/B.json、launch.txt、kill.txt、vitest.log、vitest2.log、rerun-1/2.log）。

---

## 7. 保护边界核验

| 对象 | 结果 |
|---|---|
| **生产 userData** | `kubejs-recipe-studio` mtime `2026-11-01 23:45:36.598074800`、`-dev` `2026-11-01 05:23:32.034775200` —— **与启动前基线逐纳秒一致** |
| **原件 `pc7-pack-1112`** | 1659 文件，逐文件 SHA-1 **差异 0**，目录 mtime 未变 |
| **源码** | `src` = 185 文件 / `tests` = 101 文件，**本批零改动**（`loader.ts` `c4e6c6d4…`、`service.ts` `6bc20964…` 均与第 31 批终态一致） |
| **工具** | `drill` `ea2b196b…`、`rehearsal` `6c34dd91…` 未动 |
| **进程** | 关闭时 `to-kill=46204,65404,68480`；关闭后含 `mc kjs` 的 electron = **0**；**QQ-agent 6 个仍在** |
| **禁止动作** | 未 NSIS/dmg/安装；未 `--force-run`；未 Git 写；未改 V9/V1.1/V1.2/DECISIONS/任务状态/矩阵 |

---

## 8. 未执行 / 剩余项

| # | 项 | 状态 |
|---|---|---|
| 1 | RT-05 A/C 两态（目录不存在 / 读成功但为空） | **只记录不判定**（D-10 暂缓） |
| 2 | RT-01 的「预览 UI 显示未找到 schema」文案级断言 | 未取（`schema:get` 返回 `null` 已是同一判据的数据层证据；UI 文案属 T-13.3 全量范围） |
| 3 | 7 jar 放入副本 `mods/` | 未做（对三项 FIX 无观测价值，见 §2.2） |
| 4 | T-13.3（RT-01～10 全量）/ T-13.4（cacheHit） | 未执行（下一包） |
| 5 | NSIS 打包 / 安装 / 发布 | 未执行（T-17 约束不变） |

---

## 9. 状态声明

**T-13.2 三项 FIX 四态均为「通过」→ 记「待验收」。** 验收权在负责人。

本包**不构成** T-13.3/T-13.4 授权、不构成 NSIS 打包授权、不构成 P2 排期变化。

**清理建议（不急删）**：`.cache/t13-pack`（556 MB，A 包基底）、`.cache/t13-pack-b`（556 MB，B 包）、`.cache/t13-ud`（124 MB+）全部保留，T-13.3 可直接复用。
