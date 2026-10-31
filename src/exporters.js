/**
 * 模型导出：GLB / glTF / FBX / OBJ。
 *
 * 四个格式的能力不一样，所以导出的产物形态也不同：
 *   GLB  —— 单文件，贴图内嵌，最省心
 *   glTF —— JSON + .bin + .png，拆成 zip（glTF 规范本来就是这个形态）
 *   FBX  —— 二进制模型，贴图内嵌，方便进 Unity / Blender
 *   OBJ  —— 纯几何 + 自写 .mtl，顶点色（原版面明暗）会丢，这点会提示用户
 */

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { FBXExporter } from '@comfyorg/fbx-exporter-three'
import { zipSync, strToU8 } from 'fflate'

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

export const FORMATS = [
  { id: 'glb', label: 'GLB', hint: '单文件，贴图内嵌' },
  { id: 'gltf', label: 'glTF', hint: 'json + bin + png' },
  { id: 'fbx', label: 'FBX', hint: '二进制，贴图内嵌' },
  { id: 'obj', label: 'OBJ', hint: '几何 + mtl + png' },
]

async function toGLB(root) {
  root.updateMatrixWorld(true)
  const exporter = new GLTFExporter()
  const buffer = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, {
      binary: true,
      embedImages: true,
      onlyVisible: true,
      maxTextureSize: 4096,
    })
  })
  if (!(buffer instanceof ArrayBuffer)) throw new Error('GLB 生成失败')
  return new Uint8Array(buffer)
}

/** 把 GLB 拆回 glTF 规范的标准三件套。 */
function splitGLB(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('不是有效的 GLB 数据')
  const total = view.getUint32(8, true)
  let offset = 12
  let json = null
  let bin = null
  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)))
    } else if (type === CHUNK_BIN) {
      bin = bytes.subarray(start, start + length)
    }
    offset = start + length
  }
  if (!json) throw new Error('GLB 里没有 JSON 段')
  return { json, bin }
}

function gltfBundle(glbBytes, base) {
  const { json, bin } = splitGLB(glbBytes)
  const files = []
  const images = json.images || []

  images.forEach((image, index) => {
    if (image.bufferView === undefined) return
    const view = json.bufferViews[image.bufferView]
    const start = view.byteOffset || 0
    const ext = image.mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const name = `${base}_texture${index > 0 ? index : ''}.${ext}`
    files.push({ name, bytes: bin.subarray(start, start + view.byteLength) })
    image.uri = name
    delete image.bufferView
    delete image.mimeType
  })

  const binName = `${base}.bin`
  if (json.buffers?.length) json.buffers[0].uri = binName

  files.unshift({ name: `${base}.gltf`, text: JSON.stringify(json, null, 2) })
  if (bin) files.push({ name: binName, bytes: bin })
  return files
}

function objBundle(root, base, textureBytes, textureName) {
  root.updateMatrixWorld(true)
  const body = new OBJExporter().parse(root)
  const obj = `# MC 玩偶工坊 · ${base}\nmtllib ${base}.mtl\n${body}`
  const mtl = [
    `# MC 玩偶工坊 · ${base}`,
    `newmtl doll_skin`,
    'Ka 1.000 1.000 1.000',
    'Kd 1.000 1.000 1.000',
    'Ks 0.000 0.000 0.000',
    'Ns 1.0',
    'd 1.0',
    'illum 1',
    `map_Kd ${textureName}`,
    '',
  ].join('\n')

  return [
    { name: `${base}.obj`, text: obj },
    { name: `${base}.mtl`, text: mtl },
    { name: `${base}_texture.png`, bytes: textureBytes },
  ]
}

async function fbxBytes(root) {
  root.updateMatrixWorld(true)
  const exporter = new FBXExporter()
  const bytes = await exporter.parseAsync(root, {
    preset: 'blender',
    embedTextures: true,
    includeAnimations: false,
    onlyVisible: true,
    creator: 'MC 玩偶工坊',
  })
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

/**
 * 统一入口：按格式产出文件列表。
 * 返回 { files, single }，single 为 true 时直接给用户一个文件，否则打包成 zip。
 */
export async function buildExport({ root, format, base, textureBytes }) {
  if (format === 'glb') {
    const bytes = await toGLB(root)
    return {
      single: true,
      filename: `${base}.glb`,
      mime: 'model/gltf-binary',
      files: [{ name: `${base}.glb`, bytes }],
    }
  }

  if (format === 'gltf') {
    const bytes = await toGLB(root)
    return {
      single: false,
      filename: `${base}-gltf.zip`,
      files: gltfBundle(bytes, base),
    }
  }

  if (format === 'fbx') {
    const bytes = await fbxBytes(root)
    return {
      single: true,
      filename: `${base}.fbx`,
      mime: 'application/octet-stream',
      files: [{ name: `${base}.fbx`, bytes }],
    }
  }

  const files = objBundle(root, base, textureBytes, `${base}_texture.png`)
  return {
    single: false,
    filename: `${base}-obj.zip`,
    files,
  }
}

export function packZip(files) {
  const entries = {}
  for (const file of files) {
    if (file.text !== undefined) {
      entries[file.name] = strToU8(file.text)
    } else {
      const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      const isPng = file.bytes.length > 4 && head.every((byte, index) => file.bytes[index] === byte)
      entries[file.name] = [file.bytes, { level: isPng ? 0 : 6 }]
    }
  }
  return zipSync(entries)
}

export function toBlob(parts, mime) {
  return new Blob(parts, { type: mime || 'application/octet-stream' })
}
