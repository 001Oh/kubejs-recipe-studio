# PACK-11 · REL-PKG-B3 / N5 补测报告（覆盖安装后启动）

- 日期：2026-11-01
- 性质：**实际运行验证**（方案 A）。未修改源码/配置/安装包/用户数据；未卸载、未重装；未清理任何历史证据；未处理 `REL-VERIFY-DUAL`/`REL-VERIFY-4K`。
- 授权依据：负责人批准方案 A（§7 最小补测），**仅补测 N5**，不重复 N1–N4。
- 前置报告：`docs/LEDGER-B3-ACCEPTANCE-CHANGE-REPORT.md`（N1–N4、N6 已判通过；N5 缺证据）

---

## 0. 结论摘要

**N5 补测通过：7 项通过标准全部满足。**

| 通过标准 | 结果 |
| --- | --- |
| 覆盖安装成功 | ✅ 退出码 0 / 4.5 s |
| 覆盖安装后的应用能够直接启动 | ✅ PID 56516，安装结束后 **12.4 s** 启动，期间无卸载/重装 |
| `app:runtime` 能正常返回 | ✅ `appVersion=0.1.0`，`userData` = 既有 prod 目录 |
| 日志存在有效启动记录 | ✅ 3 行（`IPC handler` / `数据目录（prod）` / `界面已加载`），日志 23,778 → 24,552 B |
| DOM 探测确认界面正常加载 | ✅ 3 个导航项、`readyState=complete`、0 异常；**截图与 PACK-04 B2 逐字节一致** |
| 关键用户数据可读取 | ✅ 见 §6.4 |
| sentinel 与 Preferences 哈希与安装前完全一致 | ✅ `F08A4E61…80DA85` / `BE4B8924…D0B5DE` |

> 与 N1–N4 合并后，新验收标准 **六项（N1–N6）全部满足**。
> 但按负责人要求，**本轮不生成 V7、不修改 V6**，等待审阅。

**必须同时阅读 §9**：本次启动由**应用自身**改写了 `uiState.json` 并追加了日志（属正常启动行为，非人工修改）；`uiState` 的内容保留性**仍未验证**。

---

## 1. 执行范围与边界

| 项 | 内容 |
| --- | --- |
| 只补的项目 | **N5**（覆盖安装后、卸载前的启动证据） |
| 不重复的项目 | N1、N2、N3、N4、N6（已在前一轮判定通过） |
| 安装包 | `dist/KubeJS Recipe Studio Setup 0.1.0.exe`（82,360,469 B，SHA-256 `3c1bad88…01ecc`） |
| 覆盖对象 | 已安装的 `KubeJS Recipe Studio 0.1.0`（`%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\`） |
| 用户数据 | `%APPDATA%\kubejs-recipe-studio`（真实 prod 目录，**全程只读比对**） |
| 启动参数 | `--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --remote-debugging-port=9411`（本机 GPU 限制，见 `PACK-04` §5） |
| 证据目录 | `.cache/pack-11/`（本轮新建，**不清理**） |

---

## 2. 执行时间线（真实时间，精确到毫秒）

| 时间 | 事件 | 证据 |
| --- | --- | --- |
| 06:14:26.935 | 记录**安装前基线**（安装目录 74 文件 / 270.9 MB；userData 90,535 文件 / 361.8 MB；哨兵 + Preferences 哈希） | `01-pre.txt` |
| **06:14:35.551** | **同版本覆盖安装开始**（`/S`，静默、默认目录） | `install.txt` |
| **06:14:40.073** | **覆盖安装结束：退出码 0，耗时 4.5 s** | `install.txt` |
| 06:14:47.075 | 记录**安装后 / 启动前**状态（用于隔离"安装器副作用"） | `02-post-install.txt` |
| **06:14:52.467** | **直接启动已安装应用**（PID 56516）—— 距覆盖安装结束 **12.4 s**，期间**无卸载、无重装** | `launch.txt` |
| 06:14:52.806 | 日志：`IPC handler 已注册 34 个 channel` | 日志第 161 行 |
| 06:14:52.817 | 日志：`数据目录（prod）：C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio` | 日志第 163 行 |
| 06:14:53.208 | 日志：`界面已加载` | 日志第 164 行 |
| 06:14:53.557 | 应用写入 `uiState.json`（见 §9） | 文件 mtime |
| 06:14:54 | CDP 探测：`app:runtime` / `ui:get` / `modpack:current` / DOM / 截图 | `probe.txt`、`n5-window.png` |
| 06:15:20 | 通过 CDP `Browser.close` **优雅关闭**（不强杀） | `close.txt` |
| 06:15:27.183 | 记录**启动后**状态并复测哈希 | `03-post-launch.txt` |

**关键顺序合规性**：覆盖安装 → 启动 → 关闭，**全程未出现卸载或重装**，满足"不得先卸载再启动"的硬约束。

---

## 3. 第 1–2 步：安装环境与版本确认

```
--- 安装目录 ---
存在=true  文件数=74  总大小=270.9 MB
主程序大小=188831744  修改时间=2026/11/1 05:01:22
主程序 SHA256=193E131D0C39590BB4651414824F91538D4059A0A9FD63154F03398BE0466F28
app.asar/package.json: name=kubejs-recipe-studio version=0.1.0
```

| 校验项 | 结果 |
| --- | --- |
| 当前已安装 | ✅ 74 文件 / 270.9 MB（与 PACK-04 首装一致） |
| 当前版本 = 0.1.0 | ✅ **`app.asar/package.json` → `version=0.1.0`**（以安装包内清单为准，非仅看文件名） |
| 主程序 SHA | ✅ `193E131D…66F28`，与前一轮安装记录一致（载荷未变） |
| 用户数据 | ✅ 存在，90,535 文件 / 361.8 MB |

---

## 4. 第 3 步：同版本覆盖安装结果

```
=== 同版本覆盖安装（0.1.0 over 0.1.0）· N5 补测 ===
安装包: dist/KubeJS Recipe Studio Setup 0.1.0.exe
安装包大小: 82360469 B
开始: 2026/11/1 06:14:35
参数: /S   （静默安装，默认目录，覆盖现有安装）

退出码: 0
耗时: 4.5s
结束: 2026/11/1 06:14:40
```

安装后即时核对：安装目录存在、主程序存在、大小 188,831,744 B。

> 说明：主程序 `mtime` 仍显示 `05:01:22`（构建时间），因 NSIS 保留归档内的时间戳，**不代表未被覆盖**——覆盖已由退出码 0 与随后的启动成功共同证明。

---

## 5. 第 4–5 步：不卸载、直接启动

启动记录（`launch.txt`）：

```
=== 覆盖安装后启动（N5 补测） ===
启动时间: 2026/11/1 06:14:52
可执行文件: C:\Users\qituo\AppData\Local\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe
参数: --no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --remote-debugging-port=9411
环境清理: ELECTRON_RUN_AS_NODE / NODE_OPTIONS 已删除
PID: 56516
```

进程状态（`tasklist`，启动后）：

```
"KubeJS Recipe Studio.exe","56516"   148,268 K   ← 主进程
"KubeJS Recipe Studio.exe","69640"    51,584 K
"KubeJS Recipe Studio.exe","58856"   101,080 K
```

关闭后复核：`没有运行的任务匹配指定标准` → 无残留进程。

---

## 6. 第 6 步：四项证据（原文摘录）

### 6.1 `app:runtime`（台账指定方式）

```json
{"ok":true,"data":{"appVersion":"0.1.0","userData":"C:\\Users\\qituo\\AppData\\Roaming\\kubejs-recipe-studio","platform":"win32"}}
```

- `appVersion` = **0.1.0** → 运行的确为覆盖安装后的版本；
- `userData` = **既有 prod 目录**（非新建空档案）。

### 6.2 应用日志中的启动成功记录

```
2026-10-31T22:14:52.806Z  INFO    IO      IPC handler 已注册 34 个 channel
2026-10-31T22:14:52.817Z  INFO    IO      数据目录（prod）：C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio
2026-10-31T22:14:53.208Z  INFO    UI      界面已加载
```

日志文件 `logs/studio-2026-11-01.log`：**23,778 B @ 05:23:29 → 24,552 B @ 06:14:53**（+774 B）。
该文件是**既有文件**（含 10-30 起的历史记录），本轮为**追加**，非新建。

### 6.3 DOM 探测

```json
{"title":"KubeJS Recipe Studio",
 "href":"file:///C:/Users/qituo/AppData/Local/Programs/KubeJS%20Recipe%20Studio/resources/app.asar/out/renderer/index.html",
 "readyState":"complete","bodyLen":314,
 "tabs":3,"tabTexts":["配方浏览","工作台","设置与诊断"],
 "rootChildren":1,"toasts":0,
 "hasStudioBridge":true,"bridgeKeys":"invoke,onEvent,iconUrl"}
```

- `readyState=complete`、`rootChildren=1`、3 个导航项文案正确、**0 toast**、**控制台/异常事件 = 0**；
- 页面 `href` 指向**已安装目录**下的 `app.asar`，确认加载的是安装版资源；
- 截图 `n5-window.png`（57,202 B）与 `PACK-04` 的 `b2-window.png` **SHA-256 完全相同**（`0adee197…62b25a`，`cmp` 逐字节一致）→ 覆盖安装后的界面渲染与首装启动**完全一致**。

### 6.4 用户数据目录与关键数据读取

| 层次 | 证据 |
| --- | --- |
| 目录级 | `app:runtime.userData` = 既有 `…\kubejs-recipe-studio`；启动后 userData 仍为 **90,535 文件 / 361.8 MB**（未生成新空档案，无批量新增/丢失） |
| 文件级 | `Preferences`（57 B）与 `Local State`（434 B）**可读**（读取首 16 字节成功）；`recipe-backups` 2 个子目录（50 + 2 文件）完整；哨兵文件在且哈希不变 |
| 应用级 | 应用**成功追加**到既有 `logs/studio-2026-11-01.log`（+774 B，同文件）——即应用确实在同一 userData 根下读写 |
| 持久化读取通路 | `ui:get` 返回 `{"ok":true,"data":{"sidebarWidth":320,…,"theme":"graphite","x":270,"y":85,"width":1440,"height":900}}`，与磁盘 `uiState.json` 内容一致 |

> ⚠️ **`ui:get` 一项的限定**：`uiState.json` 的 mtime 为 `06:14:53.557`，即**本次启动过程中被应用覆写**。故它只能证明"读取通路可用"，**不能证明"读取到了安装前已有的 uiState 内容"**。`uiState` 的内容保留性按 §11 记为**未验证**。

---

## 7. 第 7 步：哈希复测对比（安装前 → 安装后 → 启动后）

| 项目 | 安装前 06:14:26 | 安装后/启动前 06:14:47 | 启动后 06:15:27 | 判定 |
| --- | --- | --- | --- | --- |
| 哨兵 `…f08a4e`（603 B） | `F08A4E6103F1C905B8113427A46967FFD98C22BF3DF72E2F19A5FD721980DA85` | 同左 | **同左** | ✅ 完全一致 |
| `Preferences`（57 B） | `BE4B8924AB38E8ACF350E6E3B9F1F63A1A94952D8002759ACD6946C4D5D0B5DE` | 同左 | **同左** | ✅ 完全一致 |
| userData 文件数 / 大小 | 90,535 / 361.8 MB | 90,535 / 361.8 MB | 90,535 / 361.8 MB | ✅ 一致 |
| `recipe-backups` | 52 文件 / 28.9 KB | 52 / 28.9 KB | 52 / 28.9 KB | ✅ |
| `studio-cache` | 18 文件 / 297,608.2 KB | 同左 | 同左 | ✅ |
| `icon-cache` | 90,301 文件 / 58,597.4 KB | 同左 | 同左 | ✅ |
| `cache` | 38 文件 / 9,698.8 KB | 同左 | 同左 | ✅ |
| `plugins` | 0 文件 | 0 | 0 | ✅ |
| `logs` | 3 文件 / 646.0 KB | 3 / 646.0 KB | 3 / **646.8 KB** | 正常追加（见 §9） |
| 安装目录 | 74 文件 / 270.9 MB | 74 / 270.9 MB | 74 / 270.9 MB | ✅ 覆盖后仍完整 |

**结论**：安装器对用户数据**零改动**（06:14:26 与 06:14:47 完全一致）；启动仅追加日志，未触碰哨兵与 `Preferences`。

---

## 8. 通过标准逐条判定

| # | 标准 | 判定 | 依据 |
| --- | --- | --- | --- |
| 1 | 覆盖安装成功 | ✅ | 退出码 0 / 4.5 s / 安装目录 74 文件 |
| 2 | 覆盖安装后的应用能够直接启动 | ✅ | 安装结束后 12.4 s 启动，PID 56516，期间无卸载/重装 |
| 3 | `app:runtime` 能正常返回 | ✅ | `ok:true`，`appVersion=0.1.0`，`userData`=既有 prod 目录 |
| 4 | 日志存在有效启动记录 | ✅ | 3 行（22:14:52.806 / .817 / 22:14:53.208），日志 +774 B |
| 5 | DOM 探测确认界面正常加载 | ✅ | `readyState=complete`、3 导航项、0 异常、截图与 B2 逐字节一致 |
| 6 | 关键用户数据可读取 | ✅ | §6.4 四层证据（含 `ui:get` 的限定说明） |
| 7 | sentinel 与 Preferences 哈希与安装前完全一致 | ✅ | 两哈希三时点完全相同 |

**7/7 通过 → N5 判定通过。** 无任何一项失败，故未触发"立即停止并报告"的条件。

---

## 9. 数据变动说明（如实披露）

本次启动**不可避免地**产生了以下由**应用自身**写入的变动，均非人工修改：

| 变动 | 详情 | 性质 |
| --- | --- | --- |
| `logs/studio-2026-11-01.log` **+774 B** | 追加 3 行启动记录（含 34 个 channel 清单那一行较长） | 正常运行日志，属预期 |
| `uiState.json` 被覆写 | mtime `2026-11-01 06:14:53.557`（启动后约 0.35 s）；`ui:get` 返回值与其内容一致 | 应用启动时保存窗口/界面状态，属正常行为 |
| userData 文件总数 | **90,535 → 90,535**（无新增、无丢失） | 说明 `uiState.json` 是**覆写既有文件**，非新建 |

**未发生**：哨兵文件改动、`Preferences` 改动、`recipe-backups` 改动、`studio-cache`/`icon-cache`/`cache` 改动、任何安装包或源码改动。

> 我**没有**对 `uiState.json` 做启动前哈希（按负责人 §五 要求不扩大范围），因此其**内容是否变化未测定**。

---

## 10. 必须保留的限制声明

- **本次为同版本覆盖安装（0.1.0 over 0.1.0），不得描述为跨版本升级测试。**
- 原跨版本升级测试**因缺少旧版安装包而无法执行**（`PACK-10` 已全量核查确认）。
- 新验收标准验证的是**同版本覆盖安装及用户数据保留**。
- **不代表已经验证跨版本配置迁移、数据格式迁移或版本兼容性。**
- 启动全程使用 `--disable-gpu*` 参数（本机 GPU 限制，`PACK-04` §5）：**正常 GPU 路径下的启动行为仍未验证**。
- 本次为**脚本化启动**，非交互式双击启动；双击启动的差异属 `REL-VERIFY-DUAL` 范畴，本轮未涉及。
- 未验证卸载后再装的迁移路径（`B4` 已有独立结论），本轮不重复。

---

## 11. `uiState` 保留性：单独记录

| 项 | 状态 |
| --- | --- |
| 原 B3 标准中「升级后 `uiState` 仍在」 | **未验证** |
| 是否因 B3 其他项通过而自动标记通过 | **否** |
| 是否纳入本次 N5 补测范围 | **否**（未对 `uiState.json` 做前后哈希对比） |

**记录理由**：`uiState.json` 在本次启动中被应用覆写（mtime 06:14:53.557），无法据此判断"安装前的 uiState 内容是否保留"；且按负责人指示不得扩大本轮范围。该项须在真正的跨版本升级验证中单独取证。

---

## 12. 证据清单（`.cache/pack-11/`，不清理）

| 文件 | 内容 |
| --- | --- |
| `measure.mjs` | 只读测量脚本（安装目录 + userData + 哈希 + 可读性） |
| `run-install.mjs` / `install.txt` | 覆盖安装执行与退出码、耗时 |
| `launch.mjs` / `launch.txt` | detached 启动、参数、PID、环境清理记录 |
| `probe.mjs` / `probe.txt` | CDP 探测原始输出（`app:runtime`/`ui:get`/`modpack:current`/DOM/事件） |
| `n5-window.png` | 启动后截图（57,202 B，与 `PACK-04/b2-window.png` 逐字节一致） |
| `close.mjs` / `close.txt` | 优雅关闭记录 |
| `01-pre.txt` | 安装前基线 |
| `02-post-install.txt` | 安装后 / 启动前状态 |
| `03-post-launch.txt` | 启动后状态与哈希复测 |

---

## 13. 自检（对照严格限制）

| 限制 | 是否符合 |
| --- | --- |
| 不得先卸载再启动 | ✅ 时间线无卸载/重装，安装后 12.4 s 直接启动 |
| 不得用 PACK-05 重装后启动记录替代 | ✅ 本轮为独立实测；PACK-05 证据在报告中仅作"不可替代"的反面说明，未用作判定依据 |
| 不得用安装包 SHA 相同推导覆盖安装安全 | ✅ 通过与否全部基于本轮直接观测；SHA 仅用于确认"覆盖的是同一载荷" |
| 不得修改代码、配置、安装包、用户数据 | ✅ 未修改任何一项；应用自身写日志/`uiState.json` 已单列披露（§9） |
| 不得清理历史证据和测试目录 | ✅ `.cache/pack-04`、`pack-05`、`pack-11` 均原样保留 |
| 不得处理 `REL-VERIFY-DUAL`、`REL-VERIFY-4K` | ✅ 未启动 |
| 失败或环境异常须立即停止、不自行修复 | ✅ 未出现失败，无需触发 |
| 不得自动生成 V7 或修改 V6 | ✅ 未生成、未修改（V6 MD5 仍为 `7e51ad830df345e820ada83ab78e165a`） |
| `uiState` 须单独记为未验证 | ✅ 见 §11 |

---

## 14. 交付与暂停

本轮交付：本报告 + `.cache/pack-11/` 证据。

**主台账未改动**：V6 保持原样，`REL-PKG` 本体仍为「未验证」，B 类注记仍为「升级 B3 未执行——上一版本安装包缺失」。
**未生成 V7**。

至此暂停，等待负责人审阅。若同意 N5 通过，则 N1–N6 六项全部满足，可授权将 B3 验收标准改为「同版本覆盖安装与用户数据保留验证」并判定通过，据此生成 V7（届时需同步处理：B 类进度注记、`REL-PKG` 本体重判、§10 限制声明与 §11 `uiState` 未验证项写入台账）。
