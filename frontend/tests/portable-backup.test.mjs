import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePortableBackup, readPortableBackup, restorePortableBackup } from '../src/portableBackup.ts'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    key(index) { return [...values.keys()][index] ?? null },
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

test('portable backup moves study and mistake records between account and device namespaces', () => {
  globalThis.localStorage = storage({
    'math2-study-v1-agent-7': '{"wrong":1}',
    'shicuo-agent-7:shicuo-mistakes-v1': '[{"question":"x"}]',
    'shicuo-agent-7:shicuo-api-key': 'do-not-export',
  })
  const backup = readPortableBackup('7')
  assert.equal(backup.study_hub.math2, '{"wrong":1}')
  assert.equal(backup.mistake_review['shicuo-mistakes-v1'], '[{"question":"x"}]')
  assert.equal(JSON.stringify(backup).includes('do-not-export'), false)
  restorePortableBackup('device', parsePortableBackup(JSON.stringify(backup)))
  assert.equal(localStorage.getItem('math2-study-v1-agent-device'), '{"wrong":1}')
  assert.equal(localStorage.getItem('shicuo-agent-device:shicuo-mistakes-v1'), '[{"question":"x"}]')
  assert.equal(localStorage.getItem('math2-study-v1-agent-7'), '{"wrong":1}')
})

test('portable import rejects unknown keys before changing records', () => {
  globalThis.localStorage = storage({ 'math2-study-v1-agent-device': 'old' })
  const invalid = JSON.stringify({ format: 'kaoyan-portable-v1', study_hub: { math2: 'new' }, mistake_review: { 'api-key': 'secret' } })
  assert.throws(() => parsePortableBackup(invalid), /未知记录/)
  assert.equal(localStorage.getItem('math2-study-v1-agent-device'), 'old')
})

test('portable import restores both apps when a storage write fails', () => {
  const saved = storage({
    'math2-study-v1-agent-device': 'old-study',
    'shicuo-agent-device:shicuo-mistakes-v1': 'old-mistakes',
    'shicuo-agent-device:shicuo-api-key': 'existing-secret',
  })
  let failOnce = true
  globalThis.localStorage = {
    ...saved,
    get length() { return saved.length },
    key: (index) => saved.key(index),
    setItem(key, value) {
      if (key === 'shicuo-agent-device:shicuo-mistakes-v1' && value === 'new-mistakes' && failOnce) {
        failOnce = false
        throw new Error('QuotaExceededError')
      }
      saved.setItem(key, value)
    },
  }
  const backup = parsePortableBackup(JSON.stringify({
    format: 'kaoyan-portable-v1',
    study_hub: { math2: 'new-study' },
    mistake_review: { 'shicuo-mistakes-v1': 'new-mistakes' },
  }))
  assert.throws(() => restorePortableBackup('device', backup), /原记录已恢复/)
  assert.equal(localStorage.getItem('math2-study-v1-agent-device'), 'old-study')
  assert.equal(localStorage.getItem('shicuo-agent-device:shicuo-mistakes-v1'), 'old-mistakes')
  assert.equal(localStorage.getItem('shicuo-agent-device:shicuo-api-key'), 'existing-secret')
})

test('portable backup includes local Agent data but excludes the model key', () => {
  globalThis.localStorage = storage({
    'kaoyan-device-agent-v1': '{"name":"小研","tasks":[]}',
    'kaoyan-device-model-v1': '{"model":"example"}',
    'kaoyan-device-model-key-v1': 'secret',
  })
  const backup = readPortableBackup('device')
  assert.equal(backup.agent, '{"name":"小研","tasks":[]}')
  assert.equal(JSON.stringify(backup).includes('secret'), false)
  restorePortableBackup('device', parsePortableBackup(JSON.stringify(backup)))
  assert.equal(localStorage.getItem('kaoyan-device-agent-v1'), backup.agent)
  assert.equal(localStorage.getItem('kaoyan-device-model-key-v1'), 'secret')
})

test('portable backup moves model profiles but not session API keys', () => {
  globalThis.localStorage = storage({
    'kaoyan-device-model-profiles-v1': JSON.stringify({ activeId: 'remote', items: [{ id: 'remote', name: '在线', base_url: 'https://example.com/v1', model: 'demo', temperature: 0.2 }] }),
  })
  globalThis.sessionStorage = storage({ 'kaoyan-device-model-key-v1': 'secret', 'kaoyan-device-model-key-v1:remote': 'secret' })
  const backup = readPortableBackup('device')
  assert.equal(JSON.stringify(backup).includes('secret'), false)
  restorePortableBackup('device', parsePortableBackup(JSON.stringify(backup)))
  assert.equal(JSON.parse(localStorage.getItem('kaoyan-device-model-v1')).model, 'demo')
  assert.equal(sessionStorage.getItem('kaoyan-device-model-key-v1'), null)
})

test('portable backup keeps hub AI conversations and sync identities', () => {
  globalThis.localStorage = storage({
    'hub-ai-agent-device-math2-v1': '[{"role":"user","content":"分析错题"}]',
    'shicuo-agent-device:shicuo-hub-sync-v1': '{"math2:q1":true}',
  })
  const backup = parsePortableBackup(JSON.stringify(readPortableBackup('device')))
  assert.match(backup.hub_ai.math2, /分析错题/)
  assert.equal(backup.mistake_review['shicuo-hub-sync-v1'], '{"math2:q1":true}')
  globalThis.localStorage = storage()
  restorePortableBackup('device', backup)
  assert.match(localStorage.getItem('hub-ai-agent-device-math2-v1'), /分析错题/)
})

test('portable backup includes custom countdown events', () => {
  globalThis.localStorage = storage({ 'kaoyan-device-schedule-v1': '[{"id":"holiday","title":"放假","date":"2026-10-01"}]' })
  const backup = parsePortableBackup(JSON.stringify(readPortableBackup('device')))
  assert.match(backup.schedule, /放假/)
  globalThis.localStorage = storage()
  restorePortableBackup('device', backup)
  assert.match(localStorage.getItem('kaoyan-device-schedule-v1'), /放假/)
  assert.throws(() => parsePortableBackup(JSON.stringify({ ...backup, schedule: '[{"id":"bad","title":"坏日期","date":"2026-02-31"}]' })), /日程格式/)
})

test('portable backup includes 408 study data and its AI discussion', () => {
  globalThis.localStorage = storage({
    'cs408-study-v1-agent-device': '{"records":{"cs-choice-1":{"wrong":true}}}',
    'hub-ai-agent-device-cs408-v1': '[{"role":"user","content":"分析 408 错题"}]',
  })
  const backup = parsePortableBackup(JSON.stringify(readPortableBackup('device')))
  assert.match(backup.study_hub.cs408, /cs-choice-1/)
  assert.match(backup.hub_ai.cs408, /分析 408/)
  globalThis.localStorage = storage()
  restorePortableBackup('device', backup)
  assert.match(localStorage.getItem('cs408-study-v1-agent-device'), /cs-choice-1/)
})
