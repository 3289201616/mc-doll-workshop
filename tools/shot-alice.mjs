import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page.waitForTimeout(1800)
const shot = await page.evaluate(async () => {
  const s = window.__MCDOLL__.stage
  s.setAutoRotate(false)
  s.modelGroup.rotation.y = -0.5
  const t = s.controls.target
  s.camera.position.set(t.x, t.y + s.radius * 0.16, t.z - s.radius * 2.6)
  s.camera.lookAt(t)
  s.controls.update()
  await new Promise((r) => setTimeout(r, 400))
  return s.canvas.toDataURL('image/png')
})
writeFileSync('preview/alice-yaw.png', Buffer.from(shot.split(',')[1], 'base64'))
await browser.close()
console.log('ok')
