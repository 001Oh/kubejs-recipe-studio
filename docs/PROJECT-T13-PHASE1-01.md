# T-13.1 隔离核实 + T-13.2 FIX 真实验证（P4 首包）

| 项 | 内容 |
|---|---|
| **任务** | T-13.1 隔离前置核实 → T-13.2 FIX-01/02/03 ③ 层真实验证 |
| **授权** | **A4**（首次授权启动应用）＋ A1（本文档） |
| **执行时点** | 2026-11-02 07:33–07:37 GMT+8 |
| **隔离路径（申报）** | **`E:\mc kjs\.cache\t13-ud`** |
| **副本路径（申报）** | **`E:\mc kjs\.cache\t13-pack`**（源自 `.cache/pc7-pack-1112`，1659 文件） |
| **结果** | **T-13.1 通过（3/3）** ｜ **T-13.2 无法执行**（根因见 §3） |

---

## 1. 启动命令全文（可复核）

### 1.1 环境变量处理

| 变量 | 处理 |
|---|---|
| `ELECTRON_RUN_AS_NODE` | **移除**（实测 shell 内为 `1`，不清除会让 Electron 以纯 Node 启动） |
| `NODE_OPTIONS` | **移除**（实测为 `--require="E:/work Buddy/.../node-language-shim.cjs"`） |
| `STUDIO_USER_DATA` | **设为** `E:\mc kjs\.cache\t13-ud`（`envPaths.ts` 最高优先级） |

### 1.2 最终生效的启动方式（PowerShell `Start-Process`）

```powershell
Set-Location "E:\mc kjs"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:NODE_OPTIONS        -ErrorAction SilentlyContinue
$env:STUDIO_USER_DATA = "E:\mc kjs\.cache\t13-ud"
Start-Process -FilePath "E:\mc kjs\node_modules\electron\dist\electron.exe" `
  -ArgumentList ".","--no-sandbox","--disable-gpu-sandbox","--disable-gpu","--disable-gpu-compositing","--in-process-gpu","--remote-debugging-port=9333" `
  -WorkingDirectory "E:\mc kjs" -PassThru
```

**为什么不是 Bash 直接调用**：Electron 是 Windows GUI 子系统程序，经 MSYS Bash（含 `cmd /c start /b`）启动时会被立即分离、父进程即刻返回 0 且**捕获不到任何 stdout**（实测 `--version` 亦无输出）。`Start-Process` 能拿到 PID 并观测存活，是本机唯一可复核的启动通道。

**实测**：`DevTools listening on ws://127.0.0.1:9333/devtools/browser/542c51fd-…`，`pid=72672 alive=True`。

---

## 2. T-13.1 隔离核实 —— **通过（3/3）**

### 判据① 日志出现「数据目录（env）」且指向所设路径

```
2026-11-01T23:33:58.648Z  INFO    IO      数据目录（env）：E:\mc kjs\.cache\t13-ud
```

（`source = env`，路径与申报值**逐字符一致**）

### 判据② 日志文件**物理位于**隔离路径下

```
E:\mc kjs\.cache\t13-ud\logs\studio-2026-11-02.log    （6,004 B，2026-11-02 07:36）
```

### 判据③ 隔离路径出现完整 userData 结构

`Cache`、`Code Cache`、`GPUCache`、`Local Storage`、`Local State`、`Preferences`、`Network`、`Dictionaries`、`icon-cache`、`logs`… 共 **38,807 个文件 / 124 MB**（含扫描产生的图标缓存）。

### 补充：应用确实在这套隔离目录里跑完了真实工作

```
开始导入：E:/mc kjs/.cache/t13-pack
检测到 MC 1.20.1 / Forge / KubeJS 2001.6.5-build.26，共 295 个 mod
索引就绪：43,474 个物品（含虚拟 19）/ 225 个命名空间 / 配方 32,891 条（类型 426 种）
耗时明细：物品 33.5s + 配方 5.2s + 语料 0.45s + 缓存提交 0.00s = 合计 39.2s
```

**→ T-13.1 判定：通过。** 隔离成立，P4 前提满足。

---

## 3. T-13.2 —— **无法执行**（决定性根因：运行产物早于被验证的修复）

### 3.1 直接触发点

在真实环境调 `plugins:loadStatus`（T-07 新增通道）：

```json
{ "ok": false, "error": "未注册的 IPC channel：plugins:loadStatus" }
```

### 3.2 根因取证（三条独立证据）

| # | 证据 | 实测 |
|---|---|---|
| **E-1** | 产物构建时点 vs 修复时点 | `out/main/index.js` = **2026-11-01 07:04:30**；FIX-01 = 11-01 23:39、FIX-02 = 11-01 23:56、FIX-03 更晚；T-05/T-07 = 11-02 07:00–07:06 |
| **E-2** | 产物内是否含修复特征（grep 计数） | `getPluginLoadStatus` = **0**；`loadFailure` = **0**；`plugin-disabled` = **0**；`plugins:loadStatus` = **0** |
| **E-3** | 通道数量差 | `src/shared/ipc.ts` 声明 **35** 个 / `registerHandler` 调用 **35** 处；运行日志「IPC handler 已注册 **34** 个 channel」 |

**结论**：正在运行的应用**不包含 FIX-01/02/03 的任何代码**。在它身上做的任何观察都只反映**修复前**的行为，把它当 ③ 层证据会得出「FIX 未生效」的**错误结论**。

### 3.3 第二个独立阻塞（即便重建也存在）

副本 `.cache/t13-pack` **没有 `.recipe-studio/plugins/` 目录**（基准包 `pc7-pack-1112` 原件同样没有）。而任务书禁止构造假数据：

- **RT-05 S2**（目录存在但读不出）需先有插件目录 → 无真实样本时只能靠人造目录，属构造；
- **RT-01**（FIX-01 插件层跟随）在 **D-19 = B** 下的差异源要求「包内 `.recipe-studio/plugins/` 有真实插件声明」→ 无样本即无差异源。

### 3.4 四态判定

| FIX | 对应 RT | 判定 | 理由 |
|---|---|---|---|
| **FIX-01**（插件层跟随当前整合包） | RT-01 | **无法** | ① 运行产物不含该修复（§3.2）；② 无真实插件样本，D-19=B 差异源不可构造（§3.3） |
| **FIX-02**（读取失败保留旧层） | RT-05 S2 | **无法** | 同上；且 `getPluginLoadStatus` 在产物中不存在，`state === 'failed'` 无法读取 |
| **FIX-03**（失败不写快照戳） | RT-05 S2 | **无法** | 同 FIX-02；该行为只能经 `loadFailure` 路径观测，产物中无此符号 |

> 按任务书 §五「四态之一」口径，三项均记 **无法**，并已在 §3.2/§3.3 写明**缺什么**。

### 3.5 已获得的现场观察（**明确不作 FIX 证据**）

这些只是"旧构建在真实包上跑通"的旁证，与 FIX 判据无关：

| 观察 | 值 |
|---|---|
| `plugins:list` | `{ ok: true, data: [] }` |
| `schema:list` | `ok: true`，**3 个类型，全部 `source = builtin`**（试点 3 类型） |
| 索引规模 | 43,474 物品 / 32,891 配方 / 426 类型 |
| 占位图比例 | 10.84%（缺图标 4,714，均为包内资源缺失） |

---

## 4. 副本与原件

| 项 | 值 |
|---|---|
| 原件 | `.cache/pc7-pack-1112`：**1659 文件**，目录 mtime `2026-10-23 20:24:12`（未变） |
| 副本 | `E:\mc kjs\.cache\t13-pack`：**1659 文件 / 556 MB** |
| 原件完整性 | 逐文件 SHA-1 比对：**1659 条，差异 0**（清单存 `.cache/fix14/a3tmp/t13/pack-orig-manifest.json`） |

---

## 5. 保护边界核验（生产 userData 未触碰）

| 证据 | 值 |
|---|---|
| `%APPDATA%\kubejs-recipe-studio` mtime | **2026-11-01 23:45:36.598**（启动前 = 启动后，**逐纳秒一致**） |
| `%APPDATA%\kubejs-recipe-studio-dev` mtime | **2026-11-01 05:23:32.034**（同样一致） |
| 启动参数复核 | 全程携带 `STUDIO_USER_DATA=E:\mc kjs\.cache\t13-ud`；未使用 `--force-run`、未传 `--user-data-dir` |
| 进程隔离 | 启动前：含 `E:\mc kjs` 的 electron 进程 **0 个**（6 个全属 `E:\QQ-agent-0.5`）；关闭后 **0 个**；**QQ-agent 6 个全程存活** |
| 禁止动作 | 未改 `src/**`、`tests/**`、V9/V1.1/V1.2/DECISIONS/任务状态/缺口矩阵；未 Git 写；**未构建/打包/安装**；未就地改写 `pc7-pack-1112` |

---

## 6. 失败 / 跳过 / 未执行项

| # | 项 | 状态 | 原因 / 下一步 |
|---|---|---|---|
| 1 | T-13.2 全部三项 | **未执行（无法）** | **必须先让运行产物包含 FIX-01/02/03** → 需 **构建（打包）授权**，本批明确禁止 |
| 2 | 重建后的 RT-05 S2 / RT-01 | **未执行** | 还需**真实插件样本**（包内 `.recipe-studio/plugins/` 的真实插件声明）；或授权「以最小合法插件清单作环境搭建」并明确这不算构造假数据 |
| 3 | RT-05 A/C 两态 | 不适用 | D-10 暂缓，按 V1.1 口径只记录不判定 |
| 4 | T-13.3（RT-01～10）/ T-13.4（cacheHit） | 未执行 | 不在本包 |

**给负责人的最小解锁路径（二选一或都做）**：

- **A**：授权一次 `npm run build`（或 `electron-vite build`）刷新 `out/`，然后重跑本包 T-13.2；
- **B**：先授权"在副本内放置 1 个最小合法插件清单（仅声明 1 个 `recipeType`）作为环境搭建物"，与 A 一起做，才能同时覆盖 RT-05 S2 与 RT-01。

> **不建议**：用 sandbox/单测结论替代 ③ 层。本次的教训正是"单测全绿（824 用例）但运行产物是隔夜旧包"——②/③ 不可互替。

---

## 7. 回滚 / 清理建议（**不急删**）

| 对象 | 体积 | 建议 |
|---|---|---|
| `E:\mc kjs\.cache\t13-ud` | 124 MB / 38,807 文件 | **保留**：重建后重跑 T-13.2 可复用（但注意包内缓存与旧产物绑定，重建后建议清 `cache/` 子目录再扫描一次） |
| `E:\mc kjs\.cache\t13-pack` | 556 MB / 1659 文件 | **保留**：后续 RT-01 需要 A/B 两个包，这是 A 包基底 |
| 应用进程 | — | **已全部关闭**（0 残留） |

清理方式（将来）：`Move-Item` 到隔离区，勿 `rm -rf`（宿主 safe-delete 会拦）。

---

## 8. 判定汇总

| 项 | 判定 |
|---|---|
| **T-13.1** | **通过**（3/3 判据 + 真实扫描跑通） |
| **T-13.2 FIX-01** | **无法** |
| **T-13.2 FIX-02** | **无法** |
| **T-13.2 FIX-03** | **无法** |
| 隔离 | **成立**（生产 userData 逐纳秒未变） |
| 原件 | **未变**（1659 条 0 差异） |

**状态**：T-13.1 记「待验收」；T-13.2 记「受阻」（四态：无法）。本报告不构成 P4 后续推进授权，也不构成构建授权。
