/**
 * 预览舞台：一台相机、一盏主光、一块影子地面。
 * 模型正面朝 -Z（Minecraft 的 north），所以默认机位也放在 -Z 侧，
 * 打开就是脸朝你，导出去的模型方向和游戏里一致。
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const START_YAW = -0.5

const BACKDROP = {
  studio: ['#fbf7f0', '#e8ddcb'],
  white: ['#ffffff', '#ffffff'],
  dark: ['#2b2a28', '#181817'],
}

function createShadowTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(58, 42, 30, 0.42)')
  gradient.addColorStop(0.45, 'rgba(58, 42, 30, 0.2)')
  gradient.addColorStop(1, 'rgba(58, 42, 30, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createBackdropTexture(kind, size) {
  const [from, to] = BACKDROP[kind] || BACKDROP.studio
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.36,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.78,
  )
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class DollStage {
  constructor({ canvas, viewport }) {
    this.canvas = canvas
    this.viewport = viewport
    this.running = false
    this.autoRotate = true
    this.spin = 0

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // 不做色调映射：原版皮肤是纯色块，ACES 会把颜色压灰，
    // 而导出的 GLB/FBX 在别的查看器里不会有这层映射，预览要和导出一致。
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.setClearColor(0x000000, 0)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.01, 200)
    this.camera.position.set(0, 1.6, -4)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = Math.PI / 2 + 0.06
    this.controls.rotateSpeed = 0.85
    this.controls.zoomSpeed = 0.8

    this.modelGroup = new THREE.Group()
    this.scene.add(this.modelGroup)

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9c8f7c, 1.15)
    this.scene.add(this.hemi)

    this.key = new THREE.DirectionalLight(0xfff4e2, 2.4)
    this.key.position.set(-2.4, 4.2, -3.4)
    this.scene.add(this.key)

    this.fill = new THREE.DirectionalLight(0xd8e6ff, 1.1)
    this.fill.position.set(3.4, 2.2, -1.4)
    this.scene.add(this.fill)

    this.rim = new THREE.DirectionalLight(0xffd9c2, 1.6)
    this.rim.position.set(0.6, 3.2, 4.2)
    this.scene.add(this.rim)

    this.shadowMaterial = new THREE.MeshBasicMaterial({
      map: createShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    })
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMaterial)
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.001
    this.shadow.renderOrder = 1
    this.scene.add(this.shadow)

    this.model = null
    this.focus = new THREE.Vector3(0, 0.4, 0)
    this.radius = 1
    this.setBackdrop('studio')

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(viewport)
    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  setModel(built) {
    if (this.model) {
      this.modelGroup.remove(this.model.root)
      this.model.root.traverse((child) => {
        if (child.isMesh) child.geometry.dispose()
      })
    }
    this.model = built
    // 起始角度偏一点，一进页面就是能看见脸的 3/4 视角，而不是后脑勺。
    this.spin = START_YAW
    this.modelGroup.rotation.y = START_YAW
    this.modelGroup.add(built.root)

    const box = new THREE.Box3().setFromObject(built.root)
    const size = box.getSize(new THREE.Vector3())
    this.focus.set(0, size.y * 0.52, 0)
    // 用外接球半径而不是最长边：转到 3/4 角度时投影宽度会超过单边尺寸。
    this.radius = size.length() * 0.5

    const span = Math.max(size.x, size.z) * 1.35
    this.shadow.scale.set(span, span, 1)

    this.controls.target.copy(this.focus)
    this.fit()
  }

  setMaterial(material) {
    this.model?.root.traverse((child) => {
      if (child.isMesh) child.material = material
    })
  }

  setAutoRotate(enabled) {
    this.autoRotate = Boolean(enabled)
  }

  setBackdrop(kind) {
    const allowed = ['studio', 'white', 'dark', 'transparent']
    this.backdrop = allowed.includes(kind) ? kind : 'studio'
    allowed.forEach((name) => {
      this.viewport.classList.toggle(`bg-${name}`, name === this.backdrop)
    })
    // 透明背景时不要那块落地阴影，否则导出会带一团灰。
    this.shadow.visible = this.backdrop !== 'transparent'
  }

  fitDistance(aspect = this.camera.aspect) {
    const fov = (this.camera.fov * Math.PI) / 180
    const vFit = this.radius / Math.tan(fov / 2)
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * Math.max(0.35, aspect))
    const hFit = this.radius / Math.tan(hFov / 2)
    return Math.max(vFit, hFit) * 1.16
  }

  fit() {
    const distance = this.fitDistance()
    const target = this.controls.target
    // 机位放在 -Z：那是模型正面（north）。
    this.camera.position.set(target.x, target.y + this.radius * 0.16, target.z - distance)
    this.camera.lookAt(target)
    this.camera.near = Math.max(0.005, distance - this.radius * 6)
    this.camera.far = distance + this.radius * 12
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  resetView() {
    this.modelGroup.rotation.y = START_YAW
    this.spin = START_YAW
    this.fit()
  }

  resize() {
    const rect = this.viewport.getBoundingClientRect()
    const width = Math.max(2, Math.round(rect.width))
    const height = Math.max(2, Math.round(rect.height))
    if (!width || !height) return
    if (width === this.lastW && height === this.lastH) return
    this.lastW = width
    this.lastH = height
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  start() {
    if (this.running) return
    this.running = true
    let last = performance.now()
    const tick = (now) => {
      if (!this.running) return
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (this.autoRotate && !document.hidden) {
        this.spin += dt * 0.55
        this.modelGroup.rotation.y = this.spin
      }
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
      this.requestId = requestAnimationFrame(tick)
    }
    this.requestId = requestAnimationFrame(tick)
  }

  /** 截一张海报级的图，顺带把背景画进去（画布本身是透明的）。 */
  capture(size = 1200, backdrop = this.backdrop || 'studio') {
    if (!this.model) return null
    const aspect = this.camera.aspect
    const position = this.camera.position.clone()
    const previousBackground = this.scene.background

    this.camera.aspect = 1
    this.camera.updateProjectionMatrix()
    // setSize 会乘上像素比：高分屏上 1400 会变成 4200，存出来的图又大又糊不准。
    // 导出按 1:1 出像素，设备无关。
    const previousPixelRatio = this.renderer.getPixelRatio()
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(size, size, false)

    const distance = this.fitDistance(1)
    this.camera.position.set(
      this.controls.target.x,
      this.controls.target.y + this.radius * 0.16,
      this.controls.target.z - distance,
    )
    this.camera.lookAt(this.controls.target)

    // 透明背景就什么都不画，让 PNG 的 alpha 直接透出来。
    const texture =
      backdrop === 'transparent' ? null : createBackdropTexture(backdrop, Math.min(1024, size))
    this.scene.background = texture
    const shadowWasVisible = this.shadow.visible
    if (backdrop === 'transparent') this.shadow.visible = false

    this.renderer.render(this.scene, this.camera)
    const url = this.canvas.toDataURL('image/png')

    this.shadow.visible = shadowWasVisible
    this.scene.background = previousBackground
    texture?.dispose()
    this.camera.aspect = aspect
    this.camera.position.copy(position)
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(previousPixelRatio)
    this.lastW = 0
    this.lastH = 0
    this.resize()
    return url
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.requestId)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
  }
}
