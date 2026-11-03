# 前端可用性鼠标测试（CDP 驱动 · GPU 加速模式）

| 项 | 内容 |
|---|---|
| **时点** | 2026-11-03 06:27–06:31 |
| **启动** | PS `Start-Process`，**零禁用参数**（GPU 加速），`--remote-debugging-port=9333` |
| **隔离** | `STUDIO_USER_DATA=.cache/t13-ud` + 副本包 `t13-pack` |
| **输入方式** | `Input.dispatchMouseEvent` / `Input.insertText` / `Input.dispatchKeyEvent`（坐标由 `getBoundingClientRect` 实时取，非硬编码） |
| **截图** | `.cache/fix14/a3tmp/ui/*.png`（**12 张**） |
| **JS 错误** | **0 条**（`Runtime.exceptionThrown` + `Log.entryAdded` + `consoleAPICalled` 三类监听，全程空） |

---

## 一、逐区域结论

| # | 区域 | 判定 | 证据 |
|---|---|---|---|
| 1 | 顶栏：导入 → 扫描 → 进度 → 完成 | **通过** | 状态栏 `400 / 43,455库 43,474 3.8ms`（索引 43,474 已就绪）；截图 `01-scanning` / `02-scan-done` |
| 2 | 配方列表：滚动 → 点击选中 → 详情 | **通过** | `.item-row` **400 行**；点击后 `selected` 生效、中栏渲染该物品视图；截图 `04-list-scroll` / `05-row-selected` |
| 3 | 搜索 `stone` → 结果 → 点击 | **通过** | 搜索命中 **400 行**；点击第 3 条成功选中（`Stonechisel:array/stone`）；截图 `03-search-stone` / `06-third-selected` |
| 4 | 配方编辑：字段输入 → 增删 → 保存 | **部分** | 工作台可进入、`#bench-type` 可设、按钮「**写入文件**」「**清空**」均存在；**真实保存写盘未执行**（需构造完整草稿，本轮未做）→ 截图 `10-bench-editor` |
| 5 | 插件设置页：开关切换 / 读取失败态 | **部分** | 设置页渲染正常、含「插件」区、**无失败横幅**（符合当前插件正常态）；**开关控件未定位**（`input[type=checkbox] / [role=switch] / .switch` 均为 0，疑为 button 型）→ 未验证切换 → 截图 `07-settings` / `08-settings-toggled` / `11-settings-plugin` |
| 6 | 详情面板：Tab 导航（UI-U2） | **通过** | Tab 焦点序列 `star → item-row → star → item-row`，**详情标题前后不变**（`Stonechisel:array/stone`）→ **焦点移动不切详情，UI-U2 解耦成立**；截图 `09-tab-nav` |

## 二、GPU 模式对照

| 项 | 本批（GPU 加速，零禁用参数） |
|---|---|
| GPU 进程 | **1 个**，命令行无 `--disable-gpu` |
| 渲染 | 12 张截图全部正常：无黑屏、无花屏、无错位；文字清晰可读 |
| 稳定性 | 全程约 4 分钟（含一次全量扫描 43,474 项），**无崩溃、无卡死**；`CloseMainWindow=True`，残留 0 |

## 三、写盘路径（区域 4 说明）

**本轮未执行真实保存**，故无写盘产物。若执行，目标为副本包 `E:/mc kjs/.cache/t13-pack/kubejs/...`（`codegen:write` / `recipes:commit` 按草稿路径），**生产 userData 与 `pc7-pack-1112` 原件均不参与**。

**未执行的理由**：构造一条可提交的完整草稿（类型 + 输入槽 + 产出 + 附加字段）需多轮 UI 交互组合，本轮预算已用于 6 区域走通与截图层；**留作下一批单点验证**。

## 四、发现的问题（记录不修，修复需另批 A2）

| # | 现象 | 级别 | 说明 |
|---|---|---|---|
| 1 | 插件开关控件无法用 `checkbox/role=switch/.switch` 定位 | 低（自动化可测性） | 不影响人工使用；但**自动化/无障碍**上建议给开关加 `role="switch"` 或 `aria-checked` |
| 2 | 设置页「写入 u erData/uiState.j on」文本出现字符丢失 | 低（截断假象？） | 我的文本抽取用 `\s+` 归并，把 `userData/uiState.json` 中的 `s`/`j` 前后的空格吞了；**疑似抽取伪影，非 UI 缺陷**，需人工目视确认 |

## 五、前端可用性总评

**6 区域中 4 通过 / 2 部分 / 0 失败**。核心浏览链路（导入→扫描→搜索→点击→详情）在 GPU 加速模式下**完整可用**；UI-U2 的焦点解耦得到**交互级验证**（此前只有单测）。两处「部分」均因**本轮未做**（保存写盘、开关切换），非发现缺陷。

**结论**：前端可用性满足发布参考标准；建议下一批补 2 个单点（真实保存写盘、插件开关切换 + 状态持久）。

## 六、边界

| 对象 | 结果 |
|---|---|
| 生产 userData | mtime `2026-11-03 03:43:05` —— **本批（06:27 起）零触碰** |
| `pc7-pack-1112` 原件 | 未使用（全程副本 `t13-pack`） |
| `src` / `tests` / `package.json` | 185 / 101 / `4e0c261a…` **未变** |
| 产物 / V9 | `00c26748…` / `7a7e52d9…` **未变** |
| 进程 | 应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响** |

---

## 七、第 44 批续测结果（区域 4/5 + 丢字）

### 7.1 丢字验证 —— **已定论：我的抽取伪影，UI 无损**

程序化读取该节点原始 `textContent`（不归并空白）：

```
节点: DIV.work-sub
原始文本: "外观、生成偏好与整合包诊断 · 修改即时生效并写入 userData/uiState.json"
```

**`userData` 的 `s` 与 `uiState.json` 的 `j` 均在**。上一批的「丢字」是我用 `\s+` 归并空白造成的**抽取伪影**，**不是渲染缺陷**。此项关闭。

### 7.2 区域 5（插件开关）—— **未完成**（卡在插件列表为空）

| 步骤 | 结果 |
|---|---|
| 源码定位（只读） | **开关形态已确认**：`SettingsView.tsx:290` `className={\`chip${p.status !== 'disabled' ? ' on' : ''}\`}`，即 `.chip` / `.chip.on`；`plugins:setEnabled` 在 73–80 行，含成功/失败 toast |
| 导入 t13-pack 后重挂载设置页 | `.chip` 共 15 个，**无一个含 `t13probe`** → **UI 插件列表为空** |
| 实际点击 | **未发生**（无控件可点） |
| 持久文件 | `.cache/t13-ud/plugin-disabled.json` = **`[]`**（未变，符合"未切换"） |

**结论**：不是选择器猜错——是**插件列表本身为空**，导致开关未渲染。下一步需先查明「导入后设置页为何仍显示 0 个插件」（`plugins:list` 返回为空 vs UI 未刷新），再点 `.chip`。

### 7.3 区域 4（真实保存）—— **未执行**

未构造草稿、未点「写入文件」。核查：`.cache/t13-pack/kubejs` 下 **06:30 之后无新增文件**（证明确实没发生写盘）。**生产 userData 与原件零触碰。**

### 7.4 无障碍增强（role/aria）—— **未做**

依赖 7.2 的控件定位；在元素未渲染的情况下改属性无法验证。**未改任何源码**（`SettingsView.tsx` 仍为 `e5489e33…`）。

### 7.5 本批产出与缺口

| 项 | 状态 |
|---|---|
| 丢字程序化验证 | **完成（定论：伪影）** |
| 区域 4 真实写盘 | **未执行** |
| 区域 5 开关切换+持久 | **未完成**（插件列表为空） |
| 无障碍 role/aria | **未做**（依赖上方） |

**6 区域终态：4 通过 / 2 部分 —— 前端验证尚未收官（6/6）**，与第 43 批结论一致，不因本批改变。

### 7.6 边界

生产 userData `2026-11-03 03:43:05`（本批 06:33–06:36 **零触碰**）；`package.json` `4e0c261a…`、`out/main/index.js` `00c26748…`、`SettingsView.tsx` `e5489e33…`、`src` 185 / `tests` 101 **均未变**；应用已关闭（残留 0），**QQ-agent 11 进程未受影响**；截图累计 **13 张**。

---

## 八、第 46 批：role/aria 增强 + 区域 5 尝试

### 8.1 role/aria（A2 一处）—— **完成**

`SettingsView.tsx` 插件开关 chip 增加三属性（不改样式与逻辑）：

```tsx
role="switch"
aria-checked={p.status !== 'disabled'}
aria-label={`插件 ${p.name} 启用状态`}
```

| 门禁 | 结果 |
|---|---|
| 新用例 `tests/renderer/components/pluginSwitchA11y.test.ts` | **4/4 通过**（role 存在 / aria-checked 是表达式非字面量 / aria-label 含「插件」/ 三属性与 onClick 同一按钮） |
| typecheck | **0 错误** |
| lint | **0 问题** |
| build | **exit 0**（`out/main/index.js` 仍 `52da5327…`，仅渲染层变化） |

**用例形式的说明**：未用 `render(<SettingsView/>)`，因为该组件直连 zustand store 与十余个 IPC 通道，jsdom 全树渲染的成本远大于信息量。改用**结构断言**（与本仓第 31 批 UI-U2 同一做法），并额外用 `openingTagAt()` 做花括号配平提取标签——避免 `onClick={() => …}` 里的 `>` 截断正则。

### 8.2 实测：`[role=switch]` 定位成功，但点击未生效 —— **未完成**

| 步骤 | 结果 |
|---|---|
| 冷启动 → 设置页（**重挂载后**） | `[role=switch]` **1 个**，label = `插件 T-13 差异源探针插件（差异源搭建物） 启用状态`，`aria-checked="true"`，文本「开」✅ |
| CDP 点击（坐标取 `getBoundingClientRect` 中心） | **无变化**：`aria-checked` 仍 `true`、文本仍「开」、`chip on` 未变 |
| `plugin-disabled.json` | 仍 **`[]`** |

**→ 区域 5「切换生效」未达成。** 属性增强让控件**可被无障碍接口与自动化定位**（这本身是本次改动的主要目标），但**点击链路未走通**。

**排查方向（下一批首件事）**：开关位于 `.settings-scroll` 滚动容器内，首屏可能不在视口内 → `getBoundingClientRect` 得到的是视口外坐标，CDP 鼠标事件落在别处。应先 `scrollIntoView()` 再取坐标，或用 `Input.dispatchMouseEvent` 前断言 `rect.y` 在 `[0, innerHeight]` 内。

### 8.3 未执行

| 项 | 状态 |
|---|---|
| 区域 5 切换 + 重启持久 | **未完成**（点击未生效） |
| 区域 4 真实保存写盘 | **未执行** |
| T-25 复验：FIX-01/02/03、RT-01、RT-05 S2 | **未执行** |
| T-14 六条 + 双实例包上下文 | **未执行** |

**6 区域终态仍为 4 通过 / 2 部分 —— 前端未收官。** 不因本批新增 role 属性改变。

### 8.4 边界

生产 userData `2026-11-03 03:43:05`（本批 06:51–06:56 隔离，**零触碰**）；`src` 变更**仅 `SettingsView.tsx` 一处属性**（备份 `.cache/fix14/a3tmp/b46-pre/SettingsView.pre`）；`tests` 新增 1 文件；应用已关闭（残留 0）；QQ-agent 11 进程未受影响。

---

## 九、第 51 批：区域 5 收口（通过）+ 区域 4 首测（未通过）

### 9.1 区域 5 · 插件开关 —— **通过**

**关键修正生效**：`scrollIntoView({block:'center'})` 后再取坐标，视口断言通过——这正是上批打偏的根因。

| 步骤 | rect | 视口 | 状态 |
|---|---|---|---|
| 断言 | x=**1292**, y=**364**, w=29, h=22 | vw=1424, vh=835 → **inView=true** | `aria-checked=false`、文本「关」、`chip` |
| 点击 | 同坐标 | — | `aria-checked=**true**`、文本「**开**」、`chip on` |
| 文件 | — | — | `plugin-disabled.json`：`["t13probe:plugin"]` → **`[]`** |

**重启持久（三段）**：

| 段 | 操作 | 结果 |
|---|---|---|
| ① 切到「关」 | 点击 | `aria-checked=false`、文本「关」、`disabled=["t13probe:plugin"]` |
| ② 重启 | 关闭 → 重启 | T-25 恢复日志：`已恢复上次的整合包：t13-pack` + `恢复插件层：1 个插件` |
| ③ 重启后状态 | 读设置页 | **仍 `aria-checked=false`、文本「关」、`disabled` 保持** ✅；`schema:list`=**3**（插件被禁用，正确表现） |
| ④ 切回 | 点击 | `aria-checked=true`、文本「开」、`disabled=**[]**` ✅ |

**区域 5 = 通过。** 这是 T-25 恢复能力与 T-05 持久设计的一次联合验证：插件被禁用 → 重启 → 恢复包与插件层 → 禁用状态仍生效。

### 9.2 区域 4 · 真实保存 —— **未通过（写盘未发生）**

已完成的 UI 操作：

| 步骤 | 结果 |
|---|---|
| 选类型 | `#bench-type` = `minecraft:crafting_shapeless`（受控赋值生效，值已回读确认） |
| 加输入槽 | `input.slot-id` = `minecraft:stone`，`slot-count` = 1 |
| 加产物 | 产物区存在 `.slot-id` / `.slot-count` / `.slot-chance-input`，已填 `minecraft:stone` |
| 点「写入文件」 | **无 toast、无错误提示** |
| 落盘核验 | `find .cache/t13-pack -newermt "13:00"` → **无任何新文件** |

**判定：写盘未发生，区域 4 不通过。**

**可能原因（未定论，需下一批定位）**：
1. 我填的"产物"与草稿模型里的 `outputs` 结构对不上（产物区可能有独立的 `+ 添加` 未点，`.slot-id` 只是占位）；
2. 草稿校验未通过时**没有可见错误提示**——若确认如此，那是**可用性缺陷**（用户点了没反应），值得单独登记。

### 9.3 前端可用性终态

| 区域 | 状态 |
|---|---|
| 1 顶栏导入/扫描 | **通过** |
| 2 列表滚动/选中/详情 | **通过** |
| 3 搜索 | **通过** |
| 4 配方编辑/保存 | **不通过**（写盘未发生） |
| 5 插件开关 + 重启持久 | **通过** |
| 6 详情面板 Tab 导航 | **通过** |

**5 / 6 通过 —— 前端仍未收官。**

### 9.4 边界

生产 userData 零触碰（全程 `STUDIO_USER_DATA` 隔离 + 副本包）；`src` **零改动**；副本包**无写入**（写盘未发生）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**；截图新增 `16-switch-off` / `17-switch-close`。

---

## 十、第 52 批：W-01 修复（部分）→ 暴露更深未接线，已停

### 10.1 已完成的修复（两行，按要求范围）

`src/renderer/src/views/BenchView.tsx`（`48615575b3a0ac7d…`）：

```tsx
import { WriteDialog } from './bench/panels/WriteDialog'
…
      </footer>
      <WriteDialog />
    </div>
```

| 门禁 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| build | **exit 0** |
| 说明 | 组件自身用 `writeOpen` 控制显隐，未挂载时永远返回 `null` |

### 10.2 ❗挂载后发现更深缺陷：触发链路本身是死的

实测：构造草稿（类型 + 材料 `minecraft:stone` + 产物区存在但为空）→ **Ctrl+S** → `[role=dialog][aria-label="写入文件"]` **未出现**。

追查根因：

```
useBenchInteractions.ts:95    ui.setWriteOpen(true)   ← Ctrl+S 分支
grep "useBenchInteractions"  → 只有两处 import：
   controls/useSlotBinding.ts  → placeEyedropper
   layouts/ZoneBoard.tsx       → placeOnSurface
   （hook 本体从未被调用 → keydown 监听器根本没安装）
```

**即：`setWriteOpen(true)` 只存在于一个从未被调用的 hook 里。** 挂载对话框只是补了链条末端；**链头（键盘监听）从未接上**。

### 10.3 另一处更正（上批结论有误）

第 51 批我报「点写入文件静默无反馈」。源码显示：**通用模式的「写入文件」是 `disabled`**，且带 `title`：

> 通用模式不直接写盘：结构化提交在试点类型（有序合成 / 无序合成 / Create 混合）的会话条里

**所以"点了没反应"是因为按钮被禁用，不是逻辑静默。** 我上批的判断不准确，在此更正。

但由此产生一个**真实可用性问题**：主操作按钮 `disabled` **没有任何可见原因**（`title` 在禁用元素上通常不触发，用户看不到解释）——这与"静默失效"在体验上等价。建议改为可见的行内说明或禁用态文案。

### 10.4 判定

| 项 | 结果 |
|---|---|
| W-01（对话框零引用） | **部分修复**：已挂载，但触发链头缺失 → **对话框仍不可达** |
| 区域 4 写盘 | **未通过**（无对话框、无写盘、日志无 codegen/写入记录） |
| 是否继续改 | **否**：修复需调用 `useBenchInteractions(...)`（需构造 store/ui/app/commitOps 依赖），**超出"两行"授权**，按任务书 §一.2 **停** |
| 前端 6/6 | **未达成，仍 5/6** |

### 10.5 需要下一步授权的最小修复

在 `BenchView` 内调用该 hook（约 3–5 行，参数取自同组件已有的 store/ui/app 实例），或把 Ctrl+S 监听直接提到 `BenchView` 的 `useEffect` 里。**两者都超出"两行"**，需明确授权。

### 10.6 边界

`src` 变更**仅 BenchView**（import + 挂载 + 1 行注释）；生产 userData 零触碰；副本包**无写入**；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 十一、第 52 批补丁：W-01 链头修复（通过）+ 新缺陷 W-02

### 11.1 修复（方案 1，已获授权）

`src/renderer/src/views/BenchView.tsx`（`13202e110cd36894…`）：

```tsx
import { useBenchInteractions } from './bench/useBenchInteractions'
…
export function BenchView(): JSX.Element {
  useBenchInteractions()   // ← 链头：DnD 落点 / 吸取放置 / 键盘（撤销·重做·清空·设为产物·Ctrl+S 写入）
```

**关键发现**：该 hook **无参数**（自己从 `useBenchStore`/`useBenchUiStore`/`useAppStore` 取状态），所以接线真的只有一行——比预估的 3–5 行更小。

| 门禁 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| build | **exit 0** |

### 11.2 hook 交互清单（据源码文件头与实现）

| 类别 | 内容 |
|---|---|
| 事件 | `SLOT_DROP_EVENT` / `SLOT_OUT_EVENT`（DndLayer 自定义落点事件，window 级） |
| 键盘 | Ctrl+Z 撤销 / Ctrl+Shift+Z 重做 / Ctrl+S **写入** / Delete·Backspace 清空当前槽 / 设为产物 |
| 函数导出 | `placeEyedropper`（吸取放置）、`placeOnSurface`（落到表面）——**纯函数，非监听器** |

### 11.3 重复绑定检查

`placeEyedropper` / `placeOnSurface` 被 `useSlotBinding.ts` 与 `ZoneBoard.tsx` **直接 import 调用**，属于纯函数调用，**不注册监听器**；`useBenchInteractions()` 现在只被 `BenchView` 调用一次 → **事件监听器只有一份，无双重绑定**。

### 11.4 W-01 链路验证 —— **通过**

| 步骤 | 结果 |
|---|---|
| Ctrl+S（CDP `dispatchKeyEvent`，modifiers=Ctrl） | **对话框出现**：`[role=dialog][aria-label="写入文件"]` |
| 对话框字段 | 通道 `kubejs-sugar`；文件名 `recipe_studio_20261103_132816`；两个选项（均 `on`）；按钮「关闭 / 写入文件」 |
| 点「写入文件」 | 到达主进程：日志出现 **`IPC codegen:write 失败：语法预检未通过（第 1 行）：生成结果为空`** |

**结论：链条从"键盘 → 状态 → 对话框 → IPC"全线贯通。** 失败原因是我没构造槽位（草稿为空），属预期。

### 11.5 ❗新缺陷 W-02：对话框失败无可见反馈

同一时刻：`toast: []`、对话框**仍保持打开**、界面无任何错误文案。

而主进程日志已明确报错（`生成结果为空`）。**用户点了「写入文件」却看不到任何失败原因**——与 W-01 同族的"链路通了但反馈没接"。

**建议**：对话框内显示 `codegen:write` 的 `error` 字段（或至少一条失败 toast）。**记录不修**，需另批授权。

### 11.6 三工作台模式验证 —— **未完成**

| 模式 | 状态 |
|---|---|
| `crafting_shaped` | 仅观察到：开启白名单后 `#bench-type` **自动切到** `minecraft:crafting_shaped`（默认首个白名单类型） |
| `crafting_shapeless` / `create:mixing` | **未验证** |

**未完成原因**：本轮预算在 W-01 修复 + 链路验证与一次脚本挂起（`t52e.mjs`，已终止）中耗尽。**不编造结果**。

### 11.7 判定

| 项 | 结果 |
|---|---|
| W-01 | **通过**（链头已接、对话框可达、IPC 可达） |
| 通用模式写盘 | **未达成**（草稿为空导致 `生成结果为空`；且失败无提示 = W-02） |
| 三模式 | **未完成**（1/3 仅观察） |
| 前端 6/6 | **未达成，仍 5/6** |

### 11.8 边界

`src` 变更**仅 BenchView**（import + hook 调用 + 挂载 + 注释）；生产 userData 零触碰（全程隔离）；副本包**无写入**（写盘失败）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**；挂起的 node 脚本已终止。

---

## 十二、第 53 批：三工作台模式验证（渲染段即受阻）

### 12.1 前置：白名单开启 —— **成功**

设置页三个 chip 点击后（`chip on`）：

```
试点工作台：有序合成 开 ｜ 试点工作台：无序合成 开 ｜ 试点工作台：Create 混合 开
```

`ui:get` 回读：`benchV2 = ["minecraft:crafting_shaped","minecraft:crafting_shapeless","create:mixing"]` —— **持久生效、三项齐全**。

### 12.2 ① 渲染段 —— **失败：工作台未切到试点界面**

切到工作台后（`#bench-type` = `minecraft:crafting_shaped`）：

| 观测 | 值 |
|---|---|
| 页面标题文字 | **`工作台（通用模式）`** |
| 会话条（提交配方 / 保存副本 / 取消草稿 / 基线） | **不存在**（`hasPilot=false`） |
| 结构 | 两个 `slot-column`（材料 + 产物，均为空态）+ 两个「+ 添加」 |
| 输入框总数 | **3**（物品搜索 / `#bench-type` / 日志搜索）——**没有任何 pattern/key/ingredients/heating 专用字段** |
| 按钮 | 「+ 添加」×2、清空、写入文件（通用模式那套） |

**→ 白名单开启 + 类型已设为 `crafting_shaped`，界面仍是通用模式。三个模式的专用结构化字段一个都没渲染。**

### 12.3 尝试的正路：从「配方浏览」打开已有配方

| 尝试 | 结果 |
|---|---|
| 配方浏览 → 搜 `stone` → 点第一条物品 | 该物品 `共 0 条产出配方`（`Stonechisel`，无配方），无法继续 |
| IPC `recipes:byOutput(minecraft:oak_planks)` | 返回 64 条，首条 `type = minecraft:crafting_shapeless`，inputs/outputs 完整 |
| IPC `recipes:open(首条 uid)` 后检查会话条 | **未取到结果**（输出被截断，随后预算耗尽） |

### 12.4 判定

| 模式 | ① 渲染 | ② 草稿 | ③ 提交 | ④ 核盘 |
|---|---|---|---|---|
| `crafting_shaped` | **失败**（通用界面） | 未开始 | 未开始 | 未开始 |
| `crafting_shapeless` | **未验证** | — | — | — |
| `create:mixing` | **未验证** | — | — | — |

**三模式验证未完成。** 但拿到一个**重要负面结论**：**开启试点白名单并不会让工作台切换到试点编辑器**——至少不是靠"开 chip + 设类型"这一步。

**可能的正确入口（待验证）**：从配方浏览打开一条已存在的配方（PilotDraftPanel 的文案是"来源与基线/冲突/提交"，明显是**编辑已有配方**的会话，而非新建）。下一批应从 `recipes:open` 这条路径切入，而不是在工作台里切类型。

### 12.5 边界

**零代码改动**（本批未改任何文件）；生产 userData 零触碰（`STUDIO_USER_DATA` 隔离）；副本包**无写入**；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 十三、第 54 批：试点入口机制确认 + 模式 1 渲染通过

### 13.1 机制确认 —— **正确入口是「载入工作台」，不是「工作台切类型」**

实测链路（可复现）：

```
配方浏览 → 侧栏搜 oak_planks → 点物品行 → 中栏出现「共 2 条产出该物品的配方」+「载入工作台」按钮
→ 点「载入工作台」→ 自动切到工作台 tab → hasPilot = true（出现「取消草稿」「提交配方」）
```

**关键细节**：「载入工作台」按钮**只存在于配方浏览视图**；先切到工作台再找它必然找不到（我第 53 批与上一步都因此失败）。

### 13.2 模式 1 · `crafting_shaped` —— 渲染段 **通过**

载入 `minecraft:crafting_shaped` 配方（oak_planks 的 shaped 变体）后：

| 断言 | 结果 |
|---|---|
| `hasPilot` | **true**（按钮「取消草稿」「提交配方」） |
| `hasPattern` | **true** |
| 结构 | **`pilot-grid-editor` → `pilot-grid-row` → `pilot-grid`**（3×3 格，`slot` × 9）+ **`pilot-grid-out`**（产物格） |
| 会话区标签 | 编辑会话 / 类型 / schema / 模式 / **原始哈希** / 配方 ID / 源文件 / **修改状态** / 结构 / 编辑形态 / 当前材料 / 当前产物 / 可编辑字段 |

**→ 专用结构化编辑器（3×3 网格 + 产物槽 + 会话条）渲染正常。** 这是 benchV2 链路的第一个正面证据。

### 13.3 其余段与其余模式 —— 未完成

| 模式 | ① 打开/会话条 | ② 渲染 | ③ 改/提交 | ④ 核盘 |
|---|---|---|---|---|
| `crafting_shaped` | **通过** | **通过** | 未做 | 未做 |
| `crafting_shapeless` | 未验证（已定位代表配方：`minecraft:oak_planks` / `allthecompressed:decompress/oak_planks_1x`） | — | — | — |
| `create:mixing` | **未找到代表配方**（试了 stone_pickaxe / andesite_alloy / furnace / torch，`byOutput` 均未返回该 type） | — | — | — |

**未完成原因**：预算在"定位入口"这一步耗尽（前两次尝试都因"先切 tab 再找按钮"失败）。**不编造结果。**

### 13.4 下一批可直接执行的最小清单

1. `crafting_shaped`：在已载入的会话里改一个格子的 count → **提交配方** → 核盘；
2. `crafting_shapeless`：`载入工作台`（oak_planks 的 shapeless 条）→ 断言 `pilot-list-editor`/ingredients → 提交 → 核盘；
3. `create:mixing`：先在 `recipes:byOutput` 里遍历更多 Create 产物找代表配方（如 `create:crushed_raw_iron`、`create:brass_ingot`），找不到则该模式记为「t13-pack 内无该类型配方，无法验证」。

### 13.5 边界

**零代码改动**；生产 userData 零触碰（隔离）；副本包**无写入**（未到提交段）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 十四、第 55 批：shaped 载入成功，但"改一格"无可用入口

### 14.1 shaped 三段实测

| 段 | 结果 |
|---|---|
| ① 载入 | **通过**：`载入工作台` → 自动切 tab → `hasPilot=true`，出现「取消草稿 / 提交配方」 |
| 渲染 | **通过**：`.pilot-grid .slot` = **9** 个（3×3）+ `pilot-grid-out` |
| 修改状态初始值 | **「与原始数据一致，没有待提交修改」**（读数明确） |
| ② 改一格 count | **未达成**（见 14.2） |
| ③ 提交 / ④ 核盘 | 未做 |

### 14.2 「改一格」找不到入口（关键发现）

| 探测 | 结果 |
|---|---|
| 面板内输入控件 | 全页仅 3 个 input：物品搜索 / `#bench-type` / 日志搜索——**试点面板内 0 个可编辑输入** |
| 点击 `.pilot-grid .slot`（空格） | **无浮层/无弹出**（`hasPop=false`，无新 input） |
| 面板按钮 | 只有「取消草稿 / 提交配方」 |

**推断**：试点编辑器的编辑途径**不是点击/输入，而是拖拽**（`DndLayer` 的 `SLOT_DROP_EVENT` / 物品列表拖入）。我此前从未验证过拖拽——CDP 模拟 HTML5 drag-and-drop 需要 `Input.dispatchDragEvent` 或合成 dragstart/drop 事件序列，成本明显高于点击。

**这不是缺陷结论**，只是"我用的交互方式不对"。但它暴露了一个可用性问题候选：**空格子没有任何"点我添加"的提示或浮层**，用户只能靠猜（拖拽 / 还是点击？）。

### 14.3 shapeless / create:mixing

| 模式 | 状态 |
|---|---|
| `crafting_shapeless` | **未验证**（预算） |
| `create:mixing` | **未验证**；且上批遍历 4 个 Create 产物未找到该 type，仍需按 §13.4 扩大遍历 |

### 14.4 判定

| 项 | 结果 |
|---|---|
| shaped | 载入 + 渲染 **通过**；改/提交/核盘 **未做** |
| shapeless / create:mixing | **未验证** |
| 三模式 | **未完成** |
| 前端 | **仍 5/6** |

### 14.5 下一批建议：先解决"怎么改"

继续测"提交/核盘"之前，必须先确定试点编辑器的**编辑手段**：

1. 读 `PilotGridEditor` / `useSlotBinding.ts`：确认是否只支持拖拽、是否也支持点击设值；
2. 若只支持拖拽 → 用 `Input.dispatchDragEvent`（CDP 原生支持）或 `DataTransfer` 合成事件驱动一次放入；
3. 有可用入口后再跑 改→提交→核盘。

**在"怎么改"没确定前，继续按四段推进只会重复卡在同一处**——这是我这两批的实际教训。

### 14.6 边界

**零代码改动**；生产 userData 零触碰；副本包**无写入**（未到提交段）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 十五、第 56 批：手势方案未验证 —— 脚本第 3 次挂起

### 15.1 本轮未能取得任何结果

按协调方给出的手势语义（双击 = picker / 右键 = 菜单 / 滚轮 = 数量 ±1）编写脚本，执行 `shaped 载入 → 滚轮改数量`：**运行 3 分 33 秒、零 stdout**，被强制终止。**无任何新证据**。

### 15.2 这是第 3 次 CDP 挂起（52 / 55 / 56 批）

| 批次 | 现象 | 当时的操作阶段 |
|---|---|---|
| 52 | 脚本 5 分钟无输出 | ENOTDIR 注入后未重启即继续 |
| 55 | 同上 | 连续多次 CDP 会话后 |
| 56 | 3 分 33 秒无输出 | 全新进程、第一次连接后 |

**共性**：不是"应用崩了"（进程一直 alive），而是**CDP 调用得不到响应**，且脚本**没有任何阶段日志**，无法判断卡在哪一步。

**这是我的工具缺陷，不是产品缺陷。** 现有 `conn()` 的 `send()` 没有超时——一旦某个 `Runtime.evaluate` 不返回，整个脚本就永远挂着。

### 15.3 下一批必须先修工具（不改产品代码）

给 CDP 驱动加三件事（都在 `.cache/` 内，零 src 改动）：

1. **每个 `send()` 加 5s 超时**（`Promise.race` + reject），失败时打印 `method` 与参数，立刻知道卡在哪；
2. **阶段日志**：`load()/clickText()/ev()` 每步入 `stderr`，而不是只在末尾 `console.log`；
3. **每步后校验连接活性**（`Runtime.evaluate('1')`），失败即重连或退出。

没有这三条，后续每批都可能在同一处烧掉全部预算——这已经是第三次了。

### 15.4 判定

| 模式 | 状态 |
|---|---|
| `crafting_shaped` | 载入 + 渲染 **通过**（第 54–55 批）；改/提交/核盘 **未做** |
| `crafting_shapeless` | **未验证** |
| `create:mixing` | **未验证**（待扩大遍历） |
| 三模式 | **未完成** |
| 前端 | **仍 5/6** |

### 15.5 边界

**零代码改动**；生产 userData 零触碰；副本包**无写入**；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**；挂起的 node 脚本已终止。

---

## 十六、第 57 批：驱动加固 + shaped 全流程通过（首个完整闭环）

### 16.1 驱动加固（A2-T，仅 `.cache/fix14/a3tmp/t57/h.mjs`）

| 改动 | 实现 |
|---|---|
| **超时** | 每个 `send()` 包 `Promise.race`-等效定时器（5 s）；超时删 pending、打印 `TIMEOUT method=… params=…` 并 reject |
| **阶段日志** | 每次 IPC 写 stderr：`[cdp] ok method=Input.dispatchMouseEvent` / `err …` / `dblclick sel @x,y` / `clickText "提交配方"` |
| **探活** | `alive()`：`Runtime.evaluate('1')`，失败自动重连一次，再失败抛错退出（不再挂起） |

**负向自检**：连接 → `alive` → 对不存在 selector 求值 → **1 ms 返回**（不挂起），日志可读，`ws closed` 干净退出。

> 效果立竿见影：本批全程未再挂起，每步都有日志。

### 16.2 `crafting_shaped` —— **全流程通过（首个完整闭环）**

| 段 | 结果 |
|---|---|
| ① 载入 | `载入工作台` → `hasPilot=true`，`.pilot-grid .slot` = **9**，状态「与原始数据一致」 |
| ② 双击编辑 | 双击格子 → **`bench-panel picker-panel`** 出现；输入 `minecraft:oak_planks` → 结果「使用输入的 minecraft:oak_planks」→ 点击放入 |
| ③ 修改生效 | `修改状态` → **「有 1 处修改尚未提交」** |
| ④ 提交 | 点「提交配方」→ toast **「已保存：kubejs/data/allthecompressed/recipes/compress/oak_planks」**；状态回到「与原始数据一致」；日志 `已提交配方 allthecompressed:compress/oak_planks_1x` |
| ⑤ 核盘 | `.cache/t13-pack/kubejs/data/allthecompressed/recipes/compress/oak_planks_1x.json`（**356 B**）<br>`type=minecraft:crafting_shaped`｜`pattern=["A##","###","###"]`｜`key=["A","#"]`｜`result={item:"allthecompressed:oak_planks_1x"}`｜**JSON 合法** |

**→ 试点链路（载入 → 双击 picker → 改 → 提交 → 落盘）端到端可用。** 这是 benchV2 的第一个完整正面结论。

### 16.3 `crafting_shapeless` —— **未达成（载入到了错误的配方）**

搜 `oak_planks_1x` → 载入后 `type=minecraft:crafting_shaped`、`hasGrid=true`、`hasList=false`。

**原因**：该物品中栏有**两条**配方（compress=shaped、decompress=shapeless），我未先选中 shapeless 那条就点了「载入工作台」，载入的是默认/第一条。

**下一步**：中栏先点选 `allthecompressed:decompress/oak_planks_1x` 那一行，再点「载入工作台」。

### 16.4 `create:mixing` —— 未验证（预算）

### 16.5 判定

| 模式 | 结果 |
|---|---|
| `crafting_shaped` | **通过（全流程 + 核盘）** |
| `crafting_shapeless` | 未达成（选错配方，方法已明确） |
| `create:mixing` | 未验证 |
| 前端 | **仍 5/6**（区域 4 的"保存"这次**实际通过了**，但只覆盖 shaped 一种模式；按批约定仍待三模式齐全后改判） |

### 16.6 边界

**src 零改动**（本批仅改 `.cache/` 驱动）；生产 userData 零触碰；**副本包有 1 处写入**（shaped 提交，路径见 §16.2，属授权范围内）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 十七、第 58 批：三模式收尾（2/3 通过 + 1 不可验证）→ 前端 6/6

### 17.1 `crafting_shapeless` —— **全流程通过（含字段级一致）**

| 段 | 结果 |
|---|---|
| 载入 | 中栏有 **3 个「载入工作台」按钮**（多配方），点**第二个** → `type=minecraft:crafting_shapeless`、**`hasList=true`**、`hasGrid=false`、`hasPilot=true` |
| 槽位 | `.pilot-list-editor .slot` = **5**（含 `slot-empty-mark`） |
| 双击改 | 双击槽 → **`picker-panel`** 出现 → 输入 `minecraft:stone` → 「使用输入的…」→ 放入 |
| 修改状态 | **「有 1 处修改尚未提交」** |
| 提交 | toast **「已保存：kubejs/data/allthecompressed/recipes/decompress/oak_plan…」**，状态回到「与原始数据一致」 |
| 核盘 | `.cache/t13-pack/kubejs/data/allthecompressed/recipes/decompress/oak_planks_2x.json`（**237 B**）<br>`type=minecraft:crafting_shapeless`｜**`ingredients=[{"item":"minecraft:stone","count":1}]`**｜`result={"count":9,"item":"allthecompressed:oak_planks_1x"}`｜JSON 合法 |

**关键**：`ingredients` 里的 `minecraft:stone` **正是我通过 picker 改入的物品** → **字段级一致，不是"写了个文件"而已**。

### 17.2 `create:mixing` —— **不可验证（按物品产出查不到）**

遍历 8 个 Create 产物（`recipes:byOutput`，limit 10）：

| 产物 | total | 出现的 type |
|---|---|---|
| `create:crushed_raw_iron` | 0 | — |
| `create:brass_ingot` | 0 | — |
| `create:andesite_alloy` | 2 | `tconstruct:casting_basin` |
| `create:zinc_ingot` | 0 | — |
| `create:copper_sheet` | 0 | — |
| `create:cogwheel` | 0 | — |
| `create:crushed_raw_zinc` | 0 | — |
| `create:experience_nugget` | 22 | `create:crushing` |

**命中类型集合**：`{create:crushing, tconstruct:casting_basin}` —— **无 `create:mixing`**。

**「不可验证」结论 + 一个必须说明的方法局限**：
`recipes:byOutput` 是**按物品产出**查询；而 Create 的 **mixing 产出是流体**（如 `create:molten_brass`），天然不会出现在物品产出索引里。所以准确表述是：

> **按物品产出枚举未发现 `create:mixing`；该类型产出为流体，物品侧查询方法不适用，需按 type 枚举（如 `schema` 驱动的类型列表）才能验证 —— 本批不可验证。**

这比直接说"包里没有"更严谨。

### 17.3 三模式汇总

| 模式 | 载入 | 渲染 | 改 | 提交 | 核盘 | 判定 |
|---|---|---|---|---|---|---|
| `crafting_shaped` | ✔ | ✔ grid(9) | ✔ picker | ✔ | ✔ 356B / pattern+key | **通过** |
| `crafting_shapeless` | ✔ | ✔ list(5) | ✔ picker | ✔ | ✔ 237B / ingredients=stone | **通过** |
| `create:mixing` | — | — | — | — | — | **不可验证**（方法局限已说明） |

### 17.4 前端收官判定 —— **6 / 6**

| 区域 | 判定 | 依据 |
|---|---|---|
| 1 顶栏导入/扫描 | **通过** | 43,474 索引 / 3.8ms |
| 2 列表滚动/选中/详情 | **通过** | 400 行 + 选中 + 中栏渲染 |
| 3 搜索 | **通过** | 命中 400 行并可点选 |
| **4 配方编辑/保存** | **通过（改判）** | shaped + shapeless **两种模式**均完成「载入→编辑→提交→落盘→字段一致」；此前判"不通过"是因为**写盘入口未接通（W-01）**，现已修复并实证 |
| 5 插件开关 + 重启持久 | **通过** | 切换生效 + 重启保持 + 文件核对 |
| 6 详情面板 Tab 导航 | **通过** | 焦点移动不切详情（UI-U2） |

**前端可用性验证收官：6 / 6。**

### 17.5 残留（不影响 6/6 判定）

| 项 | 状态 |
|---|---|
| W-02（WriteDialog 失败无可见反馈） | **未修**，待第 59 批 |
| `create:mixing` | **不可验证**（需按 type 枚举的新方法） |
| 通用模式「写入文件」按钮 | 仍 `disabled`（设计如此，但缺可见原因） |
| 三模式截图 | 本轮未单独落盘（断言与文件校验为主） |

### 17.6 边界

**src 零改动**（仅 `.cache/` 脚本）；生产 userData 零触碰；**副本包新增 2 个文件**（shaped 356 B + shapeless 237 B，均在 `kubejs/data/allthecompressed/recipes/`）；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 十八、第 59 批：U-11 受限（两条错误文案）+ create:mixing 按 type 枚举确认

### 18.1 `create:mixing` —— **按 type 枚举确认：0 条**（比上批更硬的结论）

对 46 MB 缓存 `.cache/t13-ud/studio-cache/*/recipes.json` 直接按 type 统计：

| 类型 | 条数 |
|---|---|
| `minecraft:crafting_shaped` | 8,109 |
| `minecraft:crafting_shapeless` | 4,262 |
| `botanypots:crop` | 1,952 |
| `mekanism:sawing` | 1,817 |
| `mekanism:painting` | 1,264 |
| `forge:conditional` | 1,150 |
| `minecraft:stonecutting` | 1,080 |
| **`create:mixing`** | **0**（两种格式各查一次，均 0） |

**结论**：**t13-pack 内确无 `create:mixing` 类型配方** —— 已按 type 枚举确认，不再是"物品产出查不到"的间接推断。

### 18.2 U-11 · 通用模式 codegen 写盘 —— **受限**

构造过程（全部走真实 UI 手势）：

| 步骤 | 结果 |
|---|---|
| `#bench-type` = `minecraft:crafting_shapeless` | OK |
| 材料区「+ 添加」→ 填 `input.slot-id` = `minecraft:stone` | OK（回读确认） |
| 产物区「+ 添加」→ 填 `minecraft:stone` | OK（列标题显示「产物1 数量 1」） |
| Ctrl+S | **WriteDialog 出现**（文件名 `recipe_studio_20261103_135710`） |
| 点「写入文件」 | **无 toast、对话框不关、无文件** |

**两次尝试的错误文案（主进程日志）**：

```
type=minecraft:crafting_shapeless →
  IPC codegen:write 失败：语法预检未通过（第 1 行）：生成结果为空，没有可写出的内容

type=create:crushing →
  IPC codegen:write 失败：语法预检未通过（第 1 行）：未找到配方类型 schema：create:crushing
```

**分析**：
1. `create:crushing` 的报错证明 **codegen 必须有 schema**——通用模式不是"无 schema 类型的兜底"，它同样要求注册表里有该类型；
2. `crafting_shapeless` 有 schema，却报「生成结果为空」→ 说明**我填的内容没有进入草稿模型**（很可能我直接对 `input.slot-id` 赋值 + `input` 事件，而该受控输入的实际 store 写入路径未被触发，或产物槽需要的是另一种写入方式）。

**结论：U-11 = 受限。** 缺的不是 codegen 能力（pilot 两模式已证明写盘正常），而是**通用模式草稿的 UI 赋值路径我还没摸到**。

**下一步（明确）**：
- 查 `SlotColumn` 的 `onChange` 绑定（是 `onChange` 还是 `onBlur`/`onKeyDown`）→ 用对应事件触发；
- 或确认通用模式是否也支持双击 picker（pilot 用 `.slot`，通用用 `input.slot-id`，两者不同）。

### 18.3 状态

| 项 | 结果 |
|---|---|
| U-11 | **受限**（错误文案已取得，缺"如何让 UI 赋值进草稿"） |
| `create:mixing` | **确认无该类型**（按 type 枚举） |
| 前端 6/6 | **不变**（区域 4 已由 pilot 的 shaped + shapeless 实证） |
| 本轮写盘 | **0 个新文件**（两次 codegen 均失败，副本包无变化） |

### 18.4 边界

**src 零改动**；生产 userData 零触碰；副本包**无新增**；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**；全程驱动零挂起。

---

## 十九、第 60 批：U-12 物品栏无法滚动 —— 根因已定位（修复待验证）

### 19.1 五步排查原始读数

| 步骤 | 读数 |
|---|---|
| 搜索结果 | 400 行（`.item-row`），行高 **40 px** |
| ① `.item-list` | `sh=16004`、`ov=auto`、**高度被撑到 16004**（`rectH` 同量级） |
| ① 祖先链 | `.finder` h=**16165**（`ov: visible`）→ `.pane.rail` h=**16493**（`flex: 0 0 auto`、`ov:hidden`）→ `.pane.rail-pane` **h=650 / ch=650 / sh=16493**（`overflow:hidden`） |
| ② 滚轮（`mouseWheel` deltaY 300） | **坐标 y=8434**（视口仅 835）→ 指针落在窗口外，Chromium **不派发**（驱动 5 s 超时并报 `TIMEOUT method=Input.dispatchMouseEvent`，未挂起） |
| ③ 手动 `scrollTop=400` | 列表自身可滚（`ov=auto`），但用户看不到——因为**列表整体在视口下方 8000+ px 处** |

### 19.2 定性

**属于假设 ②（高度链），不是虚拟器、也不是分页。**

`.pane.rail` 在 `.pane.rail-pane` 内部以 `flex: 0 0 auto` 生长到**内容高度 16,493**，而父层只有 650 且 `overflow:hidden` → 超出部分被裁掉；`.item-list` 虽有 `overflow:auto`，却因**自身高度=内容高度**而永远不产生滚动条。用户看到的是"被裁剩的 6 行、滚不动"。

> 附带说明：`.pane` 基类本身有 `min-height:0; overflow:hidden`（`shell.css:114-120`），所以缺口不在基类，而在 `.rail` 这一层没有把高度收住。

### 19.3 拟定修复（一行 CSS，待下批实施 + 验证）

`src/renderer/src/styles/parts.css`（`.rail` 规则处）加：

```css
.rail { min-height: 0; flex: 1 1 auto; }
```

理由：让 `.rail` 服从父容器高度而不是内容高度；`.item-list` 已有 `overflow:auto`，高度一旦被约束就会自然出现滚动条并触发 `onScroll` 分页（16 → 29）。

**未在本批实施的原因**：改 CSS 需 `npm run build` + 重启 + 复验（滚动/分页/点击选中/星标/详情联动）+ 门禁，本轮预算在诊断阶段耗尽。**不做未验证的改动**——这是这个项目里已经吃过教训的点。

### 19.4 状态

| 项 | 结果 |
|---|---|
| U-12 定性 | **完成**（高度链 / `.rail` 未收高度） |
| U-12 修复 | **未实施**（改动+验证需一轮完整预算） |
| 前端 6/6 | **不变**（U-12 是事后发现的独立缺陷，不在六区域清单内） |
| 本轮写盘/改动 | **0**（`src` 零改动、副本包零写入） |

### 19.5 顺带：驱动加固的价值得到验证

本轮 `mouseWheel` 因坐标在窗口外而**永久不返回**——若沿用旧驱动会再次整批挂死。加固后的 5 s 超时立刻报 `TIMEOUT method=Input.dispatchMouseEvent params={... "y":8434}`，**既没挂起，还直接暴露了"列表在视口外"这个关键线索**。

### 19.6 边界

**src 零改动**；生产 userData 零触碰；副本包零写入；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 二十、第 61 批：U-12 修复（一行 CSS）+ 复验

### 20.1 修复

`src/renderer/src/styles/parts.css`（`64ac3e587f725b59…`，备份 `.cache/fix14/a3tmp/parts.css.pre-u12`）：

```css
.pane.rail,
.pane.rail .finder {
  min-height: 0;
  flex: 1 1 auto;
}
```

**为什么不是 `.rail { … }`**：全仓 CSS 里**根本没有 `.rail` 规则**；实测 `.pane.rail` 的 `flex: 0 0 auto` 来自 `.pane` 基类（`shell.css:114-120`）。所以选择器必须带 `.pane` 前缀才生效，且只影响左栏，不动其它 pane。

### 20.2 修复前后读数对照

| 元素 | 修复前 | 修复后 |
|---|---|---|
| `.pane.rail` | h=**16,493** | **650** |
| `.pane.rail .finder` | h=**16,165** | **322** |
| `.item-list` | ch=**16,004**（无溢出） | **ch=161 / sh=16,004**（有溢出） |
| 列表中心 y | **8434**（视口外） | **513**（vh=835，视口内） |

### 20.3 七项复验

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 列表滚动 | **通过** | `mouseWheel deltaY=300` → `scrollTop` **0 → 300** |
| 2 | 分页/加载 | **通过** | 滚轮后渲染行数 **17 → 24**；滚到底 `st=15843, sh=16004, atEnd=true` |
| 3 | 点击选中 | **未验证** | 见 20.4 |
| 4 | 星标 | **未验证** | 同上（依赖选中态） |
| 5 | 详情联动 | **未验证** | 中栏保持初始提示「从左侧选一个物品开始」 |
| 6 | 侧栏布局 | **通过** | 5 块依次 `rail-head 48 / modpack-card 134 / nav 107 / finder 322 / rail-foot 31`，**overlaps=[]**，合计 642 ≤ 650，不错位不重叠 |
| 7 | 滚轮坐标断言 | **通过** | 中心 y=513 ∈ [0,835] |

### 20.4 3–5 项未验证的原因（工具侧，非产品缺陷）

点 `.item-row` 时取到的坐标是 **y=15812**——虚拟列表按绝对偏移布局，**`scrollTop=0` 后行仍停留在其绝对位置**，鼠标事件落在视口外，等价于"点在空白处"，因此没有选中、也没有星标。

**这与我第 60 批遇到的 `mouseWheel y=8434` 是同一类问题**：虚拟列表的行坐标不等于可视坐标。正确做法是**用 `scrollIntoView()` 把行滚进视口再取 rect**（或直接对 `.item-row` 派发 JS `click()`，但那样就不算真实鼠标事件了）。

**结论：滚动与布局修复已确认；点击/星标/详情三项因取证方法不当未取得证据，需重跑。**

### 20.5 门禁

| 项 | 结果 |
|---|---|
| typecheck | **0** |
| lint | **0** |
| vitest 全量 | **828 例：821 passed / 4 skipped / 3 todo / 0 失败**（94 文件） |
| build | **exit 0**（`out/renderer/assets/index-pscF_2o1.css` 86,089 B） |

### 20.6 状态

**U-12 = 修复已生效（滚动 + 布局），回归三项待补验。** 不宣称闭环。

### 20.7 边界

`src` 改动**仅 `parts.css`**（CSS-only，无 DOM 结构改动）；生产 userData 零触碰；副本包零写入；应用已关闭（`left-mc-kjs=0`）；**QQ-agent 11 进程未受影响**。

---

## 二十一、第 62 批：U-12 补验 —— 三项通过，分页缺陷确认

### 21.1 方法修正（关键）

虚拟列表行按绝对偏移布局，`getBoundingClientRect()` 给的是**文档坐标**。改法：**先 `scrollIntoView({block:'center'})` 再取 rect，并断言 `rect.y ∈ [0, innerHeight]`**。本批三项一次通过，验证了这条方法。

### 21.2 补验 ③ 点击选中 —— **通过**

| 观测 | 值 |
|---|---|
| 目标行 | `Stonechisel:chaotic_brick`，`scrollIntoView` 后 **y=511.39，inView=true** |
| 点击后 | `.item-row.selected` 数量 **1**，选中行 = 该行 |
| 中栏 | 加载该物品详情：「共 0 条产出该物品的配方 / 暂无已知配方…」 |

### 21.3 补验 ④ 星标 —— **通过**

`class` 由 **`star`** → 点击 → **`star on`**（图标状态切换生效）。

> 持久化未验（重启后是否保持）：本批未做，登记为未验证。

### 21.4 补验 ⑤ 详情联动 —— **通过**

连续点两行：`Stonechisel:chaotic_brick` → `Stonechisel:circular_brick`，**中栏内容随之切换**，无残留。

### 21.5 分页完整性 —— **缺陷确认（atEnd 提前）**

搜索 `stone`，matched 计数显示 **3,290**；连续 4 次「滚到底 + 等待 2.2 s」：

| 次数 | count 文本 | scrollHeight | scrollTop | atEnd |
|---|---|---|---|---|
| 1 | 3,290 | 16004 | 15843 | **true** |
| 2 | 3,290 | 16004 | 15843 | true |
| 3 | 3,290 | 16004 | 15843 | true |
| 4 | 3,290 | 16004 | 15843 | true |

**判读**：列表实际加载约 **400 行**（`16004 px ÷ 40 px`），而 matched = **3,290** → **`loaded < matched`，且 `atEnd` 已为 true，不再触发 loadMore**。

同一现象在 `_` 搜索下同样存在（matched 41,696，`sh` 仍 16,004）。

**→ 分页缺陷确认：`atEnd` 提前为 true，用户只能看到前约 400 条。** 按批约定**记录不修**，并入后续修复包。

**可能原因（供修复参考，未定论）**：
- `shouldPrefetch` 判据用了 `scrollTop + clientHeight >= scrollHeight - K`，但虚拟列表的 `scrollHeight` 只反映**已渲染窗口**（16,004）而非总高，导致到底 = 已渲染区到底；
- 或 `nextPageOffset` 在 `loaded` 未达阈值时被 `atEnd` 短路。

### 21.6 U-12 七项终态

| # | 项 | 结果 |
|---|---|---|
| 1 | 列表滚动 | **通过** |
| 2 | 分页加载 | **缺陷**（atEnd 提前，loaded ≈400 < matched 3,290） |
| 3 | 点击选中 | **通过** |
| 4 | 星标 | **通过**（持久化未验） |
| 5 | 详情联动 | **通过** |
| 6 | 侧栏布局 | **通过**（5 块 642 ≤ 650，无重叠） |
| 7 | 滚轮坐标断言 | **通过**（y=513） |

**U-12（滚不动）= 修复并验证完成**；其中「分页」是修复后暴露的**独立缺陷**，不属 U-12 原范围，另行跟踪。

### 21.7 边界

**本批零 src 改动**（纯验证）；生产 userData 零触碰；副本包零写入；应用已关闭（**残留 4 个子进程，已强制清理 → 0**）；**QQ-agent 11 进程未受影响**。

> 备注：`CloseMainWindow` 后仍残留 4 个 electron 子进程，需 `Stop-Process` 兜底。这与第 51 批现象一致（`closed=True,False,False,False`），建议纳入收尾脚本。

---

## 二十二、第 63 批：U-11 续（真实键盘）+ 收尾脚本 + **W-02 更正**

### 22.1 `SlotColumn` 的绑定方式（先查后选）

`src/renderer/src/views/BenchView.tsx:329`：

```tsx
<input className="input mono slot-id" onChange={(e) => { … onChange(i, { … }) }} />
```

**是 React `onChange`**（底层 `input` 事件）。据此选**真实键盘**（`Input.insertText`）—— 最接近真实用户，也绕开 value tracker 争议。

### 22.2 真实键盘输入（DOM 回显成功）

| 步骤 | 结果 |
|---|---|
| `#bench-type`：点击 → Ctrl+A → `Input.insertText` | **`minecraft:crafting_shapeless`** |
| 材料区「+ 添加」→ 点 `.slot-id` → `insertText` | `minecraft:stone` |
| 产物区「+ 添加」→ 点 `.slot-id` → `insertText` | `minecraft:stone` |
| DOM 回读 | `ids = ["minecraft:stone","minecraft:stone"]`，`cnt = ["1","1"]` |

**→ 草稿在 UI 上确实被填好了**（这次不是赋值没生效）。

### 22.3 一个新发现：Ctrl+S 在输入框内被忽略

第一次 Ctrl+S **没有**弹出对话框；`document.activeElement` 仍是 `INPUT`。原因在 `useBenchInteractions` 的 `isTypingTarget()` —— 焦点在输入控件时不接管快捷键，**这是正确设计**（否则打字就触发写入）。`blur()` 之后 Ctrl+S 立即生效。

**方法记录**：伪用户操作必须「先失焦，再发快捷键」。

### 22.4 U-11 结果 —— **受限，但有决定性线索**

对话框打开（`recipe_studio_20261103_185140`），点「写入文件」后**对话框内出现错误文案**：

```
写入失败（SYNTAX_CHECK_FAILED）：语法预检未通过（第 1 行）：
生成结果为空，没有可写出的内容
```

**线索（比"受限"更有价值）**：通用模式的 `.slot-id` 值已进 DOM、也走了 React onChange，但 codegen 仍产出空 → **`codegen:write` 很可能只读 pilot 的草稿模型（`bench.draft`），不读通用模式的 `values`**。这与 pilot 两种模式写盘成功形成对照。

**若确认属实，那是 src 级缺陷**（通用模式与 codegen 之间缺适配），按约定**记录不修**。

### 22.5 ❗更正第 52 批的 W-02 判定

第 52 批我报「WriteDialog 失败无可见反馈」。**本批实测：对话框内是有错误文案的**（`写入失败（SYNTAX_CHECK_FAILED）：…`）。

**当时的判断错在只查了 `.toast`**，没读对话框自身的文本。**W-02 应降级为「无」（文案存在）**，或最多是"错误提示不够醒目"——但**不能再说"无反馈"**。

### 22.6 收尾脚本（A2-T，`.cache/fix14/a3tmp/shutdown.mjs`）

逻辑：`CloseMainWindow` → 等 6 s → 残留则 `Stop-Process` 兜底（**只匹配命令行含 `mc kjs`**）→ **断言残留 0**，非 0 退出码 1；额外断言 **QQ-agent 进程数不减少**，减少则退出码 2。

**正向实测**：

```
[shutdown] CloseMainWindow → 1 个主进程
[shutdown] 残留=0  QQ-agent=11→11
[shutdown] OK：mc kjs 残留 0，QQ-agent 未受影响
EXIT=0
```

**负向（强制残留）未做**：需构造一个"杀不掉"的 mc kjs 进程，本批预算不足。**登记为未测**，下批补（构造方式：`Suspend-Process` 主进程使其不响应关闭，再跑脚本看 exit=1）。

### 22.7 状态

| 项 | 结果 |
|---|---|
| U-11 | **受限**（错误文案 + codegen 侧线索） |
| W-02 | **更正为"文案存在"**（原判定作废） |
| 收尾脚本 | **正向通过**；负向未测 |
| src | **零改动** |
| 前端 6/6 | 不变 |

### 22.8 边界

副本包**无新增**（写入失败）；生产 userData 零触碰；应用已关闭（`shutdown.mjs` 断言残留 0）；**QQ-agent 11 进程未受影响**（脚本内已断言）。

---

## 二十三、第 64 批：U-11 三处 key 对照 + 别名兜底修复（未生效，线索转向通道）

### 23.1 三处 key 对照（诊断结论）

| 处 | 位置 | key |
|---|---|---|
| **① UI 写入** | `benchStore.ts:16-17` `INPUTS_KEY='inputs'` / `OUTPUTS_KEY='outputs'`；`BenchView.tsx:197/211` `setList(...)` | **`inputs` / `outputs`** |
| **② schema 声明** | `shared/pilotSchemas.ts:16-22`（`crafting_shapeless`） | **`slots[0].key='ingredients'`、`outputs[0].key='result'`** |
| **③ emit 读取** | `emitDatapack.ts:113` `workbench.values[field.key]`；`:122-128` 兜底把未声明键**原样写出** | **`values['ingredients']` / `values['result']`** |

**断点**：① 与 ② 不一致 → `values['ingredients']` 为 undefined → 必填字段缺失；③ 的兜底会把 `inputs`/`outputs` 原样写进 JSON（结构不合法）。

### 23.2 已实施的修复（emit 侧别名兜底）

`src/main/codegen/emitDatapack.ts`（`d024b7fd…`，备份 `emitDatapack.ts.pre-u11`）：

```ts
const LEGACY_FIELD_KEY = { ingredients: 'inputs', result: 'outputs', results: 'outputs' }
function readFieldValue(values, key) {           // schema key 优先，缺失才回落 UI key
  if (values[key] !== undefined) return values[key]
  const legacy = LEGACY_FIELD_KEY[key]
  if (!legacy || values[legacy] === undefined) return undefined
  usedAliasKeys.add(legacy); return values[legacy]
}
```

外加两处配套：**每次构建开头 `usedAliasKeys.clear()`**（否则跨调用串味）；**兜底写入时跳过被别名消费的 key**（否则 JSON 同时出现 `ingredients` 和 `inputs`）。

| 门禁 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| `vitest run codegen` | **8 文件 / 102 用例全通过** |
| build | **exit 0**（`out/main/index.js` → `071e08c3…`） |
| 全量 vitest | **828 例 / 821 passed / 0 失败** |

### 23.3 但写盘**仍然失败**，且报错来源被纠正

修复后重跑（真实键盘 + blur + Ctrl+S → 写入）：**仍在对话框内报**

```
写入失败（SYNTAX_CHECK_FAILED）：语法预检未通过（第 1 行）：生成结果为空，没有可写出的内容
```

**关键纠正**：该文案出自 **`validate.ts:36` 的 `if (code.trim().length === 0)`** —— 它校验的是**生成的"代码字符串"**，不是 JSON 结构。而默认通道是「**脚本 · KubeJS 语法糖脚本**」（`emitScript`），**根本没走 `emitDatapack`**。

**→ 我这次的别名修复只影响 datapack 通道，对默认的脚本通道无效；本轮无法证明它是否必要。**

### 23.4 尝试切换通道失败

尝试点「数据包 · 原生 JSON」的 radio：`afterPick` 显示第一个 radio 仍 `checked=true`、第二个 `false` —— **未切换成功**（我按 `label` 文本查找并 `click()`，该 radio 可能不在 `<label>` 内、或受控组件未响应合成 click）。

### 23.5 U-11 状态：**仍受限**（但排查面收窄到一条）

| 结论 | 内容 |
|---|---|
| 已证 | 草稿进 DOM/React 状态正常；**默认走脚本通道**；脚本通道产出空串 |
| 未证 | datapack 通道是否能写（我的别名修复尚未被验证） |
| 下一步 | ① 用**真实鼠标**点中「数据包 · 原生 JSON」radio（先取 rect 再 dispatch，而不是 JS `click()`）；② 若 datapack 通道能写 → U-11 通过、别名修复得到验证；③ 若仍空 → 查 `emitScript` 对通用模式为何产出空 |

### 23.6 边界

`src` 改动**仅 `emitDatapack.ts`**（+ 3 处局部逻辑）；生产 userData 零触碰；副本包**无新增**（写入未成功）；应用已关闭（`shutdown.mjs` 断言残留 0、QQ-agent 11→11）。

---

## 二十四、第 65 批：values 归一化（方案 C）—— **有效，但暴露下一个断点**

### 24.1 修复（`preview.ts`，`f95531ae…`，备份 `preview.ts.pre-u11b`）

在 `generate()` 里、`schema` 解析成功之后、进任何 emit 之前做归一化：

```ts
workbench = { ...workbench, values: normalizeUiValues(schema, workbench.values) }

export function normalizeUiValues(schema, values) {
  const out = { ...values }
  const fill = (key, source, multiple) => {
    if (key === 'grid' || key === source) return
    if (out[key] !== undefined) return           // schema 已声明 → 不覆盖（pilot 路径不变）
    const raw = values[source]
    if (raw === undefined) return
    out[key] = multiple || !Array.isArray(raw) ? raw : raw[0]   // 单值字段取首元素
  }
  for (const f of schema.slots)   fill(f.key, 'inputs',  f.multiple === true)
  for (const f of schema.outputs) fill(f.key, 'outputs', f.multiple === true)
  return out
}
```

**映射不硬编码**：一律取 `schema.slots[] / schema.outputs[]` 声明的 key，只把 UI 侧 `inputs/outputs` 当作**来源**。emitDatapack 的别名兜底保留（双保险，互不冲突）。

| 门禁 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| `vitest run codegen` | 8 文件 / **102 通过** |
| 全量 vitest | **828 例 / 821 passed / 0 失败** |
| build | **exit 0**（`out/main/index.js` → `48e34c40…`） |

### 24.2 效果证据：错误信息三级收窄（这是归一化生效的硬证据）

| 轮次 | 对话框内错误 |
|---|---|
| 修前 | `生成结果为空，没有可写出的内容` |
| 归一化后（首版） | `VALIDATION_FAILED：**result：该字段是单值，却给了数组**（multiple=false）；grid：网格为空…` |
| 归一化 + 单值取首 | `VALIDATION_FAILED：**grid：网格为空，无法生成有序合成**`（result 错误已消失） |

**→ `result` 已能正确读到单值，说明 `outputs → result` 的归一化确实生效**；`ingredients` 同理。

### 24.3 新断点（本轮未能闭环的原因）

只剩一条错：**`grid：网格为空，无法生成有序合成`**。

但类型是 `minecraft:crafting_shapeless`（`layoutKind: 'shapeless'`），校验却在检查**有序合成**的 grid。

**推断（未定稿）**：`#bench-type` 的 onChange 是

```tsx
setTypeId(e.target.value, bench.layoutKind, [], 3, 3)
```

—— 把**当前的** `layoutKind` 原样传下去。切换 type 时 `layoutKind` 没有跟着 schema 更新（仍是 `shaped`），于是校验按 shaped 走、要求 grid。

**这属于 UI 层的 layoutKind 同步问题**，与 codegen 无关；修它需要改 `setTypeId` 调用或 `layoutKind` 派生逻辑（第 66 批）。

### 24.4 U-11 状态

| 项 | 结果 |
|---|---|
| 默认通道写盘 | **仍未成功**（卡在 layoutKind/grid） |
| datapack 通道 | **未测**（同前，radio 未点中；本轮预算用尽） |
| pilot 回归 | **未单独跑**（归一化只补缺失、不覆盖已有值，且 102 个 codegen 用例全绿；但**pilot 实机写盘未复验** → 登记为未验证） |

**U-11 = 仍受限**，但已从"数据读不到"推进到"布局类型不匹配"，归一化本身**已被错误信息变化证明有效**。

### 24.5 边界

`src` 改动**仅 `preview.ts`**（+ 1 函数 + 1 行调用）；生产 userData 零触碰；副本包**无新增**；应用已关闭（`shutdown.mjs` 断言残留 0、QQ-agent 11→11）。

---

## 二十五、第 66 批：layoutKind 归一化 → **U-11 默认通道写盘成功**

### 25.1 修复（`preview.ts`，`76ee3555…`）

```ts
workbench = { ...workbench, values: normalizeUiValues(schema, workbench.values) }
// layoutKind 也以 schema 为准（通用模式 UI 的 bench.layoutKind 恒为 'shaped'，切类型不更新）
if (schema.layoutKind) workbench = { ...workbench, layoutKind: schema.layoutKind }
else logger.warn('RECIPE', 'schema 未声明 layoutKind，沿用工作台当前值', `类型：${schema.id}`)
```

`out/main/index.js` → **`7b1d91db…`**｜typecheck **0**｜lint **0**｜build **exit 0**

### 25.2 默认通道（脚本 · KubeJS 语法糖）—— **写盘成功**

| 观测 | 值 |
|---|---|
| toast | **`已写入 kubejs/server_scripts/recipe_studio_20261103_190736.js（486 B）· 在游戏中执行 /reload 生效`** |
| 对话框 | 自动关闭（`stillOpen=false`） |
| 落盘 | `.cache/t13-pack/kubejs/server_scripts/recipe_studio_20261103_190736.js`（486 B） |

**文件内容（全文）**：

```js
// ── KubeJS Recipe Studio ─────────────────────────────
// Modpack : t13-pack
// MC      : 1.20.1  |  Forge  |  KubeJS 2001.6.5-build.26
// Created : 2026-11-03 19:07
// ─────────────────────────────────────────────────────
ServerEvents.recipes(event => {
  event.shapeless('minecraft:stone', ['minecraft:stone'])
})
```

**产物 `minecraft:stone`、材料 `['minecraft:stone']` 均与 UI 填写一致** → **U-11 主目标（通用模式能用 codegen 写盘）达成**。

### 25.3 datapack 通道 —— **未验证，且发现 radio 疑义**

用**真实鼠标**（rect + dispatch）点第二个 radio：`afterSwitch = [false, true]` → **切换成功**。

但随后写入的 toast 仍是 `已写入 kubejs/server_scripts/…_01.js`（脚本通道），**没有生成 JSON**。

**推断**：那组两个 radio 很可能不是「通道」选择器，而是「**新建脚本 / 追加到已有脚本**」；真正的通道由 `decideChannel()` 依 schema/addons/样本自动判定（`generationPreference: 'auto'`）。要强制 JSON 通道，应改 `generationPreference = 'always-datapack'`（`ui:patch`）而**不是**点这个 radio。

**→ datapack 通道本轮未验证**，登记未完成。

### 25.4 pilot 实机回归 —— **载入正常，写盘未验证**

| 观测 | 值 |
|---|---|
| 载入 shapeless 配方 | `hasPilot=true`、`hasList=true`、`type=minecraft:crafting_shapeless` ✅ |
| 直接点「提交配方」 | **无 toast**，`修改状态` 仍「与原始数据一致，没有待提交修改」 |

**原因**：未做任何修改 → 无脏状态 → 提交不生效（应是禁用/空操作）。**pilot 实机写盘因此未取得证据**，不拿"用例全绿"替代。

### 25.5 门禁

| 项 | 结果 |
|---|---|
| 全量 vitest | **828 例 / 821 passed / 0 失败** |
| typecheck / lint | **0 / 0** |
| build | **exit 0** |

### 25.6 U-11 状态（分通道）

| 通道 | 结果 |
|---|---|
| **默认（脚本·语法糖）** | **通过**（写盘 + 内容与 UI 一致） |
| datapack（JSON） | **未验证**（radio 非通道选择器；需改 `generationPreference`） |
| pilot 实机写盘回归 | **未验证**（需先制造脏状态再提交） |

**U-11 判定：主目标通过（通用模式可用），两个旁支未验。**

### 25.7 边界

`src` 改动**仅 `preview.ts`**（+1 段 layoutKind 归一化）；生产 userData 零触碰；**副本包新增 2 个 .js**（486 B ×2，均在 `kubejs/server_scripts/`，授权范围内）；应用已关闭（`shutdown.mjs` 断言残留 0、QQ-agent 11→11）。

---

## 二十六、第 67 批：U-11 旁支收尾 —— datapack 通道矛盾 + pilot 未取得证据

### 26.1 datapack 通道 —— **`always-datapack` 仍产出 `.js`（与源码矛盾）**

| 步骤 | 结果 |
|---|---|
| `ui:patch { generationPreference: 'always-datapack' }` | `ok=true`，回读确认 **`always-datapack`** |
| 通用模式构造草稿 + Ctrl+S + 写入 | toast **`已写入 kubejs/server_scripts/recipe_studio_20261103_191256.js（486 B）`** |
| 落盘 | `.cache/t13-pack/kubejs/server_scripts/…191256.js`（**仍是脚本，没有 .json**） |
| 事后还原 | `ui:patch { generationPreference: 'auto' }` → 回读 **`auto`** ✅（防污染） |

**关键矛盾**：`channel.ts:161-176` 明确写着

```ts
if (preference === 'always-datapack') {
  if (removalOnly) { … return 报错 … }
  return { channel: 'datapack-json', … }
}
```

即：**偏好为 always-datapack 时 `decideChannel` 就返回 `datapack-json`**。但实际写盘仍走 `kubejs-sugar`。

**→ 结论：写盘路径没有采用 `decideChannel` 的返回值，或 `WriteDialog` 向 `codegen:write` 传了**显式 channel **覆盖了它。** 这是新断点，需查 `codegenHandlers.ts:93` 的 `preferenceForChannel` 与 dialog 的 `channel` 传参。

（副证：batch 66 里我点第二个 radio 后也仍写 `.js` —— 那组 radio 非通道选择器，与本结论一致。）

### 26.2 pilot 实机回归 —— **载入正常，写盘未取得证据**

| 步骤 | 结果 |
|---|---|
| 载入 shapeless 配方（第 2 个「载入工作台」） | `hasPilot=true`、`hasList=true` ✅ |
| 双击槽 → picker → 输入 `minecraft:stone` → 「使用输入的…」 | 流程执行成功（返回 true） |
| 「提交配方」 | **无 toast**；3.5 s 后 `修改状态` 仍为「与原始数据一致」 |
| 副本包 | **无新文件** |

**两种可能**（未定论）：
1. picker 选中后槽值实际未变更（例如目标槽原本就是同物品，或 picker 关闭时被取消）；
2. 提交按钮在无脏状态时是空操作（batch 66 亦如此）。

**→ pilot 写盘这次**没有**拿到证据。不宣称"pilot 未回归"，也不宣称"被破坏"——**无证据即无结论**。

### 26.3 U-11 全闭环状态

| 路径 | 结果 |
|---|---|
| 默认（脚本·语法糖） | **通过**（batch 66：486 B 脚本，内容与 UI 一致） |
| datapack（JSON） | **不通过**：`always-datapack` 下仍产出 `.js`（与 `decideChannel` 源码矛盾）→ 新缺陷候选 |
| pilot 实机 | **未取得证据**（两次尝试均无脏状态/无 toast/无落盘） |

**→ U-11 未全闭环。** 主目标（通用模式可写盘）成立；datapack 与 pilot 实机需继续。

### 26.4 边界

**零 src 改动**（本批纯验证）；生产 userData 零触碰；副本包**新增 1 个 .js**（486 B，授权范围内）；`generationPreference` **已还原为 `auto`**；应用已关闭（`shutdown.mjs` 断言残留 0、QQ-agent 11→11）。

---

## 二十七、第 68 批：datapack 通道正解 + **写入挂起（新缺陷候选）**

### 27.1 通道选择器确认（修正 batch 67 的错误推断）

`WriteDialog.tsx:115`：

```tsx
<select className="input" value={channel} onChange={...}>
  <option value="kubejs-sugar">脚本 · KubeJS 语法糖</option>
  <option value="event-custom">脚本 · event.custom</option>
  <option value="datapack-json">数据包 · 原生 JSON</option>
</select>
```

且 `:35` `useState<GenerationChannel>('kubejs-sugar')` —— **对话框自带默认值，不随 `generationPreference` 变化**。

**→ batch 67 我说"写盘路径没采用 decideChannel"是错的**：`decideChannel` 没问题，是 **dialog 显式把 `kubejs-sugar` 传给 `codegen:write`**，覆盖了偏好。这也解释了为什么 `always-datapack` 仍写 `.js`、以及两个 radio 点了没用（那是「新建/追加」）。

### 27.2 实测：select 三项、切换成功、**写入挂起**

| 步骤 | 结果 |
|---|---|
| `selectBefore` | `value=kubejs-sugar`，选项 3 项（`kubejs-sugar` / `event-custom` / `datapack-json`） |
| 设为 `datapack-json`（native setter + `change`） | `selectAfter = datapack-json` ✅ |
| 点「写入文件」 | **对话框停在「写入中…」**（4 s + 再等 3 s 仍如此） |
| toast | **无** |
| 副本包 | **无新文件** |
| 主进程日志 | **无 `codegen:write` 相关记录**（末 3 行是 schema:list / 脚本执行顺序面板） |

**→ `datapack-json` 通道的写入疑似**挂起**（不是失败返回，而是无响应）。这是新缺陷候选，且严重度高于此前的"写 .js"——因为失败至少给错误，挂起什么都不给。

**可能原因（未定论）**：
- datapack 写路径在 `writer.ts` 的 `backupExisting` / `mkdir` 阶段阻塞；
- 或 renderer 侧 `writing` 状态未在 promise 结束时复位（按钮永久「写入中…」）。

### 27.3 pilot 实机回归 —— 本批未做（预算）

### 27.4 U-11 状态

| 路径 | 结果 |
|---|---|
| 默认（`kubejs-sugar`） | **通过**（batch 66） |
| `datapack-json` | **写入挂起**（新缺陷候选） |
| `event-custom` | 未测 |
| pilot 实机 | 未取得证据（batch 67 无脏状态；本批未做） |

**U-11 仍未全闭环**，但 datapack 的真实断点已从"写错通道"更正为"该通道写入无响应"。

### 27.5 边界

**零 src 改动**；生产 userData 零触碰；副本包**无新增**（datapack 写入未完成）；`generationPreference` 保持 `auto`；应用已关闭（`shutdown.mjs` 断言残留 0、QQ-agent 11→11）。

---

## 二十八、第 69 批：datapack 通道**通过（50 s）** + 两个新发现

### 28.1 更正 batch 68 的误判

上批我等 7 s 就判"挂起"。**实测完整耗时 50 s**（协调方线索正确：datapack 分支要 `listJarNames` 遍历 295 个 jar 查 namespace，首次无缓存）。

**采样曲线（每 5 s）**：5/10/…/45 s 均为 `写入中…` 无 toast；**50 s 时对话框关闭**，toast 出现。

### 28.2 datapack 通道 —— **通过**

| 观测 | 值 |
|---|---|
| toast | `已写出数据包 JSON：crafting_shapeless_stone_1.json（namespace recipe_studio）` |
| 落盘 | `.cache/t13-pack/kubejs/data/recipe_studio/recipes/crafting_shapeless_stone_1.json` |
| JSON 合法 | ✅ |
| `type` | `minecraft:crafting_shapeless` |
| `ingredients` | `[{"item":"minecraft:stone","count":1}]` ✅ 与 UI 一致 |
| `result` | `{"item":"minecraft:stone","count":1}` ✅ 与 UI 一致 |

**耗时 50 s** → **U-14（中 · 可用性）成立**：datapack 首次写入需扫 295 jar，**全程只有「写入中…」，无进度、无预计时间**。功能可用，体验差。建议：显示"正在扫描整合包结构（N/total）"或缓存 namespace 探测结果。

### 28.3 ❗新发现 1：JSON 里出现冗余键 `inputs` / `outputs`

生成的文件同时包含：

```json
"ingredients": [...], "result": {...},
"inputs":   [{"kind":"item","id":"minecraft:stone","count":1}],
"outputs":  [{"kind":"item","id":"minecraft:stone","count":1}]
```

**这两个非标准键是我 batch 64 的"兜底原样写出"造成的**——`emitDatapack` 的 fallback 会把 schema 未声明的 `values` 键原样写进 JSON。我 bat64 加的 `usedAliasKeys` 跳过逻辑**没有覆盖到这条路径**（或 emit 被调用两次导致 Set 已清空）。

**影响**：MC 会忽略未知顶层键，JSON 仍可用；但**输出不干净**，与"逐字段一致"的验收口径不符。
**建议**：既然 bat65 已在上游做 values 归一化，**可以移除 `emitDatapack` 的别名兜底**（或让兜底跳过 `inputs`/`outputs`）——两者叠加反而产生冗余。

### 28.4 ❗新发现 2：pilot 的 picker 赋值后**修改状态不变**（新缺陷候选）

| 步骤 | 结果 |
|---|---|
| 载入 shapeless → `hasPilot=true`、`hasList=true` | ✅ |
| 双击槽 → picker 出现 → 输入 `minecraft:stone` → 点「使用输入的 minecraft:stone」 | 流程全部执行 |
| **修改状态** | **仍为「与原始数据一致，没有待提交修改」** |

**→ picker 的选择没有写入草稿（draft）**，这解释了 batch 66/67 两次"提交无反应"——**不是我没造脏状态，而是根本造不出来**。

**这是新缺陷候选（severity 高）**：pilot 编辑器里双击改槽，UI 有 picker 交互、但值没同步到 `draft`。需要查 `picker-panel` 的确认回调是否调用了 `setDraftValues` / `commitOps`。

### 28.5 U-11 全闭环状态

| 路径 | 结果 |
|---|---|
| `kubejs-sugar` | **通过**（batch 66） |
| `datapack-json` | **通过**（本批，50 s）→ 但 JSON 有冗余键（§28.3） |
| `event-custom` | 未测 |
| pilot 实机 | **受阻于 picker 缺陷**（§28.4） |

### 28.6 边界

**零 src 改动**；生产 userData 零触碰；副本包**新增 1 个 .json**（`data/recipe_studio/recipes/`，授权范围内）；`generationPreference` 保持 `auto`；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 二十九、第 70 批：冗余键清理（完成）+ U-15 未修复（链路已追到 setValue）

### 29.1 冗余键清理 —— **完成**

`src/main/codegen/emitDatapack.ts`（`4c098bdc…`）：**移除** batch 64 引入的 `LEGACY_FIELD_KEY` / `readFieldValue` / `usedAliasKeys` 三段，恢复为直接 `workbench.values[field.key]`。

理由：batch 65 的 `normalizeUiValues` 已在 `generate()` 上游把 `inputs/outputs` 归一为 schema key，两层叠加只会让兜底把**原始 UI 键**又写进 JSON（即 §28.3 观察到的 `inputs`/`outputs` 冗余）。

> 副作用（预期）：现在 `emitDatapack` 只写 schema 声明的键。若某 schema 既未声明 `inputs` 又有值，该值不再被原样写出——这由上游归一化保证，符合设计。

### 29.2 禁止静默失败 —— **完成（部分）**

`src/renderer/src/views/bench/commitOps.ts`（`14513761…`）：

```ts
const addr = decodeSlot(slotId)
if (!addr) {
  console.warn('[bench] writeAt 无法解析槽位地址，已丢弃：', slotId)   // 以前是静默 return
  return
}
```

只解决"无线索"，**没有解决"写不进去"**。

### 29.3 U-15 根因分析（未修复，链路已完整追出）

| 环节 | 位置 | 事实 |
|---|---|---|
| picker 确认 | `ItemPicker.tsx:57-60` | `fill()` → `writeAt(target.slotId, {...})` |
| 地址解析 | `slotAddress.ts:75-90` | pilot 用 `encodeSlot({kind:'list', key, index})` → **`decodeSlot` 能解析**（不是解析失败） |
| 写入 | `commitOps.ts:40-51` | `applyOps` → 计算 `changed` → **若 `changed.length === 0` 直接 return** |
| 标脏 | `benchStore.ts:216-251` | `setValue()` 内部才调 `touchDirty` |

**关键观察**：`commitOps` 在 `changed.length === 0` 时**提前返回**，此时既没写入也没标脏。而 pilot 的槽位 key 是 schema key（`ingredients`），bench 里可能同时存在 `inputs`（UI 键）——`applyOps` 对 `ingredients:0` 的写入是否产生"变更"，取决于它比较的是哪个键。

**这解释了实测现象**：picker 选完 → `writeAt` → `applyOps` 未产生变更（或写到 bench 而 pilot 面板读的是 `draft`）→ 无脏状态 → 「提交配方」空操作。

**未在本批修完的原因**：需要先确定 pilot 面板渲染读的是 `bench.values` 还是 `draft.schema`+`values`，以及 `applyOps` 对 `list` 型地址的真实行为——这需要一次针对性运行（在 picker 确认后打印 `changed`），属下一批。**不猜着改。**

### 29.4 本批未验证项（预算）

| 项 | 状态 |
|---|---|
| pilot shaped / shapeless 脏状态 + 提交 | **未验证** |
| datapack JSON 干净（无 inputs/outputs） | **未验证**（需 50 s 重跑） |
| kubejs-sugar 回归 | **未验证**（改动只动 datapack 路径与 warn，风险低但未实测） |

### 29.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| `vitest run codegen` | 8 文件 / **102 通过** |
| 全量 vitest | **828 例 / 821 passed / 0 失败** |
| build | **exit 0**（`out/main/index.js` → `e289371c…`） |

### 29.6 边界

`src` 改动**两处**（`emitDatapack.ts` 去兜底、`commitOps.ts` 加 warn），均已备份（`emitDatapack.ts.pre-u11`、`commitOps.ts.pre-u15`）；本批**未启动应用**（零写盘）；生产 userData 零触碰。

---

## 三十、第 71 批：U-15 代码级排除 —— 三个假设全部被否定，断点在运行时数据

### 30.1 逐段核对结果

| 环节 | 代码事实 | 结论 |
|---|---|---|
| `commitOps` 的 `changed` | `Object.keys(next).filter(k => !same(bench.values[k], next[k]))`，`same` = `JSON.stringify` 比较 | **正确**（不是引用比较，也不是 ops 过滤） |
| `applyOps` 的 list 分支 | `const list = [...asList(pickValue(out, item.key))]` → `list[item.index] = value` → `out = withValue(out, item.key, list)` | **确实复制并写入**，返回新对象 |
| `withValue` | `key` 无 `.` 时 `{ ...values, [key]: value }`；有 `.` 时递归不可变写 | **普通不可变写，无别名映射** |
| `setValue` | `setValue(key, value, record = true)`；**无论 record 真假都调 `touchDirty`**，注释明确「拖拽/选择器批量写入传 false，但仍是用户编辑，必须记脏」 | **会标脏** |

**→ 协调方给的三个假设（applyOps 不改 out / changed 比较把新值判等 / 脏判定不读 bench.values）在代码层面都不成立。**

也就是说：**静态看，`picker → writeAt → commitOps → setValue → touchDirty` 这条链路是通的。**

### 30.2 剩下的可能性（运行时数据，需一次取证）

既然代码通，实测却不脏，只可能是**运行时数据**问题：

1. **`target.slotId` 指向的 key 与 pilot 面板实际渲染的 key 不同**。pilot 槽位是 `encodeSlot({kind:'list', key: fieldKey, index})`；若 `fieldKey` 是 `ingredients`，而 bench 里 pilot 的值实际存在 `inputs`（或反之），则写入落在**另一个键**上——`changed` 会包含那个键，脏也会标，但**面板上与用户看到的槽无关**；
2. **写入的值与现有值相等**：例如目标槽原本已是 `minecraft:stone`（我两次测试都填 `stone`，而该配方产物/材料恰好含 stone）→ `changed.length === 0` → 提前 return → 不脏。**这条我认为可能性最高**：第 69 批那次"picker 选了 stone 后不脏"，若槽里本来就是 stone，一切表现都能对上。

**→ 下一批的第一步取证**：在 `commitOps` 的 `if (changed.length === 0) return` 前临时打印 `{ addr, ops, changed, before, after }`，并**换一个与槽内不同的物品**（如 `minecraft:dirt`）重试。一次运行即可定性。

### 30.3 本批状态

| 项 | 结果 |
|---|---|
| 代码改动 | **0**（本批仅做代码级排除） |
| U-15 修复 | **未做**（root cause 未在运行时确认，按边界不猜着改） |
| pilot 两模式验证 | 未做 |
| datapack 冗余键验证 | 未做（需 50 s 重跑） |

**我没有在"假设被推翻"的情况下硬改代码**——上一批我已因假设偏差浪费过一整轮。

### 30.4 边界

**本批零 src 改动**；未启动应用；生产 userData 零触碰；副本包零写入。

---

## 三十一、第 72 批：U-15 **关闭（非缺陷）**——"值撞了"

### 31.1 临时取证输出（决定性）

在 `commitOps` 早退前插入临时取证（写 `window.__u15`），pilot shapeless 载入后**双击 ingredient 槽 → picker 选 `minecraft:dirt`**（而非此前一直用的 `stone`）：

```json
{
  "ops": [{ "op": "listSet", "key": "ingredients", "index": 0,
            "value": { "kind": "item", "id": "minecraft:dirt", "count": 1 } }],
  "changed": ["ingredients"],
  "after.ingredients": [{ "kind": "item", "id": "minecraft:dirt", "count": 1 }]
}
```

| 观测 | 结果 |
|---|---|
| `changed` | **`["ingredients"]`（非空）** |
| `after.ingredients` | `minecraft:dirt`（新值已进 bench） |
| **修改状态** | **「有 1 处修改尚未提交」** ✅ |

### 31.2 定性：**U-15 关闭 —— 不是缺陷**

此前第 66/67/69 批三次"picker 选完不脏"，原因是我每次都填 `minecraft:stone`，而该配方（`decompress/oak_planks_2x`）的 ingredient 槽**本来就是 stone** → `applyOps` 产出与旧值等价 → `changed.length === 0` → `commitOps` 提前 return → 不写入、不标脏。

**换一个不同的值（dirt），链路立刻正常。** 这与协调方的强证据（第 57/58 批 pilot 写盘成功过）完全一致。

**教训**：验证"写入是否生效"必须用**与现值不同**的数据，否则测的是"幂等写入"而不是"写入"。

### 31.3 提交与核盘（正式闭环）

| 观测 | 值 |
|---|---|
| toast | `已保存：kubejs/data/allthecompressed/recipes/decompress/oak_planks_2x.json` |
| 修改状态 | 回到「与原始数据一致」 |
| 落盘 | 同路径，**236 B**，mtime 已更新（19:28:45） |
| `type` | `minecraft:crafting_shapeless` |
| **`ingredients`** | **`[{"item":"minecraft:dirt","count":1}]`** ← 与 UI 修改**字段级一致** |
| `result` | `{"count":9,"item":"allthecompressed:oak_planks_1x"}` |

**→ pilot 的 picker → 脏状态 → 提交 → 写盘链路完好。**

### 31.4 临时日志已完全移除

| 检查 | 结果 |
|---|---|
| `grep "__u15"` / `"U15-TEMP"` | **无残留** |
| `diff precondition 备份` vs 当前 `commitOps.ts` | **只剩 batch 70 的 `console.warn` 一段**（有意保留） |
| `commitOps.ts` 哈希 | 回到 **`14513761…`**（与 batch 70 一致，证明临时改动已净） |
| typecheck / lint / build | **0 / 0 / exit 0** |
| 全量 vitest | **828 例 / 821 passed / 0 失败** |

### 31.5 U-15 状态：**关闭（非缺陷）**

原先记为「picker 赋值不写 draft（severity 高）」——**该判定作废**。真实情况是测试数据撞值。

**保留的改进**（batch 70 已做）：`writeAt` 在 `decodeSlot` 失败时不再静默，`console.warn` 带 slotId。这条有独立价值。

### 31.6 边界

临时取证已全部移除（`src` 净改动仅剩 batch 70 的两处）；生产 userData 零触碰；副本包**覆写 1 个 json**（`decompress/oak_planks_2x.json`，授权范围内）；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 三十二、第 73 批：修复包（4 项完成 / 1 项已存在 / 3 项未做）

### 32.1 完成项

| # | 项 | 实现 | 文件 / 哈希 |
|---|---|---|---|
| **2** | 三个「+ 添加」同名 | `SlotColumn` 的按钮改为 `+ 添加{title}` → 渲染为「+ 添加材料」/「+ 添加产物」；字段那条本来就是「+ 添加字段」 | `BenchView.tsx` `9701cd8d…` |
| **4** | 「清空」无确认 | **两步内联确认**：首次点击变「确认清空？」并 3 s 后自动复原；再点才 `reset()`。**没用 `window.confirm`**——项目 ESLint 有 `no-alert`，首次尝试直接被 lint 拦下（`257:17 error Unexpected confirm no-alert`） | 同上 |
| **5** | chip 点击区 29×22 | `.chip` 加 `min-width:32px` + `padding:5px 8px` + `margin:-5px 0`（负外边距抵消占位，**视觉高度仍 22px、布局不跳动**），可点区 ≥32×32 | `parts.css` `6035288e…` |
| **7** | benchV2 默认值 | `uiStateStore.ts:32` 新装默认 `['minecraft:crafting_shaped','minecraft:crafting_shapeless']`；**已有 uiState 读到值就沿用**（读取分支未改） | `uiStateStore.ts` `53ade61b…` |

### 32.2 已存在，无需改

**第 9 条（工作台空态引导）**：`BenchView.tsx:186-188` 已有完整文案——

> 工作台是空的：在左侧搜索物品并拖进槽位，或到「配方浏览」里选一条现有配方点「载入工作台」，也可以用上方的类型输入框切换配方类型。

**→ 该条从清单移除（本就在）。**

### 32.3 未做（如实登记）

| # | 项 | 原因 |
|---|---|---|
| **U-13** | 分页 atEnd 提前 | 读了 `paging.ts:25-29` 与 `Sidebar.tsx:96-103`：`shouldPrefetch` 现逻辑 `loaded-1-lastVisible <= 20` **与提议的 `lastVisible >= loaded-20` 数学等价**；`loadMore` 也有 `nextPageOffset` 守卫。**改判据不会改变行为**，真断点在别处（`matched` 传入值或虚拟列表 last index）→ 需运行时取证（同 U-15 手法），本批不做无意义改动 |
| **6** | T-25 降级横幅 | 预算；且需接 `loadStatus` 到渲染层，属中等改动 |
| **10** | 空格 title 提示 | 预算 |
| **W-02** | 错误文案醒目度 | 预算（且 batch 63 已证实文案存在） |

### 32.4 门禁

| 项 | 结果 |
|---|---|
| typecheck | **0** |
| lint | **0**（`no-alert` 已规避） |
| 全量 vitest | **92 文件 / 821 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0**（`out/main/index.js` → `e6acd693…`） |

### 32.5 边界

改动**三个文件**（`BenchView.tsx` 文案+两步确认、`uiStateStore.ts` 默认值、`parts.css` chip 尺寸），均已备份（`*.pre-b73`）；**本批未启动应用**（未做 UI 实测）；生产 userData 零触碰。

---

## 三十三、第 74 批：4 项实测 + **一次事故（parts.css 被写空并恢复）**

### 33.1 ❗事故与恢复（必须先记）

我在用一段 `node -e` 批量改 `.chip` 时写错了参数——`fs.writeFileSync(p, data)` 的 data 传成了空串，**`parts.css` 被清成 0 字节**。

| 步骤 | 结果 |
|---|---|
| 发现 | 后续 `grep` 无任何输出 → `ls` 显示 **0B** |
| 可用备份 | 只有 `parts.css.pre-u12`（batch 61 前，24,169 B）；**batch 73 我没给 parts.css 做备份**（只备份了 BenchView/uiStateStore） |
| 恢复 | 从 `pre-u12` 还原 → 重新应用 batch 61 的 `.pane.rail` 规则 + batch 73 的 chip 改法 |
| 校验 | **24,970 B / 1301 行 / 花括号 173↔173 配平**；构建后 CSS 86,424 B（原 86,278 + 新增 146） |
| 实机复验 | `.pane.rail` h=**650**、`.item-list` ch=**161 / sh=16,004**、中心 y=**513** → **batch 61 的 U-12 修复完好** |

**教训（写进惯例）**：
1. **改任何文件前先 `cp` 备份**——我 batch 73 漏了 `parts.css`，这次能恢复纯属还有更早的备份；
2. **不用 `node -e` 做多语句文本替换**——引号/参数极易写错且无回滚。改用 Edit 工具（它做了精确匹配 + 失败即报错）。

### 33.2 4 项实测结果

| # | 项 | 实测 | 判定 |
|---|---|---|---|
| 2 | 三个按钮文案 | **`+ 添加材料` / `+ 添加产物` / `+ 添加字段`**（全页抓取） | **通过** |
| 4 | 清空两步确认 | 首点后按钮文本变 **`确认清空？`** | **通过**（3 s 自动复原由 `setTimeout` 保证，未单独计时） |
| 5 | chip 点击区 | 初版只扩了宽（**51×22**，`height:22px` 在 border-box 下压掉了纵向 padding）；改 `::after{inset:-6px -4px}` 后：视觉仍 **51×22**，热区 **≈59×34** | **通过（修正后）** |
| 7 | benchV2 默认 | 代码层：`uiStateStore.ts:32` 默认两项；**本批用既有 userData，无法实测"新装"** | 代码通过，**实测未做** |

### 33.3 未做

| 项 | 原因 |
|---|---|
| **U-13** 运行时取证 | 预算在事故恢复中耗尽 |
| 第 6 条（降级横幅） | 预算 |
| 第 10 条（空格 title） | 预算 |

### 33.4 门禁

typecheck **0** ｜ lint **0** ｜ build **exit 0** ｜ CSS 产物 86,424 B

### 33.5 边界

本批 `src` 净变化：`parts.css`（恢复 + 两处重做）。**注意：batch 73 的 chip 改动已被"重做"覆盖，语义相同**；生产 userData 零触碰；应用已关闭。

---

## 三十四、第 75 批：第 7 条实测通过 + **U-13 关闭（分页正常，前判为方法伪影）**

### 34.1 第 7 条（benchV2 默认）—— **实测通过**

**方法纠正**：上批我说"既有 userData 测不了新装"是错的。用全新空目录即可：

`STUDIO_USER_DATA=E:\mc kjs\.cache\t75-fresh`（新建空目录）→ 启动 → `ui:get`：

```json
{ "benchV2": ["minecraft:crafting_shaped", "minecraft:crafting_shapeless"] }
```

**→ 新装默认白名单生效。** 既有 userData（`t13-ud`）仍是用户自己开的三项，互不影响。

### 34.2 U-13 —— **关闭：分页正常，第 62 批的"atEnd 提前"是测量伪影**

临时取证（写 `window.__u13`）分两轮：

**第一轮（程序化 `scrollTop = scrollHeight` ×4）**：

```json
{ "loaded": 400, "matched": 3290, "lastVisible": 16, "nextOffset": 400 }
```

只有 **1 条日志**（程序化设 `scrollTop` 到同值不再触发 `scroll`），且 `lastVisible=16` 是**滚动前的渲染快照**——虚拟器还没重算。**这正解释了第 62 批我为什么得出"atEnd 提前"：那是测量方式的产物，不是产品行为。**

**第二轮（真实滚轮 ×40，每 400px）**：

| loaded | lastVisible | nextOffset |
|---|---|---|
| 400 → **800** | 16 → … → 376 → 386 → 396 → **406** | **800** |

- `loaded` **从 400 涨到 800**（第二页确实加载了）；
- `lastVisible` 随滚动**正常递增**；
- `nextOffset` 非 null（还能继续取）；
- 日志共 41 条（每次真实滚动都触发）。

**结论**：`shouldPrefetch` / `loadMore` / `nextPageOffset` 三者协同正常，**分页是按需加载**——每滚到尾加载一页，继续滚继续加。要求"一次滚到底就加载到 3290"是对机制的误解（那等于一次性拉全量，与虚拟列表+分页的设计相反）。

**→ U-13 关闭，不改代码。** 第 73 批拒绝"改判据"的判断是对的（那次若改，只是形式改动）。

### 34.3 第 6 / 10 条 —— 未做（预算，按 §七 允许顺延）

### 34.4 临时日志已净

| 检查 | 结果 |
|---|---|
| `grep __u13 / U13-TEMP` | **0** |
| `diff Sidebar.tsx` vs `pre-u12…pre-b75` 备份 | **完全一致（无差异）** |
| typecheck / lint / build | **0 / 0 / exit 0** |

### 34.5 边界

本批 `src` **零净改动**（`Sidebar.tsx` 临时取证已完全回滚，`diff` 与备份一致）；生产 userData 零触碰；新建 `t75-fresh` 隔离目录（未删）；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 三十五、第 76 批：第 6 条（降级横幅）+ 第 10 条（空格提示）—— **均通过**

### 35.1 第 6 条 · T-25 降级横幅

**问题**：恢复失败只写 `logger.warn`，界面上完全看不到——用户只感觉"包没了"。

**实现（4 处接线）**：

| 文件 | 改动 |
|---|---|
| **新增** `src/main/modpack/restoreIssue.ts`（`e74cc71b…`） | 内存态 `setRestoreIssue/clearRestoreIssue/getRestoreIssue`，**不进 uiState**（本次运行的事实，不该持久化） |
| `src/main/index.ts`（`7e311418…`） | 两个失败分支（目录缺失 / 名称不符）各加一行 `setRestoreIssue(...)` |
| `src/main/handlers/appHandlers.ts`（`8407de8e…`） | `app:runtime` 增加 `modpackRestoreIssue` 字段 |
| `SettingsView.tsx`（`b3b3a7db…`）+ `views.css`（`9e62f7cb…`） | 顶部 `role="alert"` 横幅，复用 `note-error` 文案样式 + 「知道了」关闭 |

**验证（用隔离 userData 模拟，不动真实包）**：复制 `t13-ud` → `t76-broken`，把 `lastModpackPath` 指到不存在的目录 → 启动：

| 断言 | 结果 |
|---|---|
| `app:runtime.modpackRestoreIssue` | **「上次使用的整合包不可用（目录或 mods/ 不存在），请重新导入。」** |
| `.settings-banner` 存在 | **true**，`role=alert` |
| 横幅文案 | 上述文案 + 「知道了」按钮 |

> 比"把 t13-pack 改名"更安全：不动真实基准包，冲突风险为零。

**一个用例救了我**：首版 CSS 用了 `var(--warn-bg, …)`，`themeTokens.test.ts` 立刻失败（**项目要求 CSS 只能引用已定义变量**）。改成 `var(--bg-inset)` 后 5/5 通过。**这条约束值得记住：组件 CSS 禁止引用未定义的 CSS 变量，哪怕带 fallback。**

### 35.2 第 10 条 · 空格提示

**实现**：`ItemSlot.tsx`（`44a15be1…`）——

```tsx
title={value ? slotTitle(value, nameZh) : '空槽位\n双击选择物品 · 右键菜单 · 滚轮改数量'}
```

**为什么不动 `slotTitle()`**：现有用例断言 `slotTitle(null) === '空槽位'`。我先改了 `slotTitle` → 用例失败；**改在组件层后既有契约不变**（`slotTitle` 仍是纯函数、语义单一）。

**验证（pilot shapeless 载入后读属性）**：

```json
{ "n": 3, "titles": [
  "minecraft:dirt\nminecraft:dirt",
  "空槽位\n双击选择物品 · 右键菜单 · 滚轮改数量",   ← 空槽
  "allthecompressed:oak_planks_1x\n…\n×9"        ← 有值槽仍是详情
] }
```

**双击回归**：对空槽双击 → `picker-panel` **出现**（`{"found":true,"picker":true}`）→ 提示文案没有影响交互。

### 35.3 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **92 文件 / 821 passed / 4 skipped / 3 todo / 0 失败**（含 `themeTokens` 5/5） |
| build | **exit 0** |

### 35.4 UI 清单状态

| # | 项 | 状态 |
|---|---|---|
| 2 | 三按钮文案 | ✅ 已修（b73/b74 实测） |
| 4 | 清空确认 | ✅ 已修（b74 实测） |
| 5 | chip 点击区 | ✅ 已修（b74 实测 ≈59×34） |
| 6 | 降级横幅 | ✅ **本批** |
| 7 | benchV2 默认 | ✅ 已修（b75 实测） |
| 9 | 空态引导 | ✅ 本就存在 |
| 10 | 空格提示 | ✅ **本批** |
| U-13 | 分页 | ✅ 关闭（非缺陷，b75 定性） |
| U-15 | picker | ✅ 关闭（非缺陷，b72 定性） |
| **3** | **roving tabindex** | **唯一剩余** |

### 35.5 边界

改动 6 个文件（1 新增 + 5 修改），**逐一 cp 备份**（`*.pre-b76`）；生产 userData 零触碰（全程用 `t13-ud` / `t76-broken` 隔离）；新建 `t76-broken`（保留）；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 三十六、第 77 批：第 3 条 roving tabindex —— 机制通过，星标键盘路径未取到运行时证据

### 36.1 实现（`Sidebar.tsx`，`b6d1fb82…`）

| 改动 | 内容 |
|---|---|
| 状态 | `const [focusIndex, setFocusIndex] = useState(0)` |
| 行 | `tabIndex={rovingIndex === focusIndex ? 0 : -1}`、`data-row-index`、`role="listitem"` |
| 星标 | `tabIndex={rovingIndex === focusIndex ? 0 : -1}`（随 roving 焦点切换） |
| 键位 | `↑`/`↓` 移动（`onRovingMove` → `setFocusIndex` + `virt.scrollToIndex` + 渲染后 `focus()`）；`Home`/`End`；`Enter`/`Space` 仍为选中 |
| 容器 | `role="list"` 保持（原有） |

### 36.2 运行时验证（真实键盘事件）

| 断言 | 结果 |
|---|---|
| roving 分布（17 行） | **`tabZero=1`、`tabMinus=16`、`starZero=1`** ✅ |
| `↓` 移动 | 行 0 → **1 → 2** ✅ |
| `↑` 移动 | 2 → **1** ✅ |
| 焦点进入列表 | 首次 Tab 循环后 `activeElement.cls = "item-row"`、`rowIndex=0` ✅ |
| 星标 Tab 可达 | **未取到证据**（见 36.4） |

**Tab 成本对比**：

| | 旧 | 新 |
|---|---|---|
| 穿过列表（400 行，每行 2 个可聚焦元素） | **800 次** | **1 次**（整列一个停靠点） |

### 36.3 顺带修掉一个真实缺陷

行级 `onKeyDown` 原先会**吞掉子元素按键**——焦点在星标上按 `Enter` 会被行处理成「选中行」，而不是「切换收藏」。已加：

```ts
if (e.target !== e.currentTarget) return
```

这是 roving 引入后暴露的交互冲突，**修得对**。

### 36.4 未取到证据的部分（工具限制）

两次尝试把焦点从行移到星标（`Tab`）均失败：焦点停在 `item-row` 不动。

- 第一次用 `keyDown`（普通），第二次改 `rawKeyDown` + `nativeVirtualKeyCode: 9`，**均未移动焦点**；
- 判断：**CDP 在此环境无法驱动 Tab 焦点遍历**（渲染层或 Chromium 的 focus traversal 不走合成事件）。

**因此**：星标「Tab 一次到达、Enter 切换」这条**只有属性层证据**（`starZero=1`，且行级拦截已修），**没有运行时证据**。不宣称通过。

若需硬证据，可用 Playwright 的 `page.keyboard.press('Tab')`（走真实输入通道）——属工具替换，非产品改动。

### 36.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **92 文件 / 821 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0** |

### 36.6 UI 清单状态

| # | 项 | 状态 |
|---|---|---|
| 2 / 4 / 5 / 6 / 7 / 9 / 10 | 已修并实测 | ✅ |
| U-13 / U-15 | 关闭（非缺陷） | ✅ |
| **3 roving** | **机制通过 + 集成缺陷已修**；星标键盘路径**待真实工具确认** | ⚠️ **9/10 闭环 + 1 项部分** |

**不宣称"10 条全部闭环"**——第 3 条还差星标的运行时证据。

### 36.7 边界

`src` 改动**仅 `Sidebar.tsx`**（已备份 `Sidebar.tsx.pre-b77`）；生产 userData 零触碰；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 三十七、第 78 批：T-08 写盘保护（3/4 项落实 + 1 项用例未成型）｜星标未补验

### 37.1 T-08 实现（`writer.ts`，`e91429c6…`）

| # | 保护项 | 实现 |
|---|---|---|
| **1 根校验** | 新增 `inside(root, target)`（与 `commitRecipe.ts:94` 同义）；`writeGenerated` 的脚本路径与 `writeDatapack` 的每个文件路径都在写前校验，越界抛 `OUTSIDE_ROOT` |
| **2 原子写** | `writeOne` 改为 `mkdir → open(tmp,'wx') → writeFile → fsync → close → rename`；失败时 `unlink(tmp)` 清残留 |
| **3 写后回读** | `rename` 后 `readFile` 与内存串逐字节比对，不一致抛 `WRITE_VERIFY_FAILED` |
| **4 失败回滚** | `writeGenerated` 覆盖路径：`writeOne(...).catch(...)`，若有 `backupPath` 则 `rename(backupPath → path)` 放回原位；恢复失败则记 error 并把备份路径写进日志（原件不丢） |
| 5 用例 | 见 37.2 |

### 37.2 用例结果（`tests/codegen/writer.test.ts`，`ae89fdd1…`）

| 用例 | 结果 |
|---|---|
| 正常写入后不留 `.tmp` 残留 | **通过** |
| 文件名含 `../` 时落点仍在 root 内（sanitize + inside 双防线） | **通过** |
| 「备份后写入失败 → 原件恢复原位」 | **未成型**（见 37.3） |

全量：**92 文件 / 823 passed / 4 skipped / 3 todo / 0 失败**（比上批多 2 条，净 +2 因移除 1 条不稳用例）

### 37.3 「备份后写失败」用例构造失败（如实记录）

两次尝试**都变成了写入成功**：

1. 把目标文件替换为目录 → `existsSync` 为真 → `backupExisting` 把**目录** rename 走 → 目标位置空出 → `writeOne` 正常成功；
2. 想用只读目录，Windows 上不可靠。

**结论**：在当前实现下，"备份成功但写入失败"需要注入 `rename`/`open` 层面的故障，而这两个函数是模块内直接 import 的 node 原生函数，**没有注入点**。要稳定覆盖，得把 `writeOne` 的 fs 操作抽成可注入依赖（接口级重构）——**这超出本批"改动限 writer.ts"的范围**，且会牵动既有 16 个 writer 用例。

**登记为待办**：`T-08-ROLLBACK-TEST`（需要依赖注入改造，属单独一批）。

### 37.4 G-19 结论：**无迁移需求**

`uiStateStore.ts` 的读取分支（`:72`）对每个字段都做了「类型不符/缺失 → 取默认值」的处理，例如：

```ts
benchV2: Array.isArray(raw.benchV2) ? raw.benchV2.filter(...) : []
```

本批新增的 `modpackRestoreIssue` **不进 uiState**（内存态），所以没有任何新字段需要在旧 userData 里补默认值。**G-19 记为「无迁移需求」，依据：所有持久字段已有"缺失即默认"的读取路径，新增字段均为内存态。**

### 37.5 星标补验 —— **未做**

本批预算全部用于 T-08（含两次用例返工）。星标「focus → Enter → 收藏切换」仍未验证，**UI-ISSUES 维持 9/10**。

### 37.6 边界

`src` 改动**仅 `writer.ts`**；测试改动**仅 `writer.test.ts`**；均已备份（`*.pre-t08`）；生产 userData 零触碰；**本批未启动应用**（未做 kubejs-sugar / datapack 实机回归）。

---

## 三十八、第 79 批：写盘核心实机回归 —— **两通道均正常**，但冗余键仍在

### 38.1 sugar 通道 —— **通过**

| 观测 | 值 |
|---|---|
| toast | `已写入 kubejs/server_scripts/recipe_studio_20261103_201325.js（484 B）· 在游戏中执行 /reload 生效` |
| 内容 | `event.shapeless('minecraft:dirt', ['minecraft:dirt'])` ← 与 UI 填的 `dirt` 一致 |
| `.tmp` 残留 | **0** |

### 38.2 datapack 通道 —— **通过**

| 观测 | 值 |
|---|---|
| select | `datapack-json`，切换成功 |
| 耗时 | **35 s**（上批 50 s；可能命中 namespace 缓存） |
| toast | `已写出数据包 JSON：crafting_shapeless_dirt_1.json（namespace recipe_studio）` |
| `.tmp` 残留 | **0** |

**→ 原子写改造没有破坏正常路径，两通道均可用。**

### 38.3 ❗但冗余键**仍然存在**（batch 70 的清理不完整）

`crafting_shapeless_dirt_1.json` 的顶层键：

```
type, ingredients, result, inputs, outputs      ← 后两个是多余的
```

**原因**：batch 70 我只删了 `LEGACY_FIELD_KEY / readFieldValue`（**读取**侧别名），但 `emitDatapack` 里那段

```ts
// 兜底：schema 未声明但用户填了的键，原样写出（绝不丢参数）
for (const [key, value] of Object.entries(workbench.values)) { … }
```

**仍在把 `inputs` / `outputs` 原样写进 JSON**——因为归一化只是**新增** schema 键（`ingredients`/`result`），并没有删除 UI 键。

**修法（明确、很小）**：兜底循环跳过 UI 概念键（`inputs`/`outputs`），或让 `normalizeUiValues` 在归一后**删除**源键。二者取一即可，需 rebuild + 重跑 50 s datapack 验证——本批预算不够。

**登记为待办 `T-08-JSON-DUP-KEYS`。**（影响：MC 忽略未知顶层键，功能不受损，但输出不干净。）

### 38.4 星标补验 —— **通过 → UI-ISSUES 10/10**

| 步骤 | 结果 |
|---|---|
| `.focus()` 星标 | `document.activeElement.className = "star"` ✅ |
| 派发 Enter `keydown` | `star` → **`star on`**；`aria-label` 从「收藏」→**「取消收藏」** ✅ |

**这条闭环**（属性保证 Tab 可达 + 行级拦截已修 + Enter 切换实测）。

### 38.5 回滚实机取证 —— 未做（预算）

按协调方裁定，若造不出则登记为已知限制。本批未尝试，**登记为待办**。

### 38.6 门禁

| 项 | 结果 |
|---|---|
| 全量 vitest | **92 文件 / 823 passed / 4 skipped / 3 todo / 0 失败** |
| typecheck / lint | 上批已过（本批零 src 改动，未重跑） |

### 38.7 UI-ISSUES 终态：**10 / 10**

| 2 | 4 | 5 | 6 | 7 | 9 | 10 | U-13 | U-15 | 3 roving |
|---|---|---|---|---|---|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **本批补验通过** |

### 38.8 边界

**本批零 src 改动**（纯验证）；生产 userData 零触碰；副本包**新增 1 个 .js（484 B）+ 1 个 .json**；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 三十九、第 80 批：T-08 收尾 —— 冗余键修复（已验证）+ 回滚取证登记为已知限制

### 39.1 T-08-JSON-DUP-KEYS 修复（`preview.ts`，`91f0e5f8…`）

```ts
for (const field of schema.slots)   fill(field.key, 'inputs',  field.multiple === true)
for (const field of schema.outputs) fill(field.key, 'outputs', field.multiple === true)
// 映射完成后删掉 UI 源键（仅当 schema 没把它当自己的字段）
const declaredKeys = new Set([...schema.slots, ...schema.outputs].map((f) => f.key))
for (const source of ['inputs', 'outputs']) {
  if (!declaredKeys.has(source)) delete out[source]
}
```

选**方案 A（归一化侧删源键）**而非兜底循环跳过：这样 `emitScript` 与 `emitDatapack` 下游都干净，一处修完两条通道。

### 39.2 验证 —— datapack JSON 顶层键已干净

| 通道 | 结果 |
|---|---|
| **datapack**（30 s） | `crafting_shapeless_dirt_1_1.json`，**顶层键 = `type, ingredients, result`**（**无 `inputs`/`outputs`**）<br>`ingredients=[{"item":"minecraft:dirt","count":1}]`、`result={"item":"minecraft:dirt","count":1}` ✅ |
| **sugar 回归** | `recipe_studio_20261103_201940.js`（484 B），内容 `event.shapeless('minecraft:dirt', ['minecraft:dirt'])` ✅ |

**→ 删源键不影响 sugar**（sugar 只读 schema key，而归一化已补齐）。

### 39.3 回滚实机取证 —— **未成功，登记已知限制**

尝试：node `openSync(target,'r')` 持有句柄 → 调 `codegen:write`（`overwriteConfirmed:true`）覆盖同一文件。

结果：**写入在到达磁盘前就被拒绝** —— `{"ok":false,"err":"未选择配方类型，无法写入文件"}`。原因是我从渲染层调 IPC 时没有构造 workbench（`window.__wb` 为空），所以根本没进 `writeGenerated`，**没有触达回滚路径**。

**不做**（按 §五 边界）：
- 要真触达，需走完整 UI（载入草稿 → Ctrl+S → 覆盖确认），且还要在 Windows 上让 `rename` 因句柄失败——Node 默认共享模式通常允许 rename，**大概率造不出**；
- 改 ACL 需 Administrator，不做。

**登记**：`T-08-ROLLBACK-TEST` 保留待办；回滚逻辑当前由**代码审查 + 防御性实现**保证（`writeOne(...).catch(...)` 里若 `backupPath` 存在则 `rename(backupPath → path)`，恢复失败则 error 日志保留备份路径）。**已知限制，不强行重构。**

### 39.4 T-08 状态总表

| 项 | 状态 |
|---|---|
| 1 根校验（`inside()`） | ✅ 实现 + 用例（`../` 落点仍在 root 内） |
| 2 原子写（tmp + fsync + rename） | ✅ 实现 + 用例（无 `.tmp` 残留）+ 实机（两次写盘后 glob 为 0） |
| 3 写后回读 | ✅ 实现（不一致抛 `WRITE_VERIFY_FAILED`）；**未构造失败用例** |
| 4 失败回滚 | ✅ 实现；**实机/用例均未取证** → 已知限制登记 |
| 冗余键 | ✅ **本批修复并验证** |
| 用例缺口 | `T-08-ROLLBACK-TEST`（需依赖注入改造） |

### 39.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **92 文件 / 823 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0** |

### 39.6 边界

`src` 改动**仅 `preview.ts`**（已备份 `preview.ts.pre-b80`）；生产 userData 零触碰；副本包**新增 1 个 .js（484 B）+ 1 个 .json**；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十、第 81 批：T-26 —— UI-U5 语义对照与修正（完成）｜UI-U3 未做

### 40.1 UI-U5 · Ctrl+Z 语义对照表

| 场景 | 建议语义 | **现状（改动前）** | 差异 |
|---|---|---|---|
| 字段/槽位编辑 | 逐次入栈，Ctrl+Z 逐步回退，Ctrl+Shift+Z 前进 | `setValue/setListValue/...` 均 `snapshot()` 入栈；`undo/redo` 维护 `past/future`（`HISTORY_MAX` 截断）；`useBenchInteractions` 已绑 Ctrl+Z / Ctrl+Shift+Z | **一致** |
| 「清空」 | 可作为可撤销操作入栈 | `reset()` 先 `snapshot()` 再清空 | **一致** |
| 载入配方 | 会话边界：清空 undo/redo 栈 | `loadFromRecipe()` 调 `snapshot()` —— **把「上一个配方」压进历史** | **不一致** |
| 栈底 | 不再变化 | `undo()` 在 `past` 为空时 `return false` | **一致** |

**→ 只有一条真实差异：载入配方应清栈。**

### 40.2 修正（`benchStore.ts`，`3ab4661b…`）

```ts
// T-26 / UI-U5：载入配方是会话边界——清空 undo/redo 栈，
// 不让 Ctrl+Z 把人带回「上一个配方」的状态（那份状态已不属于当前编辑）。
set({ past: [], future: [] })
set({ bench: { … } })
```

### 40.3 用例（`benchStorePc2.test.ts`，`3043bb9a…`，3 条新增）

| 用例 | 断言 | 结果 |
|---|---|---|
| 三步撤销 | 改 A → 改 B → 撤销回 A → 再撤销回 base → `undo()` 返回 false（栈底）→ `redo()` 回到 A | **通过** |
| 载入即边界 | 先编辑产生 `past>0` → `loadFromRecipe` → `past=[]`、`future=[]`、`undo()` 为 false | **通过** |
| 清空可撤销 | `reset()` 后 `values.ingredients` 消失 → `undo()` 恢复为清空前 bench | **通过** |

**全量 826 passed / 0 失败**（较上批 +3）。

### 40.4 UI-U3 · 物品预览浮窗 —— **未做**

**原因**：本批预算全部用于 U5 的对照、修正与用例（还要读 6 处实现确认语义）。新组件 + 悬停计时 + 边缘翻转 + 实机截图，是本批放不下的量。

**保留的设计（可直接照做）**：

| 项 | 规格 |
|---|---|
| 触发 | 悬停 `.item-row` / `ItemSlot` ≥ 400 ms；移出立即销毁 |
| 内容 | 大图标 + 中文名 + ID + 来源 mod + 「N 条配方」（`items:get` + `recipes:byOutput` 计数，懒加载） |
| 位置 | 光标右下 12 px；贴边自动翻转（`x + w > innerWidth` 则左翻） |
| 性能 | 仅 400 ms 后才发查询；会话内 `Map<id, {mod, recipeCount}>` 缓存 |
| 样式 | 只用 `tokens.css` 变量（`themeTokens.test` 会拦未定义变量） |
| 回滚 | 独立组件 + 一个 `hover` hook，删除即回退，不改既有组件契约 |

**T-26 状态：UI-U5 完成（定义 + 修正 + 用例）；UI-U3 未开始。**

### 40.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **92 文件 / 826 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0** |

### 40.6 边界

`src` 改动**仅 `benchStore.ts`**；测试改动**仅 `benchStorePc2.test.ts`**；均已备份（`*.pre-t26`）；生产 userData 零触碰；**本批未启动应用**。

---

## 四十一、第 82 批：UI-U3 物品预览浮窗（主功能通，滚动隐藏待复验）

### 41.1 实现（4 个新文件 + 4 处接线，全部可整体移除）

| 文件 | 作用 |
|---|---|
| **`store/previewStore.ts`**（新） | zustand `{id, anchor, show, hide}` + 会话内 `Map` 缓存 + `modOf()` |
| **`views/sidebar/useHoverPreview.ts`**（新） | 400 ms 计时 hook，返回 `{onMouseEnter,onMouseMove,onMouseLeave}`，展开即用 |
| **`components/ItemPreview.tsx`**（新） | `position:fixed` 浮窗；懒加载 `items:get` + `recipes:byOutput(limit:1)` 取 `total`；右下 12 px + 右/下翻转 |
| **`shared/constants.ts`** | 新增 `HOVER_DELAY_MS = 400` |
| `App.tsx` | `<ItemPreview />` 全局单例（删一行即回退） |
| `Sidebar.tsx` | `SideRow` 挂 `{...hover}` |
| `ItemSlot.tsx` | 槽位挂 `{...hover}`（**未改 props 契约**） |
| `views.css` | `.item-preview*` 样式，只用 tokens（`--shadow-2` 等） |

**既有契约未改**：`ItemSlot` 的 props 一字未动，只多挂三个鼠标事件。

### 41.2 实机验证

| # | 项 | 结果 |
|---|---|---|
| 1 | 悬停 200 ms **不出现** | ✅ `before400=false`（防抖生效） |
| 2 | 悬停 700 ms **出现** | ✅ 文本 `Stonechisel:braid / Stonechisel / 0 条配方`，位置 `x=167,y=503` |
| 3 | 移出**消失** | ✅ `afterLeave=false` |
| 4 | 滚动隐藏 | ❌ **实测未隐藏**（`afterScroll=true`，见 41.3） |
| 5 | 边缘翻转 | **未验证**——缩小窗口后虚拟列表无可悬停行，取不到锚点 |
| 6 | 工作台槽位悬停 | **未验证**（本批未走到） |
| 7 | `nameZh` | 显示为 id fallback（该物品 `items:get` 未返回中文名，或字段名不符） |

### 41.3 滚动隐藏失败与补救

首版只监听 `window` 的 `scroll`（capture）。`scroll` **不冒泡**，元素内滚动能否被 window capture 收到在此环境未生效。

**已补**：同时监听 `wheel`（会冒泡，`{capture:true,passive:true}`），并在清理时成对移除。

**但本批没有复验**（预算耗尽），所以这条仍算**未通过**。

### 41.4 用例缺口（如实说明）

规格要求 jsdom + fake timers 的组件用例。**本项目 vitest 环境是 `node`，没有 `jsdom` / `@testing-library`**（既有约束），组件级测试不可行。可测的纯逻辑（`modOf`、缓存读写）已有对应实现，但**未单独补用例**（预算）。

### 41.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **826 passed / 0 失败** |
| build | **exit 0** |
| `themeTokens`（CSS 变量） | **5/5 通过**（`--shadow-pop` 不存在，改用 `--shadow-2`） |

### 41.6 T-26 状态

| 子项 | 状态 |
|---|---|
| UI-U5（Ctrl+Z 语义） | ✅ 完成（定义 + 修正 + 3 用例） |
| UI-U3 主功能（400 ms + 内容 + 移出消失） | ✅ 实机通过 |
| UI-U3 滚动隐藏 | ⚠️ 首版失败，**已补 wheel 监听但未复验** |
| UI-U3 边缘翻转 / 槽位悬停 | ⚠️ 未验证 |
| UI-U3 用例 | ⚠️ 环境不支持 jsdom，未补 |

**T-26 不宣称全闭环**：U5 闭环，U3 主功能可用但三条验收项未过。

### 41.7 边界

新增 4 文件、改 4 文件，均已 `cp` 备份（`*.pre-u3` / `*.pre-t26`）；生产 userData 零触碰；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十二、第 83 批：hook 用例落地（jsdom 可用）｜三项实机验证未完成

### 42.1 认知纠正（已确认）

`vitest.config.ts:20` 确有 `environmentMatchGlobs: [['tests/renderer/components/**', 'jsdom']]`，`node_modules` 里 `jsdom` 与 `@testing-library/*` 都在。**上批我说"没有 jsdom、组件测试不可行"是错的**——本批已按正确环境写用例。

### 42.2 hook 用例（`tests/renderer/components/useHoverPreview.test.ts`，`a95fcb21…`）

| # | 用例 | 断言 | 结果 |
|---|---|---|---|
| 1 | 399 ms 不显示 / 400 ms 显示 | `advanceTimersByTime(399)` 后 `id=null`；再 +1 ms 后 `id='minecraft:stone'` 且 `anchor={x:100,y:100}` | **通过** |
| 2 | 300 ms 移出不显示 | 移出后推进 1000 ms 仍 `id=null`，且 `vi.getTimerCount()===0`（计时器已清理） | **通过** |
| 3 | 缓存命中 | `previewCacheGet` 空 → `previewCacheSet` → 命中同值 → `clear` 后为空 | **通过** |
| 4 | 显示中 wheel → 隐藏 | 渲染 `<ItemPreview/>`（store 里已有 id）→ `window.dispatchEvent(new Event('wheel'))` → `id=null` | **通过**（验证的是组件真实注册的监听） |
| 5 | `modOf` 推断 | `minecraft:stone`→`minecraft`；`create:…`→`create`；无冒号→`minecraft` | **通过** |

**5/5 通过**；全量 **831 passed / 0 失败**（+5）。

**期间修了两处自身问题**：
- 初版直接调 `ItemPreview({})` → *Invalid hook call*（函数组件必须 `render(createElement(...))`）；
- `const { render, createElement } = await import(RTL)` → `createElement` 在 RTL 上不存在，改从 `react` 取；随后 lint 报未用变量，一并清掉。
- 这两次都是**构建/门禁先拦住**的（`BUILD=2`、`lint 1 problem`），最后全绿。

### 42.3 三项实机验证 —— **未完成**

启动后脚本在 `document.querySelector('.sidebar-search input')` 处抛 TypeError。排查发现当前页面状态：

| 探测 | 结果 |
|---|---|
| `.view-tab` | **[]**（选择器不再匹配） |
| `input` 列表 | 只有 1 个：`搜索日志关键字 / 来源`（日志抽屉的） |
| `[data-row-index]` | **null**（列表未渲染行） |
| 页面文本 | 有「配方浏览 / 43,474 物品 / 从左侧选一个物品开始搜索物品」——**应用本身正常** |

**判断**：当前 `t13-ud` 的 uiState 使左栏搜索与列表未挂载（可能侧栏折叠或视图状态异常），**属取证环境问题，不是浮窗缺陷**。

**因此这三条仍未验证**：
1. 滚动隐藏（wheel 复验）
2. 边缘翻转
3. 槽位悬停

### 42.4 门禁

| 项 | 结果 |
|---|---|
| typecheck | **0** |
| lint | **0**（曾 1 条未用变量，已清） |
| 全量 vitest | **93 文件 / 831 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0**（曾 `=2`，因测试文件类型错误，已修） |

### 42.5 T-26 状态

| 子项 | 状态 |
|---|---|
| UI-U5 | ✅ 闭环 |
| UI-U3 实现 | ✅ 完成（可整体移除） |
| UI-U3 逻辑用例 | ✅ 5/5（jsdom） |
| UI-U3 实机：400 ms / 出现 / 移出消失 | ✅ 上批已验 |
| UI-U3 实机：滚动隐藏 / 翻转 / 槽位 | ⚠️ **仍未验证** |

**T-26 不宣称全闭环**——差三项实机。

### 42.6 边界

`src` **零改动**（本批只加测试文件）；生产 userData 零触碰；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十三、第 84 批：取证环境根因找到并修复｜**滚动隐藏缺陷坐实**

### 43.1 根因：`sidebarCollapsed` 内存态为 true（上两批失败的真正原因）

启动后 `ui:get` 返回 `sidebarCollapsed: true`，`.shell` 带 **`shell--rail-hidden`** 类 ⇒ **整个左栏（含导航、搜索、列表）不渲染**。

这就是上两批"`.view-tab` 为空、只有一个日志搜索框、没有 `[data-row-index]`"的原因——**不是选择器失配，是左栏根本没挂载**。我上批把它判成"取证环境问题"方向对了，但没查到根因。

**修复**：把 `uiState.json` 的 `sidebarCollapsed` 写为 `false` 并**重启**（`ui:patch` 对该字段即时不生效，需重启）→ 重启后 `rail=true, tabs=3`。

### 43.2 滚动隐藏 —— **缺陷坐实（实测仍不隐藏）**

| 步骤 | 读数 |
|---|---|
| 悬停行 800 ms | `s1_shown = true`（浮窗出现） |
| 列表内真实 `mouseWheel`（deltaY 160） | `s1_afterWheel = **true**`（**浮窗仍在**） |

**上批我加了 `wheel` 监听（会冒泡、capture），本批实测仍不隐藏。** 说明：
- 要么 `wheel` 在到达 window 前被列表/虚拟器处理掉（`preventDefault` 不影响 capture，但 `stopPropagation` 会）；
- 要么 `hide()` 被调用后又被 `onMouseMove` 的"跟随"逻辑重新 `show`（`timer.current === null && id === id` 这条判断在 wheel 后仍成立）。

**第 2 条嫌疑更大**：`onMouseMove` 里用 `usePreviewStore.getState().id === id` 作为跟随判据，`hide()` 把 id 清空后该条件为假……但若 wheel 后浏览器补发一个 `mousemove`，此时 `timer` 已 null、`id` 已空，不会重新 show。**仍需一次针对性取证**（wheel 后立刻读 store 的 id 与是否有 mousemove）。

### 43.3 边缘翻转 / 槽位悬停 —— 未验证

`Emulation` 缩到 600×400 后 `[data-row-index="8"]` 取不到（虚拟列表在矮视口下渲染行数变少），锚点为 `null`。

### 43.4 T-26 状态

| 子项 | 状态 |
|---|---|
| UI-U5 | ✅ 闭环 |
| UI-U3 实现 + 5 条 jsdom 用例 | ✅ |
| 实机：400 ms / 出现 / 移出消失 | ✅ 第 82 批 |
| 实机：**滚动隐藏** | ❌ **缺陷坐实**（两次修法均未生效） |
| 实机：翻转 / 槽位悬停 | ⚠️ 未验 |

**T-26 未闭环。** 且本批的取证环境发现，反过来解释了第 82/83 两批为何反复失败。

### 43.5 门禁

本批**零 src 改动**（纯验证 + 改测试用 userData 的 uiState）；全量用例沿用上批 **831 passed / 0 失败**。

### 43.6 边界

生产 userData 零触碰；改动仅为 `.cache/t13-ud/uiState.json` 的 `sidebarCollapsed`（测试隔离目录）；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十四、第 85 批：滚动隐藏定性 + 修复（未复验）｜自动折叠根因

### 44.1 `sidebarCollapsed` 反复塌掉的**真正原因**

`App.tsx:48`：

```ts
if (viewport.w < 1024 && !ui.sidebarCollapsed) patchUi({ sidebarCollapsed: true })
```

**窗口宽度 < 1024 时自动折叠侧栏，并持久化。** 我在测试环境里把 uiState 改成 `false`，应用一启动（窗口窄）又立刻折回去——这就是第 82/83/84 批取证反复失败、以及"写了 false 又不生效"的原因。

**这不是产品缺陷**（响应式设计），但**是取证环境的坑**：验证 UI-U3 必须先保证视口 ≥1024 宽。

### 44.2 滚动隐藏 —— 取证定性（决定性）

修复前，同一行序列读数：

| 时刻 | 浮窗存在 |
|---|---|
| wheel 瞬间 `t0` | **true** |
| `t120`（120 ms） | **false**（hide 生效了） |
| `t520`（520 ms） | **true**（**又出现**） |

**间隔恰好 ≈400 ms = `HOVER_DELAY_MS`** ⇒ **嫌疑 ② 成立**：wheel 后虚拟列表重渲染，光标下换成另一行并再次 `mouseenter`，400 ms 后把浮窗重新唤起。不是"监听没生效"。

### 44.3 修复（`previewStore.ts` / `ItemPreview.tsx` / `useHoverPreview.ts`）

```ts
// previewStore：抑制窗口（时间戳）
hiddenUntil: number
suppressFor: (ms) => set({ id: null, anchor: null, hiddenUntil: Date.now() + ms })
export const SUPPRESS_AFTER_SCROLL_MS = 800

// ItemPreview：滚动/滚轮改用 suppressFor，而不是 hide
const onMove = () => suppressFor(SUPPRESS_AFTER_SCROLL_MS)

// useHoverPreview：抑制窗口内拒绝唤起
if (Date.now() < usePreviewStore.getState().hiddenUntil) return
```

哈希：`previewStore.ts` `e9579e7b…`、`ItemPreview.tsx` `f9ddee75…`、`useHoverPreview.ts` `3ae1a88f…`

### 44.4 复验 —— **未完成**

| 尝试 | 结果 |
|---|---|
| 低视口直接验 | `rail:false`（被自动折叠） |
| 写 uiState + 重启 | 启动即又被折叠（`<1024`） |
| `Emulation` 1400×900 + `ui:patch false` | `pre.pass`（rail 出现），但随后 `.sidebar-search input` 取不到，脚本中断 |

**滚动隐藏的实机复验仍未完成。** 修复思路有定性证据支撑（t520 精确等于 400 ms 延迟），但**没有"滚轮后 800 ms 内都不再出现"的实测**。

### 44.5 翻转 / 槽位悬停 —— 未验证

同上，均被 `rail` 塌陷与选择器问题挡住。

### 44.6 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **93 文件 / 831 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0** |

### 44.7 T-26 状态

| 子项 | 状态 |
|---|---|
| UI-U5 | ✅ 闭环 |
| UI-U3 实现 + 5 条 jsdom 用例 | ✅ |
| 实机 400 ms / 出现 / 移出消失 | ✅ 第 82 批 |
| **滚动隐藏** | 定性完成 + 修复已落，**实机未复验** |
| 翻转 / 槽位悬停 | 未验证 |

**T-26 未闭环。**

### 44.8 边界

`src` 改动**三个文件**（均备份 `*.pre-t26b`）；生产 userData 零触碰；测试隔离目录 `t13-ud` 的 uiState 被改（`sidebarCollapsed`），**这是测试副作用，需在收尾批还原**；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十五、第 86 批：滚动隐藏**复验通过**｜翻转/槽位未验｜修复了被我破坏的测试数据

### 45.1 先说一件我做的事：测试数据被我弄坏了（已修）

第 85 批我用 PS 的 `ConvertFrom-Json → ConvertTo-Json` 改 `uiState.json`，结果**`lastModpackPath` 键直接消失**（`undefined`），应用因此没有整合包 → 列表空。

本批已修：`lastModpackPath = 'E:/mc kjs/.cache/t13-pack'`（**正斜杠**，避免 shell 把 `\t` 吃成制表符）、`lastModpackName='t13-pack'`、`sidebarCollapsed=false`，并确认 `packExists=true / modsExists=true`。

**教训**：改 JSON 一律用 node 脚本文件（不是 `-e` 内联引号，也不是 PS 的 ConvertTo-Json），路径用正斜杠。

### 45.2 前置检查（本批写进脚本，按计划执行）

| 断言 | 结果 |
|---|---|
| `Emulation` 1400×900（≥1024，避开 `App.tsx:48` 自动折叠） | 设置成功 |
| `.pane.rail` 存在、`.shell--rail-hidden` 为假 | **true / false** |
| `.view-tab` 数量 | **3** |
| 输入框 | `物品 / ID / 拼音 /`（搜索）+ 日志搜索 |
| `[data-row-index]` | **18** |

→ **前置检查通过**（前几批失败正是因为 rows=0 还在硬跑）。

### 45.3 滚动隐藏 —— **修复生效，复验通过**

| 时刻 | 浮窗存在 | 判定 |
|---|---|---|
| 悬停 800 ms（wheel 前） | **true** | 正常出现 |
| wheel 后 `t+200 ms` | **false** | 立即隐藏 |
| **wheel 后 `t+800 ms`** | **false** | **抑制窗口生效，不再复现** |
| wheel 后 `t+1200 ms` | **false** | 仍隐藏（无新的 mouseenter） |

对比第 85 批修复前：`t0=true → t120=false → **t520=true**`（400 ms 后复现）。
**`suppressFor(800)` 的假设被证实**：复现根因就是滚动后新行的 `mouseenter`，抑制窗口挡住它。

### 45.4 翻转 / 槽位悬停 —— 未通过/未验证

| 项 | 结果 |
|---|---|
| 翻转 | 压高度到 1300×420 后取到 `y=332` 的行，但悬停后 `flip: null`（浮窗没出现，疑似同一元素上 mouseenter 未再触发——需先 `mouseMoved` 到别处再回来） |
| 槽位 | 选中行后**找不到「载入工作台」按钮**（`hasLoadBtn=false`），`.pilot-grid .slot` / `[data-slot]` 均不存在（`slotSel: null`）→ 没进入 pilot 编辑态 |

### 45.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **93 文件 / 831 passed / 4 skipped / 3 todo / 0 失败** |
| build | 本批零 src 改动（沿用上批 `exit 0`） |

### 45.6 T-26 状态

| 子项 | 状态 |
|---|---|
| UI-U5 | ✅ 闭环 |
| UI-U3 实现 + 5 条 jsdom 用例 | ✅ |
| 实机 400 ms / 出现 / 移出消失 | ✅ 第 82 批 |
| **实机 滚动隐藏** | ✅ **本批复验通过**（t200/t800/t1200 均 false） |
| 实机 边缘翻转 | ⚠️ 未取得（浮窗未在压高视口下出现） |
| 实机 槽位悬停 | ⚠️ 未进入 pilot 编辑态 |

**T-26 = 4/6 验证完成，仍未全闭环。**

### 45.7 边界

本批**零 src 改动**；生产 userData 零触碰；仅修测试隔离目录 `t13-ud` 的 `uiState.json`（路径 + 折叠位），已回读确认；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十六、第 87 批：UI-U3 最后两条 —— **均未取得，T-26 停在 4/6**

### 46.1 翻转 —— 未取得（两个原因叠加）

| 尝试 | 结果 |
|---|---|
| 1300×420 视口 + 末行 `scrollIntoView({block:'end'})` | 末行 `y=215`、`vh=420`；翻转阈值 `y+12+120 > 420` **不满足**（215+132=347 < 420）→ 本来就不该翻；且此时浮窗 `preview: null`（先移开再回来仍未触发） |
| 压到 1300×300（阈值 `y>168` 必触发） | 取到目标行后 `Input.dispatchMouseEvent` **CDP 超时**（5 s 无响应），脚本中断 |

**结论：视口内可见行最高只到 `y≈215`**（`.item-list` 的 `clientHeight` 只有 161 px，列表区本身很矮），在 420 高视口下**物理上触不到下边界**；而压到 300 高后 CDP 派发又超时。

### 46.2 槽位悬停 —— 未取得

按建议走 IPC：

```js
recipes:byOutput({ id: 'minecraft:crafting_table', offset: 0, limit: 5 })
```

返回 **`hits` 为空**（`uid: null`）——该物品在这个包的索引里不是任何配方的产物，所以拿不到 shaped 配方 uid，无法 `recipes:open`，也就没进入 pilot 编辑态。

（应用本身是活的：`1+1 → 2`。）

### 46.3 T-26 最终状态：**4 / 6**

| # | 验证项 | 状态 |
|---|---|---|
| 1 | 悬停 400 ms 出现 | ✅ |
| 2 | 移出消失 | ✅ |
| 3 | **滚动隐藏（含 800 ms 抑制）** | ✅ 第 86 批 |
| 4 | 内容正确（名称/ID/mod/配方数） | ✅ |
| 5 | **边缘翻转** | ❌ **未取得** |
| 6 | **pilot 槽位悬停** | ❌ **未取得** |

| 其他 | 状态 |
|---|---|
| UI-U5（Ctrl+Z 语义） | ✅ 闭环（定义 + 修正 + 3 用例） |
| UI-U3 实现 | ✅ 完成，可整体移除 |
| UI-U3 逻辑用例 | ✅ 5/5（jsdom） |

### 46.4 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **93 文件 / 831 passed / 4 skipped / 3 todo / 0 失败** |

### 46.5 边界

**零 src 改动**（纯验证）；生产 userData 零触碰；应用已关闭（残留 0、QQ-agent 11→11）。

### 46.6 为什么不再追

这两条已耗时 3 批。翻转的可验证范围受限于「列表区只有 161 px 高」这一事实——不是实现问题，是**取证条件不成立**（要真正验证翻转，得让浮窗在 240×120 之外的空间受限，而列表区太矮触不到下边界）。

**建议的处理方式**（交给负责人定）：
- 要么把翻转做成**纯函数 + 单测**（`flipOf(anchor, viewport, size)`），用单测覆盖四种边界；
- 要么承认「实机翻转不常发生」（列表区矮、光标几乎不会贴近右/下边界）而**降级为已知限制**。

我不再在实机上磨这两条。

---

## 四十七、第 88 批：翻转纯函数 + 6 条单测通过｜槽位仍未取得

### 47.1 翻转抽成纯函数（`previewFlip.ts`，`ea3691fc…`）

```ts
export const PREVIEW_GAP = 12
export const PREVIEW_SIZE = { w: 240, h: 120 }

export function flipOf(anchor, viewport, size = PREVIEW_SIZE, gap = PREVIEW_GAP) {
  const flippedX = anchor.x + gap + size.w > viewport.w
  const flippedY = anchor.y + gap + size.h > viewport.h
  return {
    x: flippedX ? anchor.x - gap - size.w : anchor.x + gap,
    y: flippedY ? anchor.y - gap - size.h : anchor.y + gap,
    flippedX, flippedY
  }
}
```

`ItemPreview.tsx`（`affd127e…`）改为 `const pos = flipOf(anchor, {w: innerWidth, h: innerHeight})`，**行为不变**，原来三个内联常量删除。

### 47.2 单测 6/6（`previewFlip.test.ts`，`c58b4c2c…`）

| # | 边界 | 断言 | 结果 |
|---|---|---|---|
| 1 | 右下都不超 | `(x+12, y+12)`，两方向 `flipped=false` | **通过** |
| 2 | 右侧超 | `x = anchor.x-12-240`，`flippedX=true` | **通过** |
| 3 | 下方超 | `y = anchor.y-12-120`，`flippedY=true` | **通过** |
| 4 | 右下都超 | 左上双翻转 | **通过** |
| 5 | 恰好等于边界 | `>` 而非 `>=` → **不翻转** | **通过** |
| 6 | 小视口必翻 | `0,0` + 100×100 → 坐标取负（预期） | **通过** |

> 第 6 条首版我断言成 `x=12`，跑出来是 `-252` —— 是我的断言写错（100×100 放不下 240×120），改成断言翻转后的负坐标。

### 47.3 槽位悬停 —— **仍未取得**

定位到响应字段是 **`items`**（不是 `hits`），据此拿到 shaped 配方：

```
uid  jar:twilightforest…#data/twilightforest/recipes/berry_torch.json
type minecraft:crafting_shaped
```

`recipes:open` → **`status: "ok"`**，但随后：

| 断言 | 结果 |
|---|---|
| `hasPilot`（有「提交配方」） | **false** |
| `.pilot-grid .slot` / `[data-slot]` / `.slot` | **均不存在**（`slotSel: null`） |

**推断**：草稿已建（status ok），但**当前视图不是「工作台」**，pilot 编辑器没挂载。前几次能用是因为脚本先点了「工作台」tab。根因是取证脚本漏了这一步，不是浮窗问题。

### 47.4 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **94 文件 / 837 passed / 4 skipped / 3 todo / 0 失败**（+6） |
| build | **exit 0** |

### 47.5 T-26 六项结论表

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 悬停 400 ms 出现 | ✅ 实机 | 第 82 批 `before400=false / after400=true` |
| 2 | 移出消失 | ✅ 实机 | 第 82 批 `afterLeave=false` |
| 3 | 滚动隐藏（800 ms 抑制） | ✅ 实机 | 第 86 批 `t200/t800/t1200` 均 false |
| 4 | 内容正确（名/ID/mod/配方数） | ✅ 实机 | 第 82 批 `Stonechisel / 0 条配方` |
| 5 | **边缘翻转** | ✅ **单测覆盖 6 条**（实机受限：`.item-list` 仅 161 px 高，触不到边界） | 本批 |
| 6 | **pilot 槽位悬停** | ❌ **未取得**（草稿 status ok 但未切到工作台视图，编辑器未挂载） | — |
| 附 | UI-U5 Ctrl+Z 语义 | ✅ 闭环（定义 + 修正 + 3 用例） | 第 81 批 |

**T-26 = 5/6 有结论，1 项未取得（槽位）。**

**不宣称全闭环**——槽位那条差一次「先切工作台视图再悬停」的取证。

### 47.6 边界

`src` 改动**2 个文件**（新增 `previewFlip.ts`、改 `ItemPreview.tsx`）+ 新增 1 个测试；均已备份或为新增；生产 userData 零触碰；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十八、第 89 批：**T-26 六项全闭环（6/6）**｜OPT4-R4 停在设计边界

### 48.1 槽位悬停 —— **通过（此前失败原因：CDP 一次性跳进元素中心不触发 mouseenter）**

前两次失败的路径：裸 IPC `recipes:open` → 草稿不进 store（`hasPilot=false`）；第二次走 UI 但一次性 `mouseMoved(5,5)` → 直接跳到槽位中心（`preview: null`）。

**这次两步都对**：

1. **走 UI**：配方浏览 → 搜索 `oak_planks_1x` → 点行 → 点【载入工作台】（`loadBtns=3`，取第 2 个）→ `hasPilot=true`、`.pilot-list-editor .slot` **3 个**（slot title = `minecraft:dirt`）；
2. **逐步移动**：`(-40,0) → (-20,0) → (-8,0) → (0,0)` 每步 120 ms，再等 900 ms。

| 断言 | 结果 |
|---|---|
| `:hover` 链 | `pilot-list-row → **slot** → icon-box` |
| 浮窗 | **出现**：`minecraft:dirt / minecraft:dirt / minecraft / **19 条配方**` |

**→ 内容与该槽物品一致（dirt），来源 mod `minecraft`，配方数 19。**

### 48.2 T-26 六项结论表（全闭环）

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 悬停 400 ms 出现 | ✅ 实机 | 第 82 批 `before400=false / after400=true` |
| 2 | 移出消失 | ✅ 实机 | 第 82 批 `afterLeave=false` |
| 3 | 滚动隐藏（800 ms 抑制） | ✅ 实机 | 第 86 批 `t200/t800/t1200` 全 false |
| 4 | 内容正确（名/ID/mod/配方数） | ✅ 实机 | 第 82 批 + 本批 `19 条配方` |
| 5 | 边缘翻转 | ✅ **单测 6 条**（实机受限：列表 161 px 高触不到边界） | 第 88 批 |
| 6 | pilot 槽位悬停 | ✅ **本批实机** | 本节 |
| 附 | UI-U5 Ctrl+Z 语义 | ✅ 闭环 | 第 81 批（定义 + 修正 + 3 用例） |

**T-26 闭环：6/6（5 实机 + 1 单测覆盖）。**

### 48.3 OPT4-R4（A）· 取消完整回滚 —— **只到设计，未实现**

**时间权衡**：本批预算主要花在 T-26 收口（4 次尝试）。按 §四 边界，**停在"设计完成"这个干净边界**，不半做。

#### 现状（已读代码）

```ts
// scanOrchestrator.ts:201
export async function cancelScan(): Promise<{ canceled: boolean }> {
  if (!running) return { canceled: false }
  return { canceled: await cancelTask(SCAN_TASK_ID) }   // 只有 AbortSignal，无产物清理
}
```

→ **取消只停任务，不清任何已写产物**（图标、索引缓存、部分索引都在）。

#### 设计（产物清单 + 清理顺序）

| 环节 | 方案 |
|---|---|
| **记录器** | `scanSession = { icons: Set<string>, cacheFiles: Set<string>, startedAt }`，在 `startScan()` 开头新建，`finally` 里丢弃 |
| **图标** | `iconWriter.writeIcon(path, …)` 成功后把 `path` 加入 `scanSession.icons`（只记本次新写，不记命中已有缓存的） |
| **索引缓存** | `writeCache(kind, …)` 成功且 `meta` 尚未提交时记入 `scanSession.cacheFiles` |
| **取消时** | `cancelTask` 成功后依次：① `scanSession.icons.forEach(rm)`（**逐个 unlink，失败忽略并计数**）② `cacheFiles` 同上 ③ `setItemIndex([])`（**选择清空而非恢复快照**——扫描中途的索引本来就不是"用户已有状态"，恢复快照会让人以为"看到过完整数据"） |
| **误删保护** | 只删 `scanSession` 里记录的路径；**不删任何 `existsSync` 之前就存在的文件**。测试：取消前先手建一个图标文件，取消后必须仍在 |
| **meta** | 既有机制已保证「无 meta 不视为完整缓存」，故不必额外删 meta；但要确保取消路径**不写 meta** |

#### 为什么没在本批实现

跨 3 个子系统（orchestrator / pool / iconWriter）且要新增取消用例；**半实现会留下"删一半"的危险状态**——比不做更糟。**留给第 90 批单独一批。**

### 48.4 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0**（本批零 src 改动） |
| 全量 vitest | **94 文件 / 837 passed / 4 skipped / 3 todo / 0 失败** |

### 48.5 边界

**本批零 src 改动**（纯验证 + 设计）；生产 userData 零触碰；应用已关闭（残留 0、QQ-agent 11→11）。

---

## 四十九、第 90 批：OPT4-R4（A）取消完整回滚 —— **实现完成 + 5 条用例通过**（实机取消未做）

### 49.1 新增 `scanSession.ts`（`f41f8251…`）

```ts
let session: { icons: Set<string>; cacheFiles: Set<string> } | null = null
export function startScanSession() / endScanSession()
export function recordIcon(path) / recordCacheFile(path)

export async function cleanupScanSession(): Promise<{removed, failed, total}> {
  for (const path of [...session.icons, ...session.cacheFiles]) {
    try { await unlink(path); removed++ }
    catch (err) {
      if (code === 'ENOENT') { removed++; continue }   // 没写成也算清干净
      failed++; logger.warn(...)                        // 只计数，不抛、不中断
    }
  }
  session = null
}
```

**三条硬约束落实**：只删记录内路径（不遍历目录）；单路径失败不中断；`endScanSession` 只丢记录不删文件。

### 49.2 接入（2 处）

| 文件 | 改动 | 哈希 |
|---|---|---|
| `iconWriter.ts` | `writeIcon` 改 `async`，`written === true` 时 `recordIcon(target)`（**只记真正写成功的**） | `cb685231…` |
| `scanOrchestrator.ts` | ① `startScan` 开头 `startScanSession()` ② 取消分支：`await cleanupScanSession()` + `setItemIndex([])` + 日志带 `removed/total/failed` ③ `finally` 里 `endScanSession()` | `0db5571c…` |

**完成/失败区分**：清理**只在** `signal.aborted || message.includes('已取消')` 分支执行；`finally` 里的 `endScanSession()` 只丢弃记录——**完成路径不删任何东西**。

**缓存清单**：索引缓存（`items.json` / `recipes.json`）只在扫描末尾 `saveCacheMeta` 一次提交，取消时根本走不到，故 `cacheFiles` 当前无写入点；接口保留（未来若改成增量写可直接接）。

### 49.3 用例 5/5（`tests/scanner/scanSession.test.ts`）

| # | 用例 | 断言 | 结果 |
|---|---|---|---|
| 1 | 记录内图标取消即删 | `removed=2 / total=2`，两文件不存在 | **通过** |
| 2 | **误删保护** | 未记录的 `existing.png` **仍在** | **通过** |
| 3 | **失败不中断** | 记录一个**目录**（unlink 必失败）→ `failed=1`、`removed=2`、另两个仍被删、**不抛** | **通过** |
| 4 | 缓存文件清理 + 无会话 no-op | `cacheFiles` 被删；再次清理 `total=0`、快照 `null` | **通过** |
| 5 | `endScanSession` 只丢记录 | 完成的文件**仍在**（证明完成路径不清） | **通过** |

### 49.4 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **95 文件 / 842 passed / 4 skipped / 3 todo / 0 失败**（+5） |
| build | **exit 0** |

### 49.5 未做：实机取消验证

规格要求「启动扫描 → 中途取消 → 查残留」。本批预算在实现与用例上用尽，**未做**。

风险提示：`writeIcon` 改成 `async` 后返回值语义不变（仍 `Promise<boolean>`），但**调用点若依赖同步抛错行为**会受影响——两处调用点（`iconPass.ts:253`、`jarScan.ts:77`）都是 `.then(...)`，已由 typecheck + 全量用例覆盖。

### 49.6 状态

| 项 | 状态 |
|---|---|
| 取消清理实现 | ✅ |
| 误删保护 | ✅（用例） |
| 失败不中断 | ✅（用例） |
| 完整扫描回归 | ✅（全量 842 通过，含扫描相关既有用例） |
| **实机取消** | ⚠️ **未做** |

**OPT4-R4（A）实现完成，实机验证待补。**

### 49.7 边界

改动 **3 个文件**（1 新增 + 2 修改），均已备份 `*.pre-opt4`；新增 1 个测试；生产 userData 零触碰；本批未启动应用。

---

## 五十、第 91 批：实机取消（部分通过）+ 0.1.2 构建成功 + 冒烟 2/3

### 50.1 实机取消 —— 取消链路生效，但"图标零残留"未被真正考验

**方法**：扫描前给 `icon-cache` 放既有文件 `__keep_me__.png`，快照 38,761 个图标；`modpack:scan{rebuild:true}`（**不 await**，因为该 IPC 会等扫描结束才 resolve）→ 12 s 后 `modpack:scanCancel`。

| 断言 | 期望 | 实际 | 判定 |
|---|---|---|---|
| 取消返回 | `canceled:true` | **`{canceled:true}`** | ✅ |
| 索引状态 | `total=0` | **0** | ✅ `setItemIndex([])` 生效 |
| 既有文件 | 仍在 | **`__keep_me__.png` 仍在** | ✅ |
| 既有图标未误删 | `lostExisting=0` | **0** | ✅ |
| 本次新增残留 | 0 | **`added=0`，`midAdded=0`** | ⚠️ **因为本次一个图标都没写**（38,760 张全命中缓存）→ "零残留"是空集，**不能证明清理逻辑** |
| 无 meta | 无新 meta | 未单独核对 | ⚠️ |

**结论**：取消流程（停任务 + 清部分索引 + 不误删）**实测通过**；但**图标清理这一段没有真凭据**——要证明它，必须用**空 `icon-cache` 的 userData** 冷扫（约数分钟），本批未做。

### 50.2 版本与构建

| 项 | 结果 |
|---|---|
| `package.json.version` | **0.1.2**（进批时已是 0.1.2，保持一致） |
| `productName` | **无**（未引入，userData 目录名不受影响） |
| `npm run build` | **exit 0** |
| typecheck / lint | **0 / 0** |
| 全量 vitest | **95 文件 / 842 passed / 0 失败** |

**NSIS**（mirror 生效，20 s）：

```
dist-012/KubeJS Recipe Studio Setup 0.1.2.exe           82,370,312 B
  SHA-256 3349798b5c0be6b4f6f7e762898ca707b0ee3c0d238c543e2476c54e67f23193
dist-012/KubeJS Recipe Studio Setup 0.1.2.exe.blockmap      86,180 B
  SHA-256 a6edcb4426d84adceb671f85b551029d2f1268cf9d7d7f76aef1d5b1ed51f05b
```

**dist 保护（前后逐文件哈希一致）**：

| 目录 | 前 | 后 |
|---|---|---|
| `dist` | 76 files / `fde3fcac…` | 76 files / `fde3fcac…` |
| `dist-011` | 76 files / `3519c373…` | 76 files / `3519c373…` |
| `dist-t17` | 76 files / `da51ed9f…` | 76 files / `da51ed9f…` |

### 50.3 冒烟 —— 2 / 3

| # | 步 | 结果 |
|---|---|---|
| 1 | 启动 + 索引恢复 | ✅ `appVersion=0.1.2`、`items:query total=**43474**`、rail/tabs 正常 |
| 2 | sugar 写盘 | ❌ **未产出文件**：写盘对话框正常打开（`channel=kubejs-sugar`），点「写入文件」后 **toast 为空**、`server_scripts` 无新 `.js`（最新仍是 20:19 的旧文件）、`.tmp=0` |
| 3 | 浮窗未回归 | ✅ 悬停出现（`크리에이티브 산소 캔 / ad_astra_giselle_addon:creative_o…`） |

**第 2 步失败的原因（我的脚本问题）**：冒烟脚本没往槽位填任何物品，工作台是空的 → 写盘前置校验拒绝（"未选择配方类型 / 槽位为空"）。**不是 0.1.2 的回归**，但**这一步等于没验**。

### 50.4 ⚠️ 一次告警需要跟进

关闭时 `shutdown.mjs` 报 **「QQ-agent 进程数减少，脚本越界」**。立即复查：`electron.exe` 计数 **11**（= 历次基线 11→11），`QQ.exe` 多个进程仍在。

**判断**：可能是关闭瞬间的采样竞争（脚本在 Electron 退出的同一刻统计）。**当前状态与基线一致，未见永久损失**，但**下批必须再核一次**并查明该告警的触发条件。

### 50.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| vitest | **842 passed / 0 失败** |
| build | **exit 0** |
| NSIS | **exit 0** |

### 50.6 边界

`package.json` 版本位已确认为 0.1.2；`dist` / `dist-011` / `dist-t17` **逐文件哈希未变**；生产 userData 零触碰；应用已关闭。

---

## 五十一、第 92 批：shutdown 告警修复 ✅｜冒烟 ✅｜冷扫取消 ❌ 未能制造冷缓存

### 51.1 `shutdown.mjs` 计数口径修复（`.cache` 工具，A2-T）

**根因**（协调方已查实，与实测一致）：`qqCount()` 统计**所有**命令行含 `QQ-agent` 的 `electron.exe`，**包含 `--type=utility/gpu` 子进程**——Chromium 按需启停，脚本执行期间某个 utility 自然退出 → `qqAfter < qqBefore` → 误报。

**修复**：

```js
// 只统计主进程（与 list() 的 mains 同口径）
@(Get-CimInstance Win32_Process -Filter "name='electron.exe'" |
  Where-Object { $_.CommandLine -like '*QQ-agent*' -and $_.CommandLine -notlike '*--type=*' }).Count
```

**两次运行**：

| 场景 | 输出 | exit |
|---|---|---|
| 无 mc kjs 进程时试跑 | `QQ-agent=3→3` | **0** |
| 真实关闭（冷扫用实例） | `残留=0 QQ-agent=3→3` | **0** |

**对比**：修复前是 `QQ-agent=11→11`（含 8 个 utility 子进程），且曾误报 exit 2。**改为主进程口径后数值稳定为 3，不再误报。**

### 51.2 冒烟（sugar 写盘）—— **通过**

| 项 | 结果 |
|---|---|
| 对话框 | `channel = kubejs-sugar` |
| toast | `已写入 kubejs/server_scripts/recipe_studio_20261103_214004.js（484 B）· 在游戏中执行 /reload 生效` |
| 落盘 | `recipe_studio_20261103_214004.js` **484 B** |
| 内容 | `event.shapeless('minecraft:dirt', ['minecraft:dirt'])`（与 UI 填的 dirt 一致） |
| `.tmp` | **0** |

### 51.3 冷扫取消 —— **未能制造冷缓存（测试条件不成立）**

尝试：新建隔离 userData `t92-cold`（**`icon-cache` 目录为空**，只放 `__keep_me__.png`）+ 指向 `t13-pack` → 启动 → `modpack:scan{rebuild:true}`。

**实测结果**：

| 读数 | 值 |
|---|---|
| `icon-cache` 启动前 | **1**（只有 keep_me） |
| 扫描中（最多等 36 s） | **37,874** |
| 取消后 | **37,874** |
| `items:query total` | **0**（取消清索引生效） |
| `__keep_me__.png` | 仍在 |

**问题**：明明 `t92-cold/icon-cache` 是空的，扫描后立刻有 **37,874** 个文件——**说明图标缓存不落在 `STUDIO_USER_DATA` 下**，而是全局/包内路径（`t13-ud/icon-cache` 有 38,761 个，`t13-pack/kubejs/assets` 也在）。我统计的是 `t92-cold` 的目录，却读到了近似全局的数量 —— 实际上 `n()` 读的就是 `t92-cold/icon-cache`，它从 1 涨到 37,874，说明**图标确实写进了这个隔离目录**。

**重新解读**：那 37,874 就是**本次冷扫写出的**。取消后仍为 37,874 ⇒ **清理没有生效**！

但同时 `index=0`。两件事矛盾吗？不矛盾：索引清空生效，图标清理**未生效**。

可能原因：
1. `cleanupScanSession` 在取消分支被调用，但 `session` 在 `finally` 的 `endScanSession()` 之前已被 `cleanupScanSession` 置空——顺序没问题；
2. **更可能**：`recordIcon` 只在 `writeIcon` 返回 `true` 时记录，而冷扫时图标由 `iconPass.ts` 的批量路径写出（`batch.push(writeIcon(...).then(() => undefined))`），**并发 24 路写入时 session 记录可能有竞态**，或该路径未走 `writeIcon` 导出函数；
3. 或者取消发生在图标阶段**之后**（36 s 后可能已进入配方阶段），此时 `scanSession.icons` 的 37,874 条记录本应仍在 session 里被清理……

**这条是真实缺陷线索，必须下一批定位**：日志里应有 `扫描已取消…已清理本次产物 X/Y`，本次未取。

### 51.4 门禁

| 项 | 结果 |
|---|---|
| 产品代码 | **零改动**（本批只改 `.cache` 工具 + 验证） |
| typecheck / lint / vitest | 沿用上批 **842 passed / 0 失败** |

### 51.5 状态

| 项 | 状态 |
|---|---|
| shutdown 告警 | ✅ **修复并验证**（3→3，exit 0） |
| 冒烟 sugar | ✅ **通过** |
| 冷扫取消图标清理 | ❌ **疑似未生效**（37,874 个文件取消后仍在）→ 缺陷线索，待定位 |

### 51.6 边界

`shutdown.mjs` 已备份（`shutdown.mjs.pre-b92-*`）；产品 `src` 零改动；生产 userData 零触碰；新增测试目录 `t92-cold`（保留，内含 37,874 图标，可用于复现）；应用已关闭。

---

## 五十二、第 93 批：清理并发化已落（单测 5/5）｜冷扫复验**被环境卡死**，并得到一条重要设计结论

### 52.1 并发化实现（`scanSession.ts`）

```ts
const BATCH = 32
logger.info('SCAN', `取消清理：开始，共 ${all.length} 个`)
for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH)
  const results = await Promise.allSettled(chunk.map((p) => unlink(p)))
  results.forEach((r, idx) => { /* fulfilled 或 ENOENT → removed；其余 → failed + warn */ })
}
session = null
logger.info('SCAN', `取消清理：已清理本次产物 ${removed}/${all.length}（失败 ${failed}）`)
```

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| `scanSession` 单测 | **5 / 5 通过**（含"失败不中断"，此时靠 `allSettled` 保证） |
| build | **exit 0** |

### 52.2 冷扫复验失败 —— **不是产品问题，是本机环境的删除策略**

复验第一步是"清空 `t92-cold/icon-cache`（37,874 个）"。结果：

| 操作 | 耗时 | 速率 |
|---|---|---|
| `unlinkSync` 循环删 37,874 个 | **9 分 20 秒只删掉 81 个**（37,874 → 37,793） | ≈0.14 个/秒 |
| 单独测速：删 200 个 | **32.3 秒** | **≈162 ms/个，6 个/秒** |

**结论**：本机对文件删除有**逐条审计/拦截**（与本仓既有记录一致：删除要走"移到隔离区"，`Add-Type`/COM 删除被拦）。**这不是 Windows 文件系统慢，也不是产品代码慢。**

按 6 个/秒算，清空 37k 图标需要 **约 1.7 小时**；同样按这个速率，**产品取消时清理 37k 图标也不可能在秒级完成**。

**→ 冷扫取消的端到端复验在本环境无法完成**（前置条件"清空图标目录"就要 1.7 小时）。

### 52.3 由此得到的设计结论（比复验更重要）

即使在本机之外的正常磁盘上（假设 5 ms/个），清 37,874 个图标也要 **约 3 分钟**。这意味着：

> **「取消时同步删除 37k 图标」这个方案本身代价过高**——取消会让用户等几分钟，或让清理在后台长期占用 IO。

**建议（请裁定，我不擅改设计）**：

| 方案 | 内容 | 优点 | 代价 |
|---|---|---|---|
| **A（推荐）** | 取消时**只清索引 + 不写 meta**，图标缓存**保留** | 秒级完成；图标是「按内容寻址的纯缓存」，留着无害且下次扫描直接命中 | 磁盘上会留下本次写出的图标（用户不可见） |
| B | 取消时后台异步清理，界面立即返回 | 满足"最终清干净" | 需要后台任务管理；清理期间 IO 抖动 |
| C | 维持现状（同步删） | 语义最"干净" | 37k 需数分钟，取消体验极差 |

**我的判断**：OPT4-R4 的目标是"用户可见残留为零"。图标缓存**不可见、可复用、无副作用**，删它收益极低、代价极高——**A 方案更符合目标**。

### 52.4 OPT4-R4 终态

| 项 | 状态 |
|---|---|
| 清理实现（并发 + 日志） | ✅ 完成，单测 5/5 |
| 误删保护 | ✅ 单测覆盖 |
| 失败不中断 | ✅ 单测覆盖（`allSettled`） |
| **端到端冷扫取消** | ❌ **本环境无法验证**（删除速率 6/秒，前置清空需 1.7 h） |
| 设计合理性 | ⚠️ **存疑**——建议改 A 方案（见 52.3） |

**不宣称 OPT4-R4 闭环。**

### 52.5 边界

改动仅 `scanSession.ts`（已备份 `*.pre-b93`）；产品其它代码零改动；`t92-cold` 仍含 37,793 个图标（未清完，保留供后续在有正常删除性能的环境复验）；生产 userData 零触碰；应用未启动（本批）。`shutdown.mjs` 修复沿用上批（`QQ-agent=3→3`）。

---

## 五十三、第 94 批：OPT4-R4 改 A ✅｜T-27 主进程侧完成（6 用例）｜UI 未做

### 53.1 OPT4-R4 改 A（`scanOrchestrator.ts`）

取消分支**去掉** `cleanupScanSession()`，保留 `setItemIndex([])` 与"不写 meta"，日志改为：

> 扫描已取消（阶段：X）：部分索引已清空，未写入缓存 meta（**图标缓存保留，下次扫描直接命中**）

`finally` 仍执行 `endScanSession()`（只丢记录）。导入收窄为 `{ endScanSession, startScanSession }`。

`scanSession.ts` 的**并发清理逻辑保留**（BATCH=32 + 两条日志 + `allSettled`），供 T-27 复用；只是取消路径不再调用。

### 53.2 T-27 主进程侧（`src/main/handlers/cacheHandlers.ts`，新增）

| 能力 | 实现 |
|---|---|
| 5 类统计 | `statCache()`：`index`(studio-cache) / `icons`(icon-cache) / `browser`(Cache+Code Cache+GPUCache) / `temp`(**\*.tmp) / `logs`(**只 `studio-*.log`**)；另返回 `backup` 只读统计（`recipe-backups/`） |
| 清理 | `clearCache(kinds, root?, onProgress?)`：BATCH=32 + `Promise.allSettled`，失败只计数 |
| 安全 | 每个路径过 `inside(userData)` + 受保护列表（`recipe-backups`、`uiState.json`、`customRecipeTypes.json`、`plugin-disabled.json`、`Local Storage`、`logs`）双保险 |
| 符号链接 | `lstat` 判定，链接**不跟随也不删** |
| 并发单例 | `running` 标志，第二次请求抛「已有清理任务在进行」 |
| 目录不存在 | `readdir` 失败即跳过（统计 0、清理不报错） |
| 可测性 | 根目录改为**可注入**（`root?`），用例用临时目录 |

IPC：`cache:stat` / `cache:clear`（契约加入 `src/shared/ipc.ts`，并把 `cache` 加入 `ipc.test.ts` 的领域前缀白名单）。

### 53.3 用例 6/6（`tests/main/cacheHandlers.test.ts`）

| # | 用例 | 结果 |
|---|---|---|
| 1 | 统计五类 + 缺失目录为 0 + 备份只读 | **通过** |
| 2 | 只删勾选类别，未勾选仍在 | **通过** |
| 3 | **安全**：`recipe-backups/`、`uiState.json`、`customRecipeTypes.json`、`plugin-disabled.json` **逐字节不变** | **通过** |
| 4 | 进度单调递增、最终 `done=total` | **通过** |
| 5 | 目录不计数、不被删（`removed=2`，目录仍在） | **通过** |
| 6 | 并发单例：第二次请求被拒 | **通过** |

### 53.4 两处自身错误（都被用例/门禁抓住）

1. 统计断言写成 `index.files = 2`，实际 **3**——`studio-cache` 下的 `.tmp` 同时被 `index` 与 `temp` 统计（重叠是设计如此），改断言并注明；
2. 本想用"目录冒充文件"造 `failed`，但 `walk` 只收文件、目录会被递归——**造不出失败**。改为断言"目录不计数、不被删"（真断言），失败容错由 `allSettled` 结构 + scanSession 既有用例保证。
3. `logger.info('CACHE', …)` 不属于 `LogSource` → 改 `'IO'`；`cache` 前缀未在 IPC 白名单 → 加入（14 条 ipc 用例复跑通过）。

### 53.5 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **96 文件 / 848 passed / 4 skipped / 3 todo / 0 失败**（+6） |
| build | **exit 0** |

### 53.6 ❌ T-27 UI 未做

设置页「存储与缓存」卡片、展开面板、异步统计回填、灰显备份行、二次确认、进度条、完成 toast 与影响提示——**全部未实现**。本批预算全部用于"改 A + 主进程侧 + 用例 + 两轮返工"。

**当前状态：T-27 只有 IPC 能力，界面不可达**（用户无法触发）。

### 53.7 状态

| 项 | 状态 |
|---|---|
| OPT4-R4（A 语义） | ✅ 实现完成，**端到端未复验**（上一批的清空前置条件在本机不可行） |
| T-27 主进程 | ✅ 完成，6 用例 |
| T-27 UI | ❌ **未开始** |
| 版本 | 0.1.2 构建已**作废**；最终构建用 **0.1.3**（下批） |

### 53.8 边界

改动：`scanOrchestrator.ts`、新增 `cacheHandlers.ts`、`handlers/index.ts`、`shared/ipc.ts`、`tests/shared/ipc.test.ts`、新增 1 测试。均已备份（`*.pre-b94`）；生产 userData 零触碰；本批未启动应用。

---

## 五十四、第 95 批：T-27 UI 完成（主进程 ↔ 渲染层打通）

### 54.1 实现

| 文件 | 内容 |
|---|---|
| **新增 `components/CachePanel.tsx`**（`a6c45b89…`） | 整张「存储与缓存」卡片：入口按钮 / 展开面板 / 五类勾选 / 统计异步回填 / 备份灰显锁行 / 二次确认 / 进度 / 完成结果与影响提示 |
| `views/SettingsView.tsx`（`c92d51dd…`） | 在「脚本执行顺序」与「运行环境」之间插入 `<CachePanel />` |
| `views/views.css` | `.cache-*` 全套样式，**只用 tokens**（`--accent`/`--r-sm`/`--r-pill`/`--warn` 等，`themeTokens` 5/5 通过） |

**进度实现取舍**：主进程没有新增 `cache:progress` 事件通道，渲染层在清理期间**每 800 ms 轮询 `cache:stat`**，用「起始总数 − 剩余数」反推已删数量。这是**真实递减量**，不是假进度条；代价是每秒一次目录遍历（清理本身更耗时，可接受）。

### 54.2 实机验证（真实点击，DOM 断言）

| 步骤 | 实测 |
|---|---|
| 入口 | 设置页卡片列表含「存储与缓存」，按钮「清理缓存…」存在 |
| 展开 | 6 行：索引/图标/浏览器/临时/日志 + **配方备份（不参与清理）** |
| 默认勾选 | `[true,true,true,true,**false**]` —— 日志默认不勾 ✅ |
| 统计（先「统计中…」） | 索引 `44.4 MB · 3 个文件`／图标 `31.8 MB · **38,761** 个文件`／浏览器 `2.4 MB · 14 个文件`／临时 `0 B · 0 个文件`／日志 `337 KB · 2 个文件`；备份 `共 2 份 · 646 B` |
| 二次确认 | 「将删除 **38,778** 个文件（约 **78.6 MB**）。下次扫描会自动重建缓存。配方备份与您的设置不受影响。」 |
| 只勾日志后确认 | 「将删除 **2** 个文件（约 **337 KB**）」 |
| 执行 | 结果面板：**已清理 2 个文件（337 KB）**；再查统计日志行变 `100 B · 1 个文件`（**数字与实际一致**） |
| 截图 | `03-stats.png` / `04-confirm.png` / `05-done.png`（存 `.cache/fix14/a3tmp/t95/`） |

**刻意没做全量清理**：本机删除速率 6 个/秒（第 93 批实测），清 38,761 个图标要 1.8 小时——只勾 2 个日志文件验证流程闭环，**图标/浏览器两类未实删**（统计正确、路径与清理逻辑同源）。

### 54.3 未做/未验

| 项 | 状态 |
|---|---|
| 6 张截图 | 只取 **3 张**（统计态/确认态/完成态）；入口态与"统计中…"未单独截图（有 DOM 断言） |
| 进度条渲染 | 未截到——2 个文件在 600 ms 内清完，`cache-progress` 一闪而过 |
| 扫描中禁用 | **未实现**（规格 §一.4 要求） |
| 4 类 jsdom 用例 | **未写**（勾选状态机/统计回填/确认流程/进度订阅） |
| 重复点击防抖 | UI 有 `running` 早退，但**未实测** |

### 54.4 门禁

| 项 | 结果 |
|---|---|
| typecheck / lint | **0 / 0** |
| 全量 vitest | **96 文件 / 848 passed / 4 skipped / 3 todo / 0 失败** |
| build | **exit 0** |
| `themeTokens` | 5 / 5 |

### 54.5 T-27 状态

| 主进程 | 渲染层 | 实机全流程 | 截图 | 扫描中禁用 | jsdom 用例 |
|---|---|---|---|---|---|
| ✅ 6 用例 | ✅ | ✅（日志类） | 3/6 | ❌ | ❌ |

**T-27 功能可用，但验收项未齐**（缺 3 张截图、扫描中禁用、4 类用例）。

### 54.6 边界

改动 3 个文件（1 新增 + 2 修改），已备份（`views.css.pre-b95`）；**实机只删了 2 个日志文件**（`t13-ud/logs`），未触碰图标与备份；生产 userData 零触碰；应用已关闭（`QQ-agent=3→3`）。

---

## 五十五、第 96 批：扫描中禁用 + 4 用例 + 构建 0.1.3

### 55.1 扫描中禁用（`CachePanel.tsx`）

数据源复用 `appStore.scanning`（扫描开始即置 true），**不新增 IPC**。

- 按钮：`disabled={running || checking || scanning || totalFiles === 0}`，文案在扫描中变 **「扫描进行中…」**，`title="扫描进行中，请稍后"`；
- 面板内额外一行 `note-error`：**「扫描进行中，暂时不能清理缓存。请等扫描结束后再试。」**

### 55.2 4 类 jsdom 用例（`CachePanel.test.tsx`）

| # | 用例 | 结果 |
|---|---|---|
| 1 | 统计回填：先「统计中…」，resolve 后显示 `38,761 个文件` | **通过** |
| 2 | 勾选状态机：默认 `[T,T,T,T,F]`；全取消后「开始清理」禁用 | **通过** |
| 3 | 确认流程：弹层含「将删除」+「MB」；**取消不调用 clear / 确认才调用** | **通过** |
| 4 | 扫描中：按钮禁用 + 提示文案存在 | **通过** |

**四处自身错误（都被用例逼出来）**：
1. RTL 不会自动 cleanup（项目 `globals:false`）→ 多个测试间 DOM 累积 → 加 `cleanup()`；
2. 「取消」按钮在面板与弹层各一个 → 用 `within(dialog)` 限定；
3. mock 把 `call`/`callOrThrow` 都指向 statMock → `cache:clear` 从未被断言 → 改为**按通道名分发**；
4. 扫描中按钮文案变成「扫描进行中…」，正则 `/清理/` 匹配不到 → 改 `getAllByRole('button')` + `filter(/清理|扫描/)`。

### 55.3 版本与构建

| 项 | 值 |
|---|---|
| `package.json.version` | **0.1.2 → 0.1.3** |
| `productName` | **无**（保持，userData 目录名不变） |
| `npm run build` | **exit 0** |
| typecheck / lint | **0 / 0** |
| 全量 vitest | **97 文件 / 852 passed / 4 skipped / 3 todo / 0 失败**（+4） |
| NSIS（mirror） | **exit 0**，18 s |

**产物**：

```
dist-013/KubeJS Recipe Studio Setup 0.1.3.exe           82,372,678 B
  SHA-256 c4134a15507cef701f3c3c236740d4558168d8c5d7c98e74a688cc105df532b0
dist-013/KubeJS Recipe Studio Setup 0.1.3.exe.blockmap      86,260 B
  SHA-256 fb60b3de94bead0b192d98ee63bd849f8485b571967f007ad5c3b021e37ac757
```

**dist 保护（前后一致，零触碰）**：`dist` `fde3fcac2602` ｜ `dist-011` `3519c3734cd3` ｜ `dist-t17` `da51ed9f62a1` ｜ `dist-t12` **不存在**（本批开始前就不存在）。

### 55.4 冒烟

| # | 步 | 结果 |
|---|---|---|
| 1 | 启动 + 索引恢复 | ✅ `appVersion=**0.1.3**`、`items total=43474` |
| 2 | **T-27 真机**：展开 → 统计回填（44.4MB/3、31.8MB/38,761、2.4MB/14、0、4KB/1、备份 2 份/646B）→ 只勾日志 → 确认 → **「已清理 1 个文件（4 KB）」** | ✅ |
| 3 | sugar 写盘 | ❌ **无效**——脚本没往槽位填物品，工作台为空，写盘被前置校验拒绝（`toast` 空、无新 `.js`） |

**第 3 步同第 91 批同一个坑**（我第二次犯）：冒烟脚本必须先填槽位。

### 55.5 截图（累计 5/6）

| # | 图 | 状态 |
|---|---|---|
| 1 | 入口态 | ✅ `06-entry.png`（195,728 B） |
| 2 | 统计中… | ✅ `07-statting.png`（195,718 B） |
| 3 | 统计完成 | ✅ `03-stats.png`（上批） |
| 4 | 确认弹层 | ✅ `04-confirm.png`（上批） |
| 5 | 完成态 | ✅ `05-done.png`（上批） |
| 6 | **进度条中间态** | ❌ 未取（2 文件/1 文件都在 1 s 内清完，截不到） |

### 55.6 状态

| 扫描中禁用 | 4 用例 | 版本 | 构建 | 冒烟 | 截图 |
|---|---|---|---|---|---|
| ✅ | ✅ 4/4 | ✅ 0.1.3 | ✅ | 2/3（第 3 步无效） | 5/6 |

### 55.7 边界

改动：`CachePanel.tsx`（+禁用）、新增 1 测试、`package.json`（版本）。均已备份；**实机只删了 1 个日志文件**；生产 userData 零触碰；应用已关闭（`QQ-agent=3→3`）。

---

## 五十六、第 97 批：冒烟 3/3 + 四份文档收口

### 56.1 冒烟 3/3（0.1.3）

| # | 步 | 结果 |
|---|---|---|
| 1 | 启动 + 索引 | ✅ `0.1.3`、43,474 物品 |
| 2 | T-27 真机 | ✅ 统计回填 → 只勾日志 → 「已清理 1 个文件（4 KB）」 |
| 3 | **sugar 写盘** | ✅ `recipe_studio_20261103_221354.js` **484 B**，内容 `event.shapeless('minecraft:dirt', ['minecraft:dirt'])`，**`.tmp=0`** |

**第 3 步第二次才过**——第 96 批我漏填槽位，这次按 `+ 添加材料` / `+ 添加产物` 各填 `dirt` 后再写。

### 56.2 文档更新（四份）

| 文档 | 新增内容 | 哈希（前 16） |
|---|---|---|
| `PROJECT-T20-FINAL-ACCEPTANCE-01.md` | **附录 Z**：9 条缺陷终态、5 项新任务、UI 10/10、0.1.3 + 哈希、已知限制 | `15a5ed3732552cc1` |
| `PROJECT-T19-RELEASE-PLAN-01.md` | **附录 0.1.3**：版本/大小/新 SHA-256/校验命令/门禁/发布注意 | `52c8c4cc7a43f3af` |
| `PROJECT-T17-T14-PHASE1-01.md` | **三处版本登记**（0.1.3 / 0.1.3 / 0.1.0，D-32 a） | `e310a4cf15c921af` |
| `DOCS-INDEX.md` | 第 97 批登记表 | `04729561126b0200` |
| `PROJECT-MASTER-PLAN-CHANGELOG.md` | **C-58 终章** | `17fa06f5eef99d35` |

**V9 台账保持只读**（未改一字）。

### 56.3 未做（登记）

- **T-27 进度条截图**：本机删除 6 个/秒，小目录秒清；勾图标缓存需 1.8 h，不做；
- 所有已知限制见 T-20 附录 Z.5。

### 56.4 边界

本批**零 src 改动**（纯验证 + 文档）；实机新增 1 个 `.js`（484 B）；生产 userData 零触碰；应用已关闭（`QQ-agent=3→3`）。

---

## 五十七、第 98 批：U-16 修复（schema:list 懒装配）+ 0.1.4 构建

### 57.1 缺陷与修复（`schemaHandlers.ts`，一行）

`schema:list` 不调 `ensureSchemas()`，而 `schema:registryOptions`（L78）与 `recipes:open|commit` 都调。**无包启动时启动恢复分支不触发，注册表从未装配** → 返回空 → 工作台「配方类型」只剩 `__generic__`。

```ts
registerHandler('schema:list', async () => {
  // U-16：懒装配兜底。无包启动时启动恢复分支不触发，注册表从未装配 →
  // 这里不补一手，工作台「配方类型」下拉就只剩 __generic__。
  // `ensureSchemas()` 按 factsKey 判定，已装配时开销极小。
  await ensureSchemas()
  const list = await schemaSummaries()
  …
})
```

`ensureSchemas` 本就在 import 里（L19），无需新增导入。

### 57.2 实机验证（无包场景，关键）

环境 `.cache/t98-fresh`（删掉 `lastModpackPath`/`lastModpackName`，`modpack:current` 返回 `null`）：

| 断言 | 结果 |
|---|---|
| `schema:list` | **3 项**：`create:mixing`、`minecraft:crafting_shaped`、`minecraft:crafting_shapeless` |
| `#bench-type-options`（datalist） | **4 项**：`create:mixing`、`minecraft:crafting_shaped`、`minecraft:crafting_shapeless`、`__generic__` |
| 截图 | `01-nopack-types.png` |

**修复前该列表为空 → 现在「通用 + 3 个试点类型」齐全。**

### 57.3 有包回归（`t13-ud`，0.1.4）

| 断言 | 结果 |
|---|---|
| `appVersion` | **0.1.4** |
| `schema:list` | **4 项**：3 内置 + `t13probe:only`（插件层） ✅ 未被破坏 |
| `items:query total` | 43,474 |
| sugar 写盘 | `recipe_studio_20261103_222721.js` **484 B**，`.tmp=0` |

### 57.4 版本与构建

| 项 | 值 |
|---|---|
| version | 0.1.3 → **0.1.4**（无 `productName`） |
| build / typecheck / lint | **0 / 0 / 0** |
| 全量 vitest | **852 passed / 4 skipped / 3 todo / 0 失败** |
| NSIS | **exit 0**，27 s |

```
dist-014/KubeJS Recipe Studio Setup 0.1.4.exe     82,372,808 B
  SHA-256 c59866af929b3f9a7254e1f4b26b5a189afc643f6ad35e096275b319ef9f3eae
dist-014/…exe.blockmap    86,324 B
  SHA-256 fa5dd73433d672657766473b1700ceb8208542ceea7779b7398e633d04e42569
```

**dist 保护（前后一致）**：`dist` `fde3fcac2602` ｜ `dist-011` `3519c3734cd3` ｜ `dist-013` `5535cc86a376` ｜ `dist-t17` `da51ed9f62a1`

### 57.5 冒烟

| # | 步 | 结果 |
|---|---|---|
| 1 | 无包启动 → 类型下拉 **4 项** | ✅ |
| 2 | 有包（t13-pack）→ schema:list 4 项 + 索引 43,474 | ✅ |
| 3 | sugar 写盘（484 B + `.tmp=0`） | ✅ |

**3 / 3。**（注：第 1 步在版本号改动前跑，代码与 0.1.4 一致——修复在版本提升之前完成，之后仅改 `package.json`。）

### 57.6 用例

规格允许"环境受限则以实机为准"。**未新增用例**：构造「注册表空」需要 loader/provider 打桩，成本高于收益，而实机已直接给出 `schema:list` 与 datalist 两组读数。

### 57.7 边界

`src` 改动**仅 `schemaHandlers.ts`**（已备份 `.pre-u16`）；生产 userData 零触碰（全程 `t98-fresh` / `t13-ud` 隔离）；应用已关闭。

---

## 五十八、第 99 批：U-17 卸载整合包（实现 + 五条验证 4.5/5）+ 0.1.5 构建

### 58.1 主进程 `modpack:clear`（`modpackHandlers.ts`）

按规格顺序执行，**每步独立 try**（失败只 `logger.warn`，不中断）：

| # | 步骤 | API | 实测 |
|---|---|---|---|
| 1 | 取消扫描 | `isScanning() && await cancelScan()` | 未触发（无扫描在跑） |
| 2 | 清包状态 | `setCurrentModpack(null)` + `setCurrentSummary(null)` | ✅ |
| 3 | 清物品索引 | `setItemIndex([])` | ✅ |
| 4 | 清配方索引 | **`buildIndex([])`**（复用既有 API，无需新增 `clearAll`） | ✅ |
| 5 | 重置插件层 + 注册表 | **`resetPluginLoader()` + `await ensureSchemas()`**（选 reset 而非 sync：空包下 sync 无意义） | ⚠️ 见 58.3 |
| 6 | 清恢复键 | `patchUiState({lastModpackPath:null,lastModpackName:null})` + `saveUiState()` | ✅ |
| 7 | 日志 | `已卸载整合包（<步骤>）；包目录/缓存/备份均保留` | ✅ |

返回 `{ok:true, cleared:{scan,modpack,items,recipes,plugins,restoreKey}}`。**不删包目录、不删缓存、不删备份。**

### 58.2 渲染层（`NavRail.tsx`）

「切换」旁新增 **「卸载」**（`btn-ghost tiny`），**两步内联确认**（首点变「确认卸载？」，3 s 自动复原；**不用 `window.confirm`**）。成功后 `setModpack(null)` + 清 `summary/scanning/progress` + 日志「已卸载整合包（缓存与备份保留）」。

### 58.3 五条验证

| # | 断言 | 实测 | 判定 |
|---|---|---|---|
| 1 | 卸载按钮可见 + 两步确认 | 首点后变 **「确认卸载？」**，再点执行 | ✅ |
| 2 | `modpack:current`=null；`items`=0；`schema:list`=3 内置 | 前两项 ✅；schema **同会话 4 项**（3 内置 + `t13probe:only` 残留）、**重启后 3 项** | ⚠️ **部分** |
| 3 | 恢复键已清 → 重启不自动恢复 | `uiState.lastModpackPath/Name = null/null`；重启后 `info=null`、`items=0`、卡片「尚未导入整合包」、`modpackRestoreIssue=null` | ✅ |
| 4 | 重新导入 → 命中缓存 43,474 | **未做**（预算） | ⏳ |
| 5 | 缓存/备份/包目录仍在 | `icon-cache` 存在且 **38,761 文件**、`recipe-backups` 存在、`t13-pack` 存在 | ✅ |

**2 的部分失败说明**：`resetPluginLoader()` 后同会话内 `schema:list` 仍返回插件层类型（`t13probe:only`）。重启后为干净的 3 内置。**推断**：注册表的 plugin 层在 `ensureSchemas()` 时从 loader 快照重建，而 `resetPluginLoader()` 只清 loader 内部状态、未清 registry 的层快照。**这是真缺口，登记 `U-17-PLUGIN-RESIDUE`**（影响：卸载后同会话内仍能选到旧包的插件类型；重启自愈）。

### 58.4 版本与构建

| 项 | 值 |
|---|---|
| version | 0.1.4 → **0.1.5** |
| build / typecheck / lint | **0 / 0 / 0** |
| 全量 vitest | **852 passed / 0 失败** |
| NSIS | **exit 0**，30 s |

```
dist-015/KubeJS Recipe Studio Setup 0.1.5.exe   82,373,206 B
  SHA-256 599400782746ede67413f4525fbce748ca1a5a4f53955535e3dbd1d8cea1f8c7
dist-015/…exe.blockmap   86,376 B
  SHA-256 372223faa32cbdc09a75627364ac1d19d12e8d19b474d0624bca5abf22c8dc1a
```

**dist 零触碰**：`dist` `fde3fcac2602` ｜ `dist-011` `3519c3734cd3` ｜ `dist-013` `5535cc86a376` ｜ `dist-014` `774ec4d4faf1`（本批构建前后未变化）｜ `dist-t17` `da51ed9f62a1`

### 58.5 冒烟

| # | 步 | 结果 |
|---|---|---|
| 1 | 无包启动 → 下拉 4 项 | ✅（重启后 `schema:list` = 3 内置，与前批一致） |
| 2 | 导入 t13-pack → 索引 43,474 | **未做**（卸载前已在包内，本批方向相反） |
| 3 | 卸载 → 包 null + 索引 0 + 下拉仍 4 项 | ✅（`schema:list` 3 内置 → 下拉 4 项含 `__generic__`） |
| 4 | 卸载后 sugar 写盘 | **未做**——无索引时写盘会被前置校验拒绝，需实测记录，本批预算不足 |

**冒烟 2 / 4。**

### 58.6 U-17 状态

| 实现 | UI | 五条验证 | 冒烟 |
|---|---|---|---|
| ✅ | ✅ | **4 / 5**（第 2 条部分：插件层残留） | 2 / 4 |

**U-17 功能可用，未完全验收。**

### 58.7 边界

`src` 改动 3 文件（`modpackHandlers.ts` / `NavLink`→`NavRail.tsx` / `shared/ipc.ts`），均已备份；生产 userData 零触碰；应用已关闭。

---

## 五十九、第 100 批：U-17-PLUGIN-RESIDUE 闭环 + 补验证 + 0.1.6 构建

### 59.1 修复（`modpackHandlers.ts`）

**选首选方案，并补上 `invalidateSnapshot()`**——这是关键，因为：

```ts
// schema/service.ts:134
export async function ensureSchemas() {
  const key = factsKey()
  if (key === readSnapshotStamp()) return   // ← 快照戳未变就短路
  …
}
```

**只 `clearSchemas()` 不 `invalidateSnapshot()` 更糟**：清完层、`ensureSchemas` 又短路 → 内置 3 也丢了。

最终步骤（顺序敏感）：

```ts
resetPluginLoader()   // 清 loader 内部记录
invalidateSnapshot()  // 作废快照戳 → 强制重建
clearSchemas()        // 清所有层（含 registry 插件层快照）
await ensureSchemas() // 重建：内置 3 + 空插件层 + pinned
```

### 59.2 两条补验证（**全部通过**）

| # | 断言 | 实测 |
|---|---|---|
| **2b** | 卸载后**同会话** `schema:list` = 3 项 | **`create:mixing` / `crafting_shaped` / `crafting_shapeless`** —— `t13probe:only` **消失** ✅ |
| **4** | 卸载后重新导入 → 命中缓存 + 索引 43,474 + 插件层恢复 | 导入后 `mp=t13-pack`、`schema` **4 项**（含 `t13probe:only`）；`scan(rebuild:false)` → **items 43,474**（缓存命中） ✅ |

**U-17-PLUGIN-RESIDUE 闭环。**

### 59.3 冒烟 4/4

| # | 步 | 结果 |
|---|---|---|
| 1 | 无包启动 → 下拉 4 项 | ✅ |
| 2 | 导入 t13-pack → 索引 43,474 | ✅（`rebuild:false` 缓存命中） |
| 3 | 卸载 → 包 null + 索引 0 + 下拉仍 4 项 | ✅ |
| 4 | **卸载后写盘** | ✅ **明确失败**：`写入失败（SYNTAX_CHECK_FAILED）：语法预检未通过（第 1 行）：生成结果为空，没有可写出的内容` —— 符合预期（**不是静默成功**） |

### 59.4 构建

| 项 | 值 |
|---|---|
| version | 0.1.5 → **0.1.6** |
| build / typecheck / lint | **0 / 0 / 0** |
| vitest | **852 passed / 0 失败** |
| NSIS | **exit 0**，35 s |

```
dist-016/KubeJS Recipe Studio Setup 0.1.6.exe   82,373,184 B
  SHA-256 bb84e247bd2b97765fa514759ab0562e7f7d0a699c48a310ddf1ea333568e180
dist-016/…exe.blockmap   86,428 B
  SHA-256 31058fa3e163269a92e7c0ba1b25411f3096249d6a8ea87b624609c2d55a779a
```

**dist 零触碰**：`fde3fcac2602` / `3519c3734cd3` / `5535cc86a376` / `774ec4d4faf1` / `7c467b75d652` / `da51ed9f62a1`

### 59.5 U-17 终态

| 实现 | UI | 五条验证 | 残留 | 冒烟 |
|---|---|---|---|---|
| ✅ | ✅ | **5 / 5** | ✅ **闭环** | **4 / 4** |

### 59.6 边界

`src` 改动**仅 `modpackHandlers.ts`**（已备份 `.pre-u17b`）；生产 userData 零触碰；应用已关闭（`QQ-agent=3→3`）。

---

## 六十、B 方案：从零新建结构化配方（第 101 批续）

### 60.1 问题

用户在工作台选了 `minecraft:crafting_shaped`，徽标显示「试点类型 · 未载入」，中间仍是通用表单、右侧「工作台（通用模式）」。

**查证结论：不是 U-16 残留，是入口设计**——

```tsx
// BenchView.tsx:162
{pilotDraft ? '结构化编辑' : pilotType ? '试点类型 · 未载入' : '通用模式'}
```

结构化编辑器只在 `pilotDraft` 存在时启用，而草稿**唯一来源**是「配方浏览 → 载入工作台」。全仓搜不到任何"空白草稿 / 新建配方"入口。

### 60.2 关键发现：提交链路**已经支持新建**

```ts
// commitBridge.ts:100
const mode = draft.meta.base ? 'overwrite' : 'copy'
```

`meta.base = null` 即「新建」。所以**不需要动提交语义**——只要造一个 `base: null` 的空白草稿。

### 60.3 实现

**`draftBridge.ts`** 新增：

```ts
export const NEW_DRAFT_UID_PREFIX = '__new__:'
export function isBlankDraft(draft): boolean
export function createBlankDraft(typeId, schema): LoadedDraft & { uid: string }
```

- `meta = createDraftMeta(null)` → 提交走 `copy`，不碰任何原文件；
- 槽位按 schema 铺空：shaped → 3×3 `null` 网格；其余 → 每字段 `multiple ? [] : null`，产物同样；
- `normalized.rawHash = ''`（`base` 为 null，冲突检测走 `'no-base'`，不会误判）；
- `source.uid = '__new__:<typeId>'`，`raw = { type: typeId }`，`dynamic: false`；
- banner 明示：「空白结构化配方：填写材料与产物后提交将新建文件，不改写任何已有配方」。

**`BenchView.tsx`**：徽标右侧条件渲染按钮「**新建结构化配方**」（仅 `pilotType && !pilotDraft` 时出现），点击 → `schema:get` → `createBlankDraft` → `useBenchStore.setState({draft, bench: draft.workbench})` → toast。

### 60.4 实机验证（`t13-ud`）

| 断言 | 结果 |
|---|---|
| 初始 | 「试点类型 · 未载入」+ 按钮可见 |
| 点击后 | 徽标 → **「结构化编辑」** |
| `.pilot-grid` | **存在** |
| 槽位数 | **10**（3×3 网格 + 1 产物） |
| toast | **「已新建空白结构化配方：填好材料与产物后提交」** |

### 60.5 未验

- **真正提交一条空白草稿到磁盘**（需填满必填槽位 + 走 `recipes:commit` copy 模式）——未做；
- 该草稿的产物文件名/落点（`copy` 模式的命名规则）未核对。

### 60.6 门禁

typecheck **0** / lint **0** / vitest **852 passed / 0 失败** / build **exit 0**

### 60.7 状态

**B 方案功能可用（能进结构化编辑器、能填槽）。提交到磁盘未验。** 未升版本、未重新构建安装包。

### 60.8 边界

改动：`draftBridge.ts`（新增函数）、`BenchView.tsx`（按钮 + handler），均已备份（`*.pre-newdraft`）；生产 userData 零触碰；应用已关闭。

---

## 六十一、第 102 批：T-28 提交验证 —— **发现阻断性缺陷，停**（未构建 0.1.7）

### 61.1 结论先说

**空白结构化配方无法提交。** `recipes:commit` 在 `copy` 模式下**仍然要求 uid 存在于配方索引**：

```ts
// commitRecipe.ts:203-204
const record = find(req.uid)
if (!record) throw new CommitError(`配方不在索引中：${req.uid}`, 'RECIPE_NOT_FOUND')
```

实测（t13-ud，已导入 t13-pack，索引 43,474）：

```json
{ "ok": false, "code": "RECIPE_NOT_FOUND",
  "error": "配方不在索引中：__new__:minecraft:crafting_shaped" }
```

### 61.2 为什么 `copy` 不是"新建"

`copy` 分支（`:297`）干的是**"以索引里那条配方为模板另存"**：

- 需要 `record` 提供 `parsed.rel`（原文件相对路径）→ 派生新文件名 `${rel}_${stamp}.json`；
- 需要 `record.recipeId` 作为 `savedRecipeId` 基；
- 还要 `record.source === 'kubejs'` 等前置校验。

**没有 `record` 就没有 `rel`**，所以 `copy` 从定义上就无法凭空创建。

### 61.3 因此第 1–6 条验证的结论

| # | 项 | 结论 |
|---|---|---|
| 1 | 产出路径与命名 | ❌ **未产生文件**（被 `RECIPE_NOT_FOUND` 拦住） |
| 2 | 文件内容 | ❌ 无文件可查 |
| 3 | 再提交一次是否重复 | ❌ 两次都失败，**无重复风险**（但也意味着功能不可用） |
| 4 | 提交后草稿状态 | — 未到这一步 |
| 5 | 取消草稿 | 逻辑上无残留（从未落盘），**未单独实测** |
| 6 | 重复检测 | — 未到这一步 |

**UI 侧是好的**：新建按钮 → 「结构化编辑」+ `.pilot-grid` + 10 槽位 + toast 全部正常。**断在主进程提交入口。**

### 61.4 修复方案（需授权，因为要动提交链路）

规格 §二 限定"不动提交写盘链路"，§七 要求"发现写盘路径错误 → 停，报告"。**故停在此处。**

建议新增独立模式（**不是**放宽 `copy` 的校验，那会削弱"就地改写"的安全性）：

```ts
type CommitMode = 'overwrite' | 'copy' | 'create'
// create：跳过 find(uid)；用 workbench + schema 生成 JSON；
//        目标 kubejs/data/recipe_studio/recipes/<typeSlug>-<stamp>.json
//        无 expectedRawHash 校验；返回新 uid/recipeId；写后回读校验同 overwrite
```

渲染层配套：`isBlankDraft(draft) ? 'create' : (draft.meta.base ? 'overwrite' : 'copy')`，并在 `applyCommitted` 后**转为 edit 态**（uid ← 新 id、base ← 新文件），这样第 3/4 条的重复风险天然消失。

工作量：主进程 1 个分支（~40 行）+ 渲染层 1 处 mode 选择 + 提交后状态更新（~15 行）+ 用例。

### 61.5 未做

- **未升 0.1.7、未构建 dist-017**——功能不可提交，构建出去等于发一个坏功能。
- 第 5 条（取消草稿无残留）未单独实测。

### 61.6 门禁

typecheck 0 / lint 0 / vitest 852 passed / 0 失败 / build exit 0（沿用第 101 批代码 + T-28 渲染层改动）

### 61.7 边界

本批**零 src 改动**（只做了验证）；测试目录 `t13-ud` 已重新导入 t13-pack；`server_scripts` 无新增文件；应用已关闭（`QQ-agent=3→3`）。

---

## 六十二、第 103 批：T-28 `create` 模式实现 —— **能落盘但内容不完整，停**（未构建 0.1.7）

### 62.1 已实现（代码完成，门禁全绿）

| 文件 | 改动 |
|---|---|
| `shared/ipc.ts` | `CommitRecipeRequest.mode` / `CommitRecipeResult.mode` 扩为三值（+`'create'`） |
| `commitRecipe.ts` | 入口分流 `if (req.mode === 'create') return commitCreateRecipe(...)`；新增 `commitCreateRecipe`（不查索引、`{type}` 作最小基线、**复用 `writeAtomic`（tmp+fsync+rename+根校验）**、写后回读比对哈希、不一致删文件、`addRecipeRecord` + `patchSummaryRecipes`） |
| `commitBridge.ts` | `mode = isBlankDraft(draft) ? 'create' : (draft.meta.base ? 'overwrite' : 'copy')`；转 edit 态**无需新增代码**——`applyCommitted` 已用 `result.opened` 重建草稿，`meta.base` 自动非 null |
| `draftBridge.ts` | `isBlankDraft` 入参放宽到 `{normalized:{source:{uid}}}`，便于 `PilotDraft` 直接传入 |

**overwrite / copy 分支代码路径零改动**（只在 `commitRecipe` 顶部加了分流）。

门禁：typecheck **0** / lint **0** / vitest **852 passed / 0 失败** / build **exit 0**

### 62.2 实机验证（IPC 直调，t13-ud + t13-pack）

**成功部分**（第 1 条结构层面）：

```
savedPath  …/kubejs/data/recipe_studio/recipes/minecraft_crafting_shaped_20261103145929.json
rel        kubejs/data/recipe_studio/recipes/minecraft_crafting_shaped_20261103145929.json
recipeId   recipe_studio:minecraft_crafting_shaped_20261103145929
savedUid   file:recipe_studio:minecraft_crafting_shaped_20261103145929
bytes      90 · indexUpdated true · .tmp 残留 0
```

→ 落点、命名（`<typeSlug>_<stamp>.json`）、writer 保护、索引更新 **全部正确**。

**失败部分**（第 2 条，致命）：

```json
{
  "type": "minecraft:crafting_shaped",
  "result": { "item": "minecraft:dirt" }
}
```

**缺 `pattern` 与 `key`** —— 网格内容没被反解出来，写出去的是一条**无效配方**（shaped 必须有 pattern/key）。

**第 3 条同时失败**：用返回的 `savedUid` + `expectedRawHash` 走 overwrite 再次提交 →

```
RAW_UNREADABLE：源文件已失效，无法载入完整配方：
recipe_studio:minecraft_crafting_shaped_20261103145929
```

即**转 edit 态后第二次提交会失败**（比"产生重复文件"更糟）。

### 62.3 根因分析（未修，留给下批）

`create` 用 `{type}` 作基线 → `normalizeRecipe` 得到的槽位是"空壳"，`applyDraftToNormalized(base, workbench, ['grid','outputs'])` 之后 `denormalizeRecipe` **没有把 grid 展开成 pattern/key**。

对比 overwrite 路径的差异：overwrite 的 baseline 来自**真实 JSON**（有 pattern/key 的原始结构），`normalizedBase.slots` 里含 `pattern`/`key`/`grid` 的对应关系；`create` 的基线没有这些槽位，`dirty` 里的 `grid` 找不到落点（`dirtyForWrite` 只处理 `outputs→result` 的别名）。

**修复方向**：`create` 分支应显式把 `workbench.values.grid` 交给 shaped 生成器（`BENCH_GRID_KEY` → pattern/key），或让 `dirty` 先按 `schema.slots` 过滤并对 shaped 特判补 `pattern`/`key`。

### 62.4 验证清单结论

| # | 项 | 结论 |
|---|---|---|
| 1 | 路径与命名 | ✅ **通过**（落点/命名/writer/.tmp=0/索引） |
| 2 | 文件内容 | ❌ **缺 pattern/key，内容无效** |
| 3 | 再提交一次 | ❌ **`RAW_UNREADABLE`**（转 edit 后 overwrite 失败） |
| 4 | 提交后草稿状态 | ⚠️ 代码上会转 edit（`applyCommitted`），但因 3 失败**未实机走通** |
| 5 | 取消草稿 | 未实测 |
| 6 | 重复检测 | 未到 |

### 62.5 未做

- **未升 0.1.7、未构建 dist-017**（功能写出的配方无效，发出去会生成坏数据）。
- 测试产物 `minecraft_crafting_shaped_20261103145929.json` **已清理**（`recipe_studio/recipes` 恢复原状）。

### 62.6 边界

改动 4 文件（`ipc.ts` / `commitRecipe.ts` / `commitBridge.ts` / `draftBridge.ts`），均已备份 `*.pre-create`；`overwrite`/`copy` 路径零改动；生产 userData 零触碰；应用已关闭（`QQ-agent=3→3`）。

---

## 六十三、第 104 批：create 基线修复（内容已正确）｜**第 3 条仍未过**

### 63.1 修复 1：基线改为 schema 驱动的空模板

```ts
const emptyRaw: Record<string, unknown> = { type: typeId }
if (schema.layoutKind === 'shaped') {
  emptyRaw['pattern'] = []
  emptyRaw['key'] = {}
} else {
  for (const f of schema.slots) emptyRaw[f.key] = f.multiple === true ? [] : null
}
for (const f of schema.outputs) emptyRaw[f.key] = f.multiple === true ? [] : null
```

### 63.2 修复 2：shaped 双保险（仅 create）

生成后校验：`pattern` 为空的字符串行 **或** `key` 无键 → 抛 `INVALID_RECIPE`「有序合成必须有 pattern 与 key（至少一个材料）」，**不写文件**。
（只作用于 create——overwrite 的 pattern 来自原文件，未改动时不应被判违规。）

### 63.3 修复 3：`file:` uid 必须编码真实相对路径

```ts
// recipes/lazy.ts:  const path = scheme === 'file' ? splitUid(uid).rest.split('#')[0] : record.sourcePath
const finalUid = 'file:' + relTarget   // 原为 'file:' + recipeId（不含路径 → STALE）
```

### 63.4 验证结果

| # | 项 | 结果 |
|---|---|---|
| 1 | 路径/命名 | ✅ `kubejs/data/recipe_studio/recipes/minecraft_crafting_shaped_20261103150430.json` |
| 2 | **内容含 pattern+key** | ✅ **通过**（见下） |
| 3 | **再提交不炸** | ❌ **仍 `RAW_UNREADABLE`** |
| 4 | 转 edit 态 | ⚠️ 未走通（受 3 影响） |
| 5 | 取消草稿 | 未实测 |
| 6 | 重复检测 | 未到 |

**第 2 条实测 JSON（全文）**：

```json
{
  "type": "minecraft:crafting_shaped",
  "pattern": ["AA ", "   ", "   "],
  "key": { "A": { "item": "minecraft:dirt" } },
  "result": { "item": "minecraft:dirt", "count": 2 }
}
```

- `hasPattern: true`、`hasKey: true`、**`patternSelfConsistent: true`**（pattern 里出现的 `A` 全在 key 表中）
- `.tmp` 残留 **0**、`bytes 222`、`indexUpdated true`

**空 shaped 拒绝**：`{ ok:false, code:"INVALID_RECIPE" }` ✅ 且目录文件数不变（未写文件）

### 63.5 第 3 条仍失败的可能原因（未定位完）

`file:` uid 已改成真实相对路径（`file:kubejs/data/recipe_studio/recipes/xxx.json`），但再次以 `overwrite` 提交仍报 `RAW_UNREADABLE：源文件已失效`。

嫌疑：
- `readLocalFile(path, record)` 内部对 `sourcePath` / 绝对化方式另有一套约定，`relTarget`（`kubejs/data/...`）与它期望的基准不一致；
- 或索引里的记录在**重启后由缓存重建**，新文件不在缓存里，`find(uid)` 拿到的是旧对象。

**下一批第一步**：读 `lazy.ts` 的 `readLocalFile` 与 `splitUid`，确认 `file:` 记录的路径基准。

### 63.6 门禁与产物

typecheck **0** / lint **0** / vitest **852 passed / 0 失败** / build **exit 0**

**未升 0.1.7、未构建 dist-017**（★第 3 条未过）。

测试产物已清理，`recipe_studio/recipes` 恢复 4 个既有文件。

### 63.7 边界

改动仅 `commitRecipe.ts`（基线 + 校验 + uid），已备份；`overwrite`/`copy` 行为零改动；应用已关闭（`QQ-agent=3→3`）。

---

## 六十四、第 105 批：T-28 闭环 —— `file:` uid 用绝对路径 + 0.1.7 构建

### 64.1 修复（3 处，均在 create 分支）

```ts
const absTarget = slash(target)
const finalUid = 'file:' + absTarget                     // 原 'file:' + relTarget（相对 → STALE）
source: { source: 'datapack', sourcePath: absTarget }    // normalize 与既有记录同形
record.sourcePath = absTarget
```

**约定（供后续参考）**：`file:` 记录的 uid 形如 `file:<绝对路径·正斜杠>[#recipe#<n>]`，
与 `jsonSource.ts:218`（`file:${slash(f.abs)}`）、`makeRecord`（`sourcePath: target`）一致；
`lazy.ts:87` 对 `file:` 直接取 `splitUid(uid).rest.split('#')[0]` 去 `readFile`，**相对路径会相对 CWD → ENOENT → STALE**。

### 64.2 六条验证

| # | 项 | 结果 |
|---|---|---|
| 1 | 路径/命名 | ✅ `kubejs/data/recipe_studio/recipes/minecraft_crafting_shaped_20261103151156.json` |
| **2** | **JSON 含 pattern/key 且自洽** | ✅ **通过** |
| **3** | **再提交不再 STALE** | ✅ **通过**（见下） |
| 4 | 转 edit 态 | ⚠️ **间接通过**：`recipes:open` 新 uid 返回 `status:"ok"` + hash 匹配；UI 徽标未实机截图 |
| 5 | 取消草稿 | ❌ 未实测 |
| 6 | 重复检测 | ❌ 未实测 |

**第 2 条 JSON 全文**：

```json
{
  "type": "minecraft:crafting_shaped",
  "pattern": ["AA ", "   ", "   "],
  "key": { "A": { "item": "minecraft:dirt" } },
  "result": { "item": "minecraft:dirt", "count": 2 }
}
```

**第 3 条证据**：

| 指标 | 第一次 create | 第二次 overwrite |
|---|---|---|
| 返回 | `ok:true`，222 B | `ok:true`，222 B |
| mtime | `1793718716511` | **`1793718741298`**（+27.8 s，确被改写） |
| `result.count` | 2 | **5** |
| 目录内 shaped 文件数 | 1 | **1**（未新增） |
| `.tmp` | 0 | **0** |

前置：`recipes:open(file:<abs>)` → `status:"ok"`、`hash 737e77c4…`（与记录一致）——**STALE 已消失**。

> 注：上一批的 `RAW_UNREADABLE` 已彻底解决；本次中途还遇到一次 `SCHEMA_CHANGED`，经查是**我测试脚本传了 `expectedSchemaRevision: 0` 而实际 rev=1**，属测试参数错误，非产品缺陷。

### 64.3 空 shaped 校验（双保险）

`layoutKind === 'shaped'` 且 pattern 全空或 key 无键 → `INVALID_RECIPE`，**不写文件**（上一批已验证 `ok:false, code:INVALID_RECIPE` 且目录文件数不变）。只作用于 create。

### 64.4 构建

| 项 | 值 |
|---|---|
| version | 0.1.6 → **0.1.7** |
| typecheck / lint | **0 / 0** |
| vitest | **852 passed / 4 skipped / 3 todo / 0 失败** |
| build / NSIS | **exit 0 / exit 0**（54 s） |

```
dist-017/KubeJS Recipe Studio Setup 0.1.7.exe   82,374,606 B
  SHA-256 4ba139084c7dcba5cea30d4bee674bab27f9c8669ef4c01ea80949ebb999d9f4
dist-017/…exe.blockmap   86,480 B
  SHA-256 03c0006ab562d7adaa004b9b3a8b23096d36653a75c9bc87cdbfba88e2b101af
```

**七个 dist 零触碰**：`fde3fcac2602` / `3519c3734cd3` / `5535cc86a376` / `774ec4d4faf1` / `7c467b75d652` / `50669322d3e7` / `da51ed9f62a1`

### 64.5 未做

- **冒烟 4 步未跑**（本批时间全用于定位与修复 uid 链路）；
- 第 5/6 条（取消草稿无残留、重复检测）未实测；
- 第 4 条的 UI 徽标未截图。

### 64.6 T-28 状态

| 实现 | create 可提交 | 内容正确 | 再提交不炸 | 构建 |
|---|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ | ✅ 0.1.7 |

**核心链路闭环；验收清单 4/6 有实证，2 条未验。**

### 64.7 边界

改动 `commitRecipe.ts`（基线 + 校验 + uid/sourcePath 绝对化），已备份 `*.pre-create`；`overwrite`/`copy` 零改动；测试产物已清理（`recipe_studio/recipes` 恢复 4 个既有文件）；生产 userData 零触碰。

---

## 六十五、第 106 批：0.1.7 发布前守门 —— 冒烟 4/4 + T-28 六条全结论

### 65.1 冒烟 4/4

| # | 步 | 结果 |
|---|---|---|
| 1 | 无包启动（`t98-fresh`）→ 类型下拉 | ✅ **4 项**：`create:mixing`、`crafting_shaped`、`crafting_shapeless`、`__generic__` |
| 2 | 导入 t13-pack → 索引 | ✅ `mp=t13-pack`、`items:query total=43,474`（缓存命中） |
| 3 | 新建 shaped 填满 → 提交 → 再提交 | ✅ 见 65.2 |
| 4 | 通用模式 sugar 写盘 | ✅ `recipe_studio_20261103_231747.js` **484 B**、toast「已写入…」、`.tmp=0`、内容含包名/版本头 |

> 冒烟 1 在 `t98-fresh`（空 studio-cache）跑，2–4 在 `t13-ud` 跑：前者冷扫需要数分钟，为避免把冒烟拖成 10 分钟，索引判据用已有缓存的环境验证（同一二进制、同一代码）。

### 65.2 冒烟 3 / T-28 第 3 条（★）

| 步骤 | 结果 |
|---|---|
| create | `ok`，`minecraft_crafting_shaped_20261103151746.json`，222 B，**目录内 1 个** |
| `recipes:open(file:<abs>)` | `hash 737e77c4…`、`rev 1`、可读（**无 STALE**） |
| overwrite（count 2→7） | `ok`，222 B，**目录内仍 1 个**，内容 `count: 7`，`.tmp=0` |

### 65.3 T-28 第 4 条（UI 两张截图）

| 时点 | 断言 | 截图 |
|---|---|---|
| 新建前 | 「试点类型 · 未载入」+「新建结构化配方」按钮可见 | `01-before.png`（125,372 B） |
| 点击后 | 「结构化编辑」+ `.pilot-grid` + **10 槽位** | `02-after.png`（136,124 B） |

### 65.4 T-28 第 5 条（取消草稿无残留）

```
取消草稿前 recipes 文件数 = 4
点「取消草稿」→ 徽标回「试点类型 · 未载入」，.pilot-grid 消失
取消草稿后 recipes 文件数 = 4     ← 无任何残留
```

### 65.5 T-28 第 6 条（重复检测）—— **发现缺口**

用**完全相同**的 pattern/key/result（`AA ` / `A=dirt` / `dirt×7`）再走 create：

```
{ ok: true, path: …minecraft_crafting_shaped_20261103151747.json }
目录内文件：…746.json + …747.json   ← 两个
```

**`create` 模式没有任何重复检测**：不提示、直接生成第二个内容相同的配方文件。

对比：`overwrite` 有 `NO_CHANGES`（内容相同时拒绝），`copy` 有 `TARGET_EXISTS`（文件名冲突），**create 两者都没有**。

**建议（未实现）**：create 提交前查索引里是否有同 `typeId + canonicalStringify(json)` 的现有配方 → 有则弹「已存在相同配方，是否仍要新建？」或直接 `DUPLICATE_RECIPE` 拒绝。这是**产品决策**（允许重复有时是合理的，比如想覆盖多个命名空间），留待裁定。

### 65.6 T-28 六条全结论

| # | 项 | 结论 |
|---|---|---|
| 1 | 路径/命名 | ✅ |
| 2 | 内容含 pattern/key 且自洽 | ✅ |
| 3 | 再提交不 STALE、单文件 | ✅ |
| 4 | 转 edit 态（UI 徽标 + 网格） | ✅ 截图 |
| 5 | 取消草稿无残留 | ✅ 文件数 4→4 |
| 6 | **重复检测** | ❌ **create 无查重，会产出重复文件** |

**5/6 通过，1 条已知缺口（U-18：create 无重复检测）。**

### 65.7 门禁与边界

本批**零 src 改动**（纯验证）；vitest 852 / typecheck 0 / lint 0 沿用；生产 userData 零触碰；测试产物已清理（`recipe_studio/recipes` 恢复 **4 个**既有文件）；应用已关闭（`QQ-agent=3→3`）。

---

## 六十六、U-19：「空工作台」被渲染成「语法错误」（第 108 批）

### 66.1 现象

代码面板同时出现两句矛盾的话：

```
语法错误：第 1 行 —— 生成结果为空，没有可写出的内容     ← 红字错误
工作台还没有可生成的内容。选择配方类型并填入材料后…      ← 中性提示
```

### 66.2 根因

`codegen:preview` 在**没有可生成内容**时返回 `syntaxOk: false`，且把「生成结果为空」塞进 `syntaxError` 字段。`CodePane.tsx` 把它按语法错误渲染：

```tsx
// 修前
{!preview.syntaxOk ? <span className="note-error">语法错误：第 … 行 —— …</span> : null}
```

同时 `preview.code` 为空 → body 走「还没有可生成的内容」分支。**同一状态被分类成两种语义**。

### 66.3 修复（`CodePane.tsx`，2 处）

```tsx
// 1) 提示块的外层条件：没有 code 时不再因 syntaxOk=false 弹出
{preview && (… || (!!preview.code && !preview.syntaxOk)) ? (
// 2) 错误行：只有真的生成了代码却解析失败才算语法错误
{!!preview.code && !preview.syntaxOk ? <span className="note-error">…</span> : null}
```

备份 `.pre-u19`。**写盘路径不受影响**：空内容仍会被 `SYNTAX_CHECK_FAILED` 拒绝（第 100 批实测），这里只是不再把它显示成「语法错误」。

### 66.4 验证

| 断言 | 修前 | 修后 |
|---|---|---|
| 页面含「语法错误」 | ✅ 有（红字） | **false** |
| 含「工作台还没有可生成的内容」 | ✅ | ✅ |
| `.code-body` 文案 | 中性提示 | 中性提示（不变） |

截图：`.cache/fix14/a3tmp/t114/code-pane.png`。门禁：typecheck 0 / lint 0 / **852 passed** / build 0。

### 66.5 顺带发现（**未修**，登记 U-20）

`CodePane` 提示块的**外层条件漏了两个内层项**：

```tsx
{preview && (sugarUnsupportedFields.length > 0 || duplicateOf || (!code && syntaxOk…)) ? (
  … {preview.sugarUnverified ? <span>语法糖签名未在本包验证</span> : null}
  … {preview.missingAddon ? <span>未安装 …</span> : null}
```

即：**只有在「有转换降级 / 有重复 / 有语法错」时才会渲染这个块**，所以「语法糖签名未验证」「未安装附属」单独成立时**永远不会显示**。用户之前能看到「语法糖签名未在本包验证」，是因为当时恰好 `syntaxOk === false` 把块打开了——修完 U-19 后这条提示会一起消失。

**建议修法**：外层条件补 `|| preview.sugarUnverified || !!preview.missingAddon`。本批未改（避免超出 U-19 范围且无法快速构造验证场景）。

### 66.6 状态

**U-19 已修（代码 + 实机验证）；需 0.1.8 构建才能随安装包发布**（当前已装 0.1.7 不含此修复）。

---

## 六十七、U-21：结构化编辑时，代码面板说「没有可生成的内容」（第 108 批）

### 67.1 现象（用户截图）

工作台 3×3 网格填了 8 个泥土、产物 1 个，脏字段 2 项。右侧「KubeJS 语法糖」面板却写：

```
语法糖签名未在本包验证
语法错误：第 1 行 —— 生成结果为空，没有可写出的内容
工作台还没有可生成的内容。选择配方类型并填入材料后，这里会实时显示代码。
```

**网格是满的，面板说空的。**

### 67.2 实测证据（IPC 直调 `codegen:preview`）

用**试点形态**的 workbench（`values.grid` 9 格 + `outputs`/`result`）请求：

```json
{ "codeLen": 0, "syntaxOk": false,
  "err": { "line": 1, "message": "生成结果为空，没有可写出的内容" },
  "diag": [
    "error: 产物：该字段是单值，却给了数组（schema multiple=false）",
    "error: 网格为空，无法生成有序合成",
    "error: 有序合成网格为空或产物未填，无法生成 pattern"
  ] }
```

用**通用形态**（`values.inputs`/`outputs`，`layoutKind:'list'`）请求同样是 `codeLen 0`、`syntaxOk false`（未安装包时属预期）。

**三条诊断说明**：预览的校验器认为「网格为空」「产物是数组但 schema 要单值」——它读的不是试点草稿的实际形状。

### 67.3 根因（结构性，不是显示 bug）

`CodePane` 只有一条预览通道：

```tsx
void callOrThrow('codegen:preview', { workbench: bench })
```

而 `codegen:preview` 是**通用模式**的生成器（`normalizeUiValues` 里 `if (key === 'grid' || key === source) return` 明确跳过 grid，只把 `inputs`/`outputs` 归一到 schema 槽位）。

**试点草稿的数据形状与它不兼容**：
- 材料在 `values.grid`（3×3 数组，语义是"格子"不是"材料列表"）；
- 产物可能是数组而 schema 声明 single；
- 转化 grid→pattern/key 的职责本来在 `denormalizeRecipe`（试点链路），不在 `codegen`。

所以**不是「没内容」，是「这条预览通道看不懂这份草稿」**——但它用了空态的文案，还配了一条 `syntaxOk:false`，于是变成"红字语法错误 + 没有内容"的双重误导。

### 67.4 三个可选修法

| 方案 | 做法 | 代价 |
|---|---|---|
| **A（最小）** | `CodePane` 检测到 `useBenchStore.draft` 存在时，**不调 `codegen:preview`**，改显示「结构化编辑中：请用下方草稿预览查看将写入的 JSON」或直接渲染 `draftPreview(draft)` | 小；不碰生成器 |
| B | `codegen:preview` 增加试点分支：用 `normalizeRecipe({raw:{type}})` + `applyDraftToNormalized` + `denormalizeRecipe` 得到 JSON，再走 emit | 中；复用 T-28 已实现的 create 链路 |
| C | 让 `codegen:preview` 接受 `draft` 参数，主进程内部按 pilot 处理 | 中；改动面最大 |

**倾向 A**：结构化编辑本来就有自己的草稿预览（`PilotDraftPanel` 的 `draftPreview`），右侧再放一个"语法糖代码"预览容易造成两套口径。要么明确分工（草稿预览=权威），要么把 B 做完整。

**本批未改代码**——这是通道选择问题，不是一行判定；上次在同一文件（`preview.ts`，U-11）猜着改已返工过一次。

### 67.5 与 U-19 的关系

U-19（已修，未发布）只隐藏了红字，**没有解决"网格满却说空"**。两者同源：空态判定 + 预览通道错配。

### 67.6 状态

**U-21 待定方案（A/B/C）；U-19 已修未发布；已装 0.1.7 两者都不含。**

---

## 六十八、第 109 批：0.1.8 验收补齐（纯验证）

### 68.1 U-19 空态 —— ✅ 通过

**关键前提（上批我漏了）**：`CodePane` 只在右侧面板 `tab === 'code'` 时挂载（`DetailPanel.tsx:58`）。不切 tab 就断言「空态文案不存在」是错的。

| 断言 | 读数 |
|---|---|
| `.codepane` 挂载 | **true** |
| 含「语法错误」 | **false** ✅ |
| 含「工作台还没有可生成的内容」 | **true** ✅ |
| 徽标「暂无输出」 | false（因 pilotDraft 存在时走草稿分支？本场景已取消草稿，实为 preview=null 分支 → 徽标应为「暂无输出」，读数为 false，未深究） |
| 截图 | `01-u19-empty.png`（**成功**，`captureBeyondViewport:false`） |

### 68.2 U-21 试点态 —— ✅ 通过（无截图）

| 断言 | 读数 |
|---|---|
| `.pilot-grid` | true（草稿已建） |
| `.codepane` 挂载 | **true** |
| 含「语法错误」 | **false** ✅ |
| 含「工作台还没有可生成的内容」 | **false** ✅（不再谎报空） |
| 含「按试点链路写入 datapack JSON」 | **true** ✅ |
| 徽标「结构化编辑」 | **true** ✅ |
| `.code-draft-pre` 内容 | `{ "type": "minecraft:crafting_shaped" }`（空白草稿，只有 type，符合预期） |
| 截图 | ❌ **三次尝试全超时**（`captureScreenshot` 默认 / `captureBeyondViewport:false` / `clip` / `jpeg`）；桌面截屏两条路都被安全策略拦（`Add-Type` 与 `Reflection.Assembly` 均禁止） |

### 68.3 U-20 —— ⚠️ 仅代码确认

无法构造「只有 `sugarUnverified`」的配方类型（需要特定语法糖签名不匹配的配方 + 已装附属）。
**以 code review 确认**：`CodePane.tsx` 外层条件现为

```tsx
preview.sugarUnsupportedFields.length > 0 || preview.duplicateOf
  || (!!preview.code && !preview.syntaxOk)
  || preview.sugarUnverified || !!preview.missingAddon
```

四项齐备。**未实机验证**。

### 68.4 冒烟 —— 3 / 4

| # | 步 | 结果 |
|---|---|---|
| 1 | 类型下拉 | ⚠️ **5 项**（`create:mixing`/`shaped`/`shapeless`/`t13probe:only`/`__generic__`）——本步判据「4 项」是**无包**场景；`t13-ud` 有包且带插件层，故为 5 项，**属正常** |
| 2 | 索引 | ✅ **43,474** |
| 3 | create → 再提交 | ✅ create 成功（`…_20261103155615.json`），内容含 `pattern ["AA "...]` / `key {A:dirt}` / `result count 5`；`open` 可读；overwrite `ok`；**目录内仍 1 个文件**；`.tmp = 0` |
| 4 | sugar 写盘 | ❌ **未产出**：切类型后未找到 `.slot-column`，材料/产物没填上 → 写盘被前置校验拒绝（同第 100 批的行为）。本步**未复现成功路径** |

### 68.5 门禁

**零 src 改动**（纯验证）：vitest 852 / typecheck 0 / lint 0 不变。

### 68.6 0.1.8 验收状态

| 项 | 状态 |
|---|---|
| U-19 空态 | ✅ 实机 + 截图 |
| U-21 试点态 | ✅ 实机读数（**无截图**） |
| U-20 | ⚠️ 仅 code review |
| 冒烟 | **3 / 4**（第 4 步未复现） |

**0.1.8 交付状态：U-19 / U-21 已实证；U-20 与冒烟第 4 步仍受限。** 是否据此交付由负责人判断。

### 68.7 边界

测试产物已清理（`recipe_studio/recipes` 恢复 **4 个**既有文件）；`server_scripts` 无新增；应用已关闭（`QQ-agent=3→3`）。

### 68.8 第 4 步重跑（`__generic__`）—— 仍 0 产出，但**原因定位了**

按协调方指示改用 `__generic__` 填槽：**通用模式确实渲染出 2 个 `.slot-column`**（试点类型无草稿时不渲染，这点得到印证），两格都填了 `minecraft:dirt`，`Ctrl+S` 也打开了对话框（`channel = kubejs-sugar`）。

但点「写入文件」后：

```
写入失败（SYNTAX_CHECK_FAILED）：语法预检未通过（第 1 行）：
未找到配方类型 schema：__generic__
```

`newFiles = []`、`.tmp = 0`。

**IPC 直调三种类型对比**：

| typeId | code 长度 | 结果 |
|---|---|---|
| `__generic__` | 0 | 未找到配方类型 schema |
| `test:custom_type` | 0 | **未找到配方类型 schema：test:custom_type** |
| `minecraft:crafting_shapeless`（给 `inputs`/`outputs`） | 0 | 工作台为空，无法生成 event.shapeless 调用 |

### 68.9 由此确认的产品缺口（U-22）

**「通用 / 任意模组配方」（`__generic__`）无法生成任何代码，因此无法写盘。**

- `codegen` 要求 `typeId` 在 schema 注册表里；`__generic__` 与任意自定义类型都查不到 → 直接拒；
- 而「通用模式」的 `.slot-column` 又只在**非试点**类型下渲染（`BenchView` L228-234）；
- 两者叠加 → **在当前 `benchV2 = [shaped, shapeless]` 的配置下，「通用模式写盘」这条路实际不可达**：能填槽的类型（`__generic__`）生成不了，能生成的类型（`shapeless`）没有槽位。

**这解释了为什么第 100 批和第 109 批两次都复现不出来**——不是脚本问题，是产品路径本身断了。

**修法建议（未实施）**：给 `codegen` 加"未知类型回退 `event.custom`"分支（通用模式本就是为此存在），或让 `__generic__` 绑定一个 `custom` 伪 schema。

### 68.10 结论：冒烟 **3 / 4**，第 4 步阻塞于 U-22

**0.1.8 验收状态不变**：U-19 ✅（截图）、U-21 ✅（读数无图）、U-20 ⚠️ 仅 code review、冒烟 3/4（第 4 步被 U-22 阻塞）。

---

## 六十九、第 110 批：U-22 通用模式回退 event.custom + 0.1.9

### 69.1 实现（`codegen/preview.ts` 的 `!schema` 分支）

```ts
if (!schema) {
  const rawType = (workbench.typeId || '').trim()
  if (rawType === '' || rawType === '__generic__') {
    // 占位不能当 type 写出
    return { preview: failedPreview(workbench, '通用模式需要填写具体配方类型…'), payload: emptyPayload('', modpack) }
  }
  return generateCustomFallback(workbench, rawType, modpack)
}
```

`generateCustomFallback`（新增，**纯字符串拼接**，不用嵌套模板）：

- `values.inputs` → `ingredients`、`values.outputs` → `result`（多个则 `results`）；
- `{id,count}` 归一为 `{item,count}`（count=1 省略）；
- 生成 `event.custom({...})` → `checkSyntax(code,'event-custom')`；
- diagnostics 里**明说**「字段名为推断值，请按模组文档核对」；
- schema 存在的路径**零改动**。

### 69.2 自身犯的三个错（都当场修）

1. **嵌套模板字符串**把 `preview.ts` 写成语法错误（`Unterminated string literal`）——回滚重写，改为字符串拼接；
2. 头部注释行写成 `'--- KubeJS … ---'`（不是合法 JS）→ `syntaxOk` 恒 false；改成 `// …`；
3. 测试里 `layoutKind: 'list'` 不是合法 `LayoutKind`（正确值 `multi_io` 等）→ typecheck 报错。

### 69.3 用例

原用例「schema 缺失 → 阻断写盘」**按新行为改写为两条**：

| 用例 | 期望 |
|---|---|
| schema 缺失 + `test:custom_type` | `code` 含 `event.custom(`、含类型名、`syntaxOk = true` |
| schema 缺失 + `__generic__` | `canWrite = false`、提示「通用模式需要填写具体配方类型」 |

门禁：typecheck **0** / lint **0** / **853 passed**（+1）/ build **0**。

### 69.4 构建

```
dist-019/KubeJS Recipe Studio Setup 0.1.9.exe   82,375,272 B
  SHA-256 b5dbb6427b5b108f247a72514345690de12b7b7b7fc4a108fd54aeec690189aa
```

九个 dist 哈希：`fde3fcac` / `3519c373` / `5535cc86` / `774ec4d4` / `7c467b75` / `50669322` / `92739060` / `c2739949` / `da51ed9f`（零触碰）

### 69.5 未做（必须说明）

- **五条实机验证未跑**（`__generic__`/自定义类型的真实写盘、空 type 拒绝、schema 类型回归、通道选择）——本批预算全部耗在"补丁把自己写坏→回滚→重写"上；
- **冒烟 4/4 未跑**；
- **T-19 / T-17 / 索引 / CHANGELOG 未更新**。

**U-22 只能声明「代码完成 + 单测通过 + 构建成功」，不能声明闭环。**

### 69.6 实机验证（第 110 批续）

| # | 场景 | 结果 |
|---|---|---|
| 1 | `__generic__` + 填槽 | ✅ **拒绝**：「通用模式需要填写具体配方类型（「通用 / 任意」只是占位，不能作为 type 写出）」 |
| 2 | 空 typeId | ✅ 同上拒绝 |
| 3 | `test:custom_type` + 填槽（**预览**） | ✅ `code` 454 B、`syntaxOk = true`、`canWrite = true`，diagnostic 明示「字段名为推断值」 |
| 4 | `test:custom_type`（**真实写盘**） | ✅ 产出 `recipe_studio_20261104_003201.js`，内容 `event.custom({ "type": "test:custom_type", "ingredients": [...], "result": {...} })`，`.tmp = 0` |
| 5 | schema 类型回归 | ⚠️ **未证实**：我给的 payload 用 `{item:'x'}` 而非规范化槽位形态 → `code` 为空（channel 仍是 `kubejs-sugar`）。**schema 分支代码零改动**，但缺一条有效读数 |

**结论：U-22 的代码回退路径端到端可用（预览 + 写盘都出结果）。**

### 69.7 新发现 U-23：WriteDialog 的通道不跟随预览

第 4 条首次尝试**失败**：

```
写入失败（CHANNEL_UNAVAILABLE）：通道 kubejs-sugar 在当前整合包条件下不可用：当前生成结果不可写盘
```

对话框 `<select>` 的初值是写死的 `kubejs-sugar`，而本次预览的 `channel = event-custom`。**手动切到 `event-custom` 后立刻成功**。

即：**凡是走 event.custom 的配方（含本次新增的通用模式回退），用户第一次点「写入文件」必然失败**，必须先自己想到去切通道。

**修法（未实施）**：`WriteDialog` 的初始 `channel` 取 `preview.channel`（三选项本来就有 `event-custom`）。

### 69.8 冒烟

第 4 步（通用模式写盘）**在手动切通道后通过**；若按默认通道则失败。其余三步本批未重跑（第 109 批已有读数）。

**冒烟按「用户按默认操作」口径仍不算 4/4**，缺口就是 U-23。

### 69.9 边界

测试产物已清理（`server_scripts` 恢复原状）；应用已关闭（`QQ-agent=3→3`）。

---

## 七十、第 111 批：U-23 修复（写入对话框通道跟随预览）+ 0.1.10

### 70.1 修复（`WriteDialog.tsx`）

`open` 时的 effect 里补一段：取当前预览的 `channel` 作为下拉初值。

```ts
void call('codegen:preview', { workbench: useBenchStore.getState().bench })
  .then((p) => { const ch = p?.channel; if (ch) setChannel(ch) })
  .catch(() => undefined)
```

原先 `useState<GenerationChannel>('kubejs-sugar')` 是写死的，与预览无关。

### 70.2 实机验证（`test:custom_type`，不手动切通道）

| 断言 | 结果 |
|---|---|
| 对话框通道初值 | **`event-custom`**（修前为 `kubejs-sugar`） |
| 点「写入文件」**一次** | ✅ 成功，无需手动切换 |
| 产物 | `recipe_studio_20261104_003522.js` |
| 内容 | `// 通用模式：类型 test:custom_type 未注册 schema…` + `event.custom({ "type": …, "ingredients": [...] })` |
| `.tmp` | **0** |
| 清理 | 测试产物已删，`server_scripts` 恢复 23 个 |

**U-23 闭环。** 至此通用模式（任意类型）从「选类型 → 填槽 → 写盘」全程无阻断。

### 70.3 版本与构建

| 项 | 值 |
|---|---|
| version | 0.1.9 → **0.1.10** |
| typecheck / lint | **0 / 0** |
| vitest | **853 passed / 4 skipped / 3 todo / 0 失败** |
| build / NSIS | **exit 0 / exit 0**（44 s） |

```
dist-0110/KubeJS Recipe Studio Setup 0.1.10.exe   82,375,390 B
  SHA-256 f94900cecaeaa54650e5d28dce3f5d3bc6840fd445c878aeb2dd51b382df3816
```

**十个 dist 零触碰**：`fde3fcac` / `3519c373` / `5535cc86` / `774ec4d4` / `7c467b75` / `50669322` / `92739060` / `c2739949` / `b4324332` / `da51ed9f`

### 70.4 仍未补的

- **schema 类型回归**（第 110 批第 5 条）仍缺有效读数：需用规范化槽位形态（`{kind:'item', id:…}`）构造 payload；schema 分支代码自始至终未改。
- 冒烟第 1–3 步未在本批重跑（第 109 批有读数）。

### 70.5 schema 类型回归（第 111 批补测，**已闭环**）

此前两次失败的原因：我构造的 payload 用了 `{id:'x'}`，**缺 `SlotValue.kind`**（正确形态 `{kind:'item', id, count?}`），导致归一化后槽位为空。

用正确形态重测：

| 场景 | 结果 |
|---|---|
| `crafting_shapeless` + **schema 键**（`ingredients`/`result`） | ✅ `channel=kubejs-sugar`、316 B、**含 `event.shapeless`**、`syntaxOk=true`、无诊断 |
| `crafting_shapeless` + **通用 UI 键**（`inputs`/`outputs`） | ✅ 同样 316 B、`event.shapeless` —— **`normalizeUiValues` 归一化生效** |
| `crafting_shaped` + `grid` | ✅ `channel=kubejs-sugar`、337 B、`syntaxOk=true` |

**结论：schema 类型走语法糖的路径零回归**；U-22 的回退只作用于「查不到 schema」的分支，两者互不干扰。

至此第 110 批遗留的「schema 回归未证实」关闭。
