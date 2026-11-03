# BUG-HUNT-02-RV1 · 测试与验证报告（FIX-TEST-REPORT）

> **工程**：`E:\mc kjs`｜**执行时间**：2026-11-01 09:22–09:32
> **所有结果均为本轮实际执行所得**，未引用 BUG-HUNT-02 报告里的 669 passed 等历史数字。
> **环境**：Node `v22.14.0`（项目自带可移植版），`vitest 2.1.9`，Windows。

---

## 1. 执行命令与实际结果

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 1 | `./node_modules/.bin/vitest run`（完整套件） | **0** | **Test Files 71 passed \| 2 skipped (73)**；**Tests 697 passed \| 4 skipped (701)**；失败 0；耗时 71.49s |
| 2 | `npm run typecheck`（`typecheck:node` + `typecheck:web`） | **0** | 两侧均无输出（通过） |
| 3 | `npm run lint`（`eslint . --ext .ts,.tsx --max-warnings=0`） | **0** | 无输出（通过） |

**package.json 脚本核对**：`test = vitest run`、`typecheck = typecheck:node && typecheck:web`、`lint = eslint . --ext .ts,.tsx --max-warnings=0` —— 与任务要求的三类验证一致，无需替换命令。

### 1.1 与上一轮基线的差值

| 时点 | 文件 | 用例 | 通过 | 跳过 | 失败 |
| --- | --- | --- | --- | --- | --- |
| BUG-HUNT-02 结束时（历史） | 70（68 + 2 skip） | 673 | 669 | 4 | 0 |
| **本轮结束（实测）** | **73（71 + 2 skip）** | **701** | **697** | **4** | **0** |

差值：**+3 文件 / +28 用例**，与 §2 的新增内容**精确对应**（17 + 11 = 28）→ **零回归、未破坏既有用例**。

> **4 个 skip 全部是基线既有**的条件跳过（`RUN_REAL_PACK` 未开、本机 MOD 包路径不存在），本轮**未新增任何 skip**。

---

## 2. 新增与修改的测试文件

### 2.1 新增 3 个文件（17 例）

| 文件 | 用例数 | 覆盖问题 |
| --- | --- | --- |
| `tests/main/schemaPinRollback.test.ts` | **5** | RV1-001（pin/unpin 写盘失败回滚） |
| `tests/main/pluginSchemaFreshness.test.ts` | **9** | RV1-002（关闭插件后同步路径立即失效）、RV1-003（provider 失败保留层） |
| `tests/plugins/pluginCacheKey.test.ts` | **3** | BH-014（插件文件签名进缓存键） |

### 2.2 修改 3 个文件（追加 11 例，未删改既有用例）

| 文件 | 用例数变化 | 追加覆盖 |
| --- | --- | --- |
| `tests/plugins/hookBlacklist.test.ts` | 12 → **18**（+6） | RV1-005（正则字面量）、RV1-006（嵌套模板 / 插值内 `}` / 除号 / 非法语法回退） |
| `tests/main/schemaMerge.test.ts` | 10 → **12**（+2） | RV1-007（`extraFields` 同名去重 + 普通降级回归） |
| `tests/plugins/virtualItemPatterns.test.ts` | 7 → **10**（+3） | RV1-004（插件通配 → 语料构建 → 实际查询 → 关闭后重建语料） |

---

## 3. 每项缺陷对应的测试名称

### 3.1 RV1-001（`tests/main/schemaPinRollback.test.ts`）

1. `pin 写盘失败：抛错、pinned 不新增、effective 保持原值`
2. `pin 写盘成功：pinned 新增且 effective 变成 custom`
3. `unpin 写盘失败：抛错且 pinned 仍然保留（不能悄悄取消）`
4. `unpin 写盘成功：pinned 移除`
5. `对未钉住的类型 unpin：返回 false，且不触碰磁盘`

**失败注入方式**：把 pinned 路径指向一个**已存在的目录**，`writeJson` 的 `rename(tmp → 目录)` 必然失败。**不 mock 业务实现**、不碰真实 userData。

### 3.2 RV1-002 / RV1-003（`tests/main/pluginSchemaFreshness.test.ts`）

1. `基线：启用时 getSchema 与 loadSchema 都能拿到插件类型`
2. `关闭插件后，不经过任何 schema:* 调用，getSchema 立刻返回 null`
3. `关闭插件后，codegen 预览用的 loadSchema 立刻返回 null`
4. `关闭插件后，配方选择路径（selectSchema）不再选中插件 schema`
5. `重新启用后，同步路径立刻恢复`
6. `关闭插件同时不影响内置试点类型`
7. `provider 抛错时，重建后插件类型仍在（保留上一次的层）`
8. `provider 正常返回空数组时，按设计清空插件层（区分「确实没有」与「读取失败」）`
9. `syncPluginLayer 在 provider 抛错时保留旧层而不是抛错`

> 关键设计：用例 2/3/4 **刻意不调用** `schemaSummaries()` / `schemaById()`，避免那条路径顺手触发 `ensureSchemas` 而掩盖 `effective` 陈旧问题。

### 3.3 RV1-004（`tests/plugins/virtualItemPatterns.test.ts` 追加）

1. `未加载插件时：命中通配的物品照常出现在结果里`
2. `加载插件后构建语料：命中通配的物品被默认查询隐藏，开启 includeVirtual 后可见`
3. `关闭插件后重建语料：通配不再生效（语料是构建期快照，需重建才更新）`

> 断言的是 `corpus.search(query)` 的**命中 id 列表**与 `corpus.size`，不是 matcher 函数本身。

### 3.4 RV1-005 / RV1-006（`tests/plugins/hookBlacklist.test.ts` 追加）

1. `含 /* 的正则字面量不得吞掉后续代码：真实 require 仍被拦下`
2. `正则字面量里的禁用词不算违规（正则不是代码）`
3. `嵌套模板插值里的调用仍被拦下`
4. `插值里出现含 "}" 的字符串，不影响其后的代码检查`
5. `除号不会被误当成正则起点`
6. `语法非法的源码回退到字符扫描，且不抛错`

### 3.5 RV1-007（`tests/main/schemaMerge.test.ts` 追加）

1. `降级项与骨架 extraFields 撞名时，extraFields 里只保留一份`
2. `普通降级（无撞名）仍然把字段放进 extraFields`

### 3.6 BH-014（`tests/plugins/pluginCacheKey.test.ts`）

1. `同一路径下改插件内容后再次加载，读到的是新内容`
2. `内容不变时不重复解析（缓存仍然生效）`
3. `删除插件文件后再次加载，该插件不再出现`

---

## 4. 修复前失败 / 修复后通过的证据

### 4.1 有真实 red→green 记录的两项

| 项 | red 证据 | green 证据 |
| --- | --- | --- |
| **RV1-001** | 把 `registry.ts` 临时换回**备份的修复前版本**运行 `schemaPinRollback.test.ts` → **2 failed / 3 passed**：<br>· `expected [ 'demo:rollback' ] to not include 'demo:rollback'`（pin 失败后仍留在 pinned）<br>· `expected [] to include 'demo:rollback'`（unpin 失败后已被移除） | 恢复修复版（sha256 `5e2605ef…` 与原修复版逐字节一致）→ **5/5 passed** |
| **RV1-002** | 首次运行 `pluginSchemaFreshness.test.ts` → **4 failed / 10 passed**：<br>· `关闭插件后 getSchema 立刻返回 null` → `expected {...} to be null`<br>· `loadSchema 立刻返回 null` → 同上<br>· `selectSchema 不再选中插件 schema` → 同上<br>· `重新启用后同步路径立刻恢复` → 同上 | 修 `applyMerge` 清表 + `refreshEffective` 后 → 8/9；再修正一处**测试断言**（见下）→ **9/9 passed** |

> **RV1-002 的 red 里有一半功劳属于测试**：它暴露了 RV1-002 的**第二个成因**——`applyMerge()` 从不删除已消失类型的 `effective` 条目。这是 RV1 复核时**没有发现**的问题，由本轮测试驱动发现并修复。

### 4.2 一条**测试自身写错**的失败（如实记录）

`selectSchema` 用例最初断言 `schema.id !== TYPE_ID`，修复后仍失败。核对源码发现：`selectSchema` 的 generic 兜底会**故意**把 `typeId` 填进 `schema.id`（`selectSchema.ts` 末尾），因此 `id` 永远等于 typeId。**这是断言错误，不是产品缺陷**；已改为断言 `source`（`'plugin'` → `'generic'`）并在用例内注释说明。

### 4.3 没有 red 证据的项目（**明确标注，不冒充**）

| 项 | 状态 |
| --- | --- |
| RV1-003、RV1-005、RV1-006、RV1-007、BH-014 | 测试与修复**同期完成**，未单独保留"修复前运行"的记录。可核对性来自源码推导（旧实现的行为在 FIX-REPORT 中逐条对应），但**不得表述为已完成 red-before-green** |
| RV1-004 | 属**测试缺口**而非产品缺陷：BH-003 修复后的函数级行为本就正确，补的是链路覆盖。**不存在"失败"可复现**（在修复前，`matchesVirtualItem` 无调用方，语料链路本就不会受影响） |
| RV1-008 | 未改代码，无测试改动 |
| RV1-009 | 纯注释，无可执行断言 |

### 4.4 本轮未做的对照

- 未对 RV1-002 做"换回旧版再跑"的受控回退（RV1-001 已做过一次，验证了方法可行；再次回退会同时牵动 `service.ts`/`loader.ts` 三个文件，风险高于收益）。
- 未运行任何浏览器/E2E：本轮的 `tests/renderer/*` 是 store 级测试（jsdom 不需要），不启动 Electron。

---

## 5. 未覆盖的路径及原因

| # | 未覆盖路径 | 原因 | 影响 |
| --- | --- | --- | --- |
| 1 | 真实 UI 呈现（toast 是否可见、关闭插件后表单实际变化） | 需启动应用（任务禁止） | RV1-002、BH-009/010 的用户可见效果只有 store 级证据 |
| 2 | 真实 43k 物品 + 真实插件通配的**语料构建**耗时 | 需真实索引；本轮只改了"何时构建"，未改匹配算法 | RV1-008 的结论基于"matcher 只在构建期调用"的静态事实 + 既有 41k 查询期性能测试 |
| 3 | 插件开关后到下一次扫描之间的**用户可见延迟**（语料仍持旧掩码） | 属既有设计（`itemIndex.ts` 注释：语料只在索引替换时重建） | 已在 RV1-004 的用例 3 把该语义固定为可执行契约；未擅自改成即时重建 |
| 4 | 写盘失败的**真实**成因（只读 userData、磁盘满、杀软锁） | 需构造系统级故障 | 用"目标为目录"等价触发 `writeJson` 失败，覆盖了回滚逻辑本身 |
| 5 | acorn tokenizer 对极端钩子语法的行为（可选链、top-level await、装饰器） | 需逐个构造；已有 `catch` 回退字符扫描 | 回退路径有"语法非法不抛错"用例；未穷举合法但生僻的语法 |
| 6 | 换整合包后 `preview.loadSchema` 仍可能读旧注册表 | 该路径要求下一次 `schema:*` 才重建（既有行为） | 已在 `preview.ts` 注释中写明；未纳入本轮修复范围（不在 RV1 编号内） |
| 7 | `cacheHit` 运行时值 | 需真实扫描 | 仍为**未测量**，本轮未把其当缺陷 |

---

## 6. 断言质量自评（针对本轮新增 28 例）

| 检查项 | 结论 |
| --- | --- |
| 是否只验证 mock 调用 | **否**。RV1-001 用真实文件系统；RV1-002/003 用真实 loader + 真实插件文件 + 真实 registry；RV1-004 真实构建语料并查询；BH-014 真实改写文件。仅 `benchSchemaFailure` 沿用既有 `window.studio` stub（渲染层唯一入口，合理） |
| 是否直断言最终状态 | **是**。`pinnedIds()` / `getSchema()` / `getSchema(TYPE)===null` / `corpus.search().hits[].item.id` / `selectSchema().source` / `getPluginSchemaOverrides()[0].displayName` |
| 是否覆盖失败路径 | **是**。RV1-001 的写盘失败、RV1-003 的 provider 抛错、RV1-005 的非法语法回退、BH-014 的文件删除 |
| 是否覆盖并发 | 本轮**未新增**并发用例；BH-002 的并发覆盖在 `schemaPin.test.ts`（上一轮，本轮复跑通过） |
| 是否存在"通过但实现仍错"的风险 | 中低。RV1-004 的用例 2 直接走 `corpus.search`，能抓住"matcher 没接进语料"这类问题；但**语料不在插件开关时重建**这一点是设计语义，测试按现状固定，未验证"用户期望即时生效"是否成立 |

---

## 7. 本轮**未**执行但可能需要的验证（未做，明确列出）

| 验证 | 前置条件 |
| --- | --- |
| 真机：设置页关闭插件 → 立即打开该类型配方，确认走通用模式 | 启动应用 + 真实整合包 + 带 recipeTypes 的插件 |
| 真机：钉住时把 `customRecipeTypes.json` 设为只读，确认 UI 报错且重启后状态不变 | 启动应用 + 文件权限操作 |
| 真机：43k 物品下语料构建耗时对比（含 50 条通配） | 真实整合包 |
| 真机：改插件文件后不重启，确认 `plugins:list` 反映新内容 | 启动应用 + 编辑插件 |
