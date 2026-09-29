import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSseParser, streamDeviceChat } from '../src/deviceStream.ts'

test('SSE parser joins UTF-8 decoded chunk boundaries and multi-line data', () => {
  const events = []
  const parser = createSseParser((payload) => events.push(payload))
  parser.push('event: message\r\ndata: {"choices":[{"delta":{"content":"你')
  parser.push('好"}}]}\r\n\r\ndata: [DO')
  parser.push('NE]\n\n')
  parser.finish()
  assert.deepEqual(events, ['{"choices":[{"delta":{"content":"你好"}}]}', '[DONE]'])
})

test('SSE parser handles CRLF split between network chunks', () => {
  const events = []
  const parser = createSseParser((payload) => events.push(payload))
  parser.push('data: one\r')
  parser.push('\n\r')
  parser.push('\ndata: two\n\n')
  parser.finish()
  assert.deepEqual(events, ['one', 'two'])
})

test('browser chat displays real response chunks before completion', async () => {
  const originalFetch = globalThis.fetch
  const chunks = []
  const encoder = new TextEncoder()
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'))
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第二段"}}]}\n\ndata: [DONE]\n\n'))
      controller.close()
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
  try {
    const answer = await streamDeviceChat('https://example.test/v1/chat/completions', {}, { stream: true }, (text) => chunks.push(text))
    assert.equal(answer, '第一段第二段')
    assert.deepEqual(chunks, ['第一段', '第一段第二段'])
  } finally { globalThis.fetch = originalFetch }
})
