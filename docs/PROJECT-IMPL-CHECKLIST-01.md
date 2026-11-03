# 实施前核查清单 01（PROJECT IMPL CHECKLIST 01）

> **计划名（权威）**：`PROJECT-IMPL-CHECKLIST-01.md`｜**别名**：D-24 / C7-F1 / T-08b / T-19 实施前核查清单
> **批次**：第 18 批｜**时间**：2026-11-02 02:57–03:10
> **授权**：A0 只读 + A1 写文档。**未安装依赖、未改源码/测试/配置/`package.json`/`electron-builder.yml`、未构建、未启动、未发布。**
> **本文件性质**：**已批准方向 → 待执行**的实施清单。**它不是执行记录，也不是"已完成"的证明。**

---

## 0. 四类状态（全文按此口径阅读）

| 类别 | 含义 | 本文中的例子 |
|---|---|---|
| **已核实事实** | 本批实测或 registry 元数据可复现 | jsdom 26 系列最新 = 26.1.0；jsdom 30.1.3 要求 Node ≥22.22.2；项目无隔离区概念 |
| **已批准未实施** | 方向已定，未落地 | C7-F1 的 N=50；D-24 的 4 个依赖 |
| **仅建议方案** | 我提的实现细节，**未经批准** | 隔离区路径命名；修剪触发时机；排序键回退规则 |
| **待决定/待授权** | 缺决策或缺授权 | 隔离区永久清理期限（D-36）；D-24 的执行授权 |

---

## 1. D-24 · 组件测试环境（文件级实施清单）

### 1.1 依赖集合（4 个包，版本均已核实到 registry 元数据）

| 包 | 固定版本 | `engines` | 关键 peerDependency | 证据 |
|---|---|---|---|---|
| `jsdom` | **26.1.0** | `node >=18` | `canvas ^3`（optional） | `registry.npmjs.org/jsdom/26.1.0` |
| `@testing-library/react` | **16.3.3** | `node >=18` | `react ^18\|\|^19`、`react-dom ^18\|\|^19`、**`@testing-library/dom ^10`（非 optional）** | `…/@testing-library%2Freact/latest` |
| `@testing-library/dom` | **10.4.2** | `node >=18` | 无 | `…/@testing-library%2Fdom/latest` |
| `@testing-library/jest-dom` | **7.0.1** | `node >=22`、`npm >=6` | **`@testing-library/dom >=10 <11`**（非 optional）、`vitest >=0.32`（optional） | `…/@testing-library%2Fjest-dom/latest` |

**为什么锁 26.1.0 而不是最新 30.1.3**

| 事实 | 值 |
|---|---|
| `jsdom@30.1.3` 的 `engines.node` | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| 项目文档指定的可移植 Node | **v22.14.0**（`E:/开发工具/node-v22.14.0-win-x64`，本批实测存在） |
| 结论 | jsdom 30 **不满足** v22.14.0 → 选 26 系列 |

**26 系列上界核实**：`jsdom@26.1.1` → `version not found`；`jsdom@26.2.0` → `version not found`
→ **26.1.0 即 26 系列最新**（此为已核实事实；27～29 未逐版核查，标**缺证据**）。

> **实施时的强制动作**（负责人要求"不得使用未经核实的版本范围"）：
> 四个包在 `package.json` 中**写精确版本**（无 `^`、无 `~`），并**在安装后回读 `node_modules/<pkg>/package.json` 的 `version` 字段**，与本文表逐项比对；不一致即停。
> 另需在安装前**复核一次 registry**（本文的 "latest" 会随时间漂移）。

### 1.2 三个配置文件、共 5 处改动

| # | 文件 | 位置 | 现状（本批实测） | 需要改成 | 不改的后果 |
|---|---|---|---|---|---|
| C-1 | `vitest.config.ts` | `:13` | `include: ['tests/**/*.test.ts']` | 增加 `'tests/**/*.test.tsx'` | **`.tsx` 测试根本不会被执行** |
| C-2 | `vitest.config.ts` | `:14` | `environment: 'node'`（全局） | 加 `environmentMatchGlobs`（`tests/renderer/**` → `jsdom`），**或**在组件测试文件首行写 `// @vitest-environment jsdom` | `.tsx` 测试里没有 `document`，渲染直接抛错 |
| C-3 | `vitest.config.ts` | `test` 段 | 无 `setupFiles` | 加 `setupFiles: ['tests/renderer/setup.ts']` | jest-dom 的 `toBeInTheDocument` 等断言不可用 |
| C-4 | `tsconfig.web.json` | `include` | `[…, "tests/renderer/**/*.ts"]` | 增加 `"tests/renderer/**/*.tsx"` | **`.tsx` 测试不做类型检查**（`tsconfig.node.json` 的 include 也只匹配 `.ts`） |
| C-5 | `.eslintrc.cjs` | `overrides[0].files` | `['tests/**/*.ts', '**/*.test.ts']` | 增加 `'tests/**/*.test.tsx'` | 组件测试拿不到 `no-console: off`，写 `console.log` 直接 lint 失败 |

> **C-2 的选择**：`environmentMatchGlobs` 在 vitest 2.x 可用；per-file docblock 更局部化、不影响全局配置。
> **建议**（未批准）：用 docblock，因为它把"这个文件需要 DOM"写在文件自己身上，读代码时一眼可见。

### 1.3 新增文件

| 文件 | 内容 | 备注 |
|---|---|---|
| `tests/renderer/setup.ts` | `import '@testing-library/jest-dom/vitest'` | 仅此一行；不引入 jest 全局 |
| 首个组件测试（示例） | `tests/renderer/<component>.test.tsx` | **用途**：验证 config 五处改动确实生效（先写一个"能渲染出指定文本"的最小用例） |

### 1.4 已知风险（实施前需评估）

| # | 风险 | 依据 |
|---|---|---|
| R-1 | **全量测试变慢**：`vitest.config.ts:25` 硬编码 `fileParallelism: false`，jsdom 会**逐文件**建 DOM | 配置实测 |
| R-2 | `@testing-library/jest-dom@7` 要求 `node >=22`；若将来把 Node 降到 20 会破 | registry 元数据 |
| R-3 | `@testing-library/react@16` + React 18 需 `@types/react@18`；项目已是 `^18.3.17` ✓ | `package.json` |
| R-4 | 组件里若直接用 `window.studio`（preload 桥），jsdom 下没有该对象 → 必须在 setup 里 stub，否则每个组件测试都要自己 mock | 需在实施时确认（**缺证据**） |

### 1.5 回滚方案（逐文件）

| 步 | 动作 | 校验 |
|---|---|---|
| 1 | 恢复 `vitest.config.ts` / `tsconfig.web.json` / `.eslintrc.cjs` 三份配置的**改动前副本** | 逐文件 `sha256` 与备份一致 |
| 2 | 恢复 `package.json` 与 `package-lock.json`（删掉 4 个 devDependency） | `git diff` 无（无 Git）→ 用 `sha256` 比对备份 |
| 3 | 删除 `tests/renderer/setup.ts` 与新增的 `.test.tsx` | 文件不存在 |
| 4 | 依赖落地：`npm ci`（按 lockfile 精确重装） | `node_modules/jsdom` 不存在 |
| 5 | 跑全量 `vitest run` | 回到 **86 文件 / 781 用例（774 passed + 4 skipped + 3 todo）/ 0 失败** |
| 6 | `npm run typecheck`、`npm run lint` | 退出码 0 |

> **优点**：D-24 **只动测试基建**，不碰 `src/**` 的任何业务代码 → 回滚**不需要**恢复源码。
> **前提**：改动前必须按 D-28 纪律建**完整 `src`+`tests` 快照**（即使预期不动 `src`，也照建，避免"以为没动"）。

---

## 2. C7-F1 · 备份保留（文件级实施清单）

### 2.1 已确认的规则（负责人第 18 批）

| # | 规则 |
|---|---|
| 1 | 保留上限 **N = 50** |
| 2 | **50 是硬上限**；额度不足时**不保证每个目标都保留一份** |
| 3 | 清理时**优先移入隔离区**，不直接永久删除 |
| 4 | 备份文件与其 `.meta.json` **必须成对处理** |
| 5 | **隔离区的永久清理期限尚未决定 → 不得实现自动永久清理** |

### 2.2 现状（本批实测）

| 项 | 值 |
|---|---|
| 实现文件 | `src/main/recipes/backup.ts`（122 行级） |
| 现存的清理动作 | **只有两处** `fsp.rm`：`:60` tmp 残留清理、`:104` 备份失败回滚 → **无任何保留/淘汰逻辑** |
| 备份目录 | `<userData>/recipe-backups/<modpackHash>/`（`paths.ts:80-82`） |
| 命名 | `<目标basename>.<YYYYMMDD-HHmmss>.<sha6>[-i]`，配对 `<file>.meta.json` |
| meta 字段 | `target` / `backup` / `sha256` / `bytes` / `atMs` / `modpackPath` |
| 写入语义 | `wx` 打开（**绝不覆盖旧备份**）+ tmp+fsync+rename |
| 隔离区 | **当前不存在任何隔离区/trash 概念**（`paths.ts` 中零命中） |
| 实测规模 | 隔离 userData 中一个 `modpackHash` 有 **25 对 / 28,504 B**（同一目标，约 2 天）→ 均值 ≈ **1.1 KB/份** |

### 2.3 保留排序（本清单的核心）

| 项 | 方案（**仅建议**） |
|---|---|
| 排序键（主） | `meta.atMs`（毫秒时间戳，最精确） |
| 排序键（回退 1） | 无 meta 时，从文件名解析 `YYYYMMDD-HHmmss` |
| 排序键（回退 2） | 两者都不可得 → **视为"不参与淘汰"**（宁可留，不可误删），并记 `warn` |
| 排序粒度 | **按 `<modpackHash>` 目录内的"备份对"整体计数**，不是按 target 分组（因为 N 是硬上限，见规则 2） |
| "备份对"定义 | 一个内容文件 `X` + 它对应的 `X.meta.json`（若存在） |
| 淘汰顺序 | `atMs` 升序（最旧先走），直到剩余 ≤ 50 |

**三个必须写进代码注释的边界**：
1. **规则 2 的后果**：若一个包有 300 个被改配方、每个只提交过一次，N=50 时会淘汰 250 份**孤本**。这是**已批准的取舍**，但实现时应在 UI 或日志里明确告知，避免用户以为"每个文件都有备份"。
2. **不按 target 分组**：曾考虑"每 target 保 1 份"，与规则 2 冲突 → 已由负责人裁定为"不保证"。
3. **同一秒多份**（`-1`/`-2` 后缀）必须作为**独立对**参与计数，不能合并。

### 2.4 配对与孤儿

| 情形 | 处理（**仅建议**） |
|---|---|
| 正常对（file + meta 都在） | 一起 `rename` 进隔离区 |
| 孤儿 **meta**（无内容文件） | 单独 `rename` 进隔离区（**不删**），计 1 个名额 |
| 孤儿 **内容文件**（无 meta） | 仍计 1 个名额；排序用文件名 stamp；一起 `rename` |
| 隔离区已存在同名 | 加 `-<n>` 后缀（沿用现有 `wx` 递增思路） |

### 2.5 隔离区路径（**建议，待确认**）

| 项 | 建议值 | 理由 |
|---|---|---|
| 路径 | `<userData>/recipe-backups-trash/<modpackHash>/<原文件名>` | 与 `recipe-backups` **平级**，不在其内部 |
| 为何不放在 `recipe-backups` 内 | 否则会被本模块自己的"计数"逻辑再算一遍，且用户浏览备份目录时会看到已淘汰项 |
| 为何不放 `kubejs/data` | `paths.ts:76-79` 已明确：放包内会被扫描成配方 |
| 需要新增的助手 | `recipeBackupTrashDir(modpackPath)` + `ensureRecipeBackupTrashDir(modpackPath)`（`paths.ts`，与现有 80-88 行风格一致） |
| **不实现** | 隔离区的**永久清理**（D-36 未决）；也不在 `ensureBaseDirs()` 里预建（按需建） |

### 2.6 触发时机（**建议，待确认**）

| 方案 | 说明 | 风险 |
|---|---|---|
| **A（推荐）备份成功后异步修剪** | `commitRecipe` 写盘成功 → 调 `pruneBackups()`；失败只 warn | 修剪失败不影响提交结果，符合"备份失败即中止覆盖"的既有语义 |
| B 备份前同步修剪 | 在 `backupOriginalFile` 之前 | 会拉长提交关键路径；且修剪失败会牵连提交 |
| C 应用启动时修剪 | 冷启动做 | 与启动性能任务（C7-F3 ≤90s）冲突 |

> **硬约束**：**修剪绝不能在 `backupOriginalFile` 的事务内**（`backup.ts:104` 的失败回滚路径假设"只清理自己刚写的半成品"）。

### 2.7 并发保护

| 层 | 现状 | 需要补什么 |
|---|---|---|
| 跨进程 | `singleInstance.ts` 已保证单实例（C7-F5，`[推导]`） | 无需额外处理 |
| **同进程内并发提交** | **目前无互斥**（多窗口 / 快速连点） | 需要一个**进程内 promise 队列**：`prune` 串行执行，第二次调用复用第一次的结果 |
| 修剪 vs 备份并存 | — | 修剪只处理"已完整落盘的对"（meta 已存在且 `atMs` 可读）；正在写的 tmp 文件（`.tmp` 后缀）**一律跳过** |
| 两个 modpack 同时修剪 | 不同 `<modpackHash>` 目录，互不影响 | 无需锁 |
| 修剪中用户手动删文件 | `rename` 抛 `ENOENT` | **跳过该项、记 warn、不中断整轮** |

### 2.8 失败恢复

| 场景 | 结果 | 恢复动作 |
|---|---|---|
| 单项 `rename` 失败（EPERM/EBUSY/ENOENT） | 跳过，继续下一项 | 无；下一轮自然重试 |
| 整轮中途崩溃 | 隔离区里已有 k 项、原位置少 k 项 | **无数据丢失**（两者都在磁盘上）；下一次修剪从剩余项继续 |
| 隔离区目录创建失败 | 整轮中止（不删任何东西） | 记 ERROR；不影响提交 |
| **误删风险** | **不存在"删除"动作** → 最坏情况是"备份被移到另一个目录" | 人工从 `recipe-backups-trash` 移回即可 |

> **建议新增**（未批准）：隔离区每次 move 写一行 `<userData>/recipe-backups-trash/<modpackHash>/trash-log.jsonl`（原路径 / 新路径 / 时间 / 原因），便于人工批量还原。

### 2.9 需要改/新增的文件

| # | 文件 | 改动 |
|---|---|---|
| F-1 | `src/main/paths.ts` | 新增 `recipeBackupTrashDir()` / `ensureRecipeBackupTrashDir()` |
| F-2 | `src/main/recipes/backup.ts` | 新增 `listBackupPairs(dir)`（成对枚举 + 孤儿识别）与 `pruneBackups(input)` |
| F-3 | `src/main/recipes/commitRecipe.ts` | 在**写盘成功后**插入修剪调用（可注入依赖，便于测试） |
| F-4 | `tests/main/backupRetention.test.ts`（新增） | 见 2.10 |
| — | `src/main/recipes/backup.ts:10` 顶部注释 | 补一句"保留策略见 pruneBackups" |

### 2.10 未来测试用例清单（**未编写**）

| # | 用例 | 断言 |
|---|---|---|
| T-1 | 51 对 → 修剪 | 剩 50 对；最旧的 1 对出现在隔离区；原目录不含它 |
| T-2 | file 与 meta 成对 | 隔离区里两者都在，且数量相等 |
| T-3 | 孤儿 meta | 被移入隔离区，计 1 个名额 |
| T-4 | 无 meta 也无 stamp 的文件 | **不被淘汰**（保守） |
| T-5 | `rename` 抛 EPERM | 该项保留原位，其余照常修剪，函数不抛 |
| T-6 | 修剪失败 | **提交仍成功**（返回值不受影响） |
| T-7 | 并发两次调用 | 第二轮复用第一轮结果，不出现"删两次" |
| T-8 | `.tmp` 残留 | 不参与计数、不被移动 |
| T-9 | 多 modpackHash | 只修剪调用方指定的那个目录 |

---

## 3. T-08b 子项依赖对照表

| 子项 | V1.1 原文前置 | 核实依据（本批实测/文档） | 拟调整 | 尚缺证据 |
|---|---|---|---|---|
| `OPT4-R4` | `D-04/D-05`（整组） | `DECISIONS` D-04 正文即"OPT4-R4 与 OPT4-R8 是否转已接受风险" | → **D-04** | — |
| `OPT4-R8` | 同上 | 同上 | → **D-04** | — |
| **`UI-U2`** | 同上 | V9`:221` UI-U2 =「详情不随键盘焦点」；D-05 只管 **UI-U3/U5**（V9`:222`/`:224`） | → **不依赖 D-05**（需另定其自身前置） | **UI-U2 的真实前置未在任何文档中写明** |
| `P0-R3` | 同上 | `REPORT-12` §4.2：渲染层文案无法测 → D-24 未决 | → **D-24** | — |
| `C7-F1` | 同上 | 本文件 §2；N=50 已定 | → **D-34（已答复）**，可直接开工（**需 A2 授权**） | — |
| `C7-F7` | 同上 | 映射表"依赖 F1 的策略决定" | → **C7-F1** | F7 的命名规则细节未定 |
| `C7-F4` | 同上 | V9`:191` 要求"设计评审" | → **设计评审**（无 D 编号） | 评审形式未定 |
| `C7-F6` | 同上 | V9`:193`「错误文案路径展示策略」 | → **方向决定**（绝对/相对，无 D 编号） | 产品方向未定 |
| `P1-GUARD` | 同上 | `REPORT-12` §4.2：建议单独立项 | → **单独立项** | — |
| `P1-FD` | 同上 | 依赖白名单决策 | → **依赖白名单决策** | 白名单范围未定 |
| `P2-SYMLINK` | 同上 | `REPORT-12` §4.1：已完成（4 例，红→绿） | → **已完成** | — |
| `P2-MKDIR` | 同上 | `REPORT-11`：已完成（2 例） | → **已完成** | — |
| `P2-CLOSEGUARD` / `P2-USERDATAARG` / `P2-RELPATH` / `P2-AST` | 同上 | `REPORT-12` §4.2 逐项原因 | → 各自策略 / 长期重构 | 各自策略未定 |

**关键结论**：`D-05` **对 T-08b 列出的任何子项都不成立** —— 这是**依赖声明过宽**，不是验收问题。
**本表只改"前置声明"，不动任何验收条件**（D-35 明确要求）。

---

## 4. D-08 → T-19 的 SHA-256 说明需求（只整理需求，不执行发布）

**T-19 的发布说明模板必须包含以下字段**（本清单只是需求，模板未编写）：

| # | 字段 | 说明 |
|---|---|---|
| 1 | 产物文件名 | 如 `KubeJS Recipe Studio Setup 0.1.1.exe` |
| 2 | 精确字节数 | 现有两包：`dist` 82,360,469 B / `dist-011` 82,360,472 B |
| 3 | **SHA-256 全文** | 64 位十六进制，不得截断 |
| 4 | 生成命令 | `certutil -hashfile "<文件>" SHA256`（Windows）/ `sha256sum <文件>`（POSIX） |
| 5 | 校验步骤 | 让用户能自己复算并与③比对 |
| 6 | **未签名声明** | 明写"安装包未做代码签名，SmartScreen 可能提示『未知发布者』" |
| 7 | 版本与已安装版本差异提示 | 当前机器已装 **0.1.0**（实测），发布物为 **0.1.1** → 属**跨版本升级**，需提示 userData 会被保留（`PACK-18` 已验证） |
| 8 | **不得包含** | 不得写"已验证安装/升级成功"之类结论（T-17 未执行） |

**明确不做的**：不改版本号、不构建、不打包、不安装、不升级、不发布。

---

## 5. 未执行事项总表（防误读）

| 操作 | 状态 |
|---|---|
| 安装 / 升级 / 卸载依赖 | **未执行** |
| 修改 `package.json` / `package-lock.json` | **未执行** |
| 修改 `vitest.config.ts` / `tsconfig.web.json` / `.eslintrc.cjs` | **未执行** |
| 修改 `src/**` / `tests/**` 任何文件 | **未执行** |
| 修改 `electron-builder.yml` | **未执行** |
| 构建 / 打包 / 安装 / 启动应用 / 发布 | **未执行** |
| 真实工作区覆盖演练 | **未执行**（D-29 HOLD） |
| 修改 V1.1 / 创建 V1.2 / 修改 V9 | **未执行** |
| 触碰生产 userData | **未执行**（备份数据取自 `.cache/pack-13/ud-clone`，非生产） |
| 删除 / 清理受保护目录、备份、缓存 | **未执行** |
| Git 初始化 / 提交 / 推送 | **未执行** |
