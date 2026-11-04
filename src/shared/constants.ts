/** 全局常量与硬上限。所有进程共用，禁止在功能代码里重复写魔法数。 */

/** 侧边栏固定宽度基准与可调范围（px，规格 3.9.1） */
export const SIDEBAR_DEFAULT_WIDTH = 320
export const SIDEBAR_MIN_WIDTH = 240
export const SIDEBAR_MAX_WIDTH = 520

/** 右侧面板在 UI-REDESIGN-1 起承载「详情 / 代码」双页签，宽度区间略放宽 */
export const CODEPANE_DEFAULT_WIDTH = 360
export const CODEPANE_MIN_WIDTH = 288
export const CODEPANE_MAX_WIDTH = 560

export const LOGDRAWER_DEFAULT_HEIGHT = 180
export const LOGDRAWER_MIN_HEIGHT = 120
export const LOGDRAWER_MAX_HEIGHT = 500
export const LOGDRAWER_COLLAPSED_HEIGHT = 32

export const WINDOW_DEFAULT_WIDTH = 1440
export const WINDOW_DEFAULT_HEIGHT = 900
export const WINDOW_MIN_WIDTH = 1100
export const WINDOW_MIN_HEIGHT = 700

/** 扫描并发：os.cpus().length，上限 8（规格 3.2） */
export const SCAN_WORKER_MAX_CONCURRENCY = 8

/**
 * P-OPT2：图标写入的全局并发上限（跨 worker 的总预算）。
 * 实测（docs/P-OPT2-图标写入批量化.md）：12/24/48 三档分别为 1.05/0.93/1.05 ms/icon，差异在噪声内，
 * 48 以上未测；取 24 作为折中，避免 lane 过多时预算被四舍五入放大。
 */
export const ICON_WRITE_CONCURRENCY_TOTAL = 24

/** 搜索防抖与代码预览防抖（ms） */
export const SEARCH_DEBOUNCE_MS = 120
export const CODE_DEBOUNCE_MS = 200

/** 侧边栏行高与搜索单次返回上限 */
export const SIDEBAR_ROW_HEIGHT = 40
export const SIDEBAR_PAGE_SIZE = 400

/** T-26 / UI-U3：物品预览浮窗的悬停触发延时（毫秒）——短于它划过不发任何查询 */
export const HOVER_DELAY_MS = 400

/** 配方浏览每页卡片数：普通 6，详情模式 1（规格 3.5） */
export const RECIPE_PAGE_SIZE = 6
export const RECIPE_DETAIL_PAGE_SIZE = 1

/** 工作台通用字典的保留键（grid / inputs / outputs） */
export const BENCH_GRID_KEY = 'grid'
export const BENCH_INPUTS_KEY = 'inputs'
export const BENCH_OUTPUTS_KEY = 'outputs'

/** 撤销/重做历史上限（规格 3.4） */
export const HISTORY_MAX = 100

/** 日志保留上限，超出丢最旧 DEBUG（规格 3.8） */
export const LOG_BUFFER_MAX = 5000
export const LOG_FILE_KEEP_DAYS = 7

/** 拼音多音字组合上限（规格 3.3） */
export const PINYIN_MAX_COMBINATIONS = 8

/** L1 反推：每种 type 的采样上限与可信度阈值 */
export const INFER_SAMPLE_LIMIT = 50
export const INFER_FIELD_MIN_RATE = 0.1
export const INFER_LOW_CONFIDENCE_SAMPLES = 3
export const INFER_MAX_DEPTH = 3

/**
 * B120/D-05：schema 库版本常量——进推断缓存（inferred-schemas / inferred-shapes）的签名。
 * 归纳/命名规则一变就 +1，旧缓存立即失效，杜绝「schema 库升级后旧缓存永不失效」
 * （116 批遗留.2：readInferredShapes 不比对签名）。
 */
export const SCHEMA_LIB_VERSION = 1

/** 配对字段合并要求的共现率（规格 3.6.12） */
export const PAIR_CO_OCCURRENCE_MIN = 0.95

/** 有序网格上限（Create 机械合成 9×9） */
export const GRID_MAX_SIZE = 9
export const GRID_DEFAULT_SIZE = 3

/** 缓存与图标目录名 */
// 不能叫 'cache'：Electron/Chromium 的磁盘缓存目录是 userData/Cache（Windows 大小写不敏感），
// 实测会被 Chromium 在启动时清掉无法识别的条目，导致「每次重启都重扫」。
export const CACHE_DIR_NAME = 'studio-cache'
export const ICON_CACHE_DIR_NAME = 'icon-cache'
export const LOG_DIR_NAME = 'logs'
export const PLUGIN_DIR_NAME = 'plugins'

/** 整合包内插件目录（优先于用户级） */
export const MODPACK_PLUGIN_DIR = '.recipe-studio/plugins'

/** 数据包输出 namespace（冲突时自动加后缀） */
export const DATAPACK_NAMESPACE = 'recipe_studio'

/** 生成脚本文件名前缀 */
export const SCRIPT_FILE_PREFIX = 'recipe_studio_'

/** 自定义协议（图标加载） */
export const ICON_PROTOCOL = 'app-icon'
