# PACK-02 · Windows 正式打包验证报告（方案 A：开发人员模式）

日期：2026-11-01
对应台账：`REL-PKG`（硬性发布阻塞）、`REL-ICON`（其前置）
主台账基准：V3（40 项条件，**本轮未修改**）
结论：**符号链接权限问题已解决并实证；打包仍失败（退出码 1 / 62 s），但失败原因已换成新的——下载 winCodeSign 时网络 502。按纪律立即停止，未尝试其他修复方案。**

---

## 1. 执行摘要

| 项 | 结果 |
| --- | --- |
| 命令 | `npm run dist:win` |
| 开始 / 结束 | 2026-11-01T04:53:19 → 04:54:21（+08:00） |
| 耗时 / **退出码** | **62 s / 1（失败）** |
| 权限问题（上一轮根因） | ✅ **已解决**（7za 实测通过） |
| 本轮失败点 | ❌ **下载 `winCodeSign-2.6.0.7z` 时 HTTP 502 / EOF**，与权限无关 |
| 安装包 | **未生成** |
| `dist/win-unpacked` | 重新生成，但 exe 版本资源仍是 `Electron` → **图标未嵌入** |
| icon / warn 关键字 | 日志中 **0 次**（仍是假阴性，见 §6） |
| REL-ICON / REL-PKG | **均未关闭** |

---

## 2. 开发人员模式：开启前后的检测结果

| 时点 | 检测项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 04:46（PACK-01 失败时） | `AllowDevelopmentWithoutDevLicense` | **键不存在 = 未开启** | `.cache/pack-01/env-probe.txt` |
| 04:52（本轮开启前检测） | 同上 | **= 1 = 已开启** | `.cache/pack-01/devmode-before.txt` |
| 04:52 | 当前用户 `CIALLO\qituo` 是否在管理员组 | **是**（但进程未提权） | 同上 |
| 04:52 | 进程已提权 | **False**（UAC 过滤令牌） | 同上 |

> 说明：PACK-01 失败时开发人员模式的注册表键**确实不存在**，与"需要开启"的判断一致；该键在你的操作后变为 1。

---

## 3. 符号链接权限验证（三层，互相印证）

你要求"不能仅凭开关显示开启就认定问题解决"，因此做了三层功能验证：

| 层级 | 方法 | 结果 | 判定 |
| --- | --- | --- | --- |
| 令牌检查 | `whoami /priv` | 仅有 5 项特权，**不含 `SeCreateSymbolicLinkPrivilege`** | 不能单看令牌（见下） |
| API 级 | PowerShell `New-Item -ItemType SymbolicLink` | **失败**："此操作需要管理员权限" | ⚠️ **假阴性** |
| API 级（第二路径） | Node `fs.symlinkSync(target, link, 'file')` | **成功**；`lstat.isSymbolicLink=true`、`readlink` 正确、解引用读到内容 | 真实符号链接 |
| **工具级（决定性）** | 用**与打包完全相同**的 7za 与参数解压同一归档：`7za.exe x -snld -bd <winCodeSign.7z> -o<temp>` | **退出码 0**，无任何 error | ✅ **权限已满足** |

**工具级验证的产物**（`.cache/pack-01/7za-probe/`）：

```
libcrypto.dylib   isSymbolicLink=true   -> libcrypto.1.0.0.dylib
libssl.dylib      isSymbolicLink=true   -> libssl.1.0.0.dylib
rcedit-x64.exe    存在，1,326,080 B
windows-10/ windows-6/ linux/ darwin/ appxAssets/ openssl-ia32/  均已解出
```

> **两个曾在 PACK-01 失败的链接，本次真实创建成功。** 这直接证明 PACK-01 的 `exit status 2` 根因（符号链接特权）已被方案 A 消除。
>
> 顺带纠正一个容易误判的点：**PowerShell 的失败不能当判据**。PS 5.1 的 `New-Item -ItemType SymbolicLink` 有独立的提权检查，即使系统已允许创建也会报"需要管理员权限"。真正可靠的判据是**用打包实际调用的那个工具跑一次**。

---

## 4. 本轮打包执行与失败原因

### 4.1 时间线与阶段

| # | 阶段 | 结果 |
| --- | --- | --- |
| 1 | typecheck（node + web） | ✅ |
| 2–4 | electron-vite build（main/preload/renderer） | ✅ |
| 5 | 加载 `electron-builder.yml` | ✅ |
| 6 | 原生依赖 rebuild | ✅ |
| 7 | 打包到 `dist\win-unpacked` | ✅ |
| 8 | **rcedit 编辑 exe 资源 → 需要 winCodeSign → 下载失败** | ❌ |
| 9 | NSIS 安装包 | ⛔ 未执行 |

### 4.2 失败原文（4 次尝试全部失败）

```
⨯ Get "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z": EOF
⨯ Get "... winCodeSign-2.6.0.7z": EOF
⨯ Get "... winCodeSign-2.6.0.7z": Bad Gateway
⨯ Get "... winCodeSign-2.6.0.7z": Bad Gateway
  • Above command failed, retrying 3 more times
⨯ ...\app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE (Exit code: 1)
    at WinPackager.signApp
```

调用链（来自 app-builder 的 Go 栈）：`rcedit.editResources` → `download.DownloadWinCodeSign` → `downloadFromGithub` → HTTP 失败。

**关键点：这次连压缩包都没下载下来**，缓存目录里没有新增 `.7z`，因此**本轮根本没有走到解压步骤**——失败与符号链接无关。

### 4.3 为什么这次卡在网络

- `github.com/.../releases/download/...` 在本机代理下**间歇性**返回 `502 Bad Gateway` / `EOF`；
- PACK-01 同一 URL 曾在 **1.8 s** 内下载成功（5.6 MB），说明是**间歇性**而非永久阻断；
- 本轮 4 次尝试全部落在故障窗口内。

> 按你的纪律"不进行无依据的重复重试"，**没有重跑**，也没有改任何配置或环境变量。

---

## 5. 产物与安装包情况

```
dist/
├── builder-debug.yml            1,076 B
└── win-unpacked/
    ├── KubeJS Recipe Studio.exe 188,478,128 B
    └── ...
dist 根目录下 .exe 安装包：无
```

**EXE 产品信息（未达预期）**

| 字段 | 实际值 | 期望值 |
| --- | --- | --- |
| ProductName | **Electron** | KubeJS Recipe Studio |
| CompanyName | **GitHub, Inc.** | 项目配置值 |
| FileVersion | **33.4.11** | 0.1.0 |
| FileDescription | **Electron** | … |

→ **rcedit 未执行成功，图标与产品信息均未写入**。`dist/win-unpacked` 仍是未完成产物，**不可分发、不能作为任何验收证据**。

---

## 6. 图标告警检查（结论：本次无可采信证据）

| 检查 | 结果 |
| --- | --- |
| 日志 `icon` 出现次数 | **0** |
| 日志 `warn` 出现次数 | **0** |
| 判定 | **假阴性**。rcedit 阶段未完成，图标从未被读取或嵌入。**不能**据此关闭 REL-ICON |

---

## 7. 与 PACK-01 的对比

| 项 | PACK-01（04:46） | PACK-02（04:54） |
| --- | --- | --- |
| 开发人员模式 | 未开启 | **已开启** |
| 失败阶段 | winCodeSign **解压**（exit status 2，符号链接特权） | winCodeSign **下载**（HTTP 502/EOF） |
| 是否走到解压 | 是，失败 2 个 macOS 符号链接 | **否**，文件未下载成功 |
| 权限问题 | 存在 | **已消除**（7za 探针 exit 0） |
| 退出码 / 耗时 | 1 / 49 s | 1 / 62 s |
| 安装包 | 无 | 无 |
| exe ProductName | Electron | Electron（未变） |

> 也就是说：**方案 A 确实解决了它该解决的问题**，但打包被下一个独立的、环境性的障碍（网络）挡住了。

---

## 8. 现场保留

| 位置 | 内容 |
| --- | --- |
| `.cache/pack-01/dist-win.log` | PACK-01 完整日志（196 行） |
| `.cache/pack-01/env-probe.txt` / `devmode-before.txt` / `exe-version.txt` / `whoami-priv.txt` | 权限与环境取证 |
| `.cache/pack-01/dist-failed-20261101-0446/` | **PACK-01 的旧 dist 目录整体保留**（未删除、未覆盖，仅为让本轮构建写入新 `dist/` 而重命名归档） |
| `.cache/pack-01/7za-probe/` + `7za-probe.log` | 决定性的解压验证产物与日志 |
| `.cache/pack-02/dist-win.log` | PACK-02 完整日志（224 行） |
| `.cache/pack-02/pack02-probe.txt` | 本轮 exe 版本资源 + 关键字统计 |
| `dist/`（当前） | PACK-02 的未完成产物，原样保留 |

> `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` 下累计 5 个空目录与 4 份 `.7z`（22.5 MB），未清理。

---

## 9. 未完成事项

| # | 事项 | 阻塞原因 |
| --- | --- | --- |
| 1 | 生成 NSIS 安装包 | winCodeSign 下载失败 |
| 2 | REL-ICON 关闭 | 需要 rcedit 成功 + 图标实际嵌入 + 无 icon 告警 |
| 3 | REL-PKG A 类 | 同上 |
| 4 | REL-PKG B/C/D 类（安装链路 / 目录隔离 / asar worker 冒烟） | 依赖安装包 |
| 5 | REL-VERIFY-DUAL / REL-VERIFY-4K | 依赖安装版 |

---

## 10. 下一步选项（**本轮未执行，需你决定**）

| 选项 | 内容 | 触发的改动 |
| --- | --- | --- |
| **D** | 设置环境变量 `ELECTRON_BUILDER_BINARIES_MIRROR=https://hk.gh-proxy.com/https://github.com/electron-userland/electron-builder-binaries/releases/download/` 后重跑 | 仅本次进程环境变量，不改任何文件 |
| **E** | 把 `7za-probe/` 已完整解出的内容放到 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`，让 electron-builder 跳过下载 | 写本机缓存（属原方案 C 的变体，**你此前明确禁止切换 C，故不采用**） |
| **F** | 等待网络恢复后原样重跑 | 无改动；但属"无依据重试"，需你明确授权 |

> 三个选项都**不改** `electron-builder.yml`、`package.json`、源码或依赖版本。

---

## 11. 台账状态

| 条件 | V3 关闭条件 | 当前证据 | 判断 |
| --- | --- | --- | --- |
| **REL-ICON** | 多尺寸 ICO + 打包无告警 | ICO 结构已过（ICON-01）；rcedit 未执行，图标未嵌入；无告警属假阴性 | **未关闭** |
| **REL-PKG** | A/B/C/D 四类验收 | A 类两轮均失败；B/C/D 未开始 | **未关闭** |

主台账 V3 **未做任何修改**。

---

## 12. 一句话结论

**权限那关已经过了，卡在网络上。** 方案 A 有效（7za 用打包同款命令解压同一归档，退出码从 2 变 0，两个 macOS 符号链接真实建成），但本轮 4 次下载 winCodeSign 全部 502/EOF，rcedit 因此没跑起来，安装包没生成、图标没嵌入。**项目仍不具备正式发布条件**，REL-ICON 与 REL-PKG 均保持未关闭，等你选 D 或 F（E 属方案 C 变体，已排除）。
