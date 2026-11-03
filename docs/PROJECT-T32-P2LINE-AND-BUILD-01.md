# 第 32 批 · P2 收尾代码线 + 重建（T-13.3 未执行）

| 项 | 内容 |
|---|---|
| **任务** | P2 收尾五件 → 重建 → T-13.3 大巡检 |
| **授权** | A2（产品文件）+ A5 限定（`npm run build`）+ A4 + A1 |
| **执行时点** | 2026-11-02 07:58–08:05 GMT+8 |
| **实际交付** | **P2 四件实现 + 一件降级登记 ｜ 重建完成 ｜ 门禁全绿 ｜ 回滚实测完成** |
| **未交付** | **T-13.3（RT-01～RT-10 大巡检）未执行** —— 见 §4，原因如实说明 |

---

## 1. P2 收尾五件

| # | 件 | 状态 | 改动文件 | 具体改动 |
|---|---|---|---|---|
| 1 | **D-12** 语料重建日志 | **已实现** | `src/main/scanner/itemIndex.ts` | `getCorpus()` 的版本失配分支由静默重建改为记录 `logger.debug('INDEX', '搜索语料已重建：虚拟通配版本 X → Y，语料条目 N')`；**只在真重建时打**，正常命中不产生日志（避免高频查询刷屏） |
| 2 | **OPT4-R8** yauzl 文案 | **已实现** | `src/main/scanner/zip.ts` | `open()` 的失败分支由 `reject(err)` 改为包一层可读前缀：`无法读取 jar（可能损坏或不是 zip）：<path> —— <原始错误>`；**保留原文**，不吞诊断细节 |
| 3 | **OPT4-R4** 取消完全回滚 | **降级：设计意图登记** | 无代码 | 见 §1.1 |
| 4 | **P0-R3** 覆盖度语义 | **已实现** | `src/renderer/src/views/SettingsView.tsx` | `renderCoverage()` 增加两行口径说明：① 百分比分母是「配方类型**种数**」而非配方条数；② 「仅通用模式可编辑」≠「不能编辑」 |
| 5 | **C7-F7** 另存副本命名 | **已实现** | `src/renderer/src/store/benchStore.ts` | `resolveConflictSaveCopy()` 的 uid 由 `copy:<uid>#<Date.now()>`（13 位毫秒串）改为 `copy:<uid>#<YYYYMMDD-HHmmss>-<rand4>`，可读且同秒不撞名 |

### 1.1 OPT4-R4 降级说明（按授权条款）

**降级依据**：探索后确认「取消」不是单点，而是横跨三个子系统、**没有统一事务边界**：

| 子系统 | 取消点 | 残留物 |
|---|---|---|
| 扫描编排 | `scanOrchestrator.cancelScan()` → `cancelTask('scan')` | 部分索引（内存）+ 未提交的缓存 |
| jar 并发池 | `jarPoolCore.ts` `POOL_CANCELED`（AbortSignal 终止 worker） | 在途 jar 的已解析条目 |
| 图标写入 | `iconWriter.ts`「取消后不再写入排队任务，已开始的写入任其完成」 | 已写出的图标文件 |

要做到「什么都不留（完全回滚）」，必须**额外引入产物清单 + 回滚事务**（记录本次扫描写出的每个文件，取消时逐一撤销），跨 3 个子系统改动，显著超出本批 P2 小改的尺度。按任务书「若实现规模超出预期 → 降级为设计意图登记，不得阻塞 3.2/3.3」处理。

**设计意图登记**：取消 = **完全回滚**（不保留任何半成品：不写缓存、不留部分索引、已写图标一并撤销）。实现前置：需先定义「本次扫描产物清单」的生命周期；建议单独立项（含失败路径与并发取消）。

---

## 2. 重建（A5 限定）

```
npm run build   →  BUILD=0   （170 modules，built in 1.19s）
```

| 项 | 值 |
|---|---|
| `out/main/index.js` SHA-256 | **`00c26748aaef5f1bda9a6dbeeb957096f3c2493ea87ed19a87503e8cc6ef0333`** |
| 产物时点 | 2026-11-02 07:59 |

**特征 grep（重建有效性）**：

| 特征 | 位置 | 计数 |
|---|---|---|
| `getPluginLoadStatus`（FIX-02） | `out/main/index.js` | **3** |
| `loadFailure`（FIX-02/03） | 同上 | **5** |
| `搜索语料已重建`（**D-12**） | 同上 | **1** |
| `可能损坏`（**OPT4-R8**） | `out/main/chunks/zip-iuTePgzf.js` | **1** |
| `口径说明`（**P0-R3**） | `out/renderer/assets/index-CjPHi10F.js` | 存在 |
| `copy:` 命名（**C7-F7**） | `out/renderer/assets/*.js` | 存在 |

> **注**：R8 的代码被 electron-vite 拆进独立 chunk `chunks/zip-*.js`，只在 `index.js` 里 grep 会得到 0——这是**分包**而非未生效（已按 chunk 复核）。

---

## 3. 门禁

| 项 | 结果 |
|---|---|
| `vitest run` | **93 文件（91 passed / 2 skipped）／824 用例（817 passed / 4 skipped / 3 todo）／0 失败** |
| `typecheck` | exit **0** |
| `lint --max-warnings=0` | exit **0** |

**既有 824 用例 0 失败**（`copy:` 前缀契约未变，`benchStorePilot.test.ts:283` 的 `startsWith('copy:')` 仍成立）。

> **本批未新增用例**：五件中 D-12（日志）、OPT4-R8（错误分支）、P0-R3（纯文案）**均无可测接缝**（函数未导出、无注入点，新增导出会扩大公开面）；C7-F7 的 `copy:` 前缀契约由既有用例覆盖、格式变化属展示层。**如实登记，不假装有测试证据。**

---

## 4. T-13.3 大巡检 —— **未执行**

**如实说明**：本批代码线与重建已消耗全部执行预算；T-13.3 需 **10 项真实环境巡检**（启动/扫描/切包/构造故障态，每项要落原始输出与四态），无法在保证证据质量的前提下并入本轮完成。

**现有可复用成果（下一包可直接引用，不必重跑）**：

| RT | 已有证据 | 出处 |
|---|---|---|
| RT-01 / RT-05 S2 | FIX-01/02/03 全部「通过」（步骤 0 跟随性、A4→B3、N=3 可解释、ENOTDIR 保留层、3 次重建无戳） | `PROJECT-T13-PHASE2-01.md`（`6af7f691…`） |
| RT-08 | 基线：全量索引 **39.2 s**（43,474 物品 / 32,891 配方），D-13=C 相对口径可用 | `PROJECT-T13-PHASE1-01.md` §2 |
| RT-09 步骤 3 | D-15=A 已定：落「已知限制」，其余步骤正常执行 | 决策台账 |

**环境已就绪（无需重建）**：`t13-pack`（A，含差异源 `t13probe.json`）、`t13-pack-b`（B，无 `.recipe-studio`）、`t13-ud`（隔离 userData）。

**下一包建议命令骨架**（与首包相同，可直接复用）：

```
启动：PS 工具 Start-Process -PassThru，参数
      . --no-sandbox --disable-gpu-sandbox --disable-gpu --disable-gpu-compositing
      --in-process-gpu --remote-debugging-port=9333
      环境：移除 ELECTRON_RUN_AS_NODE / NODE_OPTIONS，STUDIO_USER_DATA=E:\mc kjs\.cache\t13-ud
驱动：node .cache/fix14/a3tmp/t13/cdp.mjs invoke|eval "<channel|expr>"
```

---

## 5. 回滚实测（D-12，双向，真实信号）

| 方向 | 操作 | 信号 | 结果 |
|---|---|---|---|
| **A 回退** | 还原 `itemIndex.ts` 改前版 → `npm run build` | `grep -c '搜索语料已重建' out/main/index.js` | **0**（BUILD=0） |
| **B 复原** | 覆盖回改动版 → `npm run build` | 同上 | **1**（BUILD=0），产物哈希回到 `00c26748…`（确定性可复现） |

---

## 6. 保护边界核验

| 对象 | 结果 |
|---|---|
| **生产 userData** | `kubejs-recipe-studio` `2026-11-01 23:45:36.598074800`、`-dev` `2026-11-01 05:23:32.034775200` —— **与基线逐纳秒一致** |
| **V9** | MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51` 未变 |
| **DECISIONS / V1.2 / package.json** | `1ddfb2dd…` / `aeb6e85b…` / `4e0c261a…` 未变 |
| **drill / rehearsal** | `ea2b196b…` / `6c34dd91…` 未变 |
| **pc7 原件** | 本批未触碰（未启动应用、未导入原件） |
| **进程** | 本批**未启动应用**，无 electron 残留；QQ-agent 6 个未动 |
| **`src` 改动面** | 本批 **4 个**：`scanner/itemIndex.ts`、`scanner/zip.ts`、`renderer/src/store/benchStore.ts`、`renderer/src/views/SettingsView.tsx`（相对 master 累计 11 个，其余 7 个属第 30/31 批） |
| **备份** | `.cache/fix14/a3tmp/b32-pre/`（4 份，均在 `src/` 之外） |

> **一处流程偏离（如实披露）**：`benchStore.ts` 我**先改后备份**。事后用 `.cache/fix14/master` 快照 `diff` 验证「差异仅本批这一处」，确认该版本即改前内容，补作备份（`60dafa35…`）。行为正确但顺序违例，登记备查。

---

## 7. 状态声明

| 项 | 状态 |
|---|---|
| D-12 / OPT4-R8 / P0-R3 / C7-F7 | **已实现 → 待验收** |
| OPT4-R4 | **已登记（设计意图：完全回滚）→ 待立项** |
| 重建 | **已完成**（`00c26748…`） |
| 门禁 | **通过**（824/0、TS 0、lint 0） |
| **T-13.3** | **未执行 → 需独立任务包** |
| T-08 本体 / T-13.4 | 未含（写盘标准未答 / 待下一包） |

本报告不构成 T-13.3 授权、不构成 NSIS 打包授权、不构成 P2 排期变化。
