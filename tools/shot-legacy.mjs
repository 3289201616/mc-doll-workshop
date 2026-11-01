import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
const tag = process.argv[2] || 'before'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

// 由 alice.png 裁一张 64×32 老皮肤
const b64 = await page.evaluate(async () => {
  const img = new Image()
  img.src = './samples/alice.png'
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 64; c.height = 32
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  return c.toDataURL('image/png').split(',')[1]
})
writeFileSync(`preview/legacy-${tag}-skin.png`, Buffer.from(b64, 'base64'))

await page.setInputFiles('#skinInput', { name: 'legacy.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(1600)

const info = await page.evaluate(() => {
  const s = window.__MCDOLL__.state
  const canvas = s.skin.canvas
  return {
    sourceSize: `${s.skin.width}x${s.skin.height}`,
    textureSize: `${canvas.width}x${canvas.height}`,
    stats: window.__MCDOLL__.getStats(),
    meta: document.querySelector('#skinMeta').textContent,
  }
})
console.log(tag, JSON.stringify(info))

// 关掉自动旋转，固定角度取图
await page.evaluate(() => { window.__MCDOLL__.stage.setAutoRotate(false) })
await page.waitForTimeout(400)
const url = await page.evaluate(() => window.__MCDOLL__.stage.capture(600, 'white'))
const img = Buffer.from(url.split(',')[1], 'base64')
writeFileSync(`preview/legacy-${tag}.png`, img)
console.log('shot saved', tag, 'errors:', errs.join('|') || 'none')
await browser.close()
