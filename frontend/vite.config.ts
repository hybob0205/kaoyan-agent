import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

async function offlineAssets(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? offlineAssets(path) : [path]
  }))
  return nested.flat()
}

export default defineConfig({
  build: { rollupOptions: { input: { app: join(process.cwd(), 'index.html'), settings: join(process.cwd(), 'model-settings.html') } } },
  plugins: [react(), {
    name: 'offline-study-shell',
    apply: 'build',
    async closeBundle() {
      const root = join(process.cwd(), 'dist')
      const files = (await offlineAssets(root)).filter((path) => /\.(?:html|js|css|json|woff2?|ttf|png|svg|webmanifest)$/.test(path) && relative(root, path).split(sep).join('/') !== 'mistake-review/sw.js')
      const hash = createHash('sha256')
      for (const path of files.sort()) hash.update(await readFile(path))
      const assets = files.map((path) => '/' + relative(root, path).split(sep).join('/'))
      const script = `const CACHE='kaoyan-static-${hash.digest('hex').slice(0, 12)}';\nconst ASSETS=${JSON.stringify(assets)};\n`
        + `self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())) });\n`
        + `self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kaoyan-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())) });\n`
        + `self.addEventListener('fetch', event => { const request=event.request; const url=new URL(request.url); if(request.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/api/')) return; event.respondWith(caches.open(CACHE).then(async cache => { const saved=await cache.match(request,{ignoreSearch:true}); if(saved) return saved; try { const response=await fetch(request); if(response.ok) cache.put(request,response.clone()); return response } catch { if(request.mode==='navigate') return cache.match('/index.html'); throw Error('offline asset unavailable') } })) });\n`
      await writeFile(join(root, 'sw.js'), script)
    },
  }],
  server: {
    host: '127.0.0.1', port: 5175, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8003', changeOrigin: true } },
  },
})
