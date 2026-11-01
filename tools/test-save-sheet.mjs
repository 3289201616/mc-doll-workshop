import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })

async function boot(ctx) {
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1600)
  await page.setInputFiles('#skinInput', {
    name: 'alice.png', mimeType: 'image/png',
    buffer: readFileSync('public/samples/alice.png'),
  })
  await page.waitForTimeout(1500)
  return { page, errs }
}

// ── 手机（无 Web Share）──
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const { page, errs } = await boot(mctx)
console.log('touch UI:', await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches))
let down = 0
page.on('download', () => { down += 1 })
await page.click('#shotBtn')
await page.waitForTimeout(700)
console.log('弹窗出现:', await page.isVisible('#saveModal'), '| 触发下载:', down)
console.log('保存到相册按钮可见:', await page.isVisible('#saveToAlbum'))
console.log('提示:', (await page.textContent('#saveHint')).slice(0, 40))
const img = await page.evaluate(() => {
  const el = document.querySelector('#saveShotImg')
  return { natural: `${el.naturalWidth}x${el.naturalHeight}`, shown: el.getBoundingClientRect().width | 0 }
})
console.log('图片:', JSON.stringify(img))
await page.screenshot({ path: 'preview/save-sheet-mobile.png' })

// 退回下载
const wait = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
await page.click('#saveAsDownload')
const d = await wait
console.log('退回下载:', d ? d.suggestedFilename() : '未触发')
await page.click('[data-close-save]')
await page.waitForTimeout(300)
console.log('关闭后隐藏:', !(await page.isVisible('#saveModal')))

// ── 手机 + 支持分享 ──
await page.addInitScript(() => {})
const page2 = await mctx.newPage()
await page2.addInitScript(() => {
  navigator.canShare = () => true
  navigator.share = async (data) => { window.__shared = { files: data.files?.length ?? 0, type: data.files?.[0]?.type, size: data.files?.[0]?.size } }
})
await page2.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page2.waitForTimeout(1600)
await page2.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page2.waitForTimeout(1400)
await page2.click('#shotBtn')
await page2.waitForTimeout(600)
console.log('分享模式 按钮可见:', await page2.isVisible('#saveToAlbum'))
await page2.click('#saveToAlbum')
await page2.waitForTimeout(500)
console.log('分享调用:', JSON.stringify(await page2.evaluate(() => window.__shared || null)))
console.log('mobile errors:', errs.slice(0, 3).join(' | ') || 'none')

// ── 桌面：仍然走下载 ──
const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const desk = await dctx.newPage()
await desk.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await desk.waitForTimeout(1600)
await desk.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await desk.waitForTimeout(1400)
await desk.click('#shotBtn')
await desk.waitForTimeout(500)
console.log('桌面: 下载提示', await desk.isVisible('#downloadModal'), '| 存图弹窗', await desk.isVisible('#saveModal'))
const wait2 = desk.waitForEvent('download', { timeout: 20000 }).catch(() => null)
await desk.click('#downloadContinue')
const d2 = await wait2
console.log('桌面下载:', d2 ? d2.suggestedFilename() : '未触发')
await browser.close()
