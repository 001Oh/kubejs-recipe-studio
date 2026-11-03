# BUG-HUNT-02-RV1 · 集中修复报告（FIX-REPORT）

> **工程**：`E:\mc kjs`｜**执行时间**：2026-11-01 09:22–09:32
> **基线**：台账 V9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，**只读，未修改**）
> **本轮允许范围**：源码 + 测试 + 新报告。**未**构建、**未**安装、**未**启动应用、**未**改台账、**未**触碰生产 userData / `dist` / `dist-011` / 隔离区 / npm 缓存、**未**改版本号或打包配置。

---

## 1. 文件级备份（项目无 Git）

备份目录：`.cache/bh02-rv1-fix-backup-0911/`，按原目录结构保存。共备份 **10 个对象**，其中 **7 个待改文件**逐一 `sha256` 对照校验通过（其余 3 个为"备份但最终未改"的文件）。

| 备份对象 | 说明 |
| --- | --- |
| `src/main/schema/registry.ts` | 本轮改动最大（RV1-001 / RV1-002 / RV1-003 / RV1-007） |
| `src/main/schema/service.ts` | RV1-002 / RV1-003 |
| `src/main/plugins/loader.ts` | RV1-002 / RV1-003 / BH-014 |
| `src/main/plugins/hookSandbox.ts` | RV1-005 / RV1-006 |
| `src/main/codegen/preview.ts` | RV1-009 |
| `src/main/recipes/selectSchema.ts` | **备份但最终未改**（见 §3.2） |
| `src/main/scanner/itemRules.ts` | RV1-009 同类注释 |
| `src/main/scanner/itemIndex.ts` | 备份但**未改**（RV1-008 判定无需改） |
| `src/main/handlers/itemsHandlers.ts` | 备份但**未改** |
| `tests/plugins/hookBlacklist.test.ts`、`tests/main/schemaMerge.test.ts` | 追加用例前备份 |

> **一次受控回退**：为取得 RV1-001 的"修复前"证据，曾把 `registry.ts` 临时换回备份版本运行测试，随后按原编辑重新应用并**用 sha256 校验回到修复版**（`5e2605efd942cbc925102e1db481586549524f289ae856f9dcc5438fbb0cef8f`，逐字节一致）。

---

## 2. 本轮实际修改的源码（6 个）

| 文件 | 改动 | 对应问题 |
| --- | --- | --- |
| `src/main/schema/registry.ts` | ① `applyMerge()` 开头 `effective.clear()`（完整重建）；② 新增 `snapshotLayer` / `fetchLayer`（失败可区分）；③ 新增 `setFactsProvider` / `refreshEffective`；④ `pinSchema`/`unpinSchema` 失败回滚；⑤ `augment` 的 `extraFields` 按 key 去重 | RV1-002(b)、RV1-003、RV1-001、RV1-007 |
| `src/main/schema/service.ts` | ① 注册 facts provider；② 重建时先快照插件层，provider 失败则恢复快照 | RV1-002、RV1-003 |
| `src/main/plugins/loader.ts` | ① `syncPluginLayer()` 末尾 `refreshEffective()`；② 读取覆盖层失败时保留旧层不抛错；③ 缓存键加入插件文件签名（mtime+size+路径） | RV1-002、RV1-003、BH-014 |
| `src/main/plugins/hookSandbox.ts` | 改用 **acorn 词法器**剥离字面量（字符串/正则/模板文本），语法非法时回退字符扫描 | RV1-005、RV1-006 |
| `src/main/codegen/preview.ts` | 重写 `loadSchema` 的注释（原写"注册表唯一调用点"，与 `selectSchema` 也直读的事实矛盾） | RV1-009 |
| `src/main/scanner/itemRules.ts` | 修正头部注释（原写"统一走 `isVirtualItem()`"，实际已改为 `isVirtualByNamingRules`） | RV1-009 同类 |

**未修改但被评估**：
- `src/main/recipes/selectSchema.ts` — RV1-002 在 registry 侧根治（`refreshEffective` + `applyMerge` 清表），**无需改它的同步签名**。
- `src/main/scanner/itemIndex.ts` / `src/main/handlers/itemsHandlers.ts` — RV1-008 判定"无可复现瓶颈"，不改。

---

## 3. 逐项根因与修复方式

### 3.1 RV1-001 · pin/unpin 写盘失败后内存不一致（P2）

- **根因**：`pinSchema` 先 `pinned.set` + `effective.set`，再 `await persistPinned()`；`unpinSchema` 先 `pinned.delete` 再写盘。写盘失败时错误抛给调用方，但**内存已改且不回滚**。
- **修复**：写入前记录 `prevPinned` / `prevEffective`；`persistPinned()` 抛错时恢复记忆体并 `logger.error` 后原样抛出；`unpinSchema` 对"本来未钉住"直接返回 `false`，不碰磁盘。
- **行为差异**：修复前 = 报失败但会话内已生效、重启后消失；修复后 = 报失败且内存/磁盘都保持原状。
- **影响范围**：仅 `schema:pin` / `schema:unpin` 失败路径（正常路径不变）。

### 3.2 RV1-002 · 插件禁用后同步路径仍可能用到旧 schema（P2）

- **根因（两个，本轮都修了）**：
  1. `syncPluginLayer()` 只 `replaceLayer` + `invalidateSnapshot()`，**不重建 `effective`**；而 `codegen/preview.loadSchema()` 与 `recipes/selectSchema` 都是**直接 `getSchema()`**（不调 `ensureSchemas()`）。
  2. **本轮新发现**：`applyMerge()` 只 `effective.set(...)`、**从不删除**已消失类型的条目。所以即使调用 `refreshEffective()`，被关闭插件的类型仍会留在 `effective` 里 —— 这是测试跑出来的（首次运行 4 例失败）。
- **修复**：
  - `applyMerge()` 开头 `effective.clear()`，语义回归"完整重建"（`upsert` 仍能存活，因为它同时写层）；
  - registry 新增 `setFactsProvider` / `refreshEffective`，`service` 在模块加载时注册 `schemaFacts`；
  - `syncPluginLayer()` 末尾调用 `refreshEffective()`。
- **为什么没改 `selectSchema`**：它是同步函数，被 `openRecipe` / `commitRecipe` 作为默认依赖注入；在 registry 侧保证 `effective` 及时正确，比把整条同步链改成异步风险小得多。
- **行为差异**：修复前 = 关插件后要等下一次 `schema:*` 才生效；修复后 = 关的瞬间 `getSchema` 即为 `null`。

### 3.3 RV1-003 · provider 异常被当成"空层"（P2）

- **根因**：`providedSchemas()` 把 provider 异常吞成 `[]`，调用方 `replaceLayer(layer, [])` 清空正常层。
- **修复**：
  - `fetchLayer()` 返回 `{ ok: true, schemas }` / `{ ok: false, error }`，删除会误用的 `providedSchemas` 垫片；
  - `ensureSchemas()` 在 `clearSchemas()` **之前**用 `snapshotLayer('plugin')` 取快照，失败时用快照恢复（因为 `clearSchemas` 会先清空所有层，只在失败分支"跳过替换"是不够的——这是本轮实现的第二次修正）；
  - `syncPluginLayer()` 包 try/catch，失败时保留当前层并 WARN，不再把异常抛给 `plugins:setEnabled`。
- **行为差异**：修复前 = 一次读取异常 → 所有插件类型消失；修复后 = 保留上一次的层。

### 3.4 RV1-004 · 虚拟物品缺少完整链路测试（测试缺口）

- **核实**：`isVirtualItem` 在源码中**只有一个调用点**（`search.ts:239` 语料构建），查询期 `accepts()` 只读 `virtualMask`（`search.ts:146`）。因此插件通配的影响发生在**语料构建期**，但此前 7 个用例只断言 `isVirtualItem()` 函数本身。
- **本轮**：补 3 条**语料级**用例（构建 → 查询 → 断言可见/不可见 → 关闭插件后重建语料的行为）。
- **未改语义**：插件开关后**不自动重建语料**，这是既有设计（`itemIndex.ts` 注释："语料只在索引被替换时重建"）。用例把该语义写成可执行契约，并标注为"需重建才更新"。**未擅自改成即时重建**（会引入 43k 物品的整表重建开销，属产品决策）。
- **另发现**：`tests/algorithms/virtualFilter.test.ts` **已**覆盖语料的查询期过滤（7 例 + 41k 性能），但只用 `virtual: true` 标记，不涉及插件通配 → 与本轮新增用例互补，不是重复。

### 3.5 RV1-005 / RV1-006 · 正则字面量与嵌套模板（P3）

- **根因**：字符扫描不识别 `/.../`，`/[/*]/` 里的 `/*` 被当成块注释开始，吞掉后续代码 → 黑名单漏检；嵌套模板的内层 `}` 会提前结束插值。
- **修复**：`stripLiteralsAndComments` 优先用 **acorn `tokenizer`**（项目已有依赖，`codegen/validate.ts` 已在用），只保留非 `string`/`regexp`/`template` token 的文本；`${...}` 内的表达式仍产生普通 token，因此插值中的调用照样被检查。**语法非法时回退字符扫描**（此时钩子也编译不过、不会执行）。
- **安全边界说明（重要）**：这是**扫描漏检**的修复，**不是**沙箱逃逸。真实边界仍是 `vm` + `codeGeneration:{strings:false,wasm:false}` + 只注入 JSON 数据的上下文——其中**没有** `require` / `process` / `fs`，被漏检的调用执行时只会 ReferenceError。
- **行为差异**：修复前 = 含 `/[/*]/` 的钩子可让后续 `require` 不被静态检查发现；修复后 = 照常检出，且正则/模板文本里的禁用词不再误伤。

### 3.6 RV1-007 · `extraFields` 同 key 边界（P3）

- **根因**：`extraFields: [...(skeleton.extraFields ?? []), ...demoted]`，若骨架自带的 `extraFields` 与被降级的槽位同 key，会出现两份。
- **修复**：按 key 去重后再追加（保留骨架原有那份）。
- **影响范围**：仅影响"骨架 slots/outputs 与 extraFields 存在同名 key"的畸形 schema；内置数据无此重叠。

### 3.7 RV1-008 · 大规模匹配性能（评估后不改）

- **核实**：`isVirtualItem` 唯一调用点是**语料构建**（`search.ts:239`），查询期走 `virtualMask` 位图；`virtualMatcherList()` 已缓存编译后的正则。
- **结论**：匹配开销是**每次索引构建一次**的 `O(物品 × 通配)`，不进入查询热路径。既有 `tests/algorithms/virtualFilter.test.ts` 有 41,000 条物品的查询期预算断言（最坏 < 16ms），可作旁证。
- **处理**：**不改**。任务要求"没有可复现的实际问题不要大规模重构"；本项没有可复现瓶颈，且无真实插件通配数量的数据支撑阈值。

### 3.8 RV1-009 · 过期注释（P3）

- `codegen/preview.ts`：原注释"schema 注册表的唯一调用点"与事实矛盾（`recipes/selectSchema.ts` 也直读 `getSchema`）。已改为说明"同步读、不触发重建、插件开关会立即重建、换包需等下次 `schema:*`"。
- `scanner/itemRules.ts`：原注释"虚拟物品判定统一走 `isVirtualItem()`"与 BH-003 修复后的实现（`isVirtualByNamingRules`）矛盾，已改写并说明为何扫描期不能叠加插件通配。

### 3.9 BH-014 · 插件缓存键缺文件签名（本轮修复）

- **根因**：`loadPlugins` 的 key 只有 `modpackPath / userDir / modsDir / appVersion`；同路径改内容不重载。且插件文档**没有**"改动需重启"的说明（已检索 `docs/plugins/插件编写说明.md`，无匹配）。
- **修复**：新增 `pluginFilesSignature(entries)`（路径 + 取整 mtime + size），键并入签名；`statSync` 失败时记 `missing` 而不抛错。
- **代价**：每次 `loadPlugins` 多 N 次 `stat`（N = 插件文件数，通常个位数）；解析本身仍由 key 命中缓存。
- **行为差异**：修复前 = 改插件必须重启；修复后 = 下一次 `plugins:list` / `schema:*` 即读到新内容。

---

## 4. BUG-HUNT-01 原始编号 → 最终实现与测试 映射（完整保留，不因合并而删除）

| 编号 | 原始问题 | BUG-HUNT-02 是否改 | 本轮是否改 | **最终状态** | 实现位置 | 测试位置 |
| --- | --- | --- | --- | --- | --- | --- |
| **BH-001** | `schema:pin` 校验后丢弃提交内容 | 是 | 否 | **已修复并验证** | `service.ts` `togglePin(…, override)`、`schemaHandlers.ts` | `schemaPin.test.ts`（6 例，含直读落盘） |
| **BH-002** | `ensureSchemas` 并发短路 + 失败缓存 | 是 | 否 | **已修复并验证** | `service.ts` in-flight + 成功后写戳 | `schemaPin.test.ts`（并发 3 例） |
| **BH-003** | `virtualItemPatterns` 无效 | 是 | 否（仅补测试） | **已修复并验证** | `search.ts` 双入口 + `loader` 注册匹配器 | `virtualItemPatterns.test.ts`（10 例，含本轮 3 例语料链路） |
| **BH-004** | 插件层被 `clearSchemas` 清空 | 是 | 否 | **已修复并验证** | `service.ts` 装配 plugin 层 + `loader.syncPluginLayer` | `pluginRegistrySync.test.ts`（6 例） |
| **BH-005** | `setEnabled` 不同步注册表 | 是 | 是（补 `refreshEffective`） | **已修复并验证** | `loader.ts` `syncPluginLayer` | `pluginRegistrySync` + `pluginSchemaFreshness`（9 例） |
| **BH-006** | `augment` 降级失效 / `required:true` 残留 | 是 | 否 | **已修复并验证** | `registry.ts` `keepZone` 单遍 + 删兜底 | `schemaMerge.test.ts` |
| **BH-007** | `zone:'extra'` 槽位重复降级 | 是 | 否 | **已修复并验证** | `registry.ts` `demotedKeys` | `schemaMerge.test.ts` |
| **BH-008** | 沙箱黑名单误伤注释/字符串 | 是 | 是（升级为词法器） | **已修复并验证** | `hookSandbox.ts` acorn tokenizer | `hookBlacklist.test.ts`（18 例） |
| **BH-009** | `ensureSchema` 把失败缓存为 `null` | 是 | 否 | **已修复并验证**（证据限制见 TEST-REPORT §4） | `benchUiStore.ts` | `benchSchemaFailure.test.ts`（7 例） |
| **BH-010** | pin/unpin 失败静默 | 是 | 是（配合 RV1-001） | **已修复并验证**（同上） | `benchUiStore.ts` + `registry.ts` | `benchSchemaFailure` + `schemaPinRollback`（5 例） |
| **BH-011** | schema 合并核心无单测 | 是（补测试） | 否 | **已修复（测试缺口闭合）** | — | `schemaMerge.test.ts`（12 例） |
| **BH-012** | pin 无落盘断言 | 是（补测试） | 否 | **已修复（测试缺口闭合）** | — | `schemaPin.test.ts` |
| **BH-013** | manifest 无数量上限 | 否 | **否** | **仍未解决，暂缓处理** | — | 见 REMAINING |
| **BH-014** | 插件缓存键无文件签名 | 否 | **是** | **本轮修复** | `loader.ts` `pluginFilesSignature` | `pluginCacheKey.test.ts`（3 例） |

### 4.1 BUG-HUNT-02 新编号

| 编号 | 关系 | 最终状态 |
| --- | --- | --- |
| **BH2-001** | 深化 BH-004（插件类型可能从未进注册表） | **已修复并验证**（并入 BH-004 簇；`pluginRegistrySync` 首例锁定） |
| **BH2-002** | 更正 BH-006 的影响描述（非重复渲染，而是降级失效 + required 残留） | **已收敛**（BH-006 修复后不再存在；`schemaMerge` 的 required 断言锁定） |
| **BH2-003** | `{id,count}` 可能被判为 blockstate | **仍未解决，暂缓**（需真实样本；收紧会误伤真 blockstate） |
| **BH2-004** | `kindForField` 缺 `list` 分支 | **确认不构成缺陷**（见 §5） |
| **BH2-005** | 数量侧接受任意字符串 | **仍未解决，暂缓**（需产品口径） |
| **BH2-006** | `planLevelMerge` 保守行为 | **已排除**（前轮结论，本轮未改） |
| **BH2-007** | `registry.upsert` 无调用方 | **已排除**（保留公开 API） |

### 4.2 RV1 编号

| 编号 | 最终状态 | 实现 | 测试 |
| --- | --- | --- | --- |
| **RV1-001** | **本轮修复** | `registry.ts` pin/unpin 回滚 | `schemaPinRollback.test.ts`（5 例，**含真 red 证据**） |
| **RV1-002** | **本轮修复**（含新发现的 `applyMerge` 不清表） | `registry.ts` `applyMerge` 清 `effective` + `refreshEffective`；`loader.ts` 同步调用 | `pluginSchemaFreshness.test.ts`（9 例，**有 red 证据**） |
| **RV1-003** | **本轮修复** | `fetchLayer` + `snapshotLayer` + `syncPluginLayer` 保护 | `pluginSchemaFreshness.test.ts`（3 例） |
| **RV1-004** | **本轮补测试**（语义未改） | — | `virtualItemPatterns.test.ts` 新增 3 例 |
| **RV1-005** | **本轮修复** | `hookSandbox.ts` acorn tokenizer | `hookBlacklist.test.ts` 新增 2 例 |
| **RV1-006** | **本轮修复** | 同上 | 新增 2 例 |
| **RV1-007** | **本轮修复** | `registry.ts` extraFields 去重 | `schemaMerge.test.ts` 新增 2 例 |
| **RV1-008** | **已评估，不改** | —（见 §3.7） | 沿用既有 41k 性能测试 |
| **RV1-009** | **本轮修复** | `preview.ts` + `itemRules.ts` 注释 | 无测试（纯注释） |

---

## 5. BH2-004 判定为"确认不构成缺陷"的依据

`infer.ts` 的 `kindForField` 对"元素本身是数组"的字段：`classifyPrimitive(levelOf(f))` 返回 `'list'` → 五个 `if` 都不命中 → 落到 `shapeCounts` 兜底。逐项代入：`c.string + c.number + c.boolean === 0`（元素是数组）→ 跳过混合判断；`c.boolean === 0`；`c.number === 0`；`c.string === 0`；最终 `return c.object > 0 ? 'struct' : 'unknown'` → **`'unknown'`**。

`'unknown'` 正是"无法用 11 种控件表达 → 归入高级 JSON 编辑"的设计出口（`FieldKind` 本身没有 `'list'`）。因此"缺 `'list'` 分支"不会产生错误类型，只是少了一个更精确的名字。**本轮不改**，避免为一个不存在的错配引入新的 `FieldKind` 与 UI 分支。

---

## 6. 修复前后行为差异汇总

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 钉住时 userData 只读 / 磁盘满 | 报错，但本会话已钉住；重启后消失 | 报错，内存与磁盘都保持原状 |
| 取消钉住时写盘失败 | 报错，但内存已取消 | 报错，钉住状态保留 |
| 设置页关闭插件 → 打开该类型配方 / 生成预览 | 仍用已关闭插件的 schema（直到下次 `schema:*`） | 立刻不可用（走通用兜底） |
| 插件 provider 读取异常 | 所有插件类型消失 | 保留上一次的层 |
| 钩子含 `/[/*]/` 正则 | 后续 `require` 不被静态检查发现 | 正常检出 |
| 钩子注释/字符串里含 `import`/`fs` | 被误判为使用禁用能力而拒绝 | 正常通过 |
| 钩子用嵌套模板 | 内层 `}` 提前结束插值 | 正确解析 |
| 同路径改插件清单内容 | 必须重启应用 | 下次加载即生效 |
| 骨架 `extraFields` 与降级项撞名 | `extraFields` 出现两份 | 只保留一份 |
| 扫描期虚拟物品标记 | 只按内置命名规则（BH-003 已保证） | 不变（本轮未动语义） |

---

## 7. 受保护对象确认

| 对象 | 状态 |
| --- | --- |
| `docs/PROJECT-SEALING-LEDGER-REPORT.md` | MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，**未修改**，未生成 V10 |
| `package.json` / `package-lock.json` | SHA-256 未变（`bad1fafd…` / `dc95d17f…`） |
| `dist/win-unpacked/resources/app.asar` | SHA-256 未变（`56c90213…`） |
| `dist-011/win-unpacked/resources/app.asar` | SHA-256 未变（`a8024ec7…`） |
| 生产 userData / 隔离目录 / npm cache | **未访问、未清理** |
| 构建 / 安装 / 卸载 / 启动 / 发布 | **均未执行** |
| 既有测试 | **无删除、无新 skip、无放宽断言**（文件数 70 → 73，均为新增） |
