import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5175'
const output = path.resolve('../.run/home-calendar')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ reducedMotion: 'reduce' })

for (const width of [360, 390, 768, 1440]) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(origin)
  await page.evaluate(() => localStorage.setItem('kaoyan-agent-run-mode-v1', 'device'))
  await page.reload()
  await page.locator('.home-calendar-scene').waitFor()
  const geometry = await page.evaluate(() => {
    const rect = selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect()
      return { x, y, width, height, right: x + width, bottom: y + height }
    }
    return {
      scene: rect('.home-calendar-scene'),
      heading: rect('.calendar-body > span:first-child'),
      number: rect('.calendar-body strong'),
      date: rect('.calendar-exam-date'),
      schedule: rect('.calendar-bottom'),
      learning: rect('.home-learning h2'),
      cards: [...document.querySelectorAll('.home-learning .device-apps > *')].map(element => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height, right: x + width, bottom: y + height }
      }),
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }
  })
  const { scene, heading, number, date, schedule, learning } = geometry
  await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true })
  assert.ok(geometry.document <= width + 1, `horizontal overflow at ${width}`)
  for (const [name, item] of Object.entries({ heading, number, date, schedule })) {
    assert.ok(item.x >= scene.x && item.right <= scene.right, `${name} outside calendar width at ${width}`)
    assert.ok(item.y >= scene.y && item.bottom <= scene.bottom, `${name} outside calendar height at ${width}`)
  }
  assert.ok(heading.bottom < number.y, `calendar heading overlaps number at ${width}`)
  assert.ok(number.bottom < date.y, `calendar number overlaps date at ${width}`)
  assert.ok(date.bottom < schedule.y, `calendar date overlaps schedule at ${width}`)
  assert.equal(geometry.cards.length, 3)
  assert.ok(geometry.cards[0].bottom + 8 <= geometry.cards[1].y, `first and second cards too close at ${width}`)
  assert.ok(geometry.cards[1].bottom + 8 <= geometry.cards[2].y, `second and third cards too close at ${width}`)
  assert.ok(geometry.cards.every(card => Math.abs(card.width - geometry.cards[0].width) < 1), `card widths mismatch at ${width}`)
  if (width >= 800) assert.ok(learning.x - scene.right >= 48, `desktop columns too close at ${width}`)
  else assert.ok(learning.y - scene.bottom >= 16, `mobile sections too close at ${width}`)
  console.log(`${width}px: calendar text and section spacing OK`)
}

await page.getByRole('button', { name: '打开日程与考试倒计时设置' }).click()
assert.ok(await page.getByRole('button', { name: /关闭/ }).first().isVisible())
await browser.close()
