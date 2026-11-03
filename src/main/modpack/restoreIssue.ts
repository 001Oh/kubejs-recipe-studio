/**
 * 第 6 条：把「上次整合包恢复失败」从日志提升为可读状态。
 *
 * 背景：T-25 的恢复失败只写 `logger.warn`，用户界面上看不到任何东西——
 * 表现为「打开应用发现包没了，但不知道为什么」。
 * 这里只存一条人可读的原因，由 `app:runtime` 暴露给渲染层，设置页据此显示横幅。
 *
 * 不放进 uiState：它是「本次运行的事实」，不该被持久化到磁盘（重启后重新判定）。
 */
let issue: string | null = null

export function setRestoreIssue(reason: string): void {
  issue = reason
}

export function clearRestoreIssue(): void {
  issue = null
}

export function getRestoreIssue(): string | null {
  return issue
}
