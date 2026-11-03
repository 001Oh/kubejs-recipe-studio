# BUG-HUNT-02 · 集中修复报告（REPAIR-REPORT）

> **工程**：`E:\mc kjs`｜**基线**：台账 v9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，**全程未修改**）
> **执行时间**：2026-11-01 08:54–09:06
> **允许范围**：项目源码 + 测试。**未**构建、**未**安装、**未**卸载、**未**启动应用、**未**改台账、**未**触碰生产 userData / `dist` / `dist-011` / 隔离区 / npm 缓存。

---

## 0. 结论速览

| 项 | 数量 |
| --- | --- |
| 去重后独立问题 | **15** |
| **本轮实际修复** | **8 个独立问题**（覆盖 12 个原始编号：BH-001/002/003/004/005/006/007/008/009/010 + BH2-001 + BH2-002） |
| 测试缺口已闭合 | **2**（BH-011、BH-012） |
| 未处理（需决策/需实测） | **5**（BH-013、BH-014、BH2-003、BH2-004、BH2-005） |
| 新增测试文件 | **6 个 / 48 个用例** |
| 修改源文件 | **9 个** |
| 完整套件 | **68 文件通过 + 2 条件跳过（70）；669 用例通过 + 4 跳过（673）；0 失败** |
| 回归 | **零回归**：基线 64 文件 / 621 用例 → 现 70 文件 / 669 用例 = +48（正好等于新增用例数） |
| typecheck / lint | **均通过**（node + web；`--max-warnings=0`） |

---

## 1. 修改的源文件清单

| 文件 | 行数变化 | 涉及编号 |
| --- | --- | --- |
| `src/main/schema/registry.ts` | 266 → 334 | BH-006、BH-007、BH-004、BH-005、BH-002（快照戳移交） |
| `src/main/schema/service.ts` | 141 → 184 | BH-002、BH-001、BH-004 |
| `src/main/handlers/schemaHandlers.ts` | 75（内容变更） | BH-001 |
| `src/main/plugins/loader.ts` | 301 → 344 | BH2-001、BH-004、BH-005、BH-003 |
| `src/main/plugins/hookSandbox.ts` | 184 → 265 | BH-008 |
| `src/shared/search.ts` | 311 → 341 | BH-003 |
| `src/main/scanner/itemRules.ts` | 204（1 行变更） | BH-003（改为仅命名规则） |
| `src/main/scanner/probeImport.ts` | 183（1 行变更） | BH-003（同上） |
| `src/renderer/src/views/bench/benchUiStore.ts` | 220 → 269 | BH-009、BH-010 |

新增测试：

| 文件 | 用例数 | 针对编号 |
| --- | --- | --- |
| `tests/main/schemaMerge.test.ts` | 10 | BH-006、BH-007、BH-011 |
| `tests/main/schemaPin.test.ts` | 6 | BH-001、BH-002、BH-012 |
| `tests/main/pluginRegistrySync.test.ts` | 6 | BH2-001、BH-004、BH-005 |
| `tests/plugins/hookBlacklist.test.ts` | 12 | BH-008 |
| `tests/plugins/virtualItemPatterns.test.ts` | 7 | BH-003 |
| `tests/renderer/benchSchemaFailure.test.ts` | 7 | BH-009、BH-010 |

> **未删除、未跳过、未放宽任何既有测试**。完整套件里 2 个 skip 文件 / 4 个 skip 用例是**基线既有**的条件跳过（`RUN_REAL_PACK` 未开、本机 MOD 包路径不存在），与本轮无关。

---

## 2. 逐项修复记录

### 2.1 BH-002 · `ensureSchemas` 并发短路 + null 永久缓存

| 项 | 内容 |
| --- | --- |
| **修复前行为** | `stamp = key` 写在 `await loadPinned()` **之前**；同一 tick 的第二个调用看到戳已更新即返回，此时 `effective` 尚未被 `applyMerge` 填充。`SequenceEditor` 的 `for (...) void ensureSchema(t)` 会一次发多个并发请求，正好命中该窗口。 |
| **复现证据（修复前）** | `tests/main/schemaPin.test.ts` 5 个失败：<br>· `expected 0 to be greater than 0`（并发 `schema:list` 返回空）<br>· `expected undefined to be 'minecraft:crafting_shapeless'`（并发 `schema:get` 返回 null）<br>· `expected +0 to be 3`（`coverage.totalTypes` 为 0） |
| **修改内容** | `service.ensureSchemas` 改为**共享 in-flight Promise** 的循环：<br>· 有 `inflight` 就 `await` 它再重新判断 key；<br>· 组装成功后**才** `writeSnapshotStamp(key)`；<br>· 组装失败 → 不写戳，下一次调用重试（`finally` 只清 `inflight`）。<br>快照戳从 `service` 局部变量移交 `registry` 保管（`readSnapshotStamp`/`writeSnapshotStamp`/`invalidateSnapshot`），以便 loader 能**同步**失效（供 BH-005 使用）。 |
| **修复后验证** | `tests/main/schemaPin.test.ts` → **6/6 通过**；`tests/main/schemaService.test.ts`（既有 6 例）→ **通过** |
| **剩余风险** | ① 若一次组装耗时很长，期间所有 schema 请求会串行等待（符合预期，优于返回空）；② "组装中途换包"时，第二次循环会重建一次（幂等，代价是一次多余合并）；③ 未做**真机**并发压测（需启动应用，本轮不允许） |

### 2.2 BH-001 · `schema:pin` 丢弃提交的 schema

| 项 | 内容 |
| --- | --- |
| **修复前行为** | `assertPinnable(req)` 校验 `req.schema` 后**从不使用**；`togglePin(schema.id, true)` 内部 `getSchema(typeId)` 取注册表当前版本落盘。用户点"钉住"→ 写入另一份内容 → 仍报成功。 |
| **复现证据（修复前）** | `tests/main/schemaPin.test.ts`：<br>· 「落盘内容必须是调用方提交的那一份」→ `expected false to be true`（`res.ok` 为 false）<br>· 「返回值也必须是提交的那一份」→ `expected undefined to be '另一个名字'` |
| **修改内容** | `togglePin(typeId, on, override?)`；`on=true` 且给 override 时以 `{ ...override, id: typeId }` 调 `pinSchema`；handler 把已校验的 `schema` 传入。`id` 强制对齐 `typeId`（防"把别人的 schema 钉到该类型上"）。 |
| **修复后验证** | `tests/main/schemaPin.test.ts` 6/6 通过（含「id 不一致必须拒绝」用例，修复前后都通过） |
| **剩余风险** | 开始真正信任渲染端对象。缓解：`assertPinnable` 仍校验 `typeId` 非空、`id` 一致、`slots`/`outputs` 为数组、`layoutKind` 为字符串；`id` 再被强制对齐。**未**加字段级白名单（属设计取舍，见 REPAIR-PLAN 批次 9 之外的后续项） |

### 2.3 BH2-001 / BH-004 / BH-005 · 插件层与注册表同步（根因 R-A）

| 项 | 内容 |
| --- | --- |
| **修复前行为** | ① `loadPlugins` 用 `void pushToRegistry(...)`（fire-and-forget + 内部 `await import`），紧随其后的 `ensureSchemas` 一 `clearSchemas()` 就把它抹掉 → 插件类型**从未可靠出现**；② `ensureSchemas` 重建时只装 builtin + pinned，插件层被清空后**永不恢复**；③ `setEnabled` 完全不通知注册表，关闭的插件继续生效；④ 注册表**没有按层撤销/替换的 API**。 |
| **复现证据（修复前）** | `tests/main/pluginRegistrySync.test.ts` **5/6 失败**，包括最基础的「插件声明的类型能在 schema:list 里看到」也失败（`expected [...] to include 'bh02:crafted'`）——证明问题比 BUG-HUNT-01 描述的"扫描后消失"更严重 |
| **修改内容** | ① `registry.replaceLayer(layer, schemas)`：按层整体替换（补上缺失的"撤销"能力）；② 层数据提供者注册 `setLayerProvider` / `providedSchemas`（registry 不反向依赖 loader，避免循环）；③ `ensureSchemas` 每次重建都 `replaceLayer('plugin', providedSchemas('plugin'))`；④ `loader` 新增 `currentPluginOverrides()`（key 感知刷新）与 `syncPluginLayer()`（替换层 + 失效快照 + 失效虚拟物品缓存）；⑤ `loadPlugins` 用它取代 `void pushToRegistry(...)`；⑥ `setEnabled` 末尾调用它；⑦ 删除死代码 `pushToRegistry` / `REGISTRY_MODULE`。 |
| **修复后验证** | `tests/main/pluginRegistrySync.test.ts` **6/6 通过**；`tests/plugins/**` 全绿；`tests/main/**` 全绿（25 文件 / 243 用例） |
| **剩余风险** | ① `loadPlugins` → `syncPluginLayer` → `currentPluginOverrides` → `loadPlugins` 形成一层递归，但第二次进入时缓存键已匹配、立即返回，**不会无限递归**（已由 6 个用例覆盖）；② `setEnabled` 现在是同步调用 `syncPluginLayer`，其中 `loadPlugins` 若发现键变化会读盘——开关操作可能略微变慢（可接受）；③ 插件清单文件**热改**仍需重启（BH-014，未修） |

### 2.4 BH-006 / BH-007 · `augment` 降级语义（根因 R-D）

| 项 | 内容 |
| --- | --- |
| **修复前行为** | `keep()` 被调用两遍（`slots`+`'input'`、`slots.filter(zone==='extra')`+`'extra'`）且共享 `demoted` 数组 → `slots` 里 `zone:'extra'` 的槽位被推两次；`keptSlots.length > 0 ? keptSlots : slots` 兜底会把刚降级的槽位**原样放回 `slots`（仍带 `required:true`）**，与 `extraFields` 里的降级副本重复。 |
| **复现证据（修复前）** | `tests/main/schemaMerge.test.ts` **3/10 失败**：<br>· `expected [ 'onlyInSkeleton' ] to deeply equal []`（重复 key）<br>· `expected false to be true`（降级后仍 `required:true`）<br>· `expected [...] to have a length of 1 but got 2`（extra 槽位降级两次） |
| **影响更正** | 修复前 `fieldModel.declaredFields()` 已按 key 去重（`slots` 在前），所以**不会**真的重复渲染；真实危害是**降级失效 + required 残留**（BH2-002）。修复后此问题消失。 |
| **修改内容** | 重写 `augment` 尾部：<br>· `keepZone(list)` 单遍遍历，`slots` 与 `outputs` 各走一遍（同一槽位不可能被访问两次）；<br>· `demotedKeys` 集合保证同一 key 只降级一次（`slots`/`outputs` 撞名时）；<br>· **删除两处兜底**（`keptSlots.length > 0 ? … : slots` 与 outputs 同类），全部降级是合法结果——字段仍在 `extraFields`，UI 的 `declaredFields` 会把三个区合并。 |
| **修复后验证** | `tests/main/schemaMerge.test.ts` **10/10 通过**（含"重合场景回归"与"sampleCount=0 不降级"两条防过度修复的用例） |
| **剩余风险** | 行为变化：当骨架字段**全部**与本包样本不符时，表单从"全在普通区且必填"变为"全在高级区且可选"。这是**期望语义**（否则用户被要求填本包根本不存在的字段），但属**用户可见变化**，需在发布说明里提示。 |

### 2.5 BH-008 · 沙箱黑名单误伤注释/字符串（根因 R-F）

| 项 | 内容 |
| --- | --- |
| **修复前行为** | `inspectHookSource` 直接对源文件原文跑 `FORBIDDEN` 正则；注释里写 `import`、字符串里写 `'require'`、`fieldName('fs')` 都会被判为"使用了被禁用的能力"。 |
| **复现证据（修复前）** | `tests/plugins/hookBlacklist.test.ts` **3 个误伤用例失败**：<br>· `expected [ 'import', 'process', 'fs' ] to deeply equal []`<br>· `expected [ 'require', 'eval' ] to deeply equal []`<br>· `expected [ 'fs', 'Buffer', 'Symbol' ] to deeply equal []` |
| **修改内容** | 新增 `stripLiteralsAndComments()`：逐字符扫描，处理行注释 / 块注释 / 单双引号 / 模板字面量；**模板 `${...}` 内的代码被保留**（防止用反引号绕过）；转义引号正确处理；未闭合注释不抛错。`inspectHookSource` 改为只匹配剥离后的文本。 |
| **修复后验证** | `tests/plugins/hookBlacklist.test.ts` **12/12 通过**，其中 5 条是"不得放宽"的正向拦截断言（真实 `require(...)`、`process.`、`new Function(...)`、`` `${require("fs")}` ``、`__proto__`） |
| **剩余风险** | ① 剥离器不处理模板里 `${}` 的**嵌套模板**（`` `a${`b${c}`}` ``）——极罕见，且外层插值内容仍被保留为文本参与匹配，不会漏检；② 未改用 `acorn` 词法分析（更严谨但改动面大），已在用例注释里说明该升级路径；③ `Array.prototype.join` 这类**代码里**出现 `prototype` 仍会被拦——这是**有意保留**的安全策略，非误伤修复范围 |

### 2.6 BH-003 · 插件 `virtualItemPatterns` 完全无效（根因 R-G）

| 项 | 内容 |
| --- | --- |
| **修复前行为** | `matchesVirtualItem()` **零调用方**；`isVirtualItem()` 只按 `item.virtual === true` 与内置路径规则（`dummy`/`display`/`jei_`）判定，完全不看插件规则。文档 `docs/plugins/插件编写说明.md` §7 与规格 3.6.13 都承诺了该能力。 |
| **契约判定** | **属已承诺功能** → 按任务书要求**接通真实调用链**，而不是废弃字段。 |
| **修改内容** | ① `shared/search` 拆成 `isVirtualByNamingRules()`（仅内置规则）与 `isVirtualItem()`（内置 + 插件通配），新增 `setPluginVirtualMatchers()`；② `loader` 注册匹配器，并把编译正则**缓存**（`virtualMatcherList()`），在 `syncPluginLayer` / `resetPluginLoader` 时失效；③ `scanner/itemRules.ts`、`scanner/probeImport.ts` 改用 `isVirtualByNamingRules` —— 让写进 `items.json` 的 `virtual` **不随插件漂移**（否则同一份缓存时真时假）。 |
| **修复后验证** | `tests/plugins/virtualItemPatterns.test.ts` **7/7 通过**，含：通配命中为虚拟、未命中不受影响、扫描期仍为 false、`matchesVirtualItem` 与 `isVirtualItem` 一致、关闭后失效、重新启用恢复、内置空名规则不受影响 |
| **剩余风险** | ① **只改查询期**，不改扫描期持久化语义 → 不需要缓存迁移，但"已扫描进 `items.json` 的虚拟标记"不会因插件而变（设计如此）；② 性能：匹配器按需编译一次并缓存；若插件通配极多（数百条）× 43k 物品，每次查询是 `O(物品 × 通配)`，未做前缀索引——已在 BH-013 的待验证范围里；③ 通配语义 `*` → `[^/]*`，与文档 §7「不跨 `/`」一致 |

### 2.7 BH-009 / BH-010 · 渲染层失败语义（根因 R-E）

| 项 | 内容 |
| --- | --- |
| **修复前行为** | ① `ensureSchema` 用 `call()`（失败返回 `null`）并把 `null` 写进 `schemaCache`，而缓存判定是 `cached !== undefined` → 一次瞬时失败让该类型**整场会话**都拿不到 schema 且不会重试；② `pinCurrent`/`unpinCurrent` 失败时 `if (!x) return`，界面毫无反应；`unpin` 返回 `false`（本来未钉住）也被静默吞掉。 |
| **修改内容** | ① `ensureSchema` 改 `callOrThrow` + try/catch：失败**不写** `schemaCache`、给 error toast + 日志、返回 `null`（调用方语义不变）；② `pinCurrent`/`unpinCurrent` 改 `callOrThrow` + error toast；`unpin` 的 `false` 改为 **info** 提示「当前并未钉住」；`schema:get` 失败时**删除**缓存项（而非写 `null`/`undefined`——后者会被当成"该类型无 schema"永久命中）。 |
| **修复后验证** | `tests/renderer/benchSchemaFailure.test.ts` **7/7 通过** |
| **剩余风险** | ① `applyType` / `syncCurrentSchema` 在 `ensureSchema` 返回 `null` 时仍走原有的"通用布局"降级路径（本次未改其行为，只保证**下次能重试**）；② 未做真机 UI 验证（需启动应用） |

---

## 3. 测试执行记录

### 3.1 分模块针对性

| 命令 | 结果 |
| --- | --- |
| `vitest run tests/main/schemaMerge.test.ts` | 10 passed |
| `vitest run tests/main/schemaPin.test.ts` | 6 passed |
| `vitest run tests/main/pluginRegistrySync.test.ts` | 6 passed |
| `vitest run tests/plugins`（6 文件） | 89 passed |
| `vitest run tests/renderer/benchSchemaFailure.test.ts` | 7 passed |
| `vitest run tests/plugins/schema/main`（回归，25 文件） | 243 passed |

### 3.2 完整套件

| 时点 | 文件 | 用例 | 失败 |
| --- | --- | --- | --- |
| BUG-HUNT-01 基线 | 64 | 621 passed | 0 |
| 本轮最终 | **70**（68 passed + 2 skipped） | **673**（669 passed + 4 skipped） | **0** |

差值：**+6 文件 / +48 用例**，与新增测试文件完全对应 → **零回归、零破坏**。

### 3.3 静态校验

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`（node + web） | **通过**（曾因 `schemaCache[id] = undefined` 报 TS2322，已改为"删键"修复） |
| `npm run lint`（`--max-warnings=0`） | **通过** |

---

## 4. 流程偏差（如实披露）

| # | 偏差 | 影响 | 说明 |
| --- | --- | --- | --- |
| 1 | **BH-009 / BH-010 的测试是在修复之后写的**，未留存"修复前失败"的运行记录 | 中 | 违反「先写测试再改实现」。可核对性说明：旧实现 `call()` 失败返回 `null` 并执行 `set({schemaCache: {[id]: null}}) `，而用例断言 `schemaCache[TYPE]` 为 `undefined`、且断言必须有 `level:'error'` 的 toast——**这两条在旧实现下必然失败**。结论可信，但缺"先红后绿"的落地证据 |
| 2 | **BH-003 的测试同样写在实现之后** | 中 | 同上。旧实现下 `isVirtualItem({id:'bh02:marker/widget'})` 必然为 `false`（`VIRTUAL_PATH` 不匹配 `marker`），而用例断言 `true`；`matchesVirtualItem` 虽存在但因无调用方而不影响判定 → 用例在旧实现下必然失败 |
| 3 | 其余 6 个独立问题（BH-001/002/006/007/008 与 BH2-001/004/005）**均先跑出失败再修复** | — | 失败记录见各节「复现证据（修复前）」 |

> 补救说明：未回退代码做"先红"复跑，因为回退 9 个源文件再恢复的风险高于收益（无 Git 可依赖）。已改为在报告中逐条给**修复前逻辑 → 断言必然失败**的推导依据。

---

## 5. 未完成项与剩余风险

### 5.1 未处理（5 个独立问题）

| 编号 | 问题 | 卡点 | 建议下一步 |
| --- | --- | --- | --- |
| BH-013 | manifest 的 `recipeTypes`/`virtualItemPatterns` 无数量上限 | 需实测 10k 类型 manifest 的加载耗时才能定级；插件为本地文件，攻击面有限 | 构造大 manifest 实测，再决定是否加 `MAX_TYPES` |
| BH-014 | 插件缓存键只含路径/版本，不含文件签名 | 需先核对插件文档是否已声明"改插件需重启" | 若已声明 → 只加"重新加载插件"入口；否则把 mtime/size 纳入 key |
| BH2-003 | `looksBlockstate` 把 `{id,count}` 判为方块状态 | `{id,facing}` 与 `{id,count}` 结构上不可区分，收紧会误伤真 blockstate | 采真实样本统计后再定；可考虑把 `count`/`Count`/`amount` 排除出"属性" |
| BH2-004 | `kindForField` 缺 `'list'` 分支（嵌套数组元素） | `'list'` 不是 `FieldKind` 成员，需 UI 先支持嵌套数组编辑 | 属产品范围，登记为已知限制 |
| BH2-005 | 数量侧（`count`/`amount`）接受任意字符串 | 与 `chance` 分支不对称（`chance` 已要求"可转数字"） | 统一口径需产品确认：模组里确有 `"0.07"` 之类字符串数值 |

### 5.2 修复引入的行为变化（需在发布说明中告知）

| 变化 | 原因 | 影响面 |
| --- | --- | --- |
| 骨架字段全部与本包样本不符时，字段落到**高级（可选）区**而非普通（必填）区 | BH-006 修复（删除矛盾的兜底） | 使用插件/推断类型的用户；属**纠正**，但用户会看到布局变化 |
| 插件通配现在**真的会隐藏物品** | BH-003 接通承诺功能 | 装了带 `virtualItemPatterns` 插件的用户；与文档一致 |
| 钉住会保存**你看到的那一份** schema | BH-001 | 钉住结果的来源更符合预期 |

### 5.3 尚未验证的边界

| 项 | 原因 |
| --- | --- |
| 真机并发（多步序列配方首次打开） | 需启动应用，本轮不允许 |
| 真实整合包下 `augment` 降级行为（含 `key` 槽位） | 需扫描真实包 |
| 插件通配在 43k 物品下的查询耗时 | 需真实数据 + 启动应用 |
| `cacheHit` 运行时值 | 仍为**未测量**；本轮**未**把缺少运行时证据包装成缓存缺陷 |
| 渲染层 UI 实际呈现（toast 可见性、布局变化） | 需启动应用 |

---

## 6. 未触碰的保护边界（逐项确认）

| 边界 | 状态 |
| --- | --- |
| 正式台账 V9 | **未修改**（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`） |
| 生产 `userData` | **未访问、未修改** |
| `dist/`、`dist-011/` 构建产物 | **未触碰** |
| `E:/_trash_20261101_recipe-studio` | **未触碰** |
| npm 缓存 / 历史证据 | **未清理** |
| 安装包 / 版本号 / 发布配置 | **未修改**（`package.json` 仍 0.1.1，仅源码与测试变更） |
| 构建 / 安装 / 卸载 / 发布 | **未执行** |
| 删除任何既有测试 | **未执行** |
| 放宽断言 / 加 skip 制造通过 | **未执行** |

---

## 7. 已修复项验收对照

| 编号 | 验收标准 | 证据 | 结论 |
| --- | --- | --- | --- |
| BH-001 | 落盘 == 提交；返回值 == 提交；id 不一致拒绝 | `schemaPin.test.ts` 3 例 | **通过** |
| BH-002 | 并发 list 均非空且等长；并发 get 非 null；list 与 coverage 类型数一致 | `schemaPin.test.ts` 3 例 | **通过** |
| BH-003 | 通配命中为虚拟、未命中不受影响、扫描期不漂移、开关即时生效 | `virtualItemPatterns.test.ts` 7 例 | **通过** |
| BH2-001/BH-004/BH-005 | 装插件即可见；重建后仍在；连续两次重建仍在；关闭即失效；启用恢复；不影响内置 | `pluginRegistrySync.test.ts` 6 例 | **通过** |
| BH-006/BH-007 | 无重复 key；降级后 required 非 true；extra 槽位只降级一次；重合场景回归；sampleCount=0 不降级 | `schemaMerge.test.ts` 5 例（+5 例 applyMerge 回归） | **通过** |
| BH-008 | 注释/字符串不误伤；真实逃逸仍拦；模板插值仍拦；转义与未闭合不崩 | `hookBlacklist.test.ts` 12 例 | **通过** |
| BH-009/BH-010 | 失败不污染缓存、有 error toast、可重试、成功即缓存、pin 不谎报、unpin false 不谎报 | `benchSchemaFailure.test.ts` 7 例 | **通过**（其中"修复前失败"未留存，见 §4） |
| BH-011/BH-012 | 有针对性测试且断言最终行为 | `schemaMerge` 10 + `schemaPin` 6 | **闭合** |
