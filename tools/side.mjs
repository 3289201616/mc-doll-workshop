import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
const [a, b, out] = process.argv.slice(2)
const toB = (p) => readFileSync(p).toString('base64')
const mime = (p) => p.endsWith('.jpg') || p.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1200, height: 620 } })
const data = await page.evaluate(async ([a, b, ma, mb]) => {
  const load = (s, m) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:${m};base64,` + s })
  const [ia, ib] = await Promise.all([load(a, ma), load(b, mb)])
  const H = 600
  const scale = (img) => H / img.height
  const wA = ia.width * scale(ia), wB = ib.width * scale(ib)
  const c = document.createElement('canvas')
  c.width = wA + wB + 10; c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(ia, 0, 0, wA, H)
  ctx.drawImage(ib, wA + 10, 0, wB, H)
  return c.toDataURL('image/png').split(',')[1]
}, [toB(a), toB(b), mime(a), mime(b)])
writeFileSync(out, Buffer.from(data, 'base64'))
await browser.close()
console.log('ok', out)
