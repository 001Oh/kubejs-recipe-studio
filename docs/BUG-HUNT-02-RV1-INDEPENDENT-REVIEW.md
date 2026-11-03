# BUG-HUNT-02-RV1 · 修复结果独立复核报告

> **工程**：`E:\mc kjs`｜**复核时间**：2026-11-01 09:11–09:25
> **性质**：**严格只读**。本轮**未**修改源码 / 测试 / 配置 / 文档（除本报告）；**未**运行测试、typecheck、lint、构建；**未**安装、卸载、启动应用；**未**修改台账 V9；**未**触碰生产 userData / `dist` / `dist-011` / 隔离区 / npm 缓存；**未**回退源码取对照。
> **无 Git**：项目不是 Git 仓库，**无法取得修改前版本**。所有"修复前行为"只能依据 `BUG-HUNT-01/02` 报告记载与当前代码的注释描述，**不能与真实旧文件逐字节对照**。这一限制贯穿全文。

---

## 0. 最终结论

# **附条件通过**

**理由（三条）**：

1. **修复真实存在且指向根因**：8 组修复在当前源码中均可逐行核对，且都不是"只让测试变绿"的局部补丁——`replaceLayer` / 层提供者 / 快照戳归属 / 单遍 `keepZone` / `stripLiteralsAndComments` / `isVirtualByNamingRules` 拆分，都是结构性改动。
2. **但发现 2 项新的已确认问题**（RV1-001 写盘失败不回滚内存、RV1-002 插件开关后 `effective` 未重建且被两个入口直接读取），**1 项测试覆盖缺口**（RV1-004：BH-003 的用户可见路径未被任何测试覆盖）。
3. 报告中的"669 用例通过 / typecheck / lint 通过"在本轮**无法验证**（禁止运行），只能记为**未证实**。

**不判"通过"**：RV1-001/002 是源码可证的残留一致性缺陷，RV1-004 使 BH-003 的修复效果缺少端到端证据。

**不判"不通过"**：核心 8 组修复的代码与断言均成立，无伪造、无放宽测试、无删除既有测试（已核对文件数与时间戳）。

---

## 1. 复核范围与实际读取的文件

### 1.1 必需材料（9 份，全部存在）

`BUG-HUNT-02-FINDINGS/REPAIR-PLAN/REPAIR-REPORT/COVERAGE`、`BUG-HUNT-01-FINDINGS/SUMMARY/COVERAGE`、`AUDIT-FULL-01-R1-REPORT`、`PROJECT-SEALING-LEDGER-REPORT` —— **均存在，无缺失**。
台账 MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，mtime `Nov 1 08:04`（早于本轮所有改动），**未被修改**。

### 1.2 源码（逐段实读，非凭报告）

| 文件 | 读取内容 |
| --- | --- |
| `src/main/schema/service.ts` | `ensureSchemas` L93–135 全文、`invalidateSchemaSnapshot` L137–140、`togglePin` L159–178、`coverage` L180–184 |
| `src/main/schema/registry.ts` | `augment` L182–237 全文、`replaceLayer` / `setLayerProvider` / `providedSchemas` / 快照戳、`pinSchema` L312–320、`unpinSchema` L322–330、`persistPinned` L307–310、`listSchemas` L146–163 |
| `src/main/handlers/schemaHandlers.ts` | `schema:pin` 分支 |
| `src/main/plugins/loader.ts` | `currentPluginOverrides`、`syncPluginLayer`、`loadPlugins` L203–220、模块尾部注册点、`pushToRegistry` 残留检查 |
| `src/main/plugins/hookSandbox.ts` | `stripLiteralsAndComments` L84–152、`inspectHookSource` |
| `src/shared/search.ts` | `isVirtualByNamingRules` / `setPluginVirtualMatchers` / `isVirtualItem`、`SearchCorpus.build` L229–281、`accepts` L143–152 |
| `src/main/scanner/itemRules.ts` / `probeImport.ts` | virtual 判定入口（各 1 处） |
| `src/renderer/src/views/bench/benchUiStore.ts` | `ensureSchema`、`pinCurrent`、`unpinCurrent` |
| **额外发现路径** | `src/main/codegen/preview.ts` L64–68、`src/main/recipes/selectSchema.ts` L51–62（RV1-002 的证据） |
| **入口核验** | `src/main/handlers/codegenHandlers.ts` L65–72、`src/main/handlers/recipeHandlers.ts` L33–40（确认未调 `ensureSchemas`） |
| **层归属核验** | `src/main/plugins/merge.ts` L139 / L152 / L204（`source: 'plugin'`） |

### 1.3 测试（6 个文件，48 用例，逐文件核对用例名与断言方式）

| 文件 | 用例 | 是否直读落盘/最终状态 |
| --- | --- | --- |
| `tests/main/schemaMerge.test.ts` | 10 | ✅ 断言 schema 内容（`duplicateKeys`、`slots.map(key)`、`required`） |
| `tests/main/schemaPin.test.ts` | 6 | ✅ **`readFileSync(PIN_FILE)` 直读落盘 JSON** |
| `tests/main/pluginRegistrySync.test.ts` | 6 | ✅ 断言 `schemaSummaries()` 返回的 id 集合 |
| `tests/plugins/hookBlacklist.test.ts` | 12 | ✅ 断言 `inspectHookSource` 返回数组内容 |
| `tests/plugins/virtualItemPatterns.test.ts` | 7 | 🟡 断言 `isVirtualItem()` / `matchesVirtualItem()`，**未走语料/查询路径** |
| `tests/renderer/benchSchemaFailure.test.ts` | 7 | ✅ 断言 store 的 `schemaCache` 与 toast `level` |

**改动范围核对**：`find tests -name "*.test.ts*"` = **70**；`! -newermt 08:54` = **64** → 既有 64 个测试文件**未被改动**；6 个新文件 mtime 08:55–09:04。**无删除、无 skip 新增**（基线 4 个 skip 属条件跳过）。

---

## 2. R-A 至 R-G 逐项复核

### 2.1 R-A · 插件 Schema 生命周期与注册表同步（BH-004 / BH-005 / BH2-001）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| `replaceLayer` 替换语义 | **正确**：`map.clear()` 后按 `schema.id` 重建，幂等、不重复注册、不残留旧条目 | `registry.ts` `replaceLayer` | **已由源码证实** |
| 层归属 | **正确**：写入 `'plugin'` 层；插件 schema 自身 `source: 'plugin'` | `merge.ts:152/204` | **已由源码证实** |
| 重建后插件层恢复 | **正确**：`ensureSchemas` 每次都 `replaceLayer('plugin', providedSchemas('plugin'))` | `service.ts:122` | **已由源码证实** |
| 禁用后是否仍生效 | **层面已不生效**（`setEnabled` → `syncPluginLayer` → `replaceLayer`） | `loader.ts` `setEnabled` / `syncPluginLayer` | **部分证实** —— 见 RV1-002：`effective` 未重建 |
| 异步加载与重建的竞态 | **已消除**：`loadPlugins` 内不再有 `void pushToRegistry(...)`，整条链路改为**同步**；`pushToRegistry` / `REGISTRY_MODULE` 已完全删除（`grep` 零命中） | `loader.ts` L203–220、尾部 | **已由源码证实** |
| 重复同步是否丢数据/重复注册 | **不会重复注册**（按 id 覆盖）；但**存在"provider 异常→清空整层"的风险** | `providedSchemas` catch 返回 `[]` | **待核实风险**（RV1-003） |
| 测试覆盖加载/重建/禁用/重启用 | ✅ 6 例覆盖（含连续两次重建） | `pluginRegistrySync.test.ts` | **已由测试断言支持** |
| **未覆盖** | ① 重复调用 `syncPluginLayer` 的幂等（无重复注册断言）；② 层归属（`source==='plugin'`）无断言；③ provider 抛错时的降级行为无断言 | — | **证据缺口** |

**BH2-001 的新根因是否被正确采用**：是。复核确认旧描述"扫描后消失"**不准确**——旧代码是 `void pushToRegistry(...)`（内部 `await import`）与 `ensureSchemas` 的 `clearSchemas()` 竞争，插件类型**可能从未进入** `effective`。BH-02 的修正描述与当前代码删除该路径的事实一致。

### 2.2 R-B · `ensureSchemas` 并发与完成状态（BH-002）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| in-flight Promise 是否真被共享 | **是**：模块级 `let inflight`，第二个调用 `await inflight` 后 `continue` 重新判 key | `service.ts:93`、L115–118 | **已由源码证实** |
| 成功状态只在成功后记录 | **是**：`writeSnapshotStamp(key)` 是 task 内**最后一步** | `service.ts:125` | **已由源码证实** |
| 失败后可重试 | **是**：task 抛错 → `finally` 只清 `inflight`，戳保持旧值 → 下次重新组装 | `service.ts:128–132` | **已由源码证实** |
| 并发是否可能重复初始化/状态覆盖 | **不会重复初始化**（共享同一 task）；但**构建期间换包会产生一次陈旧结果**：写入的是旧 `key`，当次调用返回旧整合包数据，下一次调用才纠正 | `service.ts:112–134` | **部分证实** |
| 缓存清理与注册表状态一致 | **基本一致**：`clearSchemas()` 在 task 内、`applyMerge` 之前；无外部并发清空路径（仅测试调用） | — | **已由源码证实** |
| 测试覆盖 | 3 例：并发 list 非空且等长、并发 get 非 null、list 与 coverage 类型数一致 | `schemaPin.test.ts` | **已由测试断言支持** |
| **未覆盖** | ① "失败后重试"无测试（`loadPinned` 抛错场景）；② 构建期间换包的一次性陈旧结果无测试 | — | **证据缺口** |

### 2.3 R-C · Schema pin 持久化（BH-001）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| `togglePin(typeId, on, override?)` 是否使用提交数据 | **是**：`const source = override ? { ...override, id: typeId } : current` | `service.ts:169` | **已由源码证实** |
| 强制对齐 `id` 是否充分 | **方向正确**：`id` 被覆盖为 `typeId`，且 handler 侧 `assertPinnable` 校验 `schema.id === req.typeId`，属双重约束 | `schemaHandlers.ts` + `service.ts:169` | **已由源码证实** |
| 校验对象与落盘对象是否一致 | **一致**：`assertPinnable` 校验的 `schema` 就是传给 `togglePin` 的同一对象 | `schemaHandlers.ts` | **已由源码证实** |
| 写盘失败是否向调用方报失败 | **会报**（`persistPinned` 抛错 → handler 抛错 → `{ok:false}` → 渲染端 toast） | `registry.ts:317`、`benchUiStore.pinCurrent` catch | **部分证实** —— 见 **RV1-001**：内存已先改、不回滚 |
| 测试是否检查实际持久化内容 | **是**：`readFileSync(PIN_FILE)` 解析后断言 `displayName` | `schemaPin.test.ts:92` | **已由测试断言支持** |
| 测试覆盖边界 | ✅ 提交值落盘、返回值一致、`id` 不一致拒绝；❌ **写盘失败路径无测试** | — | **证据缺口**（对应 RV1-001） |

### 2.4 R-D · 字段降级与重复处理（BH-006 / BH-007 / BH2-002）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| 单遍过滤是否正确 | **是**：`keepZone` 只被调用两次（`slots`、`outputs`），每次单遍遍历，同一槽位不可能被访问两次 | `registry.ts:209–225` | **已由源码证实** |
| `demotedKeys` 是否正确处理迁移 | **是**：同一 key 只 push 一次（覆盖 `slots`/`outputs` 撞名） | `registry.ts:213–217` | **已由源码证实** |
| `required: true` 是否可能残留在不存在字段上 | **不再可能**：降级副本 `demote()` 强制 `required:false`，且原槽位被 `continue` 移出 `slots`/`outputs` | `registry.ts:169–171`、L212–219 | **已由源码证实** |
| 声明字段与额外字段处理是否一致 | **一致**：`slotsOf` 合并三区，`declaredFields` 也合并三区并按 key 去重 | `registry.ts:165–167`、`fieldModel.ts:52–64` | **已由源码证实** |
| 是否还有其他路径产生重复字段 | **存在一个未加保护的边角**：若 `skeleton.extraFields` 与 `skeleton.slots`/`outputs` 出现**同 key**，`demotedKeys` 不覆盖前者 → `extraFields` 会出现两份 | `registry.ts:230` | **待核实风险**（低；内置数据无此重叠） |
| BH2-002 更正是否成立 | **成立**：`declaredFields` 有 `seen` 去重（`slots` 在前），故**不会重复渲染**；真实危害是降级失效 + 必填残留 | `fieldModel.ts:56–62` | **已由源码证实** |
| 测试覆盖 | 5 例：无重复 key、降级后 `required` 非 true、extra 槽位只降级一次、重合回归、`sampleCount=0` 不降级 | `schemaMerge.test.ts` | **已由测试断言支持** |

### 2.5 R-E · Schema 加载失败与缓存语义（BH-009 / BH-010）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| `callOrThrow` 是否正确传播错误 | **是**：失败时 `pushLog` 后 `throw new IpcCallError`；`ensureSchema` 的 catch 捕获 | `api.ts:38–45`、`benchUiStore.ts` | **已由源码证实** |
| 失败后是否删除错误缓存而非存 `null` | **是**：catch 分支只 `set({schema:null, schemaLoading:false})`，**不写** `schemaCache`；`unpin` 后取不到时通过 `delete nextCache[id]` 删键 | `benchUiStore.ts` | **已由源码证实** |
| pin/unpin 失败是否有可见反馈 | **是**：均 `toast(..., 'error')` | `benchUiStore.ts` | **已由源码证实** |
| 提示是否掩盖原始错误 | **基本不掩盖**：toast 文本带上 `err.message`；但 `pushLog` 只在 `ensureSchema` 里有，`pinCurrent` 的 catch **未落日志** | `benchUiStore.ts` | **部分证实**（小缺口） |
| 缓存清理后是否仍可能用旧状态 | **存在**：`schema` 字段在失败时被置 `null`，但 `schemaTypeId` 已切到新类型；下一次调用会重试，符合预期。**未见"删键后仍读旧值"路径** | `benchUiStore.ts` | **已由源码证实** |
| 测试覆盖 | 7 例：失败不污染缓存、有 error toast、失败后可重试、成功即缓存、pin 失败不谎报、pin 成功采用返回值、unpin `false` 不谎报 | `benchSchemaFailure.test.ts` | **已由测试断言支持** |
| **证据限制** | 该文件测试写在**修复之后**，**未留存"修复前失败"的运行记录**（BH-02 报告 §4 已披露） | — | **证据限制**（见 §3.3） |

### 2.6 R-F · Hook 黑名单匹配（BH-008）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| 字符串处理 | **正确**：`"` / `'` 分支，`\\` 转义跳 2 字符，遇同类引号结束 | `hookSandbox.ts:103–119` | **已由源码证实** |
| 注释处理 | **正确**：`//` 到行尾、`/*` 到 `*/`；未闭合块注释自然吃到底（不崩） | L91–102 | **已由源码证实** |
| 模板字符串 `${...}` 是否保留并继续受检 | **是**：`depth` 计数后把插值原文 push 回输出 | L120–147 | **已由源码证实** |
| 转义引号 | ✅ 正确处理 | L106–110 | **已由源码证实** |
| **正则字面量** | **不识别**。`/[/*]/` 里的 `/*` 会被当作块注释开始，吞掉其后所有代码 → **黑名单漏检** | L96–102（无 `/.../` 分支） | **已由源码证实（缺陷存在）** |
| 该漏检是否构成能力提升 | **不构成**：`createContext({}, {codeGeneration:{strings:false,wasm:false}})` 的上下文**没有** `require` / `process` / `fs`，被漏检的调用执行时 ReferenceError → 钩子失败 | `runHookSource` L140–144 | **已由源码证实** |
| 嵌套模板 | **不完整**：内层模板字面量里的 `}` 会被当作插值结束（无递归），可能截断 | L131–143 | **待核实风险** |
| 测试覆盖 | 12 例：误伤三类、真实逃逸四类、模板插值、剥离函数 4 例（含转义、未闭合） | `hookBlacklist.test.ts` | **已由测试断言支持** |
| **未覆盖** | 正则字面量、嵌套模板、块注释内含引号 | — | **证据缺口** |

> **不得声称"黑名单绝对安全"**：它是 `vm` + `codeGeneration:false` 之外的**第二道**防线，本质是启发式文本过滤（非 JS 词法分析）。真实边界仍由 vm 承担。

### 2.7 R-G · `virtualItemPatterns` 的实际调用链（BH-003）

| 核查点 | 结论 | 证据 | 等级 |
| --- | --- | --- | --- |
| 两个函数职责是否清晰 | **清晰**：`isVirtualByNamingRules`（仅内置，扫描期）/ `isVirtualItem`（内置 + 插件通配，查询期） | `search.ts` | **已由源码证实** |
| 插件通配是否真正参与 | **参与 `isVirtualItem()`**；但**查询期实际读的是构建期掩码** | 见下行 | **部分证实** |
| **查询期路径** | `SearchCorpus.build` 在 L239 把 `isVirtualItem(item)` 结果写进 `virtualFlags` → L278 存入 `virtualMask`；`accepts()` L146 **只读 `this.virtualMask[idx]`** | `search.ts:239/278/146` | **已由源码证实** |
| 因此插件开关后是否立即生效 | **不立即**：`syncPluginLayer` → `invalidateVirtualMatchers()` 只清匹配器缓存，**不重建语料**；已构建语料的掩码保持旧值，直到下次扫描/重载索引 | `loader.ts` `syncPluginLayer`、`search.ts` | **部分证实（缺口）** |
| 编译缓存是否正确失效 | **是**：`resetPluginLoader` 与 `syncPluginLayer` 均置 `virtualMatcherCache = null` | `loader.ts` | **已由源码证实** |
| 是否可能留下旧规则 | 匹配器不会；**语料掩码会**（同上） | — | **部分证实** |
| 空规则/非法正则/高开销 | 空规则：`parseManifest` 要求非空字符串，空数组 → 匹配器为空 → `some` 立即 false；非法正则：转义集覆盖 `. + ^ $ { } ( ) \| [ ] \`，`*`/`?` 另行替换，**构造阶段未见抛错路径**；高开销：`O(物品 × 通配)`，已缓存编译结果，**未做前缀索引** | `patternToRegExp`、`virtualMatcherList` | **待核实风险**（性能需真实数据） |
| 测试覆盖 | 7 例全部针对 `isVirtualItem()` / `matchesVirtualItem()` 的**函数级**断言 | `virtualItemPatterns.test.ts` | **已由测试断言支持（函数级）** |
| **关键缺口** | **没有一例构建语料并查询**，因此"用户在浏览/搜索里看不到该物品"这条**用户可见效果完全未被测试覆盖** | `grep buildSearchCorpus tests/plugins/virtualItemPatterns.test.ts` → 无命中 | **证据缺口**（RV1-004） |

---

## 3. 6 个新增测试文件的断言质量评估

### 3.1 逐项问答

| 修复 | ① 修复前能否暴露缺陷 | ② 是否直断言关键行为 | ③ 是否只验 mock 调用 | ④ 是否覆盖失败/并发/恢复 | ⑤ 是否可能"测试过但实现仍错" |
| --- | --- | --- | --- | --- | --- |
| BH-001 | ✅ 能（旧实现落盘的是注册表版本，`displayName` 断言会失败） | ✅ **直读 `customRecipeTypes.json`** | ❌ 否（真实 tmp 文件） | 部分：有 `id` 不一致拒绝；**无写盘失败** | 低（落盘内容直接断言） |
| BH-002 | ✅ 能（旧实现并发第二调用返回 `[]`，`length>0` 断言失败） | ✅ 断言返回数组与类型数 | ❌ 否（真实 handler + IPC） | ✅ 有并发；❌ **无失败重试** | 中：`loadPinned` 抛错场景无覆盖 |
| BH-003 | 🟡 **未留存证据**（测试写在修复后） | ✅ 函数级断言 | ❌ 否（真实 loader + 真实插件文件） | 部分：有开关；❌ **无语料/查询路径** | **中高**：函数对但语料掩码可能仍旧（RV1-004） |
| BH-004/005/BH2-001 | ✅ 能（首例"插件类型可见"在旧实现即失败） | ✅ 断言 `schemaSummaries()` 的 id 集合 | ❌ 否（真实 registry + 真实插件） | ✅ 重建/连续重建/禁用/重启用；❌ 无重复同步幂等 | 中：`effective` 未重建窗口（RV1-002）未被覆盖 |
| BH-006/007 | ✅ 能（旧实现三条用例失败） | ✅ 断言 `slots`/`extraFields` 内容与 `required` | ✅ 纯函数、无 mock（优点） | ✅ 含反向回归（重合、`sampleCount=0`） | 低 |
| BH-008 | ✅ 能（旧实现三条误伤用例失败） | ✅ 断言返回的命中标签数组 | ✅ 纯函数 | 部分：含转义/未闭合；❌ 无正则字面量/嵌套模板 | 中：正则字面量漏检未覆盖 |
| BH-009/010 | 🟡 **未留存证据**（测试写在修复后） | ✅ 断言 store 缓存与 toast `level` | 🟡 stub 了 `window.studio`（合理） | ✅ 有失败/重试/成功缓存；❌ 无 `unpin` 后 `schema:get` 失败删键路径 | 低-中 |

### 3.2 优点（如实记录）

- `schemaPin.test.ts` **直读落盘 JSON**，这是本次最有价值的断言方式，避免了"只验证返回值"。
- `schemaMerge.test.ts` 是**纯函数测试、零 mock**，且含两条**反向回归**（重合场景、`sampleCount=0`），能防止"修过头"。
- `pluginRegistrySync.test.ts` 用**真实插件文件 + 真实注册表**，并特意加了"连续两次重建"，防"第一次侥幸"。
- 所有新增测试都断言**最终状态**（schema 内容、落盘内容、store 状态、命中标签），**未见**"只断言函数被调用"（无 `toHaveBeenCalled` 类断言）。

### 3.3 证据限制（任务要求单独标记）

| 编号 | 限制 |
| --- | --- |
| BH-003 | 测试**写在修复之后**，**未保留"修复前失败"的运行记录**。可核对性仅来自推导：旧实现 `isVirtualItem` 不含插件规则，`id='bh02:marker/widget'` 的 path 不含 `dummy/display/jei_` → 必为 `false`，而用例断言 `true`。**不得表述为"已验证测试先失败后通过"** |
| BH-009 / BH-010 | 同上。旧实现 `call()` 失败返回 `null` 并写入 `schemaCache[id]=null`，而用例断言 `schemaCache[TYPE]` 为 `undefined` 且必须有 `level:'error'` 的 toast → 推导上必然失败，但**无运行证据** |
| 其余 6 组 | BH-02 报告记载"先跑出失败再修复"，本轮**无法验证**该记载（禁止运行），只能确认测试内容与缺陷描述对应 |

### 3.4 本轮**无法验证**的报告声明

| 声明 | 状态 |
| --- | --- |
| "完整套件 70 文件 / 673 用例 / 669 passed / 0 失败" | **未证实**（禁止运行测试） |
| "`npm run typecheck` 通过" | **未证实** |
| "`npm run lint --max-warnings=0` 通过" | **未证实** |
| "零回归，基线 64/621 → 70/669" | **部分可证**：文件数 70、既有 64 个未被改动（时间戳+计数可证）；**用例通过数不可证** |

---

## 4. 新发现的问题

### 4.1 已确认问题（源码可直接证明）

#### RV1-001 · 钉住写盘失败时内存已变更且不回滚

| 项 | 内容 |
| --- | --- |
| **等级** | **已由源码证实**（行为确实如此） |
| **严重程度** | **P2** |
| **位置** | `src/main/schema/registry.ts` `pinSchema` L313–320、`unpinSchema` L322–330、`persistPinned` L307–310 |
| **行为** | `pinSchema` 先 `pinned.set()` + `effective.set()`，**再** `await persistPinned()`；`unpinSchema` 先 `pinned.delete()`，**再** persist。若 `writeJson` 失败（userData 只读 / 磁盘满 / 杀软锁），内存已改、磁盘未改 |
| **后果** | ① IPC 返回 `{ok:false}`、UI 显示"钉住失败"（BH-010 修复后可见）；② 但**本会话内该类型已被钉住/已取消钉住**，与磁盘不一致；③ 重启后静默回退到磁盘状态，用户会看到"我明明钉住过又没了" |
| **是否 BH-02 引入** | **否**，属既有缺陷（BH-01 复核时已注意到 `unpinSchema` 同类问题但未登记） |
| **是否有测试** | **无**（`schemaPin.test.ts` 只测成功路径与 `id` 不一致拒绝） |
| **建议** | 失败时回滚内存（`pinned`/`effective` 恢复调用前快照），或改为"先写盘成功再改内存" |

#### RV1-002 · 插件开关后 `effective` 未重建，而两个入口直接读注册表

| 项 | 内容 |
| --- | --- |
| **等级** | **已由源码证实** |
| **严重程度** | **P2** |
| **位置** | `loader.ts` `syncPluginLayer`（只 `replaceLayer` + `invalidateSnapshot`，**不调 `applyMerge`**）；`codegen/preview.ts` L64–68 `loadSchema` → `getSchema()`；`recipes/selectSchema.ts` L51–62 → `getSchema()` |
| **行为** | `plugins:setEnabled` 后，`layerMaps.plugin` 已更新，但 `effective` 仍持有旧合并结果。`schema:*` 系列入口都会先 `ensureSchemas()`（戳已失效）→ 自动重建，**但这两个入口不调 `ensureSchemas`** |
| **后果** | 关闭某插件后，在下次任何 `schema:*` 调用之前：`recipes:open` 仍可能用该插件的 schema 解析配方；`codegen:preview` 仍可能按其 schema 生成代码 |
| **可达性** | 设置页关插件 → 回工作台打开该类型配方/生成预览。BenchView 挂载时会调 `schema:list`（可自愈），**但若用户先开配方再进工作台，或工作台已挂载不再重挂，窗口期真实存在** |
| **测试** | **无**（`pluginRegistrySync` 用 `schemaSummaries()` 触发重建，恰好绕过了这条路径） |
| **建议** | 二选一：① `syncPluginLayer` 后同步重建（需要 facts，可让 service 暴露 `refreshAfterLayerChange()`）；② 两个入口改调 `service.schemaById()` 而不是裸 `getSchema()` |

### 4.2 待核实风险（无运行环境无法定论）

| 编号 | 风险 | 位置 | 为何待核实 |
| --- | --- | --- | --- |
| RV1-003 | provider 抛错时 `providedSchemas` 返回 `[]`，`replaceLayer('plugin', [])` 会**清空此前正常的插件层**（仅 WARN） | `registry.ts` `providedSchemas` + `service.ts:122` | 需要 provider 真抛错才触发；`resolvePluginOverrides` 的抛错可能性未穷举 |
| RV1-004 | **BH-003 的用户可见效果未被测试覆盖**：语料掩码在构建期固化，插件开关后不重建语料 | `search.ts:239/278/146`；`virtualItemPatterns.test.ts` | 需构建语料并查询才能验证；本轮禁止运行 |
| RV1-005 | `stripLiteralsAndComments` 不识别正则字面量；`/[/*]/` 会吞掉后续代码 → 黑名单漏检（**不构成能力提升**） | `hookSandbox.ts:96–102` | 需构造实际钩子验证；安全影响已由 vm 边界兜住 |
| RV1-006 | 嵌套模板 `` `a${`b}${c}`}` `` 的 `}` 会被误判为插值结束 | `hookSandbox.ts:131–143` | 需构造用例 |
| RV1-007 | `skeleton.extraFields` 与 `slots`/`outputs` 同 key 时，`extraFields` 会出现两份 | `registry.ts:230` | 内置数据无此重叠；需插件/推断数据构造 |
| RV1-008 | `virtualMatcherList()` 为 `O(物品 × 通配)`，数百条通配 × 43k 物品的开销未测 | `loader.ts` | 需真实数据 |
| RV1-009（文档） | `codegen/preview.ts:65` 注释"schema 注册表的唯一调用点"已不准确（`selectSchema` 也直接调用） | `preview.ts:65` | 纯注释问题，无行为影响 |

---

## 5. 与 BUG-HUNT-01 / BUG-HUNT-02 / R1 的编号与状态一致性

### 5.1 计数可复算

| 校验式 | 结果 |
| --- | --- |
| BH-01：14 编号 − 2 合并（BH-005→004、BH-007→006）= 12 独立 | ✅ 与 BH-01 SUMMARY 一致 |
| BH-02：21 编号（14 + 7）− 2 已排除（BH2-006/007）− 4 合并 = **15 独立** | ✅ 与 BH-02 FINDINGS §4 一致 |
| 15 =  BH-01 的 12 + 3 个新 D 类（BH2-003/004/005） | ✅ 一致 |
| 已修 8 独立问题覆盖 **12 个编号**（BH-001…010 共 10 个 + BH2-001 + BH2-002） | ✅ 可逐条对上 |
| 已修 8 + 测试缺口闭合 2 + 未修 5 = 15 | ✅ 一致 |
| 状态分布 A7 + B4 + C2 + D5 + 排除 2 + 更正 1 = 21 | ✅ 一致 |
| A7 = BH-01 的 A6 + BH2-001 | ✅ 一致 |

### 5.2 5 个暂缓项状态

| 编号 | BH-02 报告状态 | 本轮复核 |
| --- | --- | --- |
| BH-013 manifest 无数量上限 | 未处理 | ✅ **仍未解决**：`manifest.ts` 校验分支仍无 `length` 上限（代码未变） |
| BH-014 插件缓存键无文件签名 | 未处理 | ✅ **仍未解决**：`loadPlugins` 的 `key` 仍只含 路径/userDir/modsDir/appVersion（已读源码确认） |
| BH2-003 `{id,count}` 判为 blockstate | 未处理 | ✅ **仍未解决**：`looksBlockstate` 仍接受任意 string/number 属性 |
| BH2-004 `kindForField` 缺 `list` 分支 | 未处理 | ✅ **仍未解决**：`kindForField` 仍无 `'list'` 分支 |
| BH2-005 数量侧接受任意字符串 | 未处理 | ✅ **仍未解决**：`siblingHasQuantShape` 的 `quant !== 'chance'` 分支仍 `return true` |

### 5.3 `cacheHit` 归类

全三份 BH-02 报告均写「**仍为未测量**」，`BUG-HUNT-02-FINDINGS` §6 明确"未把缺少运行时证据包装成缓存缺陷"。本轮复核：**未发现把 `cacheHit` 说成已证实缺陷的表述**。✅ 一致。

### 5.4 发现的报告间表述差异（不擅自修正）

| 差异 | 说明 | 处理 |
| --- | --- | --- |
| BH-01 的 `BH-006` 描述"同一字段被渲染两次"与 BH-02 的更正（不会重复渲染，危害是降级失效 + 必填残留）**并存** | BH-01 报告按要求**未被回改**（保留历史证据），BH-02 已明确更正 | **已声明的差异，非矛盾**。引用时必须用 BH-02 版本；建议在 BH-01 顶部加一行"BH-006 影响描述已由 BUG-HUNT-02 更正"的交叉引用（本轮**未修改**，只提建议） |
| BH-02 `REPAIR-REPORT` 称 BH-003"只改查询期" | 表述本身正确（确未改扫描期），但"查询期"实际是**语料构建期快照**，见 RV1-004 | **表述不够精确**，建议补一句语料掩码限制 |

---

## 6. 仍需真实运行环境验证的事项

| # | 事项 | 为什么必须运行 |
| --- | --- | --- |
| 1 | 669 用例通过 / 零回归 | 本轮禁止运行测试 |
| 2 | `typecheck` / `lint` 通过 | 同上 |
| 3 | BH-002 的多步序列配方首次打开是否真的不再降级 | 需要真实 UI + 真实整合包 |
| 4 | BH-006 修复后的表单形态（字段落高级区、可选） | 需要真实渲染 |
| 5 | BH-001 钉住后 UI 采用返回值、toast 可见 | 需要真实渲染 |
| 6 | BH-003 在 43k 物品下的查询耗时与过滤效果 | 需要真实索引 + 启动应用 |
| 7 | RV1-002 的窗口期是否在真实交互序列中出现 | 需要真实 UI 操作顺序 |
| 8 | RV1-001 在只读 userData / 磁盘满下的表现 | 需要构造故障 |
| 9 | RV1-005 正则字面量漏检的实际影响 | 需要真实钩子 + 沙箱运行 |
| 10 | `cacheHit` 运行时值 | 需要扫描（仍为未测量） |

---

## 7. 复核结论与建议

### 7.1 逐项等级汇总

| 核查域 | 结论等级 |
| --- | --- |
| R-A 插件层同步 | **已由源码证实 + 已由测试断言支持**（核心）；**部分证实**整体（RV1-002/003 未覆盖） |
| R-B 并发与完成状态 | **已由源码证实 + 已由测试断言支持**；**部分证实**（换包窗口、失败重试无测试） |
| R-C pin 持久化 | **已由源码证实 + 已由测试断言支持**（落盘内容直断言）；**部分证实**（写盘失败路径 = RV1-001） |
| R-D 字段降级 | **已由源码证实 + 已由测试断言支持**；**部分证实**（extraFields 同 key 边角 = RV1-007） |
| R-E 失败与缓存语义 | **已由源码证实 + 已由测试断言支持**；**证据限制**：无"先红后绿"记录 |
| R-F 黑名单匹配 | **已由源码证实 + 已由测试断言支持**；**部分证实**（正则字面量/嵌套模板未覆盖） |
| R-G 虚拟物品链路 | **部分证实**：职责拆分与函数级行为成立，**用户可见路径未被覆盖且不即时生效**（RV1-004） |

### 7.2 建议（按优先级）

1. **RV1-002（P2）**：把 `codegen/preview.loadSchema` 与 `recipes/selectSchema` 改为经 `service.schemaById()`，或让 `syncPluginLayer` 之后主动重建 `effective`。**这是本轮唯一会直接影响"关闭插件仍生效"用户可见结论的残留**。
2. **RV1-004（P2）**：为 BH-003 补一条**语料级**测试（`buildSearchCorpus` + `search({includeVirtual:false})` 断言不含该物品），并明确"插件开关后需重建语料才生效"的语义（或在开关后主动重建语料）。
3. **RV1-001（P2）**：`pinSchema`/`unpinSchema` 失败时回滚内存；补一条写盘失败用例。
4. **RV1-003（P3）**：provider 抛错时**保留旧层**而非清空。
5. **RV1-005/006/007（P3）**：可用 `acorn` tokenizer 替代字符扫描；`extraFields` 按 key 去重。
6. 报告层面：在 BH-01 顶部加交叉引用说明 BH-006 描述已被 BH-02 更正（**本轮不修改**）。

### 7.3 结论

> **附条件通过。**
> 8 组修复在当前源码中真实存在、指向根因，且新增测试以"断言最终状态/落盘内容"为主，质量高于只验 mock 的常见写法；既有 64 个测试文件未被改动、无删除、无新增 skip。
> 但：① 存在 2 项源码可证的新问题（RV1-001、RV1-002）与 1 项用户可见路径的测试缺口（RV1-004）；② BH-003 / BH-009 / BH-010 缺少"先红后绿"证据；③ 报告中"669 用例通过 / typecheck / lint 通过"在本轮**不可验证**。
> 因此**不能判"通过"**；因核心修复成立且无伪造迹象，**也不判"不通过"**。建议按 §7.2 完成 1–3 项后再出一次针对性复核。

---

## 8. 本轮未做的事（边界声明）

| 项 | 状态 |
| --- | --- |
| 修改源码 / 测试 / 配置 / 文档（除本报告） | **未做** |
| 运行测试 / typecheck / lint / 构建 | **未做** |
| 安装 / 卸载 / 启动应用 | **未做** |
| 修改台账 V9 / 生成 V10 | **未做**（MD5 仍 `7a7e52d9…`） |
| 修改生产 userData / `dist` / `dist-011` / 隔离区 / npm 缓存 | **未做** |
| 回退源码取"修改前对照" | **未做**（无 Git，且任务禁止） |
| 全项目新一轮扫描 | **未做**（只读与本次修复相关的 9 个文件 + 6 个测试 + 3 处关联入口） |
