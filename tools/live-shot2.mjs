import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('https://www.bilibili.com/toy/mc-doll-workshop/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(12000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
await frame.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page.waitForTimeout(2500)
const info = await frame.evaluate(async () => {
  const s = window.__MCDOLL__.stage
  s.setAutoRotate(false)
  s.modelGroup.rotation.y = 0
  await new Promise((r) => setTimeout(r, 400))
  return { yaw: s.modelGroup.rotation.y, root: s.model?.root?.rotation?.y ?? null }
})
console.log('stage yaw/root:', JSON.stringify(info))
await page.locator('iframe').first().screenshot({ path: 'preview/live-front.png' }).catch(async () => {
  await page.screenshot({ path: 'preview/live-front.png' })
})
await browser.close()
console.log('ok')
