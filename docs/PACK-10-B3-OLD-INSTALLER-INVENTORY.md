# PACK-10 · B3 旧版本安装包来源核查（只读）

日期：2026-11-01
用途：为 `REL-PKG-B3`（跨版本升级测试）寻找"上一版本安装包"
性质：**纯只读检索**。未运行任何安装程序，未修改/删除/移动/下载任何文件，未改代码/配置/台账。
主台账基准：V6（未修改）

---

## 1. 最终结论

> **未找到可用于 B3 的上一版本安装包。**

- 整个项目目录 + 隔离备份区（`E:/_trash_20261101_recipe-studio`）内，**只有 1 个安装包**：`KubeJS Recipe Studio Setup 0.1.0.exe`——即**当前版本**。
- 其余 `.exe` 全部是：未打包完成的 `win-unpacked` 裸主程序（3 个）、electron-builder 的签名/打包工具（17 个）、NSIS 的 `elevate.exe`（1 个），**均不构成"安装包"**。
- 历史两次失败的构建（`PACK-01`/`PACK-02`）**从未产出过任何安装包**（失败点都在 NSIS 之前，日志可证）。
- **B3 仍然无法执行**。按你的要求，不做推测、不生成替代文件。

---

## 2. 检索范围与方法

| 项 | 内容 |
| --- | --- |
| 检索根 | `E:\mc kjs`（项目根，递归，排除 `node_modules`）＋ `E:\_trash_20261101_recipe-studio`（本轮清理的隔离区，属"备份/历史证据"） |
| 检索条件 | 文件名后缀 `.exe`；另检索 `> 10 MB` 的 `.7z` / `.zip`（防止安装包被打包归档） |
| 采集字段 | 完整路径、文件名、大小、修改时间、SHA-256、`ProductName` / `ProductVersion` / `FileVersion` / `CompanyName` |
| 附加核对 | 产物内 `resources/app.asar` 的 `package.json` 版本；注册表卸载键中已安装条目；当前安装目录 exe 版本 |
| 只读保证 | 全部为读操作；未执行任何 exe；未解包、未复制、未删除 |

---

## 3. 全量 `.exe` 清单与分类（共 22 个）

### 3.1 与"安装包"相关的 4 个（已逐一验证）

| # | 文件 | 大小 | 修改时间 | SHA-256 | ProductName / ProductVersion / FileVersion | 分类 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `dist\KubeJS Recipe Studio Setup 0.1.0.exe` | 82,360,469 B（78.55 MB） | 2026-11-01 05:01:27 | `3C1BAD88A9E14AE5E109FD702D90A74971FB11056FA2125037F934AC5AA01ECC` | KubeJS Recipe Studio / **0.1.0** / 0.1.0 | **当前版本安装包**（唯一） |
| 2 | `dist\win-unpacked\KubeJS Recipe Studio.exe` | 188,831,744 B（180.08 MB） | 2026-11-01 05:01:08 | `193E131D0C39590BB4651414824F91538D4059A0A9FD63154F03398BE0466F28` | KubeJS Recipe Studio / **0.1.0.0** / 0.1.0 | **未打包完成的主程序**（非安装包） |
| 3 | `.cache\pack-01\dist-failed-20261101-0446\win-unpacked\KubeJS Recipe Studio.exe` | 188,784,128 B（180.04 MB） | 2026-11-01 04:46:01 | `B8B0269D50F0C220F709E7A2280B9D9088EC4B1958638BC65B2A0EB00E320CED` | **Electron / 33.4.11** / 33.4.11（CompanyName=GitHub, Inc.） | **PACK-01 失败现场**：rcedit 未执行，实为**裸 Electron 二进制**改名，既非安装包也非本项目版本 |
| 4 | `.cache\pack-02\dist-failed-20261101-0454\win-unpacked\KubeJS Recipe Studio.exe` | 188,784,128 B（180.04 MB） | 2026-11-01 04:53:46 | `B8B0269D50F0C220F709E7A2280B9D9088EC4B1958638BC65B2A0EB00E320CED` | **Electron / 33.4.11** / 33.4.11（CompanyName=GitHub, Inc.） | **PACK-02 失败现场**：与 #3 **哈希完全相同**，同一份裸 Electron |

> #3 与 #4 的 SHA-256 一致 → 是同一份未编辑的 Electron 主程序，只是分处两次失败构建的目录。

### 3.2 其余 18 个（与安装包无关，全部排除）

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| electron-builder 签名/打包工具 | 17 | `.cache\pack-01\7za-probe\` 下的 `signtool.exe`、`rcedit-x64/ia32.exe`、`makeappx.exe`、`makepri.exe`、`makecert.exe`、`makecat.exe`、`pvk2pfx.exe`、`openssl.exe`（均为 2018–2019 年的工具，来自 winCodeSign 归档） |
| NSIS 提权辅助 | 1 | `dist\win-unpacked\resources\elevate.exe`（2019 年，0.10 MB） |

### 3.3 归档类检索（防漏）

检索项目内 `> 10 MB` 的 `.7z` / `.zip`，仅命中 3 个**模组包资源**（`pc3-pack-construct` 的 `tconPartTexture1.zip`、两张光影包 zip），**无任何安装包归档**。

---

## 4. 版本证据链（三重核对）

| 核对点 | 证据 | 结果 |
| --- | --- | --- |
| 安装包自身版本资源 | `GetVersionInfo` on `Setup 0.1.0.exe` | `ProductVersion = 0.1.0`、`FileVersion = 0.1.0` |
| 产物内 `package.json` | 读 `dist\win-unpacked\resources\app.asar` 内 `package.json`（asar API 直接读，未解包到盘） | `name = kubejs-recipe-studio`、**`version = 0.1.0`** |
| 系统已安装条目 | HKCU/HKLM 卸载键 | 仅一条：`KubeJS Recipe Studio 0.1.0`，`DisplayVersion = 0.1.0` |
| 当前安装目录 exe | `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe` | `ProductVersion = 0.1.0.0`、`FileVersion = 0.1.0`、SHA-256 `193E131D…`（与 #2 同哈希） |

⇒ **本机存在过的本项目产物版本，只有 0.1.0 一个。**

---

## 5. 历史构建从未产出安装包（旁证）

| 构建 | 结果 | 失败点 | 是否产出安装包 |
| --- | --- | --- | --- |
| `PACK-01`（04:45–04:46） | 退出码 1 | `winCodeSign-2.6.0.7z` 解压失败（符号链接特权） | **否**（未到 NSIS 阶段） |
| `PACK-02`（04:53–04:54） | 退出码 1 | 下载 `winCodeSign` 时 HTTP 502 / EOF | **否**（未到 NSIS 阶段） |
| `PACK-03`（05:00–05:01） | **退出码 0** | — | **是，仅 0.1.0 一个** |

对应目录也印证：`pack-01/dist-failed-…` 与 `pack-02/dist-failed-…` 内只有 `win-unpacked/` 与 `builder-debug.yml`，**没有 `Setup*.exe`**。

---

## 6. 明确排除（按你要求第 6 条）

| 文件 | 为什么**不能**当作旧版安装包 |
| --- | --- |
| `dist\win-unpacked\KubeJS Recipe Studio.exe` | 是**未打包的目录形态**，不是安装包；且版本就是当前的 0.1.0 |
| `.cache\pack-01|02\…\win-unpacked\…exe` | 同上，且 `ProductName=Electron`，连品牌信息都没写入（rcedit 未执行），属**未完成构建产物** |
| `resources\app.asar` | 只是应用代码归档，**不是安装包**，也不能单独用于"升级" |
| `dist\KubeJS Recipe Studio Setup 0.1.0.exe` | 是**当前版本**，与待安装版本相同；同版本覆盖安装**不能**替代跨版本升级测试 |
| `signtool.exe` / `rcedit*.exe` / `elevate.exe` 等 | 第三方工具，与项目版本无关 |

---

## 7. 分类汇总（按你要求第 5 条）

| 分类 | 数量 | 文件 |
| --- | --- | --- |
| **真正的上一版本安装包** | **0** | 无 |
| 当前 0.1.0 安装包 | 1 | `dist\KubeJS Recipe Studio Setup 0.1.0.exe` |
| 同版本重复构建 / 归档 | 0 | 无（仅有一个安装包，无重复） |
| 无法确认版本的可疑文件 | 0 | 无（所有 exe 的版本都能读到） |
| 未完成构建的裸主程序（非安装包） | 3 | #2、#3、#4 |
| 第三方工具（非安装包） | 18 | §3.2 |

---

## 8. 建议（**未执行任何一项**，等你决定）

1. **推荐：构建 0.1.1 后再做 B3**。这会改动 `package.json` 的 `version`——属代码/配置改动，且需要重新打包，**必须你明确授权**，我不会自行做。
2. 或者：**由你提供一份真实的旧版安装包**（哪怕是很早的 0.0.x 构建），放到项目内任意位置，我再按同样方式核对版本与哈希，然后执行 B3。
3. 或者：**经你批准调整 B 类的验收方式**（例如把"升级"改为"同版本覆盖安装 + 数据保留"作为等效证据）——但这属于**改变验收范围**，按纪律我不能自行提议生效，只能登记为你的可选项。
4. 在 1/2/3 任一落实前，`REL-PKG` 的 B 类保持 **⚠️ 部分通过（升级未执行）**，`REL-PKG` 本体继续 **未验证**、硬性发布阻塞不变。

---

## 9. 本轮明确未做的事

- 未运行任何安装/卸载/升级/应用启动。
- 未下载任何外部安装包。
- 未修改、删除、移动、重命名任何文件（含 `dist`、`.cache`、隔离区、测试 UD）。
- 未修改代码、配置、测试、V6 台账。
- 未清理任何历史证据或测试目录。
- 未执行 B3，未生成任何替代安装包。

**证据文件**：`.cache/pack-10-probe.txt`（4 个候选的版本与哈希）、`.cache/pack-10-installed.txt`（已安装条目与安装目录 exe）。
