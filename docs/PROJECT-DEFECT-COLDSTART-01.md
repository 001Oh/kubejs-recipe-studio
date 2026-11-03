# 缺陷报告 · 冷启动不恢复包/插件/索引上下文

| 项 | 内容 |
|---|---|
| **缺陷编号** | 待分配（建议 `BH3-001`） |
| **级别** | **高**（首次启动对用户的直接观感 = "什么都没了"） |
| **状态** | **实锤，待 A2 授权修复**（本批仅取证） |
| **取证时点** | 2026-11-03 06:38–06:41，冷启动（`STUDIO_USER_DATA=.cache/t13-ud`，零禁用参数） |
| **数据安全** | 生产 userData 零触碰；副本包只读 |

---

## 1. 现象

关闭应用后重新启动，**上一次导入的整合包、插件列表、物品索引全部消失**：

- 插件区显示"未发现插件"（实为包上下文丢失，不是插件缺失）
- 物品列表为空、搜索无结果
- 内置 schema 仍在（3 个）

用户视角等同"数据丢失"，但磁盘上的数据其实**完好**。

## 2. 六项取证（原始响应）

| # | 项 | 实测 | 判读 |
|---|---|---|---|
| 1 | `plugins:list` | `{ok:true, n:0, path:null}` | 空列表，**且 `path=null`** |
| 2 | `plugins:loadStatus` | `{state:"ok", path:null, cachedPath:null, error:null}` | **无包却报 `ok`**（可疑，见 §4） |
| 3 | `modpack:current` | `data = null` | 包上下文未恢复 |
| 4 | `uiState.json` | **无 `lastModpackPath` 字段**（`grep -c` = 0） | **包路径从未持久化** |
| 5 | DOM | 插件区存在但列表空 | 与 IPC 一致（假设 A，非 UI 刷新问题） |
| 6 | `items:query` → `total` | **0** | 索引亦为空（第三处内存态） |

**磁盘上的证据（关键对照）**：

```
.cache/t13-ud/studio-cache/51463d7114a1446d/items.json    15,322,638 B  2026-11-03 06:29:11
.cache/t13-ud/studio-cache/51463d7114a1446d/recipes.json  31,270,127 B  2026-11-03 06:29:15
.cache/t13-pack/.recipe-studio/plugins/t13probe.json            510 B  2026-11-02 08:41
.cache/t13-ud/plugin-disabled.json = []
```

**索引缓存存在且完好（15MB + 31MB），插件文件存在（510B）——但启动时一个都没被读。**

启动日志中「恢复 / lastModpack / 载入整合包」相关记录：**0 条**。

## 3. 冷启动三维状态全景

| 维度 | 冷启动后 | 磁盘上是否存在 | 结论 |
|---|---|---|---|
| **包上下文** | `null` | uiState 无路径字段 → **不存在** | **未持久化**（不是"持久化了没用"） |
| **插件层** | 0 条，`path=null` | 副本内 `t13probe.json` 完好 | **包路径缺失导致无法定位** |
| **物品/配方索引** | `total=0` | `items.json`/`recipes.json` 完好（46MB） | **有缓存但不加载** |
| 内置 schema | 3 个 | — | 正常（不依赖包） |

## 4. 机制（三段式）

1. **未持久化**：导入整合包时，`lastModpackPath` **没有写入 `uiState.json`**（字段根本不存在）。
2. **启动不恢复**：`main/index.ts` 启动流程**无任何 modpack / 插件 / 索引加载调用**（协调方 grep 实锤 + 本批日志 0 条证据）。
3. **缓存不命中**：`studio-cache/<hash>/items.json` 虽在磁盘，但启动后无人读 → `getItems()` 为空 → `plugins:list` 因 `path=null` 返回空。

**附带发现（次要）**：`plugins:loadStatus` 在 `path=null` 时返回 `state:"ok"`。语义上"没有包"不应算 `ok`——建议一并评估（可能与 FIX-02 的三态设计有关，评级：低）。

## 5. 复现步骤（最短）

1. 以 `STUDIO_USER_DATA=<隔离目录>` 启动；
2. `modpack:import` 导入任一含 `.recipe-studio/plugins/*.json` 的副本包 → 执行一次扫描（生成索引缓存）；
3. 确认 `plugins:list` 返回 ≥1、`items:query` 的 `total` > 0；
4. **正常关闭应用**（`CloseMainWindow`）；
5. 以同一 `STUDIO_USER_DATA` 重新启动；
6. 观察：`plugins:list` n=0 且 `path=null`、`modpack:current` 为 null、`items:query` `total=0`。

**稳定复现**（本批 1 次，历史批次多次同现象）。

## 6. 影响面

| 用户行为 | 影响 |
|---|---|
| 每次重开应用 | 需**重新导入整合包 + 重新扫描（40–60 s）** |
| 插件能力 | 会话内有效，重启即失效 |
| 搜索/配方浏览 | 重启后为空，直到重新扫描 |
| **前端可用性验证** | **区域 4/5 与 role 增强被此缺陷阻塞**（第 44 批已记录） |
| 数据安全 | **无实际丢失**（磁盘完好），属"上下文不恢复" |

## 7. 修复建议方向（**不在本批实施**）

| # | 方向 | 涉及 | 备注 |
|---|---|---|---|
| 1 | 导入成功时把 `lastModpackPath` 写入 `uiState.json` | 主进程 `modpack` 处理 + `envPaths` | 最小改动，先解决"路径不存在" |
| 2 | 启动时读取 `lastModpackPath`：包存在性校验 → `setCurrentModpack` | `main/index.ts` 启动流程 | **启动流程改动 = A2 产品改动** |
| 3 | 上述成功后按缓存签名命中 `items.json` / `recipes.json` 并 `setItemIndex` | `scanOrchestrator` 的缓存载入路径需抽成可复用函数 | 避免二次全量扫描 |
| 4 | 再触发 `syncPluginLayer()` + `ensureSchemas()` | 既有 FIX-01/02 入口 | 插件层随包恢复 |
| 5 | 包已被删除/移动时的降级：清空上下文 + 明确提示 | 新增分支 | 避免"静默空列表" |

**风险提示**：第 2、3 项触碰启动流程与缓存载入，**须单独立项 + A2 授权 + 回归门禁**（至少覆盖 T-13.2 FIX-01/02/03、RT-01/RT-05、T-14 双实例）。

## 8. 边界

| 对象 | 结果 |
|---|---|
| 生产 userData | `2026-11-03 03:43:05`（本批 06:38–06:41 **零触碰**） |
| 副本包 / 原件 | 只读；`t13probe.json` 完好（510 B） |
| `src` / `tests` / `package.json` / 产物 / V9 | **全未变** |
| 进程 | 应用已关闭（残留 0）；**QQ-agent 11 进程未受影响** |
| 本批动作 | **纯取证（A0/A4 只读）**，未改任何代码 |

## 9. 处置

**缺陷实锤 → 停，等 A2 授权。**

修复任务书需明确：是否接受"启动自动恢复包"这一行为变更（可能影响双实例隔离语义，需与 T-14 结论对齐）。
