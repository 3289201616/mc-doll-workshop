import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
const b64 = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 64; c.height = 64
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#dddddd'
  ctx.fillRect(0, 0, 64, 64)
  // 头顶：上半（y 0-4）蓝，下半橙；第一层和帽子层都标
  ctx.fillStyle = '#2050e0'
  ctx.fillRect(8, 0, 8, 4)
  ctx.fillRect(40, 0, 8, 4)
  ctx.fillStyle = '#f08000'
  ctx.fillRect(8, 4, 8, 4)
  ctx.fillRect(40, 4, 8, 4)
  return c.toDataURL('image/png').split(',')[1]
})
await page.setInputFiles('#skinInput', { name: 'top.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(1800)
await page.evaluate(() => window.__MCDOLL__.stage.setAutoRotate(false))
await page.waitForTimeout(300)
// 从上方偏前（-Z 侧）看头顶
const shot = await page.evaluate(async () => {
  const s = window.__MCDOLL__.stage
  s.modelGroup.rotation.y = 0
  const t = s.controls.target
  s.camera.position.set(t.x, t.y + s.radius * 3.2, t.z - s.radius * 1.8)
  s.camera.lookAt(t)
  s.controls.update()
  await new Promise((r) => setTimeout(r, 300))
  return s.canvas.toDataURL('image/png')
})
writeFileSync('preview/top-mcdoll.png', Buffer.from(shot.split(',')[1], 'base64'))
await browser.close()
console.log('ok')
