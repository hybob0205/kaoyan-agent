import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const out = '../.run/web-ui'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
let populated = false
// All account data and API requests are isolated fixtures, never a real user account.
await page.route('**/api/**', async route => {
  const key = new URL(route.request().url()).pathname
  if (!key.startsWith('/api/')) return route.continue()
  const fixtures = {
    '/api/health': { status: 'ok', service: 'UI fixture', lan_mode: false },
    '/api/auth/me': { id: 999999, username: '界面验收', email: 'preview@example.test', created_at: '2026-09-01T00:00:00' },
    '/api/profile': { school: '目标院校（测试数据）', major: '计算机技术', exam_date: '2026-12-19', daily_minutes: 360, rest_days: [6], subjects: ['math2', 'english2', 'politics'].map(subject => ({ subject, score: 3, weaknesses: '' })) },
    '/api/model-config/profiles': { items: [], active_id: null, version: 0 },
    '/api/documents': [], '/api/schools': [], '/api/quizzes': [],
    '/api/agent/actions': [], '/api/agent/conversations': [],
    '/api/checkins/streak': { days: 0 },
    '/api/quizzes/analysis': { submitted_quizzes: 0, accuracy: 0, total_questions: 0, correct_answers: 0, subjects: [], weaknesses: [] },
  }
  if (populated) {
    const model = { provider: 'openai_compatible', base_url: 'https://example.test/v1', model: 'ui-test-model', embedding_model: '', temperature: 0.2, has_api_key: false, api_key_masked: '' }
    fixtures['/api/model-config'] = model
    fixtures['/api/model-config/profiles'] = { items: [{ ...model, id: 'fixture', name: '界面测试模型' }], active_id: 'fixture', version: 1 }
    fixtures['/api/plans/today'] = { id: 1, start_date: '2026-09-29', end_date: '2026-09-29', plan_type: 'daily', status: 'active', rationale: '界面测试记录', version: 1, total_minutes: 60, completed_minutes: 0, tasks: [{ id: 1, subject: 'math2', title: '复习定积分与换元法（界面测试）', minutes: 60, due_date: '2026-09-29', status: 'pending', priority: 1, sort_order: 0, updated_at: '2026-09-29' }] }
    fixtures['/api/documents'] = [{ id: 1, filename: '积分复习笔记（界面测试）.pdf', size_bytes: 12000, status: 'ready', chunk_count: 3, page_count: 2 }]
  }
  await route.fulfill({ status: key in fixtures ? 200 : 404, contentType: 'application/json', body: JSON.stringify(fixtures[key] ?? { detail: '暂无记录（界面测试）' }) })
})
await page.addInitScript(() => { if (!sessionStorage.getItem('ui-fixture-seeded')) { localStorage.setItem('kaoyan-agent-run-mode-v1', 'lan'); localStorage.setItem('kaoyan-agent-token-v1', 'ui-fixture-only'); sessionStorage.setItem('ui-fixture-seeded', '1') } })
const errors = [], checks = []
page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
await page.goto('http://127.0.0.1:5175')
await page.locator('.dashboard-grid').waitFor({ timeout: 10000 }).catch(async error => { console.error(await page.locator('body').innerText()); throw error })
async function capture(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  checks.push({ name, overflow })
}
if (process.env.BASELINE) { await capture('before'); await browser.close(); process.exit(0) }
for (const width of [1440, 768, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  for (const theme of ['paper', 'night', 'light']) {
    await page.evaluate(theme => window.KaoyanTheme.set(theme), theme)
    for (const view of ['总览', '学习计划', '练习与复盘', '资料库', 'Agent 对话']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await page.getByRole('button', { name: view, exact: true }).getAttribute('aria-current').then(value => assert.equal(value, 'page'))
      await capture(`${width}-${theme}-${view}`)
    }
    await page.getByRole('button', { name: '个人中心', exact: true }).click()
    await capture(`${width}-${theme}-account`)
    await page.getByRole('button', { name: '管理模型与资料读取方式' }).click()
    await capture(`${width}-${theme}-settings`)
    await page.getByRole('button', { name: '返回个人中心' }).click()
    await page.getByRole('button', { name: '返回仪表盘' }).click()
  }
}
await page.getByRole('button', { name: '总览', exact: true }).click()
await page.getByRole('button', { name: '自定义顺序' }).click()
assert.equal(await page.locator('.dashboard-widget:visible').count(), 12)
await page.getByRole('button', { name: '上移考试倒计时', exact: true }).click()
assert.equal(await page.locator('.dashboard-widget').first().getAttribute('data-widget-id'), 'countdown')
await page.getByRole('button', { name: '完成排序' }).click()
await page.getByRole('button', { name: '资料库', exact: true }).click()
assert.equal(await page.locator('.dashboard-widget:visible').count(), 1)
populated = true
await page.reload()
await page.locator('.dashboard-grid').waitFor()
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.evaluate(() => window.KaoyanTheme.set('night'))
  for (const view of ['总览', '资料库', 'Agent 对话']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await capture(`${width}-populated-${view}`)
  }
  await page.getByRole('button', { name: '个人中心', exact: true }).click()
  await page.getByRole('button', { name: '编辑学习画像' }).click()
  await capture(`${width}-profile`)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '返回仪表盘' }).click()
}
await page.getByRole('button', { name: '练习与复盘', exact: true }).click()
await page.getByRole('textbox', { name: '测试范围' }).fill('保留未提交的输入')
await page.getByRole('button', { name: '资料库', exact: true }).click()
await page.getByRole('button', { name: '练习与复盘', exact: true }).click()
assert.equal(await page.getByRole('textbox', { name: '测试范围' }).inputValue(), '保留未提交的输入')
await page.evaluate(() => localStorage.removeItem('kaoyan-agent-token-v1'))
await page.reload()
await page.locator('.auth-layout').waitFor()
for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await capture(`${width}-auth`) }
await page.getByRole('button', { name: /切换使用方式/ }).click()
for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await capture(`${width}-mode`) }
await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2))
await browser.close()
console.log(JSON.stringify({ checks: checks.length, errors, overflow: checks.filter(check => check.overflow) }))
assert.equal(errors.length, 0)
assert.ok(checks.every(check => !check.overflow))
