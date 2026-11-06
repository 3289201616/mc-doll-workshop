import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 500, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('https://www.bilibili.com/toy/mc-doll-workshop/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(12000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
if (!frame) { console.log('no iframe'); await browser.close(); process.exit(1) }
await frame.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'preview/live-now.png' })
console.log('ok')
await browser.close()
