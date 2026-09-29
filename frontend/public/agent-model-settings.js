export function openModelSettings() {
  if (document.querySelector('.agent-model-frame')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'agent-model-frame'
  dialog.setAttribute('aria-label', '模型设置')
  const close = document.createElement('button')
  close.textContent = '关闭设置'
  close.type = 'button'
  close.onclick = () => dialog.close()
  const frame = document.createElement('iframe')
  frame.title = '模型设置'
  frame.src = '/model-settings.html'
  dialog.append(close, frame)
  const receive = event => { if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'kaoyan-close-model-settings') dialog.close() }
  window.addEventListener('message', receive)
  dialog.addEventListener('close', () => { window.removeEventListener('message', receive); dialog.remove() }, { once: true })
  document.body.append(dialog)
  dialog.showModal()
}
