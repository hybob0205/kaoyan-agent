import { useEffect, useRef } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
type Theme = 'light' | 'paper' | 'night'
declare global {
  interface Window {
    KaoyanTheme: { mount(container: HTMLElement): () => void; set(theme: Theme | 'system'): void; apply(): void; read(): Theme | 'system'; resolved(): Theme }
  }
}
const themeBars = registerPlugin<{ setTheme(options: { theme: Theme }): Promise<void> }>('ThemeBars')
export function applyNativeTheme(theme: Theme) {
  if (Capacitor.isNativePlatform()) void themeBars.setTheme({ theme }).catch(() => undefined)
}
export function readTheme(): Theme { return window.KaoyanTheme.resolved() }
export default function ThemeButton({ className = '' }: { className?: string }) {
  const container = useRef<HTMLSpanElement>(null)
  useEffect(() => container.current ? window.KaoyanTheme.mount(container.current) : undefined, [])
  return <span ref={container} className={`theme-control ${className}`} />
}
