const positionKey = 'kaoyan-agent-return-position-v1'

export function createFloatingMenu(homeLink, { home = true, top: includeTop = false } = {}) {
  const controller = new AbortController()
  const options = { signal: controller.signal }
  const shell = document.createElement('div')
  shell.className = 'agent-float-menu'
  const ball = document.createElement('button')
  ball.type = 'button'
  ball.className = 'agent-float-ball'
  ball.setAttribute('aria-label', '打开快捷操作')
  ball.setAttribute('aria-expanded', 'false')
  ball.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 11C6 7 9 2 12 2s6 5 0 9Zm1 1c4-6 9-3 9 0s-5 6-9 0Zm-1 1c6 4 3 9 0 9s-6-5 0-9Zm-1-1c-4 6-9 3-9 0s5-6 9 0Z"/></svg>'
  const actions = document.createElement('div')
  actions.className = 'agent-float-actions'
  shell.append(actions, ball)
  document.body.append(shell)
  const style = document.createElement('style')
  style.textContent = `.agent-float-menu{position:fixed;z-index:10000;width:56px;height:56px;touch-action:none;user-select:none;opacity:0;animation:agent-ball-in .38s cubic-bezier(.16,1,.3,1) both}.agent-float-menu.is-ready{opacity:1}.agent-float-ball{position:relative;z-index:2;width:56px;height:56px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#173f32;color:#fff;box-shadow:0 10px 26px #10281f42;cursor:grab;transition:transform .2s cubic-bezier(.16,1,.3,1),background .2s,box-shadow .2s}.agent-float-ball svg{width:24px;height:24px;transition:transform .22s}.agent-float-menu.is-open .agent-float-ball{background:#235d47;box-shadow:0 13px 30px #10281f55}.agent-float-menu.is-open .agent-float-ball svg{transform:rotate(90deg)}.agent-float-menu.is-dragging .agent-float-ball{cursor:grabbing;transform:scale(1.08)}.agent-float-menu .agent-float-action{position:absolute!important;z-index:1;left:0!important;top:0!important;right:auto!important;bottom:auto!important;display:inline-flex!important;align-items:center;justify-content:center;width:max-content;max-width:min(176px,48vw);min-height:44px!important;padding:8px 13px!important;border:1px solid #bdd1c2!important;border-radius:999px!important;background:#fff!important;color:#173f32!important;box-shadow:0 8px 24px #10281f2b!important;font:650 13px/1.35 system-ui,sans-serif!important;text-decoration:none!important;white-space:normal;text-align:center;opacity:0;pointer-events:none;transform:translate(0,0) scale(.72);transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .18s}.agent-float-menu.is-open .agent-float-action{opacity:1;pointer-events:auto;transform:translate(var(--float-x),var(--float-y)) scale(1)}.agent-float-menu .agent-float-action:focus-visible,.agent-float-ball:focus-visible{outline:3px solid #76bd91;outline-offset:3px}.agent-float-menu .agent-float-action:hover{background:#eaf2eb!important}@keyframes agent-ball-in{from{opacity:0;transform:scale(.78)}to{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.agent-float-menu{animation:none;opacity:1}.agent-float-menu .agent-float-action,.agent-float-ball,.agent-float-ball svg{transition-duration:.01ms}}#back-to-top,#backToTop{display:none!important}`
  style.textContent += '.agent-float-menu .agent-float-action{width:76px!important;max-width:76px!important;height:76px!important;min-height:76px!important;padding:8px!important;border-radius:50%!important;line-height:1.25!important;word-break:break-word}.agent-float-menu.is-open .agent-float-action{transition-delay:var(--float-delay)}'
  // Keep pressed actions at their radial position; global button feedback must not move the hit target.
  style.textContent += '.agent-float-menu.is-open .agent-float-action,.agent-float-menu.is-open .agent-float-action:active{transform:translate(var(--float-x),var(--float-y)) scale(1)!important;touch-action:manipulation}'
  document.head.append(style)

  let saved = null
  try {
    const value = JSON.parse(localStorage.getItem(positionKey) || 'null')
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1) saved = value
  } catch { /* Ignore invalid position. */ }
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n))
  const bounds = () => ({ x: Math.max(12, innerWidth - 68), y: Math.max(16, innerHeight - 72 - 56) })
  const place = (x, y) => {
    const max = bounds()
    shell.style.left = `${clamp(x, 12, max.x)}px`
    shell.style.top = `${clamp(y, 16, max.y)}px`
    layout()
  }
  const remember = () => {
    const max = bounds()
    saved = { x: (parseFloat(shell.style.left) - 12) / Math.max(1, max.x - 12), y: (parseFloat(shell.style.top) - 16) / Math.max(1, max.y - 16) }
    try { localStorage.setItem(positionKey, JSON.stringify(saved)) } catch { /* Position still works for this session. */ }
  }
  const restore = () => {
    const max = bounds()
    place(saved ? 12 + saved.x * (max.x - 12) : max.x, saved ? 16 + saved.y * (max.y - 16) : max.y)
    shell.classList.add('is-ready')
  }
  const setOpen = (open) => {
    shell.classList.toggle('is-open', open)
    ball.setAttribute('aria-expanded', String(open))
    ball.setAttribute('aria-label', open ? '关闭快捷操作' : '打开快捷操作')
    ball.querySelector('svg').innerHTML = open ? '<path d="M11 3h2v8h8v2h-8v8h-2v-8H3v-2h8Z"/>' : '<path d="M12 11C6 7 9 2 12 2s6 5 0 9Zm1 1c4-6 9-3 9 0s-5 6-9 0Zm-1 1c6 4 3 9 0 9s-6-5 0-9Zm-1-1c-4 6-9 3-9 0s5-6 9 0Z"/>'
    actions.inert = !open
    for (const action of actions.children) action.tabIndex = open ? 0 : -1
    if (open) layout()
  }
  function layout() {
    const nodes = [...actions.children]
    const rightSide = (parseFloat(shell.style.left) || 0) > innerWidth / 2
    const bottomSide = (parseFloat(shell.style.top) || 0) > innerHeight / 2
    const start = rightSide ? bottomSide ? 180 : 90 : bottomSide ? 270 : 0
    const step = 90 / Math.max(1, nodes.length - 1)
    nodes.forEach((node, i) => {
      const angle = (start + step * i) * Math.PI / 180
      const radius = nodes.length > 3 ? 158 : 136
      const x = (parseFloat(shell.style.left) || 0) + 28 + Math.cos(angle) * radius - node.offsetWidth / 2
      const y = (parseFloat(shell.style.top) || 0) + 28 + Math.sin(angle) * radius - node.offsetHeight / 2
      const absoluteX = clamp(x, 8, innerWidth - node.offsetWidth - 8)
      const absoluteY = clamp(y, 8, innerHeight - node.offsetHeight - 8)
      node.style.setProperty('--float-x', `${absoluteX - (parseFloat(shell.style.left) || 0)}px`)
      node.style.setProperty('--float-y', `${absoluteY - (parseFloat(shell.style.top) || 0)}px`)
      node.style.setProperty('--float-delay', `${i * 30}ms`)
    })
  }
  const addAction = (node, label, activate) => {
    node.classList.add('agent-float-action')
    node.textContent = label || node.textContent
    node.tabIndex = -1
    actions.append(node)
    actions.inert = !shell.classList.contains('is-open')
    node.addEventListener('click', (event) => { setOpen(false); if (activate) activate(event) })
    layout()
  }
  if (home) addAction(homeLink, 'Agent 首页')
  else homeLink.remove()
  const top = document.createElement('button')
  top.type = 'button'
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }))
  if (includeTop) addAction(top, '顶部')

  let pointer = null
  let suppressDragClick = false
  ball.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    suppressDragClick = false
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: parseFloat(shell.style.left), top: parseFloat(shell.style.top), moved: false }
  })
  ball.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId || !event.buttons) return
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
    if (!pointer.moved && Math.hypot(dx, dy) < 12) return
    if (!pointer.moved) ball.setPointerCapture(event.pointerId)
    pointer.moved = true
    shell.classList.add('is-dragging')
    setOpen(false)
    place(pointer.left + dx, pointer.top + dy)
  })
  const finish = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return
    if (pointer.moved) {
      remember()
      suppressDragClick = true
    }
    pointer = null
    shell.classList.remove('is-dragging')
  }
  ball.addEventListener('pointerup', finish)
  ball.addEventListener('pointercancel', finish)
  ball.addEventListener('click', (event) => {
    if (suppressDragClick && event.detail !== 0) { suppressDragClick = false; return }
    suppressDragClick = false
    setOpen(!shell.classList.contains('is-open'))
  })
  ball.addEventListener('keydown', (event) => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    place((parseFloat(shell.style.left) || 12) + (event.key === 'ArrowLeft' ? -24 : event.key === 'ArrowRight' ? 24 : 0),
      (parseFloat(shell.style.top) || 16) + (event.key === 'ArrowUp' ? -24 : event.key === 'ArrowDown' ? 24 : 0))
    remember()
  })
  document.addEventListener('pointerdown', (event) => { if (!shell.contains(event.target)) setOpen(false) }, options)
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false) }, options)
  document.addEventListener('focusin', (event) => { if (event.target.closest('input,textarea,[contenteditable="true"]')) { setOpen(false); shell.hidden = true } }, options)
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.closest('input,textarea,[contenteditable="true"]')) shell.hidden = false }, 0), options)
  window.addEventListener('resize', restore, options)
  const frame = requestAnimationFrame(restore)
  return { addAction, close: () => setOpen(false), destroy: () => { controller.abort(); cancelAnimationFrame(frame); shell.remove(); style.remove() } }
}
