/**
 * 把左肢（LeftArm / LeftLeg）的 UV 重算成「右肢 UV 的镜像」。
 *
 * 背景：皮肤里左肢方块是右肢方块的水平镜像。模型原本是把右肢的相对偏移
 * 原样搬到左肢，于是每个面都取到了相邻那条竖带（偏 4 px），第一层第二层一起偏。
 *
 * 做法：对左肢每个方块，逐个面取右肢对应面的 UV，在块内水平镜像后再写回：
 *   - 镜像只移动矩形位置，方向沿用右肢那一面（左右/上下翻转的符号不变）
 *   - 东西面要互换：左臂的 +X 面朝身体内侧，右臂的 +X 面朝外
 *   - 有 uv_rotation 的面，先把旋转展开成四个角的坐标，算完再折回 uv + uv_size
 *
 * 用法：node tools/_mirrorleft.mjs <输出目录1> [输出目录2 ...]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_DIR = 'src/geo'
const PAIRS = [
  ['LeftArm', 'RightArm'],
  ['LeftLeg', 'RightLeg'],
]
const SWAP_EW = { north: 'north', south: 'south', up: 'up', down: 'down', east: 'west', west: 'east' }

function rotateUV(cu, cv, rotation) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [cv, 1 - cu]
    case 180:
      return [1 - cu, 1 - cv]
    case 270:
      return [1 - cv, cu]
    default:
      return [cu, cv]
  }
}

/** 按 geometry.js 的算法把 (uv, uv_size, uv_rotation) 展开成四个角的纹理坐标 */
const ORDER = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

function faceCorners(face) {
  const [u0, v0] = face.uv || [0, 0]
  const [sw, sh] = face.uv_size || [0, 0]
  const rotation = Number(face.uv_rotation) || 0
  return ORDER.map(([cu, cv]) => {
    const [ru, rv] = rotateUV(cu, cv, rotation)
    return [u0 + ru * sw, v0 + rv * sh]
  })
}

function bounds(cube) {
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (const face of Object.values(cube.uv)) {
    for (const [u, v] of faceCorners(face)) {
      uMin = Math.min(uMin, u)
      uMax = Math.max(uMax, u)
      vMin = Math.min(vMin, v)
      vMax = Math.max(vMax, v)
    }
  }
  return { uMin, uMax, vMin, vMax }
}

/**
 * 已知四个视觉角想要的纹理坐标，反解出 (uv, uv_size, uv_rotation)。
 * 逐个尝试 0/90/180/270，找出能精确复现这四点的组合。
 */
function solveFace(target) {
  for (const rotation of [0, 90, 180, 270]) {
    const pat = ORDER.map(([cu, cv]) => rotateUV(cu, cv, rotation))
    let sw = null
    let sh = null
    for (let i = 0; i < 4 && sw === null; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        const d = pat[j][0] - pat[i][0]
        if (Math.abs(Math.abs(d) - 1) < 1e-9) {
          sw = (target[j][0] - target[i][0]) / d
          break
        }
      }
    }
    for (let i = 0; i < 4 && sh === null; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        const d = pat[j][1] - pat[i][1]
        if (Math.abs(Math.abs(d) - 1) < 1e-9) {
          sh = (target[j][1] - target[i][1]) / d
          break
        }
      }
    }
    if (sw === null || sh === null) continue
    const u0 = target[0][0] - pat[0][0] * sw
    const v0 = target[0][1] - pat[0][1] * sh
    const ok = target.every(
      (point, r) =>
        Math.abs(u0 + pat[r][0] * sw - point[0]) < 1e-6 &&
        Math.abs(v0 + pat[r][1] * sh - point[1]) < 1e-6,
    )
    if (!ok) continue
    const face = { uv: [round(u0), round(v0)], uv_size: [round(sw), round(sh)] }
    if (rotation) face.uv_rotation = rotation
    return face
  }
  throw new Error(`四角解不出面参数：${JSON.stringify(target)}`)
}

const round = (value) => {
  const r = Math.round(value * 10000) / 10000
  return Object.is(r, -0) ? 0 : r
}

function mirrorCube(left, right) {
  const bl = bounds(left)
  const br = bounds(right)
  const widthL = bl.uMax - bl.uMin
  const widthR = br.uMax - br.uMin
  // 粗胳膊块宽 16、纤细模型 3 px 胳膊块宽 14，只要左右一致就行
  if (Math.abs(widthL - widthR) > 0.01) {
    throw new Error(`左右块宽不一致（左 ${widthL} / 右 ${widthR}），不敢继续`)
  }
  // C：把右块的 u 镜像到左块要用的轴 = 左块左边界 + 右块右边界
  const C = bl.uMin + br.uMax
  const dv = bl.vMin - br.vMin
  // 视觉左右翻转：角 0↔1、2↔3
  const FLIP = [1, 0, 3, 2]

  const out = {}
  for (const faceName of Object.keys(right.uv)) {
    const sourceName = SWAP_EW[faceName]
    const source = right.uv[sourceName]
    if (!source) throw new Error(`${faceName} 找不到对应面 ${sourceName}`)
    const src = faceCorners(source)
    // 左面每个视觉角去取右面「镜像位置」上的那个点：u 镜像、v 平移
    const target = FLIP.map((partner) => [C - src[partner][0], src[partner][1] + dv])
    out[faceName] = solveFace(target)
  }
  return out
}

/** 面对象内联成一行（和原文件一致），其余对象多行 + tab 缩进 */
const INLINE_KEYS = new Set(['uv', 'uv_size', 'uv_rotation'])
const isFaceLike = (node) =>
  node && typeof node === 'object' && !Array.isArray(node) &&
  Object.keys(node).length > 0 && Object.keys(node).every((k) => INLINE_KEYS.has(k))
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
if (!targets.length) throw new Error('用法：node tools/_mirrorleft.mjs <输出目录> [...]')

for (const file of ['steve.json', 'alex.json']) {
  const data = JSON.parse(readFileSync(join(SOURCE_DIR, file), 'utf8'))
  const bones = data['minecraft:geometry'][0].bones
  const byName = new Map(bones.map((b) => [b.name, b]))

  for (const [leftName, rightName] of PAIRS) {
    const left = byName.get(leftName)
    const right = byName.get(rightName)
    if (!left?.cubes || !right?.cubes) throw new Error(`缺骨骼 ${leftName}/${rightName}`)
    const count = Math.min(left.cubes.length, right.cubes.length)
    for (let i = 0; i < count; i += 1) {
      const mirrored = mirrorCube(left.cubes[i], right.cubes[i])
      for (const [faceName, face] of Object.entries(mirrored)) {
        left.cubes[i].uv[faceName] = face
      }
    }
    console.log(`${file} ${leftName}: ${count} 个方块的 UV 已按右肢镜像重算`)
  }

  const text = stringify(data)
  for (const dir of targets) {
    writeFileSync(join(dir, file), text)
    console.log(`  -> ${join(dir, file)}`)
  }
}
