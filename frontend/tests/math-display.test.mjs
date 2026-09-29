import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { readableMath } from '../public/study-hub/agent-integration.js'

const source = readFileSync(new URL('../public/mistake-review/app.js', import.meta.url), 'utf8')
const start = source.indexOf('function readTexGroup(')
const end = source.indexOf('function sourceKind(', start)
const normalizeMathText = runInNewContext(`${source.slice(start, end)}\nnormalizeMathText`)

test('mistake AI displays bare LaTeX commands and indices as readable symbols', () => {
  const raw = 'f = \\lambda_1 y_1^2 + \\lambda_2 y_2^2 + \\cdots + \\lambda_n y_n^2，\\lambda_i 是特征值。'
  assert.equal(normalizeMathText(raw), 'f = λ₁ y₁² + λ₂ y₂² + ⋯ + λₙ yₙ²，λᵢ 是特征值。')
  assert.equal(normalizeMathText('\\(\\lambda_1 y_1^2\\)'), 'λ₁ y₁²')
})

test('study hub AI also keeps indices readable when a model ignores the Unicode prompt', () => {
  assert.equal(readableMath('\\(\\lambda_1 y_1^2 + \\lambda_i\\)'), 'λ₁ y₁² + λᵢ')
})
