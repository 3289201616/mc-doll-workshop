import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const skin = readFileSync('public/samples/alice.png')

async function run(label, toyScript) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1600)
  // 真 SDK 会从 CDN 加载并覆盖 window.toy，所以桩要等页面就绪后再装
  if (toyScript) await page.evaluate(toyScript)
  await page.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: skin })
  await page.waitForTimeout(1500)

  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.click('#shotBtn')
  await page.waitForTimeout(1200)

  const info = await page.evaluate(() => ({
    calls: window.__albumCalls || [],
    modal: !document.querySelector('#saveModal').hidden,
    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()),
  }))
  const call = info.calls.at(-1)
  console.log(`${label}: 调用 ${info.calls.length} 次 | 弹窗 ${info.modal} | 下载 ${downloads} | toast ${JSON.stringify(info.toasts.at(-1) || '')}`)
  if (call) {
    console.log(`   base64 前缀 ${call.base64Data.slice(0, 22)}… 长度 ${(call.base64Data.length / 1024 / 1024).toFixed(2)}MB | hintMsg ${call.hintMsg}`)
  }
  console.log('   errors:', errs.slice(0, 2).join(' | ') || 'none')
  await ctx.close()
}

// 1) 模拟 B站 App：接口可用
await run('App 内（可用）', () => {
  window.__albumCalls = []
  window.toy = {
    isSupport: async () => true,
    saveImageToAlbum: async (req) => { window.__albumCalls.push(req); return { localPath: '/sdcard/DCIM/toy.png' } },
  }
})

// 2) App 内但保存被拒（权限）
await run('App 内（被拒）', () => {
  window.__albumCalls = []
  window.toy = {
    isSupport: async () => true,
    saveImageToAlbum: async (req) => { window.__albumCalls.push(req); const e = new Error('denied'); e.type = 'denied'; throw e },
  }
})

// 3) 端外（SDK 在但接口不支持）
await run('端外（不支持）', () => {
  window.__albumCalls = []
  window.toy = {
    isSupport: async () => false,
    saveImageToAlbum: async (req) => { window.__albumCalls.push(req); const e = new Error('unsupported'); e.type = 'unsupported'; throw e },
  }
})

await browser.close()
