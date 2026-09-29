import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../src/deviceAgent.ts', import.meta.url), 'utf8')
const start = source.indexOf('export function defaultDeviceAgent()')
const end = source.indexOf('export function readDeviceAgent()', start)
const defaultDeviceAgent = runInNewContext(`${source.slice(start, end).replace('export function', 'function').replace('(): LocalAgentData', '()')}\ndefaultDeviceAgent`, {
  Date,
  today: () => new Date().toLocaleDateString('sv-SE'),
})

test('a new device profile targets the next December 19', () => {
  const expectedYear = new Date().toLocaleDateString('sv-SE') < `${new Date().getFullYear()}-12-19`
    ? new Date().getFullYear() : new Date().getFullYear() + 1
  assert.equal(defaultDeviceAgent().examDate, `${expectedYear}-12-19`)
})
