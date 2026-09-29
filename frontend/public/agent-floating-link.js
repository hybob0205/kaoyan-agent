const positionKey = 'kaoyan-agent-return-position-v1'

export function enableFloatingReturn(link) {
  let saved = null
  try {
    const value = JSON.parse(localStorage.getItem(positionKey) || 'null')
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1) saved = value
  } catch { /* Ignore a malformed saved position. */ }

  const style = document.createElement('style')
  style.textContent = '.agent-home-link{position:fixed!important;right:auto!important;bottom:auto!important;z-index:9999;min-height:48px;max-width:calc(100vw - 24px);touch-action:none;user-select:none;cursor:grab}.agent-home-link.is-dragging{cursor:grabbing;box-shadow:0 12px 30px #10281f55}.agent-home-link:focus-visible{outline:3px solid #287c58;outline-offset:3px}'
  document.head.append(style)
  link.title = '拖动可调整位置；按 Alt 加方向键也可移动'

  const bounds = () => ({ maxX: Math.max(12, window.innerWidth - link.offsetWidth - 12), maxY: Math.max(16, window.innerHeight - link.offsetHeight - 64) })
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
  const place = (x, y) => {
    const { maxX, maxY } = bounds()
    link.style.left = `${clamp(x, 12, maxX)}px`
    link.style.top = `${clamp(y, 16, maxY)}px`
  }
  const remember = () => {
    const { maxX, maxY } = bounds()
    saved = { x: (parseFloat(link.style.left) - 12) / Math.max(1, maxX - 12), y: (parseFloat(link.style.top) - 16) / Math.max(1, maxY - 16) }
    try { localStorage.setItem(positionKey, JSON.stringify(saved)) } catch { /* Dragging still works without persistence. */ }
  }
  const restore = () => {
    const { maxX, maxY } = bounds()
    place(saved ? 12 + saved.x * (maxX - 12) : maxX,
      saved ? 16 + saved.y * (maxY - 16) : Math.min(maxY, Math.max(100, window.innerHeight * 0.35)))
  }
  link.style.right = 'auto'; link.style.bottom = 'auto'
  requestAnimationFrame(restore)
  window.addEventListener('resize', restore)

  let pointer = null
  let suppressClick = false
  link.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
      left: parseFloat(link.style.left) || 12, top: parseFloat(link.style.top) || 16, moved: false }
    link.setPointerCapture(event.pointerId)
  })
  link.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
    if (!pointer.moved && Math.hypot(dx, dy) < 8) return
    pointer.moved = true
    link.classList.add('is-dragging')
    place(pointer.left + dx, pointer.top + dy)
  })
  const finish = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return
    if (pointer.moved) {
      remember()
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 450)
    }
    pointer = null
    link.classList.remove('is-dragging')
  }
  link.addEventListener('pointerup', finish)
  link.addEventListener('pointercancel', finish)
  link.addEventListener('click', (event) => {
    if (!suppressClick) return
    event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false
  }, true)
  link.addEventListener('keydown', (event) => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    place((parseFloat(link.style.left) || 12) + (event.key === 'ArrowLeft' ? -24 : event.key === 'ArrowRight' ? 24 : 0),
      (parseFloat(link.style.top) || 16) + (event.key === 'ArrowUp' ? -24 : event.key === 'ArrowDown' ? 24 : 0))
    remember()
  })
  const editable = (element) => element instanceof Element && Boolean(element.closest('input, textarea, [contenteditable="true"]'))
  document.addEventListener('focusin', (event) => { if (editable(event.target)) { link.style.visibility = 'hidden'; link.style.pointerEvents = 'none' } })
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!editable(document.activeElement)) { link.style.visibility = ''; link.style.pointerEvents = '' }
  }, 0))
}
