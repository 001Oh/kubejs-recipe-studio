# KubeJS Recipe Studio

给 Minecraft 整合包可视化编写 KubeJS 配方的桌面应用。导入整合包目录后自动识别版本与模组、解析全部物品与已有配方，
在图形界面里拖拽构建配方，实时预览 KubeJS 脚本或直接生成数据包 JSON，并写入 `kubejs/server_scripts/`。

需求规格见 [docs/KubeJS配方工坊-需求规格-完整版.md](docs/KubeJS配方工坊-需求规格-完整版.md)，架构决策见
[docs/架构决策.md](docs/架构决策.md)，开发过程与变更台账见 [项目交接文档.md](项目交接文档.md)。

## 环境准备

需要 Node.js 20+（本项目开发机使用可移植 Node `E:\开发工具\node-v22.14.0-win-x64`，命令前先把它加进 PATH）：

```bash
export PATH="/e/开发工具/node-v22.14.0-win-x64:$PATH"
npm install            # 依赖装进仓库内 node_modules
npm run dev            # electron-vite 开发模式，热更新
npm run test           # vitest 全量单测
npm run build          # tsc --noEmit 双工程 + electron-vite build，产物 out/
npm run dist:win       # electron-builder 打 Windows nsis 安装包，产物 dist/
```

Electron 二进制下载走国内镜像时加 `export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`。

## 使用步骤

1. 顶栏「导入整合包」，选择整合包根目录（含 `mods/`、`config/`、`kubejs/` 的那层）。选到的目录不含 `mods/` 时程序会
   向下扫描一层自动纠正；有多个候选则弹窗选择。
2. 首次扫描流式解析所有 mod jar（进度在顶栏与日志抽屉里），提取物品 ID / 中英文名 / 16×16 真实贴图并构建配方倒排索引。
   二次启动命中缓存，直接可用。
3. 左侧搜索物品（中文名、英文名、`namespace:id`、拼音全拼、首字母都支持，例如 `zuanshi`、`zs`、`jgs`）。
   左键点物品 → 中间「配方浏览」看它的制作与用途；中键点物品 → 吸取，再点槽位放置。
4. 点配方卡片的「载入工作台」以现有配方为模板改衍生配方，或自己在「工作台」里搭。
5. 右侧代码栏实时预览生成结果，「写入文件」写进 `kubejs/server_scripts/`（覆盖前二次确认并自动备份到 `.backup/`），
   或在生成偏好里选数据包 JSON 模式写进 `kubejs/data/`。游戏内执行 `/reload` 生效。

## 覆盖率承诺

程序对「模组 KJS 支持」的承诺不是"我认识所有附属模组"，而是：

> **只要某个配方类型在整合包里以数据驱动形式存在，程序就能为它生成可用的配方。**
> 附属装了就用语法糖，没装就写数据包 JSON，API 变了就绕开——功能不因附属模组的差异而缺失。

判定依据全部来自整合包本身（jar 里的 lang / 模型 / 配方 JSON / `mods.toml`），程序不预设任何模组清单。
确实存在无法添加的配方类型——模组在 Java 里硬编码、没有注册 `RecipeType` 的（如 Mekanism 的 Boiler、SPS），
程序如实标注到具体 recipe type 并给出替代方案，不做笼统的「该模组不支持」结论。

## 已实现 / 已接线 / 预留未接线

以下三态表基于 0.1.11 的逐文件引用复核（2026-11-04 第三方审计 P3-1/2/3/11/20 复核结论），
用于区分「运行时真实存在的能力」与「代码在库但未接入数据流的能力」：

| 状态 | 模块 | 说明 |
|---|---|---|
| 已接线 | 试点三类型（`minecraft:crafting_shaped/shapeless`、`create:mixing`）+ 通用兜底 | `PILOT_SCHEMAS` 是 builtin 层唯一数据源（`schema/service.ts`） |
| 已接线 | schema 钉住（pin）与插件层 | `customRecipeTypes.json` + 插件通道，含三态失败语义 |
| 已接线 | `views/bench/panels/WriteDialog.tsx`、`controls/useSlotBinding.ts`、`overlays/{anchor,CountEditor,ItemPicker}` | 由 `BenchView` / 试点编辑器挂载 |
| 已接线 | `scanSession` 的 `recordIcon` / `startScanSession` / `endScanSession` | 扫描编排使用 |
| 预留未接线 | `src/data/recipeTypes/`（6 文件，672 行） | 「L0 内置类型库」无任何生产引用，不产出数据 |
| 预留未接线 | `src/shared/schemaValidate.ts`（225 行） | 引用/数量/概率诊断层，仅 tests 引用；钉住校验在 schemaHandlers 另有实现 |
| 已移除（D-49.6） | `src/shared/schemaMigrate.ts` | 迁移层已随 `191348d` 删除；`customRecipeTypes.json` 走 `loadPinned` 直读路径，无需迁移 |
| 预留未接线 | `scanSession` 的 `cleanupScanSession` / `recordCacheFile` | 「取消时清理」未接线（取消路径按 A 方案保留产物），能力供缓存管理复用 |
| 预留未接线 | `views/bench/layouts/`（6 文件：BenchLayout、ShapedGrid、ZoneBoard、CustomGrid、SequenceEditor、ZoneShell） | 通用 schema 编辑器布局层 |
| 预留未接线 | `views/bench/controls/`（9 文件：ComplexControls、controlProps、FieldControl、FieldShell、ItemControls、KeyValueEditor、RefControls、RegistryControl、ScalarControls） | 通用控件层（useSlotBinding 已接线，见上） |
| 预留未接线 | `views/bench/panels/`（7 文件：AdvancedPanel、BenchHead、JsonEditor、KeyValueEditor、RequirementsBar、SecondaryPanel、TypeSelect） | 通用面板层（WriteDialog 已接线，见上） |
| 预留未接线 | `views/bench/overlays/RegistryPicker.tsx`、`views/bench/{jsonModel,useElementWidth,valueAccess}.ts` | 注册表选择器与 bench 辅助函数，运行时不可达 |

> 维护提示：上述「预留未接线」文件**保留在库中是有意决策**（接入时直接复用，避免重写），
> 阅读架构注释时以本表为准——`registry.ts` / `merge.ts` 头注释里的层优先级是设计目标，
> 当前实际生效的数据源只有钉住 / 插件 / 内置试点 3 类型。

## 已知取舍

- 视图切换用 `Ctrl+Tab`（规格 3.9.9 同时要求裸 `Tab` 遍历焦点与切换视图，二者互斥，取可访问性优先）。
- 注册表槽（灌注类型 / 气体 / 浆液 / 色素）的图标是全程序唯一允许不用真实贴图的地方，用「类型主色块 + `INF`/`GAS`/`SLR`/`PGM`/`REG` 缩写」表示；
  其余物品一律显示从 jar 提取的真实贴图。
- 仪式 / 祭坛类配方不做拟真的环形阵型，编辑区用高效网格，避免「第 7 个材料在哪」难找。

## 安全边界

- **插件钩子沙箱当前为预留能力**（B121/D-49.1：已实现并有完整测试，但尚未接入生产插件执行流程——
  manifest 写 `hooks` 不会被执行，详见 `docs/plugins/插件编写说明.md` §8；接入前本条风险面描述不生效）。
  接入后以下口径生效：`hookSandbox` 的 1 s 超时**只覆盖同步执行**：钩子里的 Promise 微任务链不受该超时限制，
  失控插件理论上可长时间占用主进程事件循环。信任边界是**用户主动安装的插件**；
  worker 级真隔离（可强制 `terminate()`）尚未实现，列为 0.2.0 候选（P3-12）。
- 生成脚本时 `emitTarget` 只接受 `event.<标识符>(.<标识符>)*` 形态（P3-17）；非法值不做任何拼接，
  而是按「无语法糖」回退 `event.custom`，避免插件输入注入生成的 JS。
