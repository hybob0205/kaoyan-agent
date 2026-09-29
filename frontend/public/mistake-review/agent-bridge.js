(() => {
  function currentUserId() {
    try {
      const token = localStorage.getItem('kaoyan-agent-token-v1')
      const payload = token && JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      return payload && Number.isInteger(Number(payload.sub)) && payload.exp * 1000 > Date.now()
        ? String(payload.sub) : ''
    } catch { return '' }
  }

  const deviceMode = localStorage.getItem('kaoyan-agent-run-mode-v1') === 'device'
  const userId = deviceMode ? 'device' : currentUserId()
  if (!userId) {
    location.replace('/')
    return
  }
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('span')
    container.className = 'theme-control'
    const topbar = document.createElement('div')
    topbar.className = 'mistake-topbar'
    const back = document.createElement('a')
    back.href = '/'
    back.className = 'agent-inline-back'
    back.setAttribute('aria-label', '返回 Agent 首页')
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h14" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    topbar.append(back)
    const brand = document.querySelector('.sidebar .brand')
    if (brand) topbar.append(brand)
    topbar.append(container)
    const settings = document.getElementById('settingsBtn')
    if (settings) {
      settings.setAttribute('aria-label', '模型设置')
      settings.title = '模型设置'
      topbar.append(settings)
    }
    document.querySelector('.sidebar')?.prepend(topbar)
    window.KaoyanTheme.mount(container)
  })
  window.MISTAKE_USER_NAMESPACE = userId
  if (window.Capacitor?.isNativePlatform?.()) {
    window.KAOYAN_ANDROID_BACK = () => {
      const dialogs = document.querySelectorAll('dialog[open]')
      const dialog = dialogs[dialogs.length - 1]
      if (dialog) {
        if (dialog.id === 'cropDialog' && typeof window.resolveCrop === 'function') window.resolveCrop(null)
        else if (dialog.id === 'detailDialog' && typeof window.closeDetail === 'function') window.closeDetail()
        else dialog.close()
        return true
      }
      if (location.hash && location.hash !== '#home') {
        if (typeof window.home === 'function') window.home()
        else history.back()
        return true
      }
      return false
    }
  }
  if (deviceMode && window.Capacitor?.isNativePlatform?.() && window.Capacitor.nativePromise) {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.endsWith('/chat/completions') || !init || String(init.method || 'GET').toUpperCase() !== 'POST') return originalFetch(input, init)
      const body = JSON.parse(String(init.body || '{}'))
      if (body.stream === true) {
        let listener
        let closed = false
        const id = crypto.randomUUID()
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            try {
              listener = window.Capacitor.addListener('ModelStream', 'streamEvent', (event) => {
                if (closed || event.id !== id) return
                if (event.type === 'error') { closed = true; controller.error(new Error(event.data || '模型连接中断')); void listener?.remove(); return }
                if (event.type === 'done') { closed = true; controller.close(); void listener?.remove(); return }
                let payload = event.data
                if (event.type === 'json') {
                  try {
                    const parsed = JSON.parse(payload)
                    const content = parsed.choices?.[0]?.message?.content
                    if (typeof content !== 'string') throw new Error('模型没有返回可读取的回答')
                    payload = JSON.stringify({ choices: [{ delta: { content } }] })
                  } catch (error) { closed = true; controller.error(error); void listener?.remove(); return }
                }
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
              })
              await window.Capacitor.nativePromise('ModelStream', 'start', { id, url, headers: { ...init.headers, Accept: 'text/event-stream, application/json' }, body: JSON.stringify(body) })
            } catch (error) { if (!closed) { closed = true; controller.error(error) } void listener?.remove() }
          },
          cancel() { closed = true; void listener?.remove() },
        })
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
      }
      const response = await window.Capacitor.nativePromise('CapacitorHttp', 'request', {
        url, method: 'POST', headers: { ...init.headers, Accept: 'application/json' }, data: body,
        connectTimeout: 15000, readTimeout: 90000,
      })
      return new Response(typeof response.data === 'string' ? response.data : JSON.stringify(response.data), {
        status: response.status, headers: { 'Content-Type': 'application/json' },
      })
    }
  }
  window.AGENT_DATA_READY = deviceMode ? Promise.resolve() : import('/agent-sync.js?v=1').then(() => window.AGENT_SYNC_BOOT).catch(() => {
    window.AGENT_DATA_CHANGED = undefined
    document.addEventListener('DOMContentLoaded', () => alert('电脑端同步脚本加载失败；当前记录只保存在此浏览器。'))
  })
  window.AGENT_DATA_READY.then(() => {
    if (!window.AGENT_LAN_MODE) return
    const caption = document.querySelector('.side-bottom')
    if (caption) caption.innerHTML = '<span class="local-dot"></span>记录同步到你的电脑<br><small>请定期导出备份</small>'
  })
  document.addEventListener('DOMContentLoaded', () => {
    const sourceDbKey = `shicuo-agent-${userId}:shicuo-mistakes-v1`
    function decorateHubSources() {
      let sources = new Map()
      try { sources = new Map((JSON.parse(localStorage.getItem(sourceDbKey) || '[]') || [])
        .filter((item) => item?.hubSourceUrl?.startsWith('/study-hub/') && item.hubSourceId)
        .map((item) => [item.id, item])) } catch { return }
      document.querySelectorAll('.mistake-card[data-card-id]').forEach((card) => {
        const item = sources.get(card.dataset.cardId)
        if (!item || card.querySelector('.hub-source-link')) return
        const link = document.createElement('a')
        link.className = 'hub-source-link'
        link.href = item.hubSourceUrl
        link.textContent = `来源：研习室 · ${item.hubSourceTitle || item.subject} ↗`
        card.querySelector('.card-meta')?.append(link)
      })
      const dialog = document.querySelector('#detailDialog')
      const item = sources.get(dialog?.querySelector('[name="id"]')?.value)
      let link = dialog?.querySelector('.hub-detail-source')
      if (item && !link) {
        link = document.createElement('a')
        link.className = 'hub-detail-source'
        dialog.querySelector('#detailMessage')?.after(link)
      }
      if (link) {
        link.hidden = !item
        if (item) { link.href = item.hubSourceUrl; link.textContent = `来源：考研研习室 · ${item.hubSourceTitle || item.subject}（返回原练习）` }
      }
    }
    let sourcePending = false
    const observer = new MutationObserver(() => {
      if (sourcePending) return
      sourcePending = true
      requestAnimationFrame(() => { sourcePending = false; decorateHubSources() })
    })
    observer.observe(document.body, { subtree: true, childList: true })
    decorateHubSources()
    window.addEventListener('storage', (event) => { if (event.key === sourceDbKey) location.reload() })
    if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.nativePromise) {
      document.addEventListener('click', async (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('#choosePhoto, #addCameraPhoto')) return
        event.preventDefault()
        event.stopImmediatePropagation()
        try {
          const photo = await window.Capacitor.nativePromise('Camera', 'getPhoto', {
            source: 'CAMERA', resultType: 'dataUrl', quality: 85, correctOrientation: true,
          })
          if (!photo.dataUrl) throw new Error('相机没有返回照片')
          const blob = await fetch(photo.dataUrl).then((response) => response.blob())
          const transfer = new DataTransfer()
          transfer.items.add(new File([blob], 'camera.jpg', { type: blob.type || 'image/jpeg' }))
          const input = document.getElementById('captureInput')
          input.files = transfer.files
          input.dispatchEvent(new Event('change', { bubbles: true }))
        } catch (error) {
          if (/cancel/i.test(String(error?.message || error))) return
          alert(`无法打开相机：${error?.message || error}`)
        }
      }, true)
    }
    if (deviceMode) {
      const note = document.createElement('details')
      note.className = 'agent-device-note'
      const summary = document.createElement('summary')
      summary.textContent = '本机保存与 AI 使用说明'
      const text = document.createElement('p')
      text.textContent = window.Capacitor?.isNativePlatform?.()
        ? '本设备独立模式：记录保存在这里。联网后可使用已配置的模型接口进行 AI 分析、对话和复习计划。'
        : '本设备独立模式：记录保存在这里。联网后可使用已配置的模型接口进行 AI 分析、对话和复习计划；接口需允许浏览器跨域访问。'
      note.append(summary, text)
      document.querySelector('main')?.append(note)
      const caption = document.querySelector('.side-bottom')
      if (caption) caption.textContent = '记录保存在本设备浏览器 · 请定期导出备份'
    }
    const link = document.createElement('a')
    link.href = '/'
    link.textContent = '← 返回考研 Agent'
    link.className = 'agent-home-link'
    link.setAttribute('aria-label', '返回考研 Agent 首页')
    const style = document.createElement('style')
    style.textContent = '.agent-home-link{position:fixed;right:16px;bottom:70px;z-index:9999;display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border:1px solid #264b3a;border-radius:999px;background:#173f32;color:#fff!important;font:600 13px/1.4 system-ui,sans-serif;text-decoration:none!important;box-shadow:0 8px 24px #10281f44}.agent-home-link:hover,.agent-home-link:focus-visible{background:#27634c;outline:2px solid #fff;outline-offset:2px}.agent-device-note{margin:0 0 16px;padding:12px 14px;border-left:3px solid #27634c;background:#eef4ee;color:#264b3a;font:14px/1.6 system-ui,sans-serif}.hub-source-link,.hub-detail-source{display:inline-block;color:#1d6548!important;text-decoration:underline!important;font:600 13px/1.5 system-ui,sans-serif}.hub-detail-source{margin:8px 0 12px}@media(max-width:720px){.agent-home-link{right:12px;bottom:calc(60px + env(safe-area-inset-bottom))}}'
    document.head.append(style)
    document.body.append(link)
    window.AGENT_FLOATING_MENU_READY = import('/agent-floating-menu.js?v=2').then(({ createFloatingMenu }) => {
      const menu = createFloatingMenu(link, { home: true, top: false })
      const hub = document.createElement('a')
      hub.href = '/study-hub/index.html'
      menu.addAction(hub, '去四科研习室')
      const ask = document.createElement('button')
      ask.type = 'button'
      const openChat = () => {
        if (typeof window.SHICUO_OPEN_CHAT === 'function') window.SHICUO_OPEN_CHAT()
        else alert('拾错正在加载，请稍后再试；若持续出现，请刷新页面。')
      }
      menu.addAction(ask, '问拾错 AI', openChat)
      return menu
    }).catch((error) => console.error('快捷悬浮球加载失败', error))
  })
  window.addEventListener('pageshow', () => {
    if ((localStorage.getItem('kaoyan-agent-run-mode-v1') === 'device') !== deviceMode || (!deviceMode && currentUserId() !== userId)) location.replace('/')
  })
  window.addEventListener('storage', (event) => {
    if (event.key === 'kaoyan-agent-run-mode-v1' || (!deviceMode && event.key === 'kaoyan-agent-token-v1' && currentUserId() !== userId)) location.replace('/')
  })
})()
