# P-OPT4：ZIP 读取路径重构可行性评审

日期：2026-10-31
性质：**只读调查 + 方案设计**。本阶段未修改任何产品代码、现有测试或依赖，未实施重构。

## 0. 调查方式声明

| 手段 | 内容 |
| --- | --- |
| 静态阅读 | `src/main/scanner/zip.ts`、`jarScan.ts`、`iconPass.ts`、`pool.ts`、`scan.worker.ts`、`scanService.ts`、`recipes/{jsonSource,jarRecipes}.ts`、`modpack/modList.ts`、`schema/classParser.ts`、`codegen/emitDatapack.ts` |
| 全仓搜索 | `listEntries` / `readMany` / `readEntryBuffer` / `yauzl` 的**全部**调用点（见 §1） |
| 依赖文档 | `node_modules/yauzl/README.md`（v3.4.0）中 `openReadStream` / `close` / `eachEntry` 章节 |
| 只读实验 | `.cache/opt4/probe.cjs`（临时目录，不进入仓库），对真实 `TConstruct-1.20.1-3.11.2.166.jar` 做枚举与随机读 |
| 历史数据 | P-OPT1（遍历计数）、P-OPT2（写入队列）、P-OPT3（iconPass 轮次与耗时） |

工作区检查：`src/`、`tests/` 在 20:58 之后无改动，无并行修改冲突；项目无 `.git`，未执行任何 Git 操作。

## 1. 实际代码调用链

```
src/main/scanner/zip.ts   ← 唯一封装 yauzl 的模块（listEntries / readEntryBuffer / readEntryText / readMany / matchPrefixes）

调用方（全量搜索所得，7 处）：
  scanner/jarScan.ts:45      listEntries(jar) + :50 readMany(jar, wanted)      ← 物品首轮
  scanner/iconPass.ts:128    readMany(jar, names)                              ← 跨 jar 二次解析（3 轮 + 贴图轮）
  recipes/jsonSource.ts:146  listEntries(abs) + :155 readMany(abs, wanted)     ← 配方 JSON
  recipes/jarRecipes.ts:12   listEntries(jar) + :17 readMany(jar, wanted)      ← 单 jar 配方（内部使用）
  modpack/modList.ts:244     readMany(jar, META_ENTRIES)                       ← mods.toml 元数据（仅 detect）
  schema/classParser.ts:375  listEntries(jar) + :381 readMany(jar, wanted)     ← 类名/字段声明
  codegen/emitDatapack.ts:208 listEntries(jar)                                 ← 生成前查重
```

链路级视图：

```
modpack:import → detectMetadata → scanModMetadata → readMany(jar,{mods.toml,…})      ← 每 jar 1 次遍历，无前置 list
modpack:scan
 ├ scanItems → runJarPool(8 lane) → scanJar
 │    ├ listEntries(jar)        ← 遍历 1
 │    └ readMany(jar, wanted)   ← 遍历 2（重新枚举同一份中央目录）
 ├ resolveMissingIcons
 │    └ 轮 0/1/2 + 贴图轮 → readMany(jar, names)  ← 同一 jar 可能被遍历 1–4 次
 ├ scanJsonRecipes → jarRecipes/jsonSource
 │    ├ listEntries(jar)        ← 遍历 1
 │    └ readMany(jar, wanted)   ← 遍历 2
 └ buildIndex / corpus / meta（不读 zip）
```

**核心问题**：`readMany` 内部是「重新 `yauzl.open` → 逐条 `readEntry()` 直到 `end`」，所以每个调用点都会把该 jar 的中央目录再走一遍；凡「先 list 再 read」的地方必然是 2 次遍历。

## 2. API 与依赖版本

| 项 | 事实 |
| --- | --- |
| 依赖 | `yauzl@3.4.0`（`package.json` 与 `node_modules` 一致） |
| 打开方式 | `yauzl.open(path, { lazyEntries: true, autoClose: false, decodeStrings: true })`（`zip.ts:19`） |
| 列目录 | `listEntries` 监听 `entry` 事件逐个收集 `fileName` / `uncompressedSize`，`end` 时返回数组，随后 `close()` |
| 批量读 | `readMany` 在每个 `entry` 回调里过滤 `wanted`，命中则 `openReadStream` 读取；读完再 `readEntry()` 推进；`end` 时 resolve，最后 `close()` |
| 单条读 | `readEntryBuffer` 打开新句柄，顺序推进到目标条目后读取，随后 `close()` |

yauzl README（v3.4.0）明确：

- `openReadStream(entry)` 的 `entry` **必须来自同一个 `ZipFile`**；
- 「若希望在迭代结束后仍调用 `openReadStream`（例如先用 `Array.fromAsync()` 收齐条目），把 `autoClose` 设为 `false`，用完再手动 `close()`」——**这正是候选方案的前提**；
- 「若 zipfile 已关闭，`callback` 会收到一个 `err`」；
- 迭代状态保存在 `ZipFile` 上，不能重置、不能拿到同一批 `Entry` 两次。

## 3. 只读实验证据（真实 jar，TConstruct，29,731 条目）

脚本：`.cache/opt4/probe.cjs`（临时目录，未进入仓库）

```json
{
  "jar": "TConstruct-1.20.1-3.11.2.166.jar",
  "yauzl": "3.4.0",
  "enumerateMs": 1377,                 // 枚举全部 29,731 条目
  "entryCount": 29731,
  "sessionSequential200Ms": 44,        // 枚举后顺序随机读 200 个条目
  "sessionSeqBytes": 129463,
  "sessionParallel8Lane200Ms": 11,     // 同上，8 并发
  "parallelEqualsSequential": true,    // 并发结果与顺序读取逐字节一致
  "sizeMatchesEntry": true,            // 读出的长度 == entry.uncompressedSize
  "openAfterClose": "error: closed",   // 关闭后 openReadStream 报错
  "legacy3xReadManyMs": 4491,          // 现有 readMany 连调 3 次（每次重新枚举）
  "session1EnumPlus3x200ReadsMs": 69,  // 1 次枚举 + 3×200 次随机读
  "sessionTotalMs": 1426,
  "open8HandlesMs": 9,                 // 同时打开 8 个 jar 句柄
  "open8HandlesOk": true
}
```

可直接得出的结论（**已测量**）：

1. **一次遍历 ≈ 1.38s（29.7k 条目）**，而「枚举后随机读 200 条」只要 **44ms（顺序）/ 11ms（8 并发）**——遍历成本与读取成本不是一个量级。
2. 现有 `readMany` 连调 3 次 = **4,491ms ≈ 3 × 1,497ms**，几乎全是重复枚举；同样工作用「1 次枚举 + 3 轮随机读」= **1,426ms**，约 **3.1×**。
3. 关闭句柄后 `openReadStream` 立即报 `closed`——**索引对象不能脱离句柄使用**。
4. 同一句柄上 8 路并发读取结果与顺序读取逐字节一致（yauzl 用带偏移的 positioned read）。
5. 同时打开 8 个 jar 句柄只需 9ms，成本可忽略（但**长时间持有**的语义风险另说，见 §5）。

## 4. 句柄生命周期（现状 vs 候选）

现状（每个 API 调用自成一个生命周期）：

```
open(path, autoClose:false)
   ├ listEntries : 监听 entry → end → close()
   ├ readMany    : 监听 entry → 命中则 openReadStream → end → close()
   └ readEntryBuffer: 顺序推进到目标 → 读取 → close()（未命中则 end → 返回 null）
异常：任何 'error' / readStream error → reject，最后必然走 close()
取消：当前**不接受 AbortSignal**，调用方只能在两次调用之间检查取消
```

候选会话（方案 C/D）：

```
session = openJarSession(path)   // autoClose:false
   ├ entries = await session.list()        // 1 次遍历，缓存 name → Entry
   ├ await session.read(name)              // openReadStream(entry)，可并发
   └ session.close()                       // 必须显式调用（try/finally）
失效点：close() 之后所有 read 立即失败；Entry 对象仍存在但不可用
```

## 5. 并发与取消风险清单

| 风险 | 说明 | 依据 |
| --- | --- | --- |
| 句柄泄漏 | 会话需显式 `close()`；异常路径必须 `finally` 关闭 | 现状 `zip.ts` 已用 `finally { closeQuietly(zip) }`，可沿用 |
| 关闭后误用 | 关闭后 `openReadStream` 报 `closed`，不会静默返回空 | 实验 `openAfterClose: "error: closed"` |
| 跨 worker 共享 | **不可行也不必要**：worker 各有独立模块实例，`Entry` 对象属于创建它的 `ZipFile`，不能跨线程传递 | yauzl 文档 + Node worker 结构化克隆限制 |
| 同 worker 内并发 | 同一句柄多路 `openReadStream` 已验证安全（8 路逐字节一致） | probe |
| 中途取消 | 现状无信号；会话化后可传入 `AbortSignal`，在 `read()` 与批次之间检查，并 `close()` | 需在实施时新增，当前无 |
| 长时间持有 | 若跨阶段持 295 个句柄，句柄数与内存（Entry 数组 295×~1k 条）同时上升；Windows 上文件被占用会影响外部工具 | 实验只证明「能同时开 8 个」，未验证 295 个 |
| 文件被外部改动 | 句柄持有期间 jar 被替换/删除，读取可能读到旧数据或失败 | 未测；扫描期间修改 mods 属异常场景 |
| 死锁 | 会话只做顺序读 + positioned read，无锁；仅需保证 `close()` 不被并发调用两次 | 静态分析 |

## 6. 方案对比

| 维度 | A 保持现状 | B 每 jar 建索引、读取仍用现有 API | C 受控读取会话（跨多次读取持句柄） | D 单次遍历 API：list + read 合一（推荐） |
| --- | --- | --- | --- | --- |
| 做法 | 不动 | 缓存「name → 条目名/大小」，读取仍 `open`+枚举 | `openJarSession`：一次枚举，跨调用复用句柄 | 新增 `listAndRead(jar, matcher)`：一次遍历里同时产出条目表与目标字节，调用结束即关闭 |
| 能消掉的遍历 | 0 | **0**（仍要枚举才能定位条目） | 同一 jar 的多轮读取只枚举 1 次 | 每个「先 list 再 read」调用点从 2 次 → 1 次 |
| 预期收益 | — | 无（只省内存分配） | iconPass 3 轮合并 ≈ 2–3s（推断） | pool/recipes 各去掉一次遍历 ≈ 6–8s（推断） |
| 内存 | 最低 | 低 | 中（每 jar 的 Entry 数组 + 句柄） | 低（单次调用内的临时 Map） |
| 句柄成本 | 每调用即开即关 | 同左 | 长生命周期，需严格 finally | 单次调用内持有，风险等同现状 |
| 实现复杂度 | — | 低但无收益 | **高**（生命周期 + 取消 + 并发约束） | **中低**（一个函数，内部即开即关） |
| 并发风险 | 无 | 无 | 中（跨调用共享句柄） | 低（不跨调用） |
| 取消/异常 | 现状 | 现状 | 需新增信号与清理 | 与现状一致（finally 关闭） |
| 对调用方影响 | 无 | 需改 7 处签名 | 需改 4–5 处为会话风格 | 新增 API，逐点替换，旧 API 保留 |
| 回滚难度 | — | 容易 | 中（调用方结构变化） | **容易**（保留 `readMany`，逐点回退） |

补充方案 D2（备选，未推荐）：引入支持随机访问的新库或自己解析中央目录（记录 `relativeOffsetOfLocalHeader` 后自行 seek）——能连 `listEntries` 的遍历也省掉，但要重写解压/校验逻辑，风险与收益不成比例。

## 7. 收益估算与证据等级

### 7.1 已测量事实

| 事实 | 数值 | 来源 |
| --- | --- | --- |
| 枚举 29,731 条目 | 1,377ms | probe |
| 枚举后读 200 条 | 44ms（顺序）/ 11ms（8 并发） | probe |
| 3 × `readMany`(200) | 4,491ms | probe |
| 1 次枚举 + 3×200 读 | 1,426ms | probe |
| 一次冷启动的归档遍历 | **1,489 次（590 list + 899 readMany）／1,447,083 条目回调** | P-OPT1 |
| iconPass | 170 次 readMany / 567,992 条目 / 8.4–9.1s | P-OPT3 |
| 池（items） | 295 list + 295 readMany / 615,498 条目 | P-OPT1 |
| 配方 | 295 list + 139 readMany / 570,342 条目 | P-OPT1 |
| detect | 295 readMany / 307,749 条目 | P-OPT1 |

### 7.2 由数据推断（未单独实测）

按「每次遍历成本 ≈ 条目数 × 15µs」（由 568k 条目/8.4s 与 29.7k 条目/1.38s 两条独立数据点一致得出）：

| 改造点 | 可去掉的遍历 | 折算 |
| --- | --- | --- |
| 池：`list + readMany` → 单次遍历 | 307,749 条目 | ≈ 4.6s |
| 配方：`list + readMany` → 单次遍历 | 263,593 条目 | ≈ 3.9s |
| iconPass：多轮会话 | 约 220,000 条目（170→104 次遍历） | ≈ 3.3s |
| **合计（上限）** | ≈ 790,000 条目 | **≈ 11–12s** |

### 7.3 尚未验证的假设

1. 上表把遍历成本当作线性且可与读取并行；实际 wall clock 收益可能低于累加值（磁盘/CPU 重叠）。
2. 未验证 295 个句柄同时持有（只测了 8 个）。
3. 未验证「会话化后取消扫描」的实际行为（当前代码路径没有信号）。
4. 未验证 detect 阶段与扫描阶段共享遍历的可行性（生命周期不同，本轮不纳入）。
5. 因此**不承诺任何具体的秒数收益**；只能说「结构上可从 1,489 次遍历降到约 590–700 次」。

## 8. 推荐方案

**推荐 D（单次遍历 API），并把 C 作为第二阶段的可选增量。**

理由：

1. 池与配方是「先 list 再 read」的典型 2 次遍历，D 用一次遍历同时产出「条目表 + 目标字节」即可，**不需要跨调用持有句柄**——风险与现状完全同级（单次调用内 `finally close`）。
2. 收益最大的一块（≈8.5s 推断）正好落在 D 覆盖的范围内。
3. iconPass 的 3 轮读同一 jar 才是 C 的适用场景，但收益仅约 3.3s，且要引入长生命周期句柄、取消语义与并发约束；在 D 落地并验证稳定后再评估。
4. 方案 B 已验证无收益（读取仍要枚举才能定位），排除。
5. 方案 D2（自研随机读）风险过高，不符合「不重写解压/校验」的边界。

D 的 API 草案（**仅为设计，未实现**）：

```ts
export interface JarListing { entries: { fileName: string; uncompressedSize: number }[] }
export function listAndRead(
  path: string,
  matcher: (fileName: string) => boolean,
  options?: { signal?: AbortSignal }
): Promise<{ listing: JarListing; buffers: Map<string, Buffer> }>
// 语义：单次遍历；命中 matcher 的条目在遍历过程中读取；
//      未命中条目仅记录名字与大小；结束时统一 close()。
```

## 9. 未来实施的分阶段计划、回滚与门禁

### 阶段划分（每阶段独立可回滚）

| 阶段 | 范围 | 回滚 |
| --- | --- | --- |
| S1 | 新增 `listAndRead`（不改任何调用方），补齐单测 | 删除新函数即可，零影响 |
| S2 | `jarScan` + `jsonSource` + `jarRecipes` + `classParser` 改用 `listAndRead` | 逐文件回退到 `listEntries + readMany`（旧 API 保留） |
| S3 | 视 S2 结果评估 iconPass 会话化（C），单独授权 | 回退到 `readMany` 路径 |
| S4 | （更远）评估 detect 复用遍历 | 独立开关 |

### 未来验收门禁（本阶段只设计，不执行）

1. `zip` 读取 API 单测：`listAndRead` 的条目表与 `listEntries` 逐项一致；命中/未命中/空 matcher。
2. 重复读取（同名多次）、缺失条目、读取异常（损坏 jar）、取消与资源释放（`close` 被调用、无泄漏）。
3. 并发：8 lane 同时读不同 jar；同一 jar 串行两次；`worker` 模式下与 inline 模式结果一致。
4. 现有扫描与配方索引回归（`scanPipeline`、`recipeIndex`、`scriptSource`、`scanRecipes` 相关）。
5. 全量 `vitest run`。
6. `tsc --noEmit -p tsconfig.node.json` / `tsconfig.web.json`。
7. `eslint . --ext .ts,.tsx --max-warnings=0`。
8. `electron-vite build`。
9. P-C5/P-C6 定向：`commitIndexCache`、`commitFailurePaths`、`commitRecipe`。
10. P-C7 真实 Electron 八场景（`.cache/e2e-pc7.mjs`）。
11. 真实包冷启动 A/B：独立 `userData`，记录 `iconFiles/cacheFiles` 起始值，同机交替跑，至少 3 次；不得把暖缓存当冷启动。
12. 新旧扫描结果逐项对比，必须保持：43,474 items / 38,760 icons / 4,714 missing / 32,890 recipes / 426 types / 5,334 partial / 0 jar failures。

计时报告须分别给出 items / recipes / corpus / 完整扫描 / 端到端，并注明机器与磁盘状态。

## 10. 未确认问题

1. 295 个句柄同时持有在 Windows 上的实际表现（只测了 8 个）。
2. 会话化的取消语义（当前 `zip.ts` 不接受 `AbortSignal`）。
3. 遍历成本的线性模型在不同压缩率/磁盘上的偏差。
4. `listAndRead` 对**未命中条目**只记录名字与大小是否满足 `codegen/emitDatapack` 与 `classParser` 的全部用途（它们目前只需要 `listEntries` 的条目表）。
5. detect 与 scan 之间能否共享一次遍历（生命周期不同，需单独设计）。
6. 未验证 jar 在扫描期间被外部替换/删除时的行为。
7. 未在 CI 或第二台机器上验证任何结论。

## 11. 本阶段实际执行的只读检查

| 检查 | 结果 |
| --- | --- |
| `grep listEntries/readMany/readEntryBuffer/yauzl src/` | 7 个调用方，见 §1 |
| `node -e "require('yauzl/package.json').version"` | 3.4.0 |
| `grep -n openReadStream/close/entryCount node_modules/yauzl/README.md` | 得到「autoClose:false 可迭代后读」「关闭后报错」「迭代不可重置」三条依据 |
| `node .cache/opt4/probe.cjs` | 见 §3 的 JSON（枚举 1,377ms；3×readMany 4,491ms vs 会话 1,426ms；关闭后报错；8 句柄可开） |
| `find src tests -newermt` | 20:58 后无改动，无并行冲突 |

未执行：任何产品代码修改、任何构建、任何性能 A/B（本阶段不需要）。
