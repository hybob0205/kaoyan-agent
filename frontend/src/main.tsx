import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Capacitor } from '@capacitor/core'
import { applyNativeTheme, readTheme } from './components/ThemeButton'

if (Capacitor.isNativePlatform()) localStorage.setItem('kaoyan-agent-run-mode-v1', 'device')
const designSheet = document.querySelector('link[href="/agent-design.css"]')
if (designSheet) document.head.append(designSheet)
const webDesignSheet = document.querySelector('link[href="/web-design.css"]')
if (webDesignSheet) document.head.append(webDesignSheet)
document.documentElement.dataset.theme = readTheme()
applyNativeTheme(readTheme())

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && window.isSecureContext && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
    registrations.filter((registration) => new URL(registration.scope).pathname === '/mistake-review/')
      .map((registration) => registration.unregister()),
  )).catch(() => undefined)
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}
