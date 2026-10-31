import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = 'preview'
mkdirSync(OUT, { recursive: true })
const url = process.argv[2] || 'http://127.0.0.1:5180/'

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
const logs = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

// 关掉自动旋转，用固定机位逐角度看
const angles = [
  { name: 'front', yaw: 0, elev: 0.12 },
  { name: 'left', yaw: Math.PI / 2, elev: 0.12 },
  { name: 'back', yaw: Math.PI, elev: 0.12 },
  { name: 'top', yaw: 0, elev: 0.75 },
]

await page.evaluate(() => {
  const s = window.__MCDOLL__.stage
  s.setAutoRotate(false)
  s.spin = 0
  s.modelGroup.rotation.y = 0
  s.fit()
})

for (const angle of angles) {
  await page.evaluate((a) => {
    const s = window.__MCDOLL__.stage
    s.modelGroup.rotation.y = a.yaw
    const d = s.fitDistance()
    const t = s.controls.target
    s.camera.position.set(t.x, t.y + s.radius * a.elev * 3, t.z - d)
    s.camera.lookAt(t)
    s.controls.update()
    s.renderer.render(s.scene, s.camera)
  }, angle)
  await page.waitForTimeout(120)
  const canvas = await page.$('#stage')
  await canvas.screenshot({ path: `${OUT}/angle-${angle.name}.png` })
}

const report = await page.evaluate(() => window.__MCDOLL__.getStats())
console.log('stats', JSON.stringify(report))
console.log(logs.join('\n') || '(no errors)')
await browser.close()
