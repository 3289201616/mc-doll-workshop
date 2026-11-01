import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('https://www.bilibili.com/toy/mc-doll-workshop/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(9000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
const out = await frame.evaluate(async () => {
  const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src)
  let supportSave = null
  try { supportSave = await window.toy.isSupport('saveImageToAlbum') } catch (e) { supportSave = 'err: ' + e.message }
  let supportShare = null
  try { supportShare = await window.toy.isSupport('sharePicture') } catch (e) { supportShare = 'err: ' + e.message }
  return { scripts, supportSave, supportShare }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
