import { readFileSync, statSync } from 'node:fs'
import { unzipSync } from 'fflate'

const dir = 'preview/exports/'
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

// GLB
const glb = readFileSync(dir + 'mc-doll-slim.glb')
const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
console.log('GLB 大小', kb(glb.length), 'magic', dv.getUint32(0, true).toString(16), 'version', dv.getUint32(4, true))
let off = 12
let json
while (off < glb.length) {
  const len = dv.getUint32(off, true)
  const type = dv.getUint32(off + 4, true)
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(glb.subarray(off + 8, off + 8 + len)))
  off += 8 + len
}
console.log('  nodes', json.nodes.length, 'meshes', json.meshes.length, 'materials', json.materials.length,
  'images', json.images?.length ?? 0, 'textures', json.textures?.length ?? 0,
  'attrs', Object.keys(json.meshes[0].primitives[0].attributes).join(','))
console.log('  alphaMode', json.materials[0].alphaMode, 'cutoff', json.materials[0].alphaCutoff)

// glTF zip
const z1 = unzipSync(new Uint8Array(readFileSync(dir + 'mc-doll-slim-gltf.zip')))
console.log('\nglTF zip:', Object.keys(z1).map((k) => `${k} ${kb(z1[k].length)}`).join(' | '))
const gjson = JSON.parse(new TextDecoder().decode(z1['mc-doll-slim.gltf']))
console.log('  buffers.uri', gjson.buffers?.[0]?.uri, 'images', gjson.images?.map((i) => i.uri).join(','))

// FBX
const fbx = readFileSync(dir + 'mc-doll-slim.fbx')
console.log('\nFBX 大小', kb(fbx.length), 'header', fbx.subarray(0, 20).toString('latin1').replace(/\0/g, '·'))

// OBJ zip
const z2 = unzipSync(new Uint8Array(readFileSync(dir + 'mc-doll-slim-obj.zip')))
console.log('\nOBJ zip:', Object.keys(z2).map((k) => `${k} ${kb(z2[k].length)}`).join(' | '))
const obj = new TextDecoder().decode(z2['mc-doll-slim.obj'])
const lines = obj.split('\n')
const count = (p) => lines.filter((l) => l.startsWith(p + ' ')).length
console.log('  mtllib', lines.find((l) => l.startsWith('mtllib')), '| v', count('v'), 'vt', count('vt'), 'vn', count('vn'), 'f', count('f'), 'o', count('o'))
console.log('  mtl:', new TextDecoder().decode(z2['mc-doll-slim.mtl']).replace(/\n/g, ' / '))
