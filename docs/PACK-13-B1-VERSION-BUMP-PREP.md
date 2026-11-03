# PACK-13 · B-1 准备报告：0.1.1 版本变更与 0.1.0 → 0.1.1 跨版本升级方案

- 日期：2026-11-01
- 性质：**仅准备评估（B-1）**。未修改 `package.json`/lockfile/配置/源码；未运行 `dist:win`；未生成或安装 0.1.1；未访问或修改真实生产 userData（仅读取元数据）；未执行扫描；未清理任何证据；未修改 V8 台账。
- 授权：负责人选择**方案 B**（制作 0.1.1，验证真实跨版本升级），本轮只做 B-1。
- 台账依据：`docs/PROJECT-SEALING-LEDGER-REPORT.md` **V8**（`REL-PKG` = 未验证，唯一未满足项 = 「升级后 `uiState` 仍在」）

---

## 0. 结论摘要（先看这六条）

| # | 结论 |
| --- | --- |
| 1 | **版本变更是单点改动**：只需改 `package.json` 的 `version` 与 `package-lock.json` 的 2 处 `version`，**无需改任何源码、配置或资源** |
| 2 | **userData 路径与版本无关**：`app.getName()` 取 `package.json.name`（`kubejs-recipe-studio`），打包后 `package.json` **无 `productName`** 字段 → 升级后数据目录不变 |
| 3 | **界面版本号是动态的**（`app:runtime.appVersion`），不存在硬编码 `v0.1.0` 的文案需要改 |
| 4 | **缓存签名不含 `appVersion`**（该字段只存不校验）→ 0.1.1 首次扫描会**命中** 0.1.0 建立的缓存；这一点既是优势（可反证数据保留），也是坑（别误判"已重扫"） |
| 5 | **打包依赖已全部就绪**：NSIS 3.0.4.1（含 `makensis.exe`）与 winCodeSign 均已在 `%LOCALAPPDATA%\electron-builder\Cache`，**无需重新下载**，可规避 PACK-02 的 502 问题 |
| 6 | **测试无需重跑即可复用**：64 个测试文件均**不依赖真实 `package.json` 版本**（仅在 mock 里返回 `'0.1.0-test'` 之类字符串） |

---

## 1. 本轮检查清单与结论总表

| 检查项 | 结论 |
| --- | --- |
| ① `package.json` / lockfile / electron-builder 版本信息 | 见 §2.1：三处版本源，**只有 2 个文件需要改** |
| ② 安装包名称 / ProductVersion / FileVersion / appVersion 来源 | 见 §2.2：**全部由 `package.json.version` 派生**，无需单独设置 |
| ③ 0.1.1 构建命令与依赖 | 见 §4：`npm version --no-git-tag-version` → `npm run dist:win`；依赖已缓存 |
| ④ 必须随版本调整的配置/资源 | 见 §3：**没有**必须改的；有 2 项"可选但建议"（产物隔离、归档 0.1.0） |
| ⑤ 升级时 userData 保留路径 | 见 §5：路径不变，`%APPDATA%\kubejs-recipe-studio`；**但有一个致命风险点**（见 §5.2） |
| ⑥ `uiState`/`Preferences`/缓存/备份 的前后验证方法 | 见 §6：**`uiState` 必须用"非默认值 + 语义比对"**，不能用哈希 |
| ⑦ 独立测试 userData 的创建/快照/恢复/隔离 | 见 §7：**克隆生产目录**（不碰原目录），含隔离硬门禁 |
| ⑧ 必须执行 vs 可复用的测试 | 见 §8：**必须新增 5 类**，可复用 4 类 |

---

## 2. 版本信息现状（实测）

### 2.1 三处版本源

| 位置 | 当前值 | 说明 |
| --- | --- | --- |
| `package.json` → `version` | **`0.1.0`** | **唯一真源**（其余全部派生自它） |
| `package-lock.json` → 根 `version` | `0.1.0` | 需与主文件同步 |
| `package-lock.json` → `packages[""].version` | `0.1.0` | 同上（lockfileVersion **3**，共 2 处） |
| `electron-builder.yml` | **无版本字段** | 只有 `appId` / `productName` / 目录 / `nsis` 选项，与版本无关 |
| 源码 / 配置 / 资源 | **无硬编码 `0.1.0`** | `src/**` 零命中；`tests/**` 仅有 mock 值（`'0.1.0-test'` 等），非真实版本 |

### 2.2 各种"版本"的来源链（全部派生自 `package.json.version`）

| 呈现位置 | 实测值 | 来源 |
| --- | --- | --- |
| 安装包文件名 | `KubeJS Recipe Studio Setup 0.1.0.exe` | electron-builder 默认 NSIS 模板 `${productName} Setup ${version}.exe`；`electron-builder.yml` **未设 `artifactName`** |
| 主程序 `FileVersion` | `0.1.0` | electron-builder 从 `package.json.version` 写入 PE 版本资源（无 `buildVersion` 覆盖） |
| 主程序 `ProductVersion` | `0.1.0`（WER 记作 `0.1.0.0`，补零到 4 段） | 同上 |
| 注册表 `DisplayName` / `DisplayVersion` | `KubeJS Recipe Studio 0.1.0` / `0.1.0` | NSIS 安装时写入，值来自 `version` |
| `app:runtime.appVersion` | `0.1.0` | `app.getVersion()` 读**打包进 asar 的** `package.json.version` |
| 界面右上角 `v0.1.0` | 动态渲染 | `src/renderer/src/components/NavRail.tsx:44`、`SettingsView.tsx:304` 均读 `runtime.appVersion`，**无硬编码** |
| 安装目录 | `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\` | 由 `productName` 决定，**与版本无关** |
| **userData 目录** | `%APPDATA%\kubejs-recipe-studio` | 由 `app.getName()` 决定 = `package.json.name`，**与版本无关** |

**关键实测**：用 `@electron/asar` 读取已安装 `resources/app.asar` 内的 `package.json`：

```
字段: name, version, description, main, author, license, private, dependencies
name = kubejs-recipe-studio
productName = undefined        ← 关键：打包后也没有 productName
version = 0.1.0
```

---

## 3. 版本变更清单

### 3.1 必须改（2 个文件、3 处）

| # | 文件 | 位置 | 0.1.0 → 0.1.1 |
| --- | --- | --- | --- |
| 1 | `package.json` | `"version"` | `0.1.0` → `0.1.1` |
| 2 | `package-lock.json` | 顶层 `"version"` | `0.1.0` → `0.1.1` |
| 3 | `package-lock.json` | `packages[""].version` | `0.1.0` → `0.1.1` |

**推荐做法**：`npm version 0.1.1 --no-git-tag-version`
- 会自动同步 `package.json` 与 `package-lock.json` 三处；
- **必须加 `--no-git-tag-version`**：本工作区**不是 Git 仓库**，不加该参数会因无法创建 tag 而报错或留下脏状态。

**不推荐**手改单个文件（易漏 lockfile 的 2 处）。

### 3.2 不需要改（已核实）

| 对象 | 为什么不用改 |
| --- | --- |
| `electron-builder.yml` | 无版本字段；`appId`/`productName` 保持不变才能覆盖安装到同一目录 |
| `build/icon.ico` 等资源 | 图标与版本无关；8 尺寸 ICO 已在位 |
| `src/**` 全部源码 | 无硬编码版本；版本经 `app.getVersion()` / `app:runtime` 动态获取 |
| `tests/**` | mock 里的 `'0.1.0-test'` 是任意字符串，**不是断言值** |
| `tsconfig` / `vite` / `eslint` 配置 | 与版本无关 |

### 3.3 可选但建议（2 项，非必需）

| # | 建议 | 理由 |
| --- | --- | --- |
| A | **构建输出改到独立目录**：`electron-builder --win nsis --config.directories.output=dist-011` | 否则新构建会**覆盖 `dist/win-unpacked/`** 与 `builder-debug.yml`，破坏 0.1.0 的现场 |
| B | **先归档 0.1.0 安装包**（复制，非移动）到 `.cache/pack-13/installers/` 并记录 SHA-256 | `dist/KubeJS Recipe Studio Setup 0.1.0.exe` 是 `PACK-10` 确认的**唯一** 0.1.0 安装包；后续 B3/REL-PKG 复核还要用 |

> 若采用 A（独立输出目录），`dist/` 可保持原样，B 项就只是"多一层保险"。

---

## 4. 构建命令与预期产物

### 4.1 命令序列（B-2 才执行）

```bash
# 0) 前置：开 Windows 开发人员模式（winCodeSign 解压需符号链接权限；PACK-01 的失败原因）
#    本轮已确认缓存存在，但解压检查仍可能触发

# 1) 版本变更（2 文件 3 处）
npm version 0.1.1 --no-git-tag-version

# 2) 校验变更（应恰好 3 处由 0.1.0 变 0.1.1）
grep -n '"version"' package.json package-lock.json | head

# 3) 构建 + 打包（build 内含 typecheck）
ELECTRON_BUILDER_BINARIES_MIRROR=https://hk.gh-proxy.com/https://github.com/electron-userland/electron-builder-binaries/releases/download/ \
npm run dist:win

# 3b) 若采用 §3.3-A（推荐）：改输出目录，避免覆盖 0.1.0 现场
# npm run build && npx electron-builder --win nsis --config.directories.output=dist-011
```

> 镜像环境变量仍建议保留：缓存齐全时可跳过下载，但一旦 electron-builder 认为缓存校验不通过，没有镜像就会复现 PACK-02 的 502。

### 4.2 预期产物

| 产物 | 路径 | 预期 |
| --- | --- | --- |
| 安装包 | `dist/KubeJS Recipe Studio Setup 0.1.1.exe`（或 `dist-011/`） | 大小约 **82.3 MB**（与 0.1.0 的 82,360,469 B 差几百字节量级） |
| blockmap | `...0.1.1.exe.blockmap` | 约 86 KB |
| 解包目录 | `dist/win-unpacked/`（或 `dist-011/win-unpacked/`） | 74 文件 / 约 270.9 MB |
| `builder-debug.yml` | 同上 | 覆盖写 |

### 4.3 产物身份核对（B-2 必做）

| 检查 | 期望 |
| --- | --- |
| 主程序 `FileVersion` | `0.1.1` |
| 主程序 `ProductName` | `KubeJS Recipe Studio`（**不得**是 `Electron`——若是则 rcedit 未执行，见 PACK-01 教训） |
| `app.asar/package.json.version` | `0.1.1` |
| `ProductVersion` 补零 | `0.1.1.0`（WER 视角） |
| 图标嵌入 | 主程序与安装包各 **8/8** 尺寸字节级命中（复用 `.cache/icon-gen/verify_ico.py` 的判定方法） |
| 安装包 SHA-256 | 记录（**不宣称**与官方一致；GitHub API 无 `digest`，同 PACK-03 的限制声明） |

---

## 5. 升级时 userData 的保留路径

### 5.1 路径不变的技术依据

```
app.getName()  ← package.json.productName || package.json.name
              = undefined || 'kubejs-recipe-studio'
              = 'kubejs-recipe-studio'

app.getPath('userData') = %APPDATA% + '\' + app.getName()
                        = C:\Users\<user>\AppData\Roaming\kubejs-recipe-studio
```

- 该目录**不含版本号**，`version` 从 `0.1.0` 改到 `0.1.1` 不影响它；
- `src/main/paths.ts` 中所有路径均由 `studioRoot()`（= `app.getPath('userData')`，仅缓存一次）派生，**无版本参与**；
- 安装目录同理由 `productName` 决定，与版本无关 → NSIS 覆盖安装进同一 `$INSTDIR`。

### 5.2 致命风险点（必须在 B-2 前明确禁止）

> **绝不能在 `package.json` 里新增 `productName` 字段。**

一旦加上，`app.getName()` 会从 `kubejs-recipe-studio` 变成 `KubeJS Recipe Studio`，userData 路径随之变成 `%APPDATA%\KubeJS Recipe Studio` —— **历史配置、索引缓存、图标缓存、配方备份在应用看来会"全部消失"**，且旧目录永远不会被清理。这会**伪造出一次"数据全丢"的假故障**，把升级测试彻底带偏。

同理禁止：改 `package.json.name`、给 `electron-builder.yml` 加 `extraMetadata.productName` 之外的 name 覆写、或改 `appId`（改 appId 会导致注册表出现两条卸载项、覆盖安装识别异常）。

### 5.3 升级时会被保留 / 会被改写的清单

| 对象 | 升级后 | 依据 |
| --- | --- | --- |
| `%APPDATA%\kubejs-recipe-studio\` 整目录 | **保留**（路径不变） | §5.1 |
| `uiState.json` | **保留**（安装器不碰；应用启动会重写，见 §6.1） | PACK-11 观测 |
| `Preferences` / `Local State` | **保留**（NSIS 不写 userData） | PACK-11 三时点哈希一致 |
| `studio-cache\<packHash>\{items,meta,recipes}.json` | **保留**，且**0.1.1 会判定为有效缓存** | `src/main/cache.ts:isCacheValid` **不比对 `appVersion`** |
| `icon-cache\` | 保留 | 路径不变 |
| `recipe-backups\<packHash>\` | 保留 | 路径不变 |
| `logs\` | 保留，并新增 0.1.1 的启动记录 | `studio-YYYY-MM-DD.log` 按日追加 |
| 安装目录 `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio\` | **被 0.1.1 覆盖** | 同一 `$INSTDIR` |
| 注册表卸载项 | `DisplayVersion` 更新为 `0.1.1`，条目**不新增** | 同一 `appId` |

---

## 6. 升级前后的验证方法（逐项）

### 6.1 `uiState.json` —— **必须用"非默认值 + 语义比对"，不能用哈希**

**为什么不能用哈希**：PACK-11 已实测，应用启动后会**重写** `uiState.json`（mtime 从启动前变为启动后 0.35 s 处）。因此"升级后哈希等于升级前"这个判据**必然失败**，且失败不代表数据丢失。

**正确做法（四段式）**：

| 段 | 动作 | 判据 |
| --- | --- | --- |
| ① 造非默认值 | 在克隆 userData 上用 0.1.1 之前的版本（即 0.1.0）启动，经 `ui:patch` 把 `theme` 改为 **`light`**、`sidebarWidth` 改为 **`380`**（默认是 `graphite` / `320`），然后**优雅关闭** | — |
| ② 取基线 | 记录 `uiState.json` 的 **SHA-256** 与**完整 JSON 内容** | 必须含 `theme:"light"`、`sidebarWidth:380` |
| ③ 安装后、启动前 | 0.1.1 覆盖安装完成后**立即**复算 SHA-256（不启动应用） | **必须与 ② 完全相同** → 证明安装器未碰 userData |
| ④ 启动后 | 启动 0.1.1，取 `ui:get` 返回值 | **`theme==="light"` 且 `sidebarWidth===380` 且窗口 bounds 与 ② 一致** → 才算"uiState 保留" |

> **为什么必须先造非默认值**：如果 `theme` 是默认的 `graphite`、宽 320，那么"读到了旧值"和"重置为默认"在结果上**无法区分**——这会得出假通过。这是本项最容易踩的坑。

> **④ 之后 `uiState.json` 的哈希可能变（应用重写文件）——这不影响判定**，判定看 `ui:get` 的语义，不看哈希。若要把哈希也纳入记录，只作参考值。

### 6.2 `Preferences`

| 段 | 方法 | 判据 |
| --- | --- | --- |
| 前 | SHA-256 + 大小（57 B） | `BE4B8924…D0B5DE`（历史基线） |
| 安装后、启动前 | 复算 | **完全一致** |
| 启动后 | 复算 | **完全一致**（PACK-11 已验证该文件跨多次启动稳定） |

### 6.3 缓存（`studio-cache\<packHash>\`）

| 段 | 方法 | 判据 |
| --- | --- | --- |
| 前 | 记录 `meta.json` / `items.json` / `recipes.json` 的 SHA-256 与 `meta.appVersion` | `meta.appVersion = "0.1.0"` |
| 安装后、启动前 | 复算三个哈希 | **完全一致** |
| 启动 0.1.1 后（**若执行扫描**） | `modpack:scan { rebuild:false }` → 读 `cacheHit` | **`cacheHit=true`** → 直接证明"0.1.1 读到了 0.1.0 建立的缓存"（因 `isCacheValid` 不比对 `appVersion`） |
| 注意 | 命中缓存时 `meta.json` **不会**被重写 → `meta.appVersion` 仍是 `0.1.0` | **不要把"`meta.appVersion==0.1.1`"当判据**，否则会误判失败 |

### 6.4 `recipe-backups\<packHash>\`

| 段 | 方法 | 判据 |
| --- | --- | --- |
| 前 | 计数（52 文件 / 28.9 KB）+ **哨兵文件** SHA-256 | `F08A4E61…80DA85` |
| 安装后、启动前 | 复算 | **完全一致** |
| 启动后 | 复算 | **完全一致** |

### 6.5 汇总判定表（B-3 升级验收用）

| 对象 | 安装后/启动前 | 启动后 | 是否阻塞 |
| --- | --- | --- | --- |
| `uiState.json` | 哈希一致 | **语义一致（非默认值仍保留）** | **是（本次唯一目标）** |
| `Preferences` | 哈希一致 | 哈希一致 | 是 |
| `studio-cache` 三文件 | 哈希一致 | 哈希一致 | 是 |
| 缓存可用性 | — | `cacheHit=true`（若扫描） | 建议 |
| `recipe-backups` + 哨兵 | 哈希一致 | 哈希一致 | 是 |

---

## 7. 独立测试 userData：创建 / 快照 / 恢复 / 隔离

### 7.1 核心矛盾与解法

**矛盾**：要验证"真实用户数据在升级后保留"，最真实的对象就是生产 userData；但约束明确"不访问或修改真实生产 userData"。

**解法（推荐）**：**克隆一份生产 userData 到测试目录**，在克隆体上做升级。理由：

- 克隆体内容与生产**逐字节一致**（同一份真实数据，含真实的 `uiState.json`/`Preferences`/缓存/备份），保真度远高于"用测试数据造一个"；
- 生产目录全程**只读**（只用 `cp -a` 读）；
- `STUDIO_USER_DATA` 在 0.1.0 与 0.1.1 下行为一致（PACK-05 已验证该环境变量优先于默认路径，且 `app:runtime.userData` 会如实返回）。

### 7.2 目录规划

```
E:\mc kjs\.cache\pack-13\
├── ud-clone\                 ← 生产 userData 的完整克隆（唯一写入目标）
│   ├── uiState.json
│   ├── Preferences / Local State
│   ├── studio-cache\<hash>\
│   ├── icon-cache\
│   ├── recipe-backups\<hash>\
│   └── logs\
├── snapshots\
│   ├── before\               ← 升级前快照（哈希清单 + 关键文件副本）
│   └── after\                ← 升级后快照
├── installers\
│   └── KubeJS Recipe Studio Setup 0.1.0.exe   ← 归档（复制，非移动）
└── out\                      ← 驱动日志、CDP 事件、截图、result.json
```

### 7.3 创建（B-2 执行）

| 步骤 | 命令 / 动作 | 校验 |
| --- | --- | --- |
| 1 | 确认无应用进程（单实例锁会干扰） | `tasklist` 为空 |
| 2 | `cp -a "%APPDATA%\kubejs-recipe-studio" ".cache/pack-13/ud-clone"` | 文件数 **90,535**、大小 **361.8 MB** 与原一致 |
| 3 | 校验克隆完整性 | `Preferences` SHA = `BE4B8924…`、哨兵 SHA = `F08A4E61…`、`uiState.json` 存在 |
| 4 | **生产目录复查** | 三项哈希与克隆前一致（证明只读） |

### 7.4 快照内容

| 类别 | 内容 |
| --- | --- |
| 哈希清单 | `uiState.json` / `Preferences` / `Local State` / `studio-cache/<hash>/{meta,items,recipes}.json` / 哨兵 / `favorites.json`（若存在）/ `customRecipeTypes.json`（若存在） |
| 语义清单 | `uiState.json` 的完整 JSON（用于 ④ 段比对） |
| 计数 | userData 总文件数、总大小；`icon-cache`/`studio-cache`/`recipe-backups`/`logs` 分项计数 |
| 安装态 | 安装目录 74 文件、exe SHA-256、注册表 `DisplayVersion` |

### 7.5 隔离硬门禁（沿用 PACK-06/09 的成熟做法）

每次启动应用后，**第一件事**取 `app:runtime`：

- `userData` **必须严格等于** `.cache/pack-13/ud-clone`；
- **必须不等于** `%APPDATA%\kubejs-recipe-studio` 与 `...-dev`；
- 任一不满足 → **立即中止**，不导入、不扫描、不安装。

### 7.6 恢复方案

| 场景 | 恢复动作 |
| --- | --- |
| 测试中克隆体被写坏 | 直接删除不了（禁令）→ **移到隔离区** `E:/_trash_<日期>/`，用 `cp -a` 从生产重新克隆 |
| 需要回到"未升级"态 | 用归档的 `KubeJS Recipe Studio Setup 0.1.0.exe` 重装覆盖（**这是同版本降级安装，不等于跨版本升级验证**，只用于恢复环境） |
| 生产目录意外被写 | **立即停止整个任务并上报**，不做任何"补救写入" |

---

## 8. 测试清单：必须执行 vs 可复用

### 8.1 必须新执行（5 类）

| # | 项目 | 为什么不能复用 |
| --- | --- | --- |
| 1 | `npm version 0.1.1 --no-git-tag-version` + 3 处版本核对 | 本轮唯一变更 |
| 2 | `npm run dist:win`（含 `typecheck` + `electron-vite build`） | 必须产出 0.1.1 安装包 |
| 3 | 0.1.1 产物身份核对（FileVersion/ProductName/app.asar version/图标 8-8/SHA-256） | PACK-03 的是 0.1.0 产物 |
| 4 | **0.1.0 → 0.1.1 覆盖安装 + `uiState` 四段式验证** | **这是本次的核心目标**，历史无此证据 |
| 5 | 0.1.1 启动 + `app:runtime.appVersion=0.1.1` + DOM 正常 + 数据读取 | 证明升级后应用可用 |

### 8.2 可复用（4 类，附理由）

| # | 项目 | 复用理由 | 风险 |
| --- | --- | --- | --- |
| 1 | `npm test`（64 文件 / 621 用例） | 本次**只改 `version` 字符串**，零源码变更；测试用 mock 的 `getVersion()`，无断言依赖真实版本 | 若选择"发布前必跑全量"，则重跑一次（成本见 §11），**结论不会变** |
| 2 | `npm run lint` | 同上，无源码变更 | 同上 |
| 3 | P-C7 E2E（`.cache/e2e-pc7.mjs` 八场景） | 断言的是 UI 契约（`.view-tabs button`、`.item-row` 等），与版本无关 | 无 |
| 4 | `REL-PKG` 的 A/C/D 类证据（PACK-03/05/07/09） | 版本号不影响打包链路、目录隔离、asar worker 行为 | 若 0.1.1 的 asar 结构有变（本次不会），需重验 |

### 8.3 明确**不需要**重做

| 项目 | 理由 |
| --- | --- |
| 295-JAR 核心扫描（PACK-07/09） | 源码未变；升级测试只需验缓存可用性（`cacheHit=true`），不需重扫 |
| B4 卸载（PACK-04） | 0.1.1 卸载未在本次范围内；`REL-PKG` B 类「卸载」已通过 |
| B1 全新安装（PACK-04） | 已有；本次是**升级**安装，不是全新安装 |
| N5 同版本覆盖安装（PACK-11） | 已被本次跨版本升级**覆盖**（更强形式）；N5 证据仍有效，无需重做 |
| `REL-VERIFY-DUAL` / `REL-VERIFY-4K` | 不在本次授权范围 |

---

## 9. 升级测试步骤（B-3 预案，本轮不执行）

| # | 步骤 | 判据 / 中止条件 |
| --- | --- | --- |
| 0 | 归档 0.1.0 安装包 + 记录 SHA-256；记录生产 userData 三项基线 | SHA 与 `3c1bad88…` 一致 |
| 1 | 克隆生产 userData → `ud-clone`；校验 90,535 文件 / 361.8 MB / 两哈希 | 不符 → 中止 |
| 2 | `STUDIO_USER_DATA=ud-clone` 启动 **0.1.0**，经 `ui:patch` 设 `theme=light`、`sidebarWidth=380`，优雅关闭 | `app:runtime.userData` 必须等于 `ud-clone` |
| 3 | 取**升级前快照**（哈希 + 语义 + 计数） | `uiState.json` 必须含 `theme:"light"`、`sidebarWidth:380` |
| 4 | 静默安装 0.1.1：`"<dist>\KubeJS Recipe Studio Setup 0.1.1.exe" /S`（应用已关闭） | 退出码 0；安装目录仍 74 文件 |
| 5 | **安装后、启动前**复算全部哈希 | 全部与 §3 快照一致 → 证明安装器零写入 userData |
| 6 | 核对安装态版本 | `FileVersion=0.1.1`、注册表 `DisplayVersion=0.1.1`、`app.asar version=0.1.1` |
| 7 | 启动 0.1.1（`STUDIO_USER_DATA=ud-clone` + `--disable-gpu*` + CDP） | 路径门禁通过；`app:runtime.appVersion=0.1.1` |
| 8 | **`ui:get` 语义比对** | `theme==="light"` ∧ `sidebarWidth===380` ∧ bounds 一致 → **uiState 保留成立** |
| 9 | 复算 `Preferences` / `studio-cache` / 哨兵 哈希 | 全部一致 |
| 10 | （可选）导入 pc5 基准包 + `modpack:scan{rebuild:false}` | `cacheHit=true` → 反证缓存被 0.1.1 有效复用 |
| 11 | DOM 探测 + 截图 | 三导航项、0 异常 |
| 12 | 优雅关闭；复核生产 userData 未变 | 任一变化 → 中止上报 |

**中止条件（不自行修复）**：路径门禁失败 / 安装退出码非 0 / 步骤 5 任一哈希变化 / 步骤 8 `theme` 变回 `graphite` / 生产目录被写 / 应用崩溃。

---

## 10. 风险与回滚

| # | 风险 | 概率 | 影响 | 缓解 / 回滚 |
| --- | --- | --- | --- | --- |
| R1 | 给 `package.json` 加 `productName` → userData 路径改变，表现为"数据全丢" | 低（已明令禁止） | **高（伪故障，误导结论）** | B-2 前核对 `package.json` 无 `productName`；升级前后比对 `app:runtime.userData` |
| R2 | 新构建覆盖 `dist/win-unpacked`，破坏 0.1.0 现场 | **中** | 中 | 采用 §3.3-A 独立输出目录；或先归档 |
| R3 | electron-builder 重新下载 winCodeSign（502） | 低（缓存齐全） | 中（构建失败） | 保留 `ELECTRON_BUILDER_BINARIES_MIRROR`；确认开发人员模式已开 |
| R4 | NSIS 覆盖安装时应用未关闭 → 文件占用失败 | 中 | 中 | 步骤 4 前强制确认无进程 |
| R5 | `uiState` 判定踩"默认值陷阱" → 假通过 | **中** | **高（结论错误）** | 强制"非默认值"法（§6.1） |
| R6 | 把"`meta.appVersion==0.1.1`"当判据 → 误判失败 | 中 | 中 | 已写明：命中缓存时 meta 不重写 |
| R7 | 本次升级成功被误当作"跨版本迁移已验证" | 中 | 中 | 台账 §10 已有表述纪律：仅验证 0.1.0→0.1.1 一条路径，不外推 |
| R8 | 克隆体 361.8 MB / 90,535 文件复制失败或耗时过长 | 低 | 低 | 复制后按文件数+大小+两哈希校验 |
| R9 | 回滚需要回到 0.1.0 | — | — | 用归档的 0.1.0 安装包重装覆盖（**注意：这是同版本降级，不构成升级验证**） |

---

## 11. 预计工作量

| 阶段 | 内容 | 预计耗时 |
| --- | --- | --- |
| B-2 版本变更 | `npm version` + 3 处核对 | **2 分钟** |
| B-2 构建 | `npm run dist:win`（含 typecheck + build） | **2–4 分钟**（PACK-03 实测 49 s，留余量） |
| B-2 产物核对 | 版本资源 / 图标 8-8 / app.asar / SHA-256 | **3–5 分钟** |
| B-3 克隆 + 快照 | `cp -a` 90,535 文件 + 哈希清单 | **3–6 分钟** |
| B-3 非默认值设定 | 启动 0.1.0 + `ui:patch` + 关闭 | **2 分钟** |
| B-3 升级安装 + 验证 | 安装 / 6 类哈希复算 / 启动 / `ui:get` 语义比对 | **8–12 分钟** |
| B-3 可选：缓存复用验证 | 导入 pc5 + 一次扫描（约 40 s） | **3 分钟** |
| 报告撰写 | 升级验证报告 | **10 分钟** |
| **合计** | 不含等待授权 | **约 33–45 分钟** |

**可选追加**：若决定重跑全量测试门禁（`npm test` + `npm run lint`），再加 **约 5–8 分钟**。

---

## 12. 需负责人确认的 4 个决策点（B-2 前）

| # | 决策点 | 选项 |
| --- | --- | --- |
| D1 | 构建输出目录 | **A：独立 `dist-011/`（推荐，保住 0.1.0 现场）** ｜ B：沿用 `dist/`（会覆盖 win-unpacked） |
| D2 | 0.1.0 安装包是否先归档 | **A：归档到 `.cache/pack-13/installers/`（推荐）** ｜ B：不归档，仅依赖 `dist/` |
| D3 | 是否重跑全量测试 | A：不重跑，复用 0.1.0 证据（**推荐**，源码零变更） ｜ B：重跑一次（+5–8 分钟） |
| D4 | 升级测试的 userData | **A：克隆生产目录（推荐，最真实且不碰生产）** ｜ B：新建空目录（保真度低，无法验证真实数据保留） ｜ C：直接用生产目录（**需单独授权，风险最高，不建议**） |

---

## 13. 自检（对照本轮约束）

| 约束 | 是否符合 |
| --- | --- |
| 不修改 `package.json`/lockfile/配置/源码 | ✅ 仅读取（`cat` / `grep` / `read`） |
| 不运行 `dist:win` | ✅ 未运行任何构建 |
| 不生成或安装 0.1.1 | ✅ `dist/` 仍只有 0.1.0 产物 |
| 不访问或修改真实生产 userData | ✅ 仅**读取元数据**（目录名、哈希、计数），未写入；克隆方案在 B-2 才执行且为只读复制 |
| 不执行扫描 | ✅ 无应用启动、无 `modpack:scan` |
| 不清理历史证据 | ✅ `.cache/pack-01`–`pack-06`、`pack-10*`、`pack-11`、`pack-12` 全部保留 |
| 不修改 V8 台账 | ✅ 未触碰（MD5 仍 `3dc2bf53d040374d0bd05119dea3874d`） |
| 完成后暂停，等授权 B-2 | ✅ 已暂停 |

---

## 14. 本轮产出

| 文件 | 说明 |
| --- | --- |
| `docs/PACK-13-B1-VERSION-BUMP-PREP.md` | 本报告 |
| `.cache/pack-13/00-env-baseline.txt` | B-1 环境基线（安装态 / 版本源 / 打包缓存，只读测得） |

**未创建**：`ud-clone`、快照、任何构建产物、任何安装包（等 B-2 授权）。
