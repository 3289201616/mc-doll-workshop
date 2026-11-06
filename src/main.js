import './styles.css'
import * as THREE from 'three'
import alexGeo from './geo/alex.json'
import steveGeo from './geo/steve.json'
import { readSkin, createSkinTexture, canvasToPngBytes, validateSkinFile } from './skin.js'
import { buildDollModel, parseGeometry, disposeObject } from './geometry.js'
import { DollStage } from './stage.js'
import { buildExport, packZip, FORMATS } from './exporters.js'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))

const GEOMETRY_PRESETS = { alex: alexGeo, steve: steveGeo }
const STORAGE_KEY = 'mcdoll_settings_v1'

const BODY_HINT = {
  alex: 'Alex 的胳膊 3 像素宽，配细胳膊皮肤才不会裁边。',
  steve: 'Steve 的胳膊 4 像素宽，老皮肤基本都是这一套。',
  custom: '正在用你的 json 模型，体型由那份骨骼决定；贴图尺寸不限。',
}

const state = {
  skin: null,
  texture: null,
  body: 'alex',
  geometry: alexGeo,
  geometryName: 'alex',
  overlay: true,
  autoRotate: true,
  material: 'flat',
  backdrop: 'studio',
  format: 'glb',
}

let stage = null
let built = null
let flatMaterial = null
let litMaterial = null
let busy = false
let dragDepth = 0

/* ── 设置持久化 ─────────────────────────────────── */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (['alex', 'steve'].includes(saved.body)) state.body = saved.body
    if (['flat', 'lit'].includes(saved.material)) state.material = saved.material
    if (['studio', 'white', 'dark', 'transparent'].includes(saved.backdrop)) {
      state.backdrop = saved.backdrop
    }
    if (typeof saved.overlay === 'boolean') state.overlay = saved.overlay
    if (typeof saved.autoRotate === 'boolean') state.autoRotate = saved.autoRotate
    if (FORMATS.some((item) => item.id === saved.format)) state.format = saved.format
  } catch {
    /* 隐私模式下 localStorage 可能不可用，用默认值就行 */
  }
  state.geometry = GEOMETRY_PRESETS[state.body]
  state.geometryName = state.body
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        body: state.body,
        material: state.material,
        backdrop: state.backdrop,
        overlay: state.overlay,
        autoRotate: state.autoRotate,
        format: state.format,
      }),
    )
  } catch {
    /* ignore */
  }
}

/* ── 提示 ───────────────────────────────────────── */

function toast(message, kind = 'info', duration = 3200) {
  const stack = $('#toastStack')
  const node = document.createElement('div')
  node.className = `toast is-${kind}`
  node.textContent = message
  stack.appendChild(node)
  window.setTimeout(() => {
    node.classList.add('is-out')
    window.setTimeout(() => node.remove(), 240)
  }, duration)
}

/* ── 材质 ───────────────────────────────────────── */

function buildMaterials() {
  if (!state.texture) return null
  // 换皮肤 / 换体型会重建材质，旧的必须先放掉，不然每次切换都在漏 GPU 资源。
  flatMaterial?.dispose()
  litMaterial?.dispose()

  const shared = {
    map: state.texture,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.FrontSide,
  }

  // 原版观感：面明暗已经烘进顶点色，材质本身不吃光，放到哪个查看器都一致。
  flatMaterial = new THREE.MeshBasicMaterial({ ...shared, vertexColors: true })
  flatMaterial.name = 'doll_skin'
  const skinSize = {
    width: state.skin.canvas.width,
    height: state.skin.canvas.height,
    // 非标准尺寸的贴图（自定义模型）整张铺满 UV 空间，不做越界裁剪
    freeform: Boolean(state.skin.freeform),
  }
  flatMaterial.userData.skinSize = skinSize

  // 柔和光照：关掉顶点色，交给场景灯和 PBR，适合打光出图。
  litMaterial = new THREE.MeshStandardMaterial({
    ...shared,
    vertexColors: false,
    roughness: 0.92,
    metalness: 0,
  })
  litMaterial.name = 'doll_skin'
  litMaterial.userData.skinSize = skinSize

  return state.material === 'flat' ? flatMaterial : litMaterial
}

function activeMaterial() {
  return state.material === 'flat' ? flatMaterial : litMaterial
}

/* ── 构建模型 ───────────────────────────────────── */

function applySkin(result, { silent = false } = {}) {
  state.skin = result
  state.texture?.dispose()
  state.texture = createSkinTexture(result.canvas, stage.renderer)

  $('#dropEmpty').hidden = true
  $('#dropFilled').hidden = false
  $('#skinPreview').src = result.canvas.toDataURL('image/png')
  $('#skinName').textContent = result.name
  // 自由尺寸的贴图谈不上「HD」——HD 是指 MC 皮肤的 2×/4× 放大版
  $('#skinMeta').textContent = `${result.width} × ${result.height}${
    result.hd && !result.freeform ? ' · HD' : ''
  }${result.legacy ? ' · 旧版' : ''}${result.freeform ? ' · 自由尺寸' : ''}`
  $('#emptyState').hidden = true

  rebuildModel()
  if (!silent) {
    toast(`贴图接好了，${result.width} × ${result.height}`, 'ok')
    if (result.legacy) {
      window.setTimeout(() => toast('64×32 老皮肤：左臂左腿按官方规则镜像显示，贴图保持原尺寸', 'ok', 4400), 700)
    }
    if (result.freeform) {
      window.setTimeout(() => toast('自定义贴图：整张图铺满模型声明的 UV 空间', 'ok', 4400), 700)
    }
  }
}

/** 材质与几何都换掉（换皮肤 / 换体型时走这里）。 */
function rebuildModel() {
  if (!state.skin) return
  buildMaterials()

  if (built) {
    disposeObject(built.root)
    built = null
  }

  try {
    built = buildDollModel({
      geometry: state.geometry,
      material: activeMaterial(),
      unit: 1 / 16,
      rotationMode: new URLSearchParams(location.search).get('rot') || 'flip',
      onWarning: (message) => toast(message, 'warn', 4200),
    })
  } catch (error) {
    console.error(error)
    toast(error.message || '模型生成失败', 'error')
    return
  }

  built.setOverlayVisible(state.overlay)
  stage.setModel(built)
  updateHud()
}

/** 只换材质 / 只切第二层，不重建几何也不再动镜头。 */
function refreshAppearance() {
  if (!built) return
  stage.setMaterial(activeMaterial())
  built.setOverlayVisible(state.overlay)
}

function updateHud() {
  if (!built) return
  const hud = $('#hud')
  hud.hidden = false
  let triangles = 0
  built.root.traverse((child) => {
    if (!child.isMesh) return
    const index = child.geometry.getIndex()
    const position = child.geometry.getAttribute('position')
    triangles += (index ? index.count : position.count) / 3
  })
  const size = built.stats.sizePixels
  $('#hudTris').textContent = `${Math.round(triangles)} 面`
  const round = (value) => (Math.round(value * 10) / 10).toString()
  $('#hudSize').textContent = `${round(size.x)} × ${round(size.y)} × ${round(size.z)} px`
}

/* ── 皮肤导入 ───────────────────────────────────── */

async function importSkinFile(file) {
  const error = validateSkinFile(file)
  if (error) {
    toast(error, 'warn')
    return
  }
  try {
    // 自定义 json 模型声明自己的 UV 空间，贴图尺寸不受 MC 皮肤那套规则约束
    const result = await readSkin(file, { allowAny: state.geometryName === 'custom' })
    applySkin(result)
  } catch (err) {
    console.error(err)
    toast(err.message || '这张皮肤读不了', 'error', 4200)
  }
}

async function loadSampleSkin() {
  try {
    const response = await fetch('./samples/alice.png')
    if (!response.ok) return
    const blob = await response.blob()
    const file = new File([blob], 'alice.png', { type: 'image/png' })
    const result = await readSkin(file)
    applySkin(result, { silent: true })
  } catch {
    $('#emptyState').hidden = false
  }
}

/* ── 几何导入 ───────────────────────────────────── */

async function importGeometry(file) {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const parsed = parseGeometry(data)
    state.geometry = data
    state.geometryName = 'custom'
    setBody('custom', { keepGeometry: true })
    $('#geoHint').textContent = `已载入 ${parsed.identifier} · ${parsed.bones.length} 根骨骼`
    toast('自定义骨骼载入成功', 'ok')
  } catch (error) {
    console.error(error)
    toast(error.message || '这个 JSON 不是 Bedrock 模型', 'error', 4200)
  }
}

/* ── 控件绑定 ───────────────────────────────────── */

function setBody(body, { keepGeometry = false } = {}) {
  state.body = body
  if (!keepGeometry) {
    if (body === 'custom') {
      $('#geoInput').click()
      return
    }
    state.geometry = GEOMETRY_PRESETS[body]
    state.geometryName = body
    $('#geoHint').textContent = '默认用《玩偶工坊》同款坐姿骨骼。'
  }
  $$('#bodySeg button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.body === body)
  })
  $('#bodyHint').textContent = BODY_HINT[body]
  // 自定义模型不受 MC 皮肤尺寸约束，提示也跟着换
  $('#skinFormatHint').textContent =
    body === 'custom' ? 'PNG · 任意尺寸' : 'PNG · 64×64 / 64×32 / HD'
  saveSettings()
  rebuildModel()
}

function bindSegments() {
  $$('#bodySeg button').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.body === 'custom') {
        $('#geoInput').click()
        return
      }
      setBody(button.dataset.body)
    })
  })

  $$('#matSeg button').forEach((button) => {
    button.addEventListener('click', () => {
      state.material = button.dataset.mat
      $$('#matSeg button').forEach((item) =>
        item.classList.toggle('is-active', item === button),
      )
      refreshAppearance()
      saveSettings()
    })
  })

  $$('#bgSeg button').forEach((button) => {
    button.addEventListener('click', () => {
      state.backdrop = button.dataset.bg
      $$('#bgSeg button').forEach((item) => item.classList.toggle('is-active', item === button))
      stage.setBackdrop(state.backdrop)
      saveSettings()
    })
  })

  $$('#formatSeg button').forEach((button) => {
    button.addEventListener('click', () => {
      state.format = button.dataset.format
      $$('#formatSeg button').forEach((item) => item.classList.toggle('is-active', item === button))
      const meta = FORMATS.find((item) => item.id === state.format)
      $('#formatHint').textContent = meta?.hint || ''
      $('#exportLabel').textContent = `导出 ${meta?.label || ''}`
      saveSettings()
    })
  })
}

function bindInputs() {
  const skidInput = $('#skinInput')
  $('#skinDrop').addEventListener('click', () => skidInput.click())
  $('#skinDrop').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      skidInput.click()
    }
  })
  skidInput.addEventListener('change', () => {
    const file = skidInput.files?.[0]
    skidInput.value = ''
    if (file) importSkinFile(file)
  })

  const geoInput = $('#geoInput')
  $('#geoBtn').addEventListener('click', () => geoInput.click())
  geoInput.addEventListener('change', () => {
    const file = geoInput.files?.[0]
    geoInput.value = ''
    if (file) importGeometry(file)
  })

  $('#overlayToggle').addEventListener('change', (event) => {
    state.overlay = event.target.checked
    refreshAppearance()
    saveSettings()
  })

  $('#rotateToggle').addEventListener('change', (event) => {
    state.autoRotate = event.target.checked
    stage.setAutoRotate(state.autoRotate)
    saveSettings()
  })

  $('#resetBtn').addEventListener('click', () => {
    stage.resetView()
    toast('镜头回正了')
  })

  $('#exportBtn').addEventListener('click', () => withDownloadTip(runExport))
  $('#shotBtn').addEventListener('click', saveSnapshot)
  bindDownloadTip()
  bindSaveSheet()

  $('#helpBtn').addEventListener('click', () => {
    $('#helpModal').hidden = false
  })
  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      $('#helpModal').hidden = true
    })
  })
  $('#helpModal').addEventListener('click', (event) => {
    if (event.target.id === 'helpModal') $('#helpModal').hidden = true
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    $('#helpModal').hidden = true
    if (!$('#downloadModal').hidden) closeDownloadTip()
    if (!$('#saveModal').hidden) closeSaveSheet()
  })

  bindDragAndDrop()
}

function bindDragAndDrop() {
  const zone = $('#skinDrop')

  document.addEventListener('dragenter', (event) => {
    event.preventDefault()
    dragDepth += 1
    if (hasFiles(event)) zone.classList.add('is-over')
  })
  document.addEventListener('dragover', (event) => {
    event.preventDefault()
  })
  document.addEventListener('dragleave', (event) => {
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) zone.classList.remove('is-over')
  })
  document.addEventListener('drop', (event) => {
    event.preventDefault()
    dragDepth = 0
    zone.classList.remove('is-over')
    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length) return
    const geo = files.find((file) => /\.json$/i.test(file.name))
    if (geo) {
      importGeometry(geo)
      return
    }
    const skin = files.find((file) => /^image\//.test(file.type) || /\.(png|jpe?g)$/i.test(file.name))
    if (skin) importSkinFile(skin)
    else toast('拖进来的东西不认识，要 PNG 皮肤或 geo.json', 'warn')
  })

  function hasFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files')
  }
}

/* ── 下载提示 ───────────────────────────────────── */

const DOWNLOAD_TIP_KEY = 'mcdoll_download_tip_off'
let pendingDownload = null

function tipMuted() {
  try {
    return localStorage.getItem(DOWNLOAD_TIP_KEY) === '1'
  } catch {
    return false
  }
}

function muteDownloadTip() {
  try {
    localStorage.setItem(DOWNLOAD_TIP_KEY, '1')
  } catch {
    /* 隐私模式下存不了，那就每次都提醒，不算错 */
  }
}

/**
 * B站 App 的内置网页一般不给下载权限，点了没反应、也找不到文件。
 * 所以第一次保存前提醒一句；用户选了「以后不再提醒」就记住，之后直接下。
 */
function withDownloadTip(action) {
  if (tipMuted()) {
    action()
    return
  }
  pendingDownload = action
  $('#downloadModal').hidden = false
}

function closeDownloadTip({ run = false } = {}) {
  $('#downloadModal').hidden = true
  const action = pendingDownload
  pendingDownload = null
  if (run && action) action()
}

function bindDownloadTip() {
  $('#downloadContinue').addEventListener('click', () => closeDownloadTip({ run: true }))
  $('#downloadMute').addEventListener('click', () => {
    muteDownloadTip()
    closeDownloadTip({ run: true })
    toast('之后不再提醒，文件会直接下载', 'ok')
  })
  $$('[data-close-download]').forEach((button) => {
    button.addEventListener('click', () => closeDownloadTip())
  })
  $('#downloadModal').addEventListener('click', (event) => {
    if (event.target.id === 'downloadModal') closeDownloadTip()
  })
}

/* ── 移动端存图 ─────────────────────────────────── */

/**
 * 手机 / 平板：主输入设备是手指。这类环境下 <a download> 基本不生效
 * （B站 App 内置网页、微信、iOS Safari 都拦），所以预览图另走两条路。
 */
function isTouchUI() {
  if (window.matchMedia?.('(pointer: coarse)').matches) return true
  return (navigator.maxTouchPoints || 0) > 0 && window.innerWidth < 900
}

/**
 * B站 Toy 容器注入的原生 SDK（window.toy）。
 * saveImageToAlbum 只在 App 内可用，端外调用会抛 unsupported，
 * 所以先问 isSupport 再动手，别指望 try/catch 兜住所有情况。
 */
const TOY_ALBUM_LIMIT = 5 * 1024 * 1024

async function toySaveToAlbum(dataUrl, name) {
  const toy = window.toy
  if (!toy?.saveImageToAlbum) return { ok: false, reason: 'missing' }
  try {
    const supported = await toy.isSupport?.('saveImageToAlbum')
    if (!supported) return { ok: false, reason: 'unsupported' }
    // 接口按 base64 字符串长度卡 5MB，超了直接 reject，不如先让位给别的路
    if (dataUrl.length > TOY_ALBUM_LIMIT) return { ok: false, reason: 'too-large' }
    const result = await toy.saveImageToAlbum({
      base64Data: dataUrl,
      hintMsg: `保存「${name}」到相册`,
    })
    return { ok: true, path: result?.localPath || '' }
  } catch (error) {
    return { ok: false, reason: error?.type || 'error', error }
  }
}

let pendingShot = null

function canShareFile(file) {
  try {
    return Boolean(navigator.canShare?.({ files: [file] }))
  } catch {
    return false
  }
}

async function openSaveSheet(dataUrl, name, nativeReason = '') {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], name, { type: 'image/png' })
    pendingShot = { url: dataUrl, blob, file, name }

    $('#saveShotImg').src = dataUrl
    const shareable = canShareFile(file)
    $('#saveToAlbum').hidden = !shareable
    $('#saveHint').classList.remove('is-hot')
    // 没有系统分享面板时（B站 App 内置网页就是这样），长按是唯一的路，提示得显眼些
    $('#saveHint').classList.toggle('is-strong', !shareable)

    if (nativeReason === 'too-large') {
      $('#saveHint').textContent = '这张图超过 App 存相册的 5MB 上限，长按上面这张图保存试试。'
    } else if (shareable) {
      $('#saveHint').textContent = '点「保存到相册」走系统面板选「存储图像 / 保存图片」，也可以直接长按上图。'
    } else {
      $('#saveHint').textContent = '长按上面这张图，选「保存图片 / 存储到照片」。如果长按没反应，点右上角 ··· 选「在浏览器中打开」再来一次。'
    }
    $('#saveModal').hidden = false
  } catch (error) {
    console.error(error)
    toast('截图失败，稍后再试', 'error')
  }
}

function closeSaveSheet() {
  $('#saveModal').hidden = true
  pendingShot = null
}

function pulseSaveHint(message) {
  const hint = $('#saveHint')
  hint.classList.remove('is-hot')
  void hint.offsetWidth
  hint.classList.add('is-hot')
  toast(message, 'warn', 4200)
}

async function saveToAlbum() {
  if (!pendingShot) return
  // App 内第一次没存成（权限、偶发失败），这里再试一次原生接口
  const native = await toySaveToAlbum(pendingShot.url, pendingShot.name)
  if (native.ok) {
    closeSaveSheet()
    toast('已保存到相册', 'ok')
    return
  }
  if (!canShareFile(pendingShot.file)) {
    pulseSaveHint('长按图片也能存进相册')
    return
  }
  try {
    await navigator.share({ files: [pendingShot.file], title: 'MC 玩偶预览图' })
  } catch (error) {
    // 用户自己取消不算错，其余情况退回长按提示
    if (error?.name === 'AbortError') return
    pulseSaveHint('长按图片也能存进相册')
  }
}

function downloadShot() {
  if (!pendingShot) return
  download(pendingShot.blob, pendingShot.name)
  toast('已交给浏览器下载', 'ok')
}

function bindSaveSheet() {
  $('#saveToAlbum').addEventListener('click', saveToAlbum)
  $('#saveAsDownload').addEventListener('click', downloadShot)
  $$('[data-close-save]').forEach((button) => button.addEventListener('click', closeSaveSheet))
  $('#saveModal').addEventListener('click', (event) => {
    if (event.target.id === 'saveModal') closeSaveSheet()
  })
}

/* ── 导出 ───────────────────────────────────────── */

/** dataURL → Blob → 交给浏览器下载（桌面和端外就是这么存的）。 */
async function downloadUrl(dataUrl, filename) {
  const blob = await (await fetch(dataUrl)).blob()
  download(blob, filename)
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function baseName() {
  return state.body === 'custom' ? 'mc-doll' : `mc-doll-${state.body === 'alex' ? 'slim' : 'classic'}`
}

function setBusy(value) {
  busy = value
  const button = $('#exportBtn')
  button.disabled = value
  if (value) button.querySelector('span').textContent = '正在打包…'
  else button.querySelector('span').textContent = `导出 ${FORMATS.find((f) => f.id === state.format)?.label || ''}`
}

async function runExport() {
  if (busy) return
  if (!built || !state.skin) {
    toast('先拖一张皮肤进来', 'warn')
    return
  }
  setBusy(true)
  const list = $('#fileList')
  list.hidden = true
  list.innerHTML = ''

  try {
    const textureBytes = await canvasToPngBytes(state.skin.canvas)
    const result = await buildExport({
      root: built.root,
      format: state.format,
      base: baseName(),
      textureBytes,
    })

    let blob
    if (result.single) {
      const file = result.files[0]
      blob = new Blob([file.bytes], { type: result.mime || 'application/octet-stream' })
    } else {
      blob = new Blob([packZip(result.files)], { type: 'application/zip' })
    }

    download(blob, result.filename)

    list.hidden = false
    for (const file of result.files) {
      const item = document.createElement('li')
      const name = document.createElement('span')
      name.textContent = file.name
      const size = document.createElement('span')
      size.textContent = formatBytes(file.bytes?.length ?? file.text?.length ?? 0)
      item.append(name, size)
      list.appendChild(item)
    }

    toast(`${result.filename} 导出成功 · ${formatBytes(blob.size)}`, 'ok')
    if (state.format === 'obj') {
      window.setTimeout(() => toast('OBJ 会丢顶点色，明暗要重新打光', 'warn', 4200), 700)
    }
  } catch (error) {
    console.error(error)
    toast(error.message || '导出失败，换个格式试试', 'error', 4600)
  } finally {
    setBusy(false)
  }
}

async function saveSnapshot() {
  if (!built) {
    toast('先拖一张皮肤进来', 'warn')
    return
  }

  let url
  try {
    url = stage.capture(1400, state.backdrop)
  } catch (error) {
    console.error(error)
  }
  if (!url) {
    toast('截图失败，稍后再试', 'error')
    return
  }
  const name = `${baseName()}-preview.png`

  // 1) B站 App 内：容器给了原生存相册接口，直接写进相册，不用弹任何东西
  const native = await toySaveToAlbum(url, name)
  if (native.ok) {
    toast('已保存到相册', 'ok')
    return
  }

  // 2) 触屏：系统分享面板 / 长按保存
  if (isTouchUI()) {
    openSaveSheet(url, name, native.reason)
    return
  }

  // 3) 桌面与端外：走浏览器下载，第一次仍然提醒一句
  withDownloadTip(() => {
    downloadUrl(url, name)
    toast('预览图已保存', 'ok')
  })
}

/* ── 启动 ───────────────────────────────────────── */

function syncControls() {
  $$('#bodySeg button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.body === state.body)
  })
  $('#bodyHint').textContent = BODY_HINT[state.body] || BODY_HINT.alex
  $$('#matSeg button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mat === state.material)
  })
  $$('#bgSeg button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.bg === state.backdrop)
  })
  $$('#formatSeg button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.format === state.format)
  })
  $('#overlayToggle').checked = state.overlay
  $('#rotateToggle').checked = state.autoRotate
  const meta = FORMATS.find((item) => item.id === state.format)
  $('#formatHint').textContent = meta?.hint || ''
  $('#exportLabel').textContent = `导出 ${meta?.label || ''}`
}

function init() {
  loadSettings()
  stage = new DollStage({ canvas: $('#stage'), viewport: $('#viewport') })
  stage.setBackdrop(state.backdrop)
  stage.setAutoRotate(state.autoRotate)
  stage.start()

  bindSegments()
  bindInputs()
  syncControls()

  const badge = $('#envBadge')
  if (window.toy) {
    badge.hidden = false
    badge.textContent = 'B站 Toy'
  }

  loadSampleSkin()

  window.__MCDOLL__ = {
    state,
    stage,
    getStats: () => built?.stats ?? null,
    getRoot: () => built?.root ?? null,
    capture: (size) => stage.capture(size, 'white'),
  }
}

init()
