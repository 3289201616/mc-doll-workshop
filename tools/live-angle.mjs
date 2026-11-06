import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 500, height: 800 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('https://www.bilibili.com/toy/mc-doll-workshop/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(12000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
await frame.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page.waitForTimeout(1200)
console.log('载入后角度:', JSON.stringify(await frame.evaluate(() => ({
  group: +window.__MCDOLL__.stage.modelGroup.rotation.y.toFixed(3),
  root: +(window.__MCDOLL__.stage.model?.root?.rotation?.y ?? 0).toFixed(3),
}))))
await page.screenshot({ path: 'preview/live-default.png' })
await page.waitForTimeout(3000)
console.log('3 秒后:', JSON.stringify(await frame.evaluate(() => ({
  group: +window.__MCDOLL__.stage.modelGroup.rotation.y.toFixed(3),
}))))
await page.screenshot({ path: 'preview/live-default2.png' })
await browser.close()
console.log('ok')
