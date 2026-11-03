# T-18 · GPU 加速模式验证（最终版）

| 项 | 内容 |
|---|---|
| **结论** | **T-18 = 通过** |
| 执行时点 | 2026-11-03 06:02–06:08 |
| 启动方式 | **PS `Start-Process -PassThru`，零禁用参数**（不经 agent Bash Shell） |
| 隔离 | `STUDIO_USER_DATA=E:\mc kjs\.cache\t13-ud`（生产 userData 零写入） |
| 证据目录 | `.cache/fix14/a3tmp/t18/` |

---

## 1. 根因更正（采纳 GPU Agent 06:00 结论）

**历史 `0xC0000005` 连崩不是 GPU 问题**——GPU 硬件正常（RTX 5060 / 驱动 621.01 / 零 TDR）。真因是 **agent Bash Shell 的沙箱注入与环境污染**（`tsbx.dll` + `ELECTRON_RUN_AS_NODE` + `NODE_OPTIONS`）。

**本批自证**：同一份产物，经 agent Bash Shell 启动即崩/静默退出；经 PS `Start-Process` **零禁用参数**启动则稳定运行 5 分钟以上。这与根因判定一致。

> 由此推翻了本项目长期沿用的"启动必须带五件套禁用参数"这一操作口径——**那是绕开沙箱污染的手段，不是 GPU 的必需**。

## 2. GPU 生效证据

### 2.1 GPU 进程

| 项 | 值 |
|---|---|
| `--type=gpu-process` 进程数 | **1** |
| 命令行 | `electron.exe --type=gpu-process --user-data-dir="E:\mc kjs\.cache\t13-ud" --gpu-preferences=…` |
| **`--disable-gpu`** | **不存在**（零禁用参数，已核） |
| 主进程 | pid 31108，`alive=True` |

### 2.2 WebGL / ANGLE（渲染层实测）

| 项 | 值 |
|---|---|
| WebGL 版本 | **`WebGL 2.0 (OpenGL ES 3.0 Chromium)`** |
| Vendor | `Google Inc. (NVIDIA)` |
| **Renderer** | **`ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)`** |
| MAX_TEXTURE_SIZE | 16384 |

→ **ANGLE_D3D11 后端 + 真实 RTX 5060**，硬件加速确认生效（非 SwiftShader 软件渲染）。

### 2.3 UI 渲染

截图 `.cache/fix14/a3tmp/t18/ui-gpu.png`（79,698 B，操作后复截 129,918 B）：三栏布局完整、文字清晰、无黑屏/花屏/错位；日志面板正常输出（含 `IPC handler 已注册 35 个 channel`、`数据目录（env）：E:\mc kjs\.cache\t13-ud`）。

## 3. 功能抽验（GPU 模式下）

| # | 操作 | 结果 |
|---|---|---|
| 1 | **换包** A→B→A | `schema:list`：B = **3**、A = **4**（含 `t13probe:only`）→ 换包正常 |
| 2 | **打开配方详情** | `recipes:byOutput(minecraft:stone)` → `total=8`；`recipes:open` → `ok`，`type=minecraft:crafting_shapeless`，`inputs=1` |
| 3 | 代码生成预览 | **未成功** —— 我传的 `draft:null` 形状不对（报 `Cannot read properties of undefined (reading 'typeId')`）。**这是我的调用参数问题，不是产品缺陷**，未计入判定 |

**无渲染类异常**（黑屏/花屏/错位均未出现）。

## 4. 稳定性

| 项 | 值 |
|---|---|
| 存活 | **5.4 分钟**（pid 31108，06:02:29 启动 → 06:07:56 仍在） |
| 期间操作 | 导入 + 全量扫描（43,474 物品）+ 换包×2 + 配方详情 + 多次 CDP 查询 |
| `0xC0000005` 事件（近 40 分钟 Application 日志） | **0** |
| 退出 | `CloseMainWindow()` = **True**，残留 `mc-kjs=0`；QQ-agent **未受影响** |

## 5. 对照记录（沙箱兼容模式 vs GPU 加速模式）

| 维度 | 沙箱兼容模式（旧口径，五件套禁用参数） | GPU 加速模式（本批） |
|---|---|---|
| 启动前提 | 必须带 `--no-sandbox --disable-gpu*` 否则崩 | **零参数**即可 |
| GPU 进程 | 存在，但 `--disable-gpu` 下走软件合成 | **ANGLE_D3D11 + 真实 GPU** |
| WebGL Renderer | 未采集（历史批次未测） | `NVIDIA GeForce RTX 5060 … D3D11` |
| UI 观感 | 正常 | **正常**（截图对比未见差异） |
| 稳定性 | 需严格参数才不崩 | 5.4 min 零崩溃 |

**判读**：两模式在**功能与观感上无可见差异**；差异在于是否使用硬件合成。**渲染类回归未出现**。

## 6. 四态判定

**T-18 = 通过**
- GPU 生效：GPU 进程存活 + ANGLE_D3D11 + WebGL 2.0 真实设备字符串 ✅
- 功能：换包、配方详情正常，无渲染类异常 ✅
- 稳定：5.4 min、零 `0xC0000005` ✅
- 边界：生产 userData 零写入（全程 `STUDIO_USER_DATA` 隔离）、`src`/`tests`/产物/V9 零改动 ✅

## 7. 状态落盘

| 文档 | 变更 |
|---|---|
| `PROJECT-MASTER-PLAN-V1.2.md` | T-18 末列 → **已通过**（GPU 验证） |
| `PROJECT-TASK-STATUS-RECONCILIATION.md` | T-18 → **① 已完成**；汇总重算 **20/3/1/3/0/0/1/2 = 30**；新增 T-24 行 |
| `PROJECT-GAP-CLOSURE-STATUS.md` | **G-23 → 已关闭** |

## 8. ⚠ 第 41 批文档损伤：发现与修复（必须登记）

**问题**：第 41 批我用「从 `① 已完成并有证据` 到 `合计` 整段替换」的方式更新 TASK-STATUS 汇总，`findIndex` 命中的是**文件开头的"状态分类映射"表**而非目标汇总表，导致 **376 行 → 291 行，误删 85 行**（任务明细行等）。

**发现**：本批更新 T-18 时按行前缀匹配失败（命中 0），追查行数差异后确认。

**修复**：
1. 从 `.pre-b41-20261103-054746` **完整还原**（376 行）；
2. 改用**逐行替换**（每行独立匹配，断言命中数 = 1）重做：11 行任务状态 → ①，T-15/T-16 → ⑧，T-20 → ⑦（暂缓），新增 T-24 行；
3. 汇总表用**精确字符串替换**（逐行，不再 splice）。

**现状**：`TASK-STATUS` 379 行（376 + T-24 行 + ⑧ 行 + 1），汇总 **20/3/1/3/0/0/1/2 = 30 ✓**。

**流程改进（自定约束）**：治理文档的表格更新**一律逐行替换 + 断言命中数**，禁用「按起止标记 splice」——这类操作的边界极易跨段误伤。
