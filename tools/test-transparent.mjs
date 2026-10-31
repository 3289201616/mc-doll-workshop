import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

await page.click('#bgSeg button[data-bg="transparent"]')
await page.waitForTimeout(600)
await page.screenshot({ path: 'preview/ui-transparent.png' })

const probe = await page.evaluate(async () => {
  const stage = window.__MCDOLL__.stage
  stage.setAutoRotate(false)
  const url = stage.capture(512, 'transparent')
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const corner = Array.from(ctx.getImageData(2, 2, 1, 1).data)
  const center = Array.from(ctx.getImageData(256, 300, 1, 1).data)
  return { corner, center }
})
console.log('透明导出 角落像素 RGBA:', probe.corner, ' 中心像素 RGBA:', probe.center)
console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
