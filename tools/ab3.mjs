import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
const [a, b, out] = process.argv.slice(2)
const toB = (p) => readFileSync(p).toString('base64')
const mime = (p) => /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'image/png'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1400, height: 520 } })
const data = await page.evaluate(async ([a, b, ma, mb]) => {
  const load = (s, m) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:${m};base64,` + s })
  const [ia, ib] = await Promise.all([load(a, ma), load(b, mb)])
  const H = 500
  const wa = ia.width * (H / ia.height), wb = ib.width * (H / ib.height)
  const c = document.createElement('canvas')
  c.width = wa + wb + 20 + wb
  c.height = H
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(ia, 0, 0, wa, H)
  ctx.drawImage(ib, wa + 20, 0, wb, H)
  ctx.save()
  ctx.translate(wa + wb + 40 + wb, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(ib, 0, 0, wb, H)
  ctx.restore()
  return c.toDataURL('image/png').split(',')[1]
}, [toB(a), toB(b), mime(a), mime(b)])
writeFileSync(out, Buffer.from(data, 'base64'))
await browser.close()
console.log('ok')
