# P-OPT4-S1：`listAndRead` API 与单元测试

日期：2026-10-31
范围：按 P-OPT4 评审推荐的方案 D，**只新增 API 与测试**。未替换任何业务调用方，未改 `listEntries` / `readMany` 语义，未引入跨调用句柄。

## 1. 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/main/scanner/zip.ts` | 追加 `ListAndReadOptions` / `ListAndReadResult` / `listAndRead()`（约 110 行，含注释），未改动既有函数 |
| `tests/scanner/zipListAndRead.test.ts`（新增） | 13 条测试，全部使用真实临时 ZIP（`tests/helpers/zipWriter.ts`），覆盖正常/缺失/损坏/取消/并发/资源释放 |

未改动：`jarScan`、`iconPass`、`jsonSource`、`jarRecipes`、`classParser`、`modList`、`emitDatapack` 及任何 worker/调度/写入并发参数。

## 2. API 签名与语义

```ts
export interface ListAndReadOptions {
  matcher: (fileName: string, info: { uncompressedSize: number }) => boolean
  signal?: AbortSignal
}
export interface ListAndReadResult {
  entries: ZipEntryInfo[]      // 与 listEntries 完全一致
  buffers: Map<string, Buffer> // 命中且读取成功的条目
}
export async function listAndRead(path: string, options: ListAndReadOptions): Promise<ListAndReadResult>
```

| 语义 | 约定 |
| --- | --- |
| 遍历次数 | 一次 `yauzl.open` + 一次 `entry` 遍历；不调用 `listEntries`/`readMany` |
| `entries` | 与 `listEntries` 逐项一致：**排除**以 `/` 结尾的目录条目，保持中央目录顺序，`uncompressedSize` 原样 |
| `buffers` | 只含 `matcher` 命中且读取成功的条目；键为条目名；插入顺序 = 遍历顺序（确定性） |
| `matcher` | 接收 `(fileName, {uncompressedSize})`；应为纯判定，不得阻塞；**抛错原样传播**（不包装，保留对象同一性） |
| 重复条目名 | ZIP 允许同名多次出现：两条都会进 `entries` 并被读取，`buffers` 以最后一次为准（与 `readMany` 的 `Map` 语义一致） |
| 缺失条目 | 不抛错，`buffers` 中没有该键（不存在的名字不会命中 matcher） |
| 读取失败 | **整体 reject**，不返回部分结果；错误消息含 jar 路径与条目名，`cause` 为原始错误 |
| 打开/枚举失败 | reject，消息以「打开 jar 失败」/「遍历 jar 失败」开头 |
| 取消 | `signal.aborted` 时不打开文件，直接抛 `name='AbortError'`；遍历/读取中检测到中止则关闭句柄并抛同一类错误 |
| 返回值 | 只含普通数据，**不返回** `Entry`、`ZipFile` 或任何依赖句柄的对象 |

## 3. 句柄生命周期

```
listAndRead()
 ├ signal 已中止 → 抛 AbortError（不打开文件）
 ├ await open(path)            ← autoClose:false, lazyEntries:true
 ├ try:
 │    await new Promise（一次遍历）
 │      entry(目录) → readEntry()
 │      entry(普通) → 记录清单 → matcher
 │          ├ false → readEntry()
 │          └ true  → await readStream(entry) → buffers.set → readEntry()
 │      end → resolve
 │      任意失败/取消 → reject（settled 置位，停止推进）
 └ finally: closeQuietly(zip)   ← 成功、异常、取消三条路径都关闭
```

- 读取是**串行**的（读完一个条目再 `readEntry()`），与现有 `readMany` 相同，避免流与条目错位。
- 句柄只在本调用内持有，函数返回后不再需要任何句柄；跨调用零状态。

## 4. 取消、异常与并发

| 场景 | 行为 |
| --- | --- |
| 取消（调用前） | 不打开文件，直接 `AbortError` |
| 取消（遍历中） | 置 `settled` → reject → `finally` 关闭；不再调用 `readEntry()`，不再读取后续条目 |
| matcher 抛错 | 立即 reject 该错误对象本身（`expect(err).toBe(boom)` 已覆盖），句柄关闭 |
| 条目读取失败 | reject 包装后的 Error（`cause` 保留），**不返回已读到的部分** |
| 枚举/打开失败 | reject，句柄由 `finally` 关闭（若已打开） |
| 并发 | 不同 jar 各自独立句柄（测试用 4 个 jar `Promise.all` 验证）；同一 jar 不共享句柄 |
| 重复调用同一 jar | 每次独立开/关，互不影响（与现状一致） |

## 5. 新增测试（13 条，全部真实文件）

| # | 用例 | 断言要点 |
| --- | --- | --- |
| 1 | 一次遍历返回清单与命中内容 | 清单顺序、buffer 内容与键顺序 |
| 2 | 清单与 `listEntries` 完全一致 | `toEqual` 整个数组（含顺序与大小） |
| 3 | 无命中 | 清单完整、`buffers` 为空 |
| 4 | 请求不存在的条目 | 不抛错、`buffers.has('nope.txt') === false` |
| 5 | 重复条目名 | `entries` 中 2 条；`buffers` 取最后一次（`v2`） |
| 6 | 目录条目 | 不进清单，也不传给 matcher |
| 7 | 条目读取失败 | 篡改中央目录 `uncompressedSize`（声明 10 / 实际 4096）触发真实读取错误；整体 reject 且消息含条目名；文件可被重命名（句柄已释放） |
| 8 | 打开/枚举失败（非 zip） | 抛「打开 jar 失败」，文件可重命名 |
| 9 | 截断 zip | 枚举阶段失败 |
| 10 | matcher 抛错 | `expect(err).toBe(boom)` 原样传播 |
| 11 | 取消（调用前 / 遍历中） | 均抛 `name='AbortError'`；中途中止后不返回部分结果；文件可重命名 |
| 12 | 并发 4 个不同 jar | 各自结果正确、互不干扰 |
| 13 | 与 `readMany` 逐字节一致 | 键集合一致，`Buffer.equals` 全部为真 |

**资源释放证据**用「文件可被重命名」而不是删除：Windows 上被占用的文件无法 `rename`，且 `rename` 不受本机 safe-delete 守卫影响（`rm` 会被守卫拦截，导致全量运行时误报——该误报首次出现时已记录，改为 `rename` 后复跑通过）。

## 6. 性能基准（真实 jar，只测单次调用，不代表整包冷启动）

输入：`TConstruct-1.20.1-3.11.2.166.jar`（27,493 条目），
matcher = `name.includes('/models/') || (name.startsWith('assets/') && name.includes('/textures/item/'))`，
同一匹配集（12,733 个条目、2,795,559 字节）。通过包装 `yauzl.open` 统计归档打开次数（= 遍历次数）。

| 轮 | 方案 | 耗时 | open 次数 | 条目数 | 读取条目 | 字节 | 内容一致 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `listEntries + readMany` | 3,946ms | **2** | 27,493 | 12,733 | 2,795,559 | — |
| 1 | `listAndRead` | 2,486ms | **1** | 27,493 | 12,733 | 2,795,559 | ✅ |
| 2 | `listEntries + readMany` | 3,802ms | **2** | 27,493 | 12,733 | 2,795,559 | — |
| 2 | `listAndRead` | 2,655ms | **1** | 27,493 | 12,733 | 2,795,559 | ✅ |

单次调用：打开次数 2 → 1，耗时下降 **30.2% / 37.0%**，清单与字节**完全一致**。
（脚本：`.cache/opt4s1/bench.cjs` + `zip.bundle.cjs`，临时目录，未进入仓库。）

**这不能换算成整包收益**：真实扫描里池/配方的 `list + readMany` 是两次遍历，理论可各去一次，但 wall clock 受磁盘与解压重叠影响，需 S2 替换后用同状态 A/B 实测。

## 7. 验收命令与真实结果

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `vitest run tests/scanner/zipListAndRead.test.ts` | 0 | **13/13** |
| `vitest run`（zip + scanPipeline + recipeIndex + scriptSource） | 0 | 4 文件 / 50 通过 |
| `tsc --noEmit -p tsconfig.node.json` | 0 | — |
| `tsc --noEmit -p tsconfig.web.json` | 0 | — |
| `eslint . --ext .ts,.tsx --max-warnings=0` | 0 | — |
| `electron-vite build` | 0 | — |
| `vitest run`（全量） | 0 | **51 文件通过 / 2 跳过；546 通过 / 4 跳过**（基线 50/533 → +1 文件、+13 用例） |

首次全量曾出现 4 条失败，原因是我在测试里用 `fsp.rm` 证明句柄释放，被宿主 safe-delete 守卫拦截（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），**不是产品缺陷**；
改为「`rename` 可成功」后，单测 13/13、全量 546/546 均通过。该调整保留了「真实证明文件未被占用」的强度。

## 8. 与旧 API 的兼容性

- `listEntries` / `readMany` / `readEntryBuffer` / `readEntryText` **一字未改**，现有 7 个调用方零影响。
- `listAndRead` 是纯新增导出，无副作用、无模块级状态。
- 未引入句柄缓存、未改 worker 数量、未改图标写入并发（24 保持不变）。

## 9. 未解决风险与限制

1. **未替换调用方**：真实收益未验证（本阶段按授权不做）。
2. **串行读取**：单 jar 内读取仍逐条 `await`（与 `readMany` 相同）；未评估「多流并发」是否会更快或破坏 yauzl 的条目推进约定。
3. **matcher 约束未强制**：若调用方在 matcher 里做重活，会拖慢遍历（已在注释约定，未做运行时校验）。
4. **仅 Windows 验证**：`rename` 作为释放证据依赖 Windows 的文件占用语义；POSIX 下该断言恒真，弱化但不会误报。
5. **未验证**：同一 jar 被并发调用（两个 `listAndRead` 同时打开的）行为；虽然各自独立句柄，但未写用例。
6. 未在 CI 或第二台机器验证。

## 10. 停止点

S1 完成：只新增 API 与测试，未替换任何调用方，未开始 S2。
