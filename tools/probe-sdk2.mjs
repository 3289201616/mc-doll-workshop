import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('https://www.bilibili.com/toy/mc-doll-workshop/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(10000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
const out = await frame.evaluate(() => ({
  saveImageToAlbum: String(window.toy.saveImageToAlbum),
  sharePicture: String(window.toy.sharePicture),
  isSupport: String(window.toy.isSupport),
  isSupportSave: (() => { try { return window.toy.isSupport('saveImageToAlbum') } catch (e) { return 'err ' + e.message } })(),
  media: window.toy.media ? Object.keys(window.toy.media) : null,
  channel: window.toy.channel,
  keys: Object.keys(window.toy),
}))
console.log(JSON.stringify(out, null, 2).slice(0, 3000))
await browser.close()
