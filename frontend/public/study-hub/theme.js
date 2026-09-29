document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header')
  if (header) {
    const back = document.createElement('a')
    back.href = '/'
    back.className = 'agent-inline-back'
    back.setAttribute('aria-label', '返回 Agent 首页')
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h14" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    header.prepend(back)
    const container = document.createElement('span')
    container.className = 'theme-control'
    header.append(container)
    window.KaoyanTheme.mount(container)
  }
  const brand = document.querySelector('#sidebar .brand')
  if (brand) brand.href = 'index.html'
})
