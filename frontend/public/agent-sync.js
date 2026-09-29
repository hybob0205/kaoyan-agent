/* Shared browser cache for the computer-hosted LAN edition. The computer is authoritative. */
(() => {
  const appId = location.pathname.startsWith('/mistake-review/') ? 'mistake-review' : 'study-hub'
  const userId = appId === 'mistake-review' ? window.MISTAKE_USER_NAMESPACE : window.HUB_USER_NAMESPACE
  const token = localStorage.getItem('kaoyan-agent-token-v1')
  if (!userId || !token) {
    window.AGENT_SYNC_BOOT = Promise.resolve()
    return
  }
  const markerKey = `agent-live-sync-${appId}-${userId}`
  const prefix = `shicuo-agent-${userId}:`
  const fixed = new Set(['shicuo-mistakes-v1', 'shicuo-chats-v1', 'shicuo-export-history-v1', 'shicuo-ai-review-plan-v1'].map(name => prefix + name))
  let enabled = false, version = 0, generation = 0, uploading = false, notice = null

  function allowed(key) {
    if (appId === 'study-hub') return ['math2', 'english2', 'politics', 'cs408'].some(subject => key === `${subject}-study-v1-agent-${userId}`)
    return fixed.has(key) || (key.startsWith(prefix + 'shicuo-review-count:') && key.length <= 180)
  }
  function localData() {
    const data = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && allowed(key)) data[key] = localStorage.getItem(key)
    }
    return data
  }
  function same(a, b) {
    const ak = Object.keys(a), bk = Object.keys(b)
    return ak.length === bk.length && ak.every(key => b[key] === a[key])
  }
  function marker() {
    try { return JSON.parse(localStorage.getItem(markerKey) || 'null') } catch { return null }
  }
  function saveMarker(dirty) { localStorage.setItem(markerKey, JSON.stringify({ version, dirty })) }
  function showNotice(message) {
    const display = () => {
      if (!notice) {
        notice = document.createElement('div')
        notice.setAttribute('role', 'alert')
        notice.style.cssText = 'position:fixed;z-index:9999;left:12px;right:12px;top:12px;max-width:680px;margin:auto;padding:14px 18px;border-radius:10px;background:#fff3d5;color:#583c12;box-shadow:0 8px 30px #0003;font:14px/1.6 system-ui,sans-serif'
        document.body.append(notice)
      }
      notice.textContent = message + ' 请到 Agent「个人中心 → 研习记录备份」处理。'
    }
    if (document.body) display()
    else document.addEventListener('DOMContentLoaded', display, { once: true })
  }
  function applyRemote(data) {
    if (Object.keys(data).some(key => !allowed(key))) throw Error('电脑端记录含无效数据键')
    const previous = localData()
    try {
      for (const key of Object.keys(previous)) localStorage.removeItem(key)
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value)
    } catch (error) {
      for (const key of Object.keys(data)) localStorage.removeItem(key)
      for (const [key, value] of Object.entries(previous)) localStorage.setItem(key, value)
      throw error
    }
  }
  async function request(method, body) {
    const response = await fetch(`/api/app-data/${appId}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 404 && method === 'GET') return null
    if (!response.ok) throw Error(`记录同步失败（${response.status}）`)
    return response.json()
  }
  async function flush() {
    if (!enabled || uploading) return
    uploading = true
    const sentGeneration = generation
    try {
      const saved = await request('PUT', { expected_version: version, data: localData() })
      version = saved.version
      saveMarker(generation !== sentGeneration)
      if (generation !== sentGeneration) setTimeout(flush, 0)
      if (notice) { notice.remove(); notice = null }
    } catch (error) {
      showNotice(error.message + '；本页记录仍保存在当前浏览器，尚未写入电脑')
      enabled = false
    } finally { uploading = false }
  }
  window.AGENT_DATA_CHANGED = () => {
    if (!enabled) return
    generation++
    saveMarker(true)
    clearTimeout(window.AGENT_DATA_TIMER)
    window.AGENT_DATA_TIMER = setTimeout(flush, 400)
  }
  window.AGENT_SYNC_BOOT = (async () => {
    try {
      const health = await fetch('/api/health').then(response => response.json())
      if (!health.lan_mode) return
      window.AGENT_LAN_MODE = true
      const remote = await request('GET')
      const local = localData(), old = marker()
      if (!remote) {
        version = 0
        enabled = true
        if (Object.keys(local).length) { generation++; saveMarker(true); await flush() }
        return
      }
      version = remote.version
      if (same(local, remote.data)) {
        enabled = true; saveMarker(false); return
      }
      if (old?.dirty && old.version === version) {
        enabled = true; generation++; await flush(); return
      }
      if (old?.dirty || (!old && Object.keys(local).length) || (old?.version === version && Object.keys(local).length)) {
        showNotice('当前浏览器记录与电脑端不同，已暂停同步，避免覆盖任一方')
        return
      }
      applyRemote(remote.data)
      enabled = true
      saveMarker(false)
    } catch (error) {
      showNotice(error.message + '；未覆盖当前浏览器记录')
    }
  })()
})()
