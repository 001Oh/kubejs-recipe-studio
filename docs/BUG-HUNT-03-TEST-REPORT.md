# BUG-HUNT-03 · 测试与验证报告（TEST-REPORT）

> **工程**：`E:\mc kjs`｜**执行时间**：2026-11-01 15:32–15:42
> **本文件所有结果均为本轮实际执行所得**（未引用历史报告中的数字）。
> **环境**：Node `v22.14.0`（项目可移植版）、`vitest 2.1.9`、Windows、`environment: node`。

---

## 1. 执行命令与实际结果

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `./node_modules/.bin/vitest run`（完整套件） | **0** | **Test Files 77 passed \| 2 skipped（79）**；**Tests 738 passed \| 4 skipped（742）**；失败 **0**；耗时 73.46s |
| 2 | `npm run typecheck`（`typecheck:node` + `typecheck:web`） | **0** | 无错误输出 |
| 3 | `npm run lint`（`eslint . --ext .ts,.tsx --max-warnings=0`） | **0** | 无输出 |

**package.json 脚本核对**：`test = vitest run`、`typecheck = typecheck:node && typecheck:web`、`lint = eslint … --max-warnings=0`。三条命令都不启动应用、不打包、不安装依赖、不触碰受保护目录，**可以安全执行**。

### 1.1 与上一轮基线对比

| 时点 | 文件 | 用例 | 通过 | 跳过 | 失败 |
| --- | --- | --- | --- | --- | --- |
| BUG-HUNT-02-RV1 结束时 | 73（71 + 2 skip） | 701 | 697 | 4 | 0 |
| **本轮结束（实测）** | **79（77 + 2 skip）** | **742** | **738** | **4** | **0** |

增量：**+6 文件 / +41 用例**，与 §2 新增内容精确对应（6+6+10+5+7+7 = 41）。

> 4 个 skip 全部是**基线既有**的条件跳过（`describe.skipIf` 于真实整合包/可选模块路径），本轮**未新增任何 skip**，未删除或放宽任何既有用例。

---

## 2. 新增测试文件（6 个 / 41 例）

| 文件 | 用例 | 覆盖 |
| --- | --- | --- |
| `tests/main/previewFreshness.test.ts` | **6** | REM-01（换包后 schema 跟随、generate 一致、同路径模组变化、换包失败、连续换包） |
| `tests/main/corpusRefresh.test.ts` | **6** | REM-02（开关后语料即时生效、恢复、不误删、不反复重建、清空后为 null） |
| `tests/main/schemaMergeContract.test.ts` | **10** | REM-03（幂等/增删重加/顺序无关/覆盖边界）＋ REM-04（快照 vs 当前） |
| `tests/renderer/sequenceSchemaConcurrency.test.ts` | **5** | BH-002 第一段（store → api → 桥） |
| `tests/scanner/virtualCallSite.test.ts` | **7** | BH-003（扫描期行为 5 例 + 调用点结构断言 2 例） |
| `tests/renderer/fieldModelDedup.test.ts` | **7** | BH-006 / BH2-002（字段去重与优先级） |

**未修改任何既有测试文件**（本轮 6 个新文件全部为新增，既有 73 个文件内容未动）。

---

## 3. 逐项测试名称

### 3.1 REM-01（`tests/main/previewFreshness.test.ts`）

1. `基线：packA 装了 create → create:mixing 判为可结构化（compatible）`
2. `切到未装 create 的 packB：不手动刷新，loadSchema 立刻判为 unsupported`
3. `换包后 preview.generate 也按 packB 的通道产出（不只是 loadSchema）`
4. `同路径但附属集合变化（重新检测）也要重建，而不是沿用旧判定`
5. `换包失败（modpack 置空）不破坏可用性：内置 schema 仍可取到，不抛错`
6. `连续两次换包后，最终结果由最后一次的包决定`

### 3.2 REM-02（`tests/main/corpusRefresh.test.ts`）

1. `启用时：命中通配的物品被默认查询隐藏，其余物品不受影响`
2. `禁用插件后，不重建索引、不手动刷新，立即搜索即能看到该物品`
3. `重新启用后该物品重新被隐藏`
4. `普通原版物品与其他插件物品不会被误删（语料条数恒定）`
5. `插件状态没变时不会反复重建语料（同一实例）`
6. `清空索引后再取语料返回 null（不制造空语料假象）`

### 3.3 REM-03 / REM-04（`tests/main/schemaMergeContract.test.ts`）

1. `同样的层内容连续合并两次，结果深度相等`
2. `连续合并三次不累积：结论只由当前层决定`
3. `类型从层里消失后重新合并，不得残留在生效表`
4. `新增 → 删除 → 重新加入，三次之后结果与首次一致`
5. `同一 id 同时存在于 builtin 与 plugin：plugin 胜，且与 putLayer 顺序无关`
6. `钉住层覆盖 plugin 与 builtin（用户覆盖边界）`
7. `allSchemas() 是数组快照：之后层变化不会改写已取到的数组`
8. `层更新后 getSchema 返回当前对象，旧引用不等于最新状态`
9. `listSchemas() 每次都反映当前生效表`
10. `快照数组本身不可被外部改动影响注册表（返回的是副本）`

### 3.4 BH-002（`tests/renderer/sequenceSchemaConcurrency.test.ts`）

1. `并发拉取 3 个类型：全部拿到 schema，不会出现 null`
2. `每个类型只发起一次请求（并发不会重复请求）`
3. `并发结果进入缓存：第二轮不再请求`
4. `初始化失败不会被永久缓存：下一次可以重试成功`
5. `同一类型被并发请求 5 次：结果一致，无 null`

### 3.5 BH-003（`tests/scanner/virtualCallSite.test.ts`）

行为（5 例）：

1. `命中插件通配的物品，扫描结果仍是 virtual:false（保证 items.json 不随插件漂移）`
2. `命中内置命名规则（dummy）的物品，扫描结果是 virtual:true`
3. `普通物品不会被误判为虚拟物品`
4. `同一物品在查询期会因插件通配被判为虚拟物品（两个入口的差异成立）`
5. `没有插件时两类物品的扫描结果不变（通配不影响扫描）`

结构断言（2 例，**明确标注非行为测试**）：

6. `probeImport 使用 isVirtualByNamingRules，且代码里不调用查询期版本`
7. `itemRules 同样只用命名规则版本`

### 3.6 BH-006 / BH2-002（`tests/renderer/fieldModelDedup.test.ts`）

1. `slots 与 outputs 出现同 key 时只声明一次`
2. `slots 与 extraFields 出现同 key 时只声明一次，且采用 slots 那份（先到者胜）`
3. `降级字段只存在于 extraFields 时仍会被声明，且 required 为 false`
4. `不同 key 全部保留：去重不会误删正常字段`
5. `被 compound 吸收的原始键不再单独声明（配对合并语义）`
6. `bucketFields 也基于去重后的字段：不会把同一 key 分到两个区`
7. `空 schema / null 安全：返回空数组`

---

## 4. 修复前失败 / 修复后通过的证据

### 4.1 有真实 red→green 证据（2 项）

| 项 | 修复前（受控回退到备份版本，实际运行） | 修复后（还原修复版后运行） |
| --- | --- | --- |
| **REM-01** | `preview.ts` 换回 `eb460f12…` → **5 failed / 1 passed**：<br>· `expected 'compatible' to be 'unsupported'`（换包后仍用旧包判定）<br>· `expected 'compatible' to be 'unsupported'`（generate 路径）<br>· 同路径模组变化 / 换包失败 / 连续换包 各 1 例同症状 | 还原 `0ba2a034…` → **6 passed** |
| **REM-02** | `itemIndex.ts` 换回 `c45a8a93…` → **2 failed / 4 passed**：<br>· `expected [ 'bh03:ordinary', 'minecraft:stone' ] to deeply equal [ 'bh03:marker/widget', …(2) ]`（禁用后物品仍被隐藏）<br>· `expected [ 'bh03:ordinary', 'minecraft:stone' ] to include 'bh03:marker/widget'`（重新启用后未恢复隐藏） | 还原 `0ef4b643…` → **6 passed** |

> 两次回退的还原都用 `sha256` 核对到与"换前修复版"逐字节一致（`0ba2a034…` / `0ef4b643…`）。

### 4.2 无 red 证据的项目（**如实标注，不冒充**）

| 项 | 原因 |
| --- | --- |
| **REM-03 / REM-04** | 核实结论是"**当前实现已满足契约**"，不存在可复现的失败；测试是把既有行为固化为断言（回归护栏），因此**没有 red 阶段** |
| **BH-002** | 缺陷本体在 BUG-HUNT-02-RV1 已修复（`ensureSchemas` 改为共享 in-flight + `applyMerge` 清表）。本轮是**补覆盖**：新用例在修复后的代码上直接通过，**未保留"换回旧实现再跑"的记录** |
| **BH-003** | 同上：缺陷本体已在 BUG-HUNT-02 修复（拆 `isVirtualByNamingRules`）。本轮补的是"调用点确实用了哪个入口"的证据，代码未改 → 无 red 阶段。同时修了一处注释，注释不影响行为 |
| **BH-006 / BH2-002** | 同上：`augment` 的修复在 BUG-HUNT-02-RV1 完成；本轮为 `declaredFields` 去重补测试，代码未改 → 无 red 阶段 |

### 4.3 测试自身的两次返工（如实记录）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| REM-01 首轮 6 例全失败，错误是 `expected undefined` | `boot()` 只换 modpack 没先初始化注册表，测的是"读不到"而非"读到旧值" | 在 `boot()` 末尾加 `await service.schemaSummaries()`，模拟"应用已在包 A 下用过"；随后 red 证据变成精确的 `expected 'compatible' to be 'unsupported'` |
| BH-003 结构断言误报 | `itemRules.ts` 的**注释**里出现 `isVirtualItem()`，被正则命中 | 断言前剥离注释（`codeOnly()`），并在用例名标注"源码结构断言" |

> 这两处都是**测试编写问题**，不是产品缺陷；已在报告中保留，避免把返工记成"修复"。

---

## 5. 本轮实际执行 / 未执行清单

| 项 | 状态 |
| --- | --- |
| 6 个新测试文件的定向运行（逐个） | **已执行**（每个文件都单独跑过，最后一次全部通过） |
| 完整测试套件 | **已执行**（`vitest run`，79 文件 / 742 用例） |
| `npm run typecheck` | **已执行**（含一次因测试类型不兼容而失败 → 修正后通过） |
| `npm run lint` | **已执行**（通过，全程无 warning） |
| 受控回退取证（REM-01 / REM-02） | **已执行**（各一次，均还原并核对哈希） |
| 构建 / 打包 / 安装 | **未执行**（任务禁止，且会触碰 `dist`） |
| 启动应用 / E2E / 真机 UI | **未执行**（任务禁止） |
| 真实整合包扫描 | **未执行**（需真实 MOD 包，且会写生产 userData） |
| 依赖安装（jsdom / testing-library） | **未执行**（任务禁止） |

---

## 6. 未覆盖的调用路径及原因

| # | 未覆盖 | 原因 | 影响 |
| --- | --- | --- | --- |
| 1 | **React 组件渲染**（`SequenceEditor` 挂载/卸载时序） | `vitest` 环境为 `node`；未安装 `jsdom` / `@testing-library/react`；本轮禁止装依赖；`tsconfig.web` 无 `@main` 别名、`tsconfig.node` 排除 `tests/renderer/**`，渲染层测试无法 import 主进程模块 | BH-002 的"并发请求"行为已两段覆盖，但"组件在卸载后仍收到响应"这类 React 层行为未验证 |
| 2 | **`probeImport` 的行为**（真实 ProbeJS 导出） | 需构造 ProbeJS 导出目录/文件树，成本高；本轮改为源码结构断言 | 只能证明"调用的是命名规则版本"，不能证明"具体条目的 virtual 值"；但同一函数已被 `scanJarEntries` 行为测试覆盖 |
| 3 | **`recipes:open` / `recipes:commit` 的 IPC 端到端** | 需要完整配方索引 + 写盘路径（commit 会写文件，触碰保护边界的风险需评估） | REM-01 的 `selectSchema` 分支只验证了 `loadSchema` 侧与"入口调用了 `ensureSchemas`"这一事实（源码），未跑完整 IPC |
| 4 | **真实整合包下 `capability` 变化** | 需真实 MOD 包与真实附属 | REM-01 用 `installedModIds`/`kubejsAddons` 的合成数据验证逻辑，未在真实包上验证 |
| 5 | **4 万条物品下的语料重建耗时** | 需真实索引；本轮只用 3 条物品验证语义 | REM-02 正确性已验证，**性能影响未测**（一次重建的量级与扫描期构建同级） |
| 6 | **`selectSchema` 直接调用（非 IPC）** | 未改其同步签名（见 FIX-REPORT §3.5） | 程序化直接调用仍可能读到当前快照 |

---

## 7. 断言质量自评（本轮 41 例）

| 检查项 | 结论 |
| --- | --- |
| 是否只验证 mock 调用 | **否**：REM-01 走真实 `loadSchema`/`generate`（真实注册表 + 真实 `decideForSchema`）；REM-02 走真实 `scanJarEntries`/`itemIndex`/`corpus.search` + 真实插件文件；REM-03/04 走真实 registry；BH-003 用真实 jar 条目；BH-006 是纯函数。仅 BH-002 第一段 stub 了 preload 桥（渲染层唯一入口，且为不可用真桥时的最接近替代） |
| 是否直断言最终行为 | **是**：`capability` / `preview.channel` / `corpus.search().hits[].item.id` / `getSchema()` / `declaredFields()` / `getState().schemaCache` |
| 是否覆盖失败路径 | REM-01 有"换包失败（modpack 置空）"；BH-002 有"初始化失败后可重试"；REM-02 有"清空索引返回 null" |
| 是否覆盖并发 | BH-002 有（3 类型并发、同类型 5 并发、每类型只请求一次） |
| 是否存在"通过但实现仍可能错" | REM-01 的 `generate` 断言只校验"与 `loadSchema` 一致"，未校验生成内容本身（生成内容的既有测试在 `tests/codegen/`） |

---

## 8. 结论

- **REM-01、REM-02：已修复，且有真实 red→green 证据**。
- **REM-03、REM-04：核实为"当前实现已满足契约"**，本轮不改代码，已用 10 个用例固化。
- **BH-002、BH-003、BH-006/BH2-002：证据已补齐**（BH-002 为两段式，React 渲染层未覆盖；BH-003 的 `probeImport` 为结构断言）。
- **全部结果来自本轮实际执行**；4 个 skip 为基线既有；未删除/跳过/放宽任何既有测试。
- **真实环境验证：0 项**（本轮禁止启动应用与真实整合包扫描）。
