# PACK-14 · 安装隔离评估与阶段准入判定（B-1.5）

- 日期：2026-11-01
- 性质：**仅方案确认**。未构建、未安装、未启动应用、未扫描；未修改 `package.json`/lockfile/配置/源码；未改 V8 台账；生产 userData 未写。
- 本轮新增的只读动作：用 7-Zip 解包 0.1.0 安装器到 `.cache/pack-13/nsis-inspect/`（只读副本）；读取 HKCU/HKLM 卸载注册表项。
- 上游：`docs/PACK-13-B1-VERSION-BUMP-PREP.md`；决策 D1 独立输出 / D2 归档 0.1.0 / D3 不重跑全量测试 / D4 克隆 userData

---

## 0. 结论

| 问题 | 答案 |
| --- | --- |
| 默认配置下能否把 0.1.1 装到独立目录且**不干扰正式安装**？ | **不能。** 文件可隔离，但**卸载注册表项**与**两个快捷方式**必然被覆盖 |
| 因此能否执行覆盖安装？ | **不能。** 按你第 4 条硬性前置 → **停在评估阶段** |
| 有没有**完全隔离**的办法？ | **有**：测试版构建改 `nsis.guid` + `nsis.shortcutName`，安装加 `/D=<独立目录>`，三项全隔离 |
| 代价是什么？ | 改了 `guid` → NSIS 视为**另一个应用** → **不再是"0.1.0→0.1.1 升级"**，只是"0.1.1 全新安装读取 0.1.0 数据" |
| 能否进入构建阶段？ | **构建与产物核对可以**；**覆盖安装不行**，需先在方案 A / B 中二选一 |
| 最根本的一句 | **「真实升级」与「不影响正式安装」在 NSIS 层面互斥**——升级要求同一身份覆盖同一安装，隔离要求换一个身份 |

---

## 1. 版本修改方案（已确认，可直接执行）

| # | 文件 | 位置 | 改法 |
| --- | --- | --- | --- |
| 1 | `package.json` | `"version"` | `0.1.0` → `0.1.1` |
| 2 | `package-lock.json` | 顶层 `"version"` | `0.1.0` → `0.1.1` |
| 3 | `package-lock.json` | `packages[""].version` | `0.1.0` → `0.1.1` |

**执行**：`npm version 0.1.1 --no-git-tag-version`（本工作区非 Git，必须带该参数）

**执行后校验（三选一不符即回滚）**：
```bash
# ① 恰好 3 处 version 变化，其余零差异
diff <(cat package.json.bak) package.json
diff <(cat package-lock.json.bak) package-lock.json
# ② productName 必须仍为 undefined
grep -c '"productName"' package.json          # 期望 0
# ③ name 未变
grep '"name"' package.json                    # 期望 kubejs-recipe-studio
```

**明令禁止（本轮硬性条件 1）**：不得加 `productName`；不得改 `package-lock.json` 中除版本外的任何字段；不得动 `src/main/envPaths.ts`/`paths.ts` 的 userData 路径逻辑；不得改 `electron-builder.yml` 的 `appId`。

> 说明：`npm version` 只改版本字段；但**必须用 diff 证明**其余零差异，而不是相信它的行为。

---

## 2. 安装隔离评估（核心）

### 2.1 三要素：机制与证据

| 要素 | 默认行为 | 能否用 `/D=` 隔离 | 源码/实测证据 |
| --- | --- | --- | --- |
| **文件安装目录** | `$LOCALAPPDATA\Programs\KubeJS Recipe Studio` | **✅ 能** | `templates/nsis/multiUser.nsh:37-41` 显式支持 `/D`（注释即 upstream issue #1551），且**在注册表与默认值之后**赋值，优先级最高 |
| **卸载注册表项** | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\`**`{GUID}`** | **❌ 不能** | `NsisTarget.js:147` `guid = UUID.v5(appInfo.id, ELECTRON_BUILDER_NS_UUID)` → **只由 `appId` 决定，与 version、productName、`/D` 全无关**；`NsisTarget.js:167` 拼出键路径 |
| **桌面快捷方式** | `$DESKTOP\`**`${SHORTCUT_NAME}.lnk`** | **❌ 不能** | `common.nsh:93`；名称来自 `nsis.shortcutName`（`NsisTarget.js:434`），当前 = `KubeJS Recipe Studio` |
| **开始菜单快捷方式** | `$SMPROGRAMS\`**`${SHORTCUT_NAME}.lnk`** | **❌ 不能** | `common.nsh:104/106` |
| userData | `%APPDATA%\kubejs-recipe-studio` | — | 由 `package.json.name` 决定（B-1 已证） |

### 2.2 实测现状（只读）

| 项 | 实测值 |
| --- | --- |
| 卸载注册表键 | `HKCU\...\Uninstall\`**`ead40464-49f1-54a5-bf84-970a4324381b`**（键名**不含版本号**） |
| 键内 `DisplayName` | `KubeJS Recipe Studio 0.1.0`（版本只出现在**值**里，不在**键名**里） |
| 键内 `InstallLocation` | **空** → 安装器**不会**从注册表读取上次安装路径，只认默认值或 `/D` |
| 桌面快捷方式 | `C:\Users\qituo\Desktop\KubeJS Recipe Studio.lnk`（2,579 B，06:14） |
| 开始菜单快捷方式 | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\KubeJS Recipe Studio.lnk`（2,587 B，06:14） |

### 2.3 判定

> **用默认配置装 0.1.1，即使 `/D` 指到别处：**
> - 文件名落到 `/D` 目录 ✅ 隔离；
> - **`HKCU\...\Uninstall\ead40464-…` 被 0.1.1 覆盖**（`DisplayVersion`、`UninstallString`、`DisplayIcon` 全部改指向新目录）❌；
> - **两个 `.lnk` 被覆盖并指向新目录** ❌。
>
> → **正式安装的卸载入口与快捷方式被改写**，不满足"不会覆盖或干扰正式安装"。**按第 4 条：停止，不执行覆盖安装。**

### 2.4 为什么"单独改 `/D` 再事后修注册表/快捷方式"不可取

- 属于"先破坏再修复"：修复脚本一旦漏项，正式安装会留下指向测试目录的快捷方式与卸载器；
- 卸载测试版时，NSIS 卸载器按 `UninstallString` 反向操作，可能连带删除正式安装的文件；
- 你第 4 条要求的是"**确认不会**覆盖或干扰"，不是"**可以恢复**"。

---

## 3. 三条可选路径（需你二选一）

| | **A. 就地升级 + 回滚** | **B. 隔离测试版** | C. 直接跑 `win-unpacked` |
| --- | --- | --- | --- |
| 做法 | 0.1.1 默认配置装到正式目录（真升级），测完用归档的 0.1.0 装回 | 构建时加 `nsis.guid` + `nsis.shortcutName`，安装 `/D=.cache\pack-13\install-011` | 不起安装器，直接运行 `dist-011/win-unpacked` |
| 是否**真实升级** | ✅ 是（同一身份覆盖） | ❌ 否（NSIS 视为另一个应用） | ❌ 否 |
| 是否影响正式安装 | ⚠️ **是**（测试期间正式安装变为 0.1.1） | ✅ **完全不影响** | ✅ 完全不影响 |
| 能否作为 `REL-PKG`「升级」证据 | ✅ 最强 | ⚠️ 只能证明"已安装的 0.1.1 读取 0.1.0 数据"，**不证明升级动作** | ❌ 会被判为"非已安装版本"（与 V7 那个错误同类） |
| 需额外授权 | 允许改动正式安装 | 允许改 `electron-builder.yml`（nsis.guid / shortcutName） | 允许运行未安装产物 |
| 风险 | 测试窗口内正式安装非常态；回滚依赖归档包 | 多一个独立安装 + 一条额外卸载项（需善后） | 结论不被采信 |

### 3.1 我的建议

- 若你坚持"**绝不碰正式安装**"（第 3/4 条的原文精神）→ **选 B**。
  它能验证 `REL-PKG` 真正的缺口——"0.1.1 读回 0.1.0 留下的 `uiState`（非默认值）"——且 0.1.1 确实是**安装版**。
  需要在台账里如实写成"0.1.1 全新安装读取 0.1.0 数据"，**不得**写成"跨版本升级"。
- 若你要求"**严格意义的升级安装**"→ **选 A**，并明确解除"不干扰正式安装"这条限制。
  回滚资源齐备：0.1.0 安装包 SHA `3C1BAD88…A01ECC`，已归档（见 §5 前置）。

**不建议 C**：它与已更正的那处 V7 错误是同一类问题。

---

## 4. 若选 B：具体隔离方案

### 4.1 构建配置（B-2 时才改，本轮未改）

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  shortcutName: KubeJS Recipe Studio Test      # ← 新增：快捷方式改名，不覆盖正式
  guid: 7f1c2b90-3a4d-5e6f-8a9b-0c1d2e3f4a5b # ← 新增：卸载项换键，不覆盖正式
```

- 两者都是**公开配置项**：`nsisOptions.d.ts:33`（`readonly guid?: string | null`）、`CommonWindowsInstallerConfiguration.d.ts:32`（`shortcutName`）；
- `appId`、`productName`、`package.json` **均不改** → userData 路径不变、应用身份不变；只改**安装身份**。

### 4.2 安装命令

```bash
"<dist-011>\KubeJS Recipe Studio Setup 0.1.1.exe" /S /D=E:\mc kjs\.cache\pack-13\install-011
# 注意：/D 必须是最后一个参数，且路径不加引号（NSIS 规则）
```

### 4.3 安装后必须核对"正式安装零影响"（4 条，任一不符即中止）

| # | 检查 | 期望 |
| --- | --- | --- |
| 1 | 正式安装目录 `%LOCALAPPDATA%\Programs\KubeJS Recipe Studio` | 74 文件、exe SHA 仍 `193E131D…66F28` |
| 2 | 正式卸载注册表键 `…\Uninstall\ead40464-49f1-54a5-bf84-970a4324381b` | `DisplayVersion` 仍 `0.1.0` |
| 3 | 桌面 / 开始菜单的 `KubeJS Recipe Studio.lnk` | 仍存在，且目标仍指向正式目录（B-2 时读 `.lnk` 目标） |
| 4 | 测试安装：目录 / 注册表 / 快捷方式 | 三项**都**出现在独立位置，与正式互不重叠 |

---

## 5. 风险清单（按你第 1/2 条补充）

### 5.1 克隆核对的字节口径警告（务必按逻辑字节比）

| 口径 | 值 | 说明 |
| --- | --- | --- |
| **逻辑总字节**（`find -type f -printf '%s'` 求和） | **379,370,049**（= **361.8 MiB**） | **唯一应使用的口径** |
| 磁盘已分配（`du -sm`） | **489 MB** | 因 90,535 个文件按簇分配，含 ~127 MB 簇内碎片 |

> 若拿 `du` 去比，会凭空多出约 127 MB 的"差异"，误判克隆失败。**必须用逻辑字节 379,370,049 比对。**
> 文件数 **90,535**、目录数 **34**（`icon-cache` 是 90,301 个文件摊在同一层，故目录数很小）。

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | `package.json` 误加 `productName` → userData 路径改变，表现为"数据全丢" | 变更后 `grep -c '"productName"' package.json` 必须为 0；升级前后比对 `app:runtime.userData` |
| R2 | `npm version` 顺带改动 lockfile 其他字段 | 变更前后 `diff`，只允许 3 处 version |
| R3 | **克隆时应用未完全退出** → 文件被占用/复制残缺 | 复制前 `tasklist` 必须为空；再等 2 s 复核一次 |
| R4 | 克隆不完整（90,535 文件 / 361.8 MiB） | 复制后核对：**文件数 90,535、目录数 34、逻辑总字节 379,370,049**；抽查 `uiState.json`/`Preferences`/哨兵/`meta.json` 四个哈希（见 §5.1） |
| R5 | 生产 userData 被误写 | 全程只读；复制前后各测一次生产三项哈希，必须一致 |
| R6 | 新构建覆盖 `dist/win-unpacked` | 已决策 D1：输出到 `dist-011/` |
| R7 | 0.1.0 安装包丢失 | 已决策 D2：先复制到 `.cache/pack-13/installers/` 并核对 SHA-256 |
| R8 | `uiState` 判定踩默认值陷阱 → 假通过 | 强制非默认值（`theme=light`、`sidebarWidth=380`） |
| R9 | 把 `meta.appVersion` 不更新当失败 | 你的第 6 条已明确：`cacheHit=true` 即可作缓存保留证据，**不要求** meta 更新 |

---

## 6. 验证步骤（A / B 通用，已按你第 5/6 条固化）

| # | 步骤 | 判据 |
| --- | --- | --- |
| 0 | 归档 0.1.0 安装包 → `.cache/pack-13/installers/`，核对 SHA-256 | = `3C1BAD88A9E14AE5E109FD702D90A74971FB11056FA2125037F934AC5AA01ECC` |
| 1 | 确认应用完全退出 | `tasklist` 为空（两次间隔 2 s） |
| 2 | 克隆生产 userData → `.cache/pack-13/ud-clone` | 文件数 **90,535**、目录数 **34**、逻辑总字节 **379,370,049**；4 个抽查哈希一致（详见 §5.1 的口径警告） |
| 3 | 生产目录复查（只读） | 三项哈希与克隆前一致 |
| 4 | 用 **0.1.0** + `STUDIO_USER_DATA=ud-clone` 启动，`ui:patch` 设 `theme=light`、`sidebarWidth=380`，优雅关闭 | 路径门禁：`app:runtime.userData` == ud-clone |
| 5 | 记录**升级前基线**：`uiState.json` 哈希 + **完整 JSON** + `Preferences`/`meta.json`/哨兵哈希 | JSON 内必含 `theme:"light"`、`sidebarWidth:380` |
| 6 | 安装 0.1.1（A：默认目录 / B：`/D` 独立目录） | 退出码 0 |
| 7 | **安装后、首次启动前**复算全部哈希 | 全部与步骤 5 一致 → 安装器对 userData 零写入 |
| 8 | 核对版本身份 | A：注册表 `DisplayVersion=0.1.1`、安装 exe `FileVersion=0.1.1`；B：测试安装目录内同样核对，且**正式**卸载项仍 `0.1.0` |
| 9 | 启动 0.1.1（`STUDIO_USER_DATA=ud-clone`） | `app:runtime.appVersion=0.1.1`，userData == ud-clone |
| 10 | **`ui:get` 语义比对** | `theme==="light"` ∧ `sidebarWidth===380` ∧ 窗口 bounds 与步骤 5 一致 → **uiState 保留成立** |
| 11 | 复算 `Preferences` / 哨兵 / `meta.json` | 全部一致 |
| 12 | （可选，B 类缓存证据）导入 pc5 基准包 + `modpack:scan{rebuild:false}` | **`cacheHit=true`** 即证明缓存保留且可用（**不要求** `meta.appVersion` 更新） |
| 13 | DOM 探测 + 截图 + 优雅关闭 | 三导航项、0 异常 |
| 14 | 收尾复查：生产 userData、正式安装 | 生产三项哈希不变；正式安装状态不变（A 方案除外，需按回滚计划处理） |

**关于 `uiState` 哈希**（你的第 5 条后半句，已固化）：启动后 `uiState.json` 会被应用重写，**哈希变化不作为失败判据**；只有步骤 7（安装后/启动前）那一次哈希是有效判据。

---

## 7. 是否具备进入构建阶段的条件

| 阶段 | 是否具备条件 | 说明 |
| --- | --- | --- |
| **B-2 版本变更** | ✅ **具备** | 单点 3 处，方案与校验已定（§1） |
| **B-2 构建 0.1.1 → `dist-011/`** | ✅ **具备** | NSIS + winCodeSign 已缓存，无需联网；需开发人员模式 |
| **B-2 产物身份核对** | ✅ **具备** | 判据已列（FileVersion / ProductName≠Electron / asar version / 图标 8-8 / SHA-256） |
| **B-3 升级安装验证** | ❌ **不具备** | **隔离方案未定**：默认配置必然覆盖正式安装的注册表项与快捷方式（§2.3）。需先在 A / B 中二选一 |

---

## 8. 需你授权的三件事

| # | 事项 | 选项 |
| --- | --- | --- |
| **G1** | 升级验证路径 | **A：就地升级 + 回滚**（真实升级，临时占用正式安装） ｜ **B：隔离测试版**（改 `nsis.guid`+`shortcutName`，完全不碰正式安装，但非"升级"） |
| **G2** | 若选 A：是否正式解除"不干扰正式安装"这条限制 | 需你明示；并确认"测试后重装 0.1.0 恢复"可接受 |
| **G3** | 是否先只授权 **B-2（构建 + 产物核对）**，把升级验证（B-3）留到 G1 定论后再批 | 推荐：**先构建、后决策安装方式**，两段互不阻塞 |

---

## 9. 自检

| 约束 | 是否符合 |
| --- | --- |
| 只允许改 `package.json.version`（本轮未改） | ✅ 三个文件 mtime 未变 |
| 未添加 `productName` / 未改 userData 路径逻辑 | ✅ 未改任何文件 |
| 未构建 / 未安装 / 未启动 / 未扫描 | ✅ `dist` 无 0.1.1 产物；无应用进程 |
| 未访问或修改生产 userData | ✅ 仅 `ls`/注册表只读 |
| 未清理历史证据 | ✅ 仅**新增** `.cache/pack-13/nsis-inspect/`（7z 解包的只读副本）与 `reg-uninstall.txt` |
| 未修改 V8 台账 | ✅ MD5 仍 `3dc2bf53d040374d0bd05119dea3874d` |
