# PACK-16 · B-2 构建报告（0.1.1 版本变更 + 独立构建 + 产物核对）

- 日期：2026-11-01（07:03–07:06）
- 性质：**版本变更 + 构建 + 产物核对**。**未安装、未卸载、未启动应用、未扫描、未访问生产 userData、未改 V8 台账。**
- 台账基准：`docs/PROJECT-SEALING-LEDGER-REPORT.md` **V8**（MD5 `3dc2bf53d040374d0bd05119dea3874d`，本轮未动）

---

## 0. 结论

| 问题 | 答案 |
| --- | --- |
| 构建是否成功 | ✅ **成功**（`npm run build` 与 `electron-builder --win nsis` 均退出码 0） |
| 版本身份是否一致 | ✅ **五处全部为 0.1.1**：安装包名 / exe `FileVersion` / exe `ProductVersion` / 安装包版本资源 / `app.asar/package.json.version` |
| 产物校验结果 | ✅ 图标 **8/8**（主程序与安装包各 8 个尺寸全部字节级命中）；`productName` 仍为 `undefined`（userData 路径不受影响） |
| `dist/` 是否被覆盖 | ✅ **完全没有**（76 文件指纹三次比对逐字节一致；0.1.0 安装包 SHA 未变） |
| 遗留风险 | 见 §6：安装包未签名、源码树 0.1.1 与已安装 0.1.0 状态不一致、回滚路径仍未实测 |

---

## 1. 版本变更（改动范围已证明）

### 1.1 变更命令

```bash
npm version 0.1.1 --no-git-tag-version
# 输出: v0.1.1   EXIT=0
```

### 1.2 改动范围（与改动前备份逐行 diff）

| 文件 | 备份 MD5（改动前） | 变更行数 | 具体变更 |
| --- | --- | --- | --- |
| `package.json` | `9b7ba85cfe9b2937e08abd98c8e88993` | **2 行**（1 旧 + 1 新） | 第 3 行 `"version": "0.1.0"` → `"0.1.1"` |
| `package-lock.json` | `338fd3e1989ff42de1486b0029e4e0cd` | **4 行**（2 旧 + 2 新） | 第 3 行 顶层 `version`；第 9 行 `packages[""].version` |

**合计 3 个版本字段**，除此之外**零差异**：

```
$ diff pkg.bak.json package.json
3c3
<   "version": "0.1.0",
---
>   "version": "0.1.1",

$ diff lock.bak.json package-lock.json
3c3
<   "version": "0.1.0",
---
>   "version": "0.1.1",
9c9
<       "version": "0.1.0",
---
>       "version": "0.1.1",
```

### 1.3 禁止项校验

| 禁止项 | 结果 |
| --- | --- |
| 不得添加 `productName` | ✅ `grep -c '"productName"' package.json` = **0** |
| 不得修改 `appId` / NSIS `guid` / `shortcutName` | ✅ `electron-builder.yml` MD5 `208bfe62b074b9da29e60dfca125cee4`，mtime 仍 `2026-11-01 00:07:42`（未动）；`appId: com.kubejs.recipestudio`、`shortcutName: KubeJS Recipe Studio` 原样，配置中**无 `guid`**（沿用默认） |
| 不得修改 userData 路径逻辑 | ✅ `src/` 零改动 |
| 不得有无关依赖变更 | ✅ 依赖段零差异（diff 只命中 version 行） |

---

## 2. 执行命令与退出码

| # | 命令 | 退出码 | 说明 |
| --- | --- | --- | --- |
| 1 | `npm run lint` | **0** | 0 警告（`--max-warnings=0` 通过）；npm 横幅显示 `kubejs-recipe-studio@0.1.1` |
| 2 | `npm run build` | **0** | 含 `typecheck:node` + `typecheck:web` + `electron-vite build`（main/preload/renderer/worker 全部产出） |
| 3 | `electron-builder --win --dir --config.directories.output=dist-011` | **0** | **探针步骤**：日志确认 `appOutDir=dist-011\win-unpacked` → 先证明输出覆盖生效，再跑正式构建 |
| 4 | `electron-builder --win nsis --config.directories.output=dist-011` | **0** | 正式构建；`building target=nsis file=dist-011\KubeJS Recipe Studio Setup 0.1.1.exe` |

> 环境变量：`ELECTRON_BUILDER_BINARIES_MIRROR` 已设（本次缓存齐全，未触发下载）。
> **未使用** `npm run dist:win`（该脚本会把产物写进 `dist/`，违反本轮禁令）。

**构建器**：electron-builder **25.1.8**，Electron **33.4.11**，`arch=x64`，`oneClick=false`、`perMachine=false`。

---

## 3. 输出目录隔离（关键，已三重验证）

采用**两步构建**：先用 `--dir` 探针确认 `--config.directories.output` 被 electron-builder 实际采纳，再执行 NSIS 完整构建。

| 时点 | 校验方式 | 结果 |
| --- | --- | --- |
| 构建前 | 生成 `dist/` 指纹清单（76 个文件：相对路径 + 大小 + mtime） | 基准 |
| `--dir` 探针后 | `diff` 指纹清单 | ✅ **完全未变** |
| NSIS 构建后 | `diff` 指纹清单 | ✅ **完全未变** |
| 全程 | 0.1.0 安装包 SHA-256 复核 | ✅ 仍为 `3C1BAD88…A01ECC` |

`--dir` 探针日志关键行：
```
• packaging  platform=win32 arch=x64 electron=33.4.11 appOutDir=dist-011\win-unpacked
```
→ 输出目录覆盖**确实生效**，不存在"回落到 dist/"的风险。

---

## 4. 产物清单

| 产物 | 路径 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| **安装包** | `dist-011\KubeJS Recipe Studio Setup 0.1.1.exe` | **82,360,472 B** | **`89D67446516E2ED3E17B0CC3DA6FD78E6579B3C236EEEF09B1807E2DA7AE6AA8`** |
| blockmap | `dist-011\…0.1.1.exe.blockmap` | 86,232 B | — |
| builder 调试信息 | `dist-011\builder-debug.yml` | 7,409 B | — |
| 解包目录 | `dist-011\win-unpacked\` | **73 文件** | — |
| 主程序 | `dist-011\win-unpacked\KubeJS Recipe Studio.exe` | 188,831,744 B | `2FABDA4AEC5A59325FC4BE2D5973FED5D53754325B1E8B66AD252609B6C65509` |
| app.asar | `dist-011\win-unpacked\resources\app.asar` | 2,672,123 B | `A8024EC7FA7450A41A14F724ECA9D5F5B772DA2A909087582502CEB1DC7D4410` |

**与 0.1.0 的体积对照**：安装包 82,360,469 → **82,360,472 B（+3 B）**；主程序 188,831,744 B（**不变**，因 `0.1.0`/`0.1.1` 同为 5 字符，PE 版本资源大小不变）。

> **说明**：`--dir` 探针阶段 `win-unpacked` 为 72 文件，比 `dist/win-unpacked`（73）少 `resources/elevate.exe` —— 该文件由 NSIS 打包阶段注入，属正常现象。NSIS 构建后本目录已变为 **73 文件**，与 0.1.0 一致。

---

## 5. 版本身份核对（逐项）

| # | 核对项 | 期望 | 实测 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | 安装包名称 | `KubeJS Recipe Studio Setup 0.1.1.exe` | `KubeJS Recipe Studio Setup 0.1.1.exe` | ✅ |
| 2 | 安装包文件大小 | ~82 MB（与 0.1.0 同量级） | 82,360,472 B | ✅ |
| 3 | 主程序 `ProductName` | `KubeJS Recipe Studio`（**不得是 `Electron`**） | `KubeJS Recipe Studio` | ✅ |
| 4 | 主程序 `FileVersion` | `0.1.1` | **`0.1.1`** | ✅ |
| 5 | 主程序 `ProductVersion` | `0.1.1.0`（四段补零） | **`0.1.1.0`** | ✅ |
| 6 | 安装包 `FileVersion` / `ProductVersion` | `0.1.1` | `0.1.1` / `0.1.1` | ✅ |
| 7 | `app.asar/package.json.version` | `0.1.1` | **`0.1.1`** | ✅ |
| 8 | `app.asar/package.json.productName` | **`undefined`**（不得出现） | `undefined`；字段仅 `name,version,description,main,author,license,private,dependencies` | ✅ |
| 9 | `app.asar/package.json.name` | `kubejs-recipe-studio`（userData 路径依赖它） | `kubejs-recipe-studio` | ✅ |
| 10 | 图标完整性（主程序） | 8/8 | **8/8** | ✅ |
| 11 | 图标完整性（安装包） | 8/8 | **8/8** | ✅ |
| 12 | SHA-256 | 记录 | 见 §4 | ✅ |

### 5.1 图标逐尺寸命中结果（字节级比对，非"无告警"推断）

ICO 源 `build/icon.ico`：`type=1`，8 尺寸 `16/20/24/32/48/64/128/256`。

| 尺寸 | 数据字节 | 主程序 | 安装包 |
| --- | --- | --- | --- |
| 16×16 | 1,128 B | 命中 | 命中 |
| 20×20 | 1,720 B | 命中 | 命中 |
| 24×24 | 2,440 B | 命中 | 命中 |
| 32×32 | 4,264 B | 命中 | 命中 |
| 48×48 | 9,640 B | 命中 | 命中 |
| 64×64 | 16,936 B | 命中 | 命中 |
| 128×128 | 13,907 B | 命中 | 命中 |
| 256×256 | 34,069 B | 命中 | 命中 |
| **合计** | — | **8/8** | **8/8** |

### 5.2 与 0.1.0 的身份对照

| 项 | 0.1.0（`dist/`） | 0.1.1（`dist-011/`） |
| --- | --- | --- |
| exe `FileVersion` | 0.1.0 | **0.1.1** |
| exe `ProductVersion` | 0.1.0.0 | **0.1.1.0** |
| exe SHA-256 | `193E131D…66F28` | `2FABDA4A…65509` |
| 安装包 SHA-256 | `3C1BAD88…A01ECC` | `89D67446…6AA8` |
| `app.asar` 版本 | 0.1.0 | **0.1.1** |

> `ProductName` 为 `KubeJS Recipe Studio`（非 `Electron`）证明 **rcedit 实际执行**——这正是 PACK-01 那次"无告警但图标未嵌入"的判据。

---

## 6. 遗留风险

| # | 风险 | 影响 | 现状 |
| --- | --- | --- | --- |
| R1 | **安装包未签名** | SmartScreen「未知发布者」提示 | 与 0.1.0 一致（日志 `no signing info identified, signing is skipped`）。属**分发风险**，非本轮引入 |
| R2 | **源码树现为 0.1.1，已安装仍为 0.1.0** | 状态不一致 | 本轮预期行为。B-3 结束后需决定：保留 0.1.1 为新基线，还是随安装回滚一并改回 0.1.0 |
| R3 | **0.1.1 安装器从未在任何环境运行过** | 其静默安装行为属未实测 | 与 0.1.0 由同一 electron-builder 25.1.8 + 同一模板生成；B-3 首次运行时即为其首次实测 |
| R4 | **回滚路径（高→低版本覆盖）仍属未实测** | 回滚可能失败 | A-预检已由源码确认无降级拦截；B-3 收尾时实测并如实记录 |
| R5 | `--dir` 探针在 `dist-011` 留下过 72 文件的 win-unpacked | 无 | 已被 NSIS 构建覆盖为 73 文件，无残留 |
| R6 | 未验证安装后行为（升级/回滚/启动） | 计划内 | 全部留待 B-3，本轮禁止 |

---

## 7. 证据与日志清单（`.cache/pack-15/`）

| 文件 | 内容 |
| --- | --- |
| `build.log` | `npm run build` 完整输出（typecheck + vite 三轮产物） |
| `build-dir-probe.log` | `--dir` 探针输出（含 `appOutDir=dist-011\win-unpacked`） |
| `build-nsis.log` | NSIS 正式构建完整输出 |
| `dist-before.txt` / `dist-after-probe.txt` / `dist-after.txt` | `dist/` 指纹清单（76 文件：路径 + 大小 + mtime），用于证明未被覆盖 |
| `artifact-version.txt` | 新产物与旧产物的 PE 版本资源 |
| `artifact-verify.txt` | asar 版本 + 图标 8/8 逐尺寸结果 + SHA-256 |
| `pkg.bak.json` / `lock.bak.json` | 版本变更前的原件（用于 diff 与回退） |
| `verify-artifacts.mjs` | 产物核对脚本（独立实现，可复跑） |

---

## 8. 自检（对照本轮禁令）

| 禁令 | 是否符合 |
| --- | --- |
| 不得添加 `productName` | ✅ 计数 0 |
| 不得修改 `appId` / `guid` / `shortcutName` | ✅ 配置文件未动（MD5 一致） |
| 不得修改 userData 路径逻辑 | ✅ `src/` 零改动 |
| 不得安装或卸载任何版本 | ✅ 未运行任何安装器；安装目录 exe SHA 仍 `193E131D…66F28` |
| 不得启动应用 / 扫描 / 访问生产 userData | ✅ 无进程；无 IPC 调用；生产 userData 未读写 |
| 不得覆盖 `dist/` 中的 0.1.0 产物 | ✅ 三次指纹比对完全一致；0.1.0 安装包 SHA 未变 |
| 不得修改 V8 台账 | ✅ MD5 仍 `3dc2bf53d040374d0bd05119dea3874d` |
| 不得自动进入 B-3 | ✅ 已停止 |

---

## 9. 已具备进入 B-3 的条件（**未执行，等授权**）

| B-3 前置 | 状态 |
| --- | --- |
| 0.1.1 安装包就位且身份正确 | ✅ `dist-011\…Setup 0.1.1.exe`（SHA `89D67446…6AA8`） |
| 回滚资源齐备 | ✅ 0.1.0 安装包归档 + 安装目录备份（PACK-15） |
| 执行门禁已定义 | ✅ G1 路径门禁 / G2 无进程 / G3 只用 `/S` / G4 先建基线 / G5 必须回滚 |
| uiState 四阶段顺序已固定 | ✅ 必须先趁 0.1.0 设 `light/380` 再安装 |
| 克隆基线已测 | ✅ 90,535 文件 / 34 目录 / 379,370,049 字节 |
