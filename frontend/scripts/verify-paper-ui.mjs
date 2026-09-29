import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5175'
const out = path.resolve('../.run/ui-review')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const page = await context.newPage()
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
await page.goto(origin)
await page.evaluate(() => {
  localStorage.setItem('kaoyan-agent-run-mode-v1', 'device')
  // Synthetic conversation lives only in this disposable browser context.
  localStorage.setItem('kaoyan-device-agent-v1', JSON.stringify({ messages: [
    { role: 'user', content: '分析我的错题，给出一个积分示例。' },
    { role: 'assistant', content: '### 复习建议\n先检查积分上下限，再进行计算。\n\n$$\\int_0^1 x^2\\,dx=\\frac{1}{3}$$\n\n这是用于界面验收的示例内容。' },
  ] }))
})
await page.reload()
async function inspect(name, screenshot = true) {
  await page.waitForTimeout(180)
  const result = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    width: innerWidth,
    body: getComputedStyle(document.body).backgroundColor,
    heading: [...document.querySelectorAll('h1,h2')].find(el => el.getBoundingClientRect().height > 0)?.textContent,
  }))
  checks.push({ name, ...result })
  if (screenshot) await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true })
}
async function theme(value) {
  const picker = page.locator('.theme-picker').first()
  await picker.locator('summary').click()
  await picker.locator(`[data-theme-choice="${value}"]`).click()
  assert.equal(await page.evaluate(() => localStorage.getItem('kaoyan-study-theme')), value)
}
for (const mode of ['paper', 'night', 'light']) {
  await page.goto(origin)
  await theme(mode)
  await inspect(`home-${mode}`)
  await page.getByRole('button', { name: '模型设置', exact: true }).click()
  await inspect(`model-${mode}`)
  await page.getByRole('button', { name: '关闭模型设置', exact: true }).click()
  await page.getByRole('button', { name: /学习 Agent 对话分析/ }).click()
  await page.getByRole('button', { name: '对话', exact: true }).click()
  await page.locator('.katex').first().waitFor()
  await inspect(`agent-${mode}`)
  await page.getByRole('button', { name: '学习画像', exact: true }).click()
  assert.ok(await page.getByRole('textbox', { name: '称呼' }).isVisible())
  await inspect(`profile-${mode}`, false)
  for (const [name, route] of [['study', '/study-hub/index.html'], ['math', '/study-hub/math.html#practice'], ['english', '/study-hub/english.html'], ['politics', '/study-hub/politics.html'], ['cs408', '/study-hub/cs408.html#practice?subject=co'], ['mistake', '/mistake-review/index.html']]) {
    await page.goto(origin + route)
    await page.locator('.theme-picker').first().waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), mode)
    await inspect(`${name}-${mode}`, ['study', 'cs408', 'mistake'].includes(name) && mode !== 'light')
  }
  await page.getByRole('link', { name: /复习中心/ }).click()
  await inspect(`review-${mode}`)
  await page.locator('.agent-float-ball').waitFor()
  for (let i = 0; i < 6; i++) {
    await page.locator('.agent-float-ball').click()
    assert.equal(await page.locator('.agent-float-ball').getAttribute('aria-expanded'), String(i % 2 === 0))
  }
  await page.locator('.agent-float-ball').click()
  await inspect(`radial-${mode}`, mode === 'night')
  await page.keyboard.press('Escape')
}
await page.goto(origin)
await theme('system')
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForFunction(() => document.documentElement.dataset.theme === 'night')
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'night')
await page.emulateMedia({ colorScheme: 'light' })
await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
await page.goto(origin + '/study-hub/index.html')
assert.equal(await page.evaluate(() => localStorage.getItem('kaoyan-study-theme')), 'system')
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForFunction(() => document.documentElement.dataset.theme === 'night')
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'night')
for (const width of [768, 1440]) {
  await page.setViewportSize({ width, height: 1024 })
  await page.goto(origin)
  await theme('paper')
  await inspect(`home-${width}`)
  await page.goto(origin + '/study-hub/index.html')
  await inspect(`study-${width}`)
  await page.goto(origin + '/mistake-review/index.html')
  await theme('night')
  await inspect(`mistake-${width}`)
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
await browser.close()
console.log(JSON.stringify({ checks: checks.length, errors, overflow: checks.filter(item => item.overflow) }, null, 2))
assert.equal(errors.length, 0, 'Application JavaScript errors')
assert.equal(checks.filter(item => item.overflow).length, 0, 'Unexpected horizontal page overflow')
