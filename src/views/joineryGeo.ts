import * as THREE from 'three'
import { prismCorners, type Prism } from '../model/joinery'
import type { Vec3 } from '../model/types'
import { T } from './camera'

/**
 * Prisma (Schwalbenschwanz, Keile im Sitz) als Geometrie im lokalen System eines Holzes, damit das
 * Holzmaterial die Faser richtig legt. frame: Lage und Drehung des Holzes in three-Koordinaten.
 */
export function prismGeometry(p: Prism, frame: { position: THREE.Vector3; quaternion: THREE.Quaternion }): THREE.BufferGeometry {
  const inv = frame.quaternion.clone().invert()
  const loc = (q: Vec3) => T(q.x, q.y, q.z).sub(frame.position).applyQuaternion(inv)
  const { bottom, top } = prismCorners(p)
  const b = bottom.map(loc)
  const t = top.map(loc)
  const n = p.poly.length
  // Umlaufsinn: außen soll vorn sein
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p.poly[i]
    const [x1, y1] = p.poly[(i + 1) % n]
    area += x0 * y1 - x1 * y0
  }
  const hand = (p.eu.y * p.ev.z - p.eu.z * p.ev.y) * p.en.x + (p.eu.z * p.ev.x - p.eu.x * p.ev.z) * p.en.y + (p.eu.x * p.ev.y - p.eu.y * p.ev.x) * p.en.z
  const flip = area * hand < 0
  const tris: THREE.Vector3[] = []
  const tri = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => (flip ? tris.push(a, d, c) : tris.push(a, c, d))
  for (let i = 1; i < n - 1; i++) {
    tri(t[0], t[i], t[i + 1])
    tri(b[0], b[i + 1], b[i])
  }
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n
    tri(b[i], b[k], t[k])
    tri(b[i], t[k], t[i])
  }
  const g = new THREE.BufferGeometry().setFromPoints(tris)
  g.computeVertexNormals()
  return g
}
