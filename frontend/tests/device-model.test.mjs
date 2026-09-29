import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deviceModelConfigKey, readDeviceModelConfig, readDeviceModelKey, readDeviceModelProfiles, saveDeviceModelProfile, selectDeviceModelProfile, deleteDeviceModelProfile } from '../src/deviceModel.ts'

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

test('device model reads a saved compatible endpoint without an API key', () => {
  globalThis.localStorage = { getItem: (key) => key === deviceModelConfigKey
    ? JSON.stringify({ base_url: 'http://127.0.0.1:11434/v1/', model: 'gemma3:4b', temperature: 0.2 }) : null }
  assert.deepEqual(readDeviceModelConfig(), {
    base_url: 'http://127.0.0.1:11434/v1', model: 'gemma3:4b', temperature: 0.2,
  })
})

test('device model rejects malformed saved settings', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ base_url: 'javascript:alert(1)', model: 'x', temperature: 0.2 }) }
  assert.equal(readDeviceModelConfig(), null)
})

test('multiple model profiles persist separate local keys and switch correctly', () => {
  globalThis.localStorage = storage()
  globalThis.sessionStorage = storage()
  saveDeviceModelProfile({ id: 'one', name: '模型甲', base_url: 'https://one.example/v1', model: 'a', temperature: 0.2 }, 'key-a')
  saveDeviceModelProfile({ id: 'two', name: '模型乙', base_url: 'https://two.example/v1', model: 'b', temperature: 0.5 }, 'key-b')
  assert.equal(readDeviceModelKey(), 'key-b')
  selectDeviceModelProfile('one')
  assert.equal(readDeviceModelKey(), 'key-a')
  assert.equal(JSON.parse(localStorage.getItem(deviceModelConfigKey)).model, 'a')
  assert.equal(localStorage.getItem('kaoyan-device-model-key-v1:one'), 'key-a')
  deleteDeviceModelProfile('one')
  assert.equal(readDeviceModelProfiles().activeId, 'two')
  assert.equal(readDeviceModelKey(), 'key-b')
})

test('device model migrates a legacy session key into local storage', () => {
  globalThis.localStorage = storage({
    'kaoyan-device-model-profiles-v1': JSON.stringify({ activeId: 'one', items: [{ id: 'one', name: '模型甲', base_url: 'https://one.example/v1', model: 'a', temperature: 0.2 }] }),
  })
  globalThis.sessionStorage = storage({ 'kaoyan-device-model-key-v1:one': 'legacy-key' })
  assert.equal(readDeviceModelKey(), 'legacy-key')
  assert.equal(localStorage.getItem('kaoyan-device-model-key-v1:one'), 'legacy-key')
})
