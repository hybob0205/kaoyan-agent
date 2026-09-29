import { useEffect, useRef } from 'react'

export default function AgentFloatingMenu({ onHome }: { onHome?: () => void }) {
  const homeAction = useRef(onHome)
  homeAction.current = onHome
  useEffect(() => {
    let disposed = false
    let destroy: (() => void) | undefined
    const modulePath = new URL('/agent-floating-menu.js', window.location.origin).href
    void import(/* @vite-ignore */ modulePath).then(({ createFloatingMenu }) => {
      if (disposed) return
      const home = document.createElement('a')
      home.href = '/'
      home.setAttribute('aria-label', '返回考研 Agent 首页')
      home.onclick = event => { if (homeAction.current) { event.preventDefault(); homeAction.current() } }
      const menu = createFloatingMenu(home)
      for (const [href, title] of [['/study-hub/index.html', '去四科研习室'], ['/mistake-review/index.html', '去拾错']]) {
        const link = document.createElement('a')
        link.href = href
        menu.addAction(link, title)
      }
      destroy = menu.destroy
    }).catch(error => console.error('快捷操作加载失败', error))
    return () => { disposed = true; destroy?.() }
  }, [])
  return null
}
