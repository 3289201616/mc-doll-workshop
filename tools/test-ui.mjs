import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)

// 经典体型
await page.click('#bodySeg button[data-body="steve"]')
await page.waitForTimeout(400)
console.log('steve stats:', JSON.stringify(await page.evaluate(() => window.__MCDOLL__.getStats()?.cubes)))
await page.screenshot({ path: 'preview/ui-steve.png' })

// 64x32 旧版皮肤：把示例皮肤裁成上半截
const b64 = await page.evaluate(async () => {
  const img = new Image()
  img.src = './samples/alice.png'
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 64; c.height = 32
  c.getContext('2d').drawImage(img, 0, 0)
  return c.toDataURL('image/png').split(',')[1]
})
await page.setInputFiles('#skinInput', { name: 'legacy64x32.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(900)
const legacy = await page.evaluate(() => ({
  stats: window.__MCDOLL__.getStats(),
  meta: document.querySelector('#skinMeta').textContent,
}))
console.log('legacy meta:', legacy.meta, 'hidden cubes:', legacy.stats?.hidden)
await page.screenshot({ path: 'preview/ui-legacy.png' })

// 第二层开关
await page.locator('#overlayToggle').check({ force: true })
await page.waitForTimeout(400)
await page.screenshot({ path: 'preview/ui-no-overlay.png' })

// 深色背景
await page.locator('#overlayToggle').check({ force: true })
await page.click('#bgSeg button[data-bg="dark"]')
await page.click('#bodySeg button[data-body="alex"]')
await page.waitForTimeout(600)
await page.screenshot({ path: 'preview/ui-dark.png' })

// 坏文件
await page.setInputFiles('#skinInput', { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('notapng', 'utf8') })
await page.waitForTimeout(700)
const toastCount = await page.evaluate(() => document.querySelectorAll('.toast').length)
console.log('toasts after bad file:', toastCount)

console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
