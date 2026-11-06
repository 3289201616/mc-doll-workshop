import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const [file, pts] = process.argv.slice(2)
const b64 = readFileSync(file).toString('base64')
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
const out = await page.evaluate(async ([b, pts]) => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + b
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return pts.split(';').map((p) => {
    const [x, y] = p.split(',').map(Number)
    const d = ctx.getImageData(x, y, 1, 1).data
    return `${p} → rgb(${d[0]},${d[1]},${d[2]})`
  })
}, [b64, pts])
console.log('尺寸', await page.evaluate(async () => 0))
out.forEach((l) => console.log(l))
await browser.close()
