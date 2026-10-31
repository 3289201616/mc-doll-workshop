import { chromium } from 'playwright-core'
const url = process.argv[2]
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('response', (r) => {
  if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`)
})
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => errs.push('goto: ' + e.message))
await page.waitForTimeout(4000)
await page.screenshot({ path: 'preview/live-preview.png' })
console.log('title:', await page.title())
console.log('issues:', errs.slice(0, 8).join('\n') || 'none')
await browser.close()
