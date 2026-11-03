# 外部缺陷编号逐条复核矩阵（BUG-HUNT CLOSURE MATRIX）

> **任务**：T-09｜**批次**：第 04 批｜**时间**：2026-11-02 01:00
> **依据**：`PROJECT-MASTER-PLAN-V1.1.md` §5 T-09
> **范围**：**34 个缺陷编号**（BH 14 + BH2 7 + RV1 9 + REM 4）
> **方法**：只读。以「报告自述 + 当前源码定向核对（grep/读文件）」两源交叉；**不运行任何测试**。
> **纪律**：
> - 历史测试输出缺失时**不重建**，也不把新结果冒充历史；
> - 无法确认者一律标 `待核实`，**不得**判为已解决；
> - "代码中存在修复痕迹" ≠ "行为已验证"（三层证据口径）。

---

## 0. 统计（从逐行表重算）

| 状态 | 数量 | 编号 |
|---|---|---|
| **已修（代码证据可确认）** | **20** | BH-001～009、BH-011、BH-012、BH-014、BH2-001、RV1-001、RV1-002、RV1-003、RV1-007、RV1-009、REM-01、REM-02 |
| **部分确认** | **2** | BH-010、RV1-004 |
| **非缺陷 / 已排除** | **5** | BH2-002（更正项）、BH2-006、BH2-007、REM-03、REM-04 |
| **未修（已知遗留，有任务）** | **3** | BH-013（P-01）、BH2-003（P-02）、BH2-005（P-03） |
| **待核实** | **4** | BH2-004、RV1-005、RV1-006、RV1-008 |
| **合计** | **34** | 20+2+5+3+4 = 34 ✓ |

> **"已修（代码证据可确认）"的含义**：源码中**存在**对应修复结构，且报告声称有测试；**不等于**本轮复跑过测试。
> 三层证据仍为 ①✅ / ②历史 / ③未做。

---

## 1. BH 系列（14 条）｜来源：`BUG-HUNT-01-FINDINGS.md`

| 编号 | 原始描述 | 当前可取得证据 | 重复? | 源码可确认? | FIX 记录 | 状态 | 后续任务 / 授权 |
|---|---|---|---|---|---|---|---|
| **BH-001** | `schema:pin` 丢弃调用方提交的 schema，实际钉住注册表当前版本 | `registry.ts:371-376` `pinSchema(schema)` 用入参 `...schema` 而非重取；REPAIR-REPORT §7「落盘==提交」通过 | 否（`P0-R2` 是校验深度，本条是"校验后丢弃"） | ✅ 已接入 | RV1-001 同区 | **已修** | 无（T-20 引用） |
| **BH-002** | `ensureSchemas` 并发短路返回未就绪表，`null` 被永久缓存 | `service.ts:123-151`（`inflight` 共享 + **只在组装后** `writeSnapshotStamp`）；FIX-03 又加条件写戳 | 否 | ✅ | RV1-002 | **已修** | 无 |
| **BH-003** | 插件 `virtualItemPatterns` 无效（`matchesVirtualItem` 死代码） | `loader.ts` `setPluginVirtualMatchers`（`:463`）；扫描期用 `isVirtualByNamingRules`（`itemRules.ts:203`、`probeImport.ts:158`） | 否 | ✅ | RV1-004 相关 | **已修** | 无 |
| **BH-004** | 插件覆盖层被 `clearSchemas()` 清空且无恢复路径 | `loader.ts:463` `setLayerProvider('plugin', currentPluginOverrides)`；`service.ts:137-138` 每次重建重新装配 | **同根因于台账 `P0-PL1`** | ✅ | BH2-001 并入 | **已修** | 无（P0-PL1 措辞见勘误 G-06） |
| **BH-005** | `plugins:setEnabled` 不同步注册表，关闭后类型仍生效 | `loader.ts:374-381` `setEnabled` → `syncPluginLayer()`（含 `refreshEffective`） | **同根因于 `P0-PL1`** | ✅ | RV1-002 | **已修** | 无 |
| **BH-006** | `augment()` 全降级时回退完整 `slots`，字段重复出现 | `registry.ts:221-230` 注释明确"不再用 `keptSlots.length>0 ? keptSlots : slots` 兜底" | 否 | ✅ | BH2-002 更正 | **已修** | 无 |
| **BH-007** | `augment()` 对 `zone:'extra'` 槽位重复降级（`demoted` 双推） | `registry.ts:247-254` `demotedKeys` 去重 | 否 | ✅ | 同上 | **已修** | 无 |
| **BH-008** | 钩子沙箱黑名单匹配原始源码（含注释/字符串），合法钩子误拒 | `hookSandbox.ts:16,157-193` 主路径改为 **acorn tokenizer** | 否 | ✅ | — | **已修** | 无 |
| **BH-009** | `ensureSchema` 把 IPC 失败当作"未知类型"缓存为 `null` | `benchUiStore.ts:134-138` 注释与实现区分"失败"与"确实没有" | 否（放大 BH-002） | ✅ | — | **已修** | 无 |
| **BH-010** | `pinCurrent`/`unpinCurrent` 失败时静默无反馈 | `benchUiStore.ts:212-215` unpin false → toast「当前并未钉住」；pin 失败路径未逐行读 | 否 | **部分** | — | **部分确认** | 补留 pin 失败路径核对（T-10） |
| **BH-011** | `schema` 核心合并逻辑无直接单测 | `tests/main/schemaMerge.test.ts`、`schemaMergeContract.test.ts` 存在 | 否 | ✅（文件存在） | — | **已修** | 无 |
| **BH-012** | `schema:pin` 无"内容==提交"断言 | `tests/main/schemaPin.test.ts` 6 例存在 | 否 | ✅（文件存在） | — | **已修** | 无 |
| **BH-013** | 插件 `recipeTypes`/`virtualItemPatterns` 无数量上限 | `manifest.ts` 未见任何 `MAX_/LIMIT` 常量（grep 无命中） | 否 | ✅ **缺陷仍在** | 无 | **未修**（P-01 暂缓） | 需真实插件样本定上限（D-14）；授权 A2 |
| **BH-014** | 插件清单变更不纳入缓存键，热改须重启 | `loader.ts:132-143` 签名 = `file:mtime:size`；`pluginCacheKey.test.ts` 存在 | 否 | ✅ | RV1-FIX 表列入 | **已修** | 无 |

---

## 2. BH2 系列（7 条）｜来源：`BUG-HUNT-02-FINDINGS.md`

| 编号 | 原始描述 | 当前可取得证据 | 重复? | 源码可确认? | FIX 记录 | 状态 | 后续任务 / 授权 |
|---|---|---|---|---|---|---|---|
| **BH2-001** | 插件覆盖层「异步 upsert + 紧随 clearSchemas」→ 类型从未可靠出现 | 见 BH-004（`setLayerProvider` + 重建时重新装配） | **并入 BH-004** | ✅ | 是 | **已修** | 无 |
| **BH2-002** | 对 BH-006 影响的**更正**（不是重复渲染，而是降级失效 + `required` 残留） | 见 BH-006；`registry.ts` 全降级为合法结果 | **并入 BH-006** | ✅ | 是 | **非独立缺陷** | 无 |
| **BH2-003** | `looksBlockstate` 把 `{id,count}` 误判为方块状态 | 报告定位 `primitives.ts`；本轮**未读该函数** | 否 | **未核实** | 无 | **未修**（P-02 暂缓） | 需真实样本占比（D-14）；A2 |
| **BH2-004** | `kindForField` 缺 `'list'` 分支，嵌套数组落到兜底 | **源码已有 `'list'`**：`primitives.ts:19`（`PrimitiveKind` 含 `'list'`）、`:129` `if (field.isArray) return 'list'`；但报告链三处结论不一致：CLOSURE「不构成缺陷」/REPAIR-REPORT「已知限制」/REPAIR-PLAN「需 UI 支持」 | 否 | **矛盾**（见 §5-D-21） | 无 | **待核实** | 先判定三份报告孰对（A1，只读） |
| **BH2-005** | `siblingHasQuantShape` 把任意字符串当数量 | 未读该函数 | 否 | **未核实** | 无 | **未修**（P-03 暂缓） | 需真实数据（D-14）；A2 |
| **BH2-006** | `planLevelMerge.absorbsWholeLevel` 用未过滤兄弟集 | 报告判定**已排除**（保守实现，无实际影响） | — | 未核实 | — | **非缺陷（待复核）** | T-10 可选复核 |
| **BH2-007** | `registry.upsert` 修复后无调用方 | 报告判定**已排除**；本轮 grep 确认 `upsert` 无生产调用点 | 否 | ✅（无调用方） | — | **非缺陷** | 无 |

---

## 3. RV1 系列（9 条）｜来源：`BUG-HUNT-02-RV1-INDEPENDENT-REVIEW.md`

| 编号 | 原始描述 | 当前可取得证据 | 重复? | 源码可确认? | FIX 记录 | 状态 | 后续任务 / 授权 |
|---|---|---|---|---|---|---|---|
| **RV1-001** | 钉住写盘失败时内存已变更且不回滚 | `registry.ts:371-387` 写盘失败 `catch` 中恢复 `prevPinned`/`prevEffective` 再抛 | 与 BH-001 同区但**不同缺陷** | ✅ | RV1-FIX | **已修** | 无 |
| **RV1-002** | 插件开关后 `effective` 未重建，两入口直读注册表 | `registry.ts:146-148` `refreshEffective()`；`loader.ts:374-381` 开关即调用；`applyMerge` 开头 `effective.clear()` | 否 | ✅ | RV1-FIX | **已修** | 无 |
| **RV1-003** | provider 抛错时 `replaceLayer([])` 清空正常插件层 | `registry.ts:114-124` `fetchLayer` 返回 `{ok:false}`；`service.ts:134,138` 用 `prevPluginLayer` 兜底；FIX-02 另加"非抛出失败"保护 | 否（与 FIX-02 互补） | ✅ | RV1-FIX + FIX-02 | **已修** | 无 |
| **RV1-004** | BH-003 的用户可见效果未被测试覆盖（语料掩码构建期固化） | `itemIndex.ts` `corpusVersion` 惰性重建；`loader.ts` `invalidateVirtualMatchers` bump 版本；`corpusRefresh.test.ts` 存在 | 与 BH-003 相关 | **部分**（有实现+测试文件，未跑） | REM-02 | **部分确认** | T-10 核对该测试是否覆盖"开关后查询" |
| **RV1-005** | `stripLiteralsAndComments` 不识别正则字面量，`/[/*]/` 吞代码 | 主路径已改 acorn（`hookSandbox.ts:157-193`）；**字符扫描仍作语法非法时的回退**（`:190-193`） | 与 BH-008 同区 | **部分**（主路径规避，回退路径未量化） | 部分 | **待核实** | 需构造 `/[/*]/` 回退用例（A2/A3） |
| **RV1-006** | 嵌套模板 `` `a${`b}${c}`}` `` 的 `}` 误判为插值结束 | 同 RV1-005，acorn 主路径不涉及字符扫描 | 同上 | **部分** | 部分 | **待核实** | 同上 |
| **RV1-007** | `skeleton.extraFields` 与 `slots` 同 key 时 extraFields 出现两份 | `registry.ts:247-254` `demotedKeys` 去重 | 与 BH-007 相邻 | ✅ | RV1-FIX | **已修** | 无 |
| **RV1-008** | `virtualMatcherList()` 为 O(物品×通配)，数百通配 × 43k 物品开销未测 | 未见索引化实现 | 否 | **未测** | 无 | **待核实**（性能） | RT-08（D-13 阈值）；A4 |
| **RV1-009** | `codegen/preview.ts:65` 注释"唯一调用点"已不准确 | `preview.ts:65-70` 注释已改为描述 `schemaById` | 否 | ✅ | RV1-FIX | **已修** | 无 |

---

## 4. REM 系列（4 条）｜来源：`BUG-HUNT-03-FIX-REPORT.md`

| 编号 | 原始描述 | 当前可取得证据 | 重复? | 源码可确认? | FIX 记录 | 状态 | 后续任务 / 授权 |
|---|---|---|---|---|---|---|---|
| **REM-01** | 换包后 preview 读旧注册表（同步直读） | `preview.ts:76-78` 走 `schemaById`；`recipeHandlers.ts:36,49` `await ensureSchemas()`；哈希 `0ba2a034…`/`73adb328…` 与报告一致 | 否 | ✅ | 是（BUG-HUNT-03） | **已修** | ③ 层验证 → T-13.2（A4） |
| **REM-02** | 插件开关不重建语料 | `search.ts` 版本号 API；`itemIndex.ts:36-44` 惰性重建；哈希 `20f1aeb3…`/`0ef4b643…` 一致 | 否 | ✅ | 是 | **已修** | ③ 层 → T-13.2 |
| **REM-03** | 重复调用 `applyMerge` | 报告判定**契约已固化**（无代码改动），`schemaMergeContract.test.ts` 存在 | 否 | 部分（未复跑） | — | **非缺陷** | 注意：FIX-01/03 后**仍可能 2 条日志**（勘误 C-08） |
| **REM-04** | 外部可能持有旧引用 | 报告判定边界已固化（`allSchemas()` 快照 vs `getSchema()` 当前） | 否 | 部分 | — | **非缺陷** | 无 |

---

## 5. 本轮新增发现

| 编号 | 内容 | 证据 | 影响 |
|---|---|---|---|
| **D-21（文档矛盾）** | **BH2-004 的三处结论互相冲突**：CLOSURE-AUDIT 判「不构成缺陷」（理由：`FieldKind` 无 `'list'`）；REPAIR-REPORT 判「已知限制」；REPAIR-PLAN 判「需 UI 先支持」；而**当前 `primitives.ts` 已有 `'list'`**（`:19`、`:129`） | `BUG-HUNT-01-02-CLOSURE-AUDIT.md:100`、`BUG-HUNT-02-REPAIR-REPORT.md:180`、`BUG-HUNT-02-REPAIR-PLAN.md:166`、`primitives.ts:19,129` | BH2-004 无法定状态；可能是"曾被修过但报告未更新"，也可能是"`PrimitiveKind` 的 `'list'` 不是 `FieldKind` 的 `'list'`"——**需读 `FieldKind` 定义后判定** |
| **D-22（任务缺口）** | **BH2-006 的"已排除"仅有报告声明，本轮未复核**；若日后需要，无对应任务 | `BUG-HUNT-02-FINDINGS.md:96` | 低（已排除项），建议并入 T-10 |

---

## 6. 未关闭问题清单（3 条 + 4 条待核实）

### 6.1 确认未修（有对应暂缓任务）

| 编号 | 问题 | 暂缓依据 | 解锁条件 |
|---|---|---|---|
| BH-013 | 插件声明数量无上限 | P-01「需真实插件包的数量分布」 | D-14（可否用构造数据）+ A2 |
| BH2-003 | `{id,count}` 被误判为 blockstate | P-02「需真实样本形态占比」 | D-14 + A2 |
| BH2-005 | 数量侧接受任意字符串 | P-03「是否存在 `"1x"` 写法」 | D-14 + A2 |

### 6.2 待核实（4 条）

| 编号 | 待核实什么 | 用什么核实 | 授权 |
|---|---|---|---|
| BH2-004 | 三份报告谁对；`FieldKind` 是否含 `'list'` | 只读 `shared/types` 的 `FieldKind` + `kindForField` 调用链 | A0/A1 |
| RV1-005 | 字符扫描回退路径是否仍会被 `/[/*]/` 吞代码 | 构造用例（A3）或纯静态推演 | A2/A3 |
| RV1-006 | 嵌套模板回退路径 | 同上 | A2/A3 |
| RV1-008 | O(物品×通配) 实测开销 | RT-08 真机（A4） | A4 |

---

## 7. 哪些工作已具备进入维修阶段的条件

| 条件 | 已满足的项 | 说明 |
|---|---|---|
| **可立即开工（A0/A1，不需授权）** | BH2-004 的判定（读 `FieldKind`）、BH2-006 复核、RV1-005/006 静态推演 | 纯只读 |
| **可进入维修（需 A2）** | BH-010 的 pin 失败提示补齐（小改） | 已有部分实现，属补全 |
| **需先决策再维修** | BH-013 / BH2-003 / BH2-005 | 依赖 D-14（测试数据）与真实样本 |
| **需真机（A4）** | RV1-008 | 性能测量 |
| **已闭合、无需维修** | 20 条已修 + 5 条非缺陷 | 仅需 T-20 引用 |

> **不得**把上表"可进入维修"理解为"已修"。

---

## 8. 引用纪律

1. 本矩阵中的"已修"**只表示源码存在修复结构 + 报告称有测试**，不代表本轮验证过。
2. 任何对外表述引用本矩阵时，必须连同 §0 的统计口径一起引用。
3. 若后续 T-10/T-13 推翻了本矩阵的任一判定，**不修改本文件**，另立勘误（延用 C-xx 体系）。
