import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
const [src, out, x, y, w, h, scale] = process.argv.slice(2)
const b64 = readFileSync(src).toString('base64')
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
const data = await page.evaluate(async ([b, x, y, w, h, s]) => {
  const img = new Image()
  img.src = 'data:image/jpeg;base64,' + b
  await img.decode()
  const c = document.createElement('canvas')
  c.width = w * s; c.height = h * s
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, x, y, w, h, 0, 0, w * s, h * s)
  return c.toDataURL('image/png').split(',')[1]
}, [b64, Number(x), Number(y), Number(w), Number(h), Number(scale)])
writeFileSync(out, Buffer.from(data, 'base64'))
await browser.close()
console.log('cropped', out)
