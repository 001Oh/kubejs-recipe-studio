# PACK-01 · Windows 正式打包验证报告

日期：2026-11-01
对应台账：`REL-PKG`（硬性发布阻塞）、`REL-ICON`（其前置）
主台账基准：`PROJECT-SEALING-LEDGER-REPORT.md` **V3**（40 项条件，未改动）
结论：**打包失败（退出码 1）**，未生成安装包。按执行纪律**已停止后续全部测试**，现场与日志完整保留。

---

## 1. 执行摘要

| 项 | 结果 |
| --- | --- |
| 命令 | `npm run dist:win` |
| 开始 | 2026-11-01T04:45:26+08:00 |
| 结束 | 2026-11-01T04:46:16+08:00 |
| 耗时 | **49 s** |
| **退出码** | **1（失败）** |
| 失败阶段 | `electron-builder` 签名准备阶段（`winCodeSign-2.6.0.7z` 解压） |
| 安装包 | **未生成**（`dist/` 下无 `.exe` 安装包） |
| 中间产物 | `dist/win-unpacked/`（不完整，**不可分发**） |
| 图标 warning/error | 日志中**无** `icon` 相关关键字（因未走到该环节，**不能**据此判定图标合格） |
| REL-ICON | **未关闭** |
| REL-PKG | **未关闭** |

---

## 2. 执行环境

| 项 | 值 |
| --- | --- |
| 系统 | Windows 10.0.26100（win32 x64） |
| Node / npm | v22.14.0 / 10.9.2（可移植版，`E:\开发工具\node-v22.14.0-win-x64`） |
| Electron | 33.4.11 |
| electron-builder | 25.1.8 |
| 当前用户 | `CIALLO\qituo` |
| **是否管理员** | **False** |
| **开发者模式** | **未启用**（`HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense` 键不存在） |
| 日志 | `.cache/pack-01/dist-win.log`（196 行，含起止时间与退出码） |

---

## 3. 分阶段结果

| # | 阶段 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck`（node + web） | ✅ 通过 | 两遍 `tsc --noEmit` 无输出、无错误 |
| 2 | `electron-vite build` main | ✅ 通过 | 119 modules，`out/main/index.js` 284.04 kB，3.13s |
| 3 | `electron-vite build` preload | ✅ 通过 | 3 modules，`out/preload/index.js` 0.76 kB |
| 4 | `electron-vite build` renderer | ✅ 通过 | 170 modules，`index-*.js` 643.56 kB，2.50s |
| 5 | 加载配置 | ✅ | `file=E:\mc kjs\electron-builder.yml` |
| 6 | `@electron/rebuild` 原生依赖 | ✅ | `completed installing native dependencies` |
| 7 | 下载 Electron 运行时 | ✅ | `electron-v33.4.11-win32-x64.zip` 115 MB，**5.3 s** |
| 8 | 打包到 `dist\win-unpacked` | ✅ | `packaging platform=win32 arch=x64 appOutDir=dist\win-unpacked` |
| 9 | asar 打包 | ✅ | `resources\app.asar` 2.55 MB |
| 10 | **下载并解压 `winCodeSign-2.6.0.7z`** | ❌ **失败** | `⨯ cannot execute cause=exit status 2`，重试 4 次全部失败 |
| 11 | 生成 NSIS 安装包 | ⛔ 未执行 | 上一步失败后中止 |

> 结论：**项目自身的构建与打包逻辑没有问题**（1–9 步全绿）；失败发生在 electron-builder 准备签名工具链的环境环节。

---

## 4. 失败根因（含原始证据）

### 4.1 直接原因

`winCodeSign-2.6.0.7z` 内含 **2 个 macOS 符号链接**，在无符号链接特权时 7-Zip 无法创建，导致整包解压以 `exit status 2` 结束：

```
7-Zip (a) 21.07 (x64) ...
Extracting archive: C:\Users\qituo\AppData\Local\electron-builder\Cache\winCodeSign\887288519.7z
Sub items Errors: 2
Archives with Errors: 1

errorOut=ERROR: Cannot create symbolic link : 客户端没有所需的特权 :
  ...\winCodeSign\887288519\darwin\10.12\lib\libcrypto.dylib
ERROR: Cannot create symbolic link : 客户端没有所需的特权 :
  ...\winCodeSign\887288519\darwin\10.12\lib\libssl.dylib

command='E:\mc kjs\node_modules\7zip-bin\win\x64\7za.exe' x -snld -bd '...' '-o...'
• Above command failed, retrying 3 more times
```

### 4.2 为什么失败

Windows 上创建符号链接需要 `SeCreateSymbolicLinkPrivilege`：

- 该权限默认只给**管理员**；
- 非管理员只有在**启用开发者模式**后才拥有。

本机两项都不满足（§2：非管理员 + 开发者模式未启用），所以这 2 个条目必然失败。

**注意：失败的 2 个文件是 macOS 的动态库（`darwin/10.12/lib/*.dylib`），Windows 打包根本用不到它们**——但 7-Zip 对"任一子项失败"整体返回 2，electron-builder 把它当作致命错误。

### 4.3 重试行为

electron-builder 对每个失败尝试都会**重新下载**（日志出现 4 组 `downloading` / `downloaded`，各 5.6 MB），共尝试 4 次后放弃。缓存目录因此留下 4 份重复归档：

| 路径 | 大小 |
| --- | --- |
| `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\{125813263,221213719,377494331,887288519}.7z` | 各 5,635,384 B（合计 22.5 MB，可安全清理） |

### 4.4 为什么不能"关掉签名/资源编辑"绕过

在 Windows 上，exe 的图标与版本资源由 `app-builder` 的 `rcedit` 子命令写入（`app-builder-lib/out/winPackager.js:180`）；`winCodeSign` 主要提供 `signtool`（`:184` 的 `getSignVendorPath()` 分支供非 win32 平台使用）。

若把 `signAndEditExecutable` 设为 `false` 来跳过该环节，**rcedit 也会被跳过** → 图标、产品名、版本号都不会写入 exe → `REL-ICON` 永远无法关闭。**因此这不是可接受的方案**，本轮未采用。

---

## 5. 产物现状（保留现场，不作任何处理）

```
dist/
├── builder-debug.yml            1,076 B
└── win-unpacked/
    ├── KubeJS Recipe Studio.exe 188,478,128 B   ← 文件名已改，但版本资源仍是 Electron
    ├── resources/app.asar       2.55 MB
    ├── locales/ …
    └── *.dll / *.pak / *.dat
```

**关键证据：exe 的版本资源未被编辑**

| 字段 | 实际值 | 期望值（若 rcedit 成功） |
| --- | --- | --- |
| ProductName | **Electron** | KubeJS Recipe Studio |
| FileDescription | **Electron** | … |
| CompanyName | **GitHub, Inc.** | … |
| FileVersion | **33.4.11** | 0.1.0 |

→ **图标未嵌入、产品名未写入**。该 `win-unpacked` 属**未完成产物，不得分发、不得作为验收证据**。

---

## 6. 图标告警检查

| 检查 | 结果 |
| --- | --- |
| 日志中 `icon` 关键字 | **0 处** |
| 日志中 `warn` 关键字 | **0 处** |
| 解读 | 未出现"找不到图标/图标格式不支持"之类告警，但也**没有走到使用图标的环节**（§5 已证明资源编辑未执行）。因此**不能**据此判定 `build/icon.ico` 可用于打包 |

---

## 7. 三条修复路径（本轮未执行，需你选择）

| 方案 | 操作 | 需要 | 优劣 |
| --- | --- | --- | --- |
| **A. 启用开发者模式**（推荐） | 设置 → 隐私和安全性 → 开发者选项 → 打开"开发人员模式" | **管理员**（写 HKLM） | 一劳永逸，之后非管理员也能打包；不影响任何项目文件 |
| **B. 提权跑一次打包** | 以管理员身份打开终端 → `npm run dist:win` | **管理员**（UAC 弹窗） | 只需一次；缓存写入后，后续普通权限也能复跑 |
| **C. 手工预热缓存**（无需管理员） | 用 7za 解压该 7z 并**排除 `darwin` 子树**（Windows 用不到 macOS 库），落到 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`；electron-builder 检测到目录已存在即跳过下载与解压 | 无 | 不改项目文件、不动系统设置；属"绕过环境问题"，需在报告中留痕。风险：若 electron-builder 校验缓存完整性，可能仍视作无效 |

> 共同前提：`electron-builder.yml` **不做任何修改**（按你的要求 2）。

---

## 8. 台账状态判断

| 条件 | V3 关闭条件 | 当前证据 | 判断 |
| --- | --- | --- | --- |
| **REL-ICON** | 多尺寸 ICO + **打包无告警** | ICO 已通过结构校验（ICON-01）；打包未完成，且 exe 图标未嵌入（§5） | **保持未关闭**。注意：本次"无 icon 告警"是**假阴性**——根本没走到该环节，不能作为关闭证据 |
| **REL-PKG** | A 打包 / B 安装链路 / C 目录隔离 / D asar worker 冒烟，四类缺一不可 | A 失败（本次）；B/C/D 未开始 | **保持未关闭**，A 类明确未通过 |

> 未修改主台账任何内容。`dist/win-unpacked` 的存在**不构成**任何一类验收的通过证据。

---

## 9. 未完成事项

| # | 事项 | 原因 |
| --- | --- | --- |
| 1 | 生成 NSIS 安装包 | 打包在签名工具准备阶段中止 |
| 2 | REL-ICON 关闭 | 缺"打包成功且图标已嵌入"的证据 |
| 3 | REL-PKG A 类（打包） | 同上 |
| 4 | REL-PKG B 类（安装/启动/升级/卸载） | 依赖安装包 |
| 5 | REL-PKG C 类（打包后目录隔离，= REL-VERIFY-PKGDIR） | 依赖可运行的安装版 |
| 6 | REL-PKG D 类（asar + worker 冒烟，含审计 C3） | 依赖可运行的安装版 |
| 7 | REL-VERIFY-DUAL / REL-VERIFY-4K | 依赖安装版 |

---

## 10. 现场保留清单

| 文件 | 说明 |
| --- | --- |
| `.cache/pack-01/dist-win.log` | 完整控制台输出（196 行），含命令、起止时间、退出码、耗时 |
| `.cache/pack-01/env-probe.txt` | 用户身份、管理员状态、开发者模式、winCodeSign 缓存、win-unpacked 列表 |
| `.cache/pack-01/exe-version.txt` | 打包 exe 的版本资源（证明 rcedit 未执行） |
| `dist/` | 未完成产物，原样保留，**未删除、未改动** |
| `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\*.7z`（4 份） | 失败重试留下的归档，未清理 |

---

## 11. 一句话结论

**项目代码与构建链路是好的（1–9 步全绿），卡在 electron-builder 需要的 `winCodeSign` 归档里两个 macOS 符号链接上——这是 Windows 非管理员 + 未开开发者模式的权限问题，不是项目缺陷。** 修好权限后重跑一次即可继续，但**在此之前，REL-ICON 与 REL-PKG 均保持未关闭**，项目也**不具备正式发布条件**。
