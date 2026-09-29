/* Shared by React, the four-subject study room and mistake review. */
(() => {
  // Follow the visible viewport, including mobile keyboards. Native insets resize
  // the WebView; browsers that only resize visualViewport use the same CSS values.
  let viewportFrame
  const syncViewport = () => {
    cancelAnimationFrame(viewportFrame)
    viewportFrame = requestAnimationFrame(() => {
      const viewport = window.visualViewport
      document.documentElement.style.setProperty('--visible-height', `${viewport?.height || innerHeight}px`)
      document.documentElement.style.setProperty('--visible-top', `${viewport?.offsetTop || 0}px`)
    })
  }
  window.visualViewport?.addEventListener('resize', syncViewport)
  window.visualViewport?.addEventListener('scroll', syncViewport)
  window.addEventListener('resize', syncViewport)
  syncViewport()
  const key = 'kaoyan-study-theme'
  const choices = [['light', '日间'], ['paper', '纸张'], ['night', '夜间'], ['system', '跟随系统']]
  const media = matchMedia('(prefers-color-scheme: dark)')
  const read = () => { try { const saved = localStorage.getItem(key); return choices.some(([id]) => id === saved) ? saved : 'paper' } catch { return 'paper' } }
  let preference = read()
  const resolved = () => preference === 'system' ? (media.matches ? 'night' : 'light') : preference
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4L19 5" stroke-linecap="round"/></svg>'
  function apply() {
    const theme = resolved()
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.themePreference = preference
    document.documentElement.style.colorScheme = theme === 'night' ? 'dark' : 'light'
    const color = { light: '#f7f8f4', paper: '#f4f2ea', night: '#121e1a' }[theme]
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta) }
    meta.content = color
    if (window.Capacitor?.nativePromise) window.Capacitor.nativePromise('ThemeBars', 'setTheme', { theme }).catch(() => {})
    document.querySelectorAll('.theme-picker').forEach(picker => {
      picker.querySelector('summary').setAttribute('aria-label', `主题：${choices.find(([id]) => id === preference)[1]}，打开主题设置`)
      picker.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference)))
    })
  }
  function set(value) {
    if (!choices.some(([id]) => id === value)) return
    preference = value
    try { localStorage.setItem(key, value) } catch { /* The selection still applies in this page. */ }
    apply()
    window.dispatchEvent(new Event('kaoyan-theme-change'))
  }
  function mount(container) {
    const picker = document.createElement('details')
    picker.className = 'theme-picker'
    picker.innerHTML = `<summary>${icon}<span>主题</span></summary><div class="theme-options" role="group" aria-label="选择外观主题">${choices.map(([id, label]) => `<button type="button" data-theme-choice="${id}" aria-pressed="false"><i class="theme-swatch ${id}" aria-hidden="true"></i>${label}<span class="theme-check" aria-hidden="true">✓</span></button>`).join('')}</div>`
    const select = event => {
      const button = event.target.closest('[data-theme-choice]')
      if (!button) return
      set(button.dataset.themeChoice)
      picker.open = false
      picker.querySelector('summary').focus()
    }
    const outside = event => { if (!picker.contains(event.target)) picker.open = false }
    const escape = event => { if (event.key === 'Escape' && picker.open) { picker.open = false; picker.querySelector('summary').focus() } }
    picker.addEventListener('click', select)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    container.append(picker)
    apply()
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); picker.remove() }
  }
  window.KaoyanTheme = { mount, set, apply, read: () => preference, resolved }
  document.documentElement.dataset.app = location.pathname.startsWith('/study-hub/') ? 'study' : location.pathname.startsWith('/mistake-review/') ? 'mistake' : 'agent'
  apply()
  media.addEventListener('change', () => { if (preference === 'system') { apply(); window.dispatchEvent(new Event('kaoyan-theme-change')) } })
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) { preference = read(); apply(); window.dispatchEvent(new Event('kaoyan-theme-change')) } })
  document.addEventListener('DOMContentLoaded', apply)
  document.addEventListener('DOMContentLoaded', () => {
    const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/concept-finish.css'; document.head.append(sheet)
  }, { once: true })
})()
