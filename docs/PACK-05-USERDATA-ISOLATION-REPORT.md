# PACK-05 · 用户数据目录隔离验证报告（REL-PKG-C）

日期：2026-11-01
对应台账：`REL-PKG` 的 **C 类**"打包后目录隔离"（等价门禁视图 `REL-VERIFY-PKGDIR`）
主台账基准：V4（`REL-ICON` 已关闭；本轮**未修改台账**）
性质：实际运行验证。未改源码/打包配置；未启动 D 阶段；未补做 B3；未清理任何历史证据。

---

## 1. 结论摘要

| 测试 | 结果 |
| --- | --- |
| 正式版默认 userData | ✅ `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio`（`app:runtime` + 应用日志双证） |
| `studio-cache` / `logs` / `recipe-backups` 位置 | ✅ 全部由 `studioRoot()`（= `app.getPath('userData')`）派生，实测随数据根落在各自目录内 |
| 与开发环境不交叉 | ✅ dev 用 `...-dev`、prod 用默认目录；**并发实测两实例并存且各自读写自己的根** |
| `STUDIO_USER_DATA` A/B 隔离 | ✅ A→A、B→B；两个实例**同时运行**；哨兵互不可见；日志各自独立 |
| `--user-data-dir` C 隔离 | ✅ C→C；子目录随之创建 |
| 优先级（env vs cli） | ✅ **env 优先**；负控目录 `C2` 从未被创建 |
| 边界：相对路径 / 深层不存在路径 | ✅ 相对路径按 cwd 解析；多层目录自动创建 |
| 边界：mkdir 失败 | ❌ **未捕获异常 + 模态错误弹窗**（见 §11，属既有 `P2-MKDIR` 风险，非本轮引入） |
| **REL-PKG-C 判定** | **通过**（C 类四项验收条件全部满足，见 §14） |

---

## 2. 测试环境与应用版本

| 项 | 值 |
| --- | --- |
| 系统 | Windows 11 专业版 10.0.26100（x64） |
| 用户 | `CIALLO\qituo`，在管理员组但进程**未提权** |
| 应用版本 | `KubeJS Recipe Studio 0.1.0`（`app:runtime.appVersion = 0.1.0`） |
| 正式版 | `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe`（PACK-04 卸载后本轮重装，安装退出码 0） |
| 开发版 | `node_modules/electron/dist/electron.exe .`（`app.isPackaged === false`） |
| 启动参数 | 一律带 `--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu`（本机 GPU 限制，见 PACK-04 §5） |
| 测试目录根 | `E:\mc kjs\.cache\pack-05\t\`（**独立临时目录，与真实数据目录完全分离**） |
| 测试时间 | 2026-11-01 05:19:54 – 05:24:08 |

> **隔离声明**：所有 A/B/C/D/A2/C2/reldir/deep 目录均在 `E:\mc kjs\.cache\pack-05\t\` 下，本轮创建；真实用户数据目录（`%APPDATA%\kubejs-recipe-studio` 与 `...-dev`）**只做只读记录，未作为测试目录**。

---

## 3. 台账 C 类原始定义（唯一依据）

> `§3.7` C 行：**"C. 打包后目录隔离｜正式版默认 userData；`studio-cache`/`logs`/`recipe-backups` 位置；与 dev 不交叉｜通过标准：`app:runtime` 返回默认路径；目录树核对"**
> `§7.1` 门禁视图：`REL-VERIFY-PKGDIR` = "打包后 userData、缓存、备份、锁的目录隔离"。
> `§7.4`：REL-ICON 与 REL-PKG **不得**被本项替代；本项验收要求保留为 C 类标准 + 门禁视图。

本轮严格按此四项验收，未扩大范围（环境变量/命令行的额外验证属你本轮指定，单列为"附加验证"，不计入 C 类判定依据）。

---

## 4. 测试方法与证据链

每个场景都取两类**互相独立**的证据：

1. **`app:runtime` IPC**（台账指定方式）：经 CDP 调 `window.studio.invoke('app:runtime')`，读返回的 `userData` 字段；
2. **应用自身启动日志**：`<数据根>/logs/studio-2026-11-01.log` 中的 `数据目录（prod）：<路径>` 行（由 `applyUserDataDir` 的 `source` 决定文案）；
3. 补充：**目录树核对**（根下 `studio-cache`/`logs`/`icon-cache`/`plugins`/`cache` 是否落在该根）。

---

## 5. 环境变量 `STUDIO_USER_DATA` 的 A/B 隔离（含并发）

| 项 | 实例 A | 实例 B |
| --- | --- | --- |
| 环境变量 | `STUDIO_USER_DATA=E:\mc kjs\.cache\pack-05\t\A` | `...\t\B` |
| `app:runtime.userData` | `E:\mc kjs\.cache\pack-05\t\A` ✅ | `E:\mc kjs\.cache\pack-05\t\B` ✅ |
| 应用日志"数据目录"行 | `...\t\A` ✅ | `...\t\B` ✅ |
| 写入的日志文件 | `<A>\logs\studio-2026-11-01.log` | `<B>\logs\studio-2026-11-01.log` |
| 哨兵 | `sentinel-A.txt` | `sentinel-B.txt` |

**并发与交叉检查**

| 检查 | 结果 |
| --- | --- |
| 两实例是否同时运行 | ✅ 是。B 启动并对 A 仍在运行的状态下完成探测；两者先后均正常响应 CDP，未被单实例机制拒绝 |
| A 中是否出现 B 的哨兵 | ❌ 否（`hasB=false`） |
| B 中是否出现 A 的哨兵 | ❌ 否（`hasA=false`） |
| 各自哨兵是否留存 | ✅ `A\sentinel-A.txt`、`B\sentinel-B.txt` 均在 |
| 缓存/配置是否交叉 | ❌ 无交叉：A 的 `cache`/`icon-cache`/`Preferences`/`lockfile` 均在 A 根下，B 同理 |

> **单实例机制说明**（按你的要求如实记录）：单实例锁文件位于 userData 下（P1 实现），因此**不同 userData 的两个实例可以并存**——这正是 A/B 能同时运行的原因，而非绕过保护。**未做任何绕过**；若两者共用同一 userData，第二实例会被正常拒绝（该行为由 P1 实现保证，本轮未重复验证）。

---

## 6. 命令行 `--user-data-dir` 的 C 隔离

| 检查 | 结果 |
| --- | --- |
| 启动方式 | 正式版 + `--user-data-dir=E:\mc kjs\.cache\pack-05\t\C` |
| `app:runtime.userData` | `E:\mc kjs\.cache\pack-05\t\C` ✅ |
| 应用日志"数据目录"行 | `...\t\C` ✅ |
| 缓存 / 日志 / 配置位置 | 均在 `<C>` 下：`cache`(5 文件)、`logs`(1)、`icon-cache`、`Preferences`、`lockfile` ✅ |
| 备份目录 | `<C>\recipe-backups` **未创建**——按需创建（见 §9 说明），位置仍由 C 根派生 |

---

## 7. 环境变量与命令行的优先级

| 场景 | 环境变量 | 命令行 | 实际生效 | 判定 |
| --- | --- | --- | --- | --- |
| T8 | `STUDIO_USER_DATA=<A2>` | `--user-data-dir=<C2>` | **`<A2>`** | ✅ **env 优先，与实现一致** |
| 负控 | — | — | `<C2>` **目录从未被创建**（0 文件） | ✅ 反证 cli 未生效 |

实现依据：`src/main/envPaths.ts` 的 `resolveUserDataDir()` 顺序为 `env → cli → dev(-dev) → prod`，第一条命中即返回。

---

## 8. 开发环境与生产环境的隔离

| 项 | 生产（正式安装版） | 开发（`electron .`） |
| --- | --- | --- |
| `app:runtime.userData` | `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio` | `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio-dev` |
| 是否带 `-dev` 后缀 | 否（prod 分支） | **是** ✅ |
| 应用日志"数据目录"行 | `数据目录（prod）：...kubejs-recipe-studio` | `...kubejs-recipe-studio-dev` |

**并发实测**：同时启动正式安装版与开发版，**两个窗口均成功打开**，`app:runtime` 分别返回上述两个不同路径；两者均未被单实例机制拒绝（userData 不同）。

**目录级核对（各自根下）**

| 子目录 | prod 根 | dev 根 | 是否交叉 |
| --- | --- | --- | --- |
| `studio-cache` | ✅ 18 文件 / 290.6 MB | ✅ 3 文件 / 44.6 MB | 否 |
| `logs` | ✅ 3 文件 | ✅ 1 文件 | 否 |
| `recipe-backups` | ✅ 52 文件 | ✅ 4 文件 | 否 |
| `icon-cache` | ✅ 90,301 文件 | ✅ 38,760 文件 | 否 |
| `plugins` | ✅ 空目录 | ✅ 空目录 | 否 |
| `cache` | ✅ 38 文件 | ✅ 5 文件 | 否 |

**开发环境是否写入生产数据**：否。上述 dev 运行只写入 `...-dev` 根；生产根的 `Preferences` 哈希在测试前后**完全一致**（`BE4B8924…D0B5DE`），文件总数未变（90,535）。

---

## 9. 三个关键目录的位置（C 类第二项）

`src/main/paths.ts` 的架构约束：**任何写盘路径都必须经 `studioRoot()` 派生**，而

```ts
export function studioRoot(): string {
  if (!root) root = app.getPath('userData')   // 只在 app ready 前缓存一次
  ...
}
// 派生：join(studioRoot(), 'studio-cache' | 'icon-cache' | 'logs' | 'plugins' | 'cache' | 'favorites.json')
//      join(studioRoot(), 'recipe-backups', modpackHash(modpackPath))
```

| 目录 | 派生方式 | 实测 |
| --- | --- | --- |
| `studio-cache` | `studioRoot()/studio-cache` | ✅ 在每个数据根下实际创建 |
| `logs` | `studioRoot()/logs` | ✅ 有日志文件写入 |
| `recipe-backups` | `studioRoot()/recipe-backups/<modpackHash>` | ✅ 位置正确；**按需创建**——测试目录未导入整合包故未生成，真实 prod 根下存在 52 个文件可证 |

> **说明（不夸大）**：`recipe-backups` 的创建时机是"导入整合包后/发生备份时"，本轮测试未导入整合包，因此未在测试目录中实际触发；其**位置正确性**由代码派生关系 + 真实目录实例共同证明。若你要求端到端证据，需在 C/D 阶段配合一次导入。

---

## 10. 边界行为

| 场景 | 输入 | 实际结果 | 判定 |
| --- | --- | --- | --- |
| `T10` 相对路径 | `STUDIO_USER_DATA=reldir`，cwd=`...\t\relbase` | userData = `...\t\relbase\reldir` | ✅ 按 cwd 解析（与 `isAbsolute ? : resolve(cwd, …)` 一致） |
| `T11` 多层不存在目录 | `...\t\deep\a\b\c` | 全部自动创建，应用正常启动 | ✅ `mkdirSync(recursive:true)` 生效 |
| `T12` 创建失败 | `...\t\blocked\sub`（`blocked` 是**文件**） | **应用未打开窗口**；弹出 Electron「A JavaScript error occurred in the main process / Uncaught Exception」模态框，内容为 `ENOENT: no such file or directory, mkdir 'E:\mc kjs\.cache\pack-05\t\blocked\sub'` | ❌ **未捕获异常**（详见 §11） |

> T12 的弹窗截图为现场取证（05:22），本轮**未复跑**以免再次弹出模态框；用 Node 复现同一路径得到 `ENOTDIR: not a directory, mkdir …`，确认 `mkdirSync` 在该路径必然抛错，且 `applyUserDataDir` **未包裹 try/catch**。

---

## 11. `P2-MKDIR`（创建目录失败无回退）—— 本轮实测确认

| 项 | 内容 |
| --- | --- |
| 代码位置 | `src/main/envPaths.ts` → `applyUserDataDir()` 中 `mkdirSync(resolved.dir, { recursive: true })`，**无 try/catch** |
| 触发条件 | `STUDIO_USER_DATA`（或 dev 分支）指向无法创建的路径（父级为文件、无权限、非法名等） |
| 实际表现 | 主进程抛未捕获异常 → Electron 显示**模态错误对话框** → 进程阻塞、不创建窗口 |
| 用户影响 | 配置错误时不是"回退到默认目录并告警"，而是**应用无法启动且弹出技术性报错** |
| 台账状态 | 对应 `P2-MKDIR`（未解决·低），本轮**只验证不修复**（符合纪律） |

---

## 12. `P2-USERDATAARG` 专项验证

| 项 | 内容 |
| --- | --- |
| 已登记风险 | "`--user-data-dir` 显式传入时不追加 `-dev`；开发者手动指向 prod 目录仍会共享数据" |
| 本轮实测 | `T9`：**开发版** + `--user-data-dir=E:\...\t\D-noSuffix` → 实际 userData = `E:\...\t\D-noSuffix`，**未追加 `-dev`** |
| 机制确认 | 实现顺序为 `cli` 早于 `dev` 分支，故 cli 一旦出现就跳过 `-dev` 后缀 → **若把该参数指向真实 prod 目录，开发版将直接写入生产数据** |
| **本轮未做的验证** | **没有**把 `--user-data-dir` 指向真实 `%APPDATA%\kubejs-recipe-studio`。原因：你明确要求"不允许开发环境测试写入生产用户数据"；该结论由代码路径 + 临时目录实测推得，不做破坏性实证 |
| 处置 | 只记录，**未修改优先级或拒绝规则** |

---

## 13. `P2-SYMLINK` / `P2-POSIXPATH` 是否影响本轮结论

| 风险 | 影响面 | 对本轮结论的影响 |
| --- | --- | --- |
| `P2-SYMLINK`（词法判定不覆盖软链） | 导航守卫 `isPathInsideDir`（渲染页面加载路径判定） | **无影响**——与 userData 目录解析、创建、隔离无关 |
| `P2-POSIXPATH`（`path.relative` 大小写/分隔符 POSIX 未实测） | 同上，且仅 POSIX 平台 | **无影响**——本轮为 Windows 验证，且不涉及路径判定逻辑 |

两者均为导航安全范畴，与 `REL-PKG-C` 的 userData 隔离目标不重叠。

---

## 14. REL-PKG-C 最终判定

按台账 C 类四项验收逐条判定：

| C 类验收条件 | 证据 | 判定 |
| --- | --- | --- |
| ① 正式版默认 userData | `app:runtime` = `...\AppData\Roaming\kubejs-recipe-studio`；应用日志"数据目录（prod）"一致；非 `-dev` | ✅ |
| ② `studio-cache` / `logs` / `recipe-backups` 位置 | 三者均由 `studioRoot()` 派生；`studio-cache`/`logs` 实测在各根下创建；`recipe-backups` 位置已证（prod 根下 52 文件） | ✅ |
| ③ 与 dev 不交叉 | dev=`...-dev`、prod=默认；**并发双实例实测**各自读写自己的根；prod 的 `Preferences` 哈希测试前后一致 | ✅ |
| ④ 证据方式合规 | 使用台账指定的 `app:runtime` 返回路径 + 目录树核对 | ✅ |

**判定：`REL-PKG-C` 四项验收条件全部满足 → 建议关闭。**

> 但按纪律**本轮未修改主台账**，`REL-PKG` 整体仍**未关闭**（C 类通过不等于 REL-PKG 完成：B 类升级未执行、D 类未开始）。

---

## 15. 失败 / 未执行 / 受环境限制

| 项 | 归类 | 说明 |
| --- | --- | --- |
| `T12` mkdir 失败导致未捕获异常 + 弹窗 | **失败（已知风险复现）** | 见 §11；属 `P2-MKDIR`，非本轮引入，未修复 |
| `recipe-backups` 端到端创建 | **未执行** | 需导入整合包触发；本轮仅证位置 |
| `--user-data-dir` 指向真实 prod | **主动未执行** | 数据保护要求，不做破坏性实证 |
| 单实例"同 userData 被拒绝" | **未重复验证** | 已有 P1 结论；本轮只验证"不同 userData 可并存" |
| 交互式双击启动 | **未执行** | 全程脚本化启动；双击启动的差异属 DUAL 验证范畴 |
| 正常 GPU 路径 | **受环境限制** | 本机 GPU 不可用（PACK-04 §5），全程 `--disable-gpu*` |

---

## 16. 真实用户数据保护核对（前后一致）

| 目录 | 测试前 | 测试后 | 结论 |
| --- | --- | --- | --- |
| `%APPDATA%\kubejs-recipe-studio`（prod） | 90,535 文件 / 361.8 MB / Preferences `BE4B8924…` | 90,535 文件 / 361.8 MB / Preferences `BE4B8924…` | **完全一致**（仅 `logs` 因两次正式版启动追加了启动行，属正常行为） |
| `%APPDATA%\kubejs-recipe-studio-dev`（dev） | 38,817 文件 / 78.9 MB / Preferences `BE4B8924…` | 38,817 文件 / 78.9 MB / Preferences `BE4B8924…` | **完全一致**（仅 dev 日志增长） |

未删除、未移动、未覆盖任何真实用户数据。

---

## 17. 测试数据处理与证据清单

**临时测试目录**：`E:\mc kjs\.cache\pack-05\t\`（A / B / C / A2 / C2 / D-noSuffix / relbase / deep / blocked），合计 **48 MB**，均为本轮创建、可明确归属为测试数据。
**本轮不清理**：它们体量小且是证据的一部分；若需清理，可在你确认后连带 `t\` 一并删除（`C2` 已确认为空目录，`blocked` 仅含 1 个占位文件）。

| 证据文件 | 内容 |
| --- | --- |
| `.cache/pack-05/pre-state.txt` | 测试前安装状态与两个真实数据目录的完整记录 |
| `.cache/pack-05/reinstall.txt` | 正式版重装（退出码 0） |
| `.cache/pack-05/matrix.mjs` / `matrix.log` / `matrix-result.json` | 主测试矩阵（9 场景 + 并发 + 哨兵 + 日志） |
| `.cache/pack-05/probe2.mjs` / `probe2.log` / `probe2.json` | 逐场景 `app:runtime` 与应用日志"数据目录"行 |
| `.cache/pack-05/probe3.mjs` / `probe3.log` / `probe3.json` | A / C 的 `app:runtime` 精确值、dev 基线、**prod+dev 并发** |
| `.cache/pack-05/post-state.txt` | 测试后真实数据目录对比（含 Preferences 哈希） |
| 现场截图 | T12 未捕获异常模态框（05:22，由你提供） |

---

## 18. 一句话结论

**C 类四项验收全部满足：正式版走默认目录、dev 走 `-dev`、三个关键目录都由 `app.getPath('userData')` 派生、两者并发运行也互不串写。** 顺带把两个既有风险真实验到了：`--user-data-dir` 确实会绕过 `-dev`（只做了安全侧验证），`mkdirSync` 失败会直接弹未捕获异常框。**建议关闭 REL-PKG-C，但台账我一字未改，等你确认。**
