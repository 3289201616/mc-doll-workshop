import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const b64 = await page.evaluate(async () => {
  const img = new Image(); img.src = './samples/alice.png'; await img.decode()
  const c = document.createElement('canvas'); c.width = 64; c.height = 32
  c.getContext('2d').drawImage(img, 0, 0)
  return c.toDataURL('image/png').split(',')[1]
})
await page.setInputFiles('#skinInput', { name: 'legacy.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
await page.waitForTimeout(1600)

await page.evaluate(() => localStorage.setItem('mcdoll_download_tip_off', '1'))
const wait = page.waitForEvent('download', { timeout: 60000 })
await page.click('#exportBtn')
const d = await wait
const path = 'preview/legacy-export.glb'
await d.saveAs(path)
console.log('下载:', d.suggestedFilename(), '->', path)
await browser.close()

// 解析 GLB 里内嵌 PNG 的尺寸
const buf = readFileSync(path)
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
let off = 12, json, bin
while (off < buf.length) {
  const len = dv.getUint32(off, true)
  const type = dv.getUint32(off + 4, true)
  const chunk = buf.subarray(off + 8, off + 8 + len)
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk))
  if (type === 0x004e4942) bin = chunk
  off += 8 + len
}
const view = json.bufferViews[json.images[0].bufferView]
const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
const w = png.readUInt32BE(16)
const h = png.readUInt32BE(20)
console.log('GLB 内嵌贴图:', `${w}x${h}`, '| 字节', png.length, '| mime', json.images[0].mimeType)
