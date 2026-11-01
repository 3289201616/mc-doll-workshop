import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 60)}`) })
await page.goto('https://www.bilibili.com/toy/preview/author_J3OPjHNr/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(12000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
if (!frame) { console.log('no iframe:', errs.join(' | ')); await browser.close(); process.exit(1) }
console.log('自定义按钮:', (await frame.textContent('#geoBtn')).trim())
await frame.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await frame.waitForTimeout(2200)
await frame.click('#shotBtn')
await frame.waitForTimeout(1000)
const info = await frame.evaluate(() => ({
  open: !document.querySelector('#saveModal').hidden,
  size: (() => { const el = document.querySelector('#saveShotImg'); return `${el.naturalWidth}x${el.naturalHeight}` })(),
  hint: document.querySelector('#saveHint').textContent.slice(0, 30),
}))
console.log('线上容器 存图弹窗:', JSON.stringify(info))
await page.screenshot({ path: 'preview/live-save-modal.png' })
console.log('errors:', errs.slice(0, 3).join(' | ') || 'none')
await browser.close()
