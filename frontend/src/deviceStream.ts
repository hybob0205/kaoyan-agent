import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

type StreamEvent = { id: string; type: 'data' | 'json' | 'error' | 'done'; data: string }
type NativeStream = {
  addListener(event: 'streamEvent', callback: (event: StreamEvent) => void): Promise<PluginListenerHandle>
  start(options: { id: string; url: string; headers: Record<string, string>; body: string }): Promise<void>
}

const nativeStream = registerPlugin<NativeStream>('ModelStream')

function contentFromPayload(payload: string): string {
  const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: unknown }; message?: { content?: unknown } }[]; error?: { message?: string } }
  if (parsed.error) throw new Error(parsed.error.message || '模型接口返回错误')
  const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

export function createSseParser(onData: (payload: string) => void) {
  let buffer = ''
  let pendingCR = false
  function consume(block: string) {
    const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
    if (data) onData(data)
  }
  return {
    push(chunk: string) {
      let combined = (pendingCR ? '\r' : '') + chunk
      pendingCR = combined.endsWith('\r')
      if (pendingCR) combined = combined.slice(0, -1)
      buffer += combined.replace(/\r\n?/g, '\n')
      let cut: number
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, cut))
        buffer = buffer.slice(cut + 2)
      }
    },
    finish() { if (pendingCR) buffer += '\n'; if (buffer.trim()) consume(buffer); buffer = ''; pendingCR = false },
  }
}

export async function streamDeviceChat(url: string, headers: Record<string, string>, body: object, onDelta: (text: string) => void): Promise<string> {
  let answer = ''
  const accept = (payload: string) => {
    if (payload === '[DONE]') return
    const delta = contentFromPayload(payload)
    if (delta) { answer += delta; onDelta(answer) }
  }
  if (Capacitor.isNativePlatform()) {
    const id = crypto.randomUUID()
    let listener: PluginListenerHandle | undefined
    let settled = false
    try {
      await new Promise<void>(async (resolve, reject) => {
        try {
          listener = await nativeStream.addListener('streamEvent', (event) => {
            if (event.id !== id || settled) return
            try {
              if (event.type === 'error') throw new Error(event.data || '模型连接中断')
              if (event.type === 'data' || event.type === 'json') accept(event.data)
              if (event.type === 'done') { settled = true; resolve() }
            } catch (error) { settled = true; reject(error) }
          })
          await nativeStream.start({ id, url, headers, body: JSON.stringify(body) })
        } catch (error) { settled = true; reject(error) }
      })
    } finally { await listener?.remove() }
  } else {
    const response = await fetch(url, { method: 'POST', headers: { ...headers, Accept: 'text/event-stream, application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`模型接口返回 ${response.status}`)
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      if (!response.body) throw new Error('当前浏览器不支持流式读取')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const parser = createSseParser(accept)
      while (true) {
        const { done, value } = await reader.read()
        parser.push(decoder.decode(value, { stream: !done }))
        if (done) break
      }
      parser.finish()
    } else accept(await response.text())
  }
  if (!answer.trim()) throw new Error('模型没有返回可读取的回答')
  return answer.trim()
}
