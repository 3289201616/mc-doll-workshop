import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.screenshot({ path: 'preview/mobile.png', fullPage: false })
await page.screenshot({ path: 'preview/mobile-full.png', fullPage: true })
await browser.close()
