import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { buildDollModel } from '../src/geometry.js'

const file = process.argv[2] || 'src/geo/alex.json'
const data = JSON.parse(readFileSync(file, 'utf8'))

const built = buildDollModel({
  geometry: data,
  material: new THREE.MeshBasicMaterial(),
  unit: 1,
  onWarning: (m) => console.log('WARN', m),
})

const root = built.root
root.updateMatrixWorld(true)

const total = new THREE.Box3().setFromObject(root)
console.log('total min', total.min.toArray().map((v) => +v.toFixed(2)))
console.log('total max', total.max.toArray().map((v) => +v.toFixed(2)))
console.log('stats', JSON.stringify(built.stats, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)))

root.traverse((child) => {
  if (!child.isMesh) return
  const box = new THREE.Box3().setFromObject(child)
  const size = box.getSize(new THREE.Vector3())
  console.log(
    child.userData.bone.padEnd(9),
    'min',
    box.min.toArray().map((v) => +v.toFixed(2)).join(','),
    ' size',
    size.toArray().map((v) => +v.toFixed(2)).join(','),
  )
})
