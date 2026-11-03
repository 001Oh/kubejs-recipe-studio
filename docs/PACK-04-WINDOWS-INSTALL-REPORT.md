# PACK-04 · Windows 安装链路验证报告（REL-PKG-B）

日期：2026-11-01
对应台账：`REL-PKG` 的 **B 类**（安装流程）——**注意：B 类含"安装 / 启动 / 升级 / 卸载"四项，本轮 B3 升级未执行，故 B 类不能判定为完整通过**
主台账基准：V4（本轮已关闭 `REL-ICON`，其余条件未改）
性质：实际安装测试，未改源码/依赖/打包配置；未启动 C/D 阶段。

---

## 1. 结论摘要

| 测试项 | 结果 |
| --- | --- |
| **B1 全新安装** | ✅ **通过**（退出码 0，4.6 s；74 个文件 / 270.87 MB；桌面与开始菜单快捷方式、HKCU 卸载入口齐全） |
| **B2 首次启动** | ✅ **通过（附环境限制）**（窗口渲染完整、运行于 `app.asar`、34 个 IPC 通道注册成功、0 控制台异常、用户数据目录创建正常；**本机必须关闭 GPU 才能启动**，见 §5） |
| **B3 升级安装** | ⬜ **未执行**——**无上一版本安装包**（全机仅 0.1.0）。另有 1 项"同版本覆盖安装"补充观察，**不计入 B3 通过** |
| **B4 卸载** | ✅ **基本通过**（退出码 0；注册表条目清零；两个快捷方式移除；**用户数据 90,535 个文件 / 361.8 MB 完整保留**；**残留 1 个空安装目录**） |
| **B 类整体** | **部分通过**：安装 / 启动 / 卸载三项有证据；**升级缺证据** |
| `REL-PKG` 整体 | **仍未关闭**（B 类未完整，C/D 未开始） |

---

## 2. 测试环境与安装包身份

### 2.1 环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Microsoft Windows 11 专业版，Version 10.0.26100，Build 26100，x64 |
| 计算机名 | CIALLO |
| 测试用户 | `CIALLO\qituo` |
| 权限 | 在 Administrators 组内，但**进程未提权**（UAC 过滤令牌）；per-user 安装无需提权 |
| 测试时间 | 2026-11-01 05:07:58 – 05:14:42 |
| 隔离性说明 | **无可用虚拟机**，故采用 electron-builder 的 **per-user 安装**（`oneClick:false`、`perMachine:false`），安装到 `%LOCALAPPDATA%\Programs\...`，用户数据在 `%APPDATA%`，与当前开发目录 `E:\mc kjs` 完全分离；**未触碰任何既有安装或生产配置**（安装前实测：无同名安装、无卸载注册表项、无用户数据目录） |

### 2.2 安装包身份

| 项 | 值 |
| --- | --- |
| 路径 | `E:\mc kjs\dist\KubeJS Recipe Studio Setup 0.1.0.exe` |
| 大小 | **82,360,469 B** |
| 修改时间 | 2026-11-01 05:01（与 PACK-03 构建时刻一致） |
| **SHA-256** | **`3c1bad88a9e14ae5e109fd702d90a74971fb11056fa2125037f934ac5aa01ecc`** |
| 与 PACK-03 对应性 | ✅ 名称、大小与 PACK-03 §4.2/§8 记录完全一致；该文件自 05:01 生成后未被替换。**注**：PACK-03 未记录 SHA-256，本轮为首次计算并记录，此后可作为同一产物的身份凭据 |

---

## 3. B1 全新安装

| 步骤 | 命令 / 操作 | 结果 |
| --- | --- | --- |
| 1 | `"dist\KubeJS Recipe Studio Setup 0.1.0.exe" /S` | 退出码 **0**，耗时 **4.6 s** |
| 2 | 检查安装目录 `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio` | 存在；**74 个文件 / 270.87 MB**；主程序 `KubeJS Recipe Studio.exe` = 188,831,744 B |
| 3 | 检查快捷方式 | 桌面 `KubeJS Recipe Studio.lnk` ✅；开始菜单 `KubeJS Recipe Studio.lnk` ✅ |
| 4 | 检查卸载入口 | HKCU 卸载键 `ead40464-49f1-54a5-bf84-970a4324381b` ✅；`DisplayName=KubeJS Recipe Studio 0.1.0`；`Publisher=KubeJS Recipe Studio`；`DisplayIcon=...\KubeJS Recipe Studio.exe,0`；`QuietUninstallString=... /currentuser /S`；卸载器 240,933 B ✅ |
| 5 | 已安装程序的产品信息 | ProductName / CompanyName = `KubeJS Recipe Studio`；FileVersion = `0.1.0`；FileDescription 与 `package.json` 逐字一致 ✅ |
| 6 | 已安装程序的图标 | **8/8 尺寸字节级命中**（与 `build/icon.ico` 逐条目比对）✅ |
| 7 | 与服务端产物一致性 | 已安装 exe 与 `dist/win-unpacked/KubeJS Recipe Studio.exe` **SHA-256 完全相同**（`193E131D…466F28`）✅ |

**证据**：`.cache/pack-04/b1-install.log`、`b1-artifacts.txt`、`b1-exe-info.txt`、`b1-icon-embed.txt`

**遗留观察（非阻塞）**：卸载注册表项中 **`InstallLocation` 缺失**（空）。部分第三方卸载/清工具依赖该字段定位安装目录。

---

## 4. B2 首次启动

### 4.1 过程

| 步骤 | 操作 | 结果 |
| --- | --- | --- |
| 1 | 无附加参数启动 | ❌ **崩溃**：GPU 子进程连续 9 次 `exit_code=-1073741819 (0xC0000005)`，随后 `FATAL: GPU process isn't usable`；Windows 事件日志记录 `APPCRASH`，异常码 `0x80000003`。**属本机 GPU 环境限制，非本次打包引入**（详见 §5） |
| 2 | 使用项目 E2E 同款参数启动：`--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --remote-debugging-port=9399` | ✅ 启动成功；12 s 后进程存活、`MainWindowTitle='KubeJS Recipe Studio'`、`Responding=True` |
| 3 | CDP 探测（页面/DOM/控制台/截图） | ✅ 见 §4.2 |
| 4 | 关闭 | `taskkill /IM "KubeJS Recipe Studio.exe" /T /F` 干净退出 |

### 4.2 启动后实测

| 检查项 | 实测 | 判定 |
| --- | --- | --- |
| 页面标题 | `KubeJS Recipe Studio` | ✅ |
| 页面 URL | `file:///.../resources/**app.asar**/out/renderer/index.html` | ✅ **确证运行于 asar 内** |
| `readyState` | `complete` | ✅ |
| 主窗口内容 | 三栏布局完整：左栏「当前整合包 / 配方浏览 / 工作台 / 设置与诊断」，顶栏「导入整合包」，中栏「从左拖拽一个物品开始」，右栏「未选择配方」，状态栏「界面已就绪」 | ✅（截图 `.cache/pack-04/b2-window.png`） |
| `.view-tabs button` | 3 个（符合 P-C7 契约） | ✅ |
| preload 桥 | `window.studio` 存在，键为 `invoke,onEvent,iconUrl` | ✅ |
| 控制台事件 | `Runtime.consoleAPICalled` / `Log.entryAdded` / `exceptionThrown` 共 **0 条** | ✅ |
| 错误提示 | `.toast` 数量 **0** | ✅ |
| 本次启动日志 | `IPC handler 已注册 34 个 channel`；`数据目录（prod）：C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio`；`界面已加载`。**本次无 ERROR / WARN** | ✅ |
| 用户数据目录 | 创建正常：`logs`、`icon-cache`、`studio-cache`、`recipe-backups`、`plugins`、`cache`、`Preferences`、`Local State` 等 | ✅ |
| dev/prod 目录隔离 | prod 用 `%APPDATA%\kubejs-recipe-studio`；dev 用 `%APPDATA%\kubejs-recipe-studio-dev`（均存在，互不覆盖） | ✅（仅确认存在，**完整隔离验证属 C 阶段**） |

> **不以"窗口出现"为唯一判据**：本项结论同时依据 DOM 结构、控制台零异常、应用自身日志（34 通道注册 + prod 路径分支 + 界面已加载）、用户数据目录落盘四项证据。

**证据**：`b2-launch.txt`、`b2-probe.txt`、`b2-window.png`、`b2-userdata.txt`、`b2-gpu-crash.md`、`b2-after-exit.txt`

---

## 5. 必须记录的启动环境限制与干扰项

| # | 事项 | 说明 | 影响 |
| --- | --- | --- | --- |
| 1 | **GPU 路径在本机不可用** | 不加 `--disable-gpu` 等参数时，GPU 子进程崩溃（0xC0000005）→ 主进程 FATAL 退出。项目自身 E2E（`.cache/e2e-pc7.mjs:30`）**一直**以 `--no-sandbox --disable-gpu*  --in-process-gpu` 启动，说明这是 P-C7 阶段就存在的本机环境限制 | 本机无法验证"正常 GPU 路径"下的启动；**若目标用户机器 GPU 驱动异常，存在同样崩溃风险**——此项独立记录为待评估风险，不属于 REL-PKG-B 的通过条件，也不因本轮测试通过而消失 |
| 2 | **`ELECTRON_RUN_AS_NODE=1` 干扰** | 首次尝试启动时报 `bad option: --remote-debugging-port=9399`，原因是测试 shell 继承了 `ELECTRON_RUN_AS_NODE=1`，使打包应用被当纯 Node 运行。清除该变量后正常。**这是测试环境问题，不是应用缺陷** | 已排除；普通用户双击启动不受影响 |
| 3 | **启动方式影响进程存活** | 用 `Start-Process` 从工具会话启动时，会话结束会连带结束子进程（首次观察到的"12 s 后消失"即此原因）。改用 detached + 常驻父进程后稳定 | 已排除，非应用缺陷 |
| 4 | **userData 内存在 P2 之前的历史 dev 数据** | `%APPDATA%\kubejs-recipe-studio` 中有 2026-10-30/31 的旧日志与 90,301 个图标缓存文件（P2 引入 `-dev` 后缀之前，dev 也用默认目录）。本次打包应用复用了该目录 | 不影响本次结论（本次启动未触发扫描，仅 3 行日志）；但说明**本机不是"绝对干净的首启环境"** |

---

## 6. B3 升级安装 —— **未执行**

| 项 | 结论 |
| --- | --- |
| 上一版本安装包 | **不存在**。全机检索 `*Setup*.exe` 仅得 `0.1.0` 一个；`PACK-01/02` 均未产出安装包；`package.json` 版本为 `0.1.0` |
| 判定 | **未执行（不伪造通过）** |
| 缺失证据 | 升级后数据保留、升级后启动、版本号变更、旧版本残留清理 |

**补充观察（明确不计入 B3）**：在已安装 0.1.0 的状态下再次运行 0.1.0 安装包：

| 项 | 结果 |
| --- | --- |
| 退出码 / 耗时 | 0 / 5.1 s |
| 覆盖安装是否成功 | ✅（安装目录仍为 74 个文件） |
| 用户数据是否保留 | ✅ 哨兵 `recipe-backups/94edb64c700da612/module_acid_rain_proof_unit.json.20261031-180519.f08a4e` 哈希不变（`F08A4E61…80DA85`）；`Preferences` 哈希不变（`BE4B8924…D0B5DE`） |

> 这只说明"同版本覆盖安装不破坏数据"，**不能替代跨版本升级验证**。

证据：`.cache/pack-04/b3-reinstall-observe.txt`

---

## 7. B4 卸载

### 7.1 过程（含一次失败尝试，据实记录）

| 尝试 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `Uninstall KubeJS Recipe Studio.exe /S /currentuser` | ❌ **无效**：退出码为空、30 s 后安装目录与注册表条目均未变化、无残留进程。**参数顺序与系统声明的不一致**（`QuietUninstallString` 为 `/currentuser /S`） |
| 2 | `Uninstall KubeJS Recipe Studio.exe /currentuser /S`（取自 `QuietUninstallString`） | ✅ 退出码 **0**，耗时 47.6 s；注册表条目清零；两个快捷方式移除；文件全部删除 |

> 尝试 2 的参数顺序来自注册表声明的静默卸载命令，属"按系统登记的正确方式重试"，非盲目重试。

### 7.2 卸载后状态

| 检查项 | 结果 | 判定 |
| --- | --- | --- |
| 程序文件 | 安装目录内 **0 个条目**（文件全部删除） | ✅ |
| 空目录残留 | `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio` **仍存在但为空** | ⚠️ 残留（见 §7.3） |
| 桌面快捷方式 | 已移除 | ✅ |
| 开始菜单快捷方式 | 已移除 | ✅ |
| 卸载注册表条目 | HKCU 下 **0 条** | ✅ |
| **用户数据** | `%APPDATA%\kubejs-recipe-studio`：**90,535 个文件 / 361.8 MB 全部保留**；哨兵哈希不变 `F08A4E61…80DA85`；`Preferences` 哈希不变 | ✅ **未被删除**（符合"卸载不删用户数据"的预期） |
| 残留进程 | 无 | ✅ |

### 7.3 卸载瑕疵（1 项）

- **空安装目录未被移除**：NSIS 删除了目录内全部内容，但保留了 `KubeJS Recipe Studio` 目录本身。
- 影响：轻微（0 字节、不影响重装；重装会复用该目录）。
- 归类：**外观性瑕疵，不构成 B4 失败**，但应记录。

**证据**：`b4-snapshot-before.txt`、`b4-sentinel.txt`、`b4-uninstall.log`（尝试 1）、`b4-state.txt`、`b4-registry.txt`、`b4-uninstall2.log`（尝试 2）、`b4-after.txt`

---

## 8. 用户数据保留情况（汇总）

| 时点 | 文件数 | 大小 | 哨兵哈希 |
| --- | --- | --- | --- |
| 安装前 | 90,535 | 361.8 MB | — |
| 覆盖安装后 | 90,535 | 361.8 MB | 不变 ✅ |
| 卸载后 | **90,535** | **361.8 MB** | **不变** ✅ |

结论：**安装、覆盖安装、卸载均未触碰用户数据**；卸载行为符合"只清程序、保留数据"的预期。

---

## 9. 未签名与 SmartScreen 风险

| 项 | 内容 |
| --- | --- |
| 证据 | `PACK-03` 日志 4 处 `no signing info identified, signing is skipped` |
| 表现 | 安装包与主程序均无数字签名；双击安装时 Windows SmartScreen 会显示「未知发布者 / Windows 已保护你的电脑」，需用户点"仍要运行" |
| 本轮观察 | 静默安装（`/S`）不触发 SmartScreen 交互，故不影响自动化测试；但**真实用户手动安装会遇到** |
| 归类 | **分发风险**，已登记在主台账 §8 第 8 项；**不属于 REL-PKG-B 的验收条件**，也不因 B 阶段通过而消失 |

---

## 10. REL-PKG-B 阶段最终判断

| B 类子项 | 状态 | 证据强度 |
| --- | --- | --- |
| 安装 | ✅ 通过 | 退出码 0 + 文件/快捷方式/注册表/图标/哈希 6 项实测 |
| 启动 | ✅ 通过（附 GPU 限制） | DOM + 控制台零异常 + 应用日志 + 用户数据落盘 + 截图 |
| **升级** | ⬜ **未执行** | 无上一版本安装包 |
| 卸载 | ✅ 通过（1 项外观瑕疵） | 注册表/快捷方式/文件清理 + 用户数据保留（含哈希比对） |

**B 类判定：部分通过 —— 4 项中 3 项通过、1 项未执行。**

按台账 V4 对 `REL-PKG` 的定义，"B. 安装流程"的通过标准是"安装 → 启动 → 核心扫描 → **升级（数据保留）** → 卸载，每步有结果记录"。**升级一项无记录，因此 B 类不能标记为通过**。

---

## 11. REL-PKG 整体状态

| 类别 | 状态 |
| --- | --- |
| A. Windows 打包 | ✅ 通过（PACK-03） |
| **B. 安装流程** | ⚠️ **部分通过（升级未执行）** |
| C. 打包后目录隔离（= REL-VERIFY-PKGDIR） | ⬜ 未开始 |
| D. asar + worker 冒烟（含审计 C3） | ⬜ 未开始 |

**`REL-PKG` 仍未关闭。** 本轮不因 A、B 阶段推进而提前关闭，也未修改任何条件定义或验收范围。

---

## 12. 未执行 / 阻塞事项

| # | 事项 | 原因 |
| --- | --- | --- |
| 1 | B3 升级安装 | 无上一版本安装包（需先产出 0.1.1 或保留旧包） |
| 2 | REL-PKG-C（打包后目录隔离） | 按指令不启动 |
| 3 | REL-PKG-D（asar Worker + 295-JAR 冒烟） | 按指令不启动 |
| 4 | REL-VERIFY-DUAL / REL-VERIFY-4K | 按指令不启动 |
| 5 | 正常 GPU 路径下的启动验证 | 本机 GPU 环境不可用，无法验证 |
| 6 | 交互式（非静默）安装 UI 走查 | 无人值守，未做；静默安装已验证核心行为 |

---

## 13. 一句话结论

**安装、启动、卸载三项都有实打实的证据，但"升级"这一项没法做——没有上一版本安装包，我不会拿同版本覆盖安装去冒充它。** 因此 B 类只能算部分通过，`REL-PKG` 依然未关闭。另有两件事必须记住：本机启动必须关 GPU（否则崩溃），以及安装包没有签名（SmartScreen 会拦）。
