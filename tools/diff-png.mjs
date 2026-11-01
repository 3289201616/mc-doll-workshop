import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const [a, b] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
const toB64 = (p) => readFileSync(p).toString('base64')
const out = await page.evaluate(async ([a64, b64]) => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s })
  const [ia, ib] = await Promise.all([load(a64), load(b64)])
  const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.drawImage(ia, 0, 0)
  const da = ctx.getImageData(0, 0, w, h).data
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(ib, 0, 0)
  const db = ctx.getImageData(0, 0, w, h).data
  let diff = 0, big = 0, max = 0
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i+1] - db[i+1]), Math.abs(da[i+2] - db[i+2]), Math.abs(da[i+3] - db[i+3]))
    if (d > 8) diff++
    if (d > 40) big++
    if (d > max) max = d
  }
  return { w, h, diffPixels: diff, bigDiff: big, maxDelta: max, total: w * h }
}, [toB64(a), toB64(b)])
console.log(JSON.stringify(out))
await browser.close()
