/**
 * Bedrock geometry（format_version 1.12.0）→ three.js 网格。
 *
 * 只做一件事：把模型数据里「每个面各自一块贴图」的 uv 描述，还原成
 * 一张皮肤 PNG 上的正确采样坐标。所有约定都按 Minecraft 的来：
 *
 *   - 1 单位 = 1 像素 = 1/16 方块
 *   - north = -Z 是玩偶正面（皮肤上画着脸的那块）
 *   - 面贴图的 (u, v) 是「从外面看这个面」的左上角
 *   - uv_size 可以为负，表示朝反方向展开（镜像）
 *   - inflate 把方块整体外扩，第二层（帽子 / 外套）就靠它浮在皮肤外面
 */

import * as THREE from 'three'

/** 每个面 4 个角的顺序固定为：左上、右上、右下、左下。 */
const faceCorners = {
  north: (a) => [
    [a.x1, a.y1, a.z0],
    [a.x0, a.y1, a.z0],
    [a.x0, a.y0, a.z0],
    [a.x1, a.y0, a.z0],
  ],
  south: (a) => [
    [a.x0, a.y1, a.z1],
    [a.x1, a.y1, a.z1],
    [a.x1, a.y0, a.z1],
    [a.x0, a.y0, a.z1],
  ],
  east: (a) => [
    [a.x1, a.y1, a.z1],
    [a.x1, a.y1, a.z0],
    [a.x1, a.y0, a.z0],
    [a.x1, a.y0, a.z1],
  ],
  west: (a) => [
    [a.x0, a.y1, a.z0],
    [a.x0, a.y1, a.z1],
    [a.x0, a.y0, a.z1],
    [a.x0, a.y0, a.z0],
  ],
  up: (a) => [
    [a.x0, a.y1, a.z0],
    [a.x1, a.y1, a.z0],
    [a.x1, a.y1, a.z1],
    [a.x0, a.y1, a.z1],
  ],
  down: (a) => [
    [a.x0, a.y0, a.z1],
    [a.x1, a.y0, a.z1],
    [a.x1, a.y0, a.z0],
    [a.x0, a.y0, a.z0],
  ],
}

const FACE_ORDER = ['north', 'south', 'east', 'west', 'up', 'down']

const FACE_NORMALS = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
}

/** Minecraft 原版的面亮度：顶亮、底暗，背面比侧面稍亮。 */
const FACE_SHADE = {
  up: 1,
  down: 0.5,
  north: 0.8,
  south: 0.8,
  east: 0.6,
  west: 0.6,
}

const CORNER_ORDER = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

function deg2rad(value) {
  return (Number(value) || 0) * (Math.PI / 180)
}

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 取 geometry 描述对象，兼容单条和数组两种写法。 */
export function parseGeometry(source) {
  const geometry = source?.['minecraft:geometry'] ?? source?.geometry
  const entry = Array.isArray(geometry) ? geometry[0] : geometry
  if (!entry?.bones?.length) {
    throw new Error('这个 JSON 里没有找到 bones，不像是 Bedrock 模型文件')
  }
  const description = entry.description || {}
  return {
    identifier: description.identifier || 'geometry.custom',
    textureWidth: num(description.texture_width, 64) || 64,
    textureHeight: num(description.texture_height, 64) || 64,
    bones: entry.bones,
  }
}

/**
 * 旋转贴图采样坐标（uv_rotation）。绕面片中心转，等价于把整块贴图转过去。
 * 负的 uv_size 已经在 u0 + a*sw 里体现，所以这里只处理 0/1 归一化后的旋转。
 */
function rotateUV(cu, cv, rotation) {
  switch (rotation) {
    case 90:
    case -270:
      return [cv, 1 - cu]
    case 180:
    case -180:
      return [1 - cu, 1 - cv]
    case 270:
    case -90:
      return [1 - cv, cu]
    default:
      return [cu, cv]
  }
}

/**
 * 单个方块的 6 个面 → BufferGeometry。
 * 顶点先算成「方块原点坐标系」，再整体减去 cubePivot，交给分组去转。
 */
function buildCubeGeometry(cube, ctx, offset) {
  const size = cube.size || [0, 0, 0]
  const inflate = num(cube.inflate, 0)
  const origin = cube.origin || [0, 0, 0]
  const uv = cube.uv

  const box = {
    x0: num(origin[0]) - inflate,
    y0: num(origin[1]) - inflate,
    z0: num(origin[2]) - inflate,
    x1: num(origin[0]) + num(size[0]) + inflate,
    y1: num(origin[1]) + num(size[1]) + inflate,
    z1: num(origin[2]) + num(size[2]) + inflate,
  }

  const positions = []
  const uvs = []
  const normals = []
  const shades = []
  const indices = []

  const toNormalized = (u, v) => [u / ctx.textureWidth, 1 - v / ctx.textureHeight]

  // 体积为 0 的方块在游戏里也不可见，直接跳过省一个 draw call。
  if (box.x1 - box.x0 <= 0 || box.y1 - box.y0 <= 0 || box.z1 - box.z0 <= 0) return null

  for (const faceName of FACE_ORDER) {
    const face = uv?.[faceName]
    if (!face) continue

    const rotation = num(face.uv_rotation, 0)
    const [u0, v0] = face.uv || [0, 0]
    const [sw, sh] = face.uv_size || [0, 0]

    const corners = faceCorners[faceName](box)
    const base = positions.length / 3
    const normal = FACE_NORMALS[faceName]
    const shade = FACE_SHADE[faceName]

    for (let i = 0; i < 4; i += 1) {
      // 顶点摆到「相对 pivot」的坐标里，旋转中心才对得上。
      const [x, y, z] = corners[i]
      positions.push(x - offset[0], y - offset[1], z - offset[2])

      const [cu, cv] = rotateUV(CORNER_ORDER[i][0], CORNER_ORDER[i][1], rotation)
      const [u, v] = toNormalized(num(u0) + cu * num(sw), num(v0) + cv * num(sh))
      uvs.push(u, v)
      normals.push(normal[0], normal[1], normal[2])
      shades.push(shade, shade, shade)
    }

    // 用叉积判断绕序：反了就翻三角形，避免依赖手写顶点顺序的方向。
    const p0 = new THREE.Vector3(corners[0][0], corners[0][1], corners[0][2])
    const p1 = new THREE.Vector3(corners[1][0], corners[1][1], corners[1][2])
    const p2 = new THREE.Vector3(corners[2][0], corners[2][1], corners[2][2])
    const computed = p1.sub(p0).cross(p2.sub(p0))
    const expected = new THREE.Vector3(normal[0], normal[1], normal[2])
    const flip = computed.dot(expected) < 0

    if (flip) {
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
    } else {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  if (!indices.length) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3))
  geometry.setIndex(indices)
  return geometry
}

/**
 * 皮肤尺寸比模型声明的贴图尺寸小时（比如 64×32 的老皮肤），
 * 落在画布外的第二层就该消失，否则会采样到透明像素变成黑块。
 */
function isCubeOutsideSkin(cube, ctx) {
  const uv = cube.uv
  if (!uv) return false
  const limitU = ctx.limitWidth
  const limitV = ctx.limitHeight
  for (const faceName of FACE_ORDER) {
    const face = uv[faceName]
    if (!face) continue
    const [u0, v0] = face.uv || [0, 0]
    const [sw, sh] = face.uv_size || [0, 0]
    const uMin = Math.min(u0, u0 + sw)
    const uMax = Math.max(u0, u0 + sw)
    const vMin = Math.min(v0, v0 + sh)
    const vMax = Math.max(v0, v0 + sh)
    if (uMin < 0 || uMax > limitU || vMin < 0 || vMax > limitV) return true
  }
  return false
}

/**
 * 把整份几何构建成 Group 层级：骨骼 → 方块 → 网格。
 * 返回的 root 保持「像素单位」，由调用方决定要不要缩到方块单位。
 */
export function buildDollModel({
  geometry,
  material,
  unit = 1 / 16,
  rotationMode = 'cube',
  onWarning,
}) {
  const parsed = parseGeometry(geometry)
  const root = new THREE.Group()
  root.name = 'MCDoll'

  // 模型声明的贴图尺寸是坐标系；真实皮肤可能更大（HD）或更小（64×32 老皮肤）。
  const ctx = {
    textureWidth: parsed.textureWidth,
    textureHeight: parsed.textureHeight,
    limitWidth: parsed.textureWidth,
    limitHeight: parsed.textureHeight,
  }
  if (material?.userData?.skinSize) {
    const { width, height } = material.userData.skinSize
    const scale = width / parsed.textureWidth
    ctx.limitWidth = width / scale
    ctx.limitHeight = height / scale
  }

  let cubeCount = 0
  let overlayCount = 0
  let hiddenCount = 0

  for (const bone of parsed.bones) {
    const bonePivot = bone.pivot || [0, 0, 0]
    const boneGroup = new THREE.Group()
    boneGroup.name = bone.name || 'bone'
    boneGroup.userData.bone = bone.name
    boneGroup.position.set(num(bonePivot[0]), num(bonePivot[1]), num(bonePivot[2]))
    if (bone.rotation) {
      const [rx, ry, rz] = bone.rotation
      boneGroup.rotation.set(deg2rad(rx), deg2rad(ry), deg2rad(rz))
    }
    root.add(boneGroup)

    for (const cube of bone.cubes || []) {
      if (isCubeOutsideSkin(cube, ctx)) {
        hiddenCount += 1
        continue
      }

      // 方块的旋转中心：自己带 pivot 就用它，否则跟随骨骼 pivot。
      const cubePivot = cube.pivot || bonePivot
      let pivotAbs = [num(cubePivot[0]), num(cubePivot[1]), num(cubePivot[2])]
      if (rotationMode === 'bone') pivotAbs = [num(bonePivot[0]), num(bonePivot[1]), num(bonePivot[2])]
      if (rotationMode === 'center') {
        const cubeOrigin = cube.origin || [0, 0, 0]
        const cubeSize = cube.size || [0, 0, 0]
        pivotAbs = [
          num(cubeOrigin[0]) + num(cubeSize[0]) / 2,
          num(cubeOrigin[1]) + num(cubeSize[1]) / 2,
          num(cubeOrigin[2]) + num(cubeSize[2]) / 2,
        ]
      }
      const offset = [
        pivotAbs[0] - num(bonePivot[0]),
        pivotAbs[1] - num(bonePivot[1]),
        pivotAbs[2] - num(bonePivot[2]),
      ]

      // 顶点相对 pivotAbs 摆放（旋转中心才对），分组再把它挪到骨骼坐标系里。
      const geometry2 = buildCubeGeometry(cube, ctx, pivotAbs)
      if (!geometry2) continue

      const mesh = new THREE.Mesh(geometry2, material)
      mesh.name = `${bone.name || 'bone'}_cube${cubeCount}`
      mesh.frustumCulled = false
      mesh.userData.isOverlay = num(cube.inflate, 0) > 0
      mesh.userData.bone = bone.name

      if (cube.rotation && rotationMode !== 'none') {
        const cubeGroup = new THREE.Group()
        cubeGroup.name = `${mesh.name}_pivot`
        cubeGroup.position.set(offset[0], offset[1], offset[2])
        // Bedrock 的模型坐标系和 three 的手性不同：绕 X、Z 的旋转角要取反才能对上，
        // 绕 Y 的保持原样。直接照抄角度会让胳膊甩到身体里面去。
        const flip = rotationMode === 'flip' ? -1 : 1
        cubeGroup.rotation.set(
          deg2rad(cube.rotation[0]) * flip,
          deg2rad(cube.rotation[1]),
          deg2rad(cube.rotation[2]) * flip,
        )
        cubeGroup.add(mesh)
        boneGroup.add(cubeGroup)
      } else {
        mesh.position.set(offset[0], offset[1], offset[2])
        boneGroup.add(mesh)
      }

      cubeCount += 1
      if (mesh.userData.isOverlay) overlayCount += 1
    }
  }

  // 骨骼 pivot 是绝对坐标，把整个模型挪回原点附近，方便旋转和导出。
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) throw new Error('模型没有可显示的方块')
  const center = box.getCenter(new THREE.Vector3())
  const wrapper = new THREE.Group()
  wrapper.name = 'MCDollRoot'
  wrapper.add(root)
  root.position.set(-center.x, -box.min.y, -center.z)

  const sizeBox = new THREE.Box3().setFromObject(wrapper)
  const size = sizeBox.getSize(new THREE.Vector3())

  if (hiddenCount > 0 && onWarning) {
    onWarning(`皮肤尺寸比模型小，已隐藏 ${hiddenCount} 个贴图越界的方块`)
  }

  const applyUnit = (value) => {
    wrapper.scale.setScalar(value)
    wrapper.updateMatrixWorld(true)
  }
  applyUnit(unit)

  return {
    root: wrapper,
    stats: {
      identifier: parsed.identifier,
      bones: parsed.bones.length,
      cubes: cubeCount,
      overlays: overlayCount,
      hidden: hiddenCount,
      sizePixels: size.clone(),
      size: size.clone().multiplyScalar(unit),
    },
    setUnit: applyUnit,
    setOverlayVisible(visible) {
      wrapper.traverse((child) => {
        if (child.isMesh && child.userData.isOverlay) child.visible = visible
      })
    },
  }
}

export function disposeObject(object) {
  object?.traverse((child) => {
    if (!child.isMesh) return
    child.geometry?.dispose()
  })
}
