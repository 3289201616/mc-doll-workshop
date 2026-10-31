import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })

const url = 'http://127.0.0.1:5181/'
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

// 1. 第一次导出：应该弹窗，且不下载
let downloads = 0
page.on('download', () => { downloads += 1 })
await page.click('#exportBtn')
await page.waitForTimeout(700)
const modalVisible = await page.isVisible('#downloadModal')
console.log('1) 点导出后弹窗:', modalVisible, '| 已下载次数:', downloads)
await page.screenshot({ path: 'preview/tip-modal.png' })

// 2. 点「知道了，继续保存」：应该开始下载
const wait1 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
await page.click('#downloadContinue')
const d1 = await wait1
console.log('2) 继续保存 -> 下载:', d1 ? d1.suggestedFilename() : '未触发')

// 3. 刷新后再导出：应该仍然弹窗（还没选不再提醒）
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.click('#exportBtn')
await page.waitForTimeout(600)
console.log('3) 刷新后再导出仍弹窗:', await page.isVisible('#downloadModal'))

// 4. 选「以后不再提醒」
const wait2 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
await page.click('#downloadMute')
const d2 = await wait2
console.log('4) 不再提醒 -> 下载:', d2 ? d2.suggestedFilename() : '未触发')

// 5. 再刷新，导出应直接下载、不弹窗
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const wait3 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
await page.click('#exportBtn')
const d3 = await wait3
console.log('5) 静默模式 -> 弹窗:', await page.isVisible('#downloadModal'), '| 下载:', d3 ? d3.suggestedFilename() : '未触发')

// 6. 预览图也走同一道闸
await page.evaluate(() => localStorage.removeItem('mcdoll_download_tip_off'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.click('#shotBtn')
await page.waitForTimeout(500)
console.log('6) 存预览图也弹窗:', await page.isVisible('#downloadModal'))

console.log('errors:', errs.join(' | ') || 'none')
await browser.close()
