import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

// 造一张 300×180 的非标准贴图
const b64 = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 300; c.height = 180
  const ctx = c.getContext('2d')
  const colors = ['#e05c4a', '#4a90e0', '#f2c14e', '#4ea86b', '#8a5cf6', '#111111']
  for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) {
    ctx.fillStyle = colors[(x + y) % colors.length]
    ctx.fillRect(x * 30, y * 30, 30, 30)
  }
  return c.toDataURL('image/png').split(',')[1]
})
const buffer = Buffer.from(b64, 'base64')

const state = () => page.evaluate(() => ({
  freeform: Boolean(window.__MCDOLL__.state.skin.freeform),
  tex: `${window.__MCDOLL__.state.skin.canvas.width}x${window.__MCDOLL__.state.skin.canvas.height}`,
  meta: document.querySelector('#skinMeta').textContent,
  stats: window.__MCDOLL__.getStats(),
  hint: document.querySelector('#skinFormatHint').textContent,
}))
const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()))

// 1) 标准体型：应当被拒
await page.setInputFiles('#skinInput', { name: 'odd.png', mimeType: 'image/png', buffer })
await page.waitForTimeout(900)
console.log('标准体型 拒绝提示:', (await toasts()).at(-1) || '(无)')

// 2) 自定义 json 后：应当接受
await page.setInputFiles('#geoInput', { name: 'alex.json', mimeType: 'application/json', buffer: readFileSync('src/geo/alex.json') })
await page.waitForTimeout(1200)
console.log('自定义模式 格式提示:', (await state()).hint)
await page.setInputFiles('#skinInput', { name: 'odd.png', mimeType: 'image/png', buffer })
await page.waitForTimeout(1600)
const s = await state()
console.log('自由尺寸贴图:', JSON.stringify({ freeform: s.freeform, tex: s.tex, meta: s.meta, cubes: s.stats.cubes, hidden: s.stats.hidden }))
console.log('toast:', (await toasts()).at(-1))

await page.evaluate(() => window.__MCDOLL__.stage.setAutoRotate(false))
await page.waitForTimeout(300)
await page.screenshot({ path: 'preview/freeform.png' })

// 3) 导出的贴图尺寸
await page.evaluate(() => localStorage.setItem('mcdoll_download_tip_off', '1'))
const wait = page.waitForEvent('download', { timeout: 60000 })
await page.click('#exportBtn')
const d = await wait
await d.saveAs('preview/freeform.glb')
console.log('导出:', d.suggestedFilename(), '| errors:', errs.slice(0, 3).join(' | ') || 'none')
await browser.close()
