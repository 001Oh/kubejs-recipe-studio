# UI-REDESIGN-1 验收报告

日期：2026-10-31
范围：桌面端 UI/UX 整体重设计（布局、视觉令牌、多主题、核心工作流交互、日志控制台）。
约束遵守：未改动扫描 / ZIP 读取 / 图标写入 / 并发调度 / 配方提交 / 备份 / 冲突处理 / 回滚等已封板逻辑；未修改任何既有测试断言。

---

## 0. 结论速览

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 功能完整性（验收 A 十三项） | ✅ 全部保持 | §6 A 表；P-C7 八场景 |
| 视觉与交互（验收 B 十项） | ✅ 全部达成 | §5 截图清单与控制台实测数据 |
| Node / Web TypeScript | ✅ 0 错误 | §7 G1/G2 |
| ESLint（`--max-warnings=0`） | ✅ 0 问题 | §7 G3 |
| Electron 构建 | ✅ 成功 | §7 G4 |
| 全量 Vitest | ✅ 53 文件 / 560 通过 / 4 跳过（0 失败） | §7 G5 |
| P-C5/C6 定向 | ✅ 4 文件 / 40 通过 | §7 G6 |
| P-C7 八场景 | ✅ 8/8 通过，`uiErrors=[]` | §8 |
| Electron 实跑（截图 + 计算样式） | ✅ 23 张截图、0 失败步骤、0 运行时异常 | §6/§9 |
| 多主题（四套，实时切换 + 落盘 + 迁移） | ✅ 4/4 主题验证通过 | §4.4 |

建议：**通过验收**（有条件，条件见 §10）。

---

## 1. R1 现状审查：重设计前的主要问题

以下每一条都以本轮开工时的实际代码为准（不是照抄旧报告）。

| # | 问题 | 具体表现（代码/截图证据） |
| --- | --- | --- |
| R1-01 | **没有全局导航结构** | 品牌、整合包、导航、物品查找全部塞在同一个 320px 侧栏里；`配方浏览 / 工作台 / 设置与诊断` 三个视图入口是中央区顶部的一条 `.view-tabs`，既不像导航也不像工具栏；`App.tsx` 里设置页还会把这条 Tab 一起替换掉，退出设置只能按 Esc。 |
| R1-02 | **中央区缺少上下文头** | `BrowseView` 的标题只在卡片列表顶部出现一次，滚动后看不出"当前在编辑哪个物品"；顶栏只显示整合包元数据与全库统计，与当前任务无关。 |
| R1-03 | **右侧栏没有承担"详情"职责** | 右侧 360px 只放代码预览，工作台无内容时是一整屏"工作台还没有可生成的内容"；而配方的类型、输入输出、脏字段、冲突全部挤在中央顶部一条横幅里。信息重心与三栏职责（左找/中改/右看）错位。 |
| R1-04 | **物品选择器浮层完全没有样式** | `.bench-panel`、`.panel-search`、`.panel-list`、`.panel-row`、`.panel-foot`、`.quick-row`、`.btn.tiny`、`.btn.micro` 在全部 CSS 中**不存在**（`ItemPicker.tsx` / `CountEditor.tsx` / `RegistryPicker.tsx` / `TypeSelect.tsx` 都在用）。双击槽位弹出的选择器是无背景、无边框、无内边距的裸列表——这条是编辑主路径。 |
| R1-05 | **冲突处理没有解释后果** | 红底横幅 +「重新载入 / 保留我的修改 / 另存为副本」三个同等样式的按钮，不说明"会丢我的修改 / 会覆盖别人的修改 / 最安全"。用户只能猜。 |
| R1-06 | **日志控制台信息过载且错误不可见** | 一行里塞 5 个级别 chip + 1 个来源 chip + 搜索框 + 4 个按钮，1100px 宽就换行；收起后只剩一行灰字，出现错误也没有任何提示，必须展开并肉眼翻。 |
| R1-07 | **加载态缺失** | 扫描中侧栏显示的是"索引尚未建立 + 开始扫描"的空态，而不是骨架屏 + 进度；`.progress-track/.progress-bar` 样式存在但没有任何组件使用。 |
| R1-08 | **设置项无效** | `ui.browseMode`（列表 / 详情每页 1 条）在设置页可切换并落盘，但 `BrowseView` 一直用固定 `RECIPE_PAGE_SIZE`，切了没反应。 |
| R1-09 | **状态与动作层级混乱** | 主按钮用满填充饱和蓝 `#4C8DFF`，次级按钮只差一个背景色；选中、边框、进度、图标、焦点环全用同一个蓝，长时间使用刺眼且分不清主次；禁用态仅 40% 透明。 |
| R1-10 | **图标是字符拼的** | `★ ▸ ✕ → ↑↓ ⚠ ✓` 混用不同字体的符号，字号/基线/粗细不一致（`Sidebar`、`LogDrawer`、`ItemSlot`、`BrowseView` 都有）。 |
| R1-11 | **空态无引导** | 工作台空的时候是两个大空框，首次使用不知道该从"左侧拖入"还是"配方浏览载入"开始。 |
| R1-12 | **重复信息** | 整合包元数据在顶栏、物品/配方计数在顶栏、同一份计数又在侧栏 footer；`RecipeCard` 的 I/O 只有 `namespace:path` 文本，没有图标，也没有"载入后在看什么"的上下文。 |
| R1-13 | **深浅色只有一套色值** | `[data-theme='light']` 是把深色反相得到的近似值，light 下 `--l3-slot` 与 `--l2-card` 几乎同色，卡片/输入的层级靠边框勉强区分。 |

> 说明：R1-04 是纯样式缺失（无任何逻辑问题），补样式不触碰任何行为；R1-08 是"已持久化但未消费"的设置项，接上它属于 UI 层修复。

---

## 2. 最终布局与设计决策

### 2.1 布局

```
┌─────────────────┬───────────────────────────────────────────────┬──────────────────┐
│ 品牌 + 版本      │ 顶栏：上下文（视图/当前物品或类型）· 扫描 · 动作 · 面板开关 │                  │
│ ─────────────── │ ┌─────────────────────────┬─────────────────┐ │  详情面板         │
│ 当前整合包卡     │ │ 工作区头：图标/名称/ID     │                 │ │  ┌────────────┐  │
│ （包名/MC/加载器 │ │ ＋视图内动作（制作·用途）   │  Divider 5px    │ │  │详情 │ 代码 │  │
│  /KJS/mods/统计/ │ ├─────────────────────────┤                 │ │  └────────────┘  │
│  索引状态/进度）  │ │                         │                 │ │  配方档案         │
│ ─────────────── │ │   中央工作区（唯一重心）   │                 │ │  产物 / 材料      │
│ 导航：           │ │   配方浏览：卡片列表+分页  │                 │ │  修改状态         │
│  配方浏览        │ │   工作台：类型+会话条+编辑 │                 │ │  结构 / 诊断      │
│  工作台          │ │                         │                 │ │  ……              │
│  设置与诊断      │ │                         │                 │ │                  │
│ ─────────────── │ └─────────────────────────┴─────────────────┘ │                  │
│ 物品查找         │                                               │                  │
│  搜索/筛选/列表   │                                               │                  │
│ ─────────────── │                                               │                  │
│ 主题 · Ctrl F    │                                               │                  │
├─────────────────┴───────────────────────────────────────────────┴──────────────────┤
│ 日志控制台：错误计数(可跳转) · 级别过滤 · 来源 · 搜索 · 复制/导出/清空/收起 · 虚拟滚动  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- 日志区跨两列（`grid-column: 1 / -1`），收起时保留 30px 单行：`日志 | 错误数 | 警告数 | 最后一条`。
- 侧栏与右侧面板都可拖拽（5px 分隔条，hover 显示翡翠绿细线），可折叠；侧栏折叠后顶栏出现展开按钮，右侧折叠后保留 24px 竖向标签。

### 2.2 尺寸与折叠

| 区域 | 默认 | 可调 / 折叠 | 依据 |
| --- | --- | --- | --- |
| 左导航栏 | 320px | 248–520 拖拽；`Ctrl+B` 或顶栏按钮整体折叠；<1024px 自动折叠 | 规格 3.9.1 / 3.9.7 |
| 顶栏 | 48px | 固定；窄窗口隐藏统计块，保证单行 | 本轮决策 |
| 中央工作区 | 弹性 | 最小 `0`，内容自行滚动 | 规格 3.9.2 |
| 右侧详情面板 | 360px | 288–560 拖拽；折叠为竖向标签；<1440 上限 340，<1200 上限 300 | 本轮决策（原 280–480 已放宽，见 §5 变更说明） |
| 日志控制台 | 180px | 120–500 拖拽；收起 30px | 规格 3.9.1 |

### 2.3 信息层级规则（写进代码的约定）

- **主按钮只有一个**：翡翠绿实心（`--accent` 底 + 深色字）。每屏最多 1–2 个（提交配方 / 导入整合包）。
- **次级动作**用描边按钮，**工具类动作**用幽灵图标按钮；危险动作（丢弃修改）单独红系。
- **选中**必须同时有三重信号：底色（`--accent-soft`）+ 左侧 2px 竖条 + 文字转 `--accent-strong`（导航项、物品行、配方卡片三处统一）。
- **未提交修改**用琥珀色 `脏字段 N` 徽章（同时出现在会话条与右侧"修改状态"卡）；成功保存用翡翠绿，错误用红，三者不混用。
- 只读（未建模字段、回写预览、诊断、代码）一律用折叠区 + 弱化文字，不做成输入框外观。

---

## 3. 设计令牌（R2）

### 3.1 石墨灰 + 翡翠绿基础色板（默认主题）

| 用途 | 令牌 | 色值 |
| --- | --- | --- |
| 主背景 | `--bg-app` | `#111315` |
| 面板 | `--bg-panel` | `#191D20` |
| 浮起面板 | `--bg-raised` | `#242A2D` |
| 悬停/输入底 | `--bg-hover` / `--bg-inset` | `#2B3235` / `#1C2124` |
| 主强调 | `--accent` | `#34D399` |
| 次强调 | `--accent-strong` | `#6EE7B7` |
| 主文字 | `--fg` | `#E5E7EB` |
| 次文字 | `--fg-muted` | `#9CA3AF` |
| 三文字（元信息） | `--fg-subtle` | `#78838F`（比原 `#5F6B7A` 提亮，长读更稳） |
| 边框 | `--line` | `#30373B` |
| 成功 / 警告 / 错误 / 信息 | `--ok/--warn/--err/--info` | `#34D399` / `#FBBF24` / `#F87171` / `#7DD3FC` |

### 3.2 结构与派生令牌（与主题无关，只定义一次）

- 间距：`--sp-1..8`（4/8/12/16/20/24/32，全站只用这七档）。
- 圆角：`--r-xs 3 / --r-sm 4 / --r-md 6 / --r-lg 8 / --r-xl 12 / --r-pill`（槽位 4、按钮 6、卡片与面板 8、模态 12）。
- 字体：`--fs-display 15 / --fs-title 13.5 / --fs-body 13 / --fs-aux 12 / --fs-badge 11`（**全站无 11px 以下正文**，日志行级别标签 9.5–10px 属于辅助标记，正文仍为 12px）。
- 控件：`--h-control 28 / --h-control-sm 24 / --h-control-lg 32`，行高 `--row-h 40`。
- 动效：`--t 100ms`、`--t-slow 160ms`、`--ease cubic-bezier(.2,0,.2,1)`；**只过渡颜色/透明度/位移**，布局属性一律不过渡。
- 派生色：`--err-line / --err-tint / --err-wash / --warn-line / --info-line / --accent-tint` 全部用 `color-mix(in srgb, var(--语义色) N%, transparent)` 生成 —— 换主题时自动跟随，组件 CSS 里**不再出现任何硬编码 rgba**（唯一例外是纯黑投影）。
- 焦点：`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`，输入框聚焦额外有 3px 柔光 + 边框转强调色。

### 3.3 控件与状态样式

| 控件 | 默认 | hover | active | disabled | 焦点 |
| --- | --- | --- | --- | --- | --- |
| `.btn` | 抬起底 + 1px 边 | 提亮一档 + 边变色 | `scale(.98)` | 42% 透明 + `not-allowed` | 2px 强调色环 |
| `.btn-primary` | 翡翠实心 + 深色字 | `--accent-strong` | 同上 | 同上 | 同上 |
| `.btn-ghost` | 透明 | 底色 + 文字转主色 | — | 同上 | 同上 |
| `.btn-danger` | 红系浅底 | 红加深 | — | 同上 | 同上 |
| `.input` | 内凹底 + 边 | 边提亮 | — | 55% 透明 | 强调边 + 柔光 |
| `.chip` | 胶囊 + 内凹底 | 边提亮 | `scale(.98)` | — | 环 |
| `.seg-btn` | 透明 | 底色 | — | — | 环；选中 = 强调浅底 + 强调字 |

---

## 4. 多主题系统（需求六）

### 4.1 机制

1. 唯一注册表：`src/shared/theme.ts` 定义 `THEME_IDS = ['graphite','light','midnight','oled']`、`DEFAULT_THEME='graphite'`、每套主题的 `label / hint / mode / windowBackground / swatch`。
2. 落盘值：`UiState.theme` 类型从 `'dark' | 'light'` 改为 `ThemeId`；旧的 `'dark'` 由 `normalizeTheme()` 迁移为 `'graphite'`，未知值/空值/非字符串一律回落 `'graphite'`（主进程读取与渲染端初始化各归一一次）。
3. 应用方式：`<html data-theme="...">`；`tokens.css` 为每套主题提供完整变量块，`:root` 同时作为默认主题块，因此**属性缺失时也能正常渲染**。
4. 入口两处：设置页四张预览卡（`role="radiogroup"`，显示真实配色预览 + 当前项勾选）+ 左栏底部按钮循环切换（标题提示当前主题）。
5. 只有颜色变、结构不变：间距/圆角/字号/控件高度等结构令牌只在 `:root` 定义一次，主题块不允许覆盖布局（由 `tests/renderer/themeTokens.test.ts` 断言"只定义一次"）。

### 4.2 四套主题

| id | 名称 | 底色 | 强调色 | 场景 |
| --- | --- | --- | --- | --- |
| `graphite` | 石墨翡翠 | `#111315` | `#34D399` | 默认，长时间编辑 |
| `light` | 浅色 | `#F6F7F8` | `#059669` | 白天 / 强光 |
| `midnight` | 午夜蓝 | `#0C1018` | `#7DD3FC` | 夜间，冷色版暗色 |
| `oled` | OLED 黑 | `#000000` | `#34D399` | 省电 / 最高对比（面板用 `#0A0C0B`/`#131614` 分层，不是整屏同黑） |

### 4.3 主题语义映射

所有组件只消费语义令牌（`--bg-* / --fg-* / --accent* / --ok/--warn/--err/--info / --dirty / --registry / --fluid`），因此四套主题下 20+ 个组件零改动即可换肤；主进程窗口底色（`BrowserWindow.backgroundColor` 与 `setBackgroundColor`）也改为读注册表，避免切换/启动时闪白。

### 4.4 实跑验证（4/4 通过）

`node .cache/ui-theme-shot.mjs`（单会话内循环切换四套主题，逐套截图并读取计算样式）：

| 期望 | `data-theme` | body 背景（计算值） | 侧栏面板背景 | `--accent` | 左栏主题名 |
| --- | --- | --- | --- | --- | --- |
| graphite | `graphite` | `rgb(17,19,21)` | `rgb(25,29,32)` | `#34d399` | 石墨翡翠 |
| light | `light` | `rgb(246,247,248)` | `rgb(255,255,255)` | `#059669` | 浅色 |
| midnight | `midnight` | `rgb(12,16,24)` | `rgb(18,24,38)` | `#7dd3fc` | 午夜蓝 |
| oled | `oled` | `rgb(0,0,0)` | `rgb(10,12,11)` | `#34d399` | OLED 黑 |

- 落盘：切换后 `%APPDATA%/kubejs-recipe-studio/uiState.json` 的 `theme` 变为 `oled`（实测），再次启动沿用。
- 截图：`theme-1-graphite-{browse,settings}`、`theme-2-light-*`、`theme-3-midnight-*`、`theme-4-oled-*`、`theme-5-graphite-restored`（共 9 张）。
- 脚本收尾自动切回默认主题，未把测试机界面留在 OLED。
- 运行时异常 0。

---

## 5. 修改文件清单与职责

### 5.1 新增（8）

| 文件 | 职责 |
| --- | --- |
| `src/shared/theme.ts` | 主题注册表 + `normalizeTheme` / `nextTheme` / `themeMeta`；主进程与渲染端共用 |
| `src/renderer/src/components/Icon.tsx` | 统一线性图标集（16px 网格、1.5px 描边、currentColor，无新依赖） |
| `src/renderer/src/components/NavRail.tsx` | 左导航栏：品牌、整合包卡（元数据/统计/索引状态/进度）、视图导航、主题切换、物品查找挂载点 |
| `src/renderer/src/components/DetailPanel.tsx` | 右侧「详情 / 代码」双页签；按上下文渲染配方档案、编辑会话、修改状态、结构、通用模式说明 |
| `src/renderer/src/views/browse/loadRecipe.ts` | "载入工作台"的唯一实现（卡片与详情面板共用，避免两套逻辑漂移） |
| `tests/shared/theme.test.ts` | 主题注册表 / 迁移 / 循环切换（9 条） |
| `tests/renderer/themeTokens.test.ts` | 四主题变量完整性 + 结构令牌唯一性 + "组件引用的 var 必须有定义"（5 条） |
| `docs/UI-REDESIGN-1-验收报告.md` | 本文 |

### 5.2 修改（28）

| 文件 | 改动 |
| --- | --- |
| `src/renderer/src/App.tsx` | 新骨架：左导航 / 主区（顶栏+横幅+工作区）/ 右详情 / 底部日志；侧栏与详情折叠、分隔条、日志收起条（含错误计数）、设置页时让出右栏 |
| `styles/tokens.css` | 重写：结构令牌 + 四套主题调色板 + 派生色（`color-mix`）+ 焦点环 |
| `styles/shell.css` | 重写：外壳栅格、顶栏（含统计块/扫描 pill/窄窗降级）、按钮/输入/徽章/空态/横幅/toast/状态条/骨架/进度条 |
| `styles/parts.css` | 重写：导航与整合包卡、物品查找、分段控件、详情面板全部卡片、**补齐选择器/数量气泡等浮层样式**、模态、启动占位、日志收起条 |
| `styles/slots.css` | 槽位七态改为语义令牌（含激活/吸取/拖拽/禁用），空槽内凹、徽章字号与对比 |
| `views/views.css` | 重写：工作区头/说明条、配方卡片（图标化 I/O）、工作台（类型行/两列/空引导/动作条）、会话条与冲突卡、试点网格与列表编辑、代码栏、设置页、**主题选择器** |
| `components/logdrawer.css` | 重写：控制台头部（错误计数/级别 chip/来源/搜索/动作）、行级语义底色、详情区、跳转按钮 |
| `views/Sidebar.tsx` | 物品查找：搜索头 + 清除、模组/筛选行、骨架加载、上下键移动选择、行内收藏与选中态、精简状态条 |
| `views/BrowseView.tsx` | 工作区头（物品身份 + 制作/用途分段 + 计数范围）、图标化 I/O 卡片、选中联动右栏、`←/→` 翻页、骨架、空态；`browseMode` 生效 |
| `views/BenchView.tsx` | 类型行（含路径化徽章）、空工作台引导、材料/产物列、附加字段折叠、动作条；撤销/重做移入头部并反映可用性 |
| `views/bench/PilotDraftPanel.tsx` | 会话条（类型/schema/hash/脏字段/保存路径/取消/提交）+ **冲突三选一解释卡** + 未建模字段/诊断/回写预览折叠区（文案契约保持不变） |
| `views/CodePane.tsx` | 标题让位给页签、状态徽章、图标复制按钮、高亮跟随主题明暗 |
| `views/SettingsView.tsx` | 分卡片重排：界面主题（选择器）/面板与内容/工作台试点/生成偏好/覆盖率自检/插件/脚本顺序/运行环境 |
| `components/TopBar.tsx` | 改为"上下文 + 全局动作"：面包屑（视图/当前对象）、统计、扫描进度与取消、重新扫描、导入、详情/日志开关 |
| `components/LogDrawer.tsx` | 控制台交互重做：错误计数跳转第一条错误、级别 chip 带语义色、来源折叠、搜索清除、跟随状态、详情展开与关闭 |
| `components/Toaster.tsx` | 语义图标 + 统一关闭按钮（`aria-label="关闭提示"` 保持不变） |
| `components/BannerBar.tsx` | 图标 + 文本 + 关闭；按级别着色 |
| `components/CandidateModal.tsx` | 候选目录对话框改版（图标、路径截断、底部动作） |
| `components/EmptyState.tsx` | 图标 + 标题 + 步骤 + 主/次动作；新增 `compact` 供窄栏使用 |
| `components/ItemIcon.tsx` | 缺图占位块首字改为 ID 路径段首字母（`minecraft:glowstone → G`），避免同命名空间全变 "M"；占位字号随尺寸 |
| `hooks/useShortcuts.ts` | 新增 `Ctrl+B`（侧栏）、`Ctrl+Z / Ctrl+Shift+Z`（撤销/重做，输入态不接管）；原有 `Ctrl+F/L/Shift+C/Tab/E`、Esc 链保持不变 |
| `store/appStore.ts` | 新增展示层状态 `selectedRecipe / detailTab / selectRecipe / setDetailTab`；`setView` 同时退出设置页；主题归一 |
| `shared/types.ts` | `UiState.theme` 类型改为 `ThemeId` |
| `shared/constants.ts` | 右侧面板宽度区间 288–560（原 280–480），与新栏宽一致 |
| `main/uiStateStore.ts` | 主题读取/写入归一（旧 `dark` → `graphite`），宽度 clamp 改用常量 |
| `main/window.ts` | 窗口底色读主题注册表（避免启动闪白） |
| `main/handlers/appHandlers.ts` | 切换主题时同步窗口底色；未知主题不抛错 |
| `项目交接文档.md` | 新增 UI-REDESIGN-1 会话台账与阶段记录 |

### 5.3 明确未改动（数据安全边界自检）

| 模块 | 核查 |
| --- | --- |
| `src/main/recipes/**`（`commitRecipe` / `backup` / `openRecipe` / `recipeIndex` / `scanRecipes` / `jarRecipes` / `jsonSource` / `zip` 等） | 文件时间戳未变（本轮无写入） |
| `src/main/scanner/**`（含 `iconWriter` / `pool` / `jarPoolCore` / `zip`） | 未改动；`SCAN_WORKER_MAX_CONCURRENCY=8`、`ICON_WRITE_CONCURRENCY_TOTAL=24`、批次 64 均未变 |
| `src/main/schema/**`、`modpack/**`、`plugins/**`、`codegen/**` | 未改动 |
| `src/renderer/src/store/benchStore.ts` / `commitBridge.ts` / `draftBridge.ts` / `slotUtils.ts` | 未改动（脏字段、冲突处置、提交编排、索引回装全部沿用原实现） |
| `src/renderer/src/views/bench/**`（除 `PilotDraftPanel.tsx`） | 未改动（槽位地址、绑定、选择器、网格/列表编辑器原样） |
| `tests/**` 既有用例 | 一条未改；仅新增 2 个文件（14 条） |
| 预加载与 IPC 契约 | `src/preload/**`、`src/shared/ipc.ts` 未改；渲染端仍只经 `window.studio.invoke` |

### 5.4 行为差异（必须知情的三处）

1. **载入配方后统一跳转到工作台**：旧链路里"非试点类型"点「载入工作台」只填充数据、不切视图（用户会觉得没反应）；现在两种链路都切到工作台。P-C7 S8（旧链路）仍通过。
2. **`ui.browseMode` 真正生效**：设置"详情（每页 1）"后配方浏览只显示 1 张卡片。此前该项是空设置。
3. **主题 id 变更**：磁盘上的 `theme: "dark"` 读取时迁移为 `"graphite"`；浅色仍为 `"light"`。外部直接改 `uiState.json` 写非法值时回落默认主题，不会白屏。

---

## 6. 已完成的功能与交互

### 6.1 核心工作流（对应任务书第五节）

| 流程 | 实现 |
| --- | --- |
| 浏览 | 左栏搜索（120ms 防抖、拼音/首字母、上下键移动选择）→ 中间卡片列表（类型/来源/部分解析/未知物品徽章 + 图标化 I/O + 载入按钮）→ 点卡片在右栏看档案（类型、配方 ID、来源、源文件、产物/材料逐项带图标与数量、未知物品）→ 分页与 `←/→`。 |
| 编辑 | 工作台头显示类型与"结构化编辑 / 试点类型·未载入 / 通用模式"三种真实状态；会话条显示 schema/rev/rawHash/脏字段；网格或列表编辑器（双击换物、右键更多、滚轮调数量、拖拽放置、吸取）；右侧"修改状态"卡片列出脏字段（`材料网格 / 材料 / 产物`）。 |
| 提交 | 主按钮 `提交配方`（副本模式自动变 `保存副本`），禁用时 title 说明原因（无修改 / 冲突未处理 / unsafe）；提交成功 toast + 会话条 `已保存 xxx` + 右栏"修改状态"出现绿色保存路径；失败沿用既有错误码与提示。 |
| 冲突 | 触发后中央出现**冲突卡**：标题「原始配方已变化」+ 原因（rawHash 不一致）+ 三个带后果说明的选项（红色"会丢弃你当前未提交的修改" / 琥珀"提交后外部修改会被替换（写入前仍会备份）" / 绿色"最安全：不会覆盖任何现有文件"），按钮标签保持 `重新载入 / 保留我的修改 / 另存为副本`。 |
| 反馈 | 轻量成功用 toast（右下，日志收起时自动上移）；数据风险用冲突卡/横幅；进行中用按钮文案（`提交中…`、`载入中…`）与扫描 pill + 顶栏 2px 进度条；失败用错误 toast + 日志 ERROR。 |

### 6.2 日志控制台

- 展开/收起（`Ctrl+L`、按钮）、高度拖拽（120–500）。
- 错误计数常驻头部，点击直接滚到第一条 ERROR 并展开它的详情；警告计数只读。
- 级别 chip 带语义色（关闭态降透明度）、来源多选（折叠面板，显示启用数）、关键字搜索（含来源字段）、清空/复制当前筛选/导出、自动跟随与"↓ N 条新日志"、行级详情展开、24px 固定行高 + 虚拟滚动。
- 收起态：`日志 ^ | 错误数 | 警告数 | 最后一条消息（错误时转红）| 总条数`。

### 6.3 可访问性

- 全站 `:focus-visible` 2px 强调色环 + 2px offset；物品行/卡片/导航项均为 `button`/`tabIndex` 可聚焦，`Enter`/`Space` 触发。
- 选中态同时有底色 + 竖条 + 文字色，不只靠颜色；错误/警告同时有图标 + 文字 + 颜色。
- `aria-selected / aria-pressed / aria-checked / aria-expanded / role=radiogroup / role=log / aria-live` 用于导航、筛选 chip、主题选择、日志详情。
- 快捷键：`Ctrl+F` 搜索物品、`Ctrl+B` 侧栏、`Ctrl+L` 日志、`Ctrl+Shift+C` 详情面板、`Ctrl+Tab` 视图切换、`Ctrl+E` 类型输入、`Ctrl+Z / Ctrl+Shift+Z` 撤销重做、物品列表 `↑/↓`、配方浏览 `←/→`、`Esc` 关闭浮层/退出设置。
- 正文最小 12px，辅助标记最小 9.5px（仅日志级别/槽位角标），不承担阅读任务。

---

## 7. 实际执行的检查（命令 / 退出码 / 结果）

环境：Windows 10，Node `E:\开发工具\node-v22.14.0-win-x64` v22.14.0 / npm 10.9.2；所有命令在 `E:\mc kjs` 下执行，**未使用 npx / npm exec**。

| # | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| G1 | `npm run typecheck:node` | 0 | 无输出（0 错误） |
| G2 | `npm run typecheck:web` | 0 | 无输出（0 错误） |
| G3 | `npm run lint`（`eslint . --ext .ts,.tsx --max-warnings=0`） | 0 | 0 error / 0 warning |
| G4 | `npm run build`（typecheck + electron-vite build） | 0 | main/preload/renderer 全部产出；renderer `index-*.js 640.70 kB`、`index-*.css 69 kB` |
| G5 | `npm test`（全量 Vitest） | 0 | **53 文件通过 / 2 跳过；560 用例通过 / 4 跳过；0 失败**（基线 51 文件 / 546 用例，+2 文件 +14 用例为本轮新增主题测试） |
| G6 | `./node_modules/.bin/vitest run tests/main/commitRecipe.test.ts tests/main/commitFailurePaths.test.ts tests/main/commitIndexCache.test.ts tests/main/openRecipe.test.ts` | 0 | 4 文件 / **40 通过**（P-C5/C6 定向） |
| G7 | `PACK=... E2E_PORT=9387 node .cache/e2e-pc7.mjs` | 0 | 八场景全通过，`uiErrors=[]`（详见 §8） |
| G8 | `node .cache/ui-shot.mjs`（Electron 实跑 + 23 张截图） | 0 | 15 个步骤全部 ok，`errors=[]`、`consoleErrors=[]` |
| G9 | `node .cache/ui-theme-shot.mjs`（四主题切换） | 0 | 4/4 主题计算样式正确、落盘正确、`errors=[]` |

开工前基线（同一环境，改动前跑）：`typecheck` 0、`lint` 0、`npm test` 51 文件 / 546 通过 / 4 跳过 —— 与改动后对比只增不减，未降低任何断言。

未执行项（如实记录）：

- **打包安装包**（`npm run dist:win`）未执行：本轮只涉及渲染层与少量 UI 状态代码，`electron-builder` 打包与 NSIS 签名耗时且与本轮改动无关；`npm run build` 已覆盖产物生成。
- 未在 macOS / Linux 上验证（本机只有 Windows）。
- 未做真实触摸/高 DPI 多屏验证；DPR=1 与系统缩放 125% 下各跑过一次（后者表现为 1080×637 CSS 视口，布局仍单行可读）。

---

## 8. P-C7 八场景回归结果

命令：`PACK="E:/mc kjs/.cache/pc7-pack-1112" E2E_PORT=9387 node .cache/e2e-pc7.mjs`（未改脚本、未改断言）→ 退出码 0，`uiErrors=[]`。

| 场景 | 关键断言 | 结果 |
| --- | --- | --- |
| S1 取消草稿 | `panelGone=true`、`fileExistsAfterCancel=false` | ✅ |
| S2 提交 + 查询 + 重开 | `pattern=["I#I","IBI","PPP"]`、`keyB={emerald,1}`、`queryIncludesCommitted=true`、`conditionsKept=true`、`reopenedMatchesFile=true` | ✅ |
| S3 冲突→重新载入 | `conflictShown`、`draftNowFromExternal`、`fileStillExternal`、`dirtyZero` 全 true | ✅ |
| S4 冲突→保留我的→提交 | `conflictResolved`、`myEditSaved`、`externalFieldPreserved` 全 true | ✅ |
| S5 冲突→另存为副本 | `buttonShowsSaveCopy`、`copyFileCreated`、`copyHasRedstone`、`originalUntouched` 全 true | ✅ |
| S6 真实只读失败 | toast「写入失败（…）：EPERM（未写入目标文件；草稿已保留，可重试）」、`dirtyKept=true`、`fileUnchanged=true` | ✅ |
| S7 外部删除后提交 | toast「无法读取当前原始配方：源文件已失效…」、`dirtyKept=true`、`fileNotResurrected=true` | ✅ |
| S8 关闭白名单回退 | `pilotPanelAbsent=true`、`legacyBenchCols=1` | ✅ |

脚本依赖的 DOM 契约在重设计后**全部保留**（这是本轮最主要的隐性约束）：

`.view-tabs button`（`配方浏览 / 工作台 / 设置与诊断` 纯文本）、`.sidebar-search input`、`.item-row`、`.recipe-card` + `header .mono.aux`（类型）+ `header button`（首个即载入）、`.browse-pager`、`.bench-cols` + `.slot-column input.input.mono`、`.pilot-panel`（含 `脏字段 N`、`原始配方已变化`、`提交配方 / 保存副本 / 取消草稿 / 重新载入 / 保留我的修改 / 另存为副本`）、`.pilot-unknowns`、`.pilot-diagnostics`、`.pilot-preview pre`、`[data-slot="grid:N"]`、`.picker-panel .panel-search` + `.panel-foot button`、`.toast` + `button[aria-label="关闭提示"]`、`.chip` 中的 `试点工作台：有序合成 开/关`。

---

## 9. Electron 实际运行检查（不只构建成功）

脚本：`node .cache/ui-shot.mjs`（附加 CDP，真实窗口 1424×835 CSS 视口；扫描走缓存命中 6.9–10.5s）。**15 个步骤全部成功，渲染进程 0 异常、0 console.error。**

截图（`.cache/ui/`，共 23 张）：

| 文件 | 检查点 |
| --- | --- |
| `01-startup` | 未导入状态的左栏引导、中央空态、右栏提示、日志 2 条 |
| `02-browse-empty` | 扫描完成后左栏列表 43,455 条、状态行、顶栏统计 |
| `03-settings` | 设置页：主题选择器 4 卡 + 面板/试点/生成偏好/覆盖率高 |
| `04-browse-cards` | 卡片列表：类型/来源徽章、图标化 I/O、载入按钮、计数与分页 |
| `05-browse-selected` / `05b-detail-zoom` | 选中卡片 → 右栏配方档案联动（2× 放大看行距与路径换行） |
| `06-bench-draft` | 工作台 + 会话条（脏字段 0、提交禁用）/ 网格 3×3 / 产物 |
| `07-picker` | **物品选择器浮层已有完整样式**（此前完全无样式） |
| `08-dirty` | 编辑后 `脏字段 1` 琥珀徽章、右栏"有 1 处修改尚未提交"、提交按钮转可用 |
| `09-code` / `09b-draft-detail-zoom` | 代码页签（只读、复制按钮）+ 详情页签放大 |
| `10-preview` | 回写预览折叠区展开显示 JSON |
| `11-conflict` / `11b-conflict-zoom` | 冲突卡三选一与后果说明（2× 放大） |
| `19-shapeless` | 无序合成列表编辑器（真实贴图、数量框、可多值/单值徽章） |
| `20-log-filtered` | 关闭 INFO 后只剩 WARN，状态条 `23 / 53 条` |
| `12-log-collapsed` | 收起态单行：错误/警告计数 + 最后一条 + toast 不遮挡 |
| `13-log-open` | 控制台完整头部与行级配色 |
| `14-rail-collapsed` | 侧栏折叠后顶栏出现展开按钮、中央区变宽 |
| `15-detail-collapsed` | 详情折叠为右缘竖向标签 |
| `16-1440x900` | 目标尺寸下的完整三栏 |
| `17-1100x720` | 顶栏单行、材料/产物竖排、详情 300px |
| `18-1024x700` | 最小窗口宽度下仍无重叠/溢出 |

实跑中发现并当场修掉的问题（都属于"只看代码发现不了"的）：

1. 日志收起条被 `.logzone` 的 `flex-direction: column` 继承，内容竖排且被裁掉 → 显式 `row`。
2. 1100px 以下顶栏统计块与面包屑换行溢出 48px 高度 → 顶栏 `nowrap` + <1360 隐藏统计 + 面包屑 `max-width` 递减。
3. 材料/产物列头在窄窗口被挤成竖排 → 标题 `nowrap`，说明文字 <1240 隐藏；<1160 两列竖排。
4. `详情` 里"路径 / 容器 / 唯一标识"三行几乎相同的一长串路径把面板撑满 → 改为只显示末两段 + 完整值放 title + 悬停出现复制按钮。
5. 结构化草稿的"可编辑槽位 0 个字段"（shaped 的 schema.slots 为空导致）→ 改为"编辑形态/材料/产物/可编辑字段"的真实口径。
6. `通用模式` 徽章在 `schema:list` 尚未接线时恒为真（所有类型都显示"通用模式"）→ 改为按草稿/白名单/通用三态判定。
7. toast 在日志收起时压住日志条 → 收起态整体上移 42px。

> 已知环境现象（非本轮缺陷）：`schema:list / schema:coverage / plugins:list / scripts:list / codegen:preview` 这几条 IPC 在主进程侧尚未接线（P-C1 交接文档已列为"未接线"）。因此设置页"覆盖率自检"为空、代码页签显示空态，并把 `未注册的 IPC channel` 记成 WARN。本轮按约束**不补业务 handler**，只保证 UI 在缺数据时不崩、文案诚实。
>
> 日志里的 1 条 ERROR 是脚本故意制造的冲突提交（`recipes:commit 失败：原始配方已变化…默认拒绝覆盖`），属既有设计行为，不是渲染缺陷；`uiErrors` 与 `console.error` 均为空。

---

## 10. 尚未解决的问题与建议

| # | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| U1 | `schema:*` / `plugins:*` / `scripts:*` / `codegen:preview` 未接线 | 覆盖率自检、插件列表、脚本顺序、代码预览为空；日志每次进设置都新增 4 条 WARN | 独立任务接线（属业务逻辑，本轮不动） |
| U2 | 右侧"详情"在浏览态只反映"最近点选/载入的配方"，不随卡片键盘焦点实时变化 | 键盘用户按 Tab 移动焦点时右栏不跟随 | 后续可加 `onFocus` 节流同步 |
| U3 | 工作台左侧物品列表与中央编辑区仍是"两栏"，没有做物品预览浮窗 | 载入大包时右栏信息密度偏低 | 观察实际使用再定，不提前加功能 |
| U4 | 未见虚拟滚动的日志详情/超长 detail 折行在 4K 下未验证 | 仅本机 1080/1440 视口验证 | 需要 4K 屏复验 |
| U5 | `Ctrl+Z` 撤销只回滚 bench values（沿用原语义），不回滚类型切换与草稿会话 | 与部分用户直觉不同 | 属业务语义，未擅自改动 |
| U6 | 打包产物（`dist:win`）未验 | 发布前需另跑 | 交由发布流程 |

---

## 11. 验收结论

- **功能完整性**：13/13 保持（§6 与 §8）。核心业务代码零改动，P-C7 八场景全通过，数据安全相关路径（备份/原子写/回滚/冲突三选一）行为未变。
- **视觉与交互**：石墨灰 + 翡翠绿统一语言落地到全部页面与浮层（含此前完全无样式的选择器）；四套主题实时切换并持久化；主次动作、选中态、未提交状态、错误状态均有明确区分；无纯黑纯白（OLED 主题按需求显式采用纯黑底，面板仍分层）。
- **工程与回归**：类型检查、ESLint、构建、全量测试、定向测试、Electron 端到端、真实窗口截图全部实际执行并记录退出码；无"未执行却标记通过"的项。

**建议：通过验收。** 前置条件：U1 的 IPC 接线另立任务，不在本轮范围；发布前补一次 `dist:win` 与 4K 视口复验。

---

## 附录 A：截图索引

- 主流程：`.cache/ui/01..20`（23 张，含 2× 放大裁剪）
- 多主题：`.cache/ui/theme-{1..5}-*`（9 张）
- 脚本：`.cache/ui-shot.mjs`（主流程）、`.cache/ui-theme-shot.mjs`（多主题）、`.cache/e2e-pc7.mjs`（P-C7，未改动）
- 运行日志：`.cache/ui-shot-final5.log`、`.cache/ui-theme.log`、`.cache/ui-pc7-final.log`、`.cache/ui-vitest-final.log`

## 附录 B：设计令牌速查

| 类别 | 令牌 |
| --- | --- |
| 表面 | `--bg-app --bg-panel --bg-raised --bg-hover --bg-active --bg-inset --bg-inset-hover` |
| 描边 | `--line --line-soft --line-strong --line-inset` |
| 文字 | `--fg --fg-muted --fg-subtle --fg-on-accent` |
| 强调 | `--accent --accent-strong --accent-deep --accent-soft --accent-softer --accent-line --accent-glow` |
| 语义 | `--ok --warn --err --info --dirty --registry --fluid`（+ `-soft` 浅底） |
| 派生 | `--err-line --err-tint --err-wash --err-edge --warn-line --warn-tint --accent-tint --ok-line --info-line` |
| 结构 | `--sp-1..8 --r-xs..xl --fs-display..badge --h-control* --row-h --t --ease --focus-ring` |
| 浮层 | `--shadow-1..3 --overlay-bg --badge-bg --highlight-bg --skeleton` |
