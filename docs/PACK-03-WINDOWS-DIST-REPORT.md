# PACK-03 · Windows 正式打包验证报告（方案 D：代理镜像）

日期：2026-11-01
对应台账：`REL-PKG`（硬性发布阻塞）、`REL-ICON`（其前置）
主台账基准：V3（40 项条件，**本轮未修改**）
结论：**打包成功（退出码 0 / 49 s），安装包已生成，图标经字节级验证确认真实嵌入。** 按你的要求，报告先行，未启动任何后续测试，台账未改。

---

## 1. 执行摘要

| 项 | 结果 |
| --- | --- |
| 方案 | D：经 `hk.gh-proxy.com` 镜像下载 electron-builder 二进制 |
| 命令 | `npm run dist:win`（附带进程级环境变量） |
| 起止 | 2026-11-01T05:00:41 → 05:01:30（+08:00） |
| 耗时 / **退出码** | **49 s / 0（成功）** |
| winCodeSign | ✅ 下载 2.207 s + **解压成功**（`winCodeSign-2.6.0/` 含 `rcedit-x64.exe`） |
| rcedit | ✅ **实际执行**（ProductName 由 `Electron` 变为 `KubeJS Recipe Studio`） |
| NSIS | ✅ 3.0.4.1 + nsis-resources 3.4.1 均经镜像下载，完整执行 |
| **安装包** | ✅ `dist/KubeJS Recipe Studio Setup 0.1.0.exe`，**82,360,469 B（78.55 MB）** |
| 图标 | ✅ **8/8 尺寸字节级命中**（主程序与安装包各 8/8） |
| icon warning/error | **0 处**（且已用字节验证兜底，不依赖"无警告"） |
| REL-ICON | 证据已满足关闭条件；**台账未改**，待你确认 |
| REL-PKG | A 类（打包）✅ 通过；B/C/D 未开始，**整体未关闭** |

---

## 2. 代理使用方式

| 项 | 内容 |
| --- | --- |
| 代理 | 瓦特工具箱（本机既有代理环境） |
| 镜像前缀 | `https://hk.gh-proxy.com/https://github.com/electron-userland/electron-builder-binaries/releases/download/` |
| 变量 | `ELECTRON_BUILDER_BINARIES_MIRROR` |
| 作用范围 | **仅本次打包进程**（bash 内 `export`，随进程退出失效） |
| 永久环境变量 | **未写入**：`User` 级 `未设置 ✔`、`Machine` 级 `未设置 ✔`（`.cache/pack-03/env-check.txt`） |
| 项目文件 | 未改 `electron-builder.yml` / `package.json` / 源码 / 依赖版本 |

日志中三条下载全部走镜像：

```
winCodeSign-2.6.0.7z        size=5.6 MB   duration=2.207s
nsis-3.0.4.1.7z            size=1.3 MB   duration=2.409s
nsis-resources-3.4.1.7z    size=731 kB   duration=2.326s
```

---

## 3. 下载验证（打包之前的独立探测）

### 3.1 HTTP 与文件

| 项 | 值 |
| --- | --- |
| URL | `https://hk.gh-proxy.com/https://github.com/.../winCodeSign-2.6.0/winCodeSign-2.6.0.7z` |
| **HTTP 状态码** | **200** |
| Content-Type | `application/octet-stream` |
| **实际大小** | **5,635,384 B** |
| 耗时 / 速率 | 2.197 s / 2,565,061 B/s |
| **SHA-256** | **`cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4`** |

### 3.2 完整性

| 检查 | 结果 |
| --- | --- |
| 文件格式 | 7z（`7za t` 正常识别，LZMA2 + BCJ2） |
| `7za t` 完整性测试 | **Everything is Ok**；13 个目录 / 83 个文件 / 解压后 24,762,883 B |
| 与官方域名下载物比对 | **与 PACK-01 从 `github.com` 直连下载的 4 份文件 SHA-256 完全一致**（四处均为 `cdaec715…73a4`） |
| 与官方 API 尺寸比对 | GitHub API 报告 asset `size = 5,635,384`，与下载文件一致 |

### 3.3 官方哈希是否可获得 —— **不可获得，必须记录这项限制**

- 查询 `api.github.com/repos/electron-userland/electron-builder-binaries/releases/tags/winCodeSign-2.6.0`（HTTP 200，tag 正确）：
  - asset 名 `winCodeSign-2.6.0.7z`、`size = 5635384`、**`digest` 字段不存在**。
- 该 release 未附带 checksums 文件，electron-builder 侧也未内置该校验值。

**因此：本报告不宣称"已与官方哈希比对通过"。**

可信度说明（不夸大）：

- 采用的替代证据是 **"与官方域名（`github.com`）直连下载物逐字节同哈希"** —— 这比"和第三方页面写的哈希比"更强，因为对照物本身就来自官方域名；
- 但它**仍是间接证据**：若官方域名下载物本身被动过，本方法无法发现；
- 由于本流程无代码签名证书（见 §4），产物也没有第二重密码学背书。

---

## 4. 打包执行与结果

### 4.1 关键日志

```
• downloading  url=https://hk.gh-proxy.com/.../winCodeSign-2.6.0/winCodeSign-2.6.0.7z size=5.6 MB
• downloaded   ... duration=2.207s
• signing with signtool.exe  path=dist\win-unpacked\KubeJS Recipe Studio.exe
• no signing info identified, signing is skipped  signHook=false cscInfo=null
• building     target=nsis file=dist\KubeJS Recipe Studio Setup 0.1.0.exe archs=x64 oneClick=false perMachine=false
• downloading  .../nsis-3.0.4.1/nsis-3.0.4.1.7z size=1.3 MB  → duration=2.409s
• downloading  .../nsis-resources-3.4.1/nsis-resources-3.4.1.7z size=731 kB → duration=2.326s
• building block map  blockMapFile=dist\KubeJS Recipe Studio Setup 0.1.0.exe.blockmap
```

> `no signing info identified, signing is skipped` 属**预期**：项目未配置代码签名证书。这不是失败，但意味着安装包**未签名**（详见 §7 风险）。

### 4.2 产物

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `dist/KubeJS Recipe Studio Setup 0.1.0.exe` | **82,360,469 B / 78.55 MB** | NSIS 安装包（oneClick=false，可选安装目录） |
| `dist/KubeJS Recipe Studio Setup 0.1.0.exe.blockmap` | 86,289 B | 增量更新用 |
| `dist/builder-debug.yml` | 7,405 B | 构建调试信息 |
| `dist/win-unpacked/` | — | 免安装形态 |

---

## 5. EXE 产品信息验收

| 字段 | 主程序 | 安装包 | 项目配置（`package.json`） | 判定 |
| --- | --- | --- | --- | --- |
| ProductName | **KubeJS Recipe Studio** | **KubeJS Recipe Studio** | `productName`（builder） | ✅ |
| CompanyName | **KubeJS Recipe Studio** | **KubeJS Recipe Studio** | `author: "KubeJS Recipe Studio"` | ✅ 一致 |
| FileVersion | **0.1.0** | **0.1.0** | `version: 0.1.0` | ✅ 一致 |
| ProductVersion | 0.1.0.0 | 0.1.0 | — | ✅ |
| FileDescription | KubeJS Recipe Studio — 为 Minecraft 整合包可视化编写 KubeJS 配方的桌面应用 | 同左 | `description` 逐字一致 | ✅ |
| LegalCopyright | Copyright © 2026 KubeJS Recipe Studio | 同左 | 由 author + 年份生成 | ✅ |

**rcedit 是否实际执行**：✅ 是。PACK-02 时该字段为 `ProductName = Electron / CompanyName = GitHub, Inc.`，本次全部变为项目值——这是 rcedit 真实生效的直接证据。

---

## 6. 图标验收（字节级，不依赖"无警告"）

方法：`build/icon.ico` 的每个条目（DIB / PNG）在 PE 中作为 `RT_ICON` 资源**原样存储**，故其字节序列应能在 exe 中检出。用脚本 `.cache/pack-03/verify-icon-embed.mjs` 逐条目检索：

| 尺寸 | 主程序 `KubeJS Recipe Studio.exe` | 安装包 `Setup 0.1.0.exe` |
| --- | --- | --- |
| 16×16 | ✓ @0xb30c0a8 | ✓ @0x1d340 |
| 20×20 | ✓ @0xb30c510 | ✓ @0x1cc88 |
| 24×24 | ✓ @0xb30cbc8 | ✓ @0x1c300 |
| 32×32 | ✓ @0xb30d550 | ✓ @0x1b258 |
| 48×48 | ✓ @0xb30e5f8 | ✓ @0x18cb0 |
| 64×64 | ✓ @0xb310ba0 | ✓ @0x11430 |
| 128×128 | ✓ @0xb314dc8 | ✓ @0x15658 |
| 256×256 | ✓ @0xb31841c | ✓ @0x8f18 |
| **命中率** | **8 / 8** | **8 / 8** |

**结论**：图标**真实嵌入**了主程序与安装包，且是完整 8 个尺寸（不是仅一个 32px 缩略图）。这比"日志里没有 icon 警告"强得多——后者在 PACK-02 曾被证明是假阴性。

**icon warning/error**：PACK-03 日志中 `icon` / `warn` / `error` / `symbolic` 关键字 **均 0 次**。

---

## 7. 遗留风险（已发现，未处理）

| # | 风险 | 说明 |
| --- | --- | --- |
| 1 | **安装包未签名** | 无代码签名证书，`signing is skipped`。Windows SmartScreen 会对未签名安装包提示"未知发布者"，企业分发场景可能被拦截。属 `REL-PKG` 之外的独立问题，本轮不处理 |
| 2 | 官方哈希不可得 | §3.3 所述，完整性只能间接保证 |
| 3 | 未做安装/启动/升级/卸载 | 属 `REL-PKG` B 类，按你的要求本轮不启动 |

---

## 8. 现场与产物清单

| 位置 | 内容 |
| --- | --- |
| `.cache/pack-03/dist-win.log` | 完整日志（含命令、环境变量、起止时间、退出码） |
| `.cache/pack-03/winCodeSign-2.6.0.7z` | 代理下载的归档（5,635,384 B，SHA-256 见 §3.1） |
| `.cache/pack-03/download-probe.txt` | curl 的 HTTP 状态码/大小/耗时 |
| `.cache/pack-03/gh-release.json` | GitHub API 原始响应（证明无 digest 字段） |
| `.cache/pack-03/exe-version.txt` | 两个 exe 的产品信息 |
| `.cache/pack-03/icon-embed.txt` | 图标字节命中记录 |
| `.cache/pack-03/env-check.txt` | 环境变量未持久化的证据 |
| `.cache/pack-01/`、`.cache/pack-02/` | PACK-01/02 的日志与取证，**完整保留** |
| `.cache/pack-01/dist-failed-20261101-0446/`、`.cache/pack-02/dist-failed-20261101-0454/` | 两次失败 dist 现场，**原样保留未删** |
| `dist/` | 本次成功产物 |

---

## 9. 台账状态判断（**本轮不改台账**）

### REL-ICON

台账 V3 的关闭条件是"多尺寸 ICO + 打包无告警"。逐条核对：

| 关闭条件 | 证据 | 满足 |
| --- | --- | --- |
| 多尺寸 ICO | `build/icon.ico` 8 尺寸，独立解析器校验通过（ICON-01） | ✅ |
| 打包无告警 | PACK-03 日志中 icon/warn/error 均 0 次 | ✅ |
| （加强证据）图标真实嵌入 | 主程序与安装包各 8/8 字节级命中（§6） | ✅ |

**判断：证据已完整满足 REL-ICON 的关闭条件，建议关闭。** 但按你的指令"主台账 V3 暂不修改，不提前关闭任何验收条件"，本轮**未修改台账**，请你确认后再执行关闭。

### REL-PKG

| 类别 | 状态 | 证据 |
| --- | --- | --- |
| A. Windows 打包 | ✅ **通过** | 退出码 0；安装包 82,360,469 B；rcedit/NSIS 均执行 |
| B. 安装流程 | ⬜ 未开始 | 按你的指令不启动 |
| C. 打包后目录隔离（= REL-VERIFY-PKGDIR） | ⬜ 未开始 | 需安装版运行 |
| D. asar + worker 冒烟（含审计 C3） | ⬜ 未开始 | 需安装版运行 |

**判断：`REL-PKG` 整体仍未关闭**——四类验收缺 B/C/D。A 类通过**不构成** REL-PKG 关闭，也不构成"可发布"。

---

## 10. 未完成事项

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | 安装 / 启动 / 升级 / 卸载验证（REL-PKG B） | 等待你的指令 |
| 2 | 打包后目录隔离验证（REL-PKG C / REL-VERIFY-PKGDIR） | 等待指令 |
| 3 | asar 下 Worker 运行 + 295-JAR 冒烟（REL-PKG D） | 等待指令 |
| 4 | REL-VERIFY-DUAL（安装版 + dev 并行） | 依赖安装 |
| 5 | REL-VERIFY-4K | 依赖安装版 |
| 6 | 代码签名证书 | 项目尚未配置，非本轮范围 |

---

## 11. 一句话结论

**打包这关过了。** 方案 D 的镜像把 winCodeSign / NSIS / nsis-resources 三个二进制在 7 秒内全部取回，配合已开启的开发人员模式，解压、rcedit、NSIS 全链路一次跑通，产出 78.55 MB 安装包，产品信息与 `package.json` 逐项一致，8 个尺寸图标在主程序和安装包里都能字节级检出。**但项目仍未达到正式发布标准**：安装链路、目录隔离、asar Worker 与 295-JAR 冒烟一项未做，且安装包未签名。
