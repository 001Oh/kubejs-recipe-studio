# T-19 · 发布说明与发布流程（Release Notes 模板 + 检查表）

| 项 | 内容 |
|---|---|
| **任务名** | `T-19 · 发布说明与流程` |
| **对应缺口** | **G-24**（发布说明 / GitHub 流程缺失） |
| **前置** | **T-17（待决策）** —— 版本号与签名口径未定 |
| **授权** | **A1**（仅写 `docs/`） |
| **性质** | 材料 / 模板；**不含任何已执行发布** |
| **状态** | **部分可交付**：与版本/签名无关的部分已完成；与 T-17 绑定的部分标 **BLOCKED** |

## 0. 边界

1. 本稿**未构建、未打包、未安装、未启动应用**，不产生任何 ③ 层证据。
2. 本稿**不决定版本号**，不改 `package.json`。
3. T-17 仍为「待决策（D-32 细化已答复、**未授权执行**）」，本稿**不解除**该状态。
4. 本稿**未修改** V9 台账、V1.1/V1.2 计划、DECISIONS。

---

## 1. 现状事实（只读核实）

| # | 事实 | 值 | 影响 |
|---|---|---|---|
| F1 | 源码版本 | `package.json.version = 0.1.1` | 版本唯一真源 |
| F2 | `package.json.name` | `kubejs-recipe-studio` | drill 的包身份断言依赖此值 |
| F3 | `productName` | **未设置（正确）** | 一旦设置会让 `app.getName()` 变 → userData 目录名变 → 历史数据「看起来全丢」 |
| F4 | `appId` | `com.kubejs.recipestudio` | NSIS 卸载键 GUID 只由 `appId` 决定 |
| F5 | 产物目录 | `dist/`、`dist-011/` **均存在** | 不得清理（本批硬边界） |
| F6 | 已安装版本 | **0.1.0**（据 V9 与既往报告） | ⚠ 与源码 0.1.1 **错位** |
| F7 | 签名 | **未签名** | 属**分发风险**，不计入 `REL-PKG` |

**⚠ 版本错位**：已安装 `0.1.0` ／ 源码 `0.1.1` ／ `dist-011` 为 `0.1.1`。**重新构建前必须先定基准版本**，否则「升级 / 覆盖安装 / 回滚」三条路径的结论都不可信。

---

## 2. Release Notes 模板

> 用法：每个版本一份，放在发布页正文。`{占位}` 必填；`[BLOCKED]` 段在 T-17 决策前不得发布。

```markdown
# KubeJS Recipe Studio v{版本}（{YYYY-MM-DD}）

## 摘要
{一句话：本版解决的用户可见问题}

## 变更
### 修复
- {缺陷编号} {一句话描述}（对应台账 ID：{V9-ID}）

### 变更
- {行为变化，若会影响既有产物/数据必须显式说明}

### 已知限制
- {已知未修项 + 为什么接受}

## 升级说明
- 覆盖安装是否保留用户数据：**是**（卸载参数固定 `/KEEP_APP_DATA` + `--updated`）
- 是否需要手动迁移：{是/否 + 步骤}
- 回滚方式：{指向回滚阶梯}

## 校验
| 文件 | SHA-256 |
|---|---|
| `{产物文件名}` | `{64 位十六进制}` |

校验命令见 §4。

## [BLOCKED] 签名
本版**未签名**。Windows SmartScreen 将提示未知发布者。
签名策略待 **T-17 / D-32** 决策后补充本节。
```

---

## 3. 发布检查表

### 3.1 构建前

| # | 检查 | 判据 | 状态 |
|---|---|---|---|
| B1 | 版本号已定且唯一 | `package.json.version` == lockfile 两处 == Release Notes | **BLOCKED（T-17）** |
| B2 | `productName` **未设置** | `package.json` 无该键 | 可执行 |
| B3 | 门禁全绿 | `typecheck` / `lint --max-warnings=0` / `build` / `test` 全 0 | 可执行（但本机 `test` 受环境策略影响，见 §5） |
| B4 | 工作区干净 | 无未备案的 `src`/`tests` 改动（用文件时间戳 + 哈希） | 可执行 |
| B5 | 打包镜像变量已设 | `ELECTRON_BUILDER_BINARIES_MIRROR=https://hk.gh-proxy.com/https://github.com/electron-userland/electron-builder-binaries/releases/download/` | 可执行 |
| B6 | Windows 开发人员模式 | 已开启（符号链接权限） | 可执行 |

### 3.2 构建

| # | 检查 | 判据 |
|---|---|---|
| C1 | 产物目录 | `dist*/` 内出现 installer + `latest.yml` |
| C2 | 产物版本 | installer 文件名含版本号，且与 B1 一致 |
| C3 | **`nsis.guid` 未改** | 与上一版相同；一旦改，安装不再被视为「升级」 |

### 3.3 安装 / 卸载（需 A4/A5，本批未授权）

| # | 检查 | 判据 |
|---|---|---|
| D1 | 覆盖安装保留用户数据 | 卸载参数含 `/KEEP_APP_DATA` 与 `--updated` |
| D2 | **`/S` 不自动启动** | 安装完成后**不得**出现应用进程；**绝不能加 `--force-run`**（会用默认 userData 写生产数据） |
| D3 | 卸载不清 userData | 卸载后 `%APPDATA%\kubejs-recipe-studio` 仍在 |
| D4 | 升级不产生第二份 userData | 目录名不变（依赖 B2：无 `productName`） |

### 3.4 发布

| # | 检查 | 判据 | 状态 |
|---|---|---|---|
| E1 | Release Notes 已按 §2 填完 | 无 `{占位}` 残留 | 可执行 |
| E2 | SHA-256 已写入 | §4 命令输出粘进 E2 | 可执行 |
| E3 | 已知限制已列 | 至少含「未签名」「环境验证 0/15」 | 可执行 |
| E4 | 签名段 | 按 T-17 结论 | **BLOCKED** |

---

## 4. SHA-256 校验说明

### 4.1 生成（发布者）

```bash
# 单文件
sha256sum "dist/KubeJS Recipe Studio Setup 0.1.1.exe"

# 批量（写入发布页）
sha256sum dist/*.exe dist/*.yml
```

### 4.2 校验（用户）

```powershell
# PowerShell
Get-FileHash ".\KubeJS Recipe Studio Setup 0.1.1.exe" -Algorithm SHA256
```

```bash
# Git Bash / WSL
sha256sum "KubeJS Recipe Studio Setup 0.1.1.exe"
```

**必须写明**：拿到的是 **64 位十六进制**，与发布页逐字符比对；不一致即**不得安装**。

### 4.3 本项目额外要求

- 校验对象**至少包含 installer 本身**；`latest.yml` 建议一并给出（自动更新通道校验）。
- 若将来启用签名，SHA-256 仍要发布（签名与哈希解决的是不同问题）。

---

## 5. 已知会阻断「发布前门禁」的环境问题（必须提前告知）

本轮实测：宿主 `safe-delete` 策略对 **≥50 项**的批量删除要求逐次确认，导致：

| 现象 | 实测 | 判定 |
|---|---|---|
| 全量 `vitest run` | 86 文件 / 781 用例，**16 失败**，全部抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（`count:50` 恰为阈值），抛出点在测试 `boot()` 的 `rmSync` 清理步骤 | **环境致因**，非代码缺陷 |
| `.cache/fix14/rehearsal2.sh` | 阶段 A 完整正向流程 PASS；阶段 B 起每次 `reset_sandbox` 的 `rm -rf` 被拦 | **环境致因** |

**对发布流程的影响**：B3「门禁全绿」在当前终端**无法达成**。发布前必须在**不受该策略限制的环境**重跑并留证，否则 `test` 项只能记 **BLOCKED**。

---

## 6. 验收判据（T-19 自身）

| # | 判据 | 状态 |
|---|---|---|
| 1 | Release Notes 模板可直接用 | ✅（§2） |
| 2 | 检查表覆盖 构建前/构建/安装卸载/发布 四段 | ✅（§3） |
| 3 | 含 SHA-256 校验说明（生成 + 校验 + 本项目要求） | ✅（§4） |
| 4 | 未发布、未构建、未改版本 | ✅（§0） |
| 5 | 与 T-17 绑定的部分显式标 BLOCKED | ✅（B1、E4） |
| 6 | 已知环境阻断已写明 | ✅（§5） |

## 7. 遗留

| # | 事项 | 归属 |
|---|---|---|
| L1 | 版本基准（0.1.0 已安装 vs 0.1.1 源码） | **T-17 / D-32** 决策 |
| L2 | 是否签名、用什么证书 | 同上 |
| L3 | 发布渠道（GitHub Release / 内部） | **G-24 本体**，需产品定 |
| L4 | 门禁需在非受限环境重跑 | 换环境 + A3 |
| L5 | 本稿未登记 `DOCS-INDEX.md` | 需单独授权 |

---

## 附：0.1.1 安装包与校验方式（第 36 批 T-17 产出）

| 项 | 值 |
|---|---|
| 文件 | `KubeJS Recipe Studio Setup 0.1.1.exe` |
| 大小 | 82,364,069 B（≈79 MB） |
| **SHA-256** | **`70c17a5b5da1929349d17fb1cdb0bb379e0b1566abb5a3ca0841d925cc6c5cc9`** |
| 签名 | **未签名**（D-32 d 项：不签名） |
| 构建 | electron-builder 25.1.8 / electron 33.4.11 / x64，输出重定向 `dist-t17/` |

**用户校验方式（Windows，无需额外工具）**：

1. 在资源管理器地址栏输入 `cmd` 打开命令行，执行：`certutil -hashfile "KubeJS Recipe Studio Setup 0.1.1.exe" SHA256`
2. 或在终端执行等价的 `Get-FileHash ... -Algorithm SHA256`
3. 与上表 SHA-256 逐字符比对（**不区分大小写**）；不一致即**不要运行**。

**未签名的含义**：Windows SmartScreen 可能提示「未知发布者」，这是未签名安装包的预期表现，**不等于文件被篡改**；判定依据是上面的 SHA-256 比对，而非系统提示。

---

## 附二：已知限制 · GPU 异常环境（第 41 批追加）

> **已知限制**：本安装包未在 GPU 异常环境验证。若启动即崩溃（`0xC0000005`），请尝试为启动参数添加 `--no-sandbox --disable-gpu`，或等待后续版本。

**背景**：本机 GPU 不可用（`0xC0000005` 连崩），开发与验证全程使用 `--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu`。因此**正常 GPU 路径未经真机验证**（对应 T-18，负责人已裁决「延后」，待修复本机 GPU 后补验）。

**对用户的含义**：在无独显/驱动异常/远程桌面等环境下，若双击安装包启动即崩，属**已知未验证路径**，不是安装包损坏。先按上面的参数试启动；仍不行请反馈。

---

## 附录 0.1.3 · 当前发布基准（第 97 批更新，**以本附录为准**）

正文成稿于 0.1.1 时期（保留为历史），**发布基准已推进到 0.1.3**。

### A. 版本与产物

| 项 | 值 |
|---|---|
| 源码版本（唯一真源） | **0.1.3**（`package.json.version`；**无 `productName`**，userData 目录名不受影响） |
| 安装包 | `dist-013/KubeJS Recipe Studio Setup 0.1.3.exe` |
| 大小 | **82,372,678 B** |
| **SHA-256** | **`c4134a15507cef701f3c3c236740d4558168d8c5d7c98e74a688cc105df532b0`** |
| blockmap | `dist-013/KubeJS Recipe Studio Setup 0.1.3.exe.blockmap`，86,260 B<br>`fb60b3de94bead0b192d98ee63bd849f8485b571967f007ad5c3b021e37ac757` |
| 签名 | **未签名**（`no signing info identified, signing is skipped`）——Windows 首次运行会有 SmartScreen 提示 |
| 已验证 dist | `dist` / `dist-011` / `dist-013` / `dist-t17`；`dist-t12` 不存在 |

### B. 校验命令

```
sha256sum "dist-013/KubeJS Recipe Studio Setup 0.1.3.exe"
# 期望 c4134a15507cef701f3c3c236740d4558168d8c5d7c98e74a688cc105df532b0
```

### C. 发布前门禁（0.1.3 实测）

| 项 | 结果 |
|---|---|
| typecheck / lint | 0 / 0 |
| 全量 vitest | **852 passed / 4 skipped / 3 todo / 0 失败** |
| build | exit 0 |
| NSIS（mirror） | exit 0，18 s |
| 冒烟 | **3/3**：启动 + 索引 43,474；T-27 真机清理 1 个日志；sugar 写盘 484 B、`.tmp=0` |

### D. 已知发布注意

- **未签名**：首次运行 SmartScreen 提示，属预期；
- **GPU**：无独显/驱动异常环境需 `--disable-gpu`（历史记录见主文档），否则可能 `0xC0000005`；
- **U-14**：datapack 写盘 30–35 s，属已知限制；
- **T-27 清理缓存**：大目录（图标 3.7 万）在慢盘上耗时数分钟，且**清理期间禁止扫描**（已在 UI 禁用）；
- **OPT4-R4**：取消扫描**不删图标缓存**（A 方案），下次扫描直接命中，属预期行为。

---

## 附录 0.1.6 · 当前发布基准（第 101 批，**以此为准**）

0.1.3 / 0.1.4 / 0.1.5 三份基准均已**作废**（分别缺 U-16、U-17、U-17-PLUGIN-RESIDUE 修复）。

### A. 版本与产物

| 项 | 值 |
|---|---|
| 源码版本（唯一真源） | **0.1.6**（`package.json.version`；**无 `productName`**） |
| 安装包 | `dist-016/KubeJS Recipe Studio Setup 0.1.6.exe` |
| 大小 | **82,373,184 B** |
| **SHA-256** | **`bb84e247bd2b97765fa514759ab0562e7f7d0a699c48a310ddf1ea333568e180`** |
| blockmap | 86,428 B<br>`31058fa3e163269a92e7c0ba1b25411f3096249d6a8ea87b624609c2d55a779a` |
| 签名 | **未签名**（首次运行 SmartScreen 提示，属预期） |

### B. 校验命令

```
sha256sum "dist-016/KubeJS Recipe Studio Setup 0.1.6.exe"
# 期望 bb84e247bd2b97765fa514759ab0562e7f7d0a699c48a310ddf1ea333568e180
```

### C. 发布前门禁（0.1.6 实测）

| 项 | 结果 |
|---|---|
| typecheck / lint | 0 / 0 |
| 全量 vitest | **852 passed / 4 skipped / 3 todo / 0 失败** |
| build / NSIS | exit 0 / exit 0（35 s） |
| 冒烟 | **4 / 4** |

### D. 覆盖安装指引（0.1.0 → 0.1.6）

1. 关闭正在运行的应用；
2. 静默卸载旧版：`"…\Uninstall KubeJS Recipe Studio.exe" /S /KEEP_APP_DATA --updated`
3. 静默安装：`"dist-016\KubeJS Recipe Studio Setup 0.1.6.exe" /S`（**不要加 `--force-run`**：`/S` 不自动启动，加了会用默认 userData 写生产数据）
4. 首次启动：userData 保留，但**如果之前卸载过包，会显示「尚无整合包」——属正常**，导入一次即可；
5. 想腾磁盘：设置页 → 存储与缓存 → 清理缓存（**不会动配方备份**）。

> ⚠️ 已知坑（第 97 批实测）：`/D=` 若带空格且不加引号会被 NSIS 截断，实际装到 `Programs\KubeJS`。**不要传 `/D`**，用默认路径。

### E. 已知发布注意

- 未签名 → SmartScreen 提示；
- GPU：无独显/驱动异常环境需 `--disable-gpu`；
- U-14 datapack 写盘 30–35 s；
- T-27 大目录清理耗时（本机删除 6 个/秒）；
- U-17 卸载**不删**包目录/缓存/备份（设计如此）；
- OPT4-R4 取消扫描**不删**图标缓存（A 方案）。

---

## 附录 0.1.7 · **最终发布基准**（第 107 批）

0.1.3 / 0.1.4 / 0.1.5 / 0.1.6 四份基准**全部作废**。本附录为唯一发布依据。

### A. 版本与产物

| 项 | 值 |
|---|---|
| 源码版本（唯一真源） | **0.1.7**（`package.json.version`；**无 `productName`**，userData 目录名不受影响） |
| 安装包 | `dist-017/KubeJS Recipe Studio Setup 0.1.7.exe` |
| 大小 | **82,374,606 B** |
| **SHA-256** | **`4ba139084c7dcba5cea30d4bee674bab27f9c8669ef4c01ea80949ebb999d9f4`** |
| blockmap | 86,480 B<br>`03c0006ab562d7adaa004b9b3a8b23096d36653a75c9bc87cdbfba88e2b101af` |
| 签名 | **未签名**（首次运行 SmartScreen 提示，属预期） |
| 已验证 dist | `dist` / `dist-011` / `dist-013` / `dist-014` / `dist-015` / `dist-016` / `dist-017` / `dist-t17` |

### B. 校验命令

```
sha256sum "dist-017/KubeJS Recipe Studio Setup 0.1.7.exe"
# 期望 4ba139084c7dcba5cea30d4bee674bab27f9c8669ef4c01ea80949ebb999d9f4
```

### C. 发布前门禁（0.1.7 实测）

| 项 | 结果 |
|---|---|
| typecheck / lint | 0 / 0 |
| 全量 vitest | **852 passed / 4 skipped / 3 todo / 0 失败** |
| build / NSIS | exit 0 / exit 0 |
| 冒烟 | **4 / 4** |

### D. 本版新增（相对 0.1.2）

| 项 | 内容 |
|---|---|
| **U-16** | 无包启动时「配方类型」下拉恢复为 **4 项**（通用 + 3 试点类型） |
| **U-17** | NavRail 新增「**卸载**」整合包（两步确认；只清状态/索引/恢复键，**包目录/缓存/备份全保留**） |
| **U-17-PLUGIN-RESIDUE** | 卸载后同会话不再残留旧包插件类型 |
| **T-28** | 工作台可「**新建结构化配方**」：空白 3×3 网格 → 填材料/产物 → 提交新建 datapack 配方；提交后自动转编辑态（再提交是覆盖，不产生副本） |
| **T-27**（0.1.3） | 设置页「存储与缓存」分类清理（含配方备份灰显锁定；扫描中禁用） |

### E. 覆盖安装指引（0.1.6 → 0.1.7）

1. 关闭正在运行的应用；
2. **直接就地安装**（推荐，第 101 批实测一次成功、无风险窗口）：
   `"dist-017\KubeJS Recipe Studio Setup 0.1.7.exe" /S`
   **不要传 `/D`**（带空格的路径会被 NSIS 截断，第 97 批踩过）；
3. 如需彻底卸载重装：`"…\Uninstall KubeJS Recipe Studio.exe" /S /KEEP_APP_DATA --updated` → 再执行第 2 步；
4. **首次启动若无包属正常**（userData 保留但恢复键可能为空）→ 点「选择目录」导入一次，缓存命中则秒开；
5. 想清磁盘：设置页 → 存储与缓存 → 清理缓存（**不会动配方备份**）。

### F. 已知限制（发布须知）

| 限制 | 说明 |
|---|---|
| **U-18** | 「新建结构化配方」无查重：同内容可建多份（产品语义，非缺陷） |
| **U-14** | datapack 写盘 30–35 s |
| **T-08 回滚** | 「备份后写失败 → 原件恢复」无实机取证（依赖注入改造后才能构造） |
| **OPT4-R4** | 取消扫描的图标清理端到端未验（语义已改 A：不删图标缓存） |
| **T-27 进度条截图** | 缺（本机删除 6 个/秒，小目录秒清） |
| **T-15 / T-16** | 环境受限，见主文档 |
| 未签名 | SmartScreen 提示；GPU 异常环境需 `--disable-gpu` |

---

## 附录 0.1.8 · **最终发布基准**（第 108 批，取代 0.1.7）

### A. 版本与产物

| 项 | 值 |
|---|---|
| 源码版本（唯一真源） | **0.1.8**（无 `productName`） |
| 安装包 | `dist-018/KubeJS Recipe Studio Setup 0.1.8.exe`，**82,374,671 B** |
| **SHA-256** | **`5d3136b38e7d2416fd989b1e1c0013c6f0ff1a63a0b6c91feb905cf1896c6a44`** |
| blockmap | `399e6f2eaa3d9793eaa25ec05ecf4639b15e9c3911f2a7da62b74ef16a030808` |
| 签名 | 未签名（SmartScreen 提示属预期） |
| 门禁 | typecheck 0 / lint 0 / 852 passed / build 0 / NSIS 0 |

### B. 本版新增（相对 0.1.7）

- **U-19**：空工作台不再显示「语法错误」红字
- **U-20**：`sugarUnverified` / `missingAddon` 提示可见（条件补全）
- **U-21**：结构化编辑时右侧改为**草稿 JSON 预览**，不再谎报「没有可生成的内容」

### C. 覆盖安装（0.1.7 → 0.1.8）

```
"dist-018\KubeJS Recipe Studio Setup 0.1.8.exe" /S
```

**不传 `/D`**；首次启动若显示无包属正常，导入一次即可。

### D. 已知限制

U-18（create 无查重）、U-21 的 A 方案只显示 JSON 不显示代码、U-20 未实机验证、U-14 datapack 慢、T-08 回滚无实机取证、OPT4-R4 端到端未测、T-15/T-16 环境受限、未签名。

---

## 附录 0.1.9 · 当前基准（第 110 批）

| 项 | 值 |
|---|---|
| 版本 | **0.1.9**（无 `productName`） |
| 安装包 | `dist-019/KubeJS Recipe Studio Setup 0.1.9.exe`，**82,375,272 B** |
| **SHA-256** | **`b5dbb6427b5b108f247a72514345690de12b7b7b7fc4a108fd54aeec690189aa`** |
| 门禁 | typecheck 0 / lint 0 / **853 passed** / build 0 / NSIS 0 |
| 本版新增 | **U-22**：通用模式（无 schema 类型）回退 `event.custom`；占位类型 `__generic__`/空 type 明确拒绝 |

**⚠️ 已知缺口（U-23，未修）**：写入对话框的通道初值写死 `kubejs-sugar`，不跟随预览的 `channel`；凡 `event.custom` 结果，用户首次点「写入文件」会报 `CHANNEL_UNAVAILABLE`，**需手动切通道**。

---

## 附录 0.1.10 · 当前基准（第 111 批）

| 项 | 值 |
|---|---|
| 版本 | **0.1.10**（无 `productName`） |
| 安装包 | `dist-0110/KubeJS Recipe Studio Setup 0.1.10.exe`，**82,375,390 B** |
| **SHA-256** | **`f94900cecaeaa54650e5d28dce3f5d3bc6840fd445c878aeb2dd51b382df3816`** |
| 门禁 | typecheck 0 / lint 0 / 853 passed / build 0 / NSIS 0 |

**本版修复**：**U-23** 写入对话框通道初值改为跟随预览 → `event.custom` 结果首次写盘即成功（不再需要手动切通道）。
**U-22**（0.1.9 起）：无 schema 类型回退 `event.custom`；`__generic__`/空 type 明确拒绝。
