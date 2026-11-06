import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.setInputFiles('#skinInput', { name: 'alice.png', mimeType: 'image/png', buffer: readFileSync('public/samples/alice.png') })
await page.waitForTimeout(1600)

const shoot = (mirror) => page.evaluate(async (m) => {
  const s = window.__MCDOLL__.stage
  s.setAutoRotate(false)
  s.modelGroup.rotation.y = m ? 0.5 : -0.5
  s.modelGroup.scale.x = m ? -1 : 1
  const t = s.controls.target
  s.camera.position.set(t.x, t.y + s.radius * 0.16, t.z - s.radius * 2.4)
  s.camera.lookAt(t)
  s.controls.update()
  await new Promise((r) => setTimeout(r, 350))
  return s.canvas.toDataURL('image/png')
}, mirror)

writeFileSync('preview/head-now.png', Buffer.from((await shoot(false)).split(',')[1], 'base64'))
writeFileSync('preview/head-mirror.png', Buffer.from((await shoot(true)).split(',')[1], 'base64'))
await browser.close()
console.log('ok')
