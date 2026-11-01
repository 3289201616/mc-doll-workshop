import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const stats = () => page.evaluate(() => ({
  stats: window.__MCDOLL__.getStats(),
  tex: `${window.__MCDOLL__.state.skin.canvas.width}x${window.__MCDOLL__.state.skin.canvas.height}`,
  meta: document.querySelector('#skinMeta').textContent,
}))

// 1. 64×64 正常皮肤
await page.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page.waitForTimeout(1500)
const a = await stats()
console.log('64×64  :', a.stats.cubes, 'cube /', a.stats.overlays, 'overlay / hidden', a.stats.hidden, '| tex', a.tex, '|', a.meta)

// 2. 切经典体型
await page.click('#bodySeg button[data-body="steve"]')
await page.waitForTimeout(1200)
const b = await stats()
console.log('经典   :', b.stats.cubes, 'cube /', b.stats.overlays, 'overlay / hidden', b.stats.hidden, '| 尺寸', b.stats.size.x.toFixed(2), b.stats.size.y.toFixed(2))

// 3. 老皮肤（64×32）在经典体型下
const b64 = await page.evaluate(async () => {
  const img = new Image(); img.src = './samples/alice.png'; await img.decode()
  const c = document.createElement('canvas'); c.width = 64; c.height = 32
  c.getContext('2d').drawImage(img, 0, 0)
  return c.toDataURL('image/png').split(',')[1]
})
await page.setInputFiles('#skinInput', { name: 'legacy.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(1600)
const c1 = await stats()
console.log('64×32  :', c1.stats.cubes, 'cube /', c1.stats.overlays, 'overlay / hidden', c1.stats.hidden, '| tex', c1.tex, '|', c1.meta)

// 4. 自定义 json
await page.setInputFiles('#geoInput', { name: 'alex.json', mimeType: 'application/json', buffer: readFileSync('src/geo/alex.json') })
await page.waitForTimeout(1500)
const d = await stats()
const body = await page.evaluate(() => document.querySelector('#bodySeg button.is-active')?.dataset.body)
console.log('自定义 :', d.stats.cubes, 'cube / hidden', d.stats.hidden, '| 体型按钮', body, '|', await page.textContent('#geoHint'))

// 5. 存图按钮文案
console.log('存档按钮:', (await page.textContent('#shotBtn')).trim())
console.log('errors:', errs.slice(0, 4).join(' | ') || 'none')
await browser.close()
