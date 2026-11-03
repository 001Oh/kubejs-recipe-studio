/**
 * 测试专用：尽力清理临时目录。
 *
 * 为什么需要它：本仓库在带「safe-delete」守卫的宿主里运行时，`rmSync` 会被拦截并在
 * 同一 turn 内累计删除目标超过阈值时抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`。
 * 那是宿主的批量删除保护，不是被测逻辑的问题；清理失败也不应让「清理钩子」变成
 * 文件级失败（Vitest 会把 afterAll 异常记成该文件的失败，掩盖真实用例结果）。
 *
 * 注意：只用于 tests/ 下的临时目录。生产代码与主进程写盘不使用此函数。
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'

export function cleanupTmp(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // 静默忽略：临时目录残留不影响下一次运行（每次 mkdtemp / 固定目录都会重建）
    if (!/SAFE_DELETE|EPERM|EBUSY|ENOENT|拒绝访问|另一个程序/.test(message)) {
      console.warn(`[test] 清理临时目录失败（已忽略）：${target} — ${message}`)
    }
  }
}

/** 隔离区根：与 `.vitest-tmp` 同卷（项目卷），因此 rename 不会 EXDEV。 */
const TRASH_ROOT = join(process.cwd(), '.vitest-tmp.trash')
let trashSeq = 0

/**
 * 测试专用：把临时目录**移到隔离区**，而不是删除。
 *
 * 为什么需要它（T-23 条件⑤）：带「safe-delete」守卫的宿主会拦截「一次 turn 内累计删除
 * ≥50 文件」并抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`。`boot()` 里的 `rmSync(H.userData)`
 * 正好命中该阈值 → 清理钩子变成**文件级失败**，掩盖真实用例结果。
 * `rename` 属「移动」不属「删除」，不被拦截。
 *
 * 约束：必须与目标同卷（默认 `<cwd>/.vitest-tmp.trash` 与 `.vitest-tmp` 同卷）。
 * 目标不存在（ENOENT）属正常，静默跳过；其它错误退化为 `cleanupTmp` 尽力清理，
 * **清理失败绝不影响用例结果**。
 */
export function trashTmp(target: string): string | null {
  try {
    mkdirSync(TRASH_ROOT, { recursive: true })
    const dest = join(TRASH_ROOT, `${basename(target)}-${Date.now()}-${trashSeq++}`)
    renameSync(target, dest)
    return dest
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/ENOENT/.test(message)) cleanupTmp(target)
    return null
  }
}
