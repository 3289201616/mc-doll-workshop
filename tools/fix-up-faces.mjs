/**
 * 修正「朝上的面」朝向。
 *
 * geometry.js / doll.js 里 faceCorners.up 的四个角顺序是
 * (minX,minZ) (maxX,minZ) (maxX,maxZ) (minX,maxZ)，而皮肤模板里头顶块的
 * 贴图底边（v 最大那行）对应的是**正面**、左边（u 最小那列）对应角色**右侧**。
 * 两者相差 180°，所以头/身体/胳膊的顶面一直整体转反了（腿除外：
 * 作者在腿上用了 uv_rotation: 180 已经补偿过）。
 *
 * 补法：把 up 面转 180° —— uv 取对角，uv_size 两个分量都取负。
 *
 * 用法：node tools/fix-up-faces.mjs <输出目录> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_DIR = 'src/geo'
// 腿上的 up 已经有 uv_rotation，别再动
const BONES = ['Head', 'Body', 'LeftArm', 'RightArm']

const round = (value) => {
  const r = Math.round(value * 10000) / 10000
  return Object.is(r, -0) ? 0 : r
}

function rotate180(face) {
  if (Number(face.uv_rotation) || 0) return face
  const [u0, v0] = face.uv || [0, 0]
  const [w, h] = face.uv_size || [0, 0]
  return { uv: [round(u0 + w), round(v0 + h)], uv_size: [round(-w), round(-h)] }
}

const INLINE_KEYS = new Set(['uv', 'uv_size', 'uv_rotation'])
const isFaceLike = (node) =>
  node &&
  typeof node === 'object' &&
  !Array.isArray(node) &&
  Object.keys(node).length > 0 &&
  Object.keys(node).every((k) => INLINE_KEYS.has(k))
const isPrimitiveArray = (node) =>
  Array.isArray(node) && node.every((v) => typeof v !== 'object' || v === null)

function stringify(node, depth = 0) {
  const pad = '\t'.repeat(depth)
  const padIn = '\t'.repeat(depth + 1)
  if (Array.isArray(node)) {
    if (isPrimitiveArray(node)) return `[${node.map((v) => JSON.stringify(v)).join(', ')}]`
    const body = node.map((v) => `${padIn}${stringify(v, depth + 1)}`).join(',\n')
    return `[\n${body}\n${pad}]`
  }
  if (node === null || typeof node !== 'object') return JSON.stringify(node)
  const entries = Object.entries(node)
  if (!entries.length) return '{}'
  if (isFaceLike(node)) {
    const body = entries
      .map(([k, v]) => `${JSON.stringify(k)}: ${isPrimitiveArray(v) ? stringify(v) : JSON.stringify(v)}`)
      .join(', ')
    return `{${body}}`
  }
  const body = entries
    .map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${stringify(v, depth + 1)}`)
    .join(',\n')
  return `{\n${body}\n${pad}}`
}

const targets = process.argv.slice(2)
if (!targets.length) throw new Error('用法：node tools/fix-up-faces.mjs <输出目录> [...]')

for (const file of ['steve.json', 'alex.json']) {
  const data = JSON.parse(readFileSync(join(SOURCE_DIR, file), 'utf8'))
  const bones = data['minecraft:geometry'][0].bones
  for (const bone of bones) {
    if (!BONES.includes(bone.name)) continue
    let count = 0
    for (const cube of bone.cubes || []) {
      if (!cube.uv?.up) continue
      if (Number(cube.uv.up.uv_rotation) || 0) continue
      cube.uv.up = rotate180(cube.uv.up)
      count += 1
    }
    console.log(`${file} ${bone.name}: 修正 ${count} 个顶面`)
  }
  const text = stringify(data)
  for (const dir of targets) {
    writeFileSync(join(dir, file), text)
    console.log(`  -> ${join(dir, file)}`)
  }
}
