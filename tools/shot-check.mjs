import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 760, height: 760 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto('http://127.0.0.1:5180/tools/check.html' + (process.argv[2] || ''), { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
console.log('info:', await page.textContent('#info'))
await page.screenshot({ path: process.argv[3] || 'preview/glb-roundtrip.png' })
console.log(errs.join('\n') || '(no errors)')
await browser.close()
