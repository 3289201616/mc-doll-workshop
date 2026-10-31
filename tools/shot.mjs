import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = 'preview'
mkdirSync(OUT, { recursive: true })

const url = process.argv[2] || 'http://127.0.0.1:5180/'
const tag = process.argv[3] || 'shot'

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const logs = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

await page.screenshot({ path: `${OUT}/${tag}-full.png` })

const stats = await page.evaluate(() => {
  const app = window.__MCDOLL__
  if (!app) return { error: 'no app' }
  return { stats: app.getStats(), state: { ...app.state, skin: app.state.skin?.name } }
})

console.log(JSON.stringify(stats, null, 2))
console.log('--- console ---')
console.log(logs.join('\n') || '(clean)')

await browser.close()
