# PACK-15 · A-预检与回滚准备报告

- 日期：2026-11-01
- 方案：**A — 0.1.0 → 0.1.1 真实就地升级，验证后回滚至 0.1.0**
- 性质：仅预检与回滚资源准备。**未修改版本文件、未构建、未安装、未卸载、未启动应用、未扫描、未改 V8 台账。**
- 本轮实际动作：①归档 0.1.0 安装包（复制）②完整备份正式安装目录（复制）③只读采集安装态/注册表/快捷方式/版本资源/userData 基线 ④阅读 app-builder-lib 的 NSIS 模板确认升级与回滚机制

---

## 0. 结论

> ### ✅ **允许进入覆盖安装（附带 4 条执行门禁，见 §8）**

| 判定项（你的硬条件） | 结果 |
| --- | --- |
| 回滚资源是否缺失 | **否**——安装包已归档且 SHA 与基准一致；另备份了整个安装目录 |
| 安装目标是否明确 | **是**——`%LOCALAPPDATA%\Programs\KubeJS Recipe Studio`，不加 `/D`，路径唯一确定 |
| 生产数据是否可能被写入 | **可控为否**——安装器带 `--updated`+`/KEEP_APP_DATA`；`/S` 不自启应用；运行一律走 `STUDIO_USER_DATA` |
| 快捷方式/注册表恢复是否可靠 | **是**——由 0.1.0 安装器重建（PACK-04 B1 已实测创建这两项），且安装器会先自动卸载旧版 |

**但有两项必须随结论一起读**：
1. **回滚路径（高版本→低版本覆盖）从未实测**——源码无降级拦截，但属残余风险（§7 R1）。
2. **执行顺序不能错**：必须趁正式安装还是 0.1.0 时，先在克隆上设好 `light/380`，否则升级后就没有 0.1.0 可用了（§6.1）。

---

## 1. 回滚资源校验

### 1.1 0.1.0 安装包归档

| 项 | 值 |
| --- | --- |
| 归档路径 | `.cache/pack-13/installers/KubeJS Recipe Studio Setup 0.1.0.exe` |
| 大小 | **82,360,469 B** |
| SHA-256 | **`3C1BAD88A9E14AE5E109FD702D90A74971FB11056FA2125037F934AC5AA01ECC`** |
| 与已知基准比对 | ✅ **完全一致**（与 `PACK-03`/`PACK-10` 记录同值） |
| 与 `dist/` 原件比对 | ✅ `sha256sum` 相同 + `cmp` **逐字节一致** |

> 归档前 `installers/` 目录并不存在 —— 即 D2 此前只做了决策、未落地。**本次已补齐。**

### 1.2 正式安装目录完整备份（兜底）

| 项 | 正式安装目录 | 备份副本 |
| --- | --- | --- |
| 路径 | `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio` | `.cache/pack-15/backup-install-0.1.0` |
| 文件数 | **74** | **74** ✅ |
| 目录数 | **3** | **3** ✅ |
| 逻辑总字节 | **284,023,841**（270.87 MiB） | **284,023,841** ✅ |
| 主程序 SHA-256 | `193E131D…66F28` | `193E131D…66F28` ✅ |
| 磁盘占用 | — | 272 MB（`du` 含簇碎片，**不作判据**） |

> 该备份不能替代注册表/快捷方式的恢复（那两样只能靠安装器重建），但可在"安装器完全失效"时保住可执行文件与 `app.asar`。

---

## 2. 正式安装现状快照

### 2.1 安装目录与主程序

| 项 | 值 |
| --- | --- |
| 安装目录 | `C:\Users\qituo\AppData\Local\Programs\KubeJS Recipe Studio` |
| 主 EXE | `…\KubeJS Recipe Studio.exe` |
| EXE 大小 | 188,831,744 B |
| **EXE SHA-256** | **`193E131D0C39590BB4651414824F91538D4059A0A9FD63154F03398BE0466F28`** |
| 目录内容 | 74 文件 / 3 目录 / 284,023,841 B |

### 2.2 主程序版本资源（`Get-Item .VersionInfo`）

| 字段 | 值 |
| --- | --- |
| `FileVersion` | **0.1.0** |
| `ProductVersion` | **0.1.0.0**（四段补零） |
| `ProductName` | KubeJS Recipe Studio |
| `CompanyName` | KubeJS Recipe Studio |
| `FileDescription` | KubeJS Recipe Studio — 为 Minecraft 整合包可视化编写 KubeJS 配方的桌面应用 |

### 2.3 注册表卸载项

| 项 | 值 |
| --- | --- |
| 键 | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\`**`ead40464-49f1-54a5-bf84-970a4324381b`** |
| `DisplayName` | `KubeJS Recipe Studio 0.1.0` |
| `DisplayVersion` | `0.1.0` |
| **`InstallLocation`** | **空** ← 安装器据此走"从 UninstallString 推导目录"分支 |
| `UninstallString` | `"…\KubeJS Recipe Studio\Uninstall KubeJS Recipe Studio.exe" /currentuser` |
| `QuietUninstallString` | `"…\Uninstall KubeJS Recipe Studio.exe" /currentuser /S` |
| `DisplayIcon` | `…\KubeJS Recipe Studio.exe,0` |

### 2.4 快捷方式（含目标）

> `WScript.Shell` COM 被安全策略拦截，改用**直接解析 `.lnk` 二进制**取得路径。

| | 桌面 | 开始菜单 |
| --- | --- | --- |
| 路径 | `C:\Users\qituo\Desktop\KubeJS Recipe Studio.lnk` | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\KubeJS Recipe Studio.lnk` |
| 大小 | 2,579 B | 2,587 B |
| 修改时间 | 2026-11-01 06:14:40 | 2026-11-01 06:14:39 |
| **TargetPath** | `…\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe` | 同左 |
| **WorkingDir** | `…\Programs\KubeJS Recipe Studio` | 同左 |
| 环境变量形式 | `%USERPROFILE%\AppData\Local\Programs\…\KubeJS Recipe Studio.exe` | 同左 |
| 应用标识 | **`com.kubejs.recipestudio`**（= appId） | 同左 |

### 2.5 userData 基线（全部只读测得）

| 项 | 值 |
| --- | --- |
| 路径 | `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio` |
| 文件数 / 目录数 | **90,535 / 34** |
| **逻辑总字节** | **379,370,049**（= 361.8 MiB） |
| `Preferences` SHA-256 | `BE4B8924AB38E8ACF350E6E3B9F1F63A1A94952D8002759ACD6946C4D5D0B5DE` |
| 哨兵 `…f08a4e` SHA-256 | `F08A4E6103F1C905B8113427A46967FFD98C22BF3DF72E2F19A5FD721980DA85` |
| `uiState.json` | 388 B，SHA-256 `7D1733F3C7983DBE7754C91F2A5404F4EBA00581E692CDEF65118B5795B95046`，**当前为默认值**（`theme:"graphite"`、`sidebarWidth:320`） |

> 当前 `uiState` 是默认值 —— 这正是必须"先造非默认值再升级"的原因。

---

## 3. 回滚可行性评估（机制层，源码实证）

### 3.1 关键发现：安装器会**先自动卸载旧版本**

`templates/nsis/installSection.nsh:52-53`
```
!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT
```

`templates/nsis/include/installUtil.nsh:224`（核心一行）
```
ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
```

`installUtil.nsh:202-207`
```
${if} ${isDeleteAppData}
  StrCpy $0 "$0 --delete-app-data"
${else}
  # always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL is defined, user data will be not removed
  StrCpy $0 "$0 --updated"
${endif}
```

**含义**：
- 「覆盖安装」在 electron-builder 里 = **静默卸载旧版 + 安装新版**（不是逐字节覆盖写入）；
- 卸载时固定带 **`/KEEP_APP_DATA`** 与 **`--updated`** → **用户数据被显式保护**；
- 所以**升级**与**回滚**走的是同一套机制，只是载荷版本不同。

`installUtil.nsh:155-176`：因 `InstallLocation` 为空，安装器从 `UninstallString` 推导 `$installationDir` → 得到正确目录。✅

### 3.2 降级不会被拦截

全文检索 `app-builder-lib` 的 NSIS 模板：**无 `allowDowngrade` 选项、无 `DisplayVersion` 比较、无"已安装更新版本"提示**。`VERSION` 仅用于 `BrandingText`。
→ 装 0.1.0 覆盖 0.1.1 **不会被拒绝**。

### 3.3 静默安装**不会**自动启动应用

`installSection.nsh:105-109`（assisted installer 分支，本项目 `oneClick:false`）
```
# for assisted installer run only if silent, because assisted installer has run after finish option
${if} ${isForceRun}
${andIf} ${Silent}
  !insertmacro doStartApp
${endIf}
```
`NsisTarget.js:533` 显示 `force-run` 是一个**显式 CLI flag**。
→ **仅 `/S` 不会启动应用**；只有额外加 `--force-run` 才会。这与 PACK-04/PACK-11 的实测一致（安装后无进程，需另行启动）。

> 这一条很重要：否则安装完会用**默认 userData** 启动，直接写生产数据。

### 3.4 回滚命令与预期结果

**命令（方案 A 回滚）**
```bash
# 前置：确认无 KubeJS 进程（tasklist 为空，间隔 2 s 复核）
".cache/pack-13/installers/KubeJS Recipe Studio Setup 0.1.0.exe" /S
```

**参数与顺序**：只用 `/S`。**不加 `/D`**（默认目录即正式目录）；**不加 `--force-run`**（避免自启写数据）。
> NSIS 规则备忘：若将来必须用 `/D`，`/D` 必须是**最后一个参数**且路径不加引号。

**内部会做什么**：读注册表 → 从 `UninstallString` 定位 0.1.1 的卸载器 → `执行 /S /KEEP_APP_DATA /currentuser --updated _?=<安装目录>` → 卸载 0.1.1 → 安装 0.1.0 的 74 个文件 → 重建卸载注册表项与两个快捷方式。

**预期结果**

| 检查项 | 期望回到 |
| --- | --- |
| 退出码 | 0 |
| 安装目录 | 74 文件 / 3 目录 / **284,023,841** B |
| 主程序 SHA-256 | **`193E131D…66F28`** |
| `FileVersion` / `ProductVersion` | `0.1.0` / `0.1.0.0` |
| 注册表 `DisplayVersion` | `0.1.0` |
| 注册表键名 | 仍是 `ead40464-49f1-54a5-bf84-970a4324381b`（同一 appId） |
| 两个 `.lnk` | 存在，TargetPath 仍指向正式目录 |
| **userData 三项哈希** | **不变**（`BE4B8924…` / `F08A4E61…` / 90,535 文件） |

**验证方法**：按上表逐项复算；另与 §2 快照做全量比对。任一不符 → 停止并上报，**不做自动修补**。

### 3.5 0.1.0 安装包是否"足以"恢复当前正式安装

| 依据 | 结论 |
| --- | --- |
| 当前安装正是由该安装包所装（PACK-05 05:20 重装，安装后 exe SHA 与 `win-unpacked` 一致） | ✅ 载荷一致 |
| 安装器会重建 74 文件 + 卸载项 + 两个快捷方式（PACK-04 B1 实测） | ✅ 覆盖恢复面 |
| `app.asar`、`locales`、`resources` 均在包内 | ✅ 完整 |
| 兜底：安装目录已完整备份 | ✅ 双保险 |

**结论：足以恢复**。唯一无法由安装包恢复的是"用户对快捷方式做的额外自定义"（当前未发现，见 §7）。

---

## 4. 生产数据基线与只读要求

| 要求 | 落实方式 |
| --- | --- |
| 生产 userData 全程只读 | 本轮仅 `ls`/`sha256sum`/`cat uiState.json`；**无任何写入** |
| 后续测试用独立克隆 + `STUDIO_USER_DATA` | 克隆到 `.cache/pack-15/ud-clone`；启动时 `STUDIO_USER_DATA=<克隆>` |
| **每次启动的硬门禁** | 启动后第一件事取 `app:runtime.userData`，**必须严格等于克隆路径**，且 ≠ 生产/`-dev`；不符则**立即关闭**并中止 |
| 安装器侧 | 已证带 `--updated` + `/KEEP_APP_DATA`；PACK-11 亦实测安装前后 userData 零变化 |

---

## 5. 克隆完整性检查规划

| 维度 | 基准值 | 判据 |
| --- | --- | --- |
| 文件数 | **90,535** | 必须相等 |
| 目录数 | **34** | 必须相等 |
| **逻辑总字节** | **379,370,049** | 必须相等（`find -type f -printf '%s'` 求和） |
| 关键文件抽查 | `uiState.json` → `7D1733F3…`（**造非默认值后会变，届时以新基线为准**）｜`Preferences` → `BE4B8924…`｜哨兵 → `F08A4E61…`｜`studio-cache/<hash>/meta.json` | 必须相等 |

> ⚠️ **禁止用 `du` 作为一致性判据**：生产目录 `du -sm` = **489 MB**，而逻辑字节仅 **361.8 MiB**，差额来自 90,535 个文件的簇碎片。用 `du` 比会凭空多出约 127 MB 的"差异"，误判克隆失败。

---

## 6. uiState 四阶段验证（含**必须遵守的执行顺序**）

### 6.1 顺序约束（写死，不能颠倒）

> **阶段 ① 必须在升级之前完成**——因为一旦装成 0.1.1，就没有 0.1.0 可用来"造非默认值"了。

| 阶段 | 时机 | 动作 | 判据 |
| --- | --- | --- | --- |
| **① 造非默认值** | **升级前**（正式安装仍是 0.1.0） | 用 `STUDIO_USER_DATA=<克隆>` 启动 **0.1.0**，经 `ui:patch` 设 `theme="light"`、`sidebarWidth=380`，**优雅关闭** | 关闭后 `<克隆>/uiState.json` 含 `theme:"light"` 且 `sidebarWidth:380` |
| **② 记录基线** | 关闭后、安装前 | 记录 `uiState.json` 的 SHA-256 + **完整 JSON**；同时记录 `Preferences`/哨兵/`meta.json` 哈希 | JSON 内两值为 light/380 |
| **③ 安装后、首次启动前** | 0.1.1 装完、**任何启动之前** | 复算全部哈希（**不启动应用**） | 全部等于 ② → 证明安装器未改数据 |
| **④ 启动后验证** | 启动 0.1.1 | `ui:get` 返回 | **`theme==="light"` ∧ `sidebarWidth===380`** ∧ 窗口 bounds 与 ② 一致 → uiState 保留成立 |

### 6.2 两条口径纪律

- **启动后 `uiState.json` 的哈希变化不作为失败判据**（应用启动会重写该文件，PACK-11 已实测）。只有阶段 ③ 那一次哈希是有效判据；阶段 ④ 看 `ui:get` 的**语义**。
- 不得把"`meta.appVersion` 未更新"当失败：缓存命中时 `meta.json` 不重写；`cacheHit=true` 即可作为缓存保留且可用的证据。

---

## 7. 回滚风险与无法自动恢复项

### 7.1 风险

| # | 风险 | 等级 | 缓解 |
| --- | --- | --- | --- |
| **R1** | **回滚路径（高版→低版覆盖）从未实测**；仅由源码推断"无降级拦截" | **中** | 回滚后按 §3.4 全表核对；失败则用安装目录备份 + 手动补注册表/快捷方式（需另授权） |
| R2 | 静默卸载旧版失败时，`installUtil.nsh:218-221` 重试 5 次后 `MessageBox /SD IDCANCEL` → 静默下**取消并继续安装**，可能在 0.1.0 目录留下 0.1.1 残留文件 | 中 | 回滚后核对**文件数必须 74**；多于 74 即判异常并上报 |
| R3 | 安装目录被"卸载+重装"重建 → 文件 mtime 全变 | 低 | **以 SHA-256 与文件数为判据**，不看 mtime |
| R4 | 杀软/占用导致卸载器执行失败 | 低 | 安装前确认无进程；失败即停 |
| R5 | 升级后忘记回滚，导致正式安装长期停在 0.1.1 | 低 | 回滚是本方案的最后一步，纳入门禁 G5 |
| R6 | 某次启动漏传 `STUDIO_USER_DATA` → 写生产 userData | **中** | 门禁 G1：每次启动后必验 `app:runtime.userData` |

### 7.2 无法自动恢复的项目（如实列出）

| # | 项 | 说明 |
| --- | --- | --- |
| U1 | 快捷方式的**用户自定义**（固定到任务栏、开始菜单磁贴、手动改名/改图标） | 本次快照中**未发现**此类改动（两个 `.lnk` 均为安装器默认生成）；若后续出现，安装器只会重建默认快捷方式 |
| U2 | Windows 系统侧与 AUMID 绑定的状态（通知授权、任务栏固定项、`AppUserModelId` 关联的跳转列表） | 无法枚举、无法导出/回滚；升级/回滚后可能需用户重新授权通知 |
| U3 | 注册表中**卸载键以外**的任何写入 | 本次仅观察到卸载键；但若 0.1.1 在未来版引入其它键，本方案无回滚覆盖 |
| U4 | 文件系统层面的 NTFS 备用数据流（ADS）/ 硬链接属性 | 备份用 `cp -a` 不保证保留 ADS |
| U5 | 应用崩溃转储、Windows 错误报告（WER）历史 | 只增不减，不影响功能 |

> 以上 U1–U5 **均不影响应用可用性与数据完整性**，但按你的要求逐项声明。

---

## 8. 执行门禁（进入安装阶段必须逐条满足）

| # | 门禁 | 违反后果 |
| --- | --- | --- |
| **G1** | 每次启动应用后，**第一件事**取 `app:runtime.userData`，必须 == `.cache/pack-15/ud-clone` 且 ≠ 生产/`-dev` | 立即关闭并中止（防写生产数据） |
| **G2** | 安装/回滚前确认 `tasklist` 中无 `KubeJS Recipe Studio.exe`（间隔 2 s 复核两次） | 中止（否则卸载器/安装器行为不确定） |
| **G3** | 安装只用 `/S`，**不得**加 `--force-run`（防自启） | 中止 |
| **G4** | **必须先完成阶段 ①②（0.1.0 设 light/380 + 基线）**，才能安装 0.1.1 | 否则 uiState 验证作废 |
| **G5** | 验证结束**必须执行回滚**并完成 §3.4 全表核对 | 正式安装会滞留 0.1.1 |

---

## 9. 最终判定

| 你的停止条件 | 是否触发 |
| --- | --- |
| 回滚资源缺失 | ❌ 未触发（安装包已归档 + SHA 一致 + 目录已备份） |
| 安装目标不明确 | ❌ 未触发（默认目录唯一确定，`/D` 不用） |
| 生产数据可能被写入 | ❌ 未触发（`--updated`/`/KEEP_APP_DATA` + 不自启 + G1 门禁） |
| 快捷方式/注册表恢复方案不可靠 | ❌ 未触发（安装器重建，PACK-04 已实测） |

> ## **判定：✅ 允许进入覆盖安装**
>
> 附条件：必须遵守 §6.1 的顺序与 §8 的五条门禁；回滚路径属**未实测**，回滚后须按 §3.4 全表核对并如实报告。

---

## 10. 本轮未做（对照禁令）与产出

| 禁令 | 是否符合 |
| --- | --- |
| 不修改版本文件 | ✅ `package.json`/`package-lock.json` mtime 未变 |
| 不构建 | ✅ `dist` 无 0.1.1，无 `dist-011` |
| 不安装 / 不卸载 | ✅ 未运行任何安装器 |
| 不启动应用 | ✅ 无 `KubeJS Recipe Studio.exe` 进程 |
| 不扫描 | ✅ 未调用任何 IPC |
| 不修改 V8 台账 | ✅ MD5 仍 `3dc2bf53d040374d0bd05119dea3874d` |
| 生产 userData 只读 | ✅ 仅 `ls`/哈希/`cat` |

**本轮产出（均为新增，未删除任何历史证据）**

| 文件 | 说明 |
| --- | --- |
| `docs/PACK-15-A-PRECHECK-ROLLBACK-REPORT.md` | 本报告 |
| `.cache/pack-13/installers/KubeJS Recipe Studio Setup 0.1.0.exe` | **回滚资源**：0.1.0 安装包归档（82,360,469 B，SHA 已核） |
| `.cache/pack-15/backup-install-0.1.0/` | **回滚兜底**：正式安装目录完整备份（74 文件 / 284,023,841 B） |
| `.cache/pack-15/exe-version.txt`、`lnk-targets.txt` | 安装态快照原始记录（exe 版本资源 / 快捷方式目标；`WScript.Shell` 被安全策略拦截，`.lnk` 改用二进制解析） |
