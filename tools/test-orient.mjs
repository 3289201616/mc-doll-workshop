import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const b64 = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 64, 64)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 16)
  ctx.fillStyle = '#2050e0'   // 北面（脸）
  ctx.fillRect(8, 8, 8, 8)
  ctx.fillRect(40, 8, 8, 8)
  ctx.fillStyle = '#f08000'   // 南面（后脑）
  ctx.fillRect(24, 8, 8, 8)
  ctx.fillRect(56, 8, 8, 8)
  ctx.fillStyle = '#e02020'   // 右腿
  ctx.fillRect(0, 16, 16, 16)
  ctx.fillRect(0, 32, 16, 16)
  ctx.fillStyle = '#20a020'   // 左腿
  ctx.fillRect(0, 48, 16, 16)
  ctx.fillRect(16, 48, 16, 16)
  return c.toDataURL('image/png').split(',')[1]
})

await page.setInputFiles('#skinInput', { name: 'orient.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(1800)
await page.evaluate(() => window.__MCDOLL__.stage.setAutoRotate(false))
await page.waitForTimeout(400)
const url = await page.evaluate(() => window.__MCDOLL__.stage.capture(600, 'white'))
writeFileSync('preview/orient-mcdoll.png', Buffer.from(url.split(',')[1], 'base64'))
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
