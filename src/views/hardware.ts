import * as THREE from 'three'
import { memberAxes, memberBoxes } from '../model/geometry'
import type { Resolved } from '../model/resolve'
import { T } from './camera'

/**
 * Beschläge als Instanz-Matrizen (Meter, three-Koordinaten): Schlossschrauben (Kopf, Scheibe,
 * Mutter) und Bleche für Winkel und Balkenschuhe. Reine Rechnung, damit sie testbar ist.
 */
export const BOLT_TYPES = new Set(['schlossschraube', 'bettschraube'])

export function hardwareInstances(r: Resolved): { heads: THREE.Matrix4[]; washers: THREE.Matrix4[]; nuts: THREE.Matrix4[]; plates: THREE.Matrix4[] } {
  const byId = new Map(r.members.map((m) => [m.id, m]))
  const heads: THREE.Matrix4[] = []
  const washers: THREE.Matrix4[] = []
  const nuts: THREE.Matrix4[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const put = (list: THREE.Matrix4[], at: { x: number; y: number; z: number }, dir: THREE.Vector3, scale: [number, number, number]) => {
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
    list.push(new THREE.Matrix4().compose(T(at.x, at.y, at.z), q, new THREE.Vector3(...scale)))
  }
  for (const j of r.joints) {
    if (!BOLT_TYPES.has(j.typeId)) continue
    const A = byId.get(j.a)
    const B = byId.get(j.b)
    if (!A || !B || A.round || B.round) continue
    const aA = memberAxes(A)[0]
    const aB = memberAxes(B)[0]
    let ax = { x: aA.y * aB.z - aA.z * aB.y, y: aA.z * aB.x - aA.x * aB.z, z: aA.x * aB.y - aA.y * aB.x }
    let len = Math.hypot(ax.x, ax.y, ax.z)
    if (len < 0.3) continue
    ax = { x: ax.x / len, y: ax.y / len, z: ax.z / len }
    // Durchgang durch beide Hölzer entlang der Bolzenachse
    let lo = Infinity
    let hi = -Infinity
    for (const m of [A, B]) {
      for (const o of memberBoxes(m)) {
        const c = o.center.x * ax.x + o.center.y * ax.y + o.center.z * ax.z
        const e = o.axes.reduce((s2, a, i) => s2 + Math.abs(a.x * ax.x + a.y * ax.y + a.z * ax.z) * o.half[i], 0)
        lo = Math.min(lo, c - e)
        hi = Math.max(hi, c + e)
      }
    }
    const p0 = j.pos.x * ax.x + j.pos.y * ax.y + j.pos.z * ax.z
    // Kopf nach außen: weg von der Bettmitte
    const bed = A.assemblyId ? r.beds.get(A.assemblyId) : undefined
    let sign = 1
    if (bed) {
      const cx = bed.footprint.reduce((s2, q) => s2 + q.x, 0) / bed.footprint.length
      const cy = bed.footprint.reduce((s2, q) => s2 + q.y, 0) / bed.footprint.length
      const toC = (cx - j.pos.x) * ax.x + (cy - j.pos.y) * ax.y
      sign = toC > 0 ? -1 : 1
    }
    const tHead = (sign > 0 ? hi : lo) - p0
    const tNut = (sign > 0 ? lo : hi) - p0
    // zwei Bolzen quer zur Achse versetzt, entlang des waagrechten Stabs bzw. der Höhe
    const horiz = Math.abs(aA.z) < 0.5 ? aA : aB
    let off = { x: ax.y * horiz.z - ax.z * horiz.y, y: ax.z * horiz.x - ax.x * horiz.z, z: ax.x * horiz.y - ax.y * horiz.x }
    len = Math.hypot(off.x, off.y, off.z) || 1
    off = { x: off.x / len, y: off.y / len, z: off.z / len }
    const spread = Math.min(A.h, B.h, A.b, B.b) * 0.28
    const outDir = new THREE.Vector3(ax.x * sign, ax.z * sign, -ax.y * sign)
    const inDir = outDir.clone().negate()
    for (const k of [-1, 1]) {
      const base = { x: j.pos.x + off.x * spread * k, y: j.pos.y + off.y * spread * k, z: j.pos.z + off.z * spread * k }
      const at = (t: number) => ({ x: base.x + ax.x * t, y: base.y + ax.y * t, z: base.z + ax.z * t })
      put(heads, at(tHead), outDir, [0.0125, 0.006, 0.0125])
      put(washers, at(tNut + sign * -1), inDir, [0.0105, 0.002, 0.0105])
      put(nuts, at(tNut - sign * 6), inDir, [0.0095, 0.008, 0.0095])
    }
  }
  // Winkel und Balkenschuhe: verzinkte Bleche (2,5 mm) am Ende des anschließenden Stabs
  const plates: THREE.Matrix4[] = []
  const plate = (c: { x: number; y: number; z: number }, len: { x: number; y: number; z: number }, thick: { x: number; y: number; z: number }, wide: { x: number; y: number; z: number }, L: number, Wd: number) => {
    const a0 = new THREE.Vector3(len.x, len.z, -len.y)
    const a1 = new THREE.Vector3(thick.x, thick.z, -thick.y)
    const a2 = new THREE.Vector3(wide.x, wide.z, -wide.y)
    if (new THREE.Vector3().crossVectors(a0, a1).dot(a2) < 0) a2.negate()
    const m = new THREE.Matrix4().makeBasis(a0, a1, a2)
    m.scale(new THREE.Vector3(L / 1000, 0.0025, Wd / 1000))
    m.setPosition(T(c.x, c.y, c.z))
    plates.push(m)
  }
  const extent = (m: { b: number; h: number }, axes: [ReturnType<typeof memberAxes>[0], ReturnType<typeof memberAxes>[0], ReturnType<typeof memberAxes>[0]], d: { x: number; y: number; z: number }) =>
    Math.abs(axes[1].x * d.x + axes[1].y * d.y + axes[1].z * d.z) * (m.b / 2) + Math.abs(axes[2].x * d.x + axes[2].y * d.y + axes[2].z * d.z) * (m.h / 2)
  for (const j of r.joints) {
    if (j.typeId !== 'winkel' && j.typeId !== 'balkenschuh') continue
    if (!j.ending) continue
    const E = byId.get(j.ending)
    const Tm = byId.get(j.ending === j.a ? j.b : j.a)
    if (!E || !Tm || E.round || Tm.round) continue
    const axesE = memberAxes(E)
    const aE = axesE[0]
    const aT = memberAxes(Tm)[0]
    let ax = { x: aE.y * aT.z - aE.z * aT.y, y: aE.z * aT.x - aE.x * aT.z, z: aE.x * aT.y - aE.y * aT.x }
    const n = Math.hypot(ax.x, ax.y, ax.z)
    if (n < 0.3) continue
    ax = { x: ax.x / n, y: ax.y / n, z: ax.z / n }
    // Stabende am Knoten und Richtung in den Stab hinein
    const dS = Math.hypot(E.start.x - j.pos.x, E.start.y - j.pos.y, E.start.z - j.pos.z)
    const dEnd = Math.hypot(E.end.x - j.pos.x, E.end.y - j.pos.y, E.end.z - j.pos.z)
    const pE = dS < dEnd ? E.start : E.end
    const into = dS < dEnd ? aE : { x: -aE.x, y: -aE.y, z: -aE.z }
    const at = (base: { x: number; y: number; z: number }, ...terms: [{ x: number; y: number; z: number }, number][]) =>
      terms.reduce((q, [dv, k]) => ({ x: q.x + dv.x * k, y: q.y + dv.y * k, z: q.z + dv.z * k }), base)
    // Lage quer zur Achse wie der Knoten
    const axOff = (j.pos.x - pE.x) * ax.x + (j.pos.y - pE.y) * ax.y + (j.pos.z - pE.z) * ax.z
    const base = at(pE, [ax, axOff])
    if (j.typeId === 'winkel') {
      // Innenecke unten (bzw. auf der Seite mit negativem z), Schenkel 90 mm, Breite 65 mm
      const s2 = aT.z > 0.5 ? -1 : aT.z < -0.5 ? 1 : 1
      const h = extent(E, axesE, aT)
      const corner = at(base, [aT, s2 * h])
      const tDir = { x: aT.x * s2, y: aT.y * s2, z: aT.z * s2 }
      plate(at(corner, [into, 45], [tDir, 1.25]), into, tDir, ax, 90, 65)
      plate(at(corner, [tDir, 45], [into, 1.25]), tDir, into, ax, 90, 65)
    } else {
      // Balkenschuh: Boden unter dem Trägerende, zwei Seiten, zwei Laschen am Hauptträger
      const down = { x: -axesE[2].x, y: -axesE[2].y, z: -axesE[2].z }
      const side = axesE[1]
      const hb = E.b / 2
      const hh = E.h / 2
      const bottom = at(base, [down, hh + 1.25], [into, 45])
      plate(bottom, into, down, side, 90, E.b + 5)
      for (const k of [-1, 1]) {
        const sd = { x: side.x * k, y: side.y * k, z: side.z * k }
        plate(at(base, [sd, hb + 1.25], [into, 45], [down, hh * 0.15]), into, sd, axesE[2], 90, E.h * 0.85)
        plate(at(base, [sd, hb + 22], [into, -1.25], [down, hh * 0.15]), sd, into, axesE[2], 40, E.h * 0.85)
      }
    }
  }
  return { heads, washers, nuts, plates }
}
