import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysUntil, readDeviceSchedule, saveDeviceSchedule } from '../src/deviceSchedule.ts'

test('2026 exam countdown is 83 days on September 27', () => {
  assert.equal(daysUntil('2026-12-19', '2026-09-27'), 83)
  assert.equal(daysUntil('2026-10-01', '2026-10-01'), 0)
})

test('custom schedule keeps valid events without changing existing learning data', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  saveDeviceSchedule([{ id: 'holiday', title: '放假', date: '2026-10-01' }])
  assert.deepEqual(readDeviceSchedule(), [{ id: 'holiday', title: '放假', date: '2026-10-01' }])
  assert.throws(() => saveDeviceSchedule([{ id: 'bad', title: '无效', date: '2026-02-31' }]), /最多保存/)
})
