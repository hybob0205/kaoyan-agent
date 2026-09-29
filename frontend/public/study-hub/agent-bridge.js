(() => {
  const deviceMode = localStorage.getItem('kaoyan-agent-run-mode-v1') === 'device'
  let userId = ''
  try {
    if (deviceMode) userId = 'device'
    else {
      const token = localStorage.getItem('kaoyan-agent-token-v1')
      const payload = token && JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload && Number.isInteger(Number(payload.sub)) && payload.exp * 1000 > Date.now()) {
        userId = String(payload.sub)
      }
    }
  } catch { /* A missing or invalid login returns to the Agent. */ }
  if (!userId) {
    location.replace('/')
    return
  }
  window.HUB_USER_NAMESPACE = userId
  let resolveMenu
  window.AGENT_FLOATING_MENU_READY = new Promise((resolve) => { resolveMenu = resolve })
  window.AGENT_DATA_READY = deviceMode ? Promise.resolve() : import('/agent-sync.js?v=1').then(() => window.AGENT_SYNC_BOOT).catch(() => {
    window.AGENT_DATA_CHANGED = undefined
    document.addEventListener('DOMContentLoaded', () => alert('电脑端同步脚本加载失败；当前记录只保存在此浏览器。'))
  })
  window.AGENT_DATA_READY.then(() => import('/study-hub/agent-integration.js').then(({ bootHubIntegration }) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bootHubIntegration(userId), { once: true })
    else bootHubIntegration(userId)
  })).catch((error) => console.error('研习室集成功能加载失败', error))
  window.addEventListener('pageshow', () => {
    if ((localStorage.getItem('kaoyan-agent-run-mode-v1') === 'device') !== deviceMode) location.replace('/')
  })
  document.addEventListener('DOMContentLoaded', () => {
    const link = document.createElement('a')
    link.href = '/'
    link.textContent = '← 返回考研 Agent'
    link.className = 'agent-home-link'
    link.setAttribute('aria-label', '返回考研 Agent 首页')
    const style = document.createElement('style')
    style.textContent = '.agent-home-link{position:fixed;right:16px;bottom:70px;z-index:9999;display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border:1px solid #264b3a;border-radius:999px;background:#173f32;color:#fff!important;font:600 13px/1.4 system-ui,sans-serif;text-decoration:none!important;box-shadow:0 8px 24px #10281f44}.agent-home-link:hover,.agent-home-link:focus-visible{background:#27634c;outline:2px solid #fff;outline-offset:2px}@media(max-width:720px){.agent-home-link{right:12px;bottom:calc(60px + env(safe-area-inset-bottom))}}'
    document.head.append(style)
    document.body.append(link)
    import('/agent-floating-menu.js?v=2').then(({ createFloatingMenu }) => resolveMenu(createFloatingMenu(link))).catch((error) => { console.error('快捷悬浮球加载失败', error); resolveMenu(null) })
    const badge = document.querySelector('.subject-home header .badge')
    if (badge) badge.textContent = '考研 Agent 内置研习室'
  })
})()
