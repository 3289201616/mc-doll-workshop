import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('https://www.bilibili.com/toy/mc-doll-workshop/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(10000)
const frame = page.frames().find((f) => f.url().includes('bilibilitoy.com'))
console.log('frame:', frame ? frame.url().slice(0, 90) : 'none')
if (!frame) { await browser.close(); process.exit(1) }

const report = await frame.evaluate(() => {
  const out = { scripts: [], globals: [], api: {} }
  document.querySelectorAll('script[src]').forEach((s) => out.scripts.push(s.src))
  // 找可疑的 SDK 全局
  const keys = Object.keys(window)
  const suspicious = keys.filter((k) => /toy|bili|sdk|bridge|jsbridge|mini|app/i.test(k))
  out.globals = suspicious
  for (const key of suspicious) {
    const value = window[key]
    if (!value || typeof value !== 'object' && typeof value !== 'function') continue
    const names = new Set()
    try {
      for (const n of Object.keys(value)) names.add(n)
      let proto = Object.getPrototypeOf(value)
      while (proto && proto !== Object.prototype) {
        for (const n of Object.getOwnPropertyNames(proto)) names.add(n)
        proto = Object.getPrototypeOf(proto)
      }
    } catch { /* 取不到就算了 */ }
    out.api[key] = [...names].filter((n) => !n.startsWith('_')).slice(0, 80)
  }
  return out
})
console.log(JSON.stringify(report, null, 2).slice(0, 4000))
await browser.close()
