import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { buildDollModel } from '../src/geometry.js'

const data = JSON.parse(readFileSync(process.argv[2] || 'src/geo/alex.json', 'utf8'))

function boxes(mode) {
  const built = buildDollModel({
    geometry: data,
    material: new THREE.MeshBasicMaterial(),
    unit: 1,
    rotationMode: mode,
  })
  const map = new Map()
  built.root.updateMatrixWorld(true)
  built.root.traverse((c) => {
    if (!c.isMesh || c.userData.isOverlay) return
    const box = new THREE.Box3().setFromObject(c)
    const center = box.getCenter(new THREE.Vector3())
    map.set(c.userData.bone, center)
  })
  const total = new THREE.Box3().setFromObject(built.root)
  return { map, total }
}

for (const mode of ['none', 'center', 'bone', 'cube']) {
  const { map, total } = boxes(mode)
  const right = map.get('RightArm')
  const left = map.get('LeftArm')
  const rLeg = map.get('RightLeg')
  const lLeg = map.get('LeftLeg')
  const xMid = (right.x + left.x) / 2
  const armErr = Math.abs(right.x - (2 * 0.5 - left.x))
  const legErr = Math.abs(rLeg.x - (2 * 0.5 - lLeg.x))
  const size = total.getSize(new THREE.Vector3())
  console.log(
    mode.padEnd(7),
    'arm', `R ${right.x.toFixed(2)}/${right.z.toFixed(2)} L ${left.x.toFixed(2)}/${left.z.toFixed(2)}`,
    '| leg', `R ${rLeg.x.toFixed(2)}/${rLeg.z.toFixed(2)} L ${lLeg.x.toFixed(2)}/${lLeg.z.toFixed(2)}`,
    '| 镜像误差 arm', armErr.toFixed(2), 'leg', legErr.toFixed(2),
    '| 体积', size.toArray().map((v) => v.toFixed(1)).join('×'),
  )
}
