# PACK-17 · B-3a 报告（克隆数据准备 + 非默认 uiState 基线）

- 日期：2026-11-01（07:09–07:21）
- 性质：克隆生产 userData + 用 **0.1.0** 设置非默认 uiState + 记录基线。**未安装/卸载任何版本、未启动 0.1.1、未扫描、未改源码/版本文件/dist/V8 台账。**
- 台账基准：V8（MD5 `3dc2bf53d040374d0bd05119dea3874d`，未动）

---

## 0. 结论

> ### ✅ **具备进入覆盖安装（B-3b）的条件**

| 你的停止条件 | 结果 |
| --- | --- |
| 克隆数据不一致 | **未触发**——文件数 / 目录数 / 逻辑总字节 **三项全等**，四个关键文件哈希 **全中** |
| 生产数据发生变化 | **未触发**——四项计数 + 四个哈希 **全部与克隆前完全一致**，生产 `uiState` 仍是 `graphite/320` |
| 0.1.0 未能确认使用克隆路径 | **未触发**——`app:runtime.userData` 严格等于克隆路径，且 ≠ prod / dev |

---

## 1. 执行序列

| 时间 | 动作 |
| --- | --- |
| 07:09 | 两次确认无 `KubeJS Recipe Studio.exe` 进程 |
| 07:10 | 记录生产 userData 基线（计数 + 4 哈希） |
| 07:10–07:18 | 克隆生产 userData → `.cache/pack-13/ud-clone`（含一次中断与续传，见 §2） |
| 07:18 | 克隆完整性核验通过 |
| 07:19:19 | 启动 **0.1.0**（`STUDIO_USER_DATA` → 克隆） |
| 07:19:21 | 路径门禁通过 → `ui:patch { theme:light, sidebarWidth:380 }` |
| 07:19:26 | CDP `Browser.close` 优雅关闭（总用时 7.2s） |
| 07:20 | 记录克隆基线 + 复核生产未变 |

---

## 2. 克隆过程（如实记录一次中断）

**首次尝试**（`rm -rf <old> && cp -a src dst`）在复制到 **49,185/90,535** 文件时被 `SIGTERM` 终止——前置的 `rm -rf` 触发了本机安全策略，整条命令被一并中断。

**第二次**（`cp -a "src/." dst/`，不含任何删除动作）在后台续传，**5 分 27 秒完成，90,535 文件**。

> **为什么中断不影响完整性**：`cp -a` 是幂等覆盖；续传把源目录全部内容按原 mtime/权限重写一遍，且目标目录只可能包含源目录的文件（无外来文件）。因此结果与"一次拷完"等价——**已由 §3 的四项计数与四个哈希证明**。

累计克隆耗时约 **7 分钟**（90,535 文件，受本机杀软扫描影响）。

---

## 3. 克隆完整性核验

### 3.1 三项计数（源 = 生产，目标 = 克隆）

| 维度 | 生产 | 克隆 | 判定 |
| --- | --- | --- | --- |
| 文件数 | 90,535 | **90,535** | ✅ |
| 目录数 | 34 | **34** | ✅ |
| **逻辑总字节** | **379,370,049** | **379,370,049** | ✅ |

> 严格使用逻辑字节（`find -type f -printf '%s'` 求和），**未使用 `du`** —— 生产目录 `du` 报 489 MB，差额是 90,535 个文件的簇碎片，用它比对会凭空多出约 127 MB。

### 3.2 四个关键文件 SHA-256 抽查

| 文件 | 值 | 与生产 |
| --- | --- | --- |
| `uiState.json` | `7D1733F3C7983DBE7754C91F2A5404F4EBA00581E692CDEF65118B5795B95046` | ✅ 一致 |
| `Preferences` | `BE4B8924AB38E8ACF350E6E3B9F1F63A1A94952D8002759ACD6946C4D5D0B5DE` | ✅ 一致 |
| 哨兵 `…f08a4e` | `F08A4E6103F1C905B8113427A46967FFD98C22BF3DF72E2F19A5FD721980DA85` | ✅ 一致 |
| `studio-cache/d412cc3ebb7a5ce0/meta.json` | `807D60922351483CCA4A31BB0CC9E5A37F79184AB6A6E957102F6D1E6CF49287` | ✅ 一致 |

---

## 4. 启动与路径门禁

启动参数（与项目 E2E 一致的 GPU 关闭组，本机 GPU 限制）：
```
--no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu --remote-debugging-port=9721
环境: STUDIO_USER_DATA=E:/mc kjs/.cache/pack-13/ud-clone
```

`app:runtime` 返回（启动后 1.1 s）：
```json
{"ok":true,"data":{"appVersion":"0.1.0","userData":"E:/mc kjs/.cache/pack-13/ud-clone","platform":"win32"}}
```

| 门禁 | 结果 |
| --- | --- |
| `userData == 克隆路径` | ✅ true |
| `userData == prod / dev` | ✅ false |
| **`appVersion == 0.1.0`** | ✅ —— 同时证明**当前安装仍是 0.1.0，0.1.1 未被安装** |

---

## 5. 非默认 uiState 设置（四段式之①②）

### 5.1 改动前（默认值）

```json
{"sidebarWidth":320, "codeWidth":360, "logHeight":180,
 "sidebarCollapsed":false, "codeCollapsed":false, "logCollapsed":true,
 "theme":"graphite", "generationPreference":"auto", "showVirtualItems":false,
 "browseMode":"list", "benchV2":["minecraft:crafting_shapeless"],
 "maximized":false, "x":270, "y":85, "width":1440, "height":900}
```

### 5.2 执行 `ui:patch { theme:'light', sidebarWidth:380 }` 后

```json
{"sidebarWidth":380, "codeWidth":360, "logHeight":180,
 "sidebarCollapsed":false, "codeCollapsed":false, "logCollapsed":true,
 "theme":"light", "generationPreference":"auto", "showVirtualItems":false,
 "browseMode":"list", "benchV2":["minecraft:crafting_shapeless"],
 "maximized":false, "x":270, "y":85, "width":1440, "height":900}
```

`ui:get` 读回：`theme = light` ✅、`sidebarWidth = 380` ✅（`patchUiState` 内 `clamp(sidebarWidth, 240, 520)`，380 在合法区间内）。

### 5.3 关闭后落盘的 `uiState.json`（**升级前基线**）

| 项 | 值 |
| --- | --- |
| 路径 | `.cache/pack-13/ud-clone/uiState.json` |
| 大小 | **385 B**（原 388 B，因 `graphite`→`light` 少 3 字符） |
| **SHA-256** | **`75B042F7AFA54A7A34023A1E6329054ADC4A357750A03381D2F8E7B1E45B91F3`** |
| 完整内容 | 见下 |

```json
{
  "sidebarWidth": 380,
  "codeWidth": 360,
  "logHeight": 180,
  "sidebarCollapsed": false,
  "codeCollapsed": false,
  "logCollapsed": true,
  "theme": "light",
  "generationPreference": "auto",
  "showVirtualItems": false,
  "browseMode": "list",
  "benchV2": [
    "minecraft:crafting_shapeless"
  ],
  "maximized": false,
  "x": 270,
  "y": 85,
  "width": 1440,
  "height": 900
}
```

优雅关闭后**无残留进程**（`tasklist` 为空）。

---

## 6. 生产 userData 未变复核（关键）

| 维度 | 克隆前 | 现在 | 判定 |
| --- | --- | --- | --- |
| 文件数 | 90,535 | 90,535 | ✅ |
| 目录数 | 34 | 34 | ✅ |
| 逻辑总字节 | 379,370,049 | 379,370,049 | ✅ |
| `Preferences` | `BE4B8924…D0B5DE` | 同 | ✅ |
| 哨兵 | `F08A4E61…80DA85` | 同 | ✅ |
| **`uiState.json`** | `7D1733F3…B95046` | 同 | ✅ |
| `meta.json` | `807D6092…C49287` | 同 | ✅ |

生产 `uiState.json` 内容仍为 `"theme": "graphite"` / `"sidebarWidth": 320` —— **生产数据一行未写**。

---

## 7. B-3b 的比对基线（**必须用这组值，不是原始克隆值**）

启动 0.1.0 会在克隆里写日志、重写 `uiState.json`，因此克隆当前状态已不是"刚克隆时的 379,370,049"。

| 项 | **B-3b 应比对的基线值** |
| --- | --- |
| 文件数 | **90,535** |
| 目录数 | **34** |
| 逻辑总字节 | **379,370,729**（原始 379,370,049 ＋ 日志 +755 B － uiState −3 B） |
| `uiState.json` | **`75B042F7AFA54A7A34023A1E6329054ADC4A357750A03381D2F8E7B1E45B91F3`**（385 B） |
| `Preferences` | `BE4B8924AB38E8ACF350E6E3B9F1F63A1A94952D8002759ACD6946C4D5D0B5DE` |
| 哨兵 | `F08A4E6103F1C905B8113427A46967FFD98C22BF3DF72E2F19A5FD721980DA85` |
| `meta.json` | `807D60922351483CCA4A31BB0CC9E5A37F79184AB6A6E957102F6D1E6CF49287` |
| `items.json` | `4A75C12AC2F46BED1BA92791C40318193F66D12BDF040F82F224C0316551AEC3` |
| `recipes.json` | `B3272E9F9B7EC7DB61B0A8431CF057FACBD8776D8AA047F362430559DFFCD988` |

> 完整记录见 `.cache/pack-15/clone-baseline.txt`。
> **B-3b 阶段**：安装完成后、**任何启动之前**复算上表 → 必须全部相等（证明安装器零写入）；随后启动 0.1.1，用 `ui:get` 验 `light/380`。

---

## 8. 风险与注意事项

| # | 项 | 说明 |
| --- | --- | --- |
| R1 | **克隆已"脏"** | 含一次 0.1.0 启动痕迹（日志 +755 B，uiState 被重写）。这是**预期且必要**的——正是"用户已有真实数据"的状态。但**不能再用 §3 的 379,370,049 做比对** |
| R2 | 克隆体 361.8 MiB / 90,535 文件 | 已占盘约 490 MB（含簇分配）；E: 余量充足 |
| R3 | 启动后 `uiState.json` 哈希会变（B-3b 阶段 ④） | 已知，**不作失败判据**；只有"安装后/启动前"那一次哈希有效 |
| R4 | 中断后靠续传完成克隆 | 已用四项计数 + 四个哈希证明等价于一次拷贝成功 |
| R5 | 0.1.1 启动时若漏传 `STUDIO_USER_DATA` | 会写生产数据 → 门禁 G1 必须执行（每次启动后先验 `app:runtime.userData`） |
| R6 | 本机 GPU 限制 | 全程 `--disable-gpu*`；**正常 GPU 路径仍未验证**（既有已知限制） |

---

## 9. 自检（对照禁令）

| 禁令 | 是否符合 |
| --- | --- |
| 不得安装或卸载任何版本 | ✅ 未运行安装器；安装目录 exe SHA 仍 `193E131D…66F28` |
| 不得启动 0.1.1 | ✅ 启动的 `appVersion = 0.1.0` |
| 不得扫描模组 | ✅ 未调用 `modpack:import` / `modpack:scan`；克隆日志中无扫描记录 |
| 不得修改生产 userData | ✅ 四项计数 + 四哈希完全不变；生产 uiState 仍 graphite/320 |
| 不得修改源码、版本文件、dist、V8 台账 | ✅ 均未动（V8 MD5 `3dc2bf53…`） |
| 不得自动进入 B-3b | ✅ 已停止 |
| （本人附加）不得用 `rm -rf` 清理 | ⚠️ 首次命令含 `rm -rf` 被安全策略拦截并导致中断；**后续已改为不含删除的写法**，未清理任何历史证据 |

---

## 10. 产出

| 文件 | 内容 |
| --- | --- |
| `docs/PACK-17-B3A-CLONE-BASELINE-REPORT.md` | 本报告 |
| `.cache/pack-13/ud-clone/` | 克隆 userData（B-3b 唯一写入目标，**不清理**） |
| `.cache/pack-15/clone-baseline.txt` | 克隆当前状态完整基线（B-3b 比对用） |
| `.cache/pack-15/b3a.log` | 启动/门禁/patch/关闭全过程原始日志 |
| `.cache/pack-15/b3a.mjs` | 本次驱动脚本（可复跑） |

---

## 11. 下一步（B-3b，**未执行**）

1. 确认无进程 → 记录克隆基线（§7）
2. `"dist-011\KubeJS Recipe Studio Setup 0.1.1.exe" /S`（**不加 `--force-run`**）
3. 安装后、**启动前**复算 §7 全部哈希 → 必须全部相等
4. 核对安装态：`DisplayVersion=0.1.1`、exe `FileVersion=0.1.1`、两个 `.lnk` 仍指向正式目录
5. 启动 0.1.1（`STUDIO_USER_DATA=克隆`）→ 门禁 → `ui:get` 验 `light/380`
6. 复算哈希 → 关闭 → 记录
7. **回滚**：`"…Setup 0.1.0.exe" /S` → 按 A-预检 §3.4 全表核对
