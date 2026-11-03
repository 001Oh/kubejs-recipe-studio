# PACK-18 · B-3b 报告（0.1.0 → 0.1.1 真实覆盖安装验证）

- 日期：2026-11-01（07:27:07–07:31）
- 性质：**真实跨版本覆盖安装 + 启动验证**。未回滚（按指令留待单独授权）、未扫描模组、未改源码/版本文件/V8 台账。
- 台账基准：V8（MD5 `3dc2bf53d040374d0bd05119dea3874d`，未动）

---

## 0. 六项结论

| 项 | 结论 |
| --- | --- |
| **① 覆盖安装** | ✅ **成功**——退出码 0 / 5.3 s；装到正式默认目录；74 文件；exe = 0.1.1 |
| **② 安装前数据保留** | ✅ **安装器对 userData 零写入**——6 个关键哈希 + 3 项计数与安装前**完全相同** |
| **③ 0.1.1 启动** | ✅ **成功**——`appVersion=0.1.1`、路径门禁通过、界面显示 `v0.1.1`、**0 控制台异常** |
| **④ uiState 保留** | ✅ **双重证明**——`ui:get` 返回 `light/380` **且** `uiState.json` 哈希与升级前**逐字节相同** |
| **⑤ 缓存** | ⚠️ **静态证据齐全，`cacheHit` 未测得**（因"不扫描模组"硬约束，见 §5） |
| **⑥ 回滚准备** | ✅ **资源齐备，已停在回滚前**（未执行回滚） |

> **`REL-PKG` 唯一剩余缺口「升级后 `uiState` 仍在」在本次取得直接证据。**

---

## 1. ① 覆盖安装

### 1.1 执行

| 项 | 值 |
| --- | --- |
| 安装包 | `dist-011\KubeJS Recipe Studio Setup 0.1.1.exe`（SHA `89D67446…6AA8`，执行前复核） |
| 参数 | **仅 `/S`**（无 `/D`、无 `--force-run`） |
| 目标目录 | 默认 `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio` |
| 开始 / 结束 | 07:27:34 → 07:27:39 |
| **退出码** | **0** |
| 耗时 | **5.3 s** |

**G2 门禁**：安装前两次进程检查（间隔 2–3 s）均为空。

### 1.2 安装后安装态

| 项 | 安装前（0.1.0） | 安装后（0.1.1） |
| --- | --- | --- |
| 文件数 / 目录数 | 74 / 3 | **74 / 3** |
| 逻辑总字节 | 284,023,841 | **284,023,811**（−30 B） |
| 主程序 SHA-256 | `193E131D…66F28` | **`2FABDA4AEC5A59325FC4BE2D5973FED5D53754325B1E8B66AD252609B6C65509`** |
| `FileVersion` / `ProductVersion` | 0.1.0 / 0.1.0.0 | **0.1.1 / 0.1.1.0** |
| `ProductName` | KubeJS Recipe Studio | KubeJS Recipe Studio（非 Electron） |
| 注册表 `DisplayName` | KubeJS Recipe Studio 0.1.0 | **KubeJS Recipe Studio 0.1.1** |
| 注册表 `DisplayVersion` | 0.1.0 | **0.1.1** |
| 卸载项数量 | 1 | **1**（未产生第二条，键名仍是 `ead40464-49f1-54a5-bf84-970a4324381b`） |

**−30 B 差额已定位**：全部来自 `Uninstall KubeJS Recipe Studio.exe`（240,933 → 240,903 B，卸载器内嵌版本字符串压缩后差 30 B）。**逐文件比对确认为唯一差异，其余 73 个文件大小完全一致。**

### 1.3 快捷方式（安装后重建）

| | 桌面 | 开始菜单 |
| --- | --- | --- |
| 大小 | 2,579 B（与安装前相同） | 2,587 B（与安装前相同） |
| 修改时间 | **2026-11-01 07:27:39**（安装时刻重建） | 同 |
| **TargetPath** | `…\Programs\KubeJS Recipe Studio\KubeJS Recipe Studio.exe` | 同 |
| WorkingDir | `…\Programs\KubeJS Recipe Studio` | 同 |

→ 目标仍指向**正式目录**，未指向 `dist-011` 或任何临时路径。

### 1.4 安装器行为印证（与 A-预检的源码判断一致）

安装日志时间线 + 结果共同印证：**先静默卸载 0.1.0（带 `/KEEP_APP_DATA` 与 `--updated`）→ 再安装 0.1.1**。5.3 s 内完成两者，与 0.1.0 同版本覆盖（5.1 s）同量级。

---

## 2. ② 安装前数据保留（首次启动前检查）

> **检查时机**：安装结束后、**任何启动之前**。这是判定"安装器是否写入用户数据"的唯一有效时点。

| 对象 | 基线（B-3a） | 安装后、启动前 | 判定 |
| --- | --- | --- | --- |
| 文件数 | 90,535 | **90,535** | ✅ |
| 目录数 | 34 | **34** | ✅ |
| 逻辑总字节 | 379,370,729 | **379,370,729** | ✅ |
| `uiState.json`（385 B） | `75B042F7…B91F3` | **`75B042F7AFA54A7A34023A1E6329054ADC4A357750A03381D2F8E7B1E45B91F3`** | ✅ |
| `Preferences` | `BE4B8924…D0B5DE` | 同 | ✅ |
| 哨兵 `…f08a4e` | `F08A4E61…80DA85` | 同 | ✅ |
| `items.json` | `4A75C12A…51AEC3` | 同 | ✅ |
| `recipes.json` | `B3272E9F…FFCD988` | 同 | ✅ |
| `meta.json` | `807D6092…C49287` | 同 | ✅ |

**结论：安装器对 userData 的写入量为 0**——三项计数与六个哈希**全部未变**。

### 2.1 「允许变化」与「必须不变」的区分

| 类别 | 文件 | 本轮表现 |
| --- | --- | --- |
| **必须不变**（用户数据） | `uiState.json`、`Preferences`、`favorites.json`、`customRecipeTypes.json`、`recipe-backups/**`、`studio-cache/**`、`icon-cache/**` | ✅ 全部未变 |
| **允许变化**（运行时产物） | `logs/studio-*.log`、Chromium 档案目录（`Cache`/`Code Cache`/`GPUCache`/`Local Storage`…） | 安装阶段**也未变**（安装器不启动应用） |
| 明确不计入 | 安装目录本身、`out/`、`dist-011/` | 安装目录按设计被替换 |

### 2.2 生产 userData（全程只读）

| 项 | 全程值 | 判定 |
| --- | --- | --- |
| 文件数 / 目录数 / 逻辑字节 | 90,535 / 34 / 379,370,049 | ✅ 三次测量均未变 |
| `Preferences` / 哨兵 / `uiState.json` / `meta.json` | 四个哈希均未变 | ✅ |
| 内容抽查 | `uiState.json` 仍为 `"theme":"graphite"` / `"sidebarWidth":320` | ✅ **生产数据一行未写** |

---

## 3. ③ 0.1.1 启动验证

### 3.1 启动参数

```
STUDIO_USER_DATA=E:/mc kjs/.cache/pack-13/ud-clone
--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu
--remote-debugging-port=9723
（无 --force-run）
```

### 3.2 G1 门禁（启动后第一时间）

```json
{"ok":true,"data":{"appVersion":"0.1.1","userData":"E:/mc kjs/.cache/pack-13/ud-clone","platform":"win32"}}
```

| 检查 | 结果 |
| --- | --- |
| `userData == 克隆路径` | ✅ true |
| `userData == prod / dev` | ✅ false |
| **`appVersion`** | **`0.1.1`** ✅ |
| CDP 就绪耗时 | 1.1 s |

### 3.3 界面与运行时

| 项 | 结果 |
| --- | --- |
| `document.title` | KubeJS Recipe Studio |
| `readyState` | complete |
| 导航项 | **3 个**：配方浏览 / 工作台 / 设置与诊断 |
| 界面版本号（DOM 文本） | **`KubeJS RECIPE STUDIO v0.1.1`** ← 动态读取，证明是 0.1.1 在跑 |
| `rootChildren` / `toasts` | 1 / 0 |
| `window.studio` 桥接 | 存在 |
| **控制台/异常事件** | **0** |
| 截图 | `.cache/pack-15/b3b-011-window.png`（56,487 B） |
| 退出方式 | CDP `Browser.close` 优雅关闭 |
| 残留进程 | **无** |

---

## 4. ④ uiState 保留（本次核心）

### 4.1 双重证明

| 层次 | 证据 | 结果 |
| --- | --- | --- |
| **语义**（应用实际读到的值） | `ui:get` → `{"theme":"light","sidebarWidth":380,"x":270,"y":85,"width":1440,"height":900,…}` | ✅ `light` / `380` / 窗口位置尺寸全部保留 |
| **字节**（磁盘实际内容） | `uiState.json` SHA-256 = `75B042F7AFA54A7A34023A1E6329054ADC4A357750A03381D2F8E7B1E45B91F3`（385 B） | ✅ **与升级前完全相同** |

内容比对：

```json
{
  "sidebarWidth": 380,          ← 非默认值，保留
  "theme": "light",             ← 非默认值，保留
  "x": 270, "y": 85, "width": 1440, "height": 900,
  ...（其余字段与升级前逐字段一致）
}
```

### 4.2 为什么这次哈希也能作为判据

B-3a 时发现"应用启动会重写 `uiState.json`，故启动后哈希不可作判据"。**本次实测显示：0.1.1 启动后该文件哈希未变**（因为读到的状态与它要写的内容一致，未触发重写）。

因此本次有**两条独立证据**：
1. 语义层：`ui:get` 返回 `light/380` —— 这是**判定成立的充分条件**；
2. 字节层：SHA 与升级前一致 —— 这是**额外的加强证据**（不是必需条件）。

> 按原定口径，**即使第 2 条不成立也不影响判定**；它是"意外更好"的结果，不是判据前提。

---

## 5. ⑤ 缓存结果（含一处指令冲突，需你裁决）

### 5.1 静态检查（已做）

| 项 | 值 |
| --- | --- |
| `studio-cache/d412cc3ebb7a5ce0/meta.json` | 存在，442 B，SHA `807D6092…C49287`（与升级前一致） |
| `items.json` | 存在，15,322,897 B，SHA `4A75C12A…51AEC3`（一致） |
| `recipes.json` | 存在，31,434,604 B，SHA `B3272E9F…FFCD988`（一致） |
| `meta.appVersion` | **`0.1.0`**（未更新，符合预期，**未作判据**） |
| `meta.parserVersion` / `schemaVersion` | 1 / 2（与代码常量一致） |
| `meta.phases` | `["items","recipes"]`（两阶段完整） |

**代码层依据**（B-1 已核）：`src/main/cache.ts:isCacheValid` 只比对 `schemaVersion`、`parserVersion`、`mcVersion`+`kubejsVersion`、mods 签名、`extras`、`phases`，**不比对 `appVersion`** → 0.1.1 应当能命中 0.1.0 建立的缓存。

### 5.2 `cacheHit` 布尔值：**未测得**

> **指令冲突，如实报告**：阶段 3 第 6 条要求"检查缓存是否命中，并记录实际结果"，但硬性约束写明"**不扫描模组**"。
> `cacheHit` 只能通过 `modpack:import` + `modpack:scan {rebuild:false}` 触发扫描后从事件/摘要中取得——**必然要扫描**。
> 两者不可兼得。本次**遵守硬约束，未扫描**，因此 `cacheHit` 记为 **未测量**，不给推断值。

**若需补测**：单独授权一次"导入 pc5 基准包 + `rebuild:false` 扫描"，约 40 s，可取得 `cacheHit=true`。这一项**不阻塞** `REL-PKG` 的 `uiState` 结论。

---

## 6. ⑥ 回滚准备（已停在回滚前，**未回滚**）

### 6.1 回滚资源可用性复核

| 资源 | 状态 |
| --- | --- |
| **0.1.0 安装包归档** `.cache/pack-13/installers/KubeJS Recipe Studio Setup 0.1.0.exe` | ✅ 82,360,469 B，SHA **`3C1BAD88A9E14AE5E109FD702D90A74971FB11056FA2125037F934AC5AA01ECC`**（与已知基准一致） |
| **安装目录备份** `.cache/pack-15/backup-install-0.1.0` | ✅ 74 文件 / 3 目录 / 284,023,841 B，exe SHA `193E131D…66F28`（与 0.1.0 原件一致） |
| 当前已安装版本 | **0.1.1**（exe SHA `2FABDA4A…65509`）—— **本阶段未回滚，符合指令** |

### 6.2 回滚命令（**未执行**）

```bash
# 前置：G2 两次进程检查为空
".cache/pack-13/installers/KubeJS Recipe Studio Setup 0.1.0.exe" /S
# 仅 /S；不加 /D；不加 --force-run
```

**内部行为**：从注册表读 0.1.1 的 `UninstallString` → 静默卸载 0.1.1（`/KEEP_APP_DATA --updated`）→ 安装 0.1.0 → 重建卸载项与两个快捷方式。

### 6.3 回滚后应满足的验收表

| # | 检查项 | 期望 |
| --- | --- | --- |
| 1 | 退出码 | 0 |
| 2 | 安装目录 | 74 文件 / 3 目录 / **284,023,841** B（若多于 74 说明有残留，判异常） |
| 3 | 主程序 SHA-256 | `193E131D0C39590BB4651414824F91538D4059A0A9FD63154F03398BE0466F28` |
| 4 | `FileVersion` / `ProductVersion` | `0.1.0` / `0.1.0.0` |
| 5 | 注册表 `DisplayVersion` | `0.1.0`，且仍只有 1 条卸载项 |
| 6 | 两个 `.lnk` | 存在，目标仍为正式目录 |
| 7 | 克隆 userData 六个哈希 | 与 §2 表格相同（回滚同样不应写 userData） |
| 8 | 生产 userData | 三项计数 + 四哈希不变 |

> **残余风险（A-预检已声明）**：高版本→低版本覆盖**从未实测**；源码层无降级拦截，但仍属未验证路径。回滚后必须逐项核对上表并如实记录；若失败，用安装目录备份 + 归档安装包处理，**不自动修补**。

---

## 7. 执行时间线

| 时间 | 动作 | 结果 |
| --- | --- | --- |
| 07:27:17 / 07:27:20 | G2 双重进程检查 | 均为空 |
| 07:27:27 | 安装前快照（74/3/284,023,841，exe `193E131D`） | — |
| 07:27:34 → 07:27:39 | **覆盖安装 `/S`** | **退出码 0 / 5.3 s** |
| 07:27:39 | 快捷方式重建 | 目标仍为正式目录 |
| 07:28–07:29 | 阶段 2：安装后/启动前检查 | 6 哈希 + 3 计数全等 |
| 07:30:25 | 启动 0.1.1 | `appVersion=0.1.1`，G1 通过 |
| 07:30:31 | `ui:get` 验证 + 截图 + 优雅关闭 | `light/380` ✅，0 异常 |
| 07:31 | 启动后复核 + 回滚准备 | 停在回滚前 |

---

## 8. 自检（对照硬性约束）

| 约束 | 是否符合 |
| --- | --- |
| 生产 userData 全程只读 | ✅ 三次测量计数与哈希均未变；内容仍 `graphite/320` |
| **G1 每次启动后立即验路径** | ✅ 0.1.1 启动后第一时间验 `app:runtime.userData`，== 克隆且 ≠ prod/dev |
| **G2 安装前后检查无残留进程** | ✅ 安装前两次；启动后确认无残留 |
| **G3 绝不使用 `--force-run`** | ✅ 安装与启动均未使用 |
| 不扫描模组 | ✅ 未调用 `modpack:import` / `modpack:scan` |
| 不修改源码、版本文件、V8 台账 | ✅ 均未动（V8 MD5 `3dc2bf53…`） |
| 本阶段不得自动回滚 | ✅ **已停在回滚前**，当前安装为 0.1.1 |
| 不得自动进入后续阶段 | ✅ 已停止 |
| 异常立即停止不绕门禁 | ✅ 全程无异常，未触发中止 |

---

## 9. 产出

| 文件 | 内容 |
| --- | --- |
| `docs/PACK-18-B3B-UPGRADE-REPORT.md` | 本报告 |
| `.cache/pack-15/pre-install-snapshot.txt` | 安装前安装目录快照 |
| `.cache/pack-15/pre-install-reg.txt` / `post-install-reg.txt` | 安装前后注册表快照 |
| `.cache/pack-15/b3b-launch.log` | 0.1.1 启动全过程原始日志（门禁/版本/ui:get/DOM/缓存静态检查） |
| `.cache/pack-15/b3b-011-window.png` | 0.1.1 运行截图（56,487 B） |
| `.cache/pack-15/clone-baseline.txt` | 升级前克隆基线（本次比对依据） |
| `.cache/pack-13/ud-clone/` | 克隆 userData（含 0.1.1 启动痕迹，**不清理**） |

---

## 10. 待你裁决

| # | 事项 |
| --- | --- |
| **D1** | 是否授权**执行回滚**（0.1.1 → 0.1.0），按 §6.3 八项验收 |
| **D2** | 是否授权**补测 `cacheHit`**（导入 pc5 + `rebuild:false` 扫描，约 40 s） |
| **D3** | 源码树现为 0.1.1：回滚安装后是否把 `package.json`/`package-lock.json` 一并改回 0.1.0，还是保留 0.1.1 作为新基线 |
| **D4** | 本次证据是否足以关闭 `REL-PKG` 的「升级后 `uiState` 仍在」并进入台账修订（需另开授权，本轮不动 V8） |
