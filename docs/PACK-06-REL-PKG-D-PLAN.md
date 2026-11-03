# PACK-06 · REL-PKG-D 阶段执行计划（待批准，未执行）

日期：2026-11-01
主台账基准：**V5**（`REL-ICON` 已关闭、`REL-PKG-C`/`REL-VERIFY-PKGDIR` 已关闭；`REL-PKG` 本体仍「未验证」）
性质：**计划文档，未执行任何测试**。本轮只提交计划并暂停。

---

## 1. D 类原始定义（台账 V5 原文，唯一依据）

> **D. asar + worker 冒烟**｜**C3**：打包环境下 `new Worker(__dirname/scan.worker.js)` 能否运行；295-jar 扫描冒烟｜**通过标准**：扫描成功且计数为 **43,474 / 38,760 / 32,890 / 426 / 5,334**；失败需记录 `ERR_WORKER_PATH`/ENOENT 证据并给出 `asarUnpack` 方向｜**当前：未验证**

来源追溯：`PROJECT-WIDE-AUDIT-REPORT.md` §9-C3（审计首次提出），经裁决并入 `REL-PKG` 作为 **D 类验收**，**不是独立的第 5 个来源**。

### 1.1 拆分为两条可判定验收项

| 编号 | 验收项 | 对应原文片段 |
| --- | --- | --- |
| **D-1** | 打包（asar）环境下 `new Worker(__dirname/scan.worker.js)` **能成功创建并实际参与扫描** | "打包环境下 `new Worker(...)` 能否运行" |
| **D-2** | 295-jar 扫描冒烟成功，且五项计数**完全一致** | "扫描成功且计数为 43,474/38,760/32,890/426/5,334" |
| **D-3**（条件性） | 若 D-1 失败，须留下 `ERR_WORKER_PATH`/ENOENT 原始证据并给出 `asarUnpack` 方向 | "失败需记录 … 并给出 `asarUnpack` 方向" |

> **不并入**：B3 升级补做、GPU 启动风险、`REL-VERIFY-DUAL`、`REL-VERIFY-4K`、`P2-MKDIR`/`P2-USERDATAARG` 修复，均**不在 D 类范围**。

### 1.2 一个决定性的实现前提（必须写进判定）

`src/main/scanner/pool.ts:46` 的写法是：

```ts
const workerScript = join(__dirname, 'scan.worker.js')
...
workerAvailable: existsSync(workerScript),   // ← 不存在就静默回退内联
inline: (jarPath) => scanJar(jarPath, opts.iconDir),
```

**含义**：如果 asar 内 `existsSync(workerScript)` 返回 false，应用会**静默改用主线程内联扫描**——扫描照样能成功、计数照样能对上，但 `usedWorkers` 为 `false`。

> **所以 D-2 的计数一致**不能证明 D-1 通过**。判定必须以 `usedWorkers === true` 为主证据，计数一致为并列条件。这是本计划与"跑一次看着有数就行"的根本区别。

---

## 2. 每项验收对应的测试步骤

### 2.1 前置（P0，不改任何代码/配置）

| 步 | 操作 | 记录项 |
| --- | --- | --- |
| P0-1 | 确认正式安装版存在（`%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe`，0.1.0），记录 exe SHA-256 | 版本、哈希、安装时间 |
| P0-2 | 记录基准包 `E:\mc kjs\.cache\pc7-pack-1112` 的 mods 目录 jar 数（当前实测 **295**）与总大小（**557 MB**） | jar 数、字节数 |
| P0-3 | 新建**独立 userData 测试根** `E:\mc kjs\.cache\pack-06\ud-<时间戳>`（不触碰 prod/dev 数据） | 路径 |
| P0-4 | 记录 prod / dev 用户数据目录的快照（文件数、字节数、`Preferences` 哈希）用于事后比对 | 快照文件 |

> **为什么必须新建 userData**：prod 的 `studio-cache` 里已有该整合包的缓存（`pc7-pack-1112`），直接复用会命中缓存 → `cacheHit=true`、`usedWorkers=false`，**根本触发不了扫描**。必须用干净 userData 强制真实扫描。

### 2.2 D-1：worker 在 asar 下能否运行

| 步 | 操作 | 判定点 |
| --- | --- | --- |
| D1-1 | 以 `STUDIO_USER_DATA=<P0-3 目录>` + `--no-sandbox --disable-gpu* --in-process-gpu --remote-debugging-port=<port>` 启动正式安装版 | 窗口打开、`app:runtime.userData` = 测试根 |
| D1-2 | 经 CDP 调用 `modpack:import`（传入基准包路径），确认返回成功 | 返回 `ok:true`，日志出现「检测到 MC/Forge/KubeJS」「共发现 295 个 mod」 |
| D1-3 | 在启动扫描**之前**注入事件收集器：`window.__ev=[]; window.studio.onEvent(e=>window.__ev.push(e))` | 收集器就绪 |
| D1-4 | 调用 `modpack:scan`（`rebuild=true`），轮询直到扫描结束（上限 300 s） | 返回 `started:true`；结束事件到达 |
| D1-5 | 从结束事件 / 缓存的 `meta` 中读取 `stats.usedWorkers` | **必须为 `true`** |
| D1-6 | 同步核对主进程 stdout/stderr 是否出现 `ERR_WORKER_PATH` / `ENOENT` / `worker` 报错 | 无此类错误 |
| D1-7 | 交叉验证：比对扫描耗时量级（worker 池 vs 内联相差明显）——仅作辅助，不作判据 | 记录实际耗时 |

**通过标准**：`usedWorkers === true` 且无 worker 相关错误。

### 2.3 D-2：295-jar 扫描冒烟与五项计数

| 步 | 操作 | 判定点 |
| --- | --- | --- |
| D2-1 | 扫描结束后读取 `recipes:stats` 与应用日志中的「索引就绪」行 | 五项计数 |
| D2-2 | 逐项比对：**物品 43,474**／**图标 38,760**／**配方 32,890**／**类型 426**／**部分 5,334** | 每项**完全相等** |
| D2-3 | 检查失败清单 `stats.failed` 是否为空 | 期望空数组 |
| D2-4 | 检查 `stats.withIcon` = 38,760、缺失图标数 = 43,474−38,760 = 4,714 | 与历史基线一致 |

**通过标准**：五项计数逐项完全一致，`failed` 为空。

### 2.4 D-3（仅在 D-1 失败时）

| 步 | 操作 |
| --- | --- |
| D3-1 | 保存完整 stdout/stderr（含 `ERR_WORKER_PATH` 或 `ENOENT ... app.asar ... scan.worker.js`） |
| D3-2 | 记录 `existsSync(workerScript)` 的判定结果与 `usedWorkers` 值 |
| D3-3 | 给出 `asarUnpack` 方向建议（**只写建议，不改 `electron-builder.yml`**，因为本轮禁止改打包配置） |

---

## 3. 所需环境、文件与测试数据

| 类别 | 需求 | 当前状态 |
| --- | --- | --- |
| 应用 | 正式安装版 0.1.0（`app.asar` 内运行） | ✅ 已安装（PACK-04 卸载后于 PACK-05 重装） |
| 基准包 | `E:\mc kjs\.cache\pc7-pack-1112`，mods 内 **295** 个 jar | ✅ 存在（557 MB，硬链接副本，**只读使用**） |
| 数据目录 | 新建独立 `STUDIO_USER_DATA` 测试根 | 待建（P0-3） |
| 启动参数 | `--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu` | 本机必需（GPU 不可用） |
| 驱动方式 | CDP（`--remote-debugging-port`）+ `window.studio.invoke` / `onEvent` | 已在 PACK-05 验证可用 |
| 脚本 | `.cache/pack-06/run-d.mjs`（待编写，仅测试用，不进仓库源码） | 待写 |
| 时间预算 | 单次扫描 60–120 s（历史实测 59–91 s），含启动与导入约 3–4 min | — |
| 磁盘 | 测试 userData 预计新增 **约 60–90 MB**（icon-cache 38,760 个文件 + cache meta） | E 盘剩余充足 |

---

## 4. 预期结果与通过标准（汇总）

| 项 | 预期值 | 通过标准 |
| --- | --- | --- |
| D-1 `usedWorkers` | `true` | 必须为 true |
| D-1 worker 错误 | 无 | 无 `ERR_WORKER_PATH`/ENOENT |
| D-2 物品 | **43,474** | 完全相等 |
| D-2 图标 | **38,760** | 完全相等 |
| D-2 配方 | **32,890** | 完全相等 |
| D-2 类型 | **426** | 完全相等 |
| D-2 部分 | **5,334** | 完全相等 |
| D-2 `failed` | 空 | 空数组 |
| 应用日志 | 出现「索引就绪（43,474 个物品 … 32,890 条）」 | 与计数一致 |

**判定规则**：D-1 与 D-2 **同时**满足 → D 类通过；任一不满足 → D 类不通过并保留现场。**不允许**用"扫描成功"单独判定通过。

---

## 5. 可能影响真实用户数据的操作（重点）

| 操作 | 对真实数据的影响 | 本轮处置 |
| --- | --- | --- |
| `modpack:import` + `modpack:scan` | 会在 **userData 下**写 `studio-cache`（meta/索引，约 300 MB 量级）与 `icon-cache`（38,760 个文件，约 58 MB） | **改用独立 `STUDIO_USER_DATA` 测试根**，不写 prod/dev |
| 扫描基准包 `pc7-pack-1112` | 扫描只读 jar；但**历史上有一次"另存副本"写入了该包**（P-OPT1 记录 32,891 条） | 本轮**只做扫描，不做任何提交/另存**；不触发写盘 |
| 安装/卸载 | 会改动 `%LOCALAPPDATA%\Programs` 与注册表 | **本轮不安装、不卸载**（应用已就位） |
| prod / dev 用户数据 | 若误用默认路径会写入 | 启动前显式设 `STUDIO_USER_DATA`，并在启动后用 `app:runtime.userData` **回验不等于** prod/dev 路径，才算通过前置 |

> 额外保护：若 `app:runtime.userData` 落在 `%APPDATA%\kubejs-recipe-studio*` 下，**立即中止**，不继续导入。

---

## 6. 无法执行 / 受环境限制的项目

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 正常 GPU 路径下的 worker 行为 | **受环境限制** | 本机 GPU 不可用，全程 `--disable-gpu*`；不影响 worker_threads 结论（线程与 GPU 无关） |
| 与开发态的 worker 对照（`out/` 非 asar） | **可选，不在 D 范围** | 台账 D 类只要求"打包环境下"；如需对照属额外验证，需你另行批准 |
| 交互式双击启动 + UI 点击扫描 | **不在 D 范围** | D 类只要求冒烟；UI 点击链路由 P-C7 覆盖 |
| B3 升级补做 | **禁止** | 你的纪律明确排除 |
| `asarUnpack` 实改 | **禁止** | 只写方向建议，不改打包配置 |
| 二次/三次重复扫描取稳定值 | **不做** | 台账只要求"扫描成功且计数一致"，未要求重复性；如需重复验证请另行指示 |

---

## 7. 执行顺序与产出物（批准后）

```
P0 前置快照
 → D1-1 启动（独立 userData）→ 回验路径
 → D1-2 import → D1-3 注入收集器 → D1-4 scan(rebuild)
 → D1-5 usedWorkers → D1-6 错误检查
 → D2-1..D2-4 五项计数比对
 → 证据归档 → 报告
```

| 产出 | 内容 |
| --- | --- |
| `.cache/pack-06/run-d.mjs` | 本轮测试脚本（仅测试用） |
| `.cache/pack-06/stdout.log` / `stderr.log` | 主进程完整输出（含 worker 错误，如有） |
| `.cache/pack-06/scan-events.json` | CDP 收集到的扫描事件（含 `stats.usedWorkers`） |
| `.cache/pack-06/stats.json` | `recipes:stats` 与日志计数快照 |
| `.cache/pack-06/ud-<时间戳>/` | 独立测试 userData（保留为证据，不清理） |
| `docs/PACK-07-REL-PKG-D-REPORT.md` | D 阶段验收报告 |
| `docs/LEDGER-REL-PKG-D-CLOSE-REPORT.md` |（若通过并经你批准后另行生成，本轮不做） |

---

## 8. 需要你确认的 4 个点

1. **是否同意用独立 `STUDIO_USER_DATA` 测试根**？（推荐：是。否则会往 prod 写 9 万个文件，且极易命中缓存导致 `usedWorkers=false`，测不出 D-1）
2. **是否只做单次扫描**？（台账未要求重复；重复 3 次约多花 5 分钟，可提高稳定性证据强度）
3. **若 D-1 失败**（asar 内无法起 worker），是否允许我只写 `asarUnpack` 建议而不改 `electron-builder.yml`？（按你的纪律，我默认只写不建议改）
4. **测试留下的 `ud-*` 目录（约 60–90 MB）是否保留为证据**？（推荐：保留，与 PACK-05 的 `t/` 一致）

---

## 9. 本轮未做的事

- 未执行任何 D 类测试（本文件只是计划）。
- 未修改源码、依赖、`electron-builder.yml`、`package.json`。
- 未补做 B3，未处理 GPU 风险，未启动 `REL-VERIFY-DUAL` / `REL-VERIFY-4K`。
- 未修改 `REL-PKG` 本体状态（仍「未验证」）。
- 未清理任何历史证据（`PACK-01/02/03/04/05` 全部保留）。
