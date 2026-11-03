# P-C3 提交与冲突闭环评审

日期：2026-10-31
范围：为已接入的 3 种试点类型实现真实提交、冲突处理、写盘与回读验证。
不增加配方类型，不接 P-F 代码生成，不改扫描 / 缓存 / 搜索 / ProbeJS。

## 1. 提交语义

- **覆盖提交**：写同 ID 的数据包覆盖文件
  - jar / datapacks.zip 源 → `<modpack>/kubejs/data/<ns>/recipes/<path>.json`
  - `kubejs/data`、openloader 等散文件源 → 原地覆盖该文件
- **另存副本**：写 `<modpack>/kubejs/data/recipe_studio/recipes/<name>_<时间戳>.json`，不覆盖原配方。
- 原始 jar / zip **绝不修改**；全部 E2E 使用工作区 `.cache/pc3-pack-*` 的硬链接副本，原只读整合包未写入。
- 提交成功后只更新**内存配方索引**（让当前会话的浏览/重开看到新文件）；扫描缓存不在这里改写。下一次导入/重扫会按数据包 extras 签名重建。

## 2. 调用链

```
PilotDraftPanel「提交配方」
  → commitBridge.submitDraft()
  → IPC recipes:commit
  → commitRecipe()
      1. lookup(uid) + uid 复核
      2. readFullRecipe(当前原始文件) → hashRaw
      3. selectSchema + schema id/revision 复核
      4. overwrite: expectedRawHash === currentHash（否则 CONFLICT）
      5. normalizeRecipe 当前原始 → hasUnsafeUnknown / dirtyFields 校验
      6. applyDraftToNormalized（shared，纯函数）+ denormalizeRecipe
      7. 目标路径安全检查；jar 源若目标已存在则 TARGET_EXISTS
      8. 临时文件 + fsync + rename（同目录）
      9. 重新读取目标、JSON.parse、canonical 对比；失败回滚并报 SAVE_VERIFY_FAILED
     10. 构建新 file: 记录 → replaceRecipeByRecipeId / addRecipeRecord（内存索引）
     11. 返回 opened（从磁盘回读并规范化的新 baseline）
  → commitBridge.applyCommitted()：用 opened 重建干净草稿，dirtyFields=[]，lastCommit=保存路径
```

## 3. 安全核对与实现

| 要求 | 实现 |
| --- | --- |
| uid 匹配 | `record.uid !== req.uid` → `UID_MISMATCH` |
| rawHash 重新确认 | 每次提交都 `readFullRecipe` 重新读原始，不只依赖打开时 |
| schema 复核 | `selectSchema(type)` 的 id / revision 与草稿请求一致，否则 `SCHEMA_CHANGED` |
| 未解决冲突 | 渲染端禁用提交；主进程 overwrite 仍强制 rawHash，冲突必 `CONFLICT` |
| unsafeReason | 主进程用当前原始重新规范化并 `hasUnsafeUnknown` 独立判定，`UNSAFE` |
| 非法脏字段 | 不在当前 normalized slots 的键 → `INVALID_DIRTY_FIELDS` |
| 未修改字段/类型 | 只写 dirtyFields；列表/网格按项复用原 Normalized 值；JSON 数字/字符串由 `Quantity.raw` 保守 |
| 写盘失败 | 不返回成功、不替换索引；渲染端保留 dirty；可重试 |
| 回读校验 | 实际读取目标文件，parse + canonical 比对；失败回滚并报 `SAVE_VERIFY_FAILED` |
| 重复提交 | store `committing` 防重；成功后 dirty=0 禁用按钮 |

## 4. 实际 E2E 结果（Electron，真实配方）

工作区副本：`.cache/pc3-pack-1112`（1112）、`.cache/pc3-pack-construct`（Construct）；原只读包未写入。

### 4.1 shaped：Ad Astra module_acid_rain_proof_unit

- 打开 → 取消：`cancelWroteFile=false`。
- 修改 grid[4] 为 emerald → 提交：`fileParsed=true`，`savedPreviewMatchesFile=true`，`dirty=0`。
- 保存文件：`kubejs/data/ad_astra_giselle_addon/recipes/compat/mekanism/crafting/module_acid_rain_proof_unit.json`
  - `pattern ["I#I","IBI","PPP"]`，`key.B = {item:"minecraft:emerald",count:1}`
  - `result`、`conditions`、其余格子全部保持。
- 从浏览重新打开：`reopenedDirtyZero=true`，`reopenedMatchesFile=true`。
- 冲突：外部改文件（加 `_studioConflictMarker:"external"`）后提交 →
  `conflictShown=true`、`conflictFileStillExternal=true`、`conflictDirtyKept=true`；
  点「保留我的修改」后 `conflictResolved=true`，再次提交成功，
  `conflictMarkerPreserved=true`、`conflictEditSaved=true`。
- 关闭白名单：面板不出现，旧 `.bench-cols` 路径载入（`legacyPanelAbsent=true`）。

### 4.2 shapeless：AllTheOres 黄铜粉

- 取消不写盘；提交 `ingredients[1] = {item:"minecraft:emerald",count:1}`。
- `itemsLengthPreserved/orderPreserved/tagPreserved/resultPreserved/categoryPreserved` 全 true。
- 保存文件：`kubejs/data/alltheores/recipes/brass_dust_from_alloy_blending.json`。
- 重开：`reopenedDirtyZero=true`、`reopenedMatchesFile=true`；旧路径正常。

### 4.3 create:mixing：AE2 fluix（Construct）

- 取消不写盘；改产物 count 2→3 提交。
- 保存文件：`kubejs/data/create/recipes/mixing/compat/ae2/fluix_crystal.json`
  - `results[0] = {item:"ae2:fluix_crystal",count:3}`
  - `ingredients`（tag/item/tag/fluid+amount+nbt）、`conditions` 全保留。
- 重开：`reopenedDirtyZero=true`、`reopenedMatchesFile=true`；旧路径正常。

## 5. 自动化测试（对应验收 A–G）

| 项 | 测试 |
| --- | --- |
| A 正常提交（3 类型） | 真实 Electron E2E 三组；主进程 `commitRecipe.test.ts` 覆盖 shaped/shapeless/mixing 的保存与回读 |
| B 冲突 | `CONFLICT` 单测（不写盘、目标不变）+ 真实 shaped UI 外部改文件/拒绝/保留我的/重提 |
| C 取消 | 三组 E2E 均 `cancelWroteFile=false` |
| D unsafeReason | 主进程 `UNSAFE` 单测（含无 id 引用）+ 渲染端 IPC 前拒绝单测 |
| E 类型保真 | 提交层单测：字符串 `count:"2"` / `chance:"0.35"`、数字 chance、tag、fluidTag、NBT、数组顺序、conditions/heatRequirement；E2E 三组真实配方结构与未建模字段 |
| F 保存失败 | 注入 `writeAtomic` EACCES → `SAVE_FAILED`，索引不更新、目标不存在；真实回读不一致 → `SAVE_VERIFY_FAILED` 并回滚；渲染端失败保留 dirty 与 lastCommit=null |
| G 旧路径 | 三组 E2E 关闭白名单后旧 `.bench-cols` 载入、试点面板不出现 |

新增文件：`src/main/recipes/commitRecipe.ts`、`src/shared/draftApply.ts`、`src/renderer/src/store/commitBridge.ts`；
测试 `tests/main/commitRecipe.test.ts`（11）、`tests/renderer/commitBridge.test.ts`（5）；E2E `.cache/e2e-pc3.mjs`。

## 6. 命令与退出码（本轮实际）

| 命令 | 退出码 / 结果 |
| --- | --- |
| `tsc --noEmit -p tsconfig.node.json` | 0 |
| `tsc --noEmit -p tsconfig.web.json` | 0 |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 |
| `vitest run` | 0；46 文件通过 / 2 跳过；**502 测试通过 / 4 跳过** |
| `electron-vite build` | 0 |
| `RUN_REAL_PACK=1 … tests/scanner/realPack.test.ts` | 0；3 通过；首次扫描 33.2s、缓存 781ms；43,474 / 38,760（89.2%）/ 32,890 / 426 / 5,334 |
| `RUN_REAL_PACK=1 … tests/recipes/realPack.test.ts` | 0；1 通过；32,890 / 426 / 5,334，6.0s |
| `PACK=.cache/pc3-pack-1112 … e2e-pc3.mjs`（shaped，CONFLICT=1） | 0；全部断言 true |
| 同上（shapeless） | 0；全部断言 true |
| `PACK=.cache/pc3-pack-construct … e2e-pc3.mjs`（mixing） | 0；全部断言 true |

调试中失败项：一次 mixing E2E 在面板打开后无响应并被看门狗终止（未复现；连续两次重跑通过）；一次 shaped E2E 在冲突截图后无响应（加重看门狗/步骤日志后重跑通过）。未放宽任何断言。

## 7. 未运行 / 已知限制

- **自动备份未实现**：jar 源不受影响；散文件原地覆盖失败时仅在回读校验失败时回滚，正常成功后不保留旧文件备份。需要回滚时请依赖整合包/版本控制备份，或删除新写的数据包文件。
- **扫描缓存不更新**：只更新内存索引；重启后若命中旧缓存，可能仍显示旧索引，直到重新导入/重扫（数据包文件变化会改变 extras 签名）。本轮未做“保存后强制重扫/写缓存”。
- **另存副本真实 UI 点击未运行**：copy 模式有主进程/渲染端单测；E2E 覆盖了覆盖提交和 shaped 冲突三选一中的“保留我的修改”。
- `SAVE_FAILED`/`SAVE_VERIFY_FAILED` 的 UI 由单测模拟；未在 Windows ACL 上制造真实只读目录。`SAVE_VERIFY_FAILED` 的文件回滚已用真实文件系统测试。
- 真实 E2E 只用工作区硬链接副本；未在原始只读包上验证，也不应写入。
- 不自动扩展配方类型；P-F 代码生成未接。

## 8. 回滚方式

1. 功能回滚：清空 `ui.benchV2`（设置页关闭三个试点开关）→ 三种类型回到旧 lite 路径，不涉及数据迁移。
2. 配方回滚：删除 `kubejs/data/**` 中本次提交生成的覆盖文件（或 `recipe_studio` 副本），原 jar/数据包内容即恢复生效；原始 jar 从未修改。
3. 写盘失败/回读失败：提交不更新索引、不返回成功、不清 dirty；清空草稿或重试即可，不残留半截临时文件（同目录 tmp + rename；回读失败按原内容回滚）。
4. 代码回滚：移除 `recipes:commit` 注册与提交按钮即可停用，IPC 为纯加法；内存索引替换不影响旧查询逻辑。
