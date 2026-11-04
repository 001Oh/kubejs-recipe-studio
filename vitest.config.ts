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
     * 其余用例（含 `tests/renderer/*.test.ts` 的既有纯逻辑用例）仍跑在 node 环境，
     * 因此不改变现有用例的运行环境。
     *
     * 权威来源是**文件头文档注释** `// @vitest-environment jsdom`：它由 vitest 直接读源码决定环境，
     * 与路径、平台、配置解析顺序都无关，跨机器稳定。本项 glob 只是**兜底**——
     * 万一用例放错目录（不在 components/ 下），也不至于静默退化回 node 报 `document is not defined`。
     * 新增组件测试请照抄该注释；只有确实需要 DOM 的用例才加。
     *
     * 第 116 批更正：第 115 批曾在本注释里断言"本项在 Windows 上不生效"，该结论**作废**。
     * 探针实测（`tests/renderer/components/` 下不带注释的用例）能正常拿到 `document`，
     * 0.1.12 的 922 全绿也包含那 8 个文件。当时的失败无法复现，不再作为事实写入配置。
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
