# BUG-HUNT-02 · 缺陷挖掘与去重（FINDINGS）

> **工程**：`E:\mc kjs`｜**基线**：台账 v9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，**全程未修改**）
> **执行时间**：2026-11-01 08:54–09:06
> **本轮允许的写操作**：项目源码与测试（经确认的缺陷修复）；**未**构建、**未**安装、**未**启动应用、**未**改台账、**未**触碰生产 userData / 构建产物 / 隔离区 / npm 缓存。
> **编号规则**：BUG-HUNT-01 的 `BH-xxx` 保持原义不变；本轮新发现使用 `BH2-xxx`，**不复用旧编号**。

---

## 1. 本轮挖掘范围与结果概览

本轮按任务书优先级读了 BUG-HUNT-01 明确列为未深入的区域：

| 区域 | 读了什么 | 结果 |
| --- | --- | --- |
| A. Schema 剩余 | `infer.ts`(299 行) 全文、`primitives.ts`(285 行) 全文；`registryOptions`/`naming`/`classParser` 仅按需检索 | **未发现新的 A 类缺陷**；产出 2 项 D 类待验证风险（BH2-003/BH2-004） |
| B. 插件剩余 | `loader.ts` 全文重读并沿 BH-003/004/005/006 链路追调用方；`manifest.ts` 校验分支 | **发现 BH2-001**（BH-004 的更严重事实：插件类型**从未**可靠出现） |
| C. Renderer | `benchUiStore.ts`、`api.ts`、`fieldModel.ts` 关键段 | **确认 BH-009/BH-010**，并**更正 BH-006 的影响描述**（BH2-002） |
| D. Scanner/Codegen/Recipes | `itemRules.ts`、`probeImport.ts` 的虚拟物品判定入口 | 因 BH-003 需改这两处，顺带核对；**未发现新缺陷** |
| E. 测试 | 新增 6 个针对性测试文件（48 用例），并跑完整套件 | 补齐 BH-011/BH-012 缺口 |
| F. 跨模块 | 8 条链路重新追踪（见 §3） | 见 §3 |

**新增编号 7 项**：BH2-001（A）、BH2-002（更正）、BH2-003～005（D）、BH2-006～007（**已排除**）。

---

## 2. 新发现明细

### BH2-001 · 插件覆盖层「异步 upsert + 紧随 clearSchemas」导致类型从未可靠出现

| 项 | 内容 |
| --- | --- |
| **状态** | **A（已确认 Bug）** —— 已由测试 `tests/main/pluginRegistrySync.test.ts` 第一条用例在修复前稳定复现 |
| **严重程度** | **P1** |
| **与旧问题关系** | **深化 BH-004**（同根因，BH-004 只描述了「扫描后消失」，实际更严重）。**已合并进 BH-004 的修复**，不单独计数 |
| **错误行为** | 装好插件后，`schema:list` 里**从来没有**出现过插件声明的类型——不是"过一会儿消失"，而是"根本进不来" |
| **触发条件** | 任意插件 + 任意一次 `schema:*` 调用。无条件复现 |
| **源码与行号（修复前）** | `loader.ts:213` `void pushToRegistry(resolvePluginOverrides(schemaRecords(usable)).schemas)`；`service.ts:100` `clearSchemas()`；`loader.ts:288-300` `pushToRegistry` 内部 `await import(REGISTRY_MODULE)` |
| **调用链与根因** | `plugins:list` → `loadPlugins` → 同步返回后 **fire-and-forget** `pushToRegistry`（内部先 `await import(...)`，必然让出）→ 此时任何 `schema:*` 调用进入 `ensureSchemas` → `clearSchemas()` 清空**所有**层（含刚被 upsert 的 plugin 层）→ 只重装 builtin + pinned → `applyMerge`。等 `pushToRegistry` 的 `upsert` 真正执行时，`effective` 已被重建，且下一次 `ensureSchemas` 命中快照戳不再重装 → 插件层永久为空。<br>根因与 BH-004 相同：**注册表没有「按层装配」的机制，插件层只能靠一次性 side effect** |
| **用户影响** | 插件作者写的配方类型在正常工作流中完全不可用；`plugins:list` 仍显示 `status: loaded` + `coveredTypes`，UI 自相矛盾 |
| **影响用户数据** | 否 |
| **影响核心功能** | 是（配方类型枚举 = 工作台可用类型） |
| **测试与覆盖** | 修复前 `tests/plugins/loader.test.ts` 全部直接调 `getPluginSchemaOverrides()`，**绕过注册表**，因此从未发现。本轮新增 `pluginRegistrySync.test.ts` 6 例锁死 |
| **推荐修复** | 见 REPAIR-PLAN 批次 1 |
| **验收标准** | ① 装插件后 `schema:list` 立即含该类型；② 强制重建后仍含；③ 连续两次重建后仍含；④ 关闭后立即不含；⑤ 重新启用后恢复 |
| **关联** | BH-004、BH-005（同一同步机制） |

### BH2-002 · 对 BH-006 影响的**更正**：不是「重复渲染」，而是「降级失效 + required 残留 true」

| 项 | 内容 |
| --- | --- |
| **状态** | **更正（不是新缺陷）** —— 缺陷本身仍是 BH-006，此处修正 BUG-HUNT-01 对其影响的描述 |
| **BUG-HUNT-01 原表述** | "同一字段在表单里被渲染两次（一次普通区、一次高级区），`required` 语义冲突" |
| **实际行为** | `fieldModel.declaredFields()`（`fieldModel.ts:52-64`）已用 `seen` 集合**按 key 去重**，顺序是 `[...slots, ...outputs, ...extraFields]`，因此 `slots` 里的那份（`required:true`）胜出，`extraFields` 里的降级副本被丢弃 |
| **真实危害** | ① **降级完全失效**：本包一个样本都没有的字段，仍然以 `required:true` 强制用户填写；② `capabilityNote` 写"N 个字段未在本包出现已降级"，与实际（仍在普通区、仍必填）矛盾；③ 任何**不去重**的消费方（如直接遍历 `schema.slots` + `extraFields` 的代码）会重复处理 |
| **严重程度修正** | 维持 **P2**（不是 P3：用户被要求填写本包根本不存在的必填字段，属功能正确性问题） |
| **验收标准** | 已被 `tests/main/schemaMerge.test.ts` 的「BH-006：被降级的字段 required 必须为 false」用例锁定 |
| **关联** | BH-006（缺陷本体）、BH2-006（相关评估） |

### BH2-003 · `looksBlockstate` 把 `{id, count}` 误判为方块状态

| 项 | 内容 |
| --- | --- |
| **状态** | **D（待验证风险）** |
| **严重程度** | P3（未修复；需真实样本确认影响面） |
| **源码与行号** | `primitives.ts:89-100`：`if (typeof obj.id === 'string' && ID_LIKE.test(obj.id))` 后，对任意**字符串或数字**属性都返回 `true` |
| **问题** | `{ "id": "minecraft:stone", "count": 3 }` 会命中 `looksBlockstate` → `classifyPrimitive` 判为 `blockstate` → `kindForField` 返回 `'blockstate'` → `structuralChildren` 把 `count` 当方块属性渲染 |
| **为何不直接改** | 真实方块状态正是 `{"id":"minecraft:oak_stairs","facing":"north"}` 形态——**字符串属性也是合法属性**。在不引入模组知识的前提下，`{id,count}` 与 `{id,facing}` **结构上不可区分**。任何收紧都会误伤真方块状态 |
| **需要的验证** | 采一份真实整合包，统计"同时存在 `{id,<标量>}` 形态的 item 与 blockstate"的样本；若 item 形态常见且数量属性名为 `count`/`Count`，可在 `looksBlockstate` 里把 `count`/`Count`/`amount` 排除出"属性"（风险较低的特例） |
| **关联** | BH-006/007 同属 `augment`/字段模型族，但**不同缺陷** |

### BH2-004 · `kindForField` 缺 `'list'` 分支，嵌套数组元素落到兜底

| 项 | 内容 |
| --- | --- |
| **状态** | **D（待验证风险）** |
| **严重程度** | P3 |
| **源码与行号** | `primitives.ts:129` `if (field.isArray) return 'list'`；`infer.ts:117-134` `kindForField` 只处理 `nested/blockstate/nbt/reference/reference_amount/struct`，**没有 `'list'`** |
| **问题** | 元素本身是数组时（如 `[[1,2],[3,4]]`），`levelOf(f)` 的 `isArray` 为 true → `classifyPrimitive` 返回 `'list'` → `kindForField` 落到 `shapeCounts` 兜底，可能返回 `'unknown'` 或 `'struct'`，与实际"二维数组"不符 |
| **为何不改** | `'list'` 不是 `FieldKind` 的成员（11 种里没有 list），无法直接映射；正确做法需要 UI 支持嵌套数组编辑，属产品范围 |
| **需要的验证** | 找出真实存在二维数组字段的配方类型，看当前渲染是否可接受 |
| **关联** | BH-011（schema 推断测试缺口） |

### BH2-005 · `siblingHasQuantShape` 把任意字符串当作数量

| 项 | 内容 |
| --- | --- |
| **状态** | **D（待验证风险）** |
| **严重程度** | P3 |
| **源码与行号** | `primitives.ts:241-248`：`numeric = number + string`；`if (quant !== 'chance') return true` |
| **问题** | `{ item: 'x', count: 'abc' }` 也会通过配对合并 → `count` 被吸收成数量角标，UI 用数字框编辑，写回时类型从字符串变数字 |
| **为何不改** | 模组确实存在 `"0.07"` 这类字符串数值（代码注释已举 IP 蒸馏塔为例）；收紧到"字符串必须可转数字"会误伤。**但 `chance` 分支已经做了这个判断，`count`/`amount` 没做**——这处不对称值得后续统一 |
| **需要的验证** | 统计真实样本中 `count`/`amount` 为非数字字符串的比例 |
| **关联** | BH-006/007（`augment` 族） |

### BH2-006 · **已排除**：`planLevelMerge` 的 `absorbsWholeLevel` 用未过滤的兄弟集

| 项 | 内容 |
| --- | --- |
| **状态** | **已排除（非缺陷）** |
| **评估过程** | `planLevelMerge` 在 10% 出现率过滤**之前**计算 `siblings.length === 2`，因此一个稀有第三字段会阻止整层塌缩 |
| **排除理由** | 方向是**保守**的：宁可少合并（多出一个独立数字框），也不误合并（把两个不相关字段绑在一起）。少合并不会产生错误数据，只影响表单美观 |
| **备注** | 若后续想让稀有字段也参与塌缩，需先确认"塌缩后再降级"的语义，属设计改进不是缺陷 |

### BH2-007 · **已排除**：`registry.upsert` 修复后无调用方

| 项 | 内容 |
| --- | --- |
| **状态** | **已排除（保留 API）** |
| **说明** | 修复 BH-004 后，`loader` 改用 `replaceLayer`，`upsert` 不再被生产代码调用 |
| **排除理由** | `upsert` 是注册表的合法公开能力（供未来"单条热更新"使用），且 `lint`/`typecheck` 均通过。删除属无收益的 API 破坏，**保留** |
| **备注** | 已在 `registry.ts` 注释里说明 `replaceLayer` 才是层同步的正确入口 |

---

## 3. 跨模块链路追踪（8 条）

| # | 链路 | 结果 |
| --- | --- | --- |
| 1 | Renderer `pinCurrent` → `schema:pin` → `assertPinnable` → `togglePin` → `pinSchema` → `persistPinned` → `customRecipeTypes.json` | **BH-001**（已修） |
| 2 | `SequenceEditor` N 并发 `ensureSchema` → `schema:get` → `schemaById` → `ensureSchemas` → `effective` | **BH-002**（已修） |
| 3 | `plugins:list` → `loadPlugins` → `pushToRegistry`(async) → `ensureSchemas` 的 `clearSchemas` | **BH2-001 / BH-004**（已修） |
| 4 | `plugins:setEnabled` → `setEnabled` → `userDisabled` → 注册表（**原本无连接**） | **BH-005**（已修） |
| 5 | 插件 manifest `virtualItemPatterns` → `virtualItemPatterns()` → `matchesVirtualItem`（**0 调用方**）→ `isVirtualItem` | **BH-003**（已修） |
| 6 | `applyMerge` → `augment` → `keep`×2 / `demoted` → `extraFields` → `declaredFields` 去重 | **BH-006/BH-007**（已修）+ **BH2-002** 更正 |
| 7 | 扫描 → `itemRules`/`probeImport` → `isVirtualItem` → `items.json.virtual` | 因 BH-003 拆分「仅命名规则」，**未引入回归**（完整套件验证） |
| 8 | `hookSandbox` → `inspectHookSource` → `FORBIDDEN` → 拒绝分支 | **BH-008**（已修） |

---

## 4. 去重结果

| 分类 | 数量 | 说明 |
| --- | --- | --- |
| **原始发现编号总数** | **21** | BH-001～014（14）+ BH2-001～007（7） |
| 其中**已排除** | **2** | BH2-006、BH2-007 |
| 其中**被合并**（同根因/同缺陷） | **4** | BH-005→BH-004、BH-007→BH-006、BH2-001→BH-004、BH2-002→BH-006 |
| **去重后独立问题** | **15** | 21 − 2 − 4 = 15 |

### 4.1 15 个独立问题的构成

| 组 | 独立问题 | 状态 |
| --- | --- | --- |
| 1 | `schema:pin` 丢弃提交内容（BH-001） | 已修复 |
| 2 | `ensureSchemas` 并发短路 + null 永久缓存（BH-002） | 已修复 |
| 3 | 插件 `virtualItemPatterns` 无效（BH-003） | 已修复 |
| 4 | 插件层与注册表不同步（BH-004 + BH-005 + BH2-001） | 已修复 |
| 5 | `augment` 降级失效/字段重复（BH-006 + BH-007 + BH2-002） | 已修复 |
| 6 | 沙箱黑名单误伤注释/字符串（BH-008） | 已修复 |
| 7 | `ensureSchema` 把失败缓存为 null（BH-009） | 已修复 |
| 8 | 钉住操作失败静默（BH-010） | 已修复 |
| 9 | schema 合并核心逻辑无单测（BH-011） | **已闭合**（新增 `schemaMerge.test.ts`） |
| 10 | `schema:pin` 无落盘契约断言（BH-012） | **已闭合**（新增 `schemaPin.test.ts`） |
| 11 | manifest 无数量上限（BH-013） | 待验证（D，未修） |
| 12 | 插件缓存键无文件签名（BH-014） | 待验证（D，未修） |
| 13 | `looksBlockstate` 误判 `{id,count}`（BH2-003） | 待验证（D，未修） |
| 14 | `kindForField` 缺 `list` 分支（BH2-004） | 待验证（D，未修） |
| 15 | 数量侧接受任意字符串（BH2-005） | 待验证（D，未修） |

**统计**：已修复 **8** 个独立问题（覆盖 12 个原始编号）｜测试缺口已闭合 **2** ｜待验证未修 **5** ｜已排除 **2**（不计入）｜**合计 15**。

---

## 5. 原始（未去重）状态分布

| 状态 | 数量 | 编号 |
| --- | --- | --- |
| **A 已确认 Bug** | **7** | BH-001、BH-002、BH-003、BH-004、BH-005、BH-006、BH2-001 |
| **B 高度疑似** | **4** | BH-007、BH-008、BH-009、BH-010 |
| **C 测试缺口** | **2** | BH-011、BH-012 |
| **D 待验证风险** | **5** | BH-013、BH-014、BH2-003、BH2-004、BH2-005 |
| **已排除** | **2** | BH2-006、BH2-007 |
| **更正（非缺陷）** | **1** | BH2-002 |
| **合计** | **21** | 7+4+2+5+2+1 = 21 ✓ |

> **B 类为何在修复后仍记为 B**：BH-007/008/009/010 在修复前是"有证据但缺关键验证"。本轮**已为每一项补上针对性测试**（见 REPAIR-REPORT），修复后的行为已由测试锁定；但按任务书「不得把未经运行验证的静态推断升级为 A」的纪律，**原始状态标签保持不动**，验证结果单独记录在 REPAIR-REPORT 的验收列。

---

## 6. 本轮明确**没有**得出的结论

| 容易误读 | 事实 |
| --- | --- |
| "Schema 推断/原语模块检查完毕、无问题" | **否**。`infer.ts`/`primitives.ts` 读完了，未发现 A 类；但 `naming.ts`(287)、`registryOptions.ts`(164)、`classParser.ts`(450) **仍未逐行读**，`classParser` 的异常输入路径完全未验证 |
| "Renderer 检查完毕" | **否**。只读了 `benchUiStore`/`api`/`fieldModel`；`benchStore`(460)、`commitBridge`、`Sidebar`(447)、`DetailPanel`(376) 等仍未逐行读 |
| "测试缺口只有 2 个" | **否**。本轮只补了「schema 合并」「pin 契约」两处；其余 60 个测试文件的断言体仍未逐条审 |
| "cacheHit 是缓存 Bug" | **否**。`cacheHit` 仍为**未测量**；本轮未扫描、未测试运行时缓存命中 |
| "BH-006 会重复渲染" | **否**。UI 侧 `declaredFields` 已去重；真实危害是"降级失效 + required 残留"，见 BH2-002 |
