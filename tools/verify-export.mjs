import { chromium } from 'playwright-core'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('preview/exports')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const results = []
for (const format of ['glb', 'gltf', 'fbx', 'obj']) {
  await page.click(`#formatSeg button[data-format="${format}"]`)
  const waitFor = page.waitForEvent('download', { timeout: 45000 })
  await page.click('#exportBtn')
  const download = await waitFor
  const name = download.suggestedFilename()
  const path = resolve(OUT, name)
  await download.saveAs(path)
  await page.waitForTimeout(500)
  results.push({ format, name, path })
  console.log('saved', format, name)
}

console.log('--- 页面错误 ---')
console.log(errors.join('\n') || '(none)')
console.log('--- 导出结果 ---')
console.log(JSON.stringify(results, null, 2))
await browser.close()
