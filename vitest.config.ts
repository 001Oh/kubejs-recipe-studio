import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    /**
     * T-10 / D-33：组件级测试需要 DOM。**只对 `tests/renderer/components/**` 生效**，
     * 其余用例（含 `tests/renderer/*.test.ts` 的既有 13 个纯逻辑用例）仍跑在 node 环境，
     * 因此不改变现有用例的运行环境。
     *
     * ⚠️ 第 115 批实测：本项在 Windows 上**不生效**。vitest 2.1.9 会用
     * `path.resolve(root, glob)` 把上面的 glob 转成绝对路径，Windows 得到反斜杠
     * （`E:\mc kjs\tests\renderer\components\**`），而 micromatch 把反斜杠当转义符 →
     * 永远匹配不上，组件用例退化成 node 环境报 `document is not defined`。
     * 因此**权威来源是文件头的 `// @vitest-environment jsdom` 文档注释**
     * （vitest 直接读源码，跨平台稳定）；本项保留只为非 Windows 环境兜底。
     * 新增组件测试请照抄该注释。
     */
    environmentMatchGlobs: [['tests/renderer/components/**', 'jsdom']],
    globals: false,
    testTimeout: 30000,
    /**
     * P-C4：性能类用例（`tests/algorithms/*` 的单次查询预算、`virtualFilter` 的 41,000 条过滤开销）
     * 断言的是「单次查询耗时上限」，对同机其他 worker 的 CPU 争用极其敏感：
     * 并行执行时中位数仍为 5–8ms（预算 16ms），但最坏样本会被抢占拉到 19–43ms，导致 5/5 全量运行失败；
     * 串行执行时同样断言的实测最坏值为 3.5–3.9ms。
     * 因此这里关闭**文件级并行**（不是放宽阈值、也不是修改断言）：让性能测量在无争用的进程里进行。
     * 单次全量从约 17–30s 增加到约 50s，属可接受代价。
     */
    fileParallelism: false
  }
})
