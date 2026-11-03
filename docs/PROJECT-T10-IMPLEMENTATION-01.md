# T-10 · 覆盖补齐**实施**报告

| 项 | 内容 |
|---|---|
| **任务名** | `T-10 · 覆盖补齐（G-12 / G-21）` |
| **授权** | **A2（限定）**：装 4 个测试依赖 + 三处配置 + 只新增测试文件；**A3**：vitest / typecheck |
| **决策依据** | **D-33**（jsdom + RTL + jest-dom 方向；版本须核实后固定） |
| **执行时点** | 2026-11-02 06:09–06:19 GMT+8 |
| **状态** | **待验收**（不记「已通过」） |

## 0. 边界与两处必须声明的偏离

### 0.1 硬边界执行情况

| 边界 | 结果 |
|---|---|
| 不改 `src/**` | ✅ master 184 / live 184，**内容不同 0** |
| 不改任何**已有**测试文件 | ✅ 既有 94 个文件中，本批只动过第 28 批遗留的 4 个（见 §0.2），本批**新增 2 个**，未编辑任何既有文件 |
| 不装第 5 个包 | ✅ 仅 4 个直接依赖 |
| 不真实演练 / 不构建 / 不启动 / 不改治理文件 | ✅ |

### 0.2 偏离一：`package.json` 改前**未留存 pre-image**

**事实**：我在装依赖前只记录了哈希（`bad1fafd…`），**没有备份文件内容**。因此无法给出 `package.json` 的字节级 diff。

**可用的替代证据**（请按证据强度判断）：

| # | 证据 | 强度 |
|---|---|---|
| 1 | 安装命令**逐包列举**了 4 个包名与精确版本（§1.1），npm 不会自行追加直接依赖 | 强（命令即范围） |
| 2 | npm 日志只有 `added 48 packages in 1m`，**无 `changed` / `removed`** | 强 |
| 3 | `dependencies` 仍为 `acorn` / `yauzl` 两项，**未变** | 强 |
| 4 | `version` 0.1.1、`name` kubejs-recipe-studio、**无 `productName`** | 强 |
| 5 | `devDependencies` 现为 25 项，含且仅含这 4 个新包（精确版本，无 `^`） | 中（"恰好 4 个"依赖 25−4=21 的推算，**未逐项比对**） |

**结论**：范围可判定为「只加了 4 个 devDependency」，但**「恰好新增 4 项、其余逐字节未变」这一判据我无法用 diff 证明**，标 **部分达成**。

### 0.3 偏离二：任务书的内部冲突（R-6 处置）

- §二 硬边界：「改 `tests/` 时**不得改动任何已有测试文件**（只新增）」
- §3.4：「3 个 `it.todo`：逐个改为正式用例或给出书面结论（**不得直接删除 todo**）」

**冲突点**：把 `it.todo` 改成 `it` 必须**编辑既有文件**，与 §二 直接冲突。

**处置（按 R-6，具体指令优先并显式标注）**：`it.todo` **一个都没动**（不删不改），全部以**书面结论**交付（§5）。第 3 条若需转正式用例，须另批授权改既有文件。

---

## 1. 依赖

### 1.1 安装命令（工作目录 `E:/mc kjs`）

```bash
npm install --save-dev --save-exact \
  jsdom@26.1.0 @testing-library/react@16.3.3 \
  @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1
```

| 包 | 版本（先 `npm view` 核实，后 `--save-exact` 固定） |
|---|---|
| `jsdom` | **26.1.0**（D-33 指定 26 系列；`npm view jsdom@26 version` 实测最高为 26.1.0） |
| `@testing-library/react` | **16.3.3** |
| `@testing-library/dom` | **10.4.2** |
| `@testing-library/jest-dom` | **7.0.1** |

- 结果：**exit 0**，`added 48 packages in 1m`（48 = 4 直接 + 44 传递）
- 全部写入 `devDependencies`，**版本为精确值**（无 `^`／`~`）
- 日志：`.cache/fix14/a3tmp/T10-npm-install.log`

### 1.2 哈希

| 文件 | 改前 | 改后 |
|---|---|---|
| `package.json` | `bad1fafde90d691c93aa7ab014a369365ab3ec0b225442cb7e89656d2f5298d5` | `4e0c261a9eff60d36fd3893d8e8c4d2a0d0cc721951c0cf4175f9c154f4c7afa` |
| `package-lock.json` | `dc95d17f8644a8300937008b6faae856c759ae4c619f3e22a68987303e4cdc8d` | `d9844c61316513c9408dd746d745a1c1a2ea53a16d1d410352c056f7b58fe611` |

---

## 2. 三处配置

### 2.1 `vitest.config.ts`（`0f30eb4c…` → `a5005f88…`）

```diff
-    include: ['tests/**/*.test.ts'],
-    environment: 'node',
+    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
+    environment: 'node',
+    /**
+     * T-10 / D-33：组件级测试需要 DOM。**只对 `tests/renderer/components/**` 生效**，
+     * 其余用例（含 `tests/renderer/*.test.ts` 的既有 13 个纯逻辑用例）仍跑在 node 环境，
+     * 因此不改变现有用例的运行环境。
+     */
+    environmentMatchGlobs: [['tests/renderer/components/**', 'jsdom']],
```

**为什么用 `environmentMatchGlobs` 而不是改全局 `environment`**：全局改 jsdom 会让全部 781 个既有用例换环境，违反「不得改变现有用例运行环境」。用 glob 只命中新目录。

**为什么还要加 `*.test.tsx`**：原 `include` 只有 `tests/**/*.test.ts`，`.tsx` **根本不会被收集**。

### 2.2 `tsconfig.web.json`（`2f1c5dde…` → `2027bf1b…`）

```diff
-  "include": [..., "tests/renderer/**/*.ts"]
+  "include": [..., "tests/renderer/**/*.ts", "tests/renderer/**/*.tsx"]
```

`tsconfig.node.json` **未改**：其 `include` 是 `tests/**/*.ts`、`exclude` 是 `tests/renderer/**/*.ts`，`.tsx` 天然不匹配，不会重复归属。

### 2.3 `.eslintrc.cjs`（`7585e1b5…` → `99260649…`）

```diff
-      files: ['tests/**/*.ts', '**/*.test.ts'],
+      files: ['tests/**/*.ts', 'tests/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
```

（`parserOptions.ecmaFeatures.jsx` 原本已是 `true`，无需改。）

---

## 3. 新增用例（2 个文件 / 15 例）

### 3.1 `tests/renderer/components/FieldShell.test.tsx`（7 例，jsdom）

测 `views/bench/controls/FieldShell.tsx` —— 唯一**纯展示**且直接吃 `fieldModel.fieldLabel()` 的组件。

| # | 用例 |
|---|---|
| 1 | `displayName` 优先于 key 推导 |
| 2 | 无 `displayName` 时按 key 推导出「需要…」句式 |
| 3 | `required` 真/假分别渲染/不渲染必填标记 |
| 4 | `occurrenceRate < 0.5` 出现「少见」徽章，`≥ 0.5` 不出现 |
| 5 | `tone` 决定分区类名（`field-extra`） |
| 6 | `bare` 只渲染内容、不渲染标签外壳 |
| 7 | 无 `description` 时 `title` 回落 `key` |

### 3.2 `tests/scanner/probeImportBehavior.test.ts`（8 例，node）

补的是既有 `probeImport.test.ts` 被**整链测试掩盖**的函数级边界。

| # | 用例 |
|---|---|
| 1 | `collectRegistryIds([])` → 三集合皆空、不抛 |
| 2 | 空目录 → `files` 空、集合空（与「不可读」区分） |
| 3 | `d.ts` 字符串字面量收进 `itemIds` |
| 4 | `mergeRegistry` 空扫描不清表、计数为 0 |
| 5 | 新 id 收录：`verified=true`、无图标、`modId` 来自命名空间 |
| 6 | 同 id 只提升 `verified`，不重复计数 |
| 7 | 已 verified 再合并 → 不重复提升 |
| 8 | 幂等：同一扫描跑两次，第二次不新增不提升 |

---

## 4. 门禁结果

| 项 | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 全量测试 | `./node_modules/.bin/vitest run` | **88 文件（86 passed / 2 skipped）／796 用例（789 passed / 4 skipped / 3 todo）／0 失败**，90.01 s | **0** |
| 新增用例（单独） | `vitest run <2 文件>` | 15 passed（8 + 7），2.37 s | 0 |
| typecheck | `npm run typecheck` | node + web 均无输出 | **0** |
| lint | `npm run lint --max-warnings=0` | 无输出 | **0** |
| `SAFE_DELETE` | — | 0 次 | — |

**基线对照**：改前 86 文件 / 781 用例 / 774 passed → 改后 88 文件 / **796** 用例 / **789** passed（+2 文件、+15 用例、+15 passed，**既有 781 用例 0 失败**）。

---

## 5. 三个 `it.todo` 的结论

> 三个 todo **一处未改**（§0.3）。以下为书面结论。

| # | 位置 | 原文 | 结论 | 理由 |
|---|---|---|---|---|
| 1 | `pluginLayerFollowsModpack.test.ts:189` | T4：插件目录读取失败时不得清空仍然有效的插件层（本批不修，见 Q-02） | **已有等价正式用例覆盖；原 todo 保留待 Q-02** | 同一语义已由 `pluginLoadFailurePreservesLayer.test.ts` 的 **T3「读取失败时必须保留有效插件层，并明确记录失败」** 覆盖（本轮实测通过）。原 todo 位于「旧入口」文件，语义重复；是否删除取决于 Q-02 裁决，故保留 |
| 2 | `pluginLoadFailurePreservesLayer.test.ts:333` | T7c：文件元数据（`statSync`）异常时的行为 | **不可测 → 已接受为已知限制** | 需 ACL 拒绝/文件占用等**平台级条件**；在 CI 与沙盒中无法稳定构造。强行 mock `statSync` 只能测到 mock 本身 |
| 3 | `schemaPluginFailureSnapshot.test.ts:323` | T6c：装配完成之后才发生插件读取失败的时序 | **不可测 → 已接受为已知限制** | 需在装配**完成之后**注入读取失败，当前代码无并发注入点；只能改 `src` 加钩子，本批禁止 |

> 状态口径：第 2/3 条按任务八态记 **已接受为已知限制**，**不记「已通过」**。

---

## 6. 回滚实测（双向）

### 6.1 `drill.mjs`（功能级）

| 方向 | 操作 | 结果 |
|---|---|---|
| A 回退 | 恢复 `drill.mjs.pre10`（`c372116c…`）→ 沙盒 `cold --run-id RB-A` | exit 0，**`COLD-README.txt` 不存在**（旧版行为） |
| B 复原 | 重新应用 R-6 → 沙盒 `cold --run-id RB-B` | exit 0，**`COLD-README.txt` 存在**（新版行为） |

### 6.2 配置（全量回归级）

| 方向 | 操作 | 结果 |
|---|---|---|
| A 回退 | 三份配置还原到改前 → 全量 `vitest run` | **87 文件（85 passed / 2 skipped）／789 用例（782 passed）／0 失败**。`.tsx` 不再被收集（`FieldShell` 7 例不执行），`probeImportBehavior` 8 例仍跑 → 与预期完全一致 |
| B 复原 | 重新应用三处配置 → 全量 `vitest run` | **88 文件／796 用例／789 passed／0 失败**，typecheck 0、lint 0 |

**说明**：配置回滚**未**卸载依赖（卸载会改动 `node_modules` 且难以逐字节复原）。因此本回滚证明的是「配置可逆且回退后既有用例全绿」，**不证明**「卸依赖后系统状态」。

---

## 7. 验收判据

| # | 判据 | 状态 |
|---|---|---|
| 1 | package.json 恰好新增 4 包（+传递） | **部分达成**（§0.2：无 pre-image，范围靠命令与日志证明） |
| 2 | 三处配置 diff 最小化 | ✅（§2，共 4 个 hunk） |
| 3 | 原 781 用例 0 失败 | ✅（§4） |
| 4 | 新增用例全绿 | ✅（15/15） |
| 5 | 3 个 `it.todo` 全部有结论 | ✅（§5，书面结论；未改文件） |
| 6 | typecheck 通过 | ✅ |
| 7 | `src/**` 与 master 全等 | ✅（0 差异） |
| 8 | 回滚双向实测 | ✅（§6） |

## 8. 遗留与风险

| # | 事项 | 类型 |
|---|---|---|
| L1 | `environmentMatchGlobs` 在 Vitest 3 已废弃，升级时需改 `projects` | 技术债 |
| L2 | 新增 `jsdom` 使全量耗时 80 s → 90 s（+12%） | 成本 |
| L3 | `it.todo` 第 1 条若要转正式用例，需授权**编辑既有文件** | 待授权 |
| L4 | `@testing-library/jest-dom` 只在测试文件内 import，未进全局 setup —— 后续新组件测试需各自 import | 约定 |
| L5 | 本报告未登记 `DOCS-INDEX`（同批另一份已登记，见索引） | 已办 |
