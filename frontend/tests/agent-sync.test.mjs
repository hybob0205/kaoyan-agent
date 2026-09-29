import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../public/agent-sync.js', import.meta.url), 'utf8')

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

function response(status, data) {
  return { ok: status >= 200 && status < 300, status, async json() { return data } }
}

async function boot(initial, remote, writeStatus = 200) {
  const localStorage = storage({ 'kaoyan-agent-token-v1': 'token', ...initial })
  const writes = []
  const window = { HUB_USER_NAMESPACE: '1' }
  const notices = []
  const context = {
    window, localStorage, location: { pathname: '/study-hub/math.html' }, setTimeout,
    clearTimeout, document: { body: { append(item) { notices.push(item) } }, createElement() { return { style: {}, setAttribute() {}, remove() {} } } },
    fetch: async (url, options = {}) => {
      if (url === '/api/health') return response(200, { lan_mode: true })
      if (options.method === 'GET') return remote ? response(200, remote) : response(404, {})
      const payload = JSON.parse(options.body)
      writes.push(payload)
      if (writeStatus !== 200) return response(writeStatus, {})
      remote = { version: (remote?.version ?? 0) + 1, data: payload.data }
      return response(200, remote)
    },
  }
  vm.runInNewContext(source, context)
  await window.AGENT_SYNC_BOOT
  return { localStorage, writes, window, notices }
}

test('first computer launch migrates existing study records to its database', async () => {
  const key = 'math2-study-v1-agent-1'
  const result = await boot({ [key]: '{"records":{}}' }, null)
  assert.equal(result.writes.length, 1)
  assert.equal(result.writes[0].data[key], '{"records":{}}')
  assert.equal(JSON.parse(result.localStorage.getItem('agent-live-sync-study-hub-1')).dirty, false)
})

test('phone with no local cache pulls computer records', async () => {
  const key = 'math2-study-v1-agent-1'
  const result = await boot({}, { version: 3, data: { [key]: '{"records":{"a":1}}' } })
  assert.equal(result.localStorage.getItem(key), '{"records":{"a":1}}')
  assert.equal(result.writes.length, 0)
})

test('untracked old local records are never overwritten', async () => {
  const key = 'math2-study-v1-agent-1'
  const result = await boot({ [key]: 'old-local' }, { version: 3, data: { [key]: 'computer' } })
  assert.equal(result.localStorage.getItem(key), 'old-local')
  assert.equal(result.writes.length, 0)
})

test('dirty browser cache retries only against the matching computer version', async () => {
  const key = 'math2-study-v1-agent-1'
  const marker = 'agent-live-sync-study-hub-1'
  const result = await boot({ [key]: 'new-local', [marker]: JSON.stringify({ version: 3, dirty: true }) },
    { version: 3, data: { [key]: 'old-computer' } })
  assert.equal(result.writes.length, 1)
  assert.equal(result.writes[0].expected_version, 3)
  assert.equal(result.writes[0].data[key], 'new-local')
})

test('concurrent edit conflict leaves browser data intact and warns the user', async () => {
  const key = 'math2-study-v1-agent-1'
  const marker = 'agent-live-sync-study-hub-1'
  const result = await boot({ [key]: 'new-local', [marker]: JSON.stringify({ version: 3, dirty: true }) },
    { version: 3, data: { [key]: 'old-computer' } }, 409)
  assert.equal(result.localStorage.getItem(key), 'new-local')
  assert.equal(JSON.parse(result.localStorage.getItem(marker)).dirty, true)
  assert.match(result.notices[0].textContent, /尚未写入电脑/)
})
