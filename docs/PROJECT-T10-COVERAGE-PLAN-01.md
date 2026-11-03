# T-10 · 覆盖补齐实施方案（提案）

| 项 | 内容 |
|---|---|
| **任务名** | `T-10 · 覆盖补齐` |
| **对应缺口** | **G-12**（组件级测试缺依赖）、**G-21**（覆盖薄弱点无补齐任务） |
| **前置** | **D-33 已选方案**（jsdom + RTL + jest-dom 方向），但**未授权安装** |
| **授权** | 落地需 **A2 + A3**；**本批只授 A2-T + A3，未授 A2** → 本稿 = **提案** |
| **性质** | 提案 / 实施清单，**未改任何代码、未装任何依赖、未写任何测试** |

## 0. 边界

1. 本稿**未执行**安装、未改 `src/**`、`tests/**`、`vitest.config.ts`、`tsconfig*.json`、`.eslintrc.cjs`。
2. 本稿的「现状」均为**只读核实**（§2），可复算。
3. T-10 的四项验收中，本稿只提供**方案与判据**，不代交付。

---

## 1. 结论

| 验收项 | 现状 | 本稿给的方案 | 需要授权 |
|---|---|---|---|
| ① 组件级依赖落地 | **未安装**（§2.1） | §3：四依赖 + 三配置 | **A2**（装依赖）+ 配置改动 |
| ② `probeImport` 用例 | **已存在** 5 组 describe（§2.2），但有 3 处空洞 | §4：补 3 类用例 | **A2** |
| ③ `fieldModel` 用例 | `declaredFields`/`bucketFields` 已覆盖 8 例；**4 个导出零引用**（§2.3） | §5：补 4 个导出 + 2 个边界 | **A2** |
| ④ 3 个 `it.todo` 结论 | 3 处，均已定位（§2.4） | §6：逐条给「转正式 / 接受为已知限制」 | **A1**（结论）+ **A2**（若转正式） |

---

## 2. 现状核实（只读，可复算）

### 2.1 G-12：组件级依赖

| 依赖 | `package.json` 状态 |
|---|---|
| `jsdom` | **未安装** |
| `@testing-library/react` | **未安装** |
| `@testing-library/dom` | **未安装** |
| `@testing-library/jest-dom` | **未安装** |
| `happy-dom` | **未安装** |

`vitest.config.ts:14` = `environment: 'node'`。

`tests/renderer/` 现有 **13** 个测试文件，全部是**纯逻辑/store 级**（`fieldModelDedup`、`benchStorePc2`、`slotUtils`、`themeTokens` 等），**没有**任何 `render()` 组件渲染测试。

**推论**：`tests/renderer/**` 被 `tsconfig.node` 排除、且环境是 `node`，所以**当前结构下组件级测试在物理上不可行**——这不是「没写」，是「写不了」。

### 2.2 G-21 · `probeImport`

`tests/scanner/probeImport.test.ts` 已有 5 组 describe：

1. 注册表导出收集（`d.ts` / `txt` / `json` 三形态；流体按上下文分开）
2. 不可读路径只记 WARN，不影响其它文件
3. 与物品索引合并（同 id 提升 `verified`；新 id 收录且不带图标；流体不进物品表）
4. 重复导入幂等（第二次不再新增、不重复计数）
5. `runProbeImport` 返回可读摘要

**空洞（本稿判断）**：
| 空洞 | 为什么算空洞 |
|---|---|
| 未覆盖 `collectRegistryIds` 与 `mergeRegistry` 的**直接单元**边界（只经 `runProbeImport` 间接测） | 计划验收②点名要「`probeImport` 用例」，需区分「整链」与「函数级」 |
| 未覆盖**同名不同类型**（如 `a:foo` 既是 item 又是 fluid）的最终归属 | 现有用例说「流体按上下文分开」，但是否覆盖**冲突**未确认 → `未核实` |
| 未覆盖**空目录 / 空文件** | 与「不可读路径」不同：空是合法输入 |

### 2.3 G-21 · `fieldModel`

`src/renderer/src/views/bench/fieldModel.ts` 导出 8 个符号：

| 导出 | tests 中的引用 |
|---|---|
| `declaredFields` | ✅ `tests/renderer/fieldModelDedup.test.ts` |
| `bucketFields` | ✅ 同上 |
| `flattenFields` | ❌ **零引用** |
| `tierOf` | ❌ **零引用** |
| `isReferenceKind` | ❌ **零引用** |
| `zoneOf` | ❌ **零引用** |
| 类型 `Tier`/`Zone`/`DegradeLevel` | 编译期，无运行时用例 |

`fieldModelDedup.test.ts` 已有 8 例，覆盖：`slots`/`outputs` 同 key 去重、`slots`/`extraFields` 先到者胜、降级字段仍声明且 `required=false`、不同 key 全保留、compound 吸收、`bucketFields` 基于去重结果、空/null 安全。

**结论**：去重语义覆盖**较好**；`tierOf`/`zoneOf`/`isReferenceKind`/`flattenFields` **完全没有用例** —— 这是 G-21 的实质所指。

### 2.4 三个 `it.todo`

| # | 位置 | 原文 | 为什么空着 |
|---|---|---|---|
| 1 | `tests/main/pluginLayerFollowsModpack.test.ts:189` | T4：插件目录读取失败时不得清空仍然有效的插件层（本批不修，见 Q-02） | 依赖 **Q-02 裁决** |
| 2 | `tests/main/pluginLoadFailurePreservesLayer.test.ts:333` | T7c：文件元数据（`statSync`）异常时的行为 | **需平台级条件**，本轮无法稳定构造 |
| 3 | `tests/main/schemaPluginFailureSnapshot.test.ts:323` | T6c：装配完成**之后**才发生插件读取失败的时序 | **需并发注入点**，本轮无法稳定构造 |

---

## 3. 方案 ①：组件级依赖落地（G-12）

### 3.1 依赖集合（按 D-33 细化，不自行扩缩）

| 包 | 说明 |
|---|---|
| `jsdom` | 必须选 **兼容 Node v22.14.0 的 26 系列**；实施时**核实并固定具体版本**，不得用未核实的范围 |
| `@testing-library/react` | 组件渲染 |
| `@testing-library/dom` | RTL 的对等依赖 |
| `@testing-library/jest-dom` | 断言扩展（`toBeInTheDocument` 等） |

### 3.2 配置改动（三处，均为**提案**）

| # | 文件 | 改动 | 风险 |
|---|---|---|---|
| C1 | `vitest.config.ts` | 增加 `environmentMatchGlobs: [['tests/renderer/**', 'jsdom']]`（或 `projects`/`workspace` 分区），**保持其余为 node** | 全局改 jsdom 会让 748 个 node 用例变慢 |
| C2 | `tsconfig.web.json` | 让 `tests/renderer/**` 进入 web 项目（当前被 `tsconfig.node` 排除，web 也未纳入） | 会造成 `tests/renderer` 被**两个** project 同时纳入 → 需显式 exclude |
| C3 | `.eslintrc.cjs` | 为 `tests/renderer/**` 开启 `.tsx` 解析与 RTL 规则 | 规则集变化可能触发批量 warning，而 `lint --max-warnings=0` |

### 3.3 判据

- `vitest run` 后，`environment` 分布可打印（jsdom 文件命中数 = `tests/renderer` 中真实渲染的用例数）
- 新增 1 个冒烟组件测试（例：`Icon` 或 `PilotDraftPanel` 的渲染 + 一个 `toBeInTheDocument`）
- 全量**仍 0 失败**、`typecheck`/`lint` 仍 0

### 3.4 回滚

删除新增依赖 + 还原三个配置文件（须先 `cp` 出 `.pre-t10-<时间戳>`）。

---

## 4. 方案 ②：`probeImport` 用例补齐

| # | 新增用例 | 判据 |
|---|---|---|
| P1 | `collectRegistryIds` 直接单元：三形态 + 空文件 + 空目录 | 返回集与预期**逐元素相等**，空输入返回空集**不抛错** |
| P2 | `mergeRegistry` 直接单元：同 id `verified` 提升 / 新 id 无图标 / 冲突归属 | 合并后条目数与字段值精确断言 |
| P3 | 同名不同类型（`a:foo` 既是 item 又是 fluid）的最终归属 | **先明确产品语义**再断言（当前语义 `未核实`） |

> P3 必须先定语义，否则会写出「按实现断言」的假测试。

---

## 5. 方案 ③：`fieldModel` 用例补齐

| # | 新增用例 | 判据 |
|---|---|---|
| F1 | `tierOf(kind)` 对全部 `FieldKind` 的映射 | 逐 kind 断言，且**枚举完整性**（新增 kind 未归类的用例应失败） |
| F2 | `zoneOf(field)`：`slots`/`outputs`/`extra` 三区 | 逐 kind 断言 |
| F3 | `isReferenceKind(kind)` | 真值表断言 |
| F4 | `flattenFields(fields, prefix)`：嵌套 + 空前缀 + 多级前缀 | 输出数组顺序与 key 拼接精确断言 |
| F5 | 边界：`declaredFields(null)` 与 `bucketFields(null)` | 返回空数组、不抛错（已有 1 例覆盖 null，需扩到 `bucketFields`） |

---

## 6. 方案 ④：三个 `it.todo` 的结论

| # | 建议结论 | 理由 | 需谁做 |
|---|---|---|---|
| 1（T4） | **转正式用例**，但**阻塞于 Q-02** | 「读取失败不得清层」已有 `pluginLoadFailurePreservesLayer` 覆盖同类语义；本条只是旧入口的重复。若 Q-02 采纳「②③ 保留旧层」，则本条应删除而非补写 | 决策后 A2 |
| 2（T7c） | **接受为已知限制** | `statSync` 异常需 ACL/占用等平台条件；构造不可稳定复现 | A1 结论 |
| 3（T6c） | **接受为已知限制** | 需在装配完成「之后」注入读取失败，需并发注入点；当前无钩子 | A1 结论 |

> 「接受为已知限制」按任务八态记 **已接受为已知限制**，**不得**记「已通过」。

---

## 7. 验收判据（T-10 整体）

| # | 判据 | 本稿状态 |
|---|---|---|
| 1 | 组件级依赖落地 | **未执行**（需 A2） |
| 2 | `probeImport` 用例（P1–P3） | **未执行**（需 A2） |
| 3 | `fieldModel` 用例（F1–F5） | **未执行**（需 A2） |
| 4 | 3 个 `it.todo` 各有结论 | **已给建议**，待批准 |
| 5 | 每个子项可独立验收 | ✅（§3–§6 各自独立） |

## 8. 遗留与风险

| # | 事项 | 类型 |
|---|---|---|
| L1 | 装依赖本身会改 `package.json` + lockfile | 风险（本批禁止） |
| L2 | `environmentMatchGlobs` 在 Vitest 3 已标记 deprecated，可能需 `projects` 写法 | 风险（实施时核实版本） |
| L3 | `tsconfig.web` 与 `tsconfig.node` 的 exclude 可能互相打架，导致**同一文件被两个 project 编译** | 风险 |
| L4 | `lint --max-warnings=0` 对新增 RTL 规则敏感 | 风险 |
| L5 | 本稿未登记 `DOCS-INDEX.md` | 需单独授权 |
