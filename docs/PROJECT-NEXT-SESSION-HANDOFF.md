# PROJECT NEXT-SESSION HANDOFF（续接说明）

- 生成时间：2026-11-01 08:11（GMT+8）
- 用途：让**未参与此前工作**的 Agent 在 5 分钟内接手
- **本文件为新增文件**（生成前已确认目标路径不存在）；与 `PROJECT-FINAL-CLOSEOUT-REPORT.md` 配套阅读
- 未修改任何既有文件（源码 / 配置 / V9 台账 / 历史报告均未动）

---

## 1. 当前基准与关键路径

| 项 | 值 |
| --- | --- |
| 状态基准 | `docs/PROJECT-SEALING-LEDGER-REPORT.md` **V9**，MD5 `7a7e52d93a201da3d9fa0e4fa0b26f51`（868 行 / 90,749 B） |
| 上一版备份 | `docs/PROJECT-SEALING-LEDGER-REPORT.pre-v9-20261101-0802.md` = **V8**，MD5 `3dc2bf53d040374d0bd05119dea3874d` |
| 收尾报告 | `docs/PROJECT-FINAL-CLOSEOUT-REPORT.md` |
| 项目根 | `E:\mc kjs`（**不是 Git 仓库**，禁止任何 git 破坏性操作） |
| 生产 userData | `C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio`（**只读，切勿写入**） |
| 正式安装 | `C:\Users\qituo\AppData\Local\Programs\KubeJS Recipe Studio\`（当前 **0.1.0**） |
| 测试克隆 | `E:\mc kjs\.cache\pack-13\ud-clone`（配 `STUDIO_USER_DATA` 使用） |
| 回滚资源 | `.cache\pack-13\installers\…Setup 0.1.0.exe`（SHA `3C1BAD88…A01ECC`）｜`.cache\pack-15\backup-install-0.1.0\` |

**版本现状（三者不一致，务必记住）**

```
源码树      = 0.1.1      （package.json / package-lock.json）
正式安装    = 0.1.0      （exe SHA 193E131D…；注册表 DisplayVersion=0.1.0）
dist-011    = 0.1.1      （安装包 SHA 89D67446…）
dist        = 0.1.0      （原始产物，勿覆盖）
```

---

## 2. 测试与验收结果索引（按需查，不要重跑）

| 主题 | 结论 | 报告 / 原始证据 |
| --- | --- | --- |
| Windows 打包 | ✅ 0.1.0 与 0.1.1 均成功 | `PACK-03-WINDOWS-DIST-REPORT.md`、`PACK-16-B2-BUILD-REPORT.md` |
| 图标 | ✅ 8 尺寸，主程序/安装包各 8/8 字节级命中 | `ICON-01-应用图标与REL-ICON核验.md`、`LEDGER-REL-ICON-CLOSE-REPORT.md` |
| 安装 / 启动 / 卸载（0.1.0） | ✅ | `PACK-04-WINDOWS-INSTALL-REPORT.md` |
| userData 目录隔离 | ✅ | `PACK-05-USERDATA-ISOLATION-REPORT.md` |
| asar + worker（D-1） | ✅（`usedWorkers` 无出口，三段推导） | `PACK-07-REL-PKG-D-REPORT.md` |
| 295-JAR 扫描（D-2，五项计数） | ✅ `43,474 / 38,760 / 32,890 / 426 / 5,334` | `PACK-08`（选包）、**`PACK-09-D2-RERUN-REPORT.md`**（通过证据） |
| 同版本覆盖安装 N5 | ✅ | `PACK-11-B3-N5-SUPPLEMENT-REPORT.md` |
| **真实跨版本升级 0.1.0→0.1.1** | ✅ | **`PACK-18-B3B-UPGRADE-REPORT.md`** |
| 升级后 `uiState` 保留 | ✅ 语义 + 字节双证 | `PACK-17`（基线）、`PACK-18` §4 |
| 回滚 0.1.1→0.1.0 | ✅ 74 文件哈希逐行一致 | `PACK-19-ROLLBACK-REPORT.md` |
| 回滚后 0.1.0 启动 | ✅ 4 IPC 通道 `ok`、0 异常 | `.cache\pack-15\e1-launch.log` |
| `REL-PKG` 关闭 | ✅ 四类 A/B/C/D 逐条满足 | 台账 **§3.7-B**、`LEDGER-V9-CLOSE-REL-PKG-REPORT.md` |
| 测试门禁 | 64 文件 / 621 用例（源码仅版本变更，未重跑） | `P2` 等阶段报告 |

---

## 3. 禁止无故重复执行的工作

| 不要重做 | 原因 |
| --- | --- |
| **295-JAR 核心扫描** | `PACK-09` 已通过，五项计数与基线一致；重跑还要求"不扫描"边界 |
| **0.1.1 构建** | `dist-011\KubeJS Recipe Studio Setup 0.1.1.exe` 已在（SHA `89D67446…`） |
| **0.1.0→0.1.1 升级** | `PACK-18` 已完成并回滚，环境已恢复 |
| **回滚 / 回滚后启动** | `PACK-19` + E1 已完成 |
| **`dist:win`** | 会覆盖 `dist/` 现场（0.1.0 唯一产物 + `win-unpacked`） |
| **图标生成与核验** | `build/icon.ico` 已定型且 8/8 命中 |
| **全量测试** | 源码自 0.1.0 起仅 `version` 字段变更，无源码改动 |
| **台账计数推导** | 40 = 7+6+5+7+4+10+1；v3 计数复核已完成，勿重新审计 |
| **旧版安装包检索** | `PACK-10` 已全盘核查：**只有 0.1.0 一个安装包**，重复检索无意义 |

---

## 4. 未解决事项与触发条件（简版）

| ID / 项 | 触发条件 | 性质 |
| --- | --- | --- |
| `REL-VERIFY-DUAL`（`P2-DUALFORM`） | 安装版 + dev 并行使用 | 发布前必做，非硬阻塞 |
| `REL-VERIFY-4K`（`UI-U4`） | 4K 视口查看日志详情 | 发布前必做，非硬阻塞 |
| 安装包未签名 | 用户下载安装（SmartScreen） | **分发风险**，不计入 `REL-PKG` |
| `cacheHit` 未测量 | 需证明"缓存可复用"时 | 补测成本 ≈40 s |
| 正常 GPU 启动路径 | 目标机 GPU 驱动异常 | 环境限制 |
| `P2-MKDIR` | `STUDIO_USER_DATA` 指向不可创建路径 | 已实测复现：未捕获异常 + 弹窗 |
| `P2-USERDATAARG` | 开发者手动 `--user-data-dir` 指向 prod | 潜在，未实测触发 |
| `P2-POSIXPATH` | 在 Linux/macOS 运行 | 未验证 |
| 其余 29 条未解决条件 | 见台账 §3.1–§3.6、§4 | 详见收尾报告 §6 |

---

## 5. 下一次构建前**必须先确认**的版本选择

> **不确认就不要构建。** 当前源码 0.1.1 / 安装 0.1.0 不一致，直接构建会产出版本号与实际不符的包。

| # | 必须先定 | 选项 |
| --- | --- | --- |
| 1 | 下一版基线 | **A：保留 0.1.1**（随后把安装也升到 0.1.1）｜**B：源码回退到 0.1.0**（撤销 D3 决定） |
| 2 | 构建输出目录 | 必须显式指定（`dist-011` 已被占用；**不得**默认写 `dist/`） |
| 3 | 是否先补 DUAL / 4K | 二者是发布前置验证 |

**验证输出目录覆盖是否生效的安全做法**（已实践过）：先 `electron-builder --win --dir --config.directories.output=<新目录>` 看日志里的 `appOutDir`，确认无误再跑 NSIS。

---

## 6. 继续工作前必须先读取的文档

1. `docs/PROJECT-FINAL-CLOSEOUT-REPORT.md`（收尾报告，含矛盾清单与风险分级）
2. `docs/PROJECT-SEALING-LEDGER-REPORT.md` **§1（计数）/ §3.7 / §3.7-A / §3.7-B / §7 / §10 / §11**
3. `docs/LEDGER-V9-CLOSE-REL-PKG-REPORT.md`
4. 若涉及打包：`docs/PACK-16-B2-BUILD-REPORT.md`、`docs/PACK-03-WINDOWS-DIST-REPORT.md`
5. 若涉及升级/回滚：`docs/PACK-17` → `docs/PACK-18` → `docs/PACK-19`

---

## 7. 严禁把"历史临时测试状态"当成"当前状态"

| 历史临时状态 | 实际含义 | 正确用法 |
| --- | --- | --- |
| `.cache\pack-06\ud-20261101-0537` / `ud-pc5-20261101-0550` | PACK-07 / PACK-09 的测试 userData | 仅作历史证据；**不是生产、也不是当前克隆** |
| `.cache\pack-13\ud-clone` | 本次克隆（含 `theme=light` / `sidebarWidth=380`） | 验证时可复现；**不是生产** |
| `dist\win-unpacked\`、`dist-011\win-unpacked\` | 构建中间产物 | **不得作为"安装版"证据**（PACK-01/02 已明令） |
| `.cache\pack-01\dist-failed-*` / `pack-02` | 失败现场 | 仅作故障分析；**不可作验收证据** |
| `.cache\pc7-pack-1112` | 含 P-C7 遗留另存副本的基准包 | 扫描会得 **32,891**（≠ 基线 32,890）；**验收用 `pc5-pack-1112`** |
| `.cache\pc3-pack-1112` | 比 pc5 多 1 个配方 JSON | 同上，**不可作基线** |
| `PROJECT-SEALING-LEDGER-REPORT.pre-v*` | 各版本的**上一版**备份 | 文件名指"它保存的那一版"，不是"之后要生成的那一版" |

---

## 8. 三条最容易踩的坑（都是本轮真实踩过的）

1. **别给 `package.json` 加 `productName`** —— `app.getName()` 会变，userData 路径从 `kubejs-recipe-studio` 变成 `KubeJS Recipe Studio`，历史数据"看起来全丢"，属**伪故障**。
2. **`--force-run` 绝不要加** —— 安装器静默结束后会**自动启动应用**，用默认 userData 直接写生产数据。只用 `/S`。
3. **别用 `rm -rf` 与 `cp` 拼在一条命令里** —— 本机安全策略会拦截并连带杀掉整条命令，导致复制中断（本轮曾中断在 49,185/90,535）。目录已存在就用 `cp -a "src/." dst/`。

---

## 9. 一句话交接

> 状态基准是 **V9**；`REL-PKG` 已关闭、硬阻塞清零，但**源码 0.1.1 与安装 0.1.0 不一致**——**先定版本，再动构建**。台账里有 5 处"旧话没改"（收尾报告 §8 C1–C5），属同步遗漏，不影响判定，修订台账时一并处理。
