# BUG-HUNT-04 验证计划修订提案（RT REVISION PROPOSAL）

> **对应**：G-04（RT-01/02 判据失效）、G-05（FIX-01 与"恰好 1 条"冲突）、D-10（Q-02 三态）、D-19（差异源）
> **性质**：**提案，不是修改**。`docs/BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN.md` 本体**未改动**（批量规则 R-3/§4 禁止覆盖）。
> **应用方式**：待授权后由 **T-13.0** 新建 `BUG-HUNT-04-...-V1.1.md`，**不覆盖 R1 版**。
> **时间**：2026-11-02 01:02

---

## 1. 需要修订的三处（含证据）

| # | 位置 | 现文（要点） | 问题 | 证据 |
|---|---|---|---|---|
| R-1 | RT-01 步骤 7 | "锚点后 `五层合并完成` **恰好 1 条**" | FIX-01 后 `ensureSchemas` 重建时，provider 内部 `syncPluginLayer()` 可能先 `applyMerge` 一次，随后 `ensureSchemas` 再合并一次 → **2 条属正常** | `loader.ts:294`（`syncPluginLayer` 内 `refreshEffective`）；`LOADER` 侧 `loadPlugins:258`；勘误 C-08 |
| R-2 | RT-01 / RT-02 差异源 | "A 包内嵌插件、B 包没有；切包后预览/开配方" | `currentPluginOverrides()` 用 `lastModpackPath`，而唯一传当前包路径的生产入口是 `plugins:list`（进设置页）→ **不进设置页=假失败、进了=假通过**；且配方 `uid` 含绝对路径，A 的 uid 在 B 必然不存在 | `loader.ts:274-278`；`pluginHandlers.ts:20`；`SettingsView.tsx:41,60`；`jsonSource.ts:177/218`；勘误 C-04 |
| R-3 | RT-05 S2 + §7 Q-02 | "`listPluginFiles` 捕获 `readdir` 失败返回 `[]` → 层被清空" | **已被 FIX-02 改变**：失败时保留旧层、不写 cache、状态 `failed`、可重试；FIX-03 再不写快照戳 | `FIX-03-IMPLEMENTATION-REPORT.md`；`pluginLoadFailurePreservesLayer.test.ts` 8 例 |

---

## 2. 建议替换文本（可直接套用）

### 2.1 R-1：把"恰好 1 条"改为"≥1 且条数可解释"

```text
7) 校验：统计锚点之后、本步骤之前的 `五层合并完成` 条数 N。
   - N ≥ 1 即证明预览确实触发了重建；
   - 允许 N = 2：`ensureSchemas` 重建时可能先由 provider 内的 `syncPluginLayer()`
     触发一次 `applyMerge`，再由 `ensureSchemas` 自身合并一次（FIX-01 引入）；
   - N = 0 → 预览未走 `ensureSchemas`（缺陷）；
   - N ≥ 3 → 期间有其它入口介入，本次证据作废，需重跑。
   - 记录时必须写明 N 与"2 条"的解释，不得因为看到 2 条就判失败。
```

### 2.2 R-2：差异源与判据（**依赖 D-19 三选一**）

| 方案 | 做法 | 前置 | 风险 |
|---|---|---|---|
| **A**（改动 jar） | 在 `cp -r` 的包副本里改 jar 内的插件声明 | D-19 选 A | 改二进制、易出错 |
| **B**（仅改包内插件目录） | 只用 `<包>/.recipe-studio/plugins/` | D-19 选 B | **必须先排除 `lastModpackPath` 干扰**（见下） |
| **C**（放弃 RT-01/02） | 改为"换包整体验收"，不声称归因 REM-01 | D-19 选 C | 失去针对性证据 |

**无论选哪个方案，RT-01/02 都必须先加一步"插件层跟随性确认"**（这是本提案的核心）：

```text
0) 切包后、读取前，先看日志里最近一条 `插件加载完成` 的路径
   （`loader.ts` 的 `entries.map(e => `${e.origin} → ${e.file}`)`）：
   - 路径指向**当前包** → 可继续，本 RT 有判据价值；
   - 路径仍指向**上一个包** → 说明 loadPlugins 未被以当前路径调用，
     本次结果**不得**归因于 REM-01，必须记为"环境不具备"。
```

### 2.3 R-3：RT-05 S2 与 Q-02 改为三态

```text
S2 覆盖的是「目录存在但读不出」（状态 B）：
  - 期望：插件层**保留**、`getPluginLoadStatus().state === 'failed'`、WARN 含错误码；
  - 不得再期待"层被清空"（旧行为已被 FIX-02 移除）。
S2 不覆盖「目录不存在」（状态 A）与「读成功但为空」（状态 C）：
  - A 与 C 的语义仍待 D-10 裁决；
  - 在 D-10 答复前，A/C 的行为**只记录，不判定**。
```

---

## 3. 修订后 RT 的依赖变化

| RT | 修订后前置 | 说明 |
|---|---|---|
| RT-01 / RT-02 | 需先有"插件层跟随性确认"步骤；差异源方案待 D-19 | 否则仍会假通过/假失败 |
| RT-05 S2 | 期望值改为"保留 + failed"；A/C 两态不判定 | 依赖 D-10 |
| RT-04 B 类 | 不变（仍"只记录不判定"） | — |
| RT-08 | 阈值仍待 D-13 | — |
| RT-09 步骤 3 | 同 size+mtime 属 D-15 | — |

---

## 4. 本提案**不做**的事

- 不修改 R1 版计划文件本体（未覆盖，未改名）。
- 不替负责人选择差异源方案（D-19）。
- 不替负责人裁定 Q-02 三态语义（D-10）。

## 5. 应用方式（待授权）

1. `cp` 现有计划 → `.cache/bughunt04-rt-plan.pre-v1.1-<ts>.md`（留证）；
2. 新建 `docs/BUG-HUNT-04-REAL-ENV-VERIFICATION-PLAN-V1.1.md`（**新文件，不覆盖**）；
3. 在 `DOCS-INDEX.md` 登记新版，旧版标"历史版本"；
4. CHANGELOG 增一条（编号顺延 C-28 起）。
