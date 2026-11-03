# BUG-HUNT-03 · 剩余问题清单（REMAINING）

> **工程**：`E:\mc kjs`｜**时点**：2026-11-01 15:42｜**基线**：台账 V9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，未修改）
> **本文件是后续所有"暂缓 / 待验证"事项的唯一入口**。新增暂缓项一律登记到这里，避免随报告迭代而遗失。
> **三态口径**：① 代码已修改｜② 测试通过（本轮实际执行）｜③ 真实环境已验证。**本轮仍然没有任何一项达到 ③。**

---

## 0. 统一待决清单（P 系列）

| 编号 | 事项 | 来源 | 优先级 | 状态 | 解除条件 |
| --- | --- | --- | --- | --- | --- |
| **P-01** | manifest 数量上限 | BH-013 | P3 | **暂缓** | 真实插件包的 `recipeTypes` 数量分布 |
| **P-02** | `{id,count}` 与 blockstate 判别歧义 | BH2-003 | P3 | **暂缓** | 真实样本中两种形态的占比 |
| **P-03** | 数量侧接受任意字符串 | BH2-005 | P3 | **暂缓** | 是否存在 `"1x"` 之类带单位写法 |
| **P-04** | `selectSchema` 仍是同步直读注册表 | REM-01 残留 | P3 | **接受现状** | 若要彻底消除，需把 open/commit 链异步化 |
| **P-05** | 插件开关后语料重建的耗时 | REM-02 副作用 | P3 | **待测** | 真实 4 万条索引下测一次重建耗时 |
| **P-06** | `syncPluginLayer` 与 `ensureSchemas` 的重复 `applyMerge` | REM-03 残留 | P4 | **接受现状** | 若合并变重再考虑抑制标志 |
| **P-07** | 组件级（React）并发时序未覆盖 | BH-002 证据边界 | P3 | **待补** | 引入 jsdom + @testing-library 后补组件测试 |
| **P-08** | `probeImport` 只有结构断言 | BH-003 证据边界 | P3 | **待补** | 构造真实 ProbeJS 导出 |
| **P-09** | 真实环境验证（10 项） | 全部修复项 | **P1（最高）** | **未执行** | 见 §4 |

---

## 1. P-01 · BH-013 · manifest 数量上限

| 项 | 内容 |
| --- | --- |
| **当前代码状态** | `src/main/plugins/manifest.ts`：`recipeTypes` / `virtualItemPatterns` / `mods` / `slots` 的解析**均无 `length` 上限**；对比 `hookSandbox.ts` 有 `HOOK_SOURCE_MAX_BYTES`（64 KB），说明作者对体积有意识，但 manifest 未设限 |
| **风险等级** | **P3** |
| **可能影响** | 恶意/误生成的超大 manifest 会让 `buildPluginSchema` ×N 与类型选择器渲染变慢；插件是本地文件，攻击面有限；**不涉及数据安全** |
| **暂缓原因** | 任务明确要求"采用与项目现有架构一致的约束，**不要凭空引入不合理的硬编码限制**"。当前**没有任何数据**支持某个具体阈值；贸然设 128/500 可能直接废掉一个合法的大型整合包插件 |
| **解除所需** | 3–5 个真实插件包的 `recipeTypes` 与 `virtualItemPatterns` 数量分布 |
| **后续验证方式** | 统计后设"远高于真实峰值"的上限（如 2000）并只 WARN 截断、不拒绝；同时给 `manifest.json` 文件大小加宽松上限（如 2 MB），与 `HOOK_SOURCE_MAX_BYTES` 风格一致 |
| **记录位置** | `BUG-HUNT-02-RV1-FIX-REMAINING.md` §2.1；本文件 P-01 |

---

## 2. P-02 · BH2-003 · `{id,count}` 与 blockstate 的结构歧义

| 项 | 内容 |
| --- | --- |
| **当前代码状态** | `src/main/schema/primitives.ts` `looksBlockstate()`：对象含形如 `ns:path` 的 `id` 且**任一**其它属性为 string/number/array/object → 返回 `true`。因此 `{"id":"minecraft:stone","count":3}` 被判为 blockstate，`count` 被当成方块属性 |
| **风险等级** | **P3** |
| **可能影响** | 该字段的控件形态错误（应为"物品 + 数量角标"）；`preserveUnknown` 仍保留原字段，写盘不会丢数据；用户可在高级 JSON 区手工修正 |
| **暂缓原因** | 真方块状态就是 `{"id":"minecraft:oak_stairs","facing":"north"}` —— 字符串属性是**合法属性**。在通用前提下 `{id,count}` 与 `{id,facing}` 结构不可区分，任何收紧都会误伤真 blockstate |
| **解除所需** | 真实整合包样本中 `{id,<标量>}` 的 item 形态 vs blockstate 形态占比 |
| **后续验证方式** | 拟用已存在的 `QUANTITY_KEYS`（`count`/`amount`/`size`）从"可作为 blockstate 属性"的名单中排除——这三者几乎不可能是方块状态属性。**需先用样本验证不误伤** |
| **记录位置** | `BUG-HUNT-02-FINDINGS.md` BH2-003；`BUG-HUNT-02-RV1-FIX-REMAINING.md` §2.2；本文件 P-02 |

---

## 3. P-03 · BH2-005 · 数量侧接受任意字符串

| 项 | 内容 |
| --- | --- |
| **当前代码状态** | `primitives.ts` `siblingHasQuantShape()`：`const numeric = number + string`；`if (quant !== 'chance') return true` —— `count`/`amount` 只要出现过字符串即认为合格；`chance` 分支额外要求"字符串可转数字"（**不对称**） |
| **风险等级** | **P3** |
| **可能影响** | `{ item:'x', count:'abc' }` 也会被配对合并成"物品 + 数量角标"，UI 用数字框编辑，写回时类型从字符串变数字 |
| **暂缓原因** | 统一口径会**改变字段分组结果**（同一类型的表单布局变化），属产品语义变更；且模组里确实存在 `"0.07"` 这类字符串数值（代码注释已举 IP 蒸馏塔为例） |
| **解除所需** | ① `count`/`amount` 出现非数字字符串的占比；② 是否存在 `"1x"`、`"2 个"` 这类带单位写法（若存在，现有合并本身就是错的） |
| **后续验证方式** | 先做**只读探测**：在 `augment` 时记录"数量侧出现非数字字符串"的 typeId 与样例，跑一轮真实整合包看命中率 |
| **记录位置** | `BUG-HUNT-02-FINDINGS.md` BH2-005；本文件 P-03 |

---

## 4. P-09 · 真实环境验证（0/10 完成）

> 以下每项都**只到"代码已改 + 测试通过"**，没有一项在真实应用中验证过。

| # | 待验证 | 复现步骤 | 成功判据 |
| --- | --- | --- | --- |
| 1 | 换包后预览用新包 schema（REM-01） | 导入包 A（装 create）→ 打开工作台生成预览 → 导入包 B（不装 create）→ **不重开工作台**直接生成预览 | 预览走数据包 JSON，且提示未装 create；不出现包 A 的语法糖写法 |
| 2 | 换包后打开配方用新包 schema（REM-01） | 同上，导入包 B 后直接点开任一配方 | `recipes:open` 返回的 `schemaSource` 不是包 A 的 pinned/plugin 残留 |
| 3 | 换包失败不破坏可用性（REM-01） | 选一个非法目录/中途取消导入 | 应用仍可用，原有包状态不变，schema 仍可取 |
| 4 | 关闭插件后搜索即时生效（REM-02） | 装带 `virtualItemPatterns` 的插件 → 扫描 → 搜索该物品（默认应隐藏）→ 设置页关闭插件 → 回到搜索 | 不重扫即可搜到；重新启用后再次隐藏 |
| 5 | 语料重建耗时（P-05） | 真实 4 万条物品索引 + 开关插件 | 首次搜索的卡顿可接受（参照扫描期 `corpusMs`） |
| 6 | 钉住写盘失败回滚（RV1-001） | 把 `customRecipeTypes.json` 设为只读后钉住 | UI 报错，重启后状态与操作前一致 |
| 7 | 插件关掉后不参与生成（RV1-002） | 关闭插件 → 直接生成该类型预览 | 走通用兜底，不再出现该插件的字段 |
| 8 | 改插件文件不重启即生效（BH-014） | 编辑插件 JSON → 回设置页刷新 | 列表反映新内容 |
| 9 | 虚拟物品通配真实生效（BH-003） | 装带通配的插件 → 扫描 → 搜索命中的物品 | 默认不出现，`includeVirtual` 打开后出现 |
| 10 | `cacheHit` 运行时值 | 同一包连续扫描两次 | 第二次日志中 `cacheHit=true`（**仍为未测量**，不属本轮） |

---

## 5. 其他残留（不影响功能，但需知晓）

### 5.1 P-04 · `selectSchema` 仍是同步直读

`src/main/recipes/selectSchema.ts:56` 的 `getSchema(typeId)` 不触发重建。生产路径已由 `recipeHandlers` 的 `await ensureSchemas()` 覆盖；**直接以编程方式调用** `openRecipe` / `commitRecipe`（测试、未来的内部调用方）仍可能读到当前快照。未改原因：`selectSchema` 是 `openRecipe`/`commitRecipe` 的可注入依赖，改签名会把同步链变异步。

### 5.2 P-06 · 重复 `applyMerge`

`ensureSchemas()` 组装期间，`fetchLayer('plugin')` → `loadPlugins`（键变）→ `syncPluginLayer()` → `refreshEffective()` 会合并一次，末尾再合并一次。**幂等、无状态污染**，只是多一次 CPU。加抑制标志会让 registry 与 loader 的所有权边界更模糊，收益不成比例。

### 5.3 P-07 / P-08 · 证据边界

- **P-07**：BH-002 的组件级时序（React 挂载/卸载、卸载后收到响应）未验证——缺 `jsdom` / `@testing-library/react`，且 `tsconfig.web` 无 `@main` 别名。
- **P-08**：BH-003 的 `probeImport` 只有源码结构断言（剥离注释后确认调用 `isVirtualByNamingRules(`），没有行为测试。

### 5.4 既有台账条件（与本轮无关，仅提示）

正式台账 V9 **未被修改**，其 `40 条 = 5 已解决 + 2 部分 + 1 待验证 + 32 未解决` 保持不变（第 148 行）。本轮所有修复属代码层，**不改变任何台账条件状态**；其中 `P0-PL1`（插件类型未入 schema 层）与 BH-004/005/BH2-001 同根因，**是否据此关闭需负责人裁决**。

---

## 6. 剩余源码审计盲区（相对 BUG-HUNT-01-COVERAGE，本轮未推进）

| 区域 | 规模 | 状态 |
| --- | --- | --- |
| `src/main/schema/classParser.ts` | 450 行 | **仍未读**（全工程最大未验证面；畸形字节码路径未验证） |
| `src/main/schema/naming.ts` | 287 行 | 仍未读 |
| `src/main/schema/registryOptions.ts` | 164 行 | 仍未读 |
| `src/main/plugins/manifest.ts` | 302 行 | 仅读校验分支 |
| `src/main/plugins/merge.ts` | 206 行 | 仅读 `source:'plugin'` 与 `resolvePluginOverrides` 头部 |
| `src/main/plugins/capabilityLink.ts` / `report.ts` | 111 / 138 行 | 仍未读 |
| `src/renderer/src/store/benchStore.ts` | 460 行 | 仍未读 |
| `src/renderer/src/store/commitBridge.ts` | — | 仅 grep |
| `src/renderer/src/components/*`（14 个） | — | 仍未读 |
| `src/main/codegen/*`（除 preview/channel/emit* 片段） | — | 部分未读 |
| `src/main/scanner/*`（除 itemRules/probeImport/itemIndex） | — | 大部分未读 |
| 约 60 个既有测试文件的断言体 | — | 仍只做了计数与抽查，未逐条审 |

---

## 7. 本轮结论

| 事项 | 结论 |
| --- | --- |
| REM-01 | **已修复并验证**（①+②），有真 red→green；真实环境未验证 |
| REM-02 | **已修复并验证**（①+②），有真 red→green；真实环境与性能未验证 |
| REM-03 | **确认无缺陷**（幂等），契约已固化；未改代码 |
| REM-04 | **未发现已发生缺陷**；快照/当前边界已固化；未改代码 |
| BH-002 / BH-003 / BH-006+BH2-002 | **证据已补齐**（含明确标注的证据边界） |
| BH-013 / BH2-003 / BH2-005 | **维持暂缓**，已登记为 P-01 / P-02 / P-03 |
| 真实环境验证 | **0 / 10** |
