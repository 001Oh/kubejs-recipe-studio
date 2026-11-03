# BUG-HUNT-02 · 统一核实、去重与修复计划（REPAIR-PLAN）

> **工程**：`E:\mc kjs`｜**基线**：台账 v9（MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`，**未修改**）
> **输入**：`BUG-HUNT-01-FINDINGS/SUMMARY`（BH-001～014）+ `BUG-HUNT-02-FINDINGS`（BH2-001～007）
> **本文件只做规划与验收定义**；实际改动与测试结果见 `BUG-HUNT-02-REPAIR-REPORT.md`

---

## 1. 优先级重评（不沿用旧评级）

重评依据：**是否影响数据安全 → 是否让核心功能失效且不可自愈 → 是否有可见错误行为 → 是否只是体验/口径**。

| 编号 | BUG-HUNT-01 评级 | **本轮重评** | 重评理由 |
| --- | --- | --- | --- |
| BH-001 | P2 | **P1** | 唯一会**写 userData** 的缺陷；写入内容是合法 schema，故不构成"损坏/丢失"→ 不到 P0；但"回报成功却写入另一份"属核心状态一致性破坏 |
| BH-002 | P1 | **P1** | 核心功能（类型/字段枚举）失效且**整场会话不可自愈** |
| BH-003 | P2 | **P2** | 文档化能力静默失效；不影响数据 |
| BH-004 | P1 | **P1** | 插件类型**从未**可靠出现（BH2-001 证实比原描述更严重） |
| BH-005 | P2 | **P2**（与 BH-004 合并为 1 个根因簇） | 用户控制失灵；不写数据 |
| BH-006 | P2 | **P2** | 降级失效 → 用户被要求填本包不存在的必填字段（BH2-002 更正后危害更明确） |
| BH-007 | P3 | **P3**（并入 BH-006 修复） | 同一函数同一改法 |
| BH-008 | P2 | **P2** | 合法钩子被拒 + 错误信息指错方向 |
| BH-009 | P2 | **P2** | 放大 BH-002，且让失败不可重试 |
| BH-010 | P3 | **P3** | 反馈缺失，不改变结果 |
| BH-011 | C | **C**（已闭合） | 测试缺口 |
| BH-012 | C | **C**（已闭合） | 测试缺口 |
| BH-013 | P3 | **P3** | 需实测才有结论 |
| BH-014 | P3 | **P3** | 需先核对文档是否已声明"改插件需重启" |
| BH2-001 | — | **P1**（并入 BH-004 簇） | 见上 |
| BH2-002 | — | 更正（随 BH-006） | — |
| BH2-003/004/005 | — | **P3** | 需真实样本才能定级 |

**P0 = 0 项**：本轮所有已确认缺陷都**不造成配方文件损坏或不可恢复丢失**。`recipes:commit` 的写入链本轮未发现新缺陷。

---

## 2. 根因分组（修复以根因为单位，不按表面症状打补丁）

| 根因 | 覆盖编号 | 一句话 |
| --- | --- | --- |
| **R-A 插件层与 schema 注册表之间没有"层同步"机制** | BH-004、BH-005、BH2-001 | 注册表只有 `upsert`（增改）**没有按层撤销/按层重装**；`clearSchemas()` 整层清空后没人再装回来；`setEnabled` 完全不通知注册表 |
| **R-B `ensureSchemas` 的"先写戳后组装"** | BH-002 | 并发第二个调用看到戳已更新即返回，此时 `effective` 还是空的 |
| **R-C `schema:pin` 校验后丢弃入参** | BH-001 | `assertPinnable` 校验一份将被丢掉的对象，真正落盘的是注册表当前值 |
| **R-D `augment` 的"两遍过滤 + 共享 demoted + 兜底回填"** | BH-006、BH-007 | 三者叠加导致"降级后又放回去"和"同一字段推两次" |
| **R-E `call()` 的 `null` 同时表示"失败"与"未知/空"** | BH-009、BH-010 | `api.ts` 已提供 `callOrThrow`，但这两处消费方仍用 `call()` 并各自解释 `null` |
| **R-F 黑名单匹配原文而非可执行文本** | BH-008 | 注释与字符串里的英文单词被当成"使用了禁用能力" |
| **R-G 文档承诺的能力没有调用方** | BH-003 | `matchesVirtualItem()` 零调用；`isVirtualItem()` 不接插件规则 |

---

## 3. 修复批次

### 批次 1 · 并发初始化（R-B）｜P1

- **编号**：BH-002
- **改法**：`service.ensureSchemas` 改为**共享 in-flight Promise**，只在组装成功后写快照戳；失败时不写戳（保证可重试）。
- **改动点**：`src/main/schema/service.ts`
- **验收标准**：
  1. `Promise.all([schemaSummaries(), schemaSummaries()])` 两次结果都非空且长度相同；
  2. 并发 `schema:get` 都返回 schema，不返回 `null`；
  3. 并发 `schema:list` 与 `schema:coverage` 的类型数一致；
  4. `loadPinned` 抛错后下一次调用会重试（戳未被污染）。
- **风险**：低。快照戳语义从"已开始"变为"已完成"，只会让重建更保守。

### 批次 2 · 钉住契约（R-C）｜P1

- **编号**：BH-001（+ BH-010 的反馈部分在批次 7）
- **改法**：`togglePin(typeId, on, override?)`；`on=true` 且给了 override 时落盘 override（`id` 强制对齐 `typeId`）；handler 把已校验的 `schema` 传下去。
- **改动点**：`src/main/schema/service.ts`、`src/main/handlers/schemaHandlers.ts`
- **验收标准**：
  1. 提交 `displayName` 与注册表不同的 schema，`customRecipeTypes.json` 落盘的就是提交值；
  2. 返回值也是提交值（UI 据此覆盖本地状态）；
  3. `typeId` 与 `schema.id` 不一致时拒绝（不写盘）。
- **风险**：中低。开始真正信任渲染端对象——但 `assertPinnable` 的结构校验仍在，且对象本就来自 `schema:get`。

### 批次 3 · 插件层同步（R-A）｜P1

- **编号**：BH-004、BH-005、BH2-001
- **改法**（根因级，一次改完）：
  1. `registry` 增加 `replaceLayer(layer, schemas)` —— 按层整体替换，补上"撤销"能力；
  2. `registry` 增加**层数据提供者**注册（`setLayerProvider` / `providedSchemas`），避免 registry 反向依赖 loader；
  3. 快照戳移交 `registry` 保管（`readSnapshotStamp` / `writeSnapshotStamp` / `invalidateSnapshot`），让 loader 能**同步**失效；
  4. `ensureSchemas` 每次重建都 `replaceLayer('plugin', providedSchemas('plugin'))`；
  5. `loader` 用 `syncPluginLayer()` 取代 `void pushToRegistry(...)`，并在 `setEnabled` 末尾调用；
  6. 删除死代码 `pushToRegistry` / `REGISTRY_MODULE`。
- **改动点**：`src/main/schema/registry.ts`、`src/main/schema/service.ts`、`src/main/plugins/loader.ts`
- **验收标准**：
  1. 装插件后 `schema:list` 含其类型；
  2. 强制重建后仍含；**连续两次**重建后仍含；
  3. `setEnabled(false)` 后立即不含；`(true)` 后恢复；
  4. 关闭插件不影响内置类型。
- **风险**：中。涉及层装配顺序；靠完整套件（含 25 个 main/plugins/schema 测试文件）回归。

### 批次 4 · `augment` 降级语义（R-D）｜P2

- **编号**：BH-006、BH-007（+ BH2-002 更正）
- **改法**：
  1. 每个槽位**只遍历一次**（删除两遍 `keep` 与共享 `demoted`），`slots` 与 `outputs` 各走一遍，同一 key 只降级一次；
  2. **删除** `keptSlots.length > 0 ? keptSlots : slots` 兜底与 outputs 的同类兜底——全部降级是合法结果（字段仍在 `extraFields`，UI 的 `declaredFields` 会把三个区合并）。
- **改动点**：`src/main/schema/registry.ts`
- **验收标准**：
  1. 骨架与样本完全不重合时，同一 key 不在 `slots` 与 `extraFields` 同时出现；
  2. 被降级字段的 `required` 不为 `true`；
  3. `slots` 里 `zone:'extra'` 的槽位在 `extraFields` 只出现一次；
  4. 重合场景回归：字段留在 `slots`、不进 `extraFields`；
  5. `sampleCount=0` 时**不降级**（不能因为"没样本"就把整个骨架搬进高级区）。
- **风险**：中。会改变"骨架字段全部与本包不符"时的表单形态（从"全在普通区且必填"变为"全在高级区且可选"）——这是**期望行为**，但需在报告里向用户说明。

### 批次 5 · 插件虚拟物品通配（R-G）｜P2

- **编号**：BH-003
- **改法**：
  1. `shared/search` 拆出 `isVirtualByNamingRules()`（仅内置规则）与 `isVirtualItem()`（内置 + 插件通配）；新增 `setPluginVirtualMatchers()` 供主进程注册；
  2. `loader` 注册匹配器，并把编译后的正则**缓存**（否则 43k 物品 × N 插件会明显卡顿），在 `syncPluginLayer` / `resetPluginLoader` 时失效；
  3. `scanner/itemRules`、`scanner/probeImport` 改用 `isVirtualByNamingRules` —— 保证 `items.json` 的 `virtual` **不随插件漂移**（缓存稳定性）。
- **改动点**：`src/shared/search.ts`、`src/main/plugins/loader.ts`、`src/main/scanner/itemRules.ts`、`src/main/scanner/probeImport.ts`
- **验收标准**：
  1. 通配命中的物品 `isVirtualItem` 为 true；
  2. 未命中不受影响；
  3. `isVirtualByNamingRules` 对同一物品仍为 false（扫描期不漂移）；
  4. `matchesVirtualItem` 与 `isVirtualItem` 结论一致；
  5. 关闭插件后通配立即失效，重新启用后恢复。
- **风险**：中低。**不改**扫描期持久化语义，因此不需要缓存迁移。

### 批次 6 · 沙箱黑名单精度（R-F）｜P2

- **编号**：BH-008
- **改法**：新增 `stripLiteralsAndComments()`（逐字符扫描，处理行注释/块注释/单双引号/模板字面量，**保留模板 `${}` 内的代码**），`inspectHookSource` 只匹配剥离后的文本。
- **改动点**：`src/main/plugins/hookSandbox.ts`
- **验收标准**：
  1. 注释/字符串里的 `import`/`fs`/`Buffer`/`Symbol`/`require` 不再报错；
  2. 真实 `require(...)` / `process.` / `new Function(...)` / `__proto__` 仍被拦；
  3. **模板插值里的调用**（`` `${require("fs")}` ``）仍被拦；
  4. 转义引号不会提前结束字符串；未闭合注释不崩溃。
- **风险**：低-中。黑名单是 `vm` + `codeGeneration:false` 之外的第二道防线；剥离后**只减少误报**，不减少对真实调用的检测（模板插值已覆盖）。

### 批次 7 · 渲染层失败语义（R-E）｜P2 / P3

- **编号**：BH-009、BH-010
- **改法**：
  1. `ensureSchema` 改 `callOrThrow` + try/catch；失败**不写** `schemaCache`、给 error toast 与日志，返回 null（调用方语义不变）；
  2. `pinCurrent` / `unpinCurrent` 改 `callOrThrow`，失败给 error toast；`unpin` 返回 `false`（本来未钉住）给 info 提示而非静默；`schema:get` 失败时**删除**缓存项而不是写 `null`/`undefined`。
- **改动点**：`src/renderer/src/views/bench/benchUiStore.ts`
- **验收标准**：
  1. 失败不污染 `schemaCache`（值为 `undefined`）；
  2. 失败有 error toast；
  3. 失败后再次调用能真正重试并拿到结果；
  4. 成功结果被缓存、第二次不重复请求；
  5. pin 失败不谎报成功；pin 成功采用返回值；
  6. unpin 返回 false 时不显示"已取消钉住"。
- **风险**：低。

### 批次 8 · 测试缺口闭合｜C

- **编号**：BH-011、BH-012
- **改法**：新增 `tests/main/schemaMerge.test.ts`（`augment`/`applyMerge` 行为）、`tests/main/schemaPin.test.ts`（落盘契约 + 并发）。
- **验收标准**：用例断言**最终产出**（schema 内容、落盘 JSON、返回值），不断言内部函数被调用。

### 批次 9 · 需决策或需实测（本轮**不修**）

| 编号 | 卡在哪 | 需要什么 |
| --- | --- | --- |
| BH-013 | manifest 数量上限 | 先实测 10k 类型 manifest 的加载耗时，再决定是否值得加 |
| BH-014 | 插件缓存键无文件签名 | 先核对 `docs/plugins/插件编写说明.md` 是否已声明"改插件需重启"；若已声明，只需加"重新加载"入口 |
| BH2-003 | `{id,count}` 被误判为 blockstate | 需真实整合包样本统计；且收紧会误伤真方块状态，属设计取舍 |
| BH2-004 | `kindForField` 缺 `list` 分支 | 需 UI 先支持嵌套数组编辑，属产品范围 |
| BH2-005 | 数量侧接受任意字符串 | 与 `chance` 分支不对称，需统一口径（是否要求"字符串可转数字"） |

---

## 4. 修复顺序与依赖

```
批次 1 (BH-002)  ─┐
批次 2 (BH-001)  ─┤ 互不依赖，可并行
批次 3 (R-A)     ─┘ ← 依赖 registry 新 API；批次 5 复用同一失效点
批次 4 (BH-006)  ── 依赖批次 8 的测试先行
批次 5 (BH-003)  ── 依赖批次 3 的 syncPluginLayer（共用失效点）
批次 6 (BH-008)  ── 独立
批次 7 (BH-009/010) ── 独立，但建议在批次 1 之后（BH-002 是 BH-009 的主要触发源）
```

实际执行顺序：**8（写测试）→ 1 → 2 → 3 → 4 → 6 → 7 → 5**（测试先行；5 放最后，因为它触及 scanner 与 shared，需要最完整的回归）。

---

## 5. 全局验收门槛（每个批次都要满足）

1. `npm run typecheck` 通过（node + web 两侧）；
2. `npm run lint`（`--max-warnings=0`）通过；
3. **完整** `vitest run` 零失败、**不得**新增 skip、**不得**删除或放宽任何既有用例；
4. 修改差异只包含本批次相关文件，无顺手重构；
5. 新增测试**先**在修复前跑出失败（证明能复现），修复后转绿；
6. 失败路径与恢复行为有断言（不只测 happy path）。

---

## 6. 明确不做的事

| 不做 | 原因 |
| --- | --- |
| 修改台账 V9 / 生成 V10 | 需单独授权 |
| 构建安装包 / 安装 / 卸载 / 发布 | 需单独授权 |
| 触碰生产 userData、`dist/`、`dist-011/`、`E:/_trash_20261101_recipe-studio`、npm 缓存 | 保护边界 |
| 删除任何既有测试 | 任务明令禁止 |
| 为通过而放宽断言 / 加 skip | 任务明令禁止 |
| 顺手修 BH-013/014/BH2-003/004/005 | 缺证据或需产品决策 |
