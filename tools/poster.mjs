import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('publish', { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)

// 定住角度，取一张干净的渲染图
await page.evaluate(() => {
  const s = window.__MCDOLL__.stage
  s.setAutoRotate(false)
  s.spin = -0.34
  s.modelGroup.rotation.y = -0.34
  s.fit()
})

const shot = await page.evaluate(() => window.__MCDOLL__.stage.capture(1024, 'studio'))
const poster = await page.evaluate(async (dataUrl) => {
  const img = new Image()
  await new Promise((resolve) => {
    img.onload = resolve
    img.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, 1024, 1024)

  // 顶部压一层柔光，让标题在渐变上也读得清
  const scrim = ctx.createLinearGradient(0, 0, 0, 340)
  scrim.addColorStop(0, 'rgba(250, 245, 236, 0.95)')
  scrim.addColorStop(0.55, 'rgba(250, 245, 236, 0.72)')
  scrim.addColorStop(1, 'rgba(250, 245, 236, 0)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, 0, 1024, 340)

  const font = (size, weight = '700') => `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`

  ctx.textAlign = 'center'
  ctx.fillStyle = '#2f2b26'
  ctx.font = font(80)
  ctx.fillText('MC 玩偶工坊', 512, 132)

  ctx.font = font(30, '400')
  ctx.fillStyle = '#6f675c'
  ctx.fillText('皮肤进 · 玩偶出 · 模型带走', 512, 190)

  const chips = ['GLB', 'glTF', 'FBX', 'OBJ']
  ctx.font = font(24, '600')
  const widths = chips.map((text) => ctx.measureText(text).width + 44)
  const total = widths.reduce((a, b) => a + b, 0) + 12 * (chips.length - 1)
  let x = 512 - total / 2
  for (let i = 0; i < chips.length; i += 1) {
    const w = widths[i]
    ctx.fillStyle = 'rgba(255, 253, 249, 0.86)'
    ctx.beginPath()
    ctx.roundRect(x, 928, w, 46, 23)
    ctx.fill()
    ctx.strokeStyle = 'rgba(198, 93, 51, 0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#c65d33'
    ctx.fillText(chips[i], x + w / 2, 960)
    x += w + 12
  }

  return canvas.toDataURL('image/png')
}, shot)

writeFileSync('publish/poster.png', Buffer.from(poster.split(',')[1], 'base64'))
console.log('poster ok')

// 图标：把玩偶裁到铺满，小尺寸下也认得出
const icon = await page.evaluate(async (dataUrl) => {
  const img = new Image()
  await new Promise((resolve) => {
    img.onload = resolve
    img.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f3ead9'
  ctx.fillRect(0, 0, 512, 512)
  // 取渲染图中间偏下的一块，让玩偶占满图标
  const sw = 620
  const sh = 620
  const sx = 512 - sw / 2
  const sy = 170
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 512, 512)
  return canvas.toDataURL('image/png')
}, shot)

writeFileSync('publish/icon.png', Buffer.from(icon.split(',')[1], 'base64'))
console.log('icon ok')

await browser.close()
