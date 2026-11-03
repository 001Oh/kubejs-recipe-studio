import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * 扫描类 worker 以主进程额外入口单独构建，worker_threads 用 __dirname 定位产物。
 * 文件不存在时不加入构建列表，保证骨架阶段 build 可用。
 */
function extraMainEntries(): Record<string, string> {
  const candidates: Record<string, string> = {
    'scan.worker': 'src/main/scanner/scan.worker.ts',
    'recipe.worker': 'src/main/recipes/recipe.worker.ts'
  }
  const used: Record<string, string> = {}
  for (const [name, rel] of Object.entries(candidates)) {
    if (existsSync(resolve(__dirname, rel))) used[name] = resolve(__dirname, rel)
  }
  return used
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts'), ...extraMainEntries() },
        output: { entryFileNames: '[name].js' }
      }
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { entryFileNames: '[name].js' }
      }
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      // 注意：renderer 的 root 是 src/renderer，这里必须写绝对路径，
      // 相对路径会被解析成项目外的 E:\out（实测过一次，构建产物直接跑到盘符根目录）。
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
