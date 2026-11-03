# LEDGER · REL-PKG-C 关闭修订报告

日期：2026-11-01
主台账：`docs/PROJECT-SEALING-LEDGER-REPORT.md`（v4 → **v5**）
备份：`docs/PROJECT-SEALING-LEDGER-REPORT.pre-v5-20261101-0528.md`（v4 原件，MD5 `0e143815aba2cb7057acbea1ac4ee40c`，`cmp` 逐字节一致）
性质：纯文档修订。未改源码/依赖/打包配置，未运行测试。

---

## 1. 关闭对象

| 项 | 内容 |
| --- | --- |
| 台账位置 | `§3.7` 的 **C 类**「打包后目录隔离」 |
| 门禁视图 | `§7.1` 的 `REL-VERIFY-PKGDIR`（§7.4 声明其为 C 类的视图，判定源是 C 类） |
| 原状态 | C 类：`未验证（= REL-VERIFY-PKGDIR）`；门禁：`未验证` |
| 新状态 | **已通过（2026-11-01）**；门禁 **已通过** |
| 主要证据 | `docs/PACK-05-USERDATA-ISOLATION-REPORT.md` |

> **文件名校实**：你的指令写作 `PACK-05-WINDOWS-USERDATA-ISOLATION-REPORT.md`，仓库中实际文件名为 **`PACK-05-USERDATA-ISOLATION-REPORT.md`**（少一个 `WINDOWS-`）。台账与本节均引用真实路径，未改名（避免改动已产出的证据文件）。

---

## 2. 四项验收条件逐条核对

| C 类验收条件（台账原文） | PACK-05 中的证据 | 判定 |
| --- | --- | --- |
| ① 正式版默认 userData | `app:runtime.userData = C:\Users\qituo\AppData\Roaming\kubejs-recipe-studio`；应用日志「数据目录（prod）：…」一致；未带 `-dev` | ✅ |
| ② `studio-cache` / `logs` / `recipe-backups` 位置 | 三者均由 `paths.ts` 的 `studioRoot()`（= 缓存一次的 `app.getPath('userData')`）派生；`studio-cache`/`logs` 实测在各根下创建；`recipe-backups/<modpackHash>` 位置由 prod 根下 52 个文件佐证 | ✅ |
| ③ 与 dev 不交叉 | dev=`...kubejs-recipe-studio-dev`、prod=默认；**并发双实例实测**互不串写；prod 的 `Preferences` SHA-256 测试前后一致（`BE4B8924…`）；文件数 90,535 不变 | ✅ |
| ④ 证据方式合规 | 采用台账指定的 `app:runtime` 返回路径 + 目录树核对，另加应用自身日志行作第二证据 | ✅ |

**补充验证（不计入 C 类判定，属你本轮指定）**：`STUDIO_USER_DATA` A/B 隔离、`--user-data-dir` C 隔离、env>cli 优先级（负控目录 C2 从未创建）、相对路径按 cwd 解析、多层不存在目录自动创建。

---

## 3. 台账实际改动清单（逐处 before → after）

| # | 位置 | 改前 | 改后 |
| --- | --- | --- | --- |
| 1 | 头部版本行 | v4 | **v5**，追加备份指针、v5 修订依据与要点 |
| 2 | §1 表 · 发布工作项 | 1 硬阻塞 + **3 项验证** + 1 项已关闭（REL-ICON） | 1 硬阻塞 + **2 项验证（DUAL、4K）** + **2 项已关闭（REL-ICON、REL-VERIFY-PKGDIR）** |
| 3 | §3.7 · C 类行 | 未验证（= REL-VERIFY-PKGDIR） | **已通过（2026-11-01）**，附证据路径 |
| 4 | §3.7 · 新增进度注 | — | A ✅ / B ⚠️ / **C ✅** / D ⬜，并声明 `P2-MKDIR`、`P2-USERDATAARG` 保持未解决 |
| 5 | §7.1 · `REL-VERIFY-PKGDIR` 行 | 未验证 · 发布前必须完成的验证 | **已通过（2026-11-01）** · 发布影响 `—` · 附证据路径 |
| 6 | §9 行动清单第 3 项 | 打包后目录校验（未开始） | **已完成（2026-11-01）** |
| 7 | §10 执行记录 | 10.1 v4 … | **10.1 v5（新增）** / 10.2 v4 / 10.3 v3 / 10.4 v2 |

---

## 4. 汇总数自洽校验

| 校验 | 结果 |
| --- | --- |
| 条件总数 | **40（未变）** |
| 已解决 | **4（未变）** |
| 部分解决 / 待验证 / 未解决 | **2 / 1 / 33（均未变）** |
| 未登记缺口 | **0（未变）** |
| 发布工作项 | 5 项（构成变化：1 硬阻塞 + 2 验证 + 2 已关闭） |

> **为什么条件计数不变**：C 类是 `REL-PKG` **这一条**条件内部的验收子项（四类之一），不是独立条件。C 类通过只推进 `REL-PKG` 的完成度，**不改变它的状态**——`REL-PKG` 仍是 40 条中"未解决"的那个 1。

---

## 5. 明确未改动的内容

| 项 | 状态 |
| --- | --- |
| `REL-PKG` 本体状态 | **仍为「未验证」**，硬性发布阻塞仍在 |
| `REL-PKG` 的条件定义与 A/B/C/D 四类验收范围 | 一字未改 |
| **`P2-MKDIR`**（`mkdirSync` 失败无回退） | **仍为「未解决（低）」**，未删除、未标为已解决 |
| **`P2-USERDATAARG`**（`--user-data-dir` 绕过 `-dev`） | **仍为「未解决（潜在）」**，未删除、未标为已解决 |
| `REL-VERIFY-DUAL` / `REL-VERIFY-4K` | 未关闭、未改动 |
| 其余 39 条条件 | 未改动 |
| 任何"报告建议"措辞 | 未改成"正式通过" |
| 源码、依赖、`electron-builder.yml`、`package.json` | 未改动 |

---

## 6. 结论

`REL-PKG-C` 已具备可复核的关闭证据链：**正式版走默认 userData → 三个关键目录均由 `studioRoot()` 派生 → 与 dev 并发运行互不串写 → 真实数据前后哈希与文件数一致**。

台账由 v4 更新为 v5，备份与本次修订报告齐备。**`REL-PKG` 仍是唯一硬性发布阻塞**，B 类（升级未执行）与 D 类（未开始）仍未完成，整体发布条件未变。
