# BUG-HUNT-01/02 缺陷闭环只读核对报告

> **工程**：`E:\mc kjs`｜**核对时间**：2026-11-01 15:07–15:25
> **性质**：**严格只读**。本轮未修改任何源码 / 测试 / 配置 / 现有报告 / 正式台账；未构建、未安装、未启动应用；未运行测试、typecheck、lint；未触碰生产 userData / `dist` / `dist-011` / 隔离区 / npm cache；未安装依赖；未格式化或脚本改写文件。
> **唯一写入**：本报告。

---

## A. 总体结论

# **基本闭环，但仍有明确遗留项**

**支持"闭环"的证据**（本轮独立核对，非继承结论）：

- 12 份必需文件**全部存在且完整**（字节数与行数见 §A.1），无缺失、无截断。
- **30 个编号无缺号、无重号**：BH-001～014（14）+ BH2-001～007（7）+ RV1-001～009（9）。
- 报告中声称的**关键实现全部真实存在于当前源码**（`effective.clear()`、`refreshEffective`、`setFactsProvider`、`fetchLayer`、`snapshotLayer`、`pluginFilesSignature`、`stripWithTokenizer`、`prevPinned` 逐一 grep 命中）。
- 报告中声称**已删除的死代码确实已不存在**（`providedSchemas` / `pushToRegistry` / `REGISTRY_MODULE` 均 0 命中）。
- 6 个关键测试文件的**用例数与报告逐一吻合**（5 / 9 / 3 / 18 / 12 / 10）。
- 抽查 11 条测试名称，**全部在测试文件中真实存在**（含含 `*` 与 `"` 的易错名称）。
- 报告**没有**出现"真实环境已验证"一类过度声称；`FIX-REMAINING` 明确写"没有任何一项达到真实环境已验证"。
- 台账 V9 **MD5 未变**（`7a7e52d9…`），第 148 行仍为 `未解决 32 + 部分 2 + 待验证 1 + 已解决 5 = 40`，**未被 BH 系列缺陷污染**。

**不能判"闭环充分"的原因**（详见 §D / §E）：

1. **测试总数对不上**：静态可复算 **699**，报告声称 **701**，**差 2 无法在只读条件下解释**（§D.2）。
2. **一处哈希未标注时点**：`FIX-REPORT` 记录的 `5e2605ef…` 是修复过程中的**中间态**，当前 `registry.ts` 已变为 `87695eb6…`，报告未说明，读者会误判为矛盾（§D.3）。
3. **三处"已修复并验证"的测试覆盖弱于声称**：BH-002 只有 handler 级并发（无 renderer 触发点）、BH-003 只有函数级（无 scanner 真实调用点）、BH-006/007 无 UI 侧断言（§C.3）。
4. **没有任何一项达到真实环境验证**（报告自认，本轮确认一致）。

### A.1 必需文件核对（12/12 存在）

| 文件 | 字节 | 行数 | 状态 |
| --- | --- | --- | --- |
| `BUG-HUNT-01-FINDINGS.md` | 48,233 | 376 | 完整 |
| `BUG-HUNT-01-SUMMARY.md` | 11,996 | 192 | 完整 |
| `BUG-HUNT-01-COVERAGE.md` | 16,172 | 199 | 完整 |
| `BUG-HUNT-02-FINDINGS.md` | 15,144 | 188 | 完整 |
| `BUG-HUNT-02-REPAIR-PLAN.md` | 13,303 | 207 | 完整 |
| `BUG-HUNT-02-REPAIR-REPORT.md` | 21,386 | 230 | 完整 |
| `BUG-HUNT-02-COVERAGE.md` | 11,367 | 146 | 完整 |
| `BUG-HUNT-02-RV1-INDEPENDENT-REVIEW.md` | 32,419 | 339 | 完整 |
| `BUG-HUNT-02-RV1-FIX-REPORT.md` | 18,554 | 199 | 完整 |
| `BUG-HUNT-02-RV1-FIX-TEST-REPORT.md` | 11,928 | 172 | 完整 |
| `BUG-HUNT-02-RV1-FIX-REMAINING.md` | 14,130 | 170 | 完整 |
| `PROJECT-SEALING-LEDGER-REPORT.md`（V9） | 90,749 | 868 | 完整，MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51` |

---

## B. BUG-HUNT-01 全量追踪表（BH-001 ～ BH-014）

> 状态列用任务书定义的 8 类编号：①已修复且有测试证据 ②已修复但覆盖不足 ③已修复未做真实环境验证 ④仍存在需继续修 ⑤暂缓 ⑥不构成缺陷 ⑦已合并（给映射）⑧已排除
> **所有 14 项均已闭环到某一状态，无遗漏、无缺号。**

| 编号 | BH-01 原始问题（原文标题） | BH-02 对应编号与结论 | RV1 复核结论 | FIX 最终状态 | 源码位置（已核对存在） | 测试文件与用例 | 真实执行证据 | 最终判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **BH-001** | `schema:pin` 丢弃调用方提交的 schema，实际钉住注册表当前版本 | 独立问题#1「已修复」 | **P2 / 已修但写盘失败路径未覆盖** | 本轮修 RV1-001 补写盘失败回滚 | `schemaHandlers.ts:54`（`togglePin(schema.id, true, schema)`）、`service.ts:178`（`override ? { ...override, id: typeId }`） | `schemaPin.test.ts` 6 例（含 `readFileSync(PIN_FILE)` 直读落盘）、`schemaPinRollback.test.ts` 5 例 | **报告声称本轮跑过；本轮只读无法独立复跑** | **①+③**：有测试证据，未做真实环境验证 |
| **BH-002** | `ensureSchemas` 并发短路返回未就绪注册表，且 `null` 被永久缓存 | 独立问题#2「已修复」 | 已确认（源码核实 in-flight + 成功后写戳） | 无新增 | `service.ts:111-135`（in-flight Promise、`writeSnapshotStamp` 在 task 末尾） | `schemaPin.test.ts` 并发 3 例（`两个并发的 schema:list` / `并发 schema:get` / `并发 list 与 coverage`） | 同上 | **②**：仅 handler 级并发；**renderer 触发点 `SequenceEditor.tsx:153` 未被覆盖** |
| **BH-003** | 插件 `virtualItemPatterns` 完全无效（`matchesVirtualItem` 是死代码） | 独立问题#3「已修复」 | **部分证实**：修复只在**语料构建期**生效 | RV1-004 补 3 例语料链路 | `shared/search.ts`（`isVirtualItem` 叠加 matcher）、`loader.ts`（注册 matcher）、`scanner/itemRules.ts` + `probeImport.ts`（改用 `isVirtualByNamingRules`） | `virtualItemPatterns.test.ts` 10 例（含 `buildSearchCorpus` + `corpus.search` 3 例） | 同上 | **②**：函数级与语料级已覆盖；**scanner 是否真的调用 `isVirtualByNamingRules` 无断言** |
| **BH-004** | 插件覆盖层被 `clearSchemas()` 清空，且无恢复路径 | 独立问题#4（BH-004+005+BH2-001）「已修复」 | 已确认修复方向正确 | RV1-003 加固 provider 失败路径 | `service.ts:122-131`（`replaceLayer('plugin', …)`、失败恢复快照） | `pluginRegistrySync.test.ts` 6 例（含连续两次重建） | 同上 | **①+③** |
| **BH-005** | `plugins:setEnabled` 不同步 schema 注册表 | 独立问题#4（同上）「已修复」 | **RV1-002 发现残留**：只改层不重建 effective | 本轮修 RV1-002 | `loader.ts` `syncPluginLayer`（`replaceLayer` + `invalidateSnapshot` + `refreshEffective`） | `pluginRegistrySync.test.ts` + `pluginSchemaFreshness.test.ts` 9 例 | 同上 | **①+③** |
| **BH-006** | `augment()` 全降级时回退到完整 `slots`，同一字段同时出现在 slots 与 extraFields | 独立问题#5（BH-006+007+BH2-002）「已修复」 | 已确认；**并更正影响描述**（不是重复渲染，是降级失效+required 残留） | RV1-007 补 extraFields 去重 | `registry.ts` `augment`（单遍 `keepZone`、删兜底、`demotedKeys`） | `schemaMerge.test.ts` 12 例（含 required 断言、`sampleCount=0` 不降级、幂等） | 同上 | **①+②（UI 侧）+③**：`declaredFields` 去重被引用为证据但**无直接断言** |
| **BH-007** | `augment()` 对 `slots` 中 `zone:'extra'` 槽位可能重复降级 | 独立问题#5（同上）「已修复」 | 已修（`demotedKeys`） | 无新增 | 同上 | `schemaMerge.test.ts` 1 例（`extra 槽位不得出现两次`） | 同上 | **①+③** |
| **BH-008** | 钩子沙箱黑名单匹配原始源码（含注释/字符串），合法钩子被误拒 | 独立问题#6「已修复」 | 已确认；**并指出正则字面量/嵌套模板绕过** | 本轮升级为 acorn tokenizer | `hookSandbox.ts`（`stripWithTokenizer` + `stripLiteralsAndComments` 回退） | `hookBlacklist.test.ts` 18 例（误伤 3 + 真实逃逸 4 + 模板/转义/未闭合 5 + 正则与嵌套模板 6） | 同上 | **①+③** |
| **BH-009** | `ensureSchema` 把 IPC 失败当作"未知类型"缓存为 `null` | 独立问题#7「已修复」 | **证据限制**：测试写在修复后，无 red 记录 | 无新增 | `benchUiStore.ts` `ensureSchema`（`callOrThrow` + 失败不写缓存） | `benchSchemaFailure.test.ts` 7 例 | 同上 | **①（含证据限制）+③** |
| **BH-010** | `pinCurrent` / `unpinCurrent` 失败时静默无反馈 | 独立问题#8「已修复」 | 同上（证据限制）；**并发现写盘失败不回滚** | 本轮随 RV1-001 补齐 | `benchUiStore.ts` `pinCurrent` / `unpinCurrent` | `benchSchemaFailure.test.ts` + `schemaPinRollback.test.ts` | 同上 | **①+③** |
| **BH-011** | `src/main/schema` 核心合并逻辑无直接单测 | 独立问题#9「已闭合」 | 已核对：`schemaMerge.test.ts` 存在 12 例 | 无新增 | — | `schemaMerge.test.ts` | 同上 | **①**（测试缺口类，已闭合） |
| **BH-012** | `schema:pin` 无"钉住内容 == 提交内容"断言 | 独立问题#10「已闭合」 | 已核对：`schemaPin.test.ts` 直读落盘文件 | 无新增 | — | `schemaPin.test.ts:92`（`readFileSync(PIN_FILE)`） | 同上 | **①** |
| **BH-013** | 插件 `recipeTypes` / `virtualItemPatterns` 无数量上限 | 独立问题#11「待验证（D，未修）」 | 维持：需产品决策 | **仍未修** | `plugins/manifest.ts`（各数组解析无 `length` 上限） | 无 | — | **⑤ 暂缓**（理由见 §E.1） |
| **BH-014** | 插件清单文件变更不纳入缓存键，热改必须重启 | 独立问题#12「待验证（D，未修）」 | 维持 | **本轮修复** | `loader.ts:132`（`pluginFilesSignature`）、`:230-231`（并入 key） | `pluginCacheKey.test.ts` 3 例 | 同上 | **①+③**（状态从 D 迁移为已修） |

**BH-001～014 的 8 类状态归类（主状态互斥，合计 14）**：

| 主状态 | 数量 | 编号 |
| --- | --- | --- |
| ① 已修复且有测试证据 | **11** | BH-001、004、005、006、007、008、009、010、011、012、014 |
| ② 已修复但测试覆盖不足 | **2** | BH-002（仅 handler 级并发）、BH-003（仅函数级 + 语料级，缺 scanner 调用点） |
| ⑤ 暂缓处理 | **1** | BH-013 |
| ④⑥⑦⑧ | **0** | — |
| **合计** | **14** | 11 + 2 + 1 = 14 ✓ |

**附加属性（不参与上面的互斥计数）**：

- **③ 未做真实环境验证：11 项**（BH-001～010、BH-014；BH-011/012 无运行行为、BH-013 未修）。
- **⑦ 曾并入他项：2 项**（BH-005→BH-004 簇、BH-007→BH-006 簇），但**映射后仍各自单列**，见表中独立的行。

> **BH-005 与 BH-007 虽是"合并"，但本报告仍按原编号逐项给出状态**，不因合并而丢失。任务要求的"不因编号合并而遗漏"已满足。

---

## C. BUG-HUNT-02 / RV1 追踪表

### C.1 BH2-001 ～ BH2-007

| 编号 | 问题是否真实存在（本轮核对） | 修复是否落地 | 报告路径/函数名是否准确 | 测试是否覆盖真实调用路径 | 测试结果来源 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| **BH2-001** | 是（旧 `void pushToRegistry` + `clearSchemas` 竞态；本轮确认 `pushToRegistry` 已 0 命中，即该路径已被彻底删除） | **是**（`ensureSchemas` 装配 plugin 层） | 准确 | **是**（`pluginRegistrySync` 首例"插件类型可见"直接验证结果） | 报告声称本轮跑过 | **①**，并入 #4 |
| **BH2-002** | 是（原 BH-006 影响描述不准确） | 收敛于 BH-006 | 准确（引用 `fieldModel.ts:52-64` 的 `seen` 去重） | **弱**：`declaredFields` 去重本身**无测试断言**，只被文档引用 | — | **①（文档更正）** |
| **BH2-003** | 是（源码核实 `looksBlockstate` 仍接受任意 string/number） | **否** | 准确 | 无 | — | **⑤ 暂缓** |
| **BH2-004** | **判定为不构成缺陷**（本轮独立推演：`kindForField` 落到 `'unknown'`，正是"高级 JSON 编辑"出口；`FieldKind` 无 `'list'` 成员） | 不需要 | 准确 | — | — | **⑥** |
| **BH2-005** | 是（源码核实 `siblingHasQuantShape` 的 `quant !== 'chance'` 直接 `return true`） | **否** | 准确 | 无 | — | **⑤ 暂缓** |
| **BH2-006** | 已排除（保守方向，不产生错误数据） | 不需要 | 准确 | — | — | **⑧** |
| **BH2-007** | 已排除（`upsert` 保留为公开 API） | 不需要 | 准确 | — | — | **⑧** |

### C.2 RV1-001 ～ RV1-009

| 编号 | 实现是否落地（本轮核对） | 测试覆盖 | 是否来自本轮真实执行 | 是否覆盖真实调用路径 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **RV1-001** | **是**：`registry.ts` `pinSchema`/`unpinSchema` 有 `prevPinned` / `prevEffective` 快照 + catch 回滚 | `schemaPinRollback.test.ts` 5 例（pin 失败/成功、unpin 失败/成功、未钉住 unpin） | **有真实 red 证据**（换备份版跑出 2 failed） | **是**（真实文件系统：目标设为目录触发 `writeJson` 失败） | **①+③**：测试验证 ≠ 真实环境验证（只读 userData / 磁盘满未实测） |
| **RV1-002** | **是**：`applyMerge` 开头 `effective.clear()`；`refreshEffective` + `setFactsProvider`；`syncPluginLayer` 末尾调用 | `pluginSchemaFreshness.test.ts` 9 例（含刻意**不调** `schemaSummaries` 的 3 例） | **有 red 证据**（首跑 4 failed，暴露 `applyMerge` 不清表） | **部分**：覆盖 `getSchema` / `loadSchema` / `selectSchema` 三条同步读；**真实 UI 交互序列未验证** | **①+③**；REM-01/02 仍开放 |
| **RV1-003** | **是**：`fetchLayer` 返回 `{ok:false}`；`ensureSchemas` 先 `snapshotLayer` 再 `clearSchemas`；`syncPluginLayer` try/catch | 3 例（抛错保留层 / 空数组清层 / 不抛错） | 报告声称 | **是**（直接替换 provider 注入故障） | **①** |
| **RV1-004** | 未改代码（补测试） | 3 例：`buildSearchCorpus` + `corpus.search` + `includeVirtual` 开关 + 关闭后重建 | 报告声称 | **是**（走完整语料→查询链路，而非 matcher） | **② 已补测试**；"开关后需重建语料"为既定语义 |
| **RV1-005** | **是**：`stripWithTokenizer` 用 acorn；`stripLiteralsAndComments` 带回退 | 2 例（`/[/*]/` 后仍检出 require / 正则内禁用词不误伤） | 报告声称 | 函数级 | **①**；不构成"覆盖全部 JS 语法"的保证 |
| **RV1-006** | **是**（同上） | 2 例（嵌套模板插值检出 / 插值内 `"}"` 字符串）+ 1 例非法语法回退 | 报告声称 | 函数级 | **①** |
| **RV1-007** | **是**：`augment` 末尾按 `extraKeys` 去重 | 2 例（撞名只留一份 / 普通降级仍进 extraFields） | 报告声称 | 函数级（纯函数，无 mock） | **①** |
| **RV1-008** | **不改**（评估结论：`isVirtualItem` 唯一调用点是语料构建 `search.ts:239`，不在查询热路径） | 沿用既有 `virtualFilter.test.ts` 的 41k 查询性能断言 | 历史（上一轮） | — | **⑤ 评估后不改**（非缺陷） |
| **RV1-009** | **是**：`preview.ts` 注释重写；`itemRules.ts` 注释重写（均已核对为"与实现一致"） | 无（注释无断言） | — | — | **①（仅代码）** |

### C.3 三处"覆盖弱于声称"的具体位置（本轮新发现，非产品缺陷）

| 编号 | 声称 | 实际覆盖 | 差在哪 |
| --- | --- | --- | --- |
| BH-002 | "并发初始化已修复并验证" | 3 例都在 **handler 层**（`schema:list` / `schema:get` / `schema:coverage` 并发） | BH-001 报告记载的**原始触发点**是 renderer 的 `SequenceEditor.tsx:153`（一次循环发 N 个 `ensureSchema`）。该路径**无用例**，只有等价的手工并发模拟 |
| BH-003 | "扫描期不随插件漂移" | 1 例断言 `isVirtualByNamingRules()` 返回 `false` | **没有**断言 `itemRules.ts` / `probeImport.ts` 真的调用了 `isVirtualByNamingRules`（grep 确认测试中只出现该函数名 2 次，均在 `virtualItemPatterns.test.ts`，属函数级） |
| BH-006 / BH2-002 | "UI 侧按 key 去重，不会重复渲染" | `declaredFields` 的 `seen` 去重被**文档引用** | `fieldModel.declaredFields` **无测试**（`tests/renderer/` 下无 fieldModel 相关用例）。该主张目前只有源码阅读支撑 |

> 这三条**不影响**"缺陷已修"的结论（缺陷本体是 `augment` / `ensureSchemas` / matcher 的行为，已被直接断言），但影响"验证强度"的表述。建议在后续报告里把这三项从"验证"降级为"部分验证"。

---

## D. 编号映射与统计核对

### D.1 编号映射（合并/转移）

| 原编号 | 去向 | 共同根因 | 是否仍保留原编号 |
| --- | --- | --- | --- |
| BH-005 | 并入 BH-004（插件层与注册表无同步机制） | R-A | **保留**，FIX-REPORT §4 与 REMAINING §7 均单列 |
| BH-007 | 并入 BH-006（`augment` 两遍过滤 + 共享 `demoted`） | R-D | **保留**，单列 |
| BH2-001 | 并入 BH-004 簇（异步 upsert 被 clearSchemas 抹掉） | R-A | **保留**，单列 |
| BH2-002 | 并入 BH-006（影响描述更正，非新缺陷） | R-D | **保留**，单列 |
| RV1-002-b（本轮新发现） | 并入 RV1-002（`applyMerge` 不清 `effective`） | R-D' | 已在 FIX-REPORT §3.2 与 REMAINING §5 单列 |
| RV1-009-b（本轮新发现） | 并入 RV1-009（另一处过期注释） | 文档 | 已单列 |

**核对结论**：所有"合并"都保留了原编号的独立追踪行，**不存在因合并而消失的缺陷**。

### D.2 数字核对（**发现 1 处无法对齐**）

| 数据项 | 报告声称 | 本轮静态核对 | 是否一致 |
| --- | --- | --- | --- |
| 测试文件数 | 73 | `find tests -name "*.test.ts*"` = **73** | **一致** |
| 6 个关键测试文件用例数 | 5 / 9 / 3 / 18 / 12 / 10 | 逐一 `grep -c "^\s*it("` = **5 / 9 / 3 / 18 / 12 / 10** | **一致** |
| 新增用例数 | 28（17 新增文件 + 11 追加） | 5+9+3 = 17；+6+2+3 = 11 → **28** | **一致** |
| 文件增量 | +3 | 70 → 73 | **一致** |
| **执行用例总数** | **701（697 passed + 4 skipped）** | 静态：`it()` 声明 **679** + `it.each(cases)` 展开 **15**（`loader.test.ts`）+ 循环生成 **+5**（`validate.test.ts` 的 6 文件循环，1 声明→6 实例）= **699** | **不一致，差 2** |
| 跳过数 | 4 | `it.skip` / `it.todo` 均 0；跳过来自 5 处 `describe.skipIf`（`realPack` / `preview` / `detect`×2 / `pathFix`） | 无法静态确认具体条数 |
| 30 个编号分类 | 18 / 4 / 1 / 1 / 3 / 1 / 2 = 30 | 逐项复算 = **30** | **一致** |
| BH-02 基线 | 70 文件 / 673 用例 | 与 BH-02 报告正文一致 | 一致（但与 699 的静态推算同样存在口径差，见下） |

**关于"差 2"的处理**：

- 我没有找到第 4 处动态生成（`it.each` 仅 1 处、循环包裹 `it(` 仅 1 处、`forEach` 包裹未命中）。
- **可能是我的静态正则漏计**（例如 `describe` 内用变量拼出的 `it`），也可能是报告的 701 来自运行输出而其中包含 2 个我未计入的实例。
- **本轮禁止运行测试**，因此**无法消解这 2 个的差异**。

> **结论标记**：`701` 属「**报告声称已执行，本轮只读核对无法独立确认**」。上一轮修复会话的终端输出确实打印过 `Tests 697 passed | 4 skipped (701)`，但那**不是本轮证据**，本轮**未重新运行**，也**不能**把静态推算的 699 说成"报告造假"——两者都可能有微小计数口径差。**唯一确定的结论是：该数字在当前只读条件下不可复核。**

### D.3 哈希标注核对（**发现 1 处未标注时点**）

| 报告中的哈希 | 标注情况 | 本轮实测 | 判定 |
| --- | --- | --- | --- |
| 台账 MD5 `7a7e52d9…` | 标为"未修改" | **一致** | ✅ 正确 |
| `package.json` `bad1fafd…` / lock `dc95d17f…` | 标为"未变" | **一致** | ✅ 正确 |
| 两套 `app.asar` `56c90213…` / `a8024ec7…` | 标为"未变" | **一致** | ✅ 正确 |
| `registry.ts` 的 `5e2605ef…` | FIX-REPORT §1 称"按原编辑重新应用并**校验回到修复版**" | 当前实际 = **`87695eb6…`** | ⚠️ **未标注时点**：该哈希是"RV1-001 回滚修复"完成时的**中间态**；此后又加了 `snapshotLayer` 与 `applyMerge` 清表，文件已变。**结论本身没错**（当时确实校验一致），但报告没写"这是中间态哈希"，读者对照当前文件会误判为矛盾 |

> 建议：后续报告凡记录"过程态"哈希，必须注明"该文件在此后仍有改动，最终哈希见 XXX"。

### D.4 统计口径一致性

| 口径 | 是否被混用 |
| --- | --- |
| BH 系列缺陷 vs 台账 40 条条件 | **未混用**。BH-01 SUMMARY 明确"台账仍是 40 条，计数不变"；BH-01 FINDINGS 逐项写"不与台账 40 条重复"；台账第 148 行仍为 `32+2+1+5=40` |
| 独立问题数 vs 原始编号数 | **区分清楚**。BH-02 用"15 独立问题 / 21 编号"，REMAINING 用"30 编号分类"，两者不冲突（不同层级） |
| "已修复" vs "已验证" | FIX-REMAINING 明确三态（代码已改 / 测试通过 / 真实环境已验证），并声明**只到 ①+②**；未发现把 ③ 当 ① 的说法 |
| 严重度 | BH-01 与 BH-02 对 **BH-001** 有 P2→P1 的上调，**已在 `REPAIR-PLAN §1` 写明理由**，属有据重评，非矛盾 |

---

## E. 尚未闭环的问题（按优先级）

### E.1 暂缓 / 需产品决策（3 项，理由均已记录）

| 编号 | 问题 | 暂缓理由是否明确 | 剩余风险是否记录 | 需要的决策/信息 |
| --- | --- | --- | --- | --- |
| **BH-013** | 插件 manifest 无数量上限 | **明确**（"无阈值依据，凭空硬编码会废掉大型合法插件"） | 是（P3，仅性能，无数据安全） | 需 3–5 个真实插件包的 `recipeTypes` 数量分布 |
| **BH2-003** | `{id, count}` 可能被判为 blockstate | **明确**（"`{id,facing}` 与 `{id,count}` 结构不可区分，收紧会误伤真 blockstate"） | 是（P3，`preserveUnknown` 仍保留原字段） | 需真实样本统计两种形态的占比 |
| **BH2-005** | 数量侧接受任意字符串 | **明确**（"与 `chance` 分支不对称，但统一口径会改变字段分组，属产品语义"） | 是（P3） | 需确认是否存在 `"1x"` 这类带单位写法 |

> **一处建议但未登记**：BH-013 属"需产品决策"，但**没有被登记到任何待决项清单**（BUG-HUNT-01 曾有 `D-1～D-8` 的待人工决策表）。建议后续把这 3 项并入统一的待决清单，避免"暂缓"变成"遗忘"。

### E.2 已修但覆盖弱于声称（3 项，见 §C.3）

BH-002（renderer 触发点）、BH-003（scanner 真实调用点）、BH-006/BH2-002（`declaredFields` 去重）。

### E.3 已登记但未验证的真实交互风险（4 项）

| 编号 | 风险 | 状态 |
| --- | --- | --- |
| REM-01 | 换整合包后 `preview.loadSchema` / `selectSchema` 仍可能读旧注册表（只有插件开关会立即重建） | 已登记，**未修**（注释警示） |
| REM-02 | 插件开关后语料不重建 → 虚拟物品过滤按旧规则直到下次扫描 | 已登记，**语义已用测试固定**，改动需产品决策 |
| REM-03 | `refreshEffective` 与 `ensureSchemas` 可能重复 `applyMerge` | 已登记，幂等，**不影响正确性** |
| REM-04 | `applyMerge` 清表后，若外部缓存了 `getSchema()` 返回对象引用则为旧快照 | 已登记，grep 确认 3 个调用点均即时使用 |

### E.4 真实环境验证：**0 项已完成**

所有"已验证"均指 ①+②。需要真机（启动应用 / 真实整合包 / 真实故障）才能确认的有 10 项，已在 `FIX-TEST-REPORT §7` 与 `FIX-REMAINING §9` 列出，本轮**未新增也未执行**。

---

## F. 审计覆盖盲区

### F.1 仍未完整阅读的源码（相对 BUG-HUNT-01-COVERAGE）

| 区域 | 规模 | 状态 |
| --- | --- | --- |
| `src/main/schema/classParser.ts` | 450 行 | **仍未读**（全工程最大未读单文件；异常字节码路径完全未验证） |
| `src/main/schema/naming.ts` | 287 行 | **仍未读** |
| `src/main/schema/registryOptions.ts` | 164 行 | **仍未读** |
| `src/main/plugins/manifest.ts` | 302 行 | 仅读校验分支（约 20 行 grep） |
| `src/main/plugins/merge.ts` | 206 行 | 仅读 `source:'plugin'` 与 `resolvePluginOverrides` 头部 |
| `src/main/plugins/capabilityLink.ts` | 111 行 | **仍未读** |
| `src/main/plugins/report.ts` | 138 行 | **仍未读** |
| `src/renderer/src/store/benchStore.ts` | 460 行 | **仍未读** |
| `src/renderer/src/store/commitBridge.ts` | — | 仅 grep 摘要 |
| `src/renderer/src/components/*`（14 个） | — | **仍未读** |
| `src/main/codegen/*`（除 preview/writer 片段） | — | **仍未读** |
| `src/main/scanner/*`（除 itemRules/probeImport 片段） | — | **仍未读** |

### F.2 测试断言体：约 60 个文件未逐条审

本轮只**静态核对**了用例数量与名称存在性（73 文件 / 679 声明），**未逐条判断断言是否指向正确对象**。已完整读过的测试文件：`schemaService`、`ipcWiring`、`windowGuards`、`ipcErrorFeedback`、`benchSchemaFailure`、`schemaPinRollback`、`pluginSchemaFreshness`、`pluginCacheKey`、`virtualItemPatterns`、`schemaMerge`、`hookBlacklist`、`virtualFilter`（共 12 个）。

### F.3 仅靠静态阅读判断、无运行证据的问题

- BH-002 的 renderer 触发路径（`SequenceEditor` 循环并发）——**从未被任何测试复现**。
- BH-003 的扫描期行为——只有函数级断言。
- BH-006/BH2-002 的 UI 去重——只有源码阅读。
- REM-01（换包后 preview 读旧注册表）——纯静态推断，未实测。

### F.4 修复缺少"修复前失败"证据的项目（5 项，报告已自认）

RV1-003、RV1-005、RV1-006、RV1-007、BH-014 —— 测试与修复同期完成。本轮核对了报告的披露，**披露属实**（`FIX-TEST-REPORT §4.3` 明确列出）。有 red 证据的仅 RV1-001、RV1-002。

### F.5 必须依赖真实环境的场景

真实整合包扫描、真实插件包（含 `recipeTypes` / `virtualItemPatterns` / 钩子）、真实只读 userData 或磁盘满、真实 4 万+ 物品索引、真实 UI 交互顺序。**这些场景本轮与本项目所有历史轮次均未执行**（除历史上的 PACK-* 安装验收，那与本轮缺陷无关）。

---

## G. 保护边界核对

| 边界 | 本轮是否触碰 | 核验方式 |
| --- | --- | --- |
| 正式台账 V9 | **否** | MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，与 BH-01/02/FIX 报告记录一致；第 148 行计数 `32+2+1+5=40` 未变 |
| 未生成 V10 | **是（未生成）** | `docs/` 下无 V10 文件 |
| 源码 / 测试 / 配置 | **否** | 本轮仅执行 `cat`/`grep`/`find`/`wc`/`md5sum`/`sha256sum`/`node -e`（只读统计，不写文件） |
| 现有报告 | **否** | 12 份报告字节数与行数已记录（§A.1）；本轮只新增本报告 |
| `dist/` / `dist-011/` | **否** | 两套 `app.asar` SHA-256 未变（`56c90213…` / `a8024ec7…`） |
| 生产 userData | **否** | 未访问 |
| `E:/_trash_20261101_recipe-studio` | **否** | 未访问 |
| npm cache | **否** | 未访问、未安装依赖 |
| 构建 / 安装 / 启动 / 发布 | **否** | 未执行 |
| 运行测试 / typecheck / lint | **否（本轮未运行）** | 所有测试结果均为「引用上一轮报告」，**不是本轮证据** |
| 格式化 / 自动修复 / 脚本改写 | **否** | 无写入型命令 |

> **未核验项（如实标注）**：
> - 未核验备份目录内容是否与"修复前"逐字节一致（备份是上一轮的产物，本轮只数了文件数=10）。
> - 未核验 `FIX-TEST-REPORT` 中 `5e2605ef…` 之外的其他过程态数据。
> - 未核验 `.cache/` 下其他历史证据是否被清理（本轮未清理，但也未全面盘点）。

---

## H. 本轮核对方法的局限（必须与结论一起读）

1. **全部"已修复"结论都建立在"源码与测试代码存在且断言合理"之上**，而非"重新运行通过"。本轮**没有任何一次测试执行**。
2. **静态计数无法完全复现 701**（推算 699），差 2 无法消解。
3. **无法判断断言是否"恰好通过还是真的验到了"** —— 例如 `schemaMerge` 的 `duplicateKeys` 断言逻辑正确，但若 `augment` 的实现被别的路径绕过，静态阅读发现不了。
4. **未读的 450 行 `classParser.ts` 仍是最大盲区**，本报告的所有结论都不覆盖它。
5. 本报告**没有发现新的产品缺陷**；发现的 3 处问题都属于**报告质量**（计数差 2、哈希未标注时点、三处覆盖弱于声称），已逐条给出证据。

---

## I. 建议的下一步（不改代码，仅排序）

1. **消解 701 的计数差**：允许跑一次 `vitest run --reporter=json`（或读 `--list`），把"声明 / 展开 / 跳过"三者对齐；这是唯一能把 §D.2 从"不可确认"变为"已确认"的手段。
2. **把 3 个暂缓项登记进统一待决清单**（BH-013、BH2-003、BH2-005），避免"暂缓"变"遗忘"。
3. **补 3 处弱覆盖**：BH-002 的 renderer 触发点、BH-003 的 scanner 真实调用点、`declaredFields` 去重断言。
4. **哈希标注规范**：过程态哈希必须注明"此后仍有改动"。
5. **真机验证**：按 `FIX-TEST-REPORT §7` 的四条执行；在此之前，任何"已修复"都不应被读作"已在真实环境正常"。
6. **继续读 `classParser.ts`**：它是当前最大的未验证面。
