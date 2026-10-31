/**
 * Minecraft 皮肤读取与校验。
 *
 * 皮肤尺寸只有几种合法形态：64×32（1.7 及更早）、64×64（1.8+），
 * 以及它们按 2 倍、4 倍放大的 HD 版本。宽高不成比例的文件按损坏处理，
 * 否则贴图会整块错位，看起来像「模型坏了」。
 */

import * as THREE from 'three'

const MAX_BYTES = 12 * 1024 * 1024

export function validateSkinFile(file) {
  if (!file) return '没有选择文件'
  const looksLikeImage =
    /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || '')
  if (!looksLikeImage) return '请选择一张 PNG 皮肤图'
  if (file.size > MAX_BYTES) return '图片太大了，皮肤图一般不到 1MB'
  return ''
}

/** 尺寸校验：返回错误文案或空字符串。 */
export function validateSkinSize(width, height) {
  if (!width || !height) return '图片读不出尺寸'
  if (width < 64 || height < 32) return `皮肤太小了（${width}×${height}），至少 64×32`
  if (width % 64 !== 0) return `宽度要是 64 的倍数，现在是 ${width}`
  if (height !== 32 * (width / 64) && height !== width) {
    return `尺寸不对（${width}×${height}），应该是 64×32、64×64 或它们的等比例放大版`
  }
  return ''
}

export function describeSkin(width, height) {
  const scale = width / 64
  return {
    scale,
    hd: scale > 1,
    legacy: height < 64 * scale,
  }
}

/**
 * 64×32 的老皮肤只画了右臂右腿，左半边是游戏运行时按镜像补的。
 * 这里照官方 1.8 转换规则把左臂左腿补出来，否则模型会缺胳膊少腿。
 *
 * 右腿 (0,16) → 左腿 (16,48)，右臂 (40,16) → 左臂 (32,48)，都做水平镜像。
 */
export function upgradeLegacySkin(canvas, width, height) {
  const scale = width / 64
  const block = 16 * scale
  const out = document.createElement('canvas')
  out.width = width
  out.height = width
  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(canvas, 0, 0)

  const mirror = (srcX, srcY, destX, destY) => {
    ctx.save()
    ctx.translate(destX + block, destY)
    ctx.scale(-1, 1)
    ctx.drawImage(canvas, srcX, srcY, block, block, 0, 0, block, block)
    ctx.restore()
  }

  mirror(0, 16 * scale, 16 * scale, 48 * scale)
  mirror(40 * scale, 16 * scale, 32 * scale, 48 * scale)
  return out
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('这张图解码失败，换一张试试'))
    }
    image.src = url
  })
}

/**
 * 读入皮肤：解码 → 校验 → 画进 canvas（贴图与截图都从这里取像素）。
 * 顺便把邻边像素补一圈，避免斜视角下边缘出现透明缝。
 */
export async function readSkin(file) {
  const error = validateSkinFile(file)
  if (error) throw new Error(error)

  const image = await loadImageElement(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const sizeError = validateSkinSize(width, height)
  if (sizeError) throw new Error(sizeError)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, 0, 0)

  const info = describeSkin(width, height)
  // 老皮肤升级成 64×64 的完整版，后面的 UV 逻辑就不用再为它写特例。
  const resolved = info.legacy ? upgradeLegacySkin(canvas, width, height) : canvas

  return {
    canvas: resolved,
    source: canvas,
    width,
    height,
    name: file.name || 'skin.png',
    ...info,
  }
}

export function createSkinTexture(canvas, renderer) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // 放大用最近邻保持像素颗粒，缩小时留 mipmap 免得远处闪。
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  if (renderer) {
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  }
  texture.needsUpdate = true
  return texture
}

export function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('贴图编码失败'))
        return
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject)
    }, 'image/png')
  })
}
