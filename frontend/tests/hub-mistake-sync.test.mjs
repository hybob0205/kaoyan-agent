import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncHubMistakes } from '../public/study-hub/agent-integration.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }
}

test('wrong hub question imports once into mistake review with a source link', () => {
  globalThis.localStorage = storage({ 'math2-study-v1-agent-device': JSON.stringify({ records: { q1: { wrong: true, answer: 'B', cause: '忘记定义域' } } }) })
  globalThis.document = { createElement: () => ({ set innerHTML(value) { this.textContent = String(value).replace(/<[^>]+>/g, '') }, textContent: '' }) }
  globalThis.window = { STUDY: { questions: [{ id: 'q1', number: 1, body: '求极限', options: ['1', '2'], answer: 'B', chapter: 'limit' }] }, AGENT_DATA_CHANGED: () => {} }
  assert.equal(syncHubMistakes('device', 'math2'), 1)
  const first = JSON.parse(localStorage.getItem('shicuo-agent-device:shicuo-mistakes-v1'))
  assert.equal(first[0].hubSourceId, 'math2:q1')
  assert.equal(first[0].hubSourceUrl, '/study-hub/math.html#question/q1')
  assert.equal(first[0].cause, '忘记定义域')
  assert.equal(syncHubMistakes('device', 'math2'), 0)
  assert.equal(JSON.parse(localStorage.getItem('shicuo-agent-device:shicuo-mistakes-v1')).length, 1)
})

test('408 wrong question imports into mistake review with its source', () => {
  globalThis.localStorage = storage({ 'cs408-study-v1-agent-device': JSON.stringify({ records: { 'cs-choice-1': { wrong: true, answer: 'A', notes: '混淆栈和队列' } } }) })
  globalThis.document = { createElement: () => ({ set innerHTML(value) { this.textContent = String(value).replace(/<[^>]+>/g, '') }, textContent: '' }) }
  globalThis.window = { CS408: { questions: [{ id: 'cs-choice-1', number: 1, subject: 'ds', prompt: '栈遵循什么顺序？', options: ['先进先出', '后进先出', '随机', '无序'], answer: 'B', explanation: '后进先出' }] }, AGENT_DATA_CHANGED: () => {} }
  assert.equal(syncHubMistakes('device', 'cs408'), 1)
  const item = JSON.parse(localStorage.getItem('shicuo-agent-device:shicuo-mistakes-v1'))[0]
  assert.equal(item.subject, '408')
  assert.equal(item.hubSourceUrl, '/study-hub/cs408.html#review')
  assert.equal(item.cause, '混淆栈和队列')
})
