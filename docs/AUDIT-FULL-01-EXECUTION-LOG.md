# AUDIT-FULL-01 · 执行日志

> **性质**：审计过程的可复现记录。按时间顺序记录本轮**每一次**实质动作、命令、观察结果与由该观察得出的结论。
> **只读声明**：本轮所有命令均为读取/统计；**未执行**构建、安装、卸载、启动、扫描、删除、移动、重命名、覆盖。
> **唯一写入**：`docs/AUDIT-FULL-01-*.md` 4 份 + `.cache/audit-full-01-versions.txt` 1 份采集文件。

---

## 阶段 0 · 基线核对

### 0.1 台账版本与仓库状态

**命令**
```bash
md5sum docs/PROJECT-SEALING-LEDGER-REPORT.md \
       docs/PROJECT-SEALING-LEDGER-REPORT.pre-v9-20261101-0802.md
wc -c docs/PROJECT-SEALING-LEDGER-REPORT.md
ls -d .git
```

**观察**
```
7a7e52d93a201da3d9fa0e4fa0b26f51  docs/PROJECT-SEALING-LEDGER-REPORT.md
3dc2bf53d040374d0bd05119dea3874d  docs/PROJECT-SEALING-LEDGER-REPORT.pre-v9-20261101-0802.md
90749 docs/PROJECT-SEALING-LEDGER-REPORT.md
not a git repo
```

**结论**
- 台账确为 **v9**，MD5 与本轮预期的 `7a7e52d9…` 一致 → **基准可信**。
- V8 备份 MD5 `3dc2bf53…` 与历史记录一致。
- **非 Git 仓库** → 不能用 `git diff` 判断改动，**必须以文件时间戳/哈希为依据**（与长期约定一致）。

### 0.2 docs 目录清点

**命令**：`ls -la docs/ | head -90` + `ls docs/ | wc -l`

**观察**：73 个条目（含 `plugins/` 子目录），`.md` 文件 **72** 个；关键文件齐全：
`PACK-01`…`PACK-19`（缺 `PACK-12` 之后的 `PACK-20`，符合实际）、
`PROJECT-SEALING-LEDGER-REPORT.md` + 8 个 `.pre-*` 备份、`PROJECT-FINAL-CLOSEOUT-REPORT.md`、`PROJECT-NEXT-SESSION-HANDOFF.md`。

**结论**：历史证据文件齐备，可用于交叉核验。**无同名 `AUDIT-FULL-01-*` 文件** → 四份新文档命名无冲突。

---

## 阶段 1 · 工程规模与结构实测

### 1.1 规模统计

**命令**
```bash
find src -name "*.ts" -o -name "*.tsx" | wc -l
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1
find tests -name "*.test.ts*" | wc -l
find tests -name "*.test.ts*" | xargs wc -l | tail -1
ls docs/*.md | wc -l
```

**观察**
```
src ts/tsx files: 177
src lines:   26447 total
tests lines:  10789 total
docs md: 72
```

### 1.2 测试文件按目录分布

**命令**：逐目录 `find | wc -l`

**观察**
```
algorithms: 4   codegen: 8    main: 12   modpack: 2   plugins: 5
recipes: 6      renderer: 10  scanner: 8 schema: 5    shared: 4
总测试文件: 64
```
**校验**：4+8+12+2+5+6+10+8+5+4 = **64** ✓

### 1.3 模块规模

**命令**：`find <dir> -maxdepth 1 \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l`

**观察**
```
src/main              14 files, 1363 lines    src/main/recipes   13 files, 2224 lines
src/main/scanner      12 files, 1925 lines    src/main/schema     8 files, 2073 lines
src/main/plugins       6 files, 1240 lines    src/main/codegen   12 files, 2273 lines
src/main/modpack       5 files,  822 lines    src/main/handlers  10 files,  491 lines
src/preload            2 files,   43 lines    src/renderer/src    3 files,  250 lines
src/renderer/src/views 5 files, 1658 lines    src/renderer/src/components 14 files, 1850 lines
src/renderer/src/store 5 files, 1293 lines    src/shared         18 files, 3212 lines
```

**未读全文的模块被识别**：`schema`(2,073)、`plugins`(1,240)、`renderer` 组件(约 8,700) → 记入剩余审计项 R1–R3。

---

## 阶段 2 · IPC 契约与注册完整性（结论：A）

### 2.1 契约 channel 数

**读取**：`src/shared/ipc.ts`（304 行，全文）

**观察**：`INVOKE_CHANNELS` 共 **34** 项，`as const satisfies readonly InvokeName[]` 提供编译期一致性保证；`InvokeMap` 逐项定义 req/res；`StudioEvent` 5 种事件；`StudioBridge` 仅 3 个成员。

### 2.2 逐 channel 注册检索

**命令**
```bash
for c in app:runtime ... logs:export; do
  n=$(grep -rhoF "'$c'" src/main/ | wc -l); echo "$c -> $n"
done
```

**观察**：**34 个 channel 全部 `-> 1`**（各命中 1 次）。

**结论**：`UI-U1`「IPC 未接线」的修复是**真实的**——不是只改了注册表而漏了 handler，而是 34/34 全接线。**证据状态 A。**

### 2.3 注册点确认

**读取**：`src/main/handlers/index.ts`（26 行）

**观察**：`registerHandlers()` 依次调用 9 组：`App / Icon / Modpack / Recipe / Scan / Items / Schema / Codegen / Plugin`，含注释「P0：此前遗漏的三组（codegen / plugins / schema）」。

### 2.4 运行时反向验证（关键）

**命令**
```bash
grep -rn "通道尚未接线" .cache --include=*.log   # 首次在 .cache 全量检索触发 SIGTERM（目录过大）
tail -25 .cache/pack-15/e1-launch.log
```

**观察（历史日志）**：`.cache/pack-13/ud-clone/logs/studio-2026-10-31.log` 中存在大量
`WARN IO 通道尚未接线：codegen:preview`（2026-10-30 至 10-31，即 **P0 修复前**）。

**观察（当前构建）**：`grep` 于 `studio-2026-11-01.log` → **0 命中**。

**结论（重要）**：**「未接线」是已修复的历史状态，不是当前缺陷**。这一条纠正了本会话早期工作记忆中的陈旧判断（「未接线 IPC 属既有缺口」）。**证据状态 A（源码）+ A（当前运行日志）。**

### 2.5 当前构建的告警分布

**命令**：对 `studio-2026-11-01.log` 提取 `WARN|ERROR` 并归一化去重

**观察**
```
3  WARN  SCHEMA  1 个配方类型无法添加（逐个给出依据与替代方案）
2  ERROR IO     IPC recipes:commit 失败：无法读取当前原始配方：源文件已失效…（raw-missing）
1  WARN  INDEX   占位图比例 10.83% 超过 5%…
1  ERROR IO     IPC recipes:commit 失败：原始配方已变化（基线 fcab0b7c…，当前 befa2dbd…）
1  ERROR IO     IPC recipes:commit 失败：原始配方已变化（基线 e6ee9ca1…，当前 7bb91a5f…）
1  ERROR IO     IPC recipes:commit 失败：原始配方已变化（基线 c3ac0db8…，当前 fcab0b7c…）
1  ERROR IO     IPC recipes:commit 失败：写入失败（…module_acid_rain_proof_unit.json）：EPERM
```

**结论（额外收获）**：`CONFLICT`（含双哈希）、`EPERM`、`raw-missing` 三条错误路径**有真实运行时记录** → §4.4 的证据升级为 **A**。

---

## 阶段 3 · 源码审计

### 3.1 读取清单（全文）

| 文件 | 行数 | 关键结论 |
| --- | --- | --- |
| `src/main/recipes/commitRecipe.ts` | 511 | 七步链 + 21 错误码 + 回滚 + 写后校验（**A**） |
| `src/main/recipes/backup.ts` | 107 | `wx` 独占创建，**永不覆盖**已有备份；tmp+rename；失败清半成品 |
| `src/shared/draftApply.ts` | 158 | 只写 dirtyFields；`preserveHiddenRefFields`；`cellMatches` 避免无谓重写 |
| `src/shared/normalize.ts`（关键函数） | — | `denormalizeRecipe` 以 `raw` 为基底 → **未知字段结构性保留**；`toJsonValue` 写回 `unknowns`；`collectUnknownFields` 有深度/8KB 限制 |
| `src/main/navigation.ts` | 100 | `url.host !== ''` 拒 UNC；`fileURLToPath` + `path.relative`；缓存 `contents` + `isDestroyed()` |
| `src/main/envPaths.ts` | 83 | 优先级 env > cli > dev(`-dev`) > prod；**`mkdirSync` 无 try/catch** → 确认 `P2-MKDIR` |
| `src/main/index.ts` | 105 | `applyUserDataDir` 在单实例锁**之前**；`before-quit` 取消扫描 |
| `src/main/singleInstance.ts` | 33 | 单实例锁 → `C7-F5` 的静态依据 |
| `src/main/window.ts` | 84 | `contextIsolation:true` / `nodeIntegration:false` / **`sandbox:false`**；守卫在 `'close'` 释放（→ `P2-CLOSEGUARD`） |
| `src/main/ipcRegistry.ts` | 80 | 未注册 → WARN + `{ok:false}`；**无 senderFrame 校验**（→ N-04） |
| `src/preload/index.ts` | 33 | 仅暴露 `invoke`/`onEvent`/`iconUrl` |
| `src/main/handlers/codegenHandlers.ts` | 134 | `req.alternateDir` 直通写盘（→ N-01） |
| `src/main/codegen/writer.ts` | 120–250 | `backupExisting` 用 `rename` 移走原文件；`writeOne` = `mkdir`+`writeFile` 无 tmp/无回滚（→ N-02） |
| `src/main/scanner/jarPoolCore.ts` | 55–190 | `!workerAvailable → runInline`；`new Worker` 无 try/catch；`finish()` 固定 `usedWorkers:true` |
| `src/main/cache.ts` | 183 | 7 项失效判据；**`appVersion` 不参与比对**；`writeJson` 无 `fsync`（→ N-06） |
| `src/main/uiStateStore.ts`（部分） | — | `DEFAULT_UI_STATE`（`graphite`/320）；`writeFileSync` 非原子（→ N-05）；加载侧 `clamp`+`normalizeTheme` 兜底 |
| `src/shared/ipc.ts` | 304 | 34 channel 契约 |

### 3.2 两套写盘标准的发现过程

**触发**：在核对 `codegen:write` 时，把 `writer.ts` 的覆盖写路径与 `commitRecipe.ts` 的写路径做对比。

**观察（原文摘录）**
```ts
// writer.ts:149-159
async function backupExisting(file: string, root: string): Promise<string> {
  const target = join(dirname(file), BACKUP_DIR, `${basename(file)}.${fileStamp(Date.now())}`)
  try {
    await mkdir(dirname(target), { recursive: true })
    await rename(file, target)          // ← 原文件被"移动"，不是复制
  } catch (err) { throw describeWriteFailure(err, target) }
  ...
}

// writer.ts:136-146
async function writeOne(path: string, content: string, root: string): Promise<number> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')   // ← 无 tmp、无 fsync
  } catch (err) { throw describeWriteFailure(err, path) }
  ...
}

// writer.ts:171 / 234
const root = opts.alternateDir ?? (opts.modpack?.path ?? '')   // ← 无 inside() 校验
```

**推导**：`backupExisting` 成功 → 原文件已移走；`writeOne` 失败 → 抛出，**不回滚** → 原位置为空。
**交叉验证**：`tests/codegen/writer.test.ts` 的 16 个用例名逐条核对，**无「备份成功后写入失败」用例**。

**结论**：N-02 成立（**P2**）；N-01 成立（**P2**）。两者均**未在台账登记**（台账仅记「`codegen` 未做 handler 级 E2E，由 `P0-R1` 覆盖」，不含这两项）。

---

## 阶段 4 · 测试体系审计

### 4.1 跳过与弱断言统计

**命令**
```bash
grep -rn "toHaveBeenCalled()$|toBeDefined()|toBeTruthy()|expect(true)" tests/ | wc -l   # 29
grep -rc "toBeDefined()|toBeTruthy()" tests/ | grep -v ":0"
```

**观察**：弱断言 **29** 处（分布 8 个文件各 1 处）；`expect` 总数 **2,040** → 占比 **1.4%**。
**条件跳过**：`describe.skipIf` **6** 处（`RUN_REAL_PACK=1` × 2；本机路径 `existsSync` × 2；`generate === null` × 1；另 1 处同族）。
**无条件跳过**：**0**。

### 4.2 `handlersWiring.test.ts` 全文阅读（145 行）

**观察**：6 个用例，**真实临时目录**（仅 mock `electron`），覆盖 `scripts:list` 字典序/顺序号/字节数、`scripts:rename` 成功 + 原文件消失 + 路径穿越拒绝 + 目标不存在、`plugins:list` 空数组、`plugins:setEnabled` 两种非法入参。
**结论**：P0 修复有**真实 handler 级测试**（**A**）。

### 4.3 `writer.test.ts` 用例名逐条核对

**命令**：`grep -n "it(\|describe(" tests/codegen/writer.test.ts`

**观察**：16 个用例（模式 A 写盘 8、模式 B 写盘 2、错误映射与插入定位 6）。**无「备份后写入失败」**。

### 4.4 「603 vs 621」口径

**观察**：静态声明 603；历史通过 621；差异来自 `it.each`（如 `tests/plugins/loader.test.ts:290`）。
**结论**：**不矛盾，是不同口径**。本轮**未运行测试套件**（规则禁止）→ 621 只能是 **B**。

---

## 阶段 5 · 台账一致性审计

### 5.1 计数复算（逐条枚举）

**读取**：V9 §1、§1.1、§4、§3.1–§3.7

**观察（枚举结果）**

| 分类 | 条件 ID | 数量 |
| --- | --- | --- |
| 已解决 | `C7-F5` `UI-U1` `P1-DEVPROD` `P1-C4` `REL-PKG` | 5 |
| 部分解决 | `C7-F3` `P1-GUARD` | 2 |
| 待验证 | `P2-DUALFORM` | 1 |
| 未解决 | C7 `F1/F2/F4/F6/F7`(5) + OPT4 `R2/R3/R4/R6/R7/R8`(6) + UI `U2/U3/U4/U5`(4) + P0(7) + P1 `FD`(1) + P2(9) | 32 |
| **合计** | — | **40** |

**两条校验式**：`5+2+1+32=40` ✓ ；`7+6+5+7+4+10+1=40` ✓
**分模块交叉校验**：C7 7 / OPT4 6(+1 非条件) / UI 5 / P0 7 / P1 4 / P2 10 / REL-PKG 1 —— **全部与 §4 矩阵一致**。

**结论**：**台账计数 100% 自洽，本轮未发现计数矛盾。** 这是对台账的正面结论。

### 5.2 C1–C8 逐项原文核对

#### C1

**命令**：`sed -n '440,480p' docs/PROJECT-SEALING-LEDGER-REPORT.md`
**原文**：§3.7-A A.5 末尾 → 「…`REL-PKG` **仍因「`uiState` 保留」未验证而维持「未验证」+「硬性发布阻塞」**。」
**对照**：§3.7 第 305 行 `REL-PKG | … | **已关闭（2026-11-01 v9）**`。
**判定**：**真实矛盾（时效性）** —— P2，不影响计数/判定。

#### C2 / C3

**命令**：`sed -n '301,358p' …`
**原文**：调整记录末行「**跨版本升级、配置迁移、数据格式迁移、版本兼容性**——四项**均未验证**」；表标题「（v7 新增，须与结论连体引用）」。
**判定**：C2 **真实陈旧**（1/4 项失效，P2）；C3 **表述遗留**（P3）。

#### C4 / C5

**命令**：`sed -n '643,700p' …`
**原文**
- §10.2 行 1：「…**从未执行**。B3 的通过基于**同版本覆盖安装**，**不是**跨版本升级」
- §10.2 行 4：「…**降级、回滚**均未测」
- §10.2 行 7：「**`uiState` 内容保留** | 未验证——**单独登记于 §11**」
- §10.3 bullet 1：「**不得**将本次验收描述为「跨版本升级测试」…」
**对照**：§10.1 行 4「跨版本升级 + `uiState` 保留（v9 新增）| ✅ **已验证**」；§11 标题「…→ **v9 关闭**」；§3.7-B B.4 回滚行「…由『未实测』转为『实测通过』」。
**判定**：C4 **真实矛盾（3 行全部失效）**、C5 **自我否定** → 均 **P1**。

#### C6

**命令**：`grep -n "32,89\|D-2\|失败" docs/PACK-07-REL-PKG-D-REPORT.md` / `docs/PACK-09-D2-RERUN-REPORT.md`
**原文**
- `PACK-07` 第 16 行：`**D-2 五项计数** | ❌ **不通过**：4 项一致，**recipes = 32,891 ≠ 32,890（差 1）**`；第 18 行 `**D 类整体** | **不通过**`；第 153 行 `判定：D-2 不通过`
- `PACK-09` 第 7 行：`结论：**D-2 通过……含 recipes = 32,890。**`
**对照 V9**：§3.7 D 类表「D-2 ✅——依据 `PACK-09`」→ **引用正确**；§3.7-B「B·核心扫描」行与 §10.1 第 3 行 → **并列引用 `PACK-07`/`PACK-09`** 作为「一致」证据 → **引用不当**。
**判定**：**真实引用精度缺陷** → P2。

#### C7

**对照**：§3.7 D-2 处「`cacheHit=false`」（PACK-09 那次扫描）vs §3.7-B 观察项「`cacheHit` 运行时值**未测量**」（升级场景）。
**判定**：**真实歧义风险，非矛盾** → P2。

#### C8

**命令**
```bash
node -e "console.log(require('./package.json').version)"
ls dist/ dist-011/
# PowerShell 读 VersionInfo（结果写文件后读取）
```
**观察**
```
source version = 0.1.1
installed FileVersion=0.1.0 ProductVersion=0.1.0.0 ProductName=KubeJS Recipe Studio
dist010   FileVersion=0.1.0 ProductVersion=0.1.0.0
dist011   FileVersion=0.1.1 ProductVersion=0.1.1.0
```
**台账检索**：`grep -n "源码\|工作树\|版本不一致"` → **0 命中**。
**判定**：**真实记录缺失** → P1。

---

## 阶段 6 · 构建与产物核查

### 6.1 配置读取

**读取**：`electron-builder.yml`(37 行)、`package.json`(49 行)
**观察**：`appId=com.kubejs.recipestudio`；`productName=KubeJS Recipe Studio`（`package.json` 中**无** `productName`）；`directories.output=dist`；`nsis.oneClick:false / perMachine:false / allowToChangeInstallationDirectory:true / createDesktopShortcut:true / shortcutName`；**无签名配置**。

### 6.2 产物与版本

见阶段 5.2 C8 观察。**额外观察**：`dist/` 含 `Setup 0.1.0.exe`，`dist-011/` 含 `Setup 0.1.1.exe`，两者 `.blockmap` 与 `builder-debug.yml` 均在。

### 6.3 PowerShell stdout 不回显的应对

**现象**：`PowerShell` 工具返回 `exit code 0` 但**无 stdout**（与本机长期记录一致）。
**处理**：改用 `Set-Content` 写 `.cache/audit-full-01-versions.txt`，再用 `Read` 读取 → 成功获取三方版本。
**注意**：从 Bash 调用 PowerShell 被安全策略拒绝（`Invoking PowerShell from Bash bypasses PowerShell security checks`）→ 改用独立 PowerShell 工具。

### 6.4 E1 日志实读

**命令**：`tail -25 .cache/pack-15/e1-launch.log`
**观察**：4 个 IPC 通道全 `ok`；`ui:get` 返回 `theme=light`/`sidebarWidth=380`/bounds `270/85/1440/900`；DOM 3 导航项、`hasBridge:true`、`bridgeKeys:invoke,onEvent,iconUrl`、`toasts:0`；异常 **0**；截图 56,565 B；`Browser.close` 优雅关闭；`结论: E1 通过`。
**结论**：E1 为 **A**（原始观测文件本轮直接读取），但**未重跑**。

---

## 阶段 7 · 缓存与性能

### 7.1 `cache.ts` 全文阅读

**观察**：`CACHE_SCHEMA_VERSION=2`、`PARSER_VERSION=1`；`isCacheValid` 七项判据；**`meta.appVersion` 字段存在但未被任何判据使用**；`computeModsSignature` 逐 jar `statSync`；`writeJson` 用 tmp+rename，**无 `fsync`**。

**关键推论（明确标注为静态）**：0.1.0 建好的缓存在 0.1.1 下**按代码逻辑应当命中**。这与 `PACK-18`「升级前后 `items.json`/`recipes.json`/`meta.json` SHA 未变」**相容**，但 `cacheHit` 的**运行时值未测量**，**不得**由该推论改写。

### 7.2 图标写入

**命令**：`grep -n "writeFile|Promise.all|batch|queue" src/main/scanner/iconWriter.ts`
**观察**：队列 + `concurrency` + `fsp.writeFile(job.target, job.bytes, { flag: 'wx' })` → **幂等**（永不覆盖已存在图标）+ **有界并发**。

### 7.3 Worker 池

**观察**：`if (!opts.workerAvailable) return runInline(...)`；`new Worker` **无 try/catch**；`finish()` 固定 `usedWorkers:true`（**无外部观测出口**）。
**结论**：与台账 §3.7 D-1 的「三段实测链推导」声明**一致**，本轮**认可该声明**，同时指出这是证据链固有弱点。

---

## 阶段 8 · UI / 冲突处理 / 主题

### 8.1 冲突 UI 三条路径

**命令**：`grep -rn "重新载入|保留我的修改|另存为副本|原始配方已变化|脏字段" src/renderer/src/views/bench/`
**观察**：`PilotDraftPanel.tsx` 第 62 行 `脏字段 {dirty}`；第 96 行 `<strong>原始配方已变化</strong>`；第 105/110 行「重新载入」；第 115/120 行「保留我的修改」；第 125/130 行「另存为副本」。
**结论**：与 P-C7 契约一致（**A** 存在性）。

### 8.2 `WriteDialog` 的 `alternateDir` 来源

**读取**：`WriteDialog.tsx` 60–99 行
**观察**：`submit(alternateDir: string | null)` → `callRaw('codegen:write', { …, alternateDir })`，**渲染层直接决定该值**。
**结论**：支撑 N-01（主进程未校验来源）。

### 8.3 主题与默认值

**命令**：`grep -n "graphite|light|midnight|oled" src/shared/theme.ts`；读取 `uiStateStore.ts` 头部
**观察**：`THEME_IDS = ['graphite','light','midnight','oled']`；`DEFAULT_THEME='graphite'`；旧 `dark` → `graphite`；`DEFAULT_UI_STATE` 用 `SIDEBAR_DEFAULT_WIDTH` 等常量；加载侧 `clamp(...)` + `normalizeTheme` 逐字段兜底。
**结论**：默认 `graphite`/320 使 `PACK-17` 写入的 `light`/380 成为**可区分的非默认值** → `uiState` 验证方法论成立（**A**）。同时确认 `writeFileSync` 非原子 → N-05。

---

## 阶段 9 · 交付文件生成

### 9.1 命名冲突检查

**命令**
```bash
for f in AUDIT-FULL-01-ENGINEERING-AUDIT.md AUDIT-FULL-01-EVIDENCE-MATRIX.md \
         AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.md AUDIT-FULL-01-EXECUTION-LOG.md; do
  [ -e "docs/$f" ] && echo "EXISTS: $f" || echo "FREE: $f"
done
```
**观察**：`FREE` × 4 → **无同名文件，无需时间戳后缀**。

### 9.2 写入清单

| 文件 | 说明 |
| --- | --- |
| `docs/AUDIT-FULL-01-ENGINEERING-AUDIT.md` | 主报告（13 节） |
| `docs/AUDIT-FULL-01-EVIDENCE-MATRIX.md` | 40 条件 + 26 结论证据矩阵 |
| `docs/AUDIT-FULL-01-DEFECTS-AND-REMAINING-WORK.md` | 缺陷 + 遗留 + 待决策 + 发布前清单 |
| `docs/AUDIT-FULL-01-EXECUTION-LOG.md` | 本文件 |
| `.cache/audit-full-01-versions.txt` | 三方版本采集（唯一 `.cache` 新增，未删改任何既有内容） |

---

## 附录 A · 本轮未执行的操作（明确声明）

| 操作 | 状态 |
| --- | --- |
| `npm run build` / `npm run dist:win` / `electron-builder` | **未执行** |
| 安装 / 卸载 / 回滚安装包 | **未执行** |
| 启动应用（含 `--disable-gpu*` 参数组合） | **未执行** |
| 模组扫描 / 导入整合包 | **未执行** |
| `npm test` / `vitest run` | **未执行** |
| `npm run typecheck` / `npm run lint` | **未执行**（会写 `.tsbuildinfo` 类产物；且非审计必需） |
| 删除 / 移动 / 重命名 / 覆盖任何文件 | **未执行** |
| 清理 `.cache` / 隔离区 / npm 缓存 | **未执行** |
| 修改源码 / 配置 / 测试 / 台账 / 历史报告 | **未执行** |
| 修改生产 userData / 注册表 / 快捷方式 / 环境变量 | **未执行** |
| 访问网络 | **未执行** |

---

## 附录 B · 本轮遇到的环境问题与处理

| 问题 | 现象 | 处理 |
| --- | --- | --- |
| `grep -rn` 扫 `.cache` 被 SIGTERM 终止 | 命令返回 `Signal: SIGTERM`（目录太大/触及限制） | 改为只读单个日志文件（`Grep` 工具 / `tail`），不做全量递归 |
| PowerShell stdout 不回显 | 返回 `exit code 0` 但无输出（与长期记录一致） | `Set-Content` 写文件 → `Read` 读取 |
| Bash 调 PowerShell 被拒 | `Invoking PowerShell from Bash bypasses PowerShell security checks` | 改用独立 PowerShell 工具 |
| `node -e` 内联正则含反斜杠 | 历史同类问题（`Invalid regular expression flags`） | 本轮未再使用内联正则，改用 `grep -F` |

---

## 附录 C · 结论汇总（供快速核对）

| 项 | 结论 | 证据状态 |
| --- | --- | --- |
| 台账计数 40/5/2/1/32 | **完全自洽** | A |
| IPC 34 channel 全接线 | **是** | A（源码 + 当前日志 0 WARN） |
| `recipes:commit` 完整性 | **优秀**（七步链 + 21 码 + 回滚） | A |
| 未知字段保留 | **结构性**（非测试兜底） | A |
| `codegen:write` 完整性 | **弱于提交路径** | A（N-01/N-02） |
| 冲突/EPERM/raw-missing 路径 | **有真实运行记录** | A |
| 测试体系 | 良好；6 处条件跳过使子集不可复现 | C（静态统计 A，套件未运行） |
| 构建/安装/升级/回滚 | 均有实测 | B |
| E1 回滚后启动 | 通过 | A（读原始日志） |
| 台账 §10 / §3.7-A / 调整表 | **5 处陈旧表述** | A（C1/C2/C4/C5） |
| 版本一致性 | **四方不一致且未记录** | A（N-03） |
| `cacheHit` | **未测量** | D（明确不得推断） |
| **审计总体状态** | **全工程审计未完成**（见主报告 §12.3–§12.4） | — |

---

**日志结束。**
