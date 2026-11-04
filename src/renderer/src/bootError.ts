/**
 * P3-22c：启动失败的兜底界面——脱离 React/store/桥的纯 DOM 实现，
 * 保证任何启动错误（store init 拒绝、CSS/JS 加载异常）都能画出可读的信息。
 * 只在 main.tsx 的 init().catch 里调用；样式内联（不依赖 tokens.css 加载成功）。
 */
export function renderBootError(container: HTMLElement, err: unknown, logDir: string | null): void {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
  const logHint =
    logDir ??
    '无法确定日志目录（preload 桥不可用）；默认在 %APPDATA%\\kubejs-recipe-studio\\logs，若设置了 STUDIO_USER_DATA 则在其下的 logs'

  container.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.setAttribute('role', 'alert')
  wrap.setAttribute('aria-label', '启动失败')
  wrap.style.cssText =
    'max-width:680px;margin:12vh auto;padding:24px;border:1px solid #c0392b;border-radius:8px;' +
    'font:14px/1.7 system-ui,sans-serif;color:#eee;background:#1b1b1f;white-space:pre-wrap;word-break:break-word'

  const title = document.createElement('h1')
  title.textContent = '启动失败'
  title.style.cssText = 'font-size:18px;margin:0 0 12px;color:#ff8a80'

  const errBox = document.createElement('p')
  errBox.textContent = message

  const logBox = document.createElement('p')
  logBox.textContent = `日志目录：${logHint}`

  const hint = document.createElement('p')
  hint.style.cssText = 'color:#aaa'
  hint.textContent = '请重启应用重试；若反复失败，请把上述日志目录里的内容一并反馈。'

  wrap.append(title, errBox, logBox, hint)
  container.appendChild(wrap)
}
